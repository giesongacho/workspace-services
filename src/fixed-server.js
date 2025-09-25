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
 * Send individual user data to n8n webhook WITH FIXED USERNAME LOOKUP
 */
async function sendUserDataToN8N(userData) {
  try {
    console.log(`🔍 [FIXED] Processing user data for userId: ${userData.userId}`);
    
    // 🎯 FIXED USERNAME LOOKUP - Get real names like "Levi Daniels", "Joshua Banks"
    const userLookup = await getFixedUserLookup(userData.userId);
    
    const n8nPayload = {
      // 👤 REAL NAME (like "Levi Daniels" from TimeDoctor dashboard)
      name: userLookup.username,
      realEmail: userLookup.email,
      deviceOwner: userLookup.username,
      whoOwnsThisDevice: userLookup.username,
      
      timestamp: new Date().toISOString(),
      source: 'timekeeper-workspace-services',
      type: 'user_monitoring',
      
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

    console.log(`📤 [FIXED] Sending data for: "${userLookup.username}" (${userLookup.method})`);
    console.log(`🔗 Using webhook: ${N8N_WEBHOOK_URL}`);
    
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Workspace-Services-Monitor/1.0',
        'Accept': 'application/json'
      },
      body: JSON.stringify(n8nPayload),
      timeout: 10000
    });

    console.log(`📡 Response: ${response.status} ${response.statusText}`);

    if (response.ok) {
      console.log(`✅ SUCCESS: Sent data for "${userLookup.username}" (${userData.userId})`);
      return true;
    } else {
      const errorText = await response.text().catch(() => 'Unable to read response');
      console.error(`❌ FAILED: ${response.status} ${response.statusText}`);
      console.error(`❌ Error details: ${errorText}`);
      return false;
    }
    
  } catch (error) {
    console.error(`❌ Error sending data for ${userData.userId}:`, error.message);
    return false;
  }
}

/**
 * FIXED: Collect all user monitoring data and send to n8n (ONE TIME ONLY)
 */
async function syncAllUsersToN8N() {
  try {
    console.log('\n🚀 [FIXED] Starting ONE-TIME sync with REAL USERNAMES...');
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

    console.log(`📊 [FIXED] Found ${allMonitoringData.data.length} users to sync`);
    
    let successCount = 0;
    let errorCount = 0;

    // Send each user's data separately with FIXED username lookup
    for (const userData of allMonitoringData.data) {
      console.log(`\n🔄 Processing user: ${userData.userId}`);
      
      // Add delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const success = await sendUserDataToN8N(userData);
      if (success) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    console.log(`\n✅ [FIXED] Sync completed: ${successCount} successful, ${errorCount} errors`);
    console.log(`🎉 Data sent to n8n with REAL USERNAMES like "Levi Daniels", "Joshua Banks"!`);
    
  } catch (error) {
    console.error('❌ Error during sync:', error.message);
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
        finalName: 'The "finalName" field shows what name will appear in n8n webhooks'
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
 * @desc    Manually trigger sync to n8n (for testing)
 */
app.post('/api/sync/now', async (req, res) => {
  try {
    console.log('🚀 [MANUAL] Manual sync triggered...');
    
    // Run sync in background
    syncAllUsersToN8N().then(() => {
      console.log('✅ [MANUAL] Background sync completed');
    }).catch(error => {
      console.error('❌ [MANUAL] Background sync failed:', error.message);
    });
    
    res.json({
      success: true,
      message: 'Manual sync started in background',
      status: 'Sync is running, check console for progress'
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
 * @desc    Health check with FIXED status
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'TimeDoctor API Server with FIXED Username Detection',
    timestamp: new Date().toISOString(),
    fixes: {
      usernameLookup: 'FIXED - Now gets real names like "Levi Daniels", "Joshua Banks"',
      webhookFrequency: 'FIXED - Sends data only ONCE (not every 2 minutes)',
      features: [
        'Real TimeDoctor usernames in webhooks',
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
      sendRecurring: SEND_RECURRING
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /api/health - Server health with FIXED status',
      'GET /api/debug/fixedUserLookup/:userId - Test FIXED user lookup',
      'GET /api/debug/allUsers - See all TimeDoctor users with their IDs',
      'POST /api/sync/now - Manually trigger sync to n8n'
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
  console.log('\n🚀 TimeDoctor API Server with FIXES APPLIED');
  console.log('===============================================');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`📧 Email: ${config.credentials.email}`);
  console.log(`🏢 Company: ${config.credentials.companyName}`);
  console.log('\n✅ FIXES APPLIED:');
  console.log('=================');
  console.log('🎯 1. FIXED Username Lookup - Gets real names like "Levi Daniels"');
  console.log('🎯 2. FIXED Webhook Frequency - Sends ONCE only (not every 2 minutes)');
  console.log('\n🔍 TEST THE FIXES:');
  console.log('==================');
  console.log('1. Check all users: GET  /api/debug/allUsers');  
  console.log('2. Test user lookup: GET  /api/debug/fixedUserLookup/aLfYIu7-TthUmwrm');
  console.log('3. Manual sync: POST /api/sync/now');
  console.log('\n🎉 FIXED CONFIGURATION:');
  console.log('=======================');
  console.log(`✅ Send Once: ${SEND_ONCE_ON_STARTUP}`);
  console.log(`✅ Recurring: ${SEND_RECURRING}`);
  console.log(`✅ Webhook: ${N8N_WEBHOOK_URL}`);
  
  // 🚀 FIXED: Send data ONCE on startup (if enabled)
  if (SEND_ONCE_ON_STARTUP) {
    setTimeout(() => {
      console.log('\n🚀 [STARTUP] Running SINGLE sync with FIXED usernames...');
      syncAllUsersToN8N();
    }, 10000); // Wait 10 seconds for server to fully start
  } else {
    console.log('\n⏸️ One-time sync disabled. Use POST /api/sync/now to manually trigger');
  }
  
  // No recurring cron job - data sent only once!
  console.log('\n🎯 Server ready! Real usernames will appear in n8n webhooks!');
});

module.exports = app;