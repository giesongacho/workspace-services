const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const fetch = require('node-fetch');
const TimeDoctorAPI = require('./api');
const config = require('./config');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// N8N Webhook Configuration - EASILY CHANGEABLE HERE
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.srv470812.hstgr.cloud/webhook/workspace-url-n8n';

// 🔧 FIXED: Send data only ONCE - disable recurring cron job
const SEND_ONCE_ON_STARTUP = true; // Set to true to send once on startup
const SEND_RECURRING = false; // Set to false to disable recurring sends

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create API instance
const api = new TimeDoctorAPI();

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// ==================== FIXED USERNAME IDENTIFICATION ====================

/**
 * FIXED USER LOOKUP - This matches names from TimeDoctor Dashboard to userIds
 */
async function getFixedUserLookup(userId) {
  console.log(`🔍 [FIXED LOOKUP] Getting real username for userId: ${userId}`);
  
  try {
    // Strategy 1: Get all users first and match by ID
    console.log('📊 [FIXED] Step 1: Getting all users from TimeDoctor...');
    const allUsers = await api.getUsers({ limit: 1000, detail: 'extended' });
    
    if (!allUsers.data || allUsers.data.length === 0) {
      console.log('❌ [FIXED] No users found in TimeDoctor');
      return { username: 'Unknown User', email: 'Email not available', method: 'no_users' };
    }
    
    console.log(`📊 [FIXED] Found ${allUsers.data.length} users in TimeDoctor company`);
    
    // Find the user by exact ID match
    const matchedUser = allUsers.data.find(user => user.id === userId);
    
    if (matchedUser) {
      console.log(`✅ [FIXED] Found user in list:`, JSON.stringify(matchedUser, null, 2));
      
      // Extract the real name - try multiple fields
      const realName = matchedUser.name || 
                      matchedUser.displayName || 
                      matchedUser.fullName || 
                      matchedUser.username ||
                      `${matchedUser.firstName || ''} ${matchedUser.lastName || ''}`.trim() ||
                      matchedUser.email?.split('@')[0] ||
                      'Unknown User';
      
      const realEmail = matchedUser.email || 'Email not available';
      
      console.log(`✅ [FIXED] SUCCESS! Real name: "${realName}", Email: "${realEmail}"`);
      
      return {
        username: realName,
        fullName: matchedUser.fullName || realName,
        email: realEmail,
        timezone: matchedUser.timezone,
        role: matchedUser.role,
        method: 'direct_match',
        confidence: 'high',
        success: true
      };
      
    } else {
      console.log(`❌ [FIXED] User ${userId} NOT FOUND in user list`);
      console.log(`📊 Available user IDs: ${allUsers.data.map(u => u.id).join(', ')}`);
      
      return {
        username: `User ${userId.substring(0, 8)}`,
        email: 'Email not available', 
        method: 'not_found_fallback',
        confidence: 'low',
        success: false
      };
    }
    
  } catch (error) {
    console.error(`❌ [FIXED] User lookup failed: ${error.message}`);
    return {
      username: `User ${userId.substring(0, 8)}`,
      email: 'Email not available',
      method: 'error_fallback',
      error: error.message,
      confidence: 'low',
      success: false
    };
  }
}

/**
 * 🔧 FIXED: Send ALL users data in ONE single webhook call (not individual calls)
 */
async function sendAllUsersDataToN8N(allUsersData) {
  try {
    console.log(`\n🚀 [BATCH] Processing ALL ${allUsersData.length} users for SINGLE webhook call`);
    
    const processedUsers = [];
    
    // Process each user to get their real username
    for (const userData of allUsersData) {
      console.log(`🔍 [BATCH] Processing user: ${userData.userId}`);
      
      // Get the fixed username lookup for this user
      const userLookup = await getFixedUserLookup(userData.userId);
      
      const processedUser = {
        // 👤 REAL NAME (like "Levi Daniels" from TimeDoctor dashboard)
        name: userLookup.username,
        realEmail: userLookup.email,
        deviceOwner: userLookup.username,
        whoOwnsThisDevice: userLookup.username,
        
        user: {
          userId: userData.userId,
          
          // 🎯 FIXED: Real names from TimeDoctor (like dashboard shows)
          deviceOwner: userLookup.username,
          whoOwnsThisDevice: userLookup.username,
          realName: userLookup.username,
          realUsername: userLookup.username,
          realEmail: userLookup.email,
          realTimezone: userLookup.timezone,
          realRole: userLookup.role,
          
          // Original device name (for reference)
          deviceName: userData.userInfo?.name || 'Unknown Device',
          email: userData.userInfo?.email || 'Unknown',
          
          // 🔍 LOOKUP SUCCESS INFORMATION
          lookupMethod: userLookup.method,
          lookupError: userLookup.error || null,
          lookupSuccess: userLookup.success,
          confidence: userLookup.confidence,
          
          timezone: userData.userInfo?.timezone || 'Unknown',
          lastSeen: userData.userInfo?.lastSeenGlobal,
          deviceInfo: {
            ...userData.userInfo?.deviceInfo || {},
            deviceOwner: userLookup.username,
            whoOwnsThisDevice: userLookup.username,
            enrichedWithRealData: true,
            enrichedAt: new Date().toISOString()
          }
        },
        
        monitoring: {
          dateRange: userData.dateRange,
          hasData: userData.summary?.hasData || false,
          totalActivities: userData.activitySummary?.totalRecords || 0,
          totalScreenshots: userData.screenshots?.totalScreenshots || 0,
          totalDisconnections: userData.disconnectionEvents?.totalEvents || 0,
          totalTimeUsageRecords: userData.timeUsage?.totalRecords || 0,
          
          // 👤 EMPLOYEE IDENTIFICATION (FIXED TO SHOW REAL NAMES)
          employeeIdentification: {
            identifiedName: userLookup.username,
            identifiedEmail: userLookup.email,
            deviceOwner: userLookup.username,
            whoOwnsThisDevice: userLookup.username,
            identificationMethod: userLookup.method,
            confidenceLevel: userLookup.confidence,
            monitoringReliable: userLookup.success
          }
        },
        
        activities: userData.activitySummary?.data || [],
        screenshots: userData.screenshots?.data || [],
        timeUsage: userData.timeUsage?.data || [],
        disconnections: userData.disconnectionEvents?.data || [],
        productivityStats: userData.productivityStats?.data || null,
        overallStats: userData.overallStats?.data || null
      };
      
      processedUsers.push(processedUser);
      console.log(`✅ [BATCH] Processed: "${userLookup.username}" (${userLookup.method})`);
      
      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // 🎯 SINGLE WEBHOOK PAYLOAD with ALL users
    const singleN8NPayload = {
      // 📊 BATCH INFORMATION
      batchInfo: {
        totalUsers: processedUsers.length,
        timestamp: new Date().toISOString(),
        source: 'timekeeper-workspace-services',
        type: 'batch_user_monitoring',
        successfulLookups: processedUsers.filter(u => u.user.lookupSuccess).length,
        failedLookups: processedUsers.filter(u => !u.user.lookupSuccess).length
      },
      
      // 👥 ALL USERS DATA IN ONE PAYLOAD
      users: processedUsers,
      
      // 📈 SUMMARY STATISTICS
      summary: {
        totalUsers: processedUsers.length,
        usersWithData: processedUsers.filter(u => u.monitoring.hasData).length,
        totalActivities: processedUsers.reduce((sum, u) => sum + (u.monitoring.totalActivities || 0), 0),
        totalScreenshots: processedUsers.reduce((sum, u) => sum + (u.monitoring.totalScreenshots || 0), 0),
        totalDisconnections: processedUsers.reduce((sum, u) => sum + (u.monitoring.totalDisconnections || 0), 0),
        realNamesIdentified: processedUsers.filter(u => u.user.lookupSuccess).map(u => u.name),
        generatedAt: new Date().toISOString()
      }
    };

    console.log(`\n📤 [BATCH] Sending ALL ${processedUsers.length} users in SINGLE webhook call`);
    console.log(`🔗 Webhook URL: ${N8N_WEBHOOK_URL}`);
    console.log(`✅ Real names identified: ${singleN8NPayload.summary.realNamesIdentified.join(', ')}`);
    
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Workspace-Services-Monitor/1.0',
        'Accept': 'application/json'
      },
      body: JSON.stringify(singleN8NPayload),
      timeout: 30000 // Longer timeout for larger payload
    });

    console.log(`📡 Response: ${response.status} ${response.statusText}`);

    if (response.ok) {
      console.log(`✅ SUCCESS: Sent ALL ${processedUsers.length} users in SINGLE webhook call!`);
      console.log(`🎉 Your n8n will receive ONE webhook with ALL users data!`);
      return true;
    } else {
      const errorText = await response.text().catch(() => 'Unable to read response');
      console.error(`❌ FAILED: ${response.status} ${response.statusText}`);
      console.error(`❌ Error details: ${errorText}`);
      return false;
    }
    
  } catch (error) {
    console.error(`❌ Error sending batch data to n8n:`, error.message);
    return false;
  }
}

/**
 * FIXED: Collect all user monitoring data and send as SINGLE BATCH to n8n
 */
async function syncAllUsersToN8N() {
  try {
    console.log('\n🚀 [BATCH] Starting ONE-TIME BATCH sync with REAL USERNAMES...');
    console.log(`🔗 n8n Webhook: ${N8N_WEBHOOK_URL}`);
    
    // Get monitoring data for all users with FIXED username identification
    const allMonitoringData = await api.getAllUsersMonitoring({
      from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 24 hours
      to: new Date().toISOString().split('T')[0]
    });

    if (!allMonitoringData.success || !allMonitoringData.data) {
      console.log('⚠️ No monitoring data available');
      return;
    }

    console.log(`📊 [BATCH] Found ${allMonitoringData.data.length} users for BATCH processing`);
    
    // 🎯 Send ALL users in ONE webhook call
    const success = await sendAllUsersDataToN8N(allMonitoringData.data);
    
    if (success) {
      console.log(`\n✅ [BATCH] SUCCESS: ALL users sent in SINGLE webhook call!`);
      console.log(`🎉 Your n8n received ONE webhook with ALL ${allMonitoringData.data.length} users!`);
    } else {
      console.log(`\n❌ [BATCH] FAILED: Could not send batch data to n8n`);
    }
    
  } catch (error) {
    console.error('❌ Error during batch sync:', error.message);
  }
}

// ==================== DEBUG ENDPOINTS ====================

/**
 * @route   GET /api/debug/fixedUserLookup/:userId
 * @desc    DEBUG the FIXED user lookup
 */
app.get('/api/debug/fixedUserLookup/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`🔍 [DEBUG] Testing FIXED user lookup for: ${userId}`);
    
    const result = await getFixedUserLookup(userId);
    
    res.json({
      success: true,
      message: 'FIXED user lookup debug completed',
      userId: userId,
      result: result,
      explanation: {
        whatHappened: result.success 
          ? `✅ Found real username: "${result.username}"` 
          : `❌ User not found, using fallback: "${result.username}"`,
        method: result.method,
        confidence: result.confidence,
        nextSteps: result.success 
          ? 'User will show with real name in n8n webhooks'
          : 'Check if userId exists in TimeDoctor or update user profile'
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      userId: req.params.userId
    });
  }
});

/**
 * @route   GET /api/debug/allUsers
 * @desc    See all users in TimeDoctor with their IDs and names
 */
app.get('/api/debug/allUsers', async (req, res) => {
  try {
    console.log('📊 [DEBUG] Fetching all TimeDoctor users...');
    
    const allUsers = await api.getUsers({ limit: 1000, detail: 'extended' });
    
    if (!allUsers.data) {
      return res.json({
        success: false,
        message: 'No users found',
        data: []
      });
    }
    
    const userList = allUsers.data.map(user => ({
      userId: user.id,
      name: user.name || 'NO NAME',
      displayName: user.displayName || 'NO DISPLAY NAME', 
      username: user.username || 'NO USERNAME',
      fullName: user.fullName || 'NO FULL NAME',
      email: user.email || 'NO EMAIL',
      role: user.role || 'NO ROLE',
      status: user.status || 'NO STATUS',
      
      // Show what name will be used in webhook
      finalName: user.name || 
               user.displayName || 
               user.fullName || 
               user.username ||
               `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
               user.email?.split('@')[0] ||
               'Unknown User'
    }));
    
    console.log(`✅ [DEBUG] Found ${userList.length} users in TimeDoctor`);
    
    res.json({
      success: true,
      message: `Found ${userList.length} users in TimeDoctor company`,
      totalUsers: userList.length,
      data: userList,
      explanation: {
        purpose: 'This shows all users in your TimeDoctor company',
        usage: 'Use the "userId" field to test specific user lookup with /api/debug/fixedUserLookup/{userId}',
        finalName: 'The "finalName" field shows what name will appear in n8n webhooks',
        batchInfo: 'ALL these users will be sent in ONE single webhook call to n8n'
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== MANUAL SYNC ENDPOINTS ====================

/**
 * @route   POST /api/sync/now
 * @desc    Manually trigger BATCH sync to n8n (for testing)
 */
app.post('/api/sync/now', async (req, res) => {
  try {
    console.log('🚀 [MANUAL] Manual BATCH sync triggered...');
    
    // Run sync in background
    syncAllUsersToN8N().then(() => {
      console.log('✅ [MANUAL] Background BATCH sync completed');
    }).catch(error => {
      console.error('❌ [MANUAL] Background BATCH sync failed:', error.message);
    });
    
    res.json({
      success: true,
      message: 'Manual BATCH sync started in background',
      status: 'BATCH sync is running - ALL users will be sent in ONE webhook call',
      note: 'Check console for progress and your n8n for ONE webhook with ALL users'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== HEALTH ENDPOINT ====================

/**
 * @route   GET /api/health
 * @desc    Health check with BATCH status
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'TimeDoctor API Server with BATCH Username Detection',
    timestamp: new Date().toISOString(),
    fixes: {
      usernameLookup: 'FIXED - Now gets real names like "Levi Daniels", "Joshua Banks"',
      webhookFrequency: 'FIXED - Sends data only ONCE (not every 2 minutes)',
      webhookFormat: 'FIXED - Sends ALL users in ONE webhook call (not individual calls)',
      features: [
        'Real TimeDoctor usernames in webhooks',
        'Single webhook call with ALL users',
        'Single send on startup (not recurring)',
        'Proper user ID matching', 
        'Enhanced debugging endpoints'
      ]
    },
    testEndpoints: [
      'GET /api/debug/fixedUserLookup/aLfYIu7-TthUmwrm',
      'GET /api/debug/allUsers',
      'POST /api/sync/now'
    ],
    webhookConfig: {
      url: N8N_WEBHOOK_URL,
      sendOnce: SEND_ONCE_ON_STARTUP,
      sendRecurring: SEND_RECURRING,
      format: 'BATCH - All users in ONE webhook call'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /api/health - Server health with BATCH status',
      'GET /api/debug/fixedUserLookup/:userId - Test FIXED user lookup',
      'GET /api/debug/allUsers - See all TimeDoctor users with their IDs',
      'POST /api/sync/now - Manually trigger BATCH sync to n8n'
    ]
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log('\n🚀 TimeDoctor API Server with BATCH PROCESSING');
  console.log('===============================================');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`📧 Email: ${config.credentials.email}`);
  console.log(`🏢 Company: ${config.credentials.companyName}`);
  console.log('\n✅ FIXES APPLIED:');
  console.log('=================');
  console.log('🎯 1. FIXED Username Lookup - Gets real names like "Levi Daniels"');
  console.log('🎯 2. FIXED Webhook Frequency - Sends ONCE only (not every 2 minutes)');
  console.log('🎯 3. FIXED Webhook Format - ALL users in ONE webhook call');
  console.log('\n🔍 TEST THE BATCH PROCESSING:');
  console.log('=============================');
  console.log('1. Check all users: GET  /api/debug/allUsers');  
  console.log('2. Test user lookup: GET  /api/debug/fixedUserLookup/aLfYIu7-TthUmwrm');
  console.log('3. Manual batch sync: POST /api/sync/now');
  console.log('\n🎉 BATCH CONFIGURATION:');
  console.log('=======================');
  console.log(`✅ Send Once: ${SEND_ONCE_ON_STARTUP}`);
  console.log(`✅ Recurring: ${SEND_RECURRING}`);
  console.log(`✅ Format: BATCH - All users in ONE webhook`);
  console.log(`✅ Webhook: ${N8N_WEBHOOK_URL}`);
  
  // 🚀 FIXED: Send data ONCE on startup (if enabled)
  if (SEND_ONCE_ON_STARTUP) {
    setTimeout(() => {
      console.log('\n🚀 [STARTUP] Running SINGLE BATCH sync with FIXED usernames...');
      console.log('🎯 ALL users will be sent in ONE webhook call to n8n!');
      syncAllUsersToN8N();
    }, 10000); // Wait 10 seconds for server to fully start
  } else {
    console.log('\n⏸️ One-time sync disabled. Use POST /api/sync/now to manually trigger');
  }
  
  console.log('\n🎯 Server ready! ALL users with real names will be sent in ONE webhook call!');
});

module.exports = app;