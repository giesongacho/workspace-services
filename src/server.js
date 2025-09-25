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
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.srv470812.hstgr.cloud/webhook-test/workspace-url-n8n';
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
 * Send individual user data to n8n webhook
 * @param {object} userData - Individual user monitoring data
 * @returns {Promise<boolean>} Success status
 */
async function sendUserDataToN8N(userData) {
  try {
    const n8nPayload = {
      timestamp: new Date().toISOString(),
      source: 'timekeeper-workspace-services',
      type: 'user_monitoring',
      user: {
        userId: userData.userId,
        deviceName: userData.userInfo?.name || 'Unknown Device',
        email: userData.userInfo?.email || 'Unknown',
        timezone: userData.userInfo?.timezone || 'Unknown',
        lastSeen: userData.userInfo?.lastSeenGlobal,
        deviceInfo: userData.userInfo?.deviceInfo || {}
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

    console.log(`📤 Sending data to n8n for user: ${userData.userInfo?.name || userData.userId}`);
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
      console.log(`✅ Successfully sent data to n8n for user: ${userData.userInfo?.name || userData.userId}`);
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
        'Monitoring data enrichment'
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
      timestamp: new Date().toISOString(),
      source: 'timekeeper-workspace-services',
      type: 'connectivity_test',
      message: 'This is a test from Workspace Services',
      testData: {
        serverPort: PORT,
        environment: config.isDevelopment ? 'development' : 'production',
        testId: Math.random().toString(36).substring(7),
        syncInterval: 'Every 2 minutes'
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
        message: 'n8n webhook test successful',
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
    message: 'TimeDoctor API Server with n8n Integration + User Lookup is running',
    timestamp: new Date().toISOString(),
    n8nIntegration: {
      enabled: true,
      webhookUrl: N8N_WEBHOOK_URL,
      syncInterval: MONITORING_INTERVAL,
      syncIntervalDescription: 'Every 2 minutes',
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

// ==================== COMPREHENSIVE MONITORING ENDPOINTS ====================

/**
 * @route   GET /api/monitorUser/:userId
 * @desc    COMPREHENSIVE USER MONITORING - Get complete monitoring data for a user
 * @param   userId - User ID to monitor
 * @query   from, to - Date range (YYYY-MM-DD)
 * @query   includeScreenshots - Include actual screenshot images (true/false)
 * 
 * **LEGAL WARNING**: Ensure you have proper employee consent and legal compliance before using this endpoint.
 * This endpoint collects comprehensive monitoring data including:
 * - Time tracking and activity logs
 * - Screenshots (if enabled)
 * - Productivity statistics
 * - Computer/device information
 * - Disconnection events
 * - Application usage patterns
 */
app.get('/api/monitorUser/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const includeScreenshots = req.query.includeScreenshots === 'true';
    
    // Ensure we have a valid user ID
    if (!userId || userId === 'undefined') {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    console.log(`🕵️ COMPREHENSIVE MONITORING requested for user: ${userId}`);
    console.log(`📅 Date range: ${req.query.from || 'last 7 days'} to ${req.query.to || 'today'}`);
    console.log(`📸 Include screenshots: ${includeScreenshots}`);
    console.log(`⚖️ LEGAL NOTICE: Ensure proper employee consent and legal compliance`);
    
    const monitoringData = await api.getCompleteUserMonitoring(userId, {
      ...req.query,
      includeScreenshotImages: includeScreenshots
    });
    
    res.json({
      success: true,
      message: `Complete monitoring data for user ${userId}`,
      legalNotice: "Ensure proper employee consent and legal compliance before using monitoring data",
      privacyWarning: includeScreenshots ? "Screenshots contain sensitive visual data - handle with extreme care" : null,
      data: monitoringData
    });
  } catch (error) {
    console.error(`❌ Monitoring error for user ${req.params.userId}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to retrieve monitoring data'
    });
  }
});

/**
 * @route   GET /api/monitorAllUsers
 * @desc    MONITOR ALL USERS - Get comprehensive monitoring data for all users in company
 * @query   from, to - Date range (YYYY-MM-DD)
 * @query   includeScreenshots - Include actual screenshot images (true/false)
 * 
 * **LEGAL WARNING**: Ensure you have proper consent from ALL employees and legal compliance.
 * This endpoint monitors ALL users and collects comprehensive data for each employee.
 */
app.get('/api/monitorAllUsers', async (req, res) => {
  try {
    const includeScreenshots = req.query.includeScreenshots === 'true';
    
    console.log('👥🕵️ COMPREHENSIVE MONITORING requested for ALL USERS');
    console.log(`📅 Date range: ${req.query.from || 'last 7 days'} to ${req.query.to || 'today'}`);
    console.log(`📸 Include screenshots: ${includeScreenshots}`);
    console.log('⚖️ LEGAL NOTICE: Ensure proper consent from ALL employees and legal compliance');
    
    const allMonitoringData = await api.getAllUsersMonitoring({
      ...req.query,
      includeScreenshotImages: includeScreenshots
    });
    
    res.json({
      success: true,
      message: 'Complete monitoring data for all users',
      legalNotice: "Ensure proper consent from ALL employees and legal compliance before using monitoring data",
      privacyWarning: includeScreenshots ? "Screenshots contain sensitive visual data - handle with extreme care" : null,
      ...allMonitoringData
    });
  } catch (error) {
    console.error('❌ Error monitoring all users:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to retrieve monitoring data for all users'
    });
  }
});

/**
 * @route   GET /api/getScreenshotsWithImages/:userId
 * @desc    Get screenshots WITH actual image data for a specific user
 * @param   userId - User ID
 * @query   from, to - Date range
 * 
 * **EXTREME PRIVACY WARNING**: This endpoint returns actual screenshot images
 * showing everything on the user's screen. This is highly invasive monitoring.
 */
app.get('/api/getScreenshotsWithImages/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    if (!userId || userId === 'undefined') {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    console.log(`📸 SCREENSHOT IMAGES requested for user: ${userId}`);
    console.log(`⚖️ EXTREME PRIVACY WARNING: Actual screenshot images being retrieved`);
    
    const screenshotsWithImages = await api.getScreenshotsWithImages(userId, req.query);
    
    res.json({
      success: true,
      message: `Screenshot images for user ${userId}`,
      legalNotice: "EXTREME PRIVACY WARNING: These are actual screenshots of user's screen",
      privacyWarning: "Handle screenshot images with extreme care - contains sensitive visual data",
      data: screenshotsWithImages
    });
  } catch (error) {
    console.error(`❌ Error getting screenshots for user ${req.params.userId}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/userActivitySummary/:userId
 * @desc    Get simplified activity summary for a user (less invasive than full monitoring)
 * @param   userId - User ID
 * @query   from, to - Date range
 */
app.get('/api/userActivitySummary/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    if (!userId || userId === 'undefined') {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    console.log(`📊 Activity summary requested for user: ${userId}`);
    
    // Get basic activity data (less invasive than full monitoring)
    const [activityWorklog, timeUseStats] = await Promise.allSettled([
      api.getActivityWorklog({ ...req.query, user: userId }),
      api.timeuseStats({ ...req.query, user: userId })
    ]);

    const summary = {
      userId: userId,
      dateRange: {
        from: req.query.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        to: req.query.to || new Date().toISOString().split('T')[0]
      },
      activityData: {
        status: activityWorklog.status === 'fulfilled' ? 'success' : 'error',
        recordCount: activityWorklog.value?.data?.length || 0,
        hasData: (activityWorklog.value?.data?.length || 0) > 0
      },
      productivityStats: {
        status: timeUseStats.status === 'fulfilled' ? 'success' : 'error',
        data: timeUseStats.value || null
      },
      generatedAt: new Date().toISOString()
    };
    
    res.json({
      success: true,
      message: `Activity summary for user ${userId}`,
      data: summary
    });
  } catch (error) {
    console.error(`❌ Error getting activity summary for user ${req.params.userId}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== USER ENDPOINTS ====================

/**
 * @route   GET /api/getUsers
 * @desc    Get all users with optional filters
 * @query   limit, page, filter[email], filter[name], filter[role], sort
 */
app.get('/api/getUsers', async (req, res) => {
  try {
    const users = await api.getUsers(req.query);
    res.json({
      success: true,
      count: users.data?.length || 0,
      data: users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/getManagedUsers
 * @desc    Get managed users (users that the authenticated user can manage)
 * @query   limit, page
 */
app.get('/api/getManagedUsers', async (req, res) => {
  try {
    const users = await api.getManagedUsers(req.query);
    res.json({
      success: true,
      count: users.data?.length || 0,
      data: users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/getUser/:userId
 * @desc    Get specific user by ID
 */
app.get('/api/getUser/:userId', async (req, res) => {
  try {
    const user = await api.getUser(req.params.userId);
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(error.message.includes('Not Found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/putUser/:userId
 * @desc    Update specific user by ID
 */
app.put('/api/putUser/:userId', async (req, res) => {
  try {
    const user = await api.putUser(req.params.userId, req.body);
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(error.message.includes('Not Found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/deleteUser/:userId
 * @desc    Delete specific user by ID
 */
app.delete('/api/deleteUser/:userId', async (req, res) => {
  try {
    const result = await api.deleteUser(req.params.userId);
    res.json({
      success: true,
      data: result,
      message: `User ${req.params.userId} deleted successfully`
    });
  } catch (error) {
    res.status(error.message.includes('Not Found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/invite
 * @desc    Invite a user to the company
 */
app.post('/api/invite', async (req, res) => {
  try {
    const result = await api.invite(req.body);
    res.json({
      success: true,
      data: result,
      message: 'User invitation sent successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/getUserActivity/:userId
 * @desc    Get user activity/stats
 * @query   from, to
 */
app.get('/api/getUserActivity/:userId', async (req, res) => {
  try {
    const activity = await api.getUserActivity(req.params.userId, req.query);
    res.json({
      success: true,
      data: activity
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== TASK ENDPOINTS ====================

/**
 * @route   GET /api/getTasks
 * @desc    Get all tasks
 * @query   limit, page, project
 */
app.get('/api/getTasks', async (req, res) => {
  try {
    const tasks = await api.getTasks(req.query);
    res.json({
      success: true,
      count: tasks.data?.length || 0,
      data: tasks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/tasks
 * @desc    Get all tasks (alias endpoint)
 * @query   limit, page, project
 */
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await api.tasks(req.query);
    res.json({
      success: true,
      count: tasks.data?.length || 0,
      data: tasks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/newTask
 * @desc    Create a new task
 */
app.post('/api/newTask', async (req, res) => {
  try {
    const task = await api.newTask(req.body);
    res.json({
      success: true,
      data: task,
      message: 'Task created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/task/:taskId
 * @desc    Get specific task by ID
 */
app.get('/api/task/:taskId', async (req, res) => {
  try {
    const task = await api.task(req.params.taskId);
    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    res.status(error.message.includes('Not Found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== ACTIVITY ENDPOINTS ====================

/**
 * @route   GET /api/getActivityWorklog
 * @desc    Get activity worklog
 * @query   from, to, user, project, limit
 */
app.get('/api/getActivityWorklog', async (req, res) => {
  try {
    const worklog = await api.getActivityWorklog(req.query);
    res.json({
      success: true,
      count: worklog.data?.length || 0,
      data: worklog
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/getActivityTimeuse
 * @desc    Get activity timeuse
 * @query   from, to, user, project, limit
 */
app.get('/api/getActivityTimeuse', async (req, res) => {
  try {
    const timeuse = await api.getActivityTimeuse(req.query);
    res.json({
      success: true,
      count: timeuse.data?.length || 0,
      data: timeuse
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/timeuseStats
 * @desc    Get timeuse statistics
 * @query   from, to, user, project
 */
app.get('/api/timeuseStats', async (req, res) => {
  try {
    const stats = await api.timeuseStats(req.query);
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/getActivityEditTime
 * @desc    Get activity edit time
 * @query   from, to, user, project, limit
 */
app.get('/api/getActivityEditTime', async (req, res) => {
  try {
    const editTime = await api.getActivityEditTime(req.query);
    res.json({
      success: true,
      count: editTime.data?.length || 0,
      data: editTime
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/postActivityEditTime
 * @desc    Post activity edit time
 */
app.post('/api/postActivityEditTime', async (req, res) => {
  try {
    const result = await api.postActivityEditTime(req.body);
    res.json({
      success: true,
      data: result,
      message: 'Activity edit time posted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/putBulkEditTime
 * @desc    Bulk edit time update
 */
app.put('/api/putBulkEditTime', async (req, res) => {
  try {
    const result = await api.putBulkEditTime(req.body);
    res.json({
      success: true,
      data: result,
      message: 'Bulk edit time updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/putActivityEditTime/:editTimeId
 * @desc    Update specific activity edit time
 */
app.put('/api/putActivityEditTime/:editTimeId', async (req, res) => {
  try {
    const result = await api.putActivityEditTime(req.params.editTimeId, req.body);
    res.json({
      success: true,
      data: result,
      message: `Activity edit time ${req.params.editTimeId} updated successfully`
    });
  } catch (error) {
    res.status(error.message.includes('Not Found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/getDisconnectivity
 * @desc    Get disconnectivity data
 * @query   from, to, user, limit
 */
app.get('/api/getDisconnectivity', async (req, res) => {
  try {
    const disconnectivity = await api.getDisconnectivity(req.query);
    res.json({
      success: true,
      count: disconnectivity.data?.length || 0,
      data: disconnectivity
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/stats1_total
 * @desc    Get total statistics
 * @query   from, to, user
 */
app.get('/api/stats1_total', async (req, res) => {
  try {
    const stats = await api.stats1_total(req.query);
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== FILE ENDPOINTS ====================

/**
 * @route   GET /api/getFiles
 * @desc    Get files
 * @query   limit, page, type
 */
app.get('/api/getFiles', async (req, res) => {
  try {
    const files = await api.getFiles(req.query);
    res.json({
      success: true,
      count: files.data?.length || 0,
      data: files
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/deleteFiles
 * @desc    Delete multiple files
 * @body    { files: [fileId1, fileId2, ...] }
 */
app.delete('/api/deleteFiles', async (req, res) => {
  try {
    const result = await api.deleteFiles(req.body.files || req.body);
    res.json({
      success: true,
      data: result,
      message: 'Files deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/getTypeFiles/:fileType
 * @desc    Get files by type
 * @query   limit, page
 */
app.get('/api/getTypeFiles/:fileType', async (req, res) => {
  try {
    const files = await api.getTypeFiles(req.params.fileType, req.query);
    res.json({
      success: true,
      count: files.data?.length || 0,
      data: files
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/getSignedUrl
 * @desc    Get signed URL for file upload
 * @query   filename, contentType
 */
app.get('/api/getSignedUrl', async (req, res) => {
  try {
    const signedUrl = await api.getSignedUrl(req.query);
    res.json({
      success: true,
      data: signedUrl
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/putFile/:fileId
 * @desc    Upload/Put file
 */
app.put('/api/putFile/:fileId', async (req, res) => {
  try {
    const result = await api.putFile(req.params.fileId, req.body);
    res.json({
      success: true,
      data: result,
      message: `File ${req.params.fileId} uploaded successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/deleteFile/:fileId
 * @desc    Delete a specific file
 */
app.delete('/api/deleteFile/:fileId', async (req, res) => {
  try {
    const result = await api.deleteFile(req.params.fileId);
    res.json({
      success: true,
      data: result,
      message: `File ${req.params.fileId} deleted successfully`
    });
  } catch (error) {
    res.status(error.message.includes('Not Found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== PROJECT & TIME TRACKING ENDPOINTS ====================

/**
 * @route   GET /api/getProjects
 * @desc    Get all projects
 * @query   limit, page
 */
app.get('/api/getProjects', async (req, res) => {
  try {
    const projects = await api.getProjects(req.query);
    res.json({
      success: true,
      count: projects.data?.length || 0,
      data: projects
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/getWorkLogs
 * @desc    Get work logs
 * @query   from, to, user, project, limit
 */
app.get('/api/getWorkLogs', async (req, res) => {
  try {
    const workLogs = await api.getWorkLogs(req.query);
    res.json({
      success: true,
      count: workLogs.data?.length || 0,
      data: workLogs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/getTimeTracking
 * @desc    Get time tracking data
 * @query   from, to, user, project
 */
app.get('/api/getTimeTracking', async (req, res) => {
  try {
    const timeTracking = await api.getTimeTracking(req.query);
    res.json({
      success: true,
      data: timeTracking
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/getScreenshots
 * @desc    Get screenshots (metadata only, no actual images)
 * @query   from, to, user, limit
 */
app.get('/api/getScreenshots', async (req, res) => {
  try {
    const screenshots = await api.getScreenshots(req.query);
    res.json({
      success: true,
      count: screenshots.data?.length || 0,
      data: screenshots
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== ADVANCED ENDPOINTS ====================

/**
 * @route   POST /api/users/filter
 * @desc    Advanced user filtering with body parameters
 * @body    Complex filter object
 */
app.post('/api/users/filter', async (req, res) => {
  try {
    const users = await api.getUsers(req.body);
    res.json({
      success: true,
      count: users.data?.length || 0,
      data: users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/summary/daily
 * @desc    Get daily summary for a specific date
 * @query   date (YYYY-MM-DD), user
 */
app.get('/api/summary/daily', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const params = {
      from: date,
      to: date,
      ...req.query
    };
    
    const [workLogs, timeTracking] = await Promise.all([
      api.getWorkLogs(params),
      api.getTimeTracking(params)
    ]);
    
    res.json({
      success: true,
      date: date,
      data: {
        workLogs: workLogs.data || [],
        timeTracking: timeTracking.data || []
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/summary/weekly
 * @desc    Get weekly summary
 * @query   from, to, user
 */
app.get('/api/summary/weekly', async (req, res) => {
  try {
    const to = req.query.to || new Date().toISOString().split('T')[0];
    const from = req.query.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const params = {
      from,
      to,
      ...req.query
    };
    
    const [workLogs, timeTracking] = await Promise.all([
      api.getWorkLogs(params),
      api.getTimeTracking(params)
    ]);
    
    res.json({
      success: true,
      period: { from, to },
      data: {
        workLogs: workLogs.data || [],
        timeTracking: timeTracking.data || []
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      // Authentication & Health
      'GET /api/health',
      'GET /api/auth/status',
      'POST /api/auth/refresh',
      'DELETE /api/auth/cache',
      
      // N8N INTEGRATION ENDPOINTS
      'GET /api/n8n/status - n8n integration status',
      'POST /api/n8n/sync - Manual sync all users to n8n',
      'POST /api/n8n/sync-user/:userId - Manual sync specific user to n8n',
      'POST /api/n8n/test - Test n8n webhook connectivity',
      'PUT /api/n8n/webhook-url - Update webhook URL (runtime)',
      
      // N8N USER LOOKUP ENDPOINTS (NEW!)
      'GET /api/n8n/lookupUser/:userId - Single user lookup for "Unknown" emails',
      'POST /api/n8n/lookupUsers - Batch user lookup (body: {userIds: []})',
      'POST /api/n8n/enrichMonitoringData - Enrich monitoring data with real user info',
      'GET /api/n8n/userMap - Complete userId -> userInfo mapping for n8n caching',
      
      // MONITORING ENDPOINTS
      'GET /api/monitorUser/:userId?includeScreenshots=true - COMPREHENSIVE USER MONITORING WITH IMAGES',
      'GET /api/monitorAllUsers?includeScreenshots=true - MONITOR ALL USERS WITH IMAGES',
      'GET /api/getScreenshotsWithImages/:userId - SCREENSHOT IMAGES ONLY',
      'GET /api/userActivitySummary/:userId - Simple activity summary',
      
      // User Endpoints
      'GET /api/getUsers',
      'GET /api/getManagedUsers',
      'GET /api/getUser/:userId',
      'PUT /api/putUser/:userId',
      'DELETE /api/deleteUser/:userId',
      'POST /api/invite',
      'GET /api/getUserActivity/:userId',
      
      // Task Endpoints
      'GET /api/getTasks',
      'GET /api/tasks',
      'POST /api/newTask',
      'GET /api/task/:taskId',
      
      // Activity Endpoints
      'GET /api/getActivityWorklog',
      'GET /api/getActivityTimeuse',
      'GET /api/timeuseStats',
      'GET /api/getActivityEditTime',
      'POST /api/postActivityEditTime',
      'PUT /api/putBulkEditTime',
      'PUT /api/putActivityEditTime/:editTimeId',
      'GET /api/getDisconnectivity',
      'GET /api/stats1_total',
      
      // File Endpoints
      'GET /api/getFiles',
      'DELETE /api/deleteFiles',
      'GET /api/getTypeFiles/:fileType',
      'GET /api/getSignedUrl',
      'PUT /api/putFile/:fileId',
      'DELETE /api/deleteFile/:fileId',
      
      // Project & Time Tracking
      'GET /api/getProjects',
      'GET /api/getWorkLogs',
      'GET /api/getTimeTracking',
      'GET /api/getScreenshots',
      
      // Advanced Endpoints
      'POST /api/users/filter',
      'GET /api/summary/daily',
      'GET /api/summary/weekly'
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
  console.log('\n🚀 TimeDoctor API Server with Enhanced n8n Integration + User Lookup');
  console.log('=========================================================================');
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`📧 Email: ${config.credentials.email}`);
  console.log(`🏢 Company: ${config.credentials.companyName}`);
  console.log('\n🔗 N8N WEBHOOK INTEGRATION (FAST SYNC)');
  console.log('=======================================');
  console.log(`📤 n8n Webhook URL: ${N8N_WEBHOOK_URL}`);
  console.log(`⏰ Sync Interval: Every 2 minutes (${MONITORING_INTERVAL})`);
  console.log(`⚡ Faster Updates: More frequent monitoring (changed from 5 minutes)`);
  console.log('📊 Data Format: Individual user records + summary');
  console.log('\n🔍 NEW: N8N USER LOOKUP ENDPOINTS');
  console.log('==================================');
  console.log('📋 GET  /api/n8n/lookupUser/:userId - Single user lookup');
  console.log('📋 POST /api/n8n/lookupUsers - Batch user lookup');
  console.log('📋 POST /api/n8n/enrichMonitoringData - Enrich monitoring data');
  console.log('📋 GET  /api/n8n/userMap - Complete user mapping');
  console.log('\n💡 USER LOOKUP USAGE:');
  console.log('  1️⃣ Single lookup: GET /api/n8n/lookupUser/aLfYIu7-TthUmwrm');
  console.log('  2️⃣ Batch lookup: POST /api/n8n/lookupUsers {userIds: ["id1","id2"]}');
  console.log('  3️⃣ Enrich data: POST /api/n8n/enrichMonitoringData {monitoring data}');
  console.log('  4️⃣ Cache map: GET /api/n8n/userMap (cache in n8n for fast lookups)');
  console.log('\n🔧 n8n Troubleshooting Endpoints:');
  console.log('  📋 GET  /api/n8n/status - Integration status');
  console.log('  🔄 POST /api/n8n/sync - Manual sync all users');
  console.log('  👤 POST /api/n8n/sync-user/:userId - Manual sync specific user');
  console.log('  🧪 POST /api/n8n/test - Test webhook connectivity (ENHANCED)');
  console.log('  🔧 PUT  /api/n8n/webhook-url - Update webhook URL');
  console.log('\n🎯 Enhanced Features:');
  console.log('  ⚡ FASTER SYNC: Every 2 minutes instead of 5 minutes');
  console.log('  🔍 USER LOOKUP: Resolve "Unknown" emails to real user data');
  console.log('  📦 BATCH PROCESSING: Lookup multiple users at once');
  console.log('  🚀 ENRICHMENT: Transform monitoring data with real names/emails');
  console.log('  🗺️ USER MAPPING: Complete userId -> userInfo lookup table');
  console.log('  ✅ Reduced delay between user requests (500ms vs 1000ms)');
  console.log('  ✅ Detailed error logging and diagnostics');
  console.log('\n🔥 SOLUTION FOR "UNKNOWN" EMAILS:');
  console.log(`   curl http://localhost:${PORT}/api/n8n/lookupUser/aLfYIu7-TthUmwrm`);
  console.log('   → Returns: realName, realEmail, timezone, role, status');
  console.log('\n✅ Server ready! Test user lookup immediately with:');
  console.log(`   curl http://localhost:${PORT}/api/n8n/lookupUser/YOUR_USER_ID`);
  console.log('\n🔥 Data will start flowing to n8n in 30 seconds, then every 2 minutes!');
});

module.exports = app;