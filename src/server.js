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
 * @desc    Get screenshots
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
  console.log('\n🚀 TimeDoctor API Server');
  console.log('========================');
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`📧 Email: ${config.credentials.email}`);
  console.log(`🏢 Company: ${config.credentials.companyName}`);
  console.log('\n✨ Features:');
  console.log('  ✅ Automatic token refresh when expired');
  console.log('  ✅ Token caching for better performance');
  console.log('  ✅ Auto-retry on authentication failures');
  console.log('  ✅ Complete TimeDoctor API coverage');
  console.log('\n📚 Available endpoints:');
  console.log('  - GET  /api/health');
  console.log('  - GET  /api/auth/status (check token validity)');
  console.log('  - POST /api/auth/refresh (force new token)');
  console.log('  🧑‍💼 User Management:');
  console.log('    - GET  /api/getUsers');
  console.log('    - GET  /api/getManagedUsers');
  console.log('    - GET  /api/getUser/:userId');
  console.log('    - PUT  /api/putUser/:userId');
  console.log('    - DELETE /api/deleteUser/:userId');
  console.log('    - POST /api/invite');
  console.log('  📋 Task Management:');
  console.log('    - GET  /api/getTasks');
  console.log('    - GET  /api/tasks');
  console.log('    - POST /api/newTask');
  console.log('    - GET  /api/task/:taskId');
  console.log('  📊 Activity & Analytics:');
  console.log('    - GET  /api/getActivityWorklog');
  console.log('    - GET  /api/getActivityTimeuse');
  console.log('    - GET  /api/timeuseStats');
  console.log('    - GET  /api/getDisconnectivity');
  console.log('    - GET  /api/stats1_total');
  console.log('  📁 File Management:');
  console.log('    - GET  /api/getFiles');
  console.log('    - DELETE /api/deleteFiles');
  console.log('    - GET  /api/getTypeFiles/:fileType');
  console.log('    - PUT  /api/putFile/:fileId');
  console.log('    - DELETE /api/deleteFile/:fileId');
  console.log('  ⏱️  Time Tracking:');
  console.log('    - GET  /api/getWorkLogs');
  console.log('    - GET  /api/getScreenshots');
  console.log('    - GET  /api/getTimeTracking');
  console.log('\n✅ Server is ready to accept requests!');
  console.log('🔄 Tokens will automatically refresh when expired\n');
});

module.exports = app;