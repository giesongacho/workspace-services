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

// ==================== ENHANCED: ALL USERS IN ONE WEBHOOK CALL ====================

/**
 * 🎯 ENHANCED: Collect all user monitoring data and send ALL USERS IN ONE WEBHOOK CALL
 * This replaces individual sends with ONE clean n8n execution
 */
async function syncAllUsersToN8N_OneCall() {
  try {
    console.log('\n🚀 [ENHANCED] Starting ONE-CALL sync with FIXED USERNAMES + COMPLETE ACTIVITY DATA...');
    console.log(`🔗 n8n Webhook: ${N8N_WEBHOOK_URL}`);
    
    // Get date range (last 24 hours)
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];
    
    console.log(`📅 Date range: ${from} to ${to}`);
    
    // Get monitoring data for all users with FIXED username identification
    const allMonitoringData = await api.getAllUsersMonitoring({ from, to });

    if (!allMonitoringData.success || !allMonitoringData.data) {
      console.log('⚠️ No monitoring data available for one-call sync');
      return;
    }

    console.log(`📊 [ENHANCED] Found ${allMonitoringData.data.length} users to process for ONE webhook call`);
    
    // 🔥 PROCESS ALL USERS WITH FIXED USERNAME LOOKUP + COMPLETE ACTIVITY DATA
    const allUsersWithCompleteData = [];
    
    for (const userData of allMonitoringData.data) {
      console.log(`\n🔄 [ENHANCED] Processing user: ${userData.userId}`);
      
      // 🎯 FIXED USERNAME LOOKUP - Get real names like "Levi Daniels", "Joshua Banks"
      const userLookup = await getFixedUserLookup(userData.userId);
      
      const enhancedUserData = {
        // 👤 REAL NAME (like "Levi Daniels" from TimeDoctor dashboard)
        name: userLookup.username,
        email: userData.userInfo?.email || 'Unknown',
        userId: userData.userId,
        realName: userLookup.username,
        realEmail: userLookup.email,
        timezone: userData.userInfo?.timezone || userLookup.timezone || 'Unknown',
        role: userData.userInfo?.role || userLookup.role || 'user',
        status: userData.userInfo?.status || 'offline',
        processedAt: new Date().toISOString(),
        
        // 🎯 DEVICE OWNER INFO
        deviceOwner: userLookup.username,
        whoOwnsThisDevice: userLookup.username,
        
        // 📊 SUMMARY COUNTS
        lookupSuccess: userLookup.success,
        hasData: userData.summary?.hasData || false,
        totalActivities: userData.activitySummary?.totalRecords || 0,
        totalScreenshots: userData.screenshots?.totalScreenshots || 0,
        totalDisconnections: userData.disconnectionEvents?.totalEvents || 0,
        totalTimeUsage: userData.timeUsage?.totalRecords || 0,
        
        // 🎯 COMPLETE ACTIVITY DATA ARRAYS
        activities: userData.activitySummary?.data || [],
        screenshots: userData.screenshots?.data || [],
        timeUsage: userData.timeUsage?.data || [],
        disconnections: userData.disconnectionEvents?.data || [],
        
        // 📈 PRODUCTIVITY & STATS DATA  
        productivityStats: userData.productivityStats?.data || null,
        overallStats: userData.overallStats?.data || null,
        
        // 📅 DATE RANGE
        dateRange: { from, to },
        
        // 🔍 USER INFO & LOOKUP DETAILS
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
        
        // 👤 EMPLOYEE IDENTIFICATION (FIXED TO SHOW REAL NAMES)
        monitoring: {
          dateRange: userData.dateRange,
          hasData: userData.summary?.hasData || false,
          totalActivities: userData.activitySummary?.totalRecords || 0,
          totalScreenshots: userData.screenshots?.totalScreenshots || 0,
          totalDisconnections: userData.disconnectionEvents?.totalEvents || 0,
          totalTimeUsageRecords: userData.timeUsage?.totalRecords || 0,
          
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
        
        // 🔍 DEBUG & MONITORING STATUS
        monitoringStatus: {
          activityStatus: userData.activitySummary?.status || 'no_data',
          screenshotStatus: userData.screenshots?.status || 'no_data',
          timeUsageStatus: userData.timeUsage?.status || 'no_data',
          disconnectionStatus: userData.disconnectionEvents?.status || 'no_data'
        }
      };
      
      console.log(`✅ [ENHANCED] Added "${userLookup.username}" with COMPLETE data (${userLookup.method})`);
      console.log(`   📊 Activities: ${enhancedUserData.totalActivities}`);
      console.log(`   📸 Screenshots: ${enhancedUserData.totalScreenshots}`);
      console.log(`   ⏱️  Time Usage: ${enhancedUserData.totalTimeUsage}`);
      console.log(`   🔌 Disconnections: ${enhancedUserData.totalDisconnections}`);
      
      allUsersWithCompleteData.push(enhancedUserData);
      
      // Small delay between user processing
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 🎯 CREATE ONE SINGLE JSON PAYLOAD WITH ALL USERS + COMPLETE ACTIVITY DATA + FIXED USERNAMES
    const oneCallPayload = {
      batchInfo: {
        type: 'ALL_USERS_WITH_FIXED_USERNAMES_AND_COMPLETE_ACTIVITY_DATA_IN_ONE_CALL',
        totalUsers: allUsersWithCompleteData.length,
        timestamp: new Date().toISOString(),
        source: 'timekeeper-workspace-services-fixed-enhanced',
        webhookUrl: N8N_WEBHOOK_URL,
        description: 'ALL users with FIXED USERNAMES + COMPLETE activity data in ONE webhook call!',
        includes: [
          'FIXED real usernames like "Levi Daniels", "Joshua Banks"',
          'Complete activities array with detailed records',
          'Screenshots array with scores and categories', 
          'TimeUsage array with app/website usage patterns',
          'Disconnections array with idle time data',
          'Productivity stats and overall statistics',
          'Device owner identification'
        ],
        dateRange: { from, to }
      },
      
      // 👥 ALL USERS WITH FIXED USERNAMES + COMPLETE ACTIVITY DATA
      allUsers: allUsersWithCompleteData,
      
      // 📈 ENHANCED SUMMARY
      summary: {
        totalUsers: allUsersWithCompleteData.length,
        usersWithData: allUsersWithCompleteData.filter(u => u.hasData).length,
        usersWithFixedNames: allUsersWithCompleteData.filter(u => u.lookupSuccess).length,
        totalActivities: allUsersWithCompleteData.reduce((sum, u) => sum + u.totalActivities, 0),
        totalScreenshots: allUsersWithCompleteData.reduce((sum, u) => sum + u.totalScreenshots, 0),
        totalTimeUsage: allUsersWithCompleteData.reduce((sum, u) => sum + u.totalTimeUsage, 0),
        totalDisconnections: allUsersWithCompleteData.reduce((sum, u) => sum + u.totalDisconnections, 0),
        realNamesFound: allUsersWithCompleteData.map(u => u.name),
        dateRange: { from, to },
        generatedAt: new Date().toISOString()
      }
    };

    console.log('\n📤 [ENHANCED] Sending ALL users with FIXED USERNAMES + COMPLETE ACTIVITY DATA in ONE webhook call...');
    console.log(`📊 Total users: ${allUsersWithCompleteData.length}`);
    console.log(`👤 Users with fixed names: ${oneCallPayload.summary.usersWithFixedNames}`);
    console.log(`📊 Total activities: ${oneCallPayload.summary.totalActivities}`);
    console.log(`📸 Total screenshots: ${oneCallPayload.summary.totalScreenshots}`);
    console.log(`⏱️  Total time usage: ${oneCallPayload.summary.totalTimeUsage}`);
    console.log(`🔌 Total disconnections: ${oneCallPayload.summary.totalDisconnections}`);
    console.log(`✅ Names: ${oneCallPayload.summary.realNamesFound.join(', ')}`);
    console.log(`🔗 Webhook: ${N8N_WEBHOOK_URL}`);
    console.log('🎯 THIS IS ONE CALL - NO MORE UGLY INDIVIDUAL WEBHOOK EXECUTIONS!');
    
    // 🚀 SEND ONE SINGLE ENHANCED WEBHOOK CALL
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Workspace-Services-Fixed-Enhanced-One-Call/1.0'
      },
      body: JSON.stringify(oneCallPayload),
      timeout: 60000 // Increased timeout for larger payloads
    });

    console.log(`📡 Response: ${response.status} ${response.statusText}`);

    if (response.ok) {
      console.log('\n✅ [ENHANCED] ONE CALL SUCCESS!');
      console.log(`🎉 Sent ALL ${allUsersWithCompleteData.length} users with FIXED USERNAMES + COMPLETE ACTIVITY DATA!`);
      console.log(`📊 Your n8n received: ${oneCallPayload.summary.totalActivities} activities, ${oneCallPayload.summary.totalScreenshots} screenshots!`);
      console.log(`🎯 Your n8n will show ONE clean execution with RICH data + REAL NAMES!`);
      console.log(`👥 Real names like: ${oneCallPayload.summary.realNamesFound.slice(0, 3).join(', ')}...`);
      return true;
    } else {
      const errorText = await response.text().catch(() => 'Unable to read response');
      console.error(`❌ [ENHANCED] ONE CALL FAILED: ${response.status} ${response.statusText}`);
      console.error(`❌ Error: ${errorText}`);
      return false;
    }
    
  } catch (error) {
    console.error(`❌ [ENHANCED] Error during one-call sync: ${error.message}`);
    console.error(error.stack);
    return false;
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
          ? 'User will show with real name in ONE webhook call to n8n'
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
      message: `Found ${userList.length} users in TimeDoctor company - will be sent in ONE webhook call`,
      totalUsers: userList.length,
      data: userList,
      explanation: {
        purpose: 'This shows all users in your TimeDoctor company',
        usage: 'Use the "userId" field to test specific user lookup with /api/debug/fixedUserLookup/{userId}',
        finalName: 'The "finalName" field shows what name will appear in the ONE n8n webhook call',
        enhancement: 'NOW SENDS ALL USERS IN ONE WEBHOOK CALL - NO MORE INDIVIDUAL CALLS!'
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/preview/enhancedData', async (req, res) => {
  try {
    console.log('👀 [PREVIEW] Getting sample of enhanced one-call data structure...');
    
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];
    
    const allMonitoringData = await api.getAllUsersMonitoring({ from, to });
    
    if (!allMonitoringData.success || !allMonitoringData.data || allMonitoringData.data.length === 0) {
      return res.json({
        success: false,
        message: 'No sample data available',
        sampleStructure: {
          batchInfo: {
            type: "ALL_USERS_WITH_FIXED_USERNAMES_AND_COMPLETE_ACTIVITY_DATA_IN_ONE_CALL",
            totalUsers: 11,
            description: "ALL users with FIXED USERNAMES + COMPLETE activity data in ONE webhook call!"
          },
          allUsers: [
            {
              name: "Alice Hale", // FIXED real name from TimeDoctor
              userId: "aLfYIu7-TthUmwrm",
              deviceOwner: "Alice Hale",
              activities: [],
              screenshots: [],
              timeUsage: [],
              disconnections: []
            }
          ]
        }
      });
    }
    
    // Get first user as sample and apply fixed lookup
    const sampleUserData = allMonitoringData.data[0];
    const sampleLookup = await getFixedUserLookup(sampleUserData.userId);
    
    const sampleData = {
      batchInfo: {
        type: "ALL_USERS_WITH_FIXED_USERNAMES_AND_COMPLETE_ACTIVITY_DATA_IN_ONE_CALL",
        totalUsers: allMonitoringData.data.length,
        description: "ALL users with FIXED USERNAMES + COMPLETE activity data in ONE webhook call!"
      },
      sampleUser: {
        name: sampleLookup.username, // FIXED real name!
        userId: sampleUserData.userId,
        deviceOwner: sampleLookup.username,
        whoOwnsThisDevice: sampleLookup.username,
        lookupSuccess: sampleLookup.success,
        
        // Activity data samples
        activities: sampleUserData.activitySummary?.data?.slice(0, 2) || [],
        screenshots: sampleUserData.screenshots?.data?.slice(0, 2) || [],
        timeUsage: sampleUserData.timeUsage?.data?.slice(0, 3) || [],
        disconnections: sampleUserData.disconnectionEvents?.data?.slice(0, 2) || [],
        
        // Counts
        totalActivities: sampleUserData.activitySummary?.totalRecords || 0,
        totalScreenshots: sampleUserData.screenshots?.totalScreenshots || 0,
        totalTimeUsage: sampleUserData.timeUsage?.totalRecords || 0,
        totalDisconnections: sampleUserData.disconnectionEvents?.totalEvents || 0
      }
    };
    
    res.json({
      success: true,
      message: 'Sample of enhanced one-call data structure with FIXED USERNAMES',
      note: 'This shows what the ONE webhook call will look like with real names + complete activity data',
      sampleData: sampleData,
      enhancement: {
        fixedUsernames: `Real names like "${sampleLookup.username}" instead of device names`,
        oneWebhookCall: 'ALL users sent in ONE call - no more individual webhook executions',
        completeActivityData: 'Full arrays of activities, screenshots, timeUsage, disconnections',
        cleanN8nExecution: 'Your n8n will show ONE clean execution instead of multiple ugly ones'
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
 * @desc    Manually trigger ONE CALL sync to n8n (for testing)
 */
app.post('/api/sync/now', async (req, res) => {
  try {
    console.log('🚀 [MANUAL] Manual ONE CALL sync triggered...');
    
    // Run ONE CALL sync in background
    syncAllUsersToN8N_OneCall().then(() => {
      console.log('✅ [MANUAL] Background ONE CALL sync completed');
    }).catch(error => {
      console.error('❌ [MANUAL] Background ONE CALL sync failed:', error.message);
    });
    
    res.json({
      success: true,
      message: 'Manual ONE CALL sync started in background',
      description: 'ALL users with FIXED USERNAMES + COMPLETE activity data will be sent in ONE webhook call',
      status: 'ONE CALL sync is running, check console for progress',
      enhancement: 'No more individual webhook calls - ONE clean n8n execution!'
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
 * @desc    Health check with FIXED + ENHANCED status
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'TimeDoctor API Server with FIXED Username Detection + ENHANCED One-Call Webhook',
    timestamp: new Date().toISOString(),
    fixes: {
      usernameLookup: 'FIXED - Gets real names like "Levi Daniels", "Joshua Banks"',
      webhookFrequency: 'FIXED - Sends data only ONCE (not every 2 minutes)',
      webhookMethod: 'ENHANCED - ALL users in ONE webhook call (no more ugly individual calls)',
      completeActivityData: 'ENHANCED - Full activity arrays included in ONE call'
    },
    enhancedFeatures: {
      oneCallWebhook: 'ALL users sent in ONE JSON payload to n8n',
      fixedUsernames: 'Real TimeDoctor usernames in webhook data',
      completeActivityData: 'Full activities, screenshots, timeUsage, disconnections arrays',
      cleanN8nExecution: 'ONE clean execution instead of multiple individual calls',
      improvedUI: 'No more ugly individual webhook executions in n8n'
    },
    testEndpoints: [
      'GET /api/debug/fixedUserLookup/aLfYIu7-TthUmwrm',
      'GET /api/debug/allUsers',
      'GET /api/preview/enhancedData - NEW: Preview one-call data structure',
      'POST /api/sync/now'
    ],
    webhookConfig: {
      url: N8N_WEBHOOK_URL,
      sendOnce: SEND_ONCE_ON_STARTUP,
      sendRecurring: SEND_RECURRING,
      method: 'ONE CALL - All users in single payload'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /api/health - Server health with FIXED + ENHANCED status',
      'GET /api/debug/fixedUserLookup/:userId - Test FIXED user lookup',
      'GET /api/debug/allUsers - See all users (will be sent in ONE call)',
      'GET /api/preview/enhancedData - Preview ONE CALL data structure',
      'POST /api/sync/now - Manually trigger ONE CALL sync to n8n'
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
  console.log('\n🚀 TimeDoctor API Server with FIXES APPLIED + ENHANCED One-Call Webhook');
  console.log('===========================================================================');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`📧 Email: ${config.credentials.email}`);
  console.log(`🏢 Company: ${config.credentials.companyName}`);
  console.log('\n✅ FIXES APPLIED:');
  console.log('=================');
  console.log('🎯 1. FIXED Username Lookup - Gets real names like "Levi Daniels"');
  console.log('🎯 2. FIXED Webhook Frequency - Sends ONCE only (not every 2 minutes)');
  console.log('\n🔥 NEW ENHANCEMENTS:');
  console.log('===================');
  console.log('🎯 3. ENHANCED One-Call Webhook - ALL users in ONE JSON payload');
  console.log('🎯 4. ENHANCED Complete Activity Data - Full arrays included');
  console.log('🎯 5. ENHANCED Clean n8n UI - ONE execution instead of multiple ugly ones');
  console.log('\n🔍 TEST THE ENHANCED FIXES:');
  console.log('===========================');
  console.log('1. Preview one-call data: GET  /api/preview/enhancedData');
  console.log('2. Check all users: GET  /api/debug/allUsers');  
  console.log('3. Test user lookup: GET  /api/debug/fixedUserLookup/aLfYIu7-TthUmwrm');
  console.log('4. Manual ONE CALL sync: POST /api/sync/now');
  console.log('\n🎉 ENHANCED CONFIGURATION:');
  console.log('==========================');
  console.log(`✅ Send Once: ${SEND_ONCE_ON_STARTUP}`);
  console.log(`✅ Recurring: ${SEND_RECURRING}`);
  console.log(`✅ Webhook: ${N8N_WEBHOOK_URL}`);
  console.log(`✅ Method: ONE CALL - All users in single payload`);
  
  // 🚀 ENHANCED: Send data ONCE on startup using ONE CALL method
  if (SEND_ONCE_ON_STARTUP) {
    setTimeout(() => {
      console.log('\n🚀 [STARTUP] Running ENHANCED ONE CALL sync with FIXED usernames + COMPLETE activity data...');
      syncAllUsersToN8N_OneCall();
    }, 10000); // Wait 10 seconds for server to fully start
  } else {
    console.log('\n⏸️ One-time sync disabled. Use POST /api/sync/now to manually trigger ONE CALL sync');
  }
  
  console.log('\n🎯 Server ready! Real usernames + complete activity data will be sent in ONE clean webhook call!');
  console.log('🎉 Your n8n will show ONE execution instead of multiple ugly individual calls!');
});

module.exports = app;