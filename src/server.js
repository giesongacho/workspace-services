const express = require('express');
const cors = require('cors');
const TimeDoctorAPI = require('./api');
const config = require('./config');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

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

// ==================== API ROUTES ====================

/**
 * @route   GET /api/health
 * @desc    Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'TimeDoctor API Server is running',
    timestamp: new Date().toISOString()
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

// ==================== USER ENDPOINTS ====================

/**
 * @route   GET /api/getUsers
 * @desc    Get all users with optional filters
 * @query   limit, page, filter[email], filter[name], filter[role], sort
 */
app.get('/api/getUsers', async (req, res) => {
  try {
    // Token will auto-refresh if expired
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
 * @route   GET /api/getUser/:userId
 * @desc    Get specific user by ID
 */
app.get('/api/getUser/:userId', async (req, res) => {
  try {
    // Token will auto-refresh if expired
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
 * @route   GET /api/getUserActivity/:userId
 * @desc    Get user activity/stats
 * @query   from, to
 */
app.get('/api/getUserActivity/:userId', async (req, res) => {
  try {
    // Token will auto-refresh if expired
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

// ==================== PROJECT & TASK ENDPOINTS ====================

/**
 * @route   GET /api/getProjects
 * @desc    Get all projects
 * @query   limit, page
 */
app.get('/api/getProjects', async (req, res) => {
  try {
    // Token will auto-refresh if expired
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
 * @route   GET /api/getTasks
 * @desc    Get all tasks
 * @query   limit, page, project
 */
app.get('/api/getTasks', async (req, res) => {
  try {
    // Token will auto-refresh if expired
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


// ==================== TIME TRACKING ENDPOINTS ====================

/**
 * @route   GET /api/getWorkLogs
 * @desc    Get work logs
 * @query   from, to, user, project, limit
 */
app.get('/api/getWorkLogs', async (req, res) => {
  try {
    // Token will auto-refresh if expired
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
    // Token will auto-refresh if expired
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
 * @desc    Get screenshots
 * @query   from, to, user, limit
 */
app.get('/api/getScreenshots', async (req, res) => {
  try {
    // Token will auto-refresh if expired
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
    // Token will auto-refresh if expired
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
    
    // Token will auto-refresh if expired
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
    
    // Token will auto-refresh if expired
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
      'GET /api/health',
      'GET /api/auth/status',
      'POST /api/auth/refresh',
      'DELETE /api/auth/cache',
      'GET /api/getUsers',
      'GET /api/getUser/:userId',
      'GET /api/getUserActivity/:userId',
      'GET /api/getProjects',
      'GET /api/getTasks',
      'GET /api/getWorkLogs',
      'GET /api/getTimeTracking',
      'GET /api/getScreenshots',
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
  console.log('\n🚀 TimeDoctor API Server');
  console.log('========================');
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`📧 Email: ${config.credentials.email}`);
  console.log(`🏢 Company: ${config.credentials.companyName}`);
  console.log('\n✨ Features:');
  console.log('  ✅ Automatic token refresh when expired');
  console.log('  ✅ Token caching for better performance');
  console.log('  ✅ Auto-retry on authentication failures');
  console.log('\n📚 Available endpoints:');
  console.log('  - GET  /api/health');
  console.log('  - GET  /api/auth/status (check token validity)');
  console.log('  - POST /api/auth/refresh (force new token)');
  console.log('  - GET  /api/getUsers');
  console.log('  - GET  /api/getUser/:userId');
  console.log('  - GET  /api/getProjects');
  console.log('  - GET  /api/getTasks');
  console.log('  - GET  /api/getWorkLogs');
  console.log('  - GET  /api/getScreenshots');
  console.log('  - GET  /api/getTimeTracking');
  console.log('\n✅ Server is ready to accept requests!');
  console.log('🔄 Tokens will automatically refresh when expired\n');
});

module.exports = app;