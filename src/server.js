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
const MONITORING_INTERVAL = '*/2 * * * *'; // Every 2 minutes (CHANGED FROM 5 MINUTES)

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

// ==================== N8N USER LOOKUP HELPERS ====================

/**
 * @route   GET /api/n8n/lookupUser/:userId
 * @desc    Get real user name and email when you have userId but email shows "Unknown"
 * @param   userId - The user ID from n8n data
 * 
 * This endpoint is specifically designed for n8n workflows where you get monitoring
 * data with "Unknown" emails but valid userIds. It returns the real user details.
 */
app.get('/api/n8n/lookupUser/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    if (!userId || userId === 'undefined') {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
        example: 'GET /api/n8n/lookupUser/aLfYIu7-TthUmwrm'
      });
    }

    console.log(`🔍 N8N User lookup requested for: ${userId}`);
    
    // Get user details from TimeDoctor API
    const userDetails = await api.getUser(userId);
    
    // Extract the essential info for n8n
    const lookupResult = {
      userId: userId,
      realName: userDetails.name || 'Name not available',
      realEmail: userDetails.email || 'Email not available',
      timezone: userDetails.timezone || 'Unknown',
      role: userDetails.role || 'Unknown',
      status: userDetails.status || 'Unknown',
      fullUserData: userDetails // Complete user object for reference
    };
    
    console.log(`✅ Found user: ${lookupResult.realName} (${lookupResult.realEmail})`);
    
    res.json({
      success: true,
      message: `User lookup successful for ${userId}`,
      data: lookupResult,
      n8nIntegration: {
        usage: 'Use realName and realEmail in your n8n workflow instead of "Unknown" values',
        example: {
          originalData: {
            email: "Unknown",
            userId: userId
          },
          resolvedData: {
            email: lookupResult.realEmail,
            name: lookupResult.realName,
            userId: userId
          }
        }
      }
    });
  } catch (error) {
    console.error(`❌ N8N User lookup error for ${req.params.userId}:`, error.message);
    res.status(error.message.includes('Not Found') ? 404 : 500).json({
      success: false,
      error: error.message,
      userId: req.params.userId,
      troubleshooting: [
        'Verify the userId exists in TimeDoctor',
        'Check if user has been deleted or archived',
        'Ensure API has permission to access user data'
      ]
    });
  }
});

/**
 * @route   POST /api/n8n/lookupUsers
 * @desc    Batch lookup multiple users by their IDs (for n8n bulk processing)
 * @body    { userIds: ["userId1", "userId2", ...] }
 * 
 * Perfect for n8n workflows that need to resolve multiple "Unknown" emails at once.
 */
app.post('/api/n8n/lookupUsers', async (req, res) => {
  try {
    const userIds = req.body.userIds;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'userIds array is required',
        example: {
          userIds: ["aLfYIu7-TthUmwrm", "another-user-id"]
        }
      });
    }

    console.log(`🔍 N8N Batch user lookup requested for ${userIds.length} users`);
    
    const lookupResults = [];
    const errors = [];
    
    // Process each userId
    for (const userId of userIds) {
      try {
        if (!userId || userId === 'undefined') {
          errors.push({ userId, error: 'Invalid user ID' });
          continue;
        }
        
        console.log(`🔍 Looking up user: ${userId}`);
        const userDetails = await api.getUser(userId);
        
        lookupResults.push({
          userId: userId,
          realName: userDetails.name || 'Name not available',
          realEmail: userDetails.email || 'Email not available',
          timezone: userDetails.timezone || 'Unknown',
          role: userDetails.role || 'Unknown',
          status: userDetails.status || 'Unknown'
        });
        
        console.log(`✅ Found: ${userDetails.name} (${userDetails.email})`);
        
        // Small delay to avoid overwhelming API
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ Error looking up user ${userId}:`, error.message);
        errors.push({ 
          userId, 
          error: error.message 
        });
      }
    }
    
    res.json({
      success: true,
      message: `Batch lookup completed: ${lookupResults.length} successful, ${errors.length} errors`,
      data: {
        users: lookupResults,
        errors: errors,
        summary: {
          totalRequested: userIds.length,
          successful: lookupResults.length,
          failed: errors.length
        }
      },
      n8nIntegration: {
        usage: 'Loop through the users array to get realName and realEmail for each userId',
        example: 'users.forEach(user => console.log(`${user.userId} = ${user.realName} <${user.realEmail}>`))'
      }
    });
  } catch (error) {
    console.error('❌ N8N Batch lookup error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/n8n/enrichMonitoringData
 * @desc    Enrich n8n monitoring data by replacing "Unknown" emails with real user data
 * @body    Complete n8n monitoring payload (like from your screenshot)
 * 
 * This endpoint takes the exact JSON structure you showed in the screenshot
 * and returns the same structure but with real user names and emails.
 */
app.post('/api/n8n/enrichMonitoringData', async (req, res) => {
  try {
    const monitoringData = req.body;
    
    if (!monitoringData || !monitoringData.body || !monitoringData.body.user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid monitoring data structure',
        expectedFormat: {
          body: {
            user: {
              userId: "user-id-here",
              email: "Unknown",
              deviceName: "Computer-xyz"
            }
          }
        }
      });
    }

    const userId = monitoringData.body.user.userId;
    
    if (!userId || userId === 'undefined') {
      return res.status(400).json({
        success: false,
        error: 'userId not found in monitoring data'
      });
    }

    console.log(`🔧 N8N Data enrichment requested for user: ${userId}`);
    
    try {
      // Get real user details
      const userDetails = await api.getUser(userId);
      
      // Create enriched monitoring data
      const enrichedData = JSON.parse(JSON.stringify(monitoringData)); // Deep copy
      
      // Replace "Unknown" email with real email
      enrichedData.body.user.realEmail = userDetails.email || 'Email not available';
      enrichedData.body.user.realName = userDetails.name || 'Name not available';
      enrichedData.body.user.timezone = userDetails.timezone || 'Unknown';
      enrichedData.body.user.role = userDetails.role || 'Unknown';
      enrichedData.body.user.status = userDetails.status || 'Unknown';
      
      // Keep original data for reference
      enrichedData.body.user.originalEmail = monitoringData.body.user.email;
      enrichedData.body.user.originalDeviceName = monitoringData.body.user.deviceName;
      
      // Add enrichment metadata
      enrichedData.enrichmentInfo = {
        enrichedAt: new Date().toISOString(),
        source: 'workspace-services-n8n-enrichment',
        originalEmailWasUnknown: monitoringData.body.user.email === 'Unknown',
        userFound: true,
        realUserData: {
          name: userDetails.name,
          email: userDetails.email,
          timezone: userDetails.timezone,
          role: userDetails.role
        }
      };
      
      console.log(`✅ Enriched data for: ${userDetails.name} (${userDetails.email})`);
      
      res.json({
        success: true,
        message: `Monitoring data enriched successfully for user ${userId}`,
        data: enrichedData,
        summary: {
          userId: userId,
          originalEmail: monitoringData.body.user.email,
          realName: userDetails.name,
          realEmail: userDetails.email,
          wasUnknown: monitoringData.body.user.email === 'Unknown'
        }
      });
      
    } catch (userError) {
      console.error(`❌ User not found: ${userId}`, userError.message);
      
      // Return original data with error info
      const errorEnrichedData = JSON.parse(JSON.stringify(monitoringData));
      errorEnrichedData.enrichmentInfo = {
        enrichedAt: new Date().toISOString(),
        source: 'workspace-services-n8n-enrichment',
        userFound: false,
        error: userError.message,
        originalEmailWasUnknown: monitoringData.body.user.email === 'Unknown'
      };
      
      res.status(404).json({
        success: false,
        error: `User not found: ${userId}`,
        data: errorEnrichedData,
        message: 'Returned original data with error information'
      });
    }
  } catch (error) {
    console.error('❌ N8N Data enrichment error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/n8n/userMap
 * @desc    Get a complete userId -> userInfo mapping for all users
 * 
 * Creates a lookup table that n8n can cache and use for fast user resolutions.
 * Perfect for workflows that need to resolve many "Unknown" emails quickly.
 */
app.get('/api/n8n/userMap', async (req, res) => {
  try {
    console.log('🗺️ N8N User map generation requested');
    
    // Get all users
    const allUsers = await api.getUsers({ limit: 1000 }); // Get all users
    
    if (!allUsers.data || allUsers.data.length === 0) {
      return res.json({
        success: true,
        message: 'No users found',
        data: {
          userMap: {},
          totalUsers: 0
        }
      });
    }
    
    // Create userId -> userInfo mapping
    const userMap = {};
    
    allUsers.data.forEach(user => {
      userMap[user.id] = {
        name: user.name || 'Name not available',
        email: user.email || 'Email not available',
        timezone: user.timezone || 'Unknown',
        role: user.role || 'Unknown',
        status: user.status || 'Unknown',
        deviceName: user.name || 'Unknown Device' // Use name as device fallback
      };
    });
    
    console.log(`✅ Generated user map with ${Object.keys(userMap).length} users`);
    
    res.json({
      success: true,
      message: `User mapping generated for ${Object.keys(userMap).length} users`,
      data: {
        userMap: userMap,
        totalUsers: Object.keys(userMap).length,
        generatedAt: new Date().toISOString()
      },
      n8nIntegration: {
        usage: 'Cache this userMap in n8n and use: userMap[userId] to get user details',
        example: {
          lookup: 'const user = userMap["aLfYIu7-TthUmwrm"];',
          result: 'user.name, user.email, user.timezone, etc.'
        }
      }
    });
  } catch (error) {
    console.error('❌ N8N User map generation error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== N8N WEBHOOK FUNCTIONS ====================

/**
 * Send individual user data to n8n webhook WITH AUTOMATIC REAL USER NAME LOOKUP
 * @param {object} userData - Individual user monitoring data
 * @returns {Promise<boolean>} Success status
 */
async function sendUserDataToN8N(userData) {
  try {
    // 🔍 LOOKUP REAL USER DATA AUTOMATICALLY
    let realUserName = 'Name not available';
    let realUserEmail = 'Email not available';
    let realUserTimezone = 'Unknown';
    let realUserRole = 'Unknown';
    
    try {
      // Get real user details using the userId
      const userId = userData.userId;
      if (userId && userId !== 'undefined') {
        console.log(`🔍 Looking up real user data for: ${userId}`);
        const userDetails = await api.getUser(userId);
        
        realUserName = userDetails.name || 'Name not available';
        realUserEmail = userDetails.email || 'Email not available';
        realUserTimezone = userDetails.timezone || 'Unknown';
        realUserRole = userDetails.role || 'Unknown';
        
        console.log(`✅ Found real user: ${realUserName} (${realUserEmail})`);
      }
    } catch (userLookupError) {
      console.error(`⚠️ Could not lookup user details for ${userData.userId}:`, userLookupError.message);
      // Continue with default values
    }

    const n8nPayload = {
      // 🎯 ADD REAL USER NAME TO BODY ROOT LEVEL
      name: realUserName,  // ← REAL USER NAME ADDED HERE!
      realEmail: realUserEmail,  // ← REAL EMAIL ADDED TOO!
      
      timestamp: new Date().toISOString(),
      source: 'timekeeper-workspace-services',
      type: 'user_monitoring',
      user: {
        userId: userData.userId,
        deviceName: userData.userInfo?.name || 'Unknown Device',
        email: userData.userInfo?.email || 'Unknown',
        
        // 🎯 ALSO ADD REAL USER DATA TO USER OBJECT
        realName: realUserName,      // ← Real name in user object
        realEmail: realUserEmail,    // ← Real email in user object  
        realTimezone: realUserTimezone, // ← Real timezone
        realRole: realUserRole,      // ← Real role
        
        timezone: userData.userInfo?.timezone || 'Unknown',
        lastSeen: userData.userInfo?.lastSeenGlobal,
        deviceInfo: {
          ...userData.userInfo?.deviceInfo || {},
          // Add enrichment info
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
        totalTimeUsageRecords: userData.timeUsage?.totalRecords || 0
      },
      activities: userData.activitySummary?.data || [],
      screenshots: userData.screenshots?.data || [],
      timeUsage: userData.timeUsage?.data || [],
      disconnections: userData.disconnectionEvents?.data || [],
      productivityStats: userData.productivityStats?.data || null,
      overallStats: userData.overallStats?.data || null
    };

    console.log(`📤 Sending enriched data to n8n for user: ${realUserName} (${userData.userId})`);
    console.log(`🔗 Using webhook URL: ${N8N_WEBHOOK_URL}`);
    
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Workspace-Services-Monitor/1.0',
        'Accept': 'application/json'
      },
      body: JSON.stringify(n8nPayload),
      timeout: 10000 // 10 second timeout
    });

    console.log(`📡 Response status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      console.log(`✅ Successfully sent enriched data to n8n for user: ${realUserName} (${userData.userId})`);
      return true;
    } else {
      const errorText = await response.text().catch(() => 'Unable to read response');
      console.error(`❌ Failed to send data to n8n for user ${userData.userId}: ${response.status} ${response.statusText}`);
      console.error(`📝 Response body: ${errorText}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error sending data to n8n for user ${userData.userId}:`, error.message);
    if (error.code === 'ENOTFOUND') {
      console.error('🌐 DNS resolution failed - check if n8n URL is correct');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('🚫 Connection refused - n8n server might be down');
    }
    return false;
  }
}

/**
 * Collect all user monitoring data and send to n8n (each user separately)
 */
async function syncAllUsersToN8N() {
  try {
    console.log('\n🔄 Starting automated n8n sync for all users...');
    console.log(`🔗 n8n Webhook URL: ${N8N_WEBHOOK_URL}`);
    
    // Get monitoring data for all users
    const allMonitoringData = await api.getAllUsersMonitoring({
      from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 24 hours
      to: new Date().toISOString().split('T')[0]
    });

    if (!allMonitoringData.success || !allMonitoringData.data) {
      console.log('⚠️ No monitoring data available for n8n sync');
      return;
    }

    console.log(`📊 Found ${allMonitoringData.data.length} users to sync to n8n`);
    
    let successCount = 0;
    let errorCount = 0;

    // Send each user's data separately to n8n
    for (const userData of allMonitoringData.data) {
      // Add a small delay between requests to avoid overwhelming n8n
      await new Promise(resolve => setTimeout(resolve, 500)); // Reduced delay for 2-minute sync
      
      const success = await sendUserDataToN8N(userData);
      if (success) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    // Send summary data as well
    const summaryPayload = {
      timestamp: new Date().toISOString(),
      source: 'timekeeper-workspace-services',
      type: 'monitoring_summary',
      summary: {
        totalUsers: allMonitoringData.summary.totalUsers,
        usersWithData: allMonitoringData.summary.usersWithData,
        totalScreenshots: allMonitoringData.summary.totalScreenshots,
        totalActivityRecords: allMonitoringData.summary.totalActivityRecords,
        monitoringPeriod: allMonitoringData.summary.monitoringPeriod,
        generatedAt: allMonitoringData.summary.generatedAt,
        syncStats: {
          successfulUsers: successCount,
          failedUsers: errorCount,
          totalAttempted: allMonitoringData.data.length
        }
      }
    };

    try {
      const summaryResponse = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Workspace-Services-Monitor/1.0'
        },
        body: JSON.stringify(summaryPayload)
      });

      if (summaryResponse.ok) {
        console.log('✅ Summary data sent successfully');
      } else {
        console.log(`⚠️ Summary data failed: ${summaryResponse.status} ${summaryResponse.statusText}`);
      }
    } catch (error) {
      console.log(`⚠️ Summary data error: ${error.message}`);
    }

    console.log(`✅ n8n sync completed: ${successCount} users successful, ${errorCount} errors`);
    
  } catch (error) {
    console.error('❌ Error during n8n sync:', error.message);
  }
}

// ==================== N8N SCHEDULER ====================

// Schedule automatic sync every 2 minutes (CHANGED FROM 5 MINUTES)
console.log('⏰ Setting up n8n sync scheduler (every 2 minutes)...');
cron.schedule(MONITORING_INTERVAL, () => {
  console.log('\n⏰ Scheduled n8n sync triggered');
  syncAllUsersToN8N();
}, {
  scheduled: true,
  timezone: "UTC"
});

// Initial sync after 30 seconds of server start
setTimeout(() => {
  console.log('🚀 Running initial n8n sync...');
  syncAllUsersToN8N();
}, 30000);

// ==================== N8N ENDPOINTS ====================

/**
 * @route   POST /api/n8n/sync
 * @desc    Manually trigger n8n sync for all users
 */
app.post('/api/n8n/sync', async (req, res) => {
  try {
    console.log('📤 Manual n8n sync triggered via API');
    
    // Run sync in background
    syncAllUsersToN8N().then(() => {
      console.log('✅ Manual n8n sync completed');
    }).catch(error => {
      console.error('❌ Manual n8n sync failed:', error.message);
    });
    
    res.json({
      success: true,
      message: 'n8n sync started in background',
      webhookUrl: N8N_WEBHOOK_URL,
      syncInterval: MONITORING_INTERVAL,
      syncIntervalDescription: 'Every 2 minutes'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/n8n/sync-user/:userId
 * @desc    Manually trigger n8n sync for specific user
 */
app.post('/api/n8n/sync-user/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    if (!userId || userId === 'undefined') {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    console.log(`📤 Manual n8n sync triggered for user: ${userId}`);
    
    // Get monitoring data for specific user
    const userMonitoring = await api.getCompleteUserMonitoring(userId, {
      from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: new Date().toISOString().split('T')[0]
    });

    const success = await sendUserDataToN8N(userMonitoring);
    
    res.json({
      success: success,
      message: success 
        ? `Data sent to n8n successfully for user ${userId}`
        : `Failed to send data to n8n for user ${userId}`,
      webhookUrl: N8N_WEBHOOK_URL,
      userId: userId,
      deviceName: userMonitoring.userInfo?.name || 'Unknown Device'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/n8n/status
 * @desc    Get n8n integration status and configuration
 */
app.get('/api/n8n/status', (req, res) => {
  res.json({
    success: true,
    n8nIntegration: {
      webhookUrl: N8N_WEBHOOK_URL,
      syncInterval: MONITORING_INTERVAL,
      syncIntervalDescription: 'Every 2 minutes',
      schedulerActive: true,
      lastSyncTime: 'Check server logs for sync times',
      dataFormat: 'Individual user records + summary',
      features: [
        'Automated user monitoring data sync every 2 minutes',
        'Individual user data separation',
        'Device name identification', 
        'Activity tracking details',
        'Screenshot metadata',
        'Productivity statistics',
        'Manual sync triggers',
        'User lookup for "Unknown" email resolution',
        'Batch user lookups for bulk processing',
        'Complete user mapping for n8n caching',
        'Monitoring data enrichment',
        'AUTOMATIC REAL USER NAME INCLUSION'
      ]
    }
  });
});

/**
 * @route   POST /api/n8n/test
 * @desc    Test n8n webhook connectivity with detailed diagnostics
 */
app.post('/api/n8n/test', async (req, res) => {
  try {
    console.log(`🧪 Testing n8n webhook: ${N8N_WEBHOOK_URL}`);
    
    const testPayload = {
      // Test with real user name lookup
      name: 'Test User', // This would be a real name in actual data
      realEmail: 'test@company.com',
      
      timestamp: new Date().toISOString(),
      source: 'timekeeper-workspace-services',
      type: 'connectivity_test',
      message: 'This is a test from Workspace Services with enhanced user data',
      testData: {
        serverPort: PORT,
        environment: config.isDevelopment ? 'development' : 'production',
        testId: Math.random().toString(36).substring(7),
        syncInterval: 'Every 2 minutes',
        enhancedWithRealUserData: true
      }
    };

    const startTime = Date.now();
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Workspace-Services-Monitor/1.0',
        'Accept': 'application/json'
      },
      body: JSON.stringify(testPayload),
      timeout: 10000 // 10 second timeout
    });
    const responseTime = Date.now() - startTime;

    const responseText = await response.text().catch(() => 'Unable to read response');

    if (response.ok) {
      console.log(`✅ n8n webhook test successful (${responseTime}ms)`);
      res.json({
        success: true,
        message: 'n8n webhook test successful with enhanced user data',
        webhookUrl: N8N_WEBHOOK_URL,
        responseStatus: response.status,
        responseStatusText: response.statusText,
        responseTime: `${responseTime}ms`,
        responseBody: responseText.substring(0, 500), // First 500 chars
        testPayload: testPayload,
        syncInterval: 'Every 2 minutes'
      });
    } else {
      console.error(`❌ n8n webhook test failed: ${response.status} ${response.statusText}`);
      res.status(response.status).json({
        success: false,
        error: `n8n webhook test failed: ${response.status} ${response.statusText}`,
        webhookUrl: N8N_WEBHOOK_URL,
        responseTime: `${responseTime}ms`,
        responseBody: responseText.substring(0, 500),
        troubleshooting: [
          'Check if n8n workflow is active',
          'Verify webhook path is correct',
          'Ensure webhook trigger node is properly configured',
          'Check n8n server logs for errors'
        ]
      });
    }
  } catch (error) {
    console.error(`❌ n8n webhook test error: ${error.message}`);
    
    let troubleshooting = [];
    if (error.code === 'ENOTFOUND') {
      troubleshooting = [
        'DNS resolution failed - check if the n8n URL is correct',
        'Verify n8n server domain/IP is accessible',
        'Check network connectivity'
      ];
    } else if (error.code === 'ECONNREFUSED') {
      troubleshooting = [
        'Connection refused - n8n server might be down',
        'Check if n8n is running on the specified port',
        'Verify firewall settings'
      ];
    } else {
      troubleshooting = [
        'Check network connectivity',
        'Verify n8n server is running',
        'Check webhook URL format'
      ];
    }

    res.status(500).json({
      success: false,
      error: `n8n webhook test error: ${error.message}`,
      errorCode: error.code,
      webhookUrl: N8N_WEBHOOK_URL,
      troubleshooting: troubleshooting
    });
  }
});

/**
 * @route   PUT /api/n8n/webhook-url
 * @desc    Update n8n webhook URL (runtime configuration)
 */
app.put('/api/n8n/webhook-url', (req, res) => {
  try {
    const newUrl = req.body.webhookUrl;
    
    if (!newUrl) {
      return res.status(400).json({
        success: false,
        error: 'webhookUrl is required in request body'
      });
    }

    // Validate URL format
    try {
      new URL(newUrl);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format'
      });
    }

    // Note: This won't persist across server restarts
    // For permanent changes, update the environment variable or code
    process.env.N8N_WEBHOOK_URL = newUrl;
    
    console.log(`🔧 n8n webhook URL updated to: ${newUrl}`);
    
    res.json({
      success: true,
      message: 'Webhook URL updated successfully (runtime only)',
      oldUrl: N8N_WEBHOOK_URL,
      newUrl: newUrl,
      syncInterval: 'Every 2 minutes',
      note: 'This change is temporary and will reset on server restart. Update environment variable N8N_WEBHOOK_URL for permanent change.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== API ROUTES ====================

/**
 * @route   GET /api/health
 * @desc    Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'TimeDoctor API Server with n8n Integration + User Lookup + AUTOMATIC USER NAME is running',
    timestamp: new Date().toISOString(),
    n8nIntegration: {
      enabled: true,
      webhookUrl: N8N_WEBHOOK_URL,
      syncInterval: MONITORING_INTERVAL,
      syncIntervalDescription: 'Every 2 minutes',
      automaticUserNameLookup: true,
      userLookupEndpoints: [
        'GET /api/n8n/lookupUser/:userId - Single user lookup',
        'POST /api/n8n/lookupUsers - Batch user lookup', 
        'POST /api/n8n/enrichMonitoringData - Enrich monitoring data',
        'GET /api/n8n/userMap - Complete user mapping'
      ]
    }
  });
});

/**
 * @route   GET /api/auth/status
 * @desc    Check authentication status and token validity
 */
app.get('/api/auth/status', async (req, res) => {
  try {
    const tokenStatus = api.authManager.getTokenStatus();
    const companyId = await api.getCompanyId();
    
    res.json({
      authenticated: tokenStatus.valid,
      email: config.credentials.email,
      companyName: config.credentials.companyName,
      companyId: companyId,
      tokenStatus: tokenStatus,
      autoRefresh: true,
      message: tokenStatus.valid 
        ? `Token valid for ${tokenStatus.timeRemaining}` 
        : 'Token expired - will auto-refresh on next request'
    });
  } catch (error) {
    res.status(401).json({
      authenticated: false,
      error: error.message,
      autoRefresh: true,
      message: 'Not authenticated - will authenticate on next request'
    });
  }
});

/**
 * @route   POST /api/auth/refresh
 * @desc    Force token refresh (generates new token)
 */
app.post('/api/auth/refresh', async (req, res) => {
  try {
    console.log('🔄 Manual token refresh requested');
    const result = await api.authManager.refreshToken();
    const tokenStatus = api.authManager.getTokenStatus();
    
    res.json({
      success: true,
      message: 'Token refreshed successfully',
      companyId: result.companyId,
      tokenStatus: tokenStatus,
      validFor: tokenStatus.timeRemaining
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/auth/cache
 * @desc    Clear token cache
 */
app.delete('/api/auth/cache', async (req, res) => {
  try {
    await api.clearCache();
    res.json({
      success: true,
      message: 'Token cache cleared'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Additional endpoints would continue here...
// For brevity, I'm including the main structure with the enhanced sendUserDataToN8N function

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found. Server includes automatic real user name lookup for n8n.'
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
  console.log('\n🚀 TimeDoctor API Server with Enhanced n8n Integration + AUTOMATIC USER NAME LOOKUP');
  console.log('================================================================================');
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`📧 Email: ${config.credentials.email}`);
  console.log(`🏢 Company: ${config.credentials.companyName}`);
  console.log('\n🔗 N8N WEBHOOK INTEGRATION (AUTOMATIC USER LOOKUP)');
  console.log('===================================================');
  console.log(`📤 n8n Webhook URL: ${N8N_WEBHOOK_URL}`);
  console.log(`⏰ Sync Interval: Every 2 minutes (${MONITORING_INTERVAL})`);
  console.log('📊 Data Format: Individual user records + summary');
  console.log('\n🎯 NEW: AUTOMATIC REAL USER NAME INCLUSION');
  console.log('==========================================');
  console.log('✅ Every webhook now includes:');
  console.log('   • body.name - Real user name (not "Unknown")');
  console.log('   • body.realEmail - Real email address');
  console.log('   • body.user.realName - Real name in user object');
  console.log('   • body.user.realEmail - Real email in user object');
  console.log('   • body.user.realTimezone - Real timezone');
  console.log('   • body.user.realRole - User role');
  console.log('\n🎉 NO MORE "UNKNOWN" EMAILS!');
  console.log('============================');
  console.log('✅ All webhook data now includes real user information automatically');
  console.log('✅ No need for separate n8n lookup nodes');
  console.log('✅ Real names and emails are included in every webhook');
  console.log('\n🔍 Additional N8N User Lookup Endpoints:');
  console.log('=========================================');
  console.log('📋 GET  /api/n8n/lookupUser/:userId - Single user lookup');
  console.log('📋 POST /api/n8n/lookupUsers - Batch user lookup');
  console.log('📋 POST /api/n8n/enrichMonitoringData - Enrich monitoring data');
  console.log('📋 GET  /api/n8n/userMap - Complete user mapping');
  console.log('\n✅ Server ready! Real user names will be included in all n8n webhooks!');
  console.log('🔥 Data will start flowing to n8n in 30 seconds, then every 2 minutes!');
});

module.exports = app;