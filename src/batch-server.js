const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const TimeDoctorAPI = require('./api');
const config = require('./config');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// 🔗 WEBHOOK URL
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.srv470812.hstgr.cloud/webhook/workspace-url-n8n';

// 🎯 SINGLE SEND CONFIGURATION
const SEND_ONCE_ON_STARTUP = true;
const SEND_RECURRING = false;

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

// ==================== ENHANCED ONE SINGLE WEBHOOK CALL WITH COMPLETE ACTIVITY DATA ====================

/**
 * 🎯 SEND ALL USERS WITH COMPLETE ACTIVITY DATA IN ONE SINGLE WEBHOOK CALL
 * Includes: activities, screenshots, timeUsage, disconnections, etc.
 */
async function sendAllUsersWithCompleteDataInOneCall() {
  try {
    console.log('\n🚀 [ENHANCED ONE CALL] Collecting ALL users with COMPLETE ACTIVITY DATA...');
    
    // Get date range parameters (default to last 24 hours)
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];
    
    console.log(`📅 Date range: ${from} to ${to}`);
    
    // 🎯 GET COMPLETE MONITORING DATA FOR ALL USERS (This is the key enhancement!)
    const allMonitoringData = await api.getAllUsersMonitoring({
      from: from,
      to: to
    });

    if (!allMonitoringData.success || !allMonitoringData.data) {
      console.log('❌ No monitoring data found');
      return;
    }

    console.log(`📊 [ENHANCED] Found ${allMonitoringData.data.length} users with COMPLETE ACTIVITY DATA`);
    
    // 🔥 PROCESS ALL USERS WITH COMPLETE ACTIVITY ARRAYS
    const processedUsersWithCompleteData = allMonitoringData.data.map(userData => {
      const realName = userData.userInfo?.name || 
                      userData.userInfo?.username || 
                      userData.username || 
                      'Unknown User';
      
      console.log(`✅ [ENHANCED] Adding "${realName}" with COMPLETE activity data to payload`);
      console.log(`   📊 Activities: ${userData.activitySummary?.totalRecords || 0}`);
      console.log(`   📸 Screenshots: ${userData.screenshots?.totalScreenshots || 0}`);
      console.log(`   ⏱️  Time Usage: ${userData.timeUsage?.totalRecords || 0}`);
      console.log(`   🔌 Disconnections: ${userData.disconnectionEvents?.totalEvents || 0}`);
      
      return {
        // 👤 BASIC USER INFO
        name: realName,
        email: userData.userInfo?.email || 'Email not available',
        userId: userData.userId,
        realName: realName,
        realEmail: userData.userInfo?.email || 'Email not available',
        timezone: userData.userInfo?.timezone || 'Unknown',
        role: userData.userInfo?.role || 'user',
        status: userData.userInfo?.status || 'offline',
        processedAt: new Date().toISOString(),
        
        // 📊 SUMMARY COUNTS
        lookupSuccess: userData.userInfo?.lookupSuccess || false,
        hasData: userData.summary?.hasData || false,
        totalActivities: userData.activitySummary?.totalRecords || 0,
        totalScreenshots: userData.screenshots?.totalScreenshots || 0,
        totalDisconnections: userData.disconnectionEvents?.totalEvents || 0,
        totalTimeUsage: userData.timeUsage?.totalRecords || 0,
        
        // 🎯 COMPLETE ACTIVITY DATA ARRAYS (This is what you wanted!)
        activities: userData.activitySummary?.data || [],
        screenshots: userData.screenshots?.data || [],
        timeUsage: userData.timeUsage?.data || [],
        disconnections: userData.disconnectionEvents?.data || [],
        
        // 📈 PRODUCTIVITY & STATS DATA  
        productivityStats: userData.productivityStats?.data || null,
        overallStats: userData.overallStats?.data || null,
        
        // 📅 DATE RANGE
        dateRange: {
          from: from,
          to: to
        },
        
        // 🔍 DEBUG & MONITORING STATUS
        userInfo: userData.userInfo || {},
        monitoringStatus: {
          activityStatus: userData.activitySummary?.status || 'no_data',
          screenshotStatus: userData.screenshots?.status || 'no_data',
          timeUsageStatus: userData.timeUsage?.status || 'no_data',
          disconnectionStatus: userData.disconnectionEvents?.status || 'no_data'
        }
      };
    });

    // 🎯 CREATE ONE SINGLE JSON PAYLOAD WITH ALL USERS + COMPLETE ACTIVITY DATA
    const enhancedPayload = {
      batchInfo: {
        type: 'ALL_USERS_WITH_COMPLETE_ACTIVITY_DATA_IN_ONE_CALL',
        totalUsers: processedUsersWithCompleteData.length,
        timestamp: new Date().toISOString(),
        source: 'timekeeper-workspace-services-enhanced',
        webhookUrl: N8N_WEBHOOK_URL,
        description: 'ALL users with COMPLETE activity data in ONE webhook call!',
        includes: [
          'Basic user info (name, email, userId, etc.)',
          'Complete activities array with detailed records',
          'Screenshots array with scores and categories', 
          'TimeUsage array with app/website usage patterns',
          'Disconnections array with idle time data',
          'Productivity stats and overall statistics'
        ],
        dateRange: { from, to }
      },
      
      // 👥 ALL USERS WITH COMPLETE ACTIVITY DATA
      allUsers: processedUsersWithCompleteData,
      
      // 📈 ENHANCED SUMMARY
      summary: {
        totalUsers: processedUsersWithCompleteData.length,
        usersWithData: processedUsersWithCompleteData.filter(u => u.hasData).length,
        totalActivities: processedUsersWithCompleteData.reduce((sum, u) => sum + u.totalActivities, 0),
        totalScreenshots: processedUsersWithCompleteData.reduce((sum, u) => sum + u.totalScreenshots, 0),
        totalTimeUsage: processedUsersWithCompleteData.reduce((sum, u) => sum + u.totalTimeUsage, 0),
        totalDisconnections: processedUsersWithCompleteData.reduce((sum, u) => sum + u.totalDisconnections, 0),
        realNamesFound: processedUsersWithCompleteData.map(u => u.name),
        dateRange: { from, to },
        generatedAt: new Date().toISOString()
      }
    };

    console.log('\n📤 [ENHANCED] Sending ALL users with COMPLETE ACTIVITY DATA in ONE webhook call...');
    console.log(`📊 Total users: ${processedUsersWithCompleteData.length}`);
    console.log(`📊 Total activities: ${enhancedPayload.summary.totalActivities}`);
    console.log(`📸 Total screenshots: ${enhancedPayload.summary.totalScreenshots}`);
    console.log(`⏱️  Total time usage records: ${enhancedPayload.summary.totalTimeUsage}`);
    console.log(`🔌 Total disconnections: ${enhancedPayload.summary.totalDisconnections}`);
    console.log(`✅ Names: ${enhancedPayload.summary.realNamesFound.join(', ')}`);
    console.log(`🔗 Webhook: ${N8N_WEBHOOK_URL}`);
    console.log('🎯 THIS IS ONE CALL WITH COMPLETE ACTIVITY DATA - NOT JUST BASIC USER INFO!');
    
    // 🚀 SEND ONE SINGLE ENHANCED WEBHOOK CALL
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Workspace-Services-Enhanced-One-Call/1.0'
      },
      body: JSON.stringify(enhancedPayload),
      timeout: 60000 // Increased timeout for larger payloads with activity data
    });

    console.log(`📡 Response: ${response.status} ${response.statusText}`);

    if (response.ok) {
      console.log('\n✅ [ENHANCED] SUCCESS!');
      console.log(`🎉 Sent ALL ${processedUsersWithCompleteData.length} users with COMPLETE ACTIVITY DATA!`);
      console.log(`📊 Your n8n received: ${enhancedPayload.summary.totalActivities} activities, ${enhancedPayload.summary.totalScreenshots} screenshots!`);
      console.log(`🎯 Your n8n will show ONE execution with RICH activity data!`);
      return true;
    } else {
      const errorText = await response.text().catch(() => 'Unable to read response');
      console.error(`❌ [ENHANCED] FAILED: ${response.status} ${response.statusText}`);
      console.error(`❌ Error: ${errorText}`);
      return false;
    }
    
  } catch (error) {
    console.error(`❌ [ENHANCED] Error: ${error.message}`);
    console.error(error.stack);
    return false;
  }
}

// ==================== API ENDPOINTS ====================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Enhanced TimeDoctor API Server - ONE WEBHOOK WITH COMPLETE ACTIVITY DATA',
    timestamp: new Date().toISOString(),
    configuration: {
      webhookUrl: N8N_WEBHOOK_URL,
      sendMode: 'ONE CALL - All users with COMPLETE activity data',
      sendOnce: SEND_ONCE_ON_STARTUP,
      description: 'ENHANCED: Includes activities, screenshots, timeUsage, disconnections arrays'
    },
    enhancedFeatures: {
      completeActivityData: true,
      includesArrays: [
        'activities[] - Full activity records with timestamps, duration, mode',
        'screenshots[] - Screenshot data with scores, categories, titles', 
        'timeUsage[] - App/website usage patterns and time tracking',
        'disconnections[] - Idle time and disconnection events'
      ],
      dataRichness: 'Complete monitoring data like in your images!'
    }
  });
});

app.post('/api/sync/now', async (req, res) => {
  try {
    console.log('🚀 [MANUAL ENHANCED] Manual trigger for COMPLETE ACTIVITY DATA...');
    
    sendAllUsersWithCompleteDataInOneCall().then(() => {
      console.log('✅ [MANUAL ENHANCED] ONE CALL with complete activity data completed');
    }).catch(error => {
      console.error('❌ [MANUAL ENHANCED] ONE CALL failed:', error.message);
    });
    
    res.json({
      success: true,
      message: 'ENHANCED ONE CALL with ALL users and COMPLETE ACTIVITY DATA started',
      description: 'ALL users will be sent with activities, screenshots, timeUsage, disconnections arrays',
      webhookUrl: N8N_WEBHOOK_URL,
      note: 'Check your n8n - you will see ONE execution with RICH activity data',
      includes: [
        'Basic user info',
        'Complete activities array',
        'Screenshots with scores',
        'Time usage patterns', 
        'Disconnection events'
      ]
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/debug/allUsers', async (req, res) => {
  try {
    // Get enhanced data first to show what will be sent
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];
    
    console.log('🔍 [DEBUG] Getting enhanced user data preview...');
    const allMonitoringData = await api.getAllUsersMonitoring({ from, to });
    
    if (!allMonitoringData.success || !allMonitoringData.data) {
      return res.json({
        success: false,
        message: 'No enhanced monitoring data found',
        data: []
      });
    }
    
    const userPreview = allMonitoringData.data.map(userData => ({
      userId: userData.userId,
      name: userData.userInfo?.name || userData.username || 'NO NAME',
      email: userData.userInfo?.email || 'NO EMAIL',
      totalActivities: userData.activitySummary?.totalRecords || 0,
      totalScreenshots: userData.screenshots?.totalScreenshots || 0,
      totalTimeUsage: userData.timeUsage?.totalRecords || 0,
      totalDisconnections: userData.disconnectionEvents?.totalEvents || 0,
      hasActivityData: (userData.activitySummary?.totalRecords || 0) > 0,
      hasScreenshots: (userData.screenshots?.totalScreenshots || 0) > 0,
      hasTimeUsage: (userData.timeUsage?.totalRecords || 0) > 0
    }));
    
    res.json({
      success: true,
      message: `Found ${userPreview.length} users - will send with COMPLETE ACTIVITY DATA in ONE call`,
      dateRange: { from, to },
      totalUsers: userPreview.length,
      totalActivities: userPreview.reduce((sum, u) => sum + u.totalActivities, 0),
      totalScreenshots: userPreview.reduce((sum, u) => sum + u.totalScreenshots, 0),
      totalTimeUsage: userPreview.reduce((sum, u) => sum + u.totalTimeUsage, 0),
      totalDisconnections: userPreview.reduce((sum, u) => sum + u.totalDisconnections, 0),
      data: userPreview,
      webhookInfo: {
        url: N8N_WEBHOOK_URL,
        method: 'ENHANCED ONE CALL - All users with complete activity arrays'
      },
      enhancement: 'This shows what activity data will be included!'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/preview/sampleData', async (req, res) => {
  try {
    console.log('👀 [PREVIEW] Getting sample of enhanced data structure...');
    
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];
    
    const allMonitoringData = await api.getAllUsersMonitoring({ from, to });
    
    if (!allMonitoringData.success || !allMonitoringData.data || allMonitoringData.data.length === 0) {
      return res.json({
        success: false,
        message: 'No sample data available',
        sampleStructure: {
          name: "Sample User",
          email: "user@company.com",
          userId: "sampleUserId",
          activities: [
            {
              start: "2025-09-24T15:12:48.000Z",
              time: 3286,
              mode: "computer",
              userId: "userId",
              deviceId: "device-id"
            }
          ],
          screenshots: [],
          timeUsage: [
            {
              start: "2025-09-24T15:12:48.000Z", 
              time: 2,
              score: 3,
              category: "categoryId",
              type: "app",
              value: "application-name",
              title: "Application Title"
            }
          ],
          disconnections: []
        }
      });
    }
    
    // Get first user as sample
    const sampleUser = allMonitoringData.data[0];
    const sampleData = {
      userId: sampleUser.userId,
      name: sampleUser.userInfo?.name || sampleUser.username || 'Sample User',
      email: sampleUser.userInfo?.email || 'sample@company.com',
      
      // Show sample of actual data structures
      activities: sampleUser.activitySummary?.data?.slice(0, 2) || [],
      screenshots: sampleUser.screenshots?.data?.slice(0, 2) || [],
      timeUsage: sampleUser.timeUsage?.data?.slice(0, 3) || [],
      disconnections: sampleUser.disconnectionEvents?.data?.slice(0, 2) || [],
      
      // Counts
      totalActivities: sampleUser.activitySummary?.totalRecords || 0,
      totalScreenshots: sampleUser.screenshots?.totalScreenshots || 0,
      totalTimeUsage: sampleUser.timeUsage?.totalRecords || 0,
      totalDisconnections: sampleUser.disconnectionEvents?.totalEvents || 0
    };
    
    res.json({
      success: true,
      message: 'Sample of enhanced data structure that will be sent to n8n',
      note: 'This is what each user object will look like in the webhook payload',
      sampleData: sampleData,
      explanation: {
        activities: 'Array of activity sessions with start time, duration, mode',
        screenshots: 'Array of screenshots with scores, categories, titles',
        timeUsage: 'Array of app/website usage with time spent, productivity scores',
        disconnections: 'Array of idle/disconnect events'
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
      'GET /api/health - Enhanced server status',
      'POST /api/sync/now - Trigger enhanced sync with complete activity data',
      'GET /api/debug/allUsers - Preview users with activity data counts', 
      'GET /api/preview/sampleData - See sample of enhanced data structure'
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
  console.log('\n🚀 ENHANCED TimeDoctor API Server - ONE WEBHOOK WITH COMPLETE ACTIVITY DATA');
  console.log('================================================================================');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`📧 Email: ${config.credentials.email}`);
  console.log(`🏢 Company: ${config.credentials.companyName}`);
  console.log('\n🎯 ENHANCED ONE CALL CONFIGURATION:');
  console.log('===================================');
  console.log('✅ ALL users in ONE JSON payload');
  console.log('✅ COMPLETE activity data arrays included');
  console.log('✅ activities[] - Full activity sessions'); 
  console.log('✅ screenshots[] - Screenshots with scores');
  console.log('✅ timeUsage[] - App/website usage patterns');
  console.log('✅ disconnections[] - Idle time events');
  console.log('✅ Real usernames from TimeDoctor');
  console.log('✅ Sent ONCE on startup with ALL activity data');
  console.log('\n🔗 WEBHOOK:');
  console.log('===========');
  console.log(`🎯 URL: ${N8N_WEBHOOK_URL}`);
  console.log('📊 Format: ONE JSON with ALL users + COMPLETE activity arrays');
  console.log('🎉 Result: ONE n8n execution with RICH monitoring data');
  console.log('\n🔥 ENHANCED FEATURES:');
  console.log('====================');
  console.log('📊 Each user includes complete activity arrays (like in your images)');
  console.log('📈 Productivity stats and overall statistics');
  console.log('📅 Date range filtering (last 24 hours by default)');
  console.log('🎯 Summary counts for quick analysis');
  console.log('🔍 Debug endpoints to preview data structure');
  
  // 🚀 Send enhanced call on startup
  if (SEND_ONCE_ON_STARTUP) {
    setTimeout(() => {
      console.log('\n🚀 [STARTUP] Sending ENHANCED webhook with COMPLETE ACTIVITY DATA...');
      console.log('🎯 This will include activities, screenshots, timeUsage, disconnections!');
      sendAllUsersWithCompleteDataInOneCall();
    }, 10000);
  }
  
  console.log('\n🎉 Enhanced server ready! COMPLETE ACTIVITY DATA webhook coming up!');
  console.log('💡 Test preview: GET /api/preview/sampleData');
});

module.exports = app;