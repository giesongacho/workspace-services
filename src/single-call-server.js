const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const TimeDoctorAPI = require('./api');
const config = require('./config');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// 🔗 N8N WEBHOOK URL - SINGLE CALL FOR ALL USERS
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.srv470812.hstgr.cloud/webhook-test/workspace-url-n8n';

// 🎯 SINGLE SEND CONFIGURATION
const SEND_ONCE_ON_STARTUP = true; // Send all users in ONE call on startup
const SEND_RECURRING = false; // No recurring sends

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

// ==================== USER LOOKUP FUNCTION ====================

async function getRealUsername(userId) {
  console.log(`🔍 Getting real username for: ${userId}`);
  
  try {
    const allUsers = await api.getUsers({ limit: 1000, detail: 'extended' });
    
    if (!allUsers.data || allUsers.data.length === 0) {
      return { name: 'Unknown User', email: 'Email not available', success: false };
    }
    
    const matchedUser = allUsers.data.find(user => user.id === userId);
    
    if (matchedUser) {
      const realName = matchedUser.name || 
                      matchedUser.displayName || 
                      matchedUser.fullName || 
                      matchedUser.username ||
                      `${matchedUser.firstName || ''} ${matchedUser.lastName || ''}`.trim() ||
                      matchedUser.email?.split('@')[0] ||
                      'Unknown User';
      
      const realEmail = matchedUser.email || 'Email not available';
      
      console.log(`✅ Found real name: "${realName}" for user ${userId}`);
      
      return {
        name: realName,
        email: realEmail,
        timezone: matchedUser.timezone,
        role: matchedUser.role,
        success: true
      };
    } else {
      console.log(`❌ User ${userId} not found in user list`);
      return { 
        name: `User ${userId.substring(0, 8)}`, 
        email: 'Email not available', 
        success: false 
      };
    }
  } catch (error) {
    console.error(`❌ Error looking up user ${userId}: ${error.message}`);
    return { 
      name: `User ${userId.substring(0, 8)}`, 
      email: 'Email not available', 
      success: false 
    };
  }
}

// ==================== SINGLE WEBHOOK FUNCTION ====================

/**
 * 🎯 SEND ALL USERS IN ONE SINGLE JSON PAYLOAD TO WEBHOOK
 * This sends ONE webhook call with ALL users wrapped inside
 */
async function sendAllUsersInSingleCall() {
  try {
    console.log('\n🚀 [SINGLE CALL] Starting to collect ALL users for ONE webhook call...');
    
    // Get monitoring data for all users
    const allMonitoringData = await api.getAllUsersMonitoring({
      from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: new Date().toISOString().split('T')[0]
    });

    if (!allMonitoringData.success || !allMonitoringData.data) {
      console.log('⚠️ No monitoring data available');
      return;
    }

    console.log(`📊 [SINGLE CALL] Processing ${allMonitoringData.data.length} users for ONE webhook...`);
    
    // Process all users and collect their data
    const allUsersData = [];
    
    for (const userData of allMonitoringData.data) {
      console.log(`🔍 [SINGLE CALL] Processing user: ${userData.userId}`);
      
      // Get real username
      const userLookup = await getRealUsername(userData.userId);
      
      // Prepare user data
      const userInfo = {
        // 👤 REAL USER IDENTIFICATION
        name: userLookup.name,
        email: userLookup.email,
        userId: userData.userId,
        realName: userLookup.name,
        realEmail: userLookup.email,
        timezone: userLookup.timezone || 'Unknown',
        role: userLookup.role || 'Unknown',
        lookupSuccess: userLookup.success,
        
        // 📊 MONITORING DATA
        hasData: userData.summary?.hasData || false,
        totalActivities: userData.activitySummary?.totalRecords || 0,
        totalScreenshots: userData.screenshots?.totalScreenshots || 0,
        totalDisconnections: userData.disconnectionEvents?.totalEvents || 0,
        
        // 📝 DETAILED DATA
        activities: userData.activitySummary?.data || [],
        screenshots: userData.screenshots?.data || [],
        timeUsage: userData.timeUsage?.data || [],
        disconnections: userData.disconnectionEvents?.data || [],
        
        // 📅 DATE RANGE
        dateRange: userData.dateRange,
        processedAt: new Date().toISOString()
      };
      
      allUsersData.push(userInfo);
      console.log(`✅ [SINGLE CALL] Added "${userLookup.name}" to batch`);
      
      // Small delay to avoid overwhelming API
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // 🎯 CREATE SINGLE JSON PAYLOAD WITH ALL USERS
    const singleJsonPayload = {
      // 📊 BATCH METADATA
      batchInfo: {
        type: 'ALL_USERS_BATCH',
        totalUsers: allUsersData.length,
        timestamp: new Date().toISOString(),
        source: 'timekeeper-workspace-services',
        webhookUrl: N8N_WEBHOOK_URL,
        description: 'All TimeDoctor users data in ONE single webhook call'
      },
      
      // 👥 ALL USERS ARRAY - THIS IS WHAT YOU WANT!
      allUsers: allUsersData,
      
      // 📈 SUMMARY STATISTICS
      summary: {
        totalUsers: allUsersData.length,
        usersWithRealNames: allUsersData.filter(u => u.lookupSuccess).length,
        usersWithData: allUsersData.filter(u => u.hasData).length,
        totalActivities: allUsersData.reduce((sum, u) => sum + u.totalActivities, 0),
        totalScreenshots: allUsersData.reduce((sum, u) => sum + u.totalScreenshots, 0),
        realNamesFound: allUsersData.filter(u => u.lookupSuccess).map(u => u.name),
        generatedAt: new Date().toISOString()
      }
    };

    console.log('\n🎯 [SINGLE CALL] Sending ALL users in ONE JSON payload...');
    console.log(`📊 Total users in payload: ${allUsersData.length}`);
    console.log(`✅ Real names: ${singleJsonPayload.summary.realNamesFound.join(', ')}`);
    console.log(`🔗 Target webhook: ${N8N_WEBHOOK_URL}`);
    
    // 🚀 SEND SINGLE WEBHOOK CALL WITH ALL USERS
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Workspace-Services-Single-Call/1.0'
      },
      body: JSON.stringify(singleJsonPayload),
      timeout: 30000
    });

    console.log(`📡 Webhook response: ${response.status} ${response.statusText}`);

    if (response.ok) {
      console.log('\n✅ [SINGLE CALL] SUCCESS!');
      console.log(`🎉 Sent ALL ${allUsersData.length} users in ONE webhook call!`);
      console.log(`🎯 Your n8n received ONE execution with ALL users wrapped inside!`);
      console.log(`📋 No more individual calls - just ONE clean JSON payload!`);
      return true;
    } else {
      const errorText = await response.text().catch(() => 'Unable to read response');
      console.error(`❌ [SINGLE CALL] FAILED: ${response.status} ${response.statusText}`);
      console.error(`❌ Error: ${errorText}`);
      return false;
    }
    
  } catch (error) {
    console.error(`❌ [SINGLE CALL] Error: ${error.message}`);
    return false;
  }
}

// ==================== API ENDPOINTS ====================

/**
 * @route   GET /api/health
 * @desc    Health check - shows single call configuration
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'TimeDoctor API Server - SINGLE WEBHOOK CALL FOR ALL USERS',
    timestamp: new Date().toISOString(),
    configuration: {
      webhookUrl: N8N_WEBHOOK_URL,
      sendMode: 'SINGLE CALL - All users wrapped in ONE JSON payload',
      sendOnce: SEND_ONCE_ON_STARTUP,
      recurringCalls: SEND_RECURRING,
      description: 'No more individual user calls - ALL users sent in ONE webhook'
    },
    webhookPayloadStructure: {
      batchInfo: 'Metadata about the batch',
      allUsers: 'Array containing ALL users data',
      summary: 'Aggregate statistics'
    }
  });
});

/**
 * @route   POST /api/sync/now
 * @desc    Manually trigger single call with ALL users
 */
app.post('/api/sync/now', async (req, res) => {
  try {
    console.log('🚀 [MANUAL] Manual single call trigger...');
    
    // Run single call in background
    sendAllUsersInSingleCall().then(() => {
      console.log('✅ [MANUAL] Background single call completed');
    }).catch(error => {
      console.error('❌ [MANUAL] Background single call failed:', error.message);
    });
    
    res.json({
      success: true,
      message: 'Single call with ALL users started',
      description: 'ALL users will be sent in ONE webhook call (not individual calls)',
      webhookUrl: N8N_WEBHOOK_URL,
      note: 'Check your n8n - you will see ONE execution with ALL users inside'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/debug/allUsers
 * @desc    See all users that will be sent in single call
 */
app.get('/api/debug/allUsers', async (req, res) => {
  try {
    console.log('📊 [DEBUG] Fetching all users...');
    
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
      email: user.email || 'NO EMAIL',
      finalName: user.name || 
               user.displayName || 
               user.fullName || 
               user.username ||
               user.email?.split('@')[0] ||
               'Unknown User'
    }));
    
    res.json({
      success: true,
      message: `Found ${userList.length} users that will be sent in SINGLE webhook call`,
      totalUsers: userList.length,
      data: userList,
      webhookInfo: {
        url: N8N_WEBHOOK_URL,
        method: 'SINGLE CALL - All users in ONE JSON payload',
        description: 'These users will be wrapped in ONE webhook call'
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /api/health - Server health and single call configuration',
      'GET /api/debug/allUsers - See all users that will be sent',
      'POST /api/sync/now - Manually send ALL users in single call'
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
  console.log('\n🚀 TimeDoctor API Server - SINGLE WEBHOOK CALL FOR ALL USERS');
  console.log('===============================================================');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`📧 Email: ${config.credentials.email}`);
  console.log(`🏢 Company: ${config.credentials.companyName}`);
  console.log('\n🎯 SINGLE CALL CONFIGURATION:');
  console.log('=============================');
  console.log('✅ ALL users wrapped in ONE JSON payload');
  console.log('✅ ONE webhook call (not individual calls)'); 
  console.log('✅ Real usernames like "Levi Daniels", "Joshua Banks"');
  console.log('✅ Sent ONCE on startup (not recurring)');
  console.log('\n🔗 WEBHOOK TARGET:');
  console.log('==================');
  console.log(`🎯 URL: ${N8N_WEBHOOK_URL}`);
  console.log('📊 Payload: ONE JSON with ALL users inside');
  console.log('🎉 Result: Clean n8n execution (no spam!)');
  console.log('\n🔍 TEST COMMANDS:');
  console.log('================');
  console.log('1. Check config: GET  /api/health');  
  console.log('2. See all users: GET /api/debug/allUsers');
  console.log('3. Manual single call: POST /api/sync/now');
  console.log('\n✅ SINGLE CALL BENEFITS:');
  console.log('========================');
  console.log('✅ No more ugly individual webhook calls');
  console.log('✅ One clean JSON payload with ALL users');
  console.log('✅ Easy to process in n8n');
  console.log('✅ Real usernames instead of "Unknown User"');
  
  // 🚀 Send all users in single call on startup
  if (SEND_ONCE_ON_STARTUP) {
    setTimeout(() => {
      console.log('\n🚀 [STARTUP] Sending ALL users in ONE webhook call...');
      console.log('🎯 This will be ONE clean execution in your n8n!');
      sendAllUsersInSingleCall();
    }, 10000);
  } else {
    console.log('\n⏸️ Startup call disabled. Use POST /api/sync/now to trigger manually');
  }
  
  console.log('\n🎉 Server ready! ALL users will be sent in ONE beautiful JSON payload!');
});

module.exports = app;