const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const fetch = require('node-fetch');
const TimeDoctorAPI = require('./api');
const config = require('./config');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// N8N Webhook Configuration
const N8N_WEBHOOK_URL = 'https://n8n.srv470812.hstgr.cloud/webhook/workspace-url-n8n';
const MONITORING_INTERVAL = '*/5 * * * *'; // Every 5 minutes

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
    
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Workspace-Services-Monitor/1.0'
      },
      body: JSON.stringify(n8nPayload)
    });

    if (response.ok) {
      console.log(`✅ Successfully sent data to n8n for user: ${userData.userInfo?.name || userData.userId}`);
      return true;
    } else {
      console.error(`❌ Failed to send data to n8n for user ${userData.userId}: ${response.status} ${response.statusText}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error sending data to n8n for user ${userData.userId}:`, error.message);
    return false;
  }
}

/**
 * Collect all user monitoring data and send to n8n (each user separately)
 */
async function syncAllUsersToN8N() {
  try {
    console.log('\n🔄 Starting automated n8n sync for all users...');
    
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
      await new Promise(resolve => setTimeout(resolve, 1000));
      
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

    await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Workspace-Services-Monitor/1.0'
      },
      body: JSON.stringify(summaryPayload)
    });

    console.log(`✅ n8n sync completed: ${successCount} users successful, ${errorCount} errors`);
    
  } catch (error) {
    console.error('❌ Error during n8n sync:', error.message);
  }
}

// ==================== N8N SCHEDULER ====================

// Schedule automatic sync every 5 minutes
console.log('⏰ Setting up n8n sync scheduler (every 5 minutes)...');
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
      syncInterval: MONITORING_INTERVAL
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
      syncIntervalDescription: 'Every 5 minutes',
      schedulerActive: true,
      lastSyncTime: 'Check server logs for sync times',
      dataFormat: 'Individual user records + summary',
      features: [
        'Automated user monitoring data sync',
        'Individual user data separation',
        'Device name identification', 
        'Activity tracking details',
        'Screenshot metadata',
        'Productivity statistics',
        'Manual sync triggers'
      ]
    }
  });
});

/**
 * @route   POST /api/n8n/test
 * @desc    Test n8n webhook connectivity
 */
app.post('/api/n8n/test', async (req, res) => {
  try {
    const testPayload = {
      timestamp: new Date().toISOString(),
      source: 'timekeeper-workspace-services',
      type: 'connectivity_test',
      message: 'This is a test from Workspace Services',
      serverInfo: {
        port: PORT,
        environment: config.isDevelopment ? 'development' : 'production'
      }
    };

    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Workspace-Services-Monitor/1.0'
      },
      body: JSON.stringify(testPayload)
    });

    if (response.ok) {
      res.json({
        success: true,
        message: 'n8n webhook test successful',
        webhookUrl: N8N_WEBHOOK_URL,
        responseStatus: response.status,
        responseStatusText: response.statusText
      });
    } else {
      res.status(response.status).json({
        success: false,
        error: `n8n webhook test failed: ${response.status} ${response.statusText}`,
        webhookUrl: N8N_WEBHOOK_URL
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `n8n webhook test error: ${error.message}`,
      webhookUrl: N8N_WEBHOOK_URL
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
    message: 'TimeDoctor API Server with n8n Integration is running',
    timestamp: new Date().toISOString(),
    n8nIntegration: {
      enabled: true,
      webhookUrl: N8N_WEBHOOK_URL,
      syncInterval: MONITORING_INTERVAL
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
      
      // N8N INTEGRATION ENDPOINTS (NEW)
      'GET /api/n8n/status - n8n integration status',
      'POST /api/n8n/sync - Manual sync all users to n8n',
      'POST /api/n8n/sync-user/:userId - Manual sync specific user to n8n',
      'POST /api/n8n/test - Test n8n webhook connectivity',
      
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
  console.log('\n🚀 TimeDoctor API Server with n8n Integration & User Monitoring');
  console.log('==================================================================');
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`📧 Email: ${config.credentials.email}`);
  console.log(`🏢 Company: ${config.credentials.companyName}`);
  console.log('\n🔗 N8N WEBHOOK INTEGRATION');
  console.log('============================');
  console.log(`📤 n8n Webhook URL: ${N8N_WEBHOOK_URL}`);
  console.log(`⏰ Sync Interval: Every 5 minutes (${MONITORING_INTERVAL})`);
  console.log('📊 Data Format: Individual user records + summary');
  console.log('🎯 Features:');
  console.log('  ✅ Automatic user monitoring data sync every 5 minutes');
  console.log('  ✅ Each user data sent separately for individual tracking');
  console.log('  ✅ Computer/device name identification');
  console.log('  ✅ Activity, screenshots, productivity stats');
  console.log('  ✅ Manual sync triggers via API');
  console.log('  ✅ Webhook connectivity testing');
  console.log('\n🔧 n8n Endpoints:');
  console.log('  📋 GET  /api/n8n/status - Integration status');
  console.log('  🔄 POST /api/n8n/sync - Manual sync all users');
  console.log('  👤 POST /api/n8n/sync-user/:userId - Manual sync specific user');
  console.log('  🧪 POST /api/n8n/test - Test webhook connectivity');
  console.log('\n⚖️ CRITICAL LEGAL NOTICE: SCREENSHOT MONITORING COMPLIANCE');
  console.log('============================================================');
  console.log('🚨 EXTREME PRIVACY WARNING: Screenshot monitoring is highly invasive');
  console.log('⚠️ WARNING: Before using screenshot endpoints, ensure:');
  console.log('  ✓ EXPLICIT written consent for screenshot monitoring obtained');
  console.log('  ✓ Local privacy laws compliance verified (GDPR, CCPA, etc.)');
  console.log('  ✓ Screenshot retention and deletion policies established');
  console.log('  ✓ Secure storage and encryption for screenshot data');
  console.log('  ✓ Clear business justification documented');
  console.log('  ✓ Employee access rights to their screenshot data provided');
  console.log('  ✓ Regular audits of screenshot access and usage');
  console.log('\n✨ Additional Features:');
  console.log('  ✅ Automatic token refresh when expired');
  console.log('  ✅ Token caching for better performance');
  console.log('  ✅ Auto-retry on authentication failures');
  console.log('  ✅ Complete TimeDoctor API coverage');
  console.log('  🕵️ COMPREHENSIVE USER MONITORING');
  console.log('  📸 ACTUAL SCREENSHOT IMAGES (HIGHLY SENSITIVE)');
  console.log('  📊 Activity tracking and analytics');
  console.log('  💻 Computer/device information');
  console.log('  📈 Productivity statistics');
  console.log('\n✅ Server is ready to accept requests!');
  console.log('🔄 Tokens will automatically refresh when expired');
  console.log('📤 n8n sync will run automatically every 5 minutes');
  console.log('🚨 Remember: Screenshots show everything on user screens - handle responsibly!\n');
});

module.exports = app;