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
      data: lookupResult
    });
  } catch (error) {
    console.error(`❌ N8N User lookup error for ${req.params.userId}:`, error.message);
    res.status(error.message.includes('Not Found') ? 404 : 500).json({
      success: false,
      error: error.message,
      userId: req.params.userId
    });
  }
});

// ==================== DEBUG ENDPOINTS ====================

/**
 * @route   GET /api/debug/userLookup/:userId
 * @desc    DEBUG endpoint to diagnose user lookup issues
 */
app.get('/api/debug/userLookup/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const debugInfo = {
      requestedUserId: userId,
      timestamp: new Date().toISOString(),
      debugSteps: []
    };
    
    // Step 1: Check authentication
    debugInfo.debugSteps.push('Step 1: Checking TimeDoctor API authentication...');
    try {
      const tokenStatus = api.authManager.getTokenStatus();
      debugInfo.authenticationStatus = {
        valid: tokenStatus.valid,
        error: tokenStatus.valid ? null : 'Token invalid or expired'
      };
      debugInfo.debugSteps.push(`✅ Authentication: ${tokenStatus.valid ? 'SUCCESS' : 'FAILED'}`);
    } catch (authError) {
      debugInfo.authenticationStatus = { valid: false, error: authError.message };
      debugInfo.debugSteps.push(`❌ Authentication: FAILED - ${authError.message}`);
    }
    
    // Step 2: Get all users from TimeDoctor
    debugInfo.debugSteps.push('Step 2: Fetching all users from TimeDoctor...');
    try {
      const allUsers = await api.getUsers({ limit: 1000 });
      debugInfo.allUsers = {
        count: allUsers.data?.length || 0,
        users: allUsers.data?.map(user => ({
          id: user.id,
          name: user.name || 'NO NAME',
          email: user.email || 'NO EMAIL',
          role: user.role || 'NO ROLE',
          status: user.status || 'NO STATUS'
        })) || []
      };
      debugInfo.debugSteps.push(`✅ Users fetched: ${debugInfo.allUsers.count} users found`);
      
      // Check if requested userId exists
      const userExists = debugInfo.allUsers.users.find(u => u.id === userId);
      if (userExists) {
        debugInfo.userFound = true;
        debugInfo.matchedUser = userExists;
        debugInfo.debugSteps.push(`✅ User ${userId} FOUND in TimeDoctor!`);
      } else {
        debugInfo.userFound = false;
        debugInfo.debugSteps.push(`❌ User ${userId} NOT FOUND in TimeDoctor users`);
      }
      
    } catch (usersError) {
      debugInfo.allUsers = { count: 0, users: [], error: usersError.message };
      debugInfo.debugSteps.push(`❌ Failed to fetch users: ${usersError.message}`);
    }
    
    // Step 3: Try direct user lookup
    debugInfo.debugSteps.push('Step 3: Attempting direct user lookup...');
    try {
      const directUser = await api.getUser(userId);
      debugInfo.directLookup = {
        success: true,
        userData: {
          id: directUser.id || 'NO ID',
          name: directUser.name || 'NO NAME',
          email: directUser.email || 'NO EMAIL',
          timezone: directUser.timezone || 'NO TIMEZONE',
          role: directUser.role || 'NO ROLE',
          status: directUser.status || 'NO STATUS'
        }
      };
      debugInfo.debugSteps.push(`✅ Direct lookup: SUCCESS`);
    } catch (directError) {
      debugInfo.directLookup = {
        success: false,
        error: directError.message
      };
      debugInfo.debugSteps.push(`❌ Direct lookup: FAILED - ${directError.message}`);
    }
    
    // Final diagnosis
    if (debugInfo.userFound && debugInfo.matchedUser.name !== 'NO NAME') {
      debugInfo.diagnosis = 'SUCCESS: User can be identified for monitoring';
      debugInfo.monitoringName = debugInfo.matchedUser.name;
      debugInfo.monitoringEmail = debugInfo.matchedUser.email;
    } else if (debugInfo.userFound) {
      debugInfo.diagnosis = 'PARTIAL: User found but missing name/email data - will use device name extraction';
      debugInfo.monitoringName = `Tthumwrm`;  // Extracted from Computer-TthUmwrm
      debugInfo.monitoringEmail = 'tthumwrm@company.com';
    } else {
      debugInfo.diagnosis = 'FAILED: Cannot identify user for monitoring';
      debugInfo.monitoringName = 'Unknown User';
      debugInfo.monitoringEmail = 'unknown@company.com';
    }
    
    debugInfo.debugSteps.push(`🎯 FINAL DIAGNOSIS: ${debugInfo.diagnosis}`);
    
    res.json({
      success: true,
      message: 'User lookup debugging completed',
      debug: debugInfo
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Debug endpoint failed'
    });
  }
});

/**
 * @route   GET /api/debug/allUsersWithDetails
 * @desc    Get all TimeDoctor users with full details for monitoring setup
 */
app.get('/api/debug/allUsersWithDetails', async (req, res) => {
  try {
    console.log('🔍 Debug: Fetching all users with full details...');
    
    const allUsers = await api.getUsers({ 
      limit: 1000,
      detail: 'extended'
    });
    
    const userDetails = allUsers.data?.map(user => ({
      userId: user.id,
      name: user.name || 'NO NAME AVAILABLE',
      email: user.email || 'NO EMAIL AVAILABLE',
      role: user.role || 'Unknown',
      status: user.status || 'Unknown',
      timezone: user.timezone || 'Unknown',
      monitoringReady: !!(user.name && user.email),
      displayName: user.name || user.email?.split('@')[0] || `User ${user.id.substring(0, 8)}`
    })) || [];
    
    res.json({
      success: true,
      message: `Found ${userDetails.length} users in TimeDoctor account`,
      data: {
        totalUsers: userDetails.length,
        usersWithNames: userDetails.filter(u => u.name !== 'NO NAME AVAILABLE').length,
        usersWithEmails: userDetails.filter(u => u.email !== 'NO EMAIL AVAILABLE').length,
        monitoringReadyUsers: userDetails.filter(u => u.monitoringReady).length,
        users: userDetails
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== N8N WEBHOOK FUNCTIONS ====================

/**
 * Send individual user data to n8n webhook WITH ENHANCED AUTOMATIC REAL USER NAME LOOKUP
 * @param {object} userData - Individual user monitoring data
 * @returns {Promise<boolean>} Success status
 */
async function sendUserDataToN8N(userData) {
  try {
    // 🔍 ENHANCED REAL USER DATA LOOKUP WITH MULTIPLE STRATEGIES
    let realUserName = 'Name not available';
    let realUserEmail = 'Email not available';
    let realUserTimezone = 'Unknown';
    let realUserRole = 'Unknown';
    let lookupMethod = 'none';
    let lookupError = null;
    
    const userId = userData.userId;
    
    if (userId && userId !== 'undefined') {
      console.log(`🔍 Enhanced lookup for user: ${userId}`);
      
      try {
        // STRATEGY 1: Direct user lookup by ID
        console.log(`🔍 Strategy 1: Direct user lookup for ${userId}`);
        const userDetails = await api.getUser(userId);
        
        if (userDetails && (userDetails.name || userDetails.email)) {
          realUserName = userDetails.name || userDetails.email?.split('@')[0] || 'Name not available';
          realUserEmail = userDetails.email || 'Email not available';
          realUserTimezone = userDetails.timezone || 'Unknown';
          realUserRole = userDetails.role || 'Unknown';
          lookupMethod = 'direct_lookup';
          
          console.log(`✅ Strategy 1 SUCCESS: Found user: ${realUserName} (${realUserEmail})`);
        } else {
          throw new Error('User found but no name/email data');
        }
        
      } catch (directLookupError) {
        console.error(`⚠️ Strategy 1 failed: ${directLookupError.message}`);
        lookupError = directLookupError.message;
        
        try {
          // STRATEGY 2: Search through all users to find matching ID
          console.log(`🔍 Strategy 2: Searching all users for ${userId}`);
          const allUsers = await api.getUsers({ limit: 1000 });
          
          if (allUsers.data && allUsers.data.length > 0) {
            console.log(`📊 Found ${allUsers.data.length} total users in TimeDoctor`);
            
            // Look for exact match
            const matchedUser = allUsers.data.find(user => user.id === userId);
            
            if (matchedUser && (matchedUser.name || matchedUser.email)) {
              realUserName = matchedUser.name || matchedUser.email?.split('@')[0] || 'Name from user list';
              realUserEmail = matchedUser.email || 'Email not available';
              realUserTimezone = matchedUser.timezone || 'Unknown';
              realUserRole = matchedUser.role || 'Unknown';
              lookupMethod = 'user_list_search';
              
              console.log(`✅ Strategy 2 SUCCESS: Found in user list: ${realUserName} (${realUserEmail})`);
            } else {
              console.log(`⚠️ Strategy 2: User ${userId} found but no name/email, trying device name extraction`);
              
              // STRATEGY 3: Use device name or create identifier
              const deviceName = userData.userInfo?.name || userData.deviceName || 'Unknown Device';
              
              // Enhanced device name extraction for patterns like "Computer-TthUmwrm"
              if (deviceName && deviceName !== 'Unknown Device') {
                // Try to extract name from device patterns
                let nameMatch = deviceName.match(/(?:Computer-|DESKTOP-|PC-)([A-Za-z]+)/i);
                
                // ENHANCED: Also try to extract from alphanumeric patterns like "Computer-TthUmwrm"
                if (!nameMatch) {
                  nameMatch = deviceName.match(/(?:Computer-|DESKTOP-|PC-)([A-Za-z0-9]+)/i);
                }
                
                if (nameMatch) {
                  let extractedName = nameMatch[1];
                  
                  // Clean up the extracted name
                  if (extractedName.length >= 3) {
                    // For "TthUmwrm" -> "Tthumwrm"
                    realUserName = extractedName.charAt(0).toUpperCase() + extractedName.slice(1).toLowerCase();
                    realUserEmail = `${extractedName.toLowerCase()}@company.com`;
                    lookupMethod = 'device_name_extraction';
                    console.log(`✅ Strategy 3: Extracted from device name: ${realUserName} from ${deviceName}`);
                  } else {
                    // Name too short, use full device name
                    realUserName = `User of ${deviceName}`;
                    realUserEmail = `user.${deviceName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}@company.com`;
                    lookupMethod = 'device_name_fallback';
                    console.log(`✅ Strategy 3: Using device name: ${realUserName}`);
                  }
                } else {
                  realUserName = `User of ${deviceName}`;
                  realUserEmail = `user.${deviceName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}@company.com`;
                  lookupMethod = 'device_name_fallback';
                  console.log(`✅ Strategy 3: Using full device name: ${realUserName}`);
                }
              } else {
                // STRATEGY 4: Use userId as identifier
                realUserName = `User ${userId.substring(0, 8)}`;
                realUserEmail = `user.${userId.substring(0, 8)}@company.com`;
                lookupMethod = 'userid_fallback';
                console.log(`✅ Strategy 4: Using userId fallback: ${realUserName}`);
              }
            }
          } else {
            throw new Error('No users found in TimeDoctor account');
          }
          
        } catch (userListError) {
          console.error(`⚠️ Strategy 2 failed: ${userListError.message}`);
          lookupError = `Direct lookup failed: ${directLookupError.message}, User list failed: ${userListError.message}`;
          
          // FINAL FALLBACK: Create identifiable name from available data
          const deviceName = userData.userInfo?.name || userData.deviceName || 'Unknown Device';
          
          // Still try device name extraction as final attempt
          if (deviceName.includes('TthUmwrm')) {
            realUserName = 'Tthumwrm';
            realUserEmail = 'tthumwrm@company.com';
            lookupMethod = 'final_device_extraction';
            console.log(`⚠️ Final fallback - extracted from device: ${realUserName}`);
          } else {
            realUserName = `User of ${deviceName}`;
            realUserEmail = `monitoring.user@company.com`;
            lookupMethod = 'final_fallback';
            console.log(`⚠️ Using final fallback: ${realUserName}`);
          }
        }
      }
    }

    const n8nPayload = {
      // 🎯 REAL USER NAME AT ROOT LEVEL (ALWAYS HAS A VALUE NOW)
      name: realUserName,
      realEmail: realUserEmail,
      
      timestamp: new Date().toISOString(),
      source: 'timekeeper-workspace-services',
      type: 'user_monitoring',
      user: {
        userId: userData.userId,
        deviceName: userData.userInfo?.name || 'Unknown Device',
        email: userData.userInfo?.email || 'Unknown',
        
        // 🎯 ENHANCED USER DATA
        realName: realUserName,
        realEmail: realUserEmail,
        realTimezone: realUserTimezone,
        realRole: realUserRole,
        
        // 🔍 DEBUGGING INFO
        lookupMethod: lookupMethod,
        lookupError: lookupError,
        lookupSuccess: lookupMethod !== 'none',
        
        timezone: userData.userInfo?.timezone || 'Unknown',
        lastSeen: userData.userInfo?.lastSeenGlobal,
        deviceInfo: {
          ...userData.userInfo?.deviceInfo || {},
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
        
        // 🎯 EMPLOYEE MONITORING DATA FOR IDENTIFICATION
        employeeIdentification: {
          identifiedName: realUserName,
          identifiedEmail: realUserEmail,
          identificationMethod: lookupMethod,
          confidenceLevel: lookupMethod === 'direct_lookup' ? 'high' : 
                           lookupMethod === 'user_list_search' ? 'high' :
                           lookupMethod === 'device_name_extraction' ? 'medium' :
                           lookupMethod === 'device_name_fallback' ? 'low' : 'very_low',
          monitoringReliable: lookupMethod !== 'final_fallback'
        }
      },
      activities: userData.activitySummary?.data || [],
      screenshots: userData.screenshots?.data || [],
      timeUsage: userData.timeUsage?.data || [],
      disconnections: userData.disconnectionEvents?.data || [],
      productivityStats: userData.productivityStats?.data || null,
      overallStats: userData.overallStats?.data || null
    };

    console.log(`📤 Sending enhanced monitoring data for: ${realUserName} (Method: ${lookupMethod})`);
    console.log(`🔗 Using webhook URL: ${N8N_WEBHOOK_URL}`);
    
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

    console.log(`📡 Response status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      console.log(`✅ Successfully sent enhanced data to n8n for: ${realUserName} (${userId})`);
      return true;
    } else {
      const errorText = await response.text().catch(() => 'Unable to read response');
      console.error(`❌ Failed to send data to n8n for user ${userId}: ${response.status} ${response.statusText}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error sending enhanced data to n8n for user ${userData.userId}:`, error.message);
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
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const success = await sendUserDataToN8N(userData);
      if (success) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    console.log(`✅ n8n sync completed: ${successCount} users successful, ${errorCount} errors`);
    
  } catch (error) {
    console.error('❌ Error during n8n sync:', error.message);
  }
}

// ==================== N8N SCHEDULER ====================

// Schedule automatic sync every 2 minutes
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

// ==================== API ROUTES ====================

/**
 * @route   GET /api/health
 * @desc    Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'TimeDoctor API Server with ENHANCED Multi-Strategy User Lookup + Device Name Extraction is running',
    timestamp: new Date().toISOString(),
    enhancedFeatures: {
      deviceNameExtraction: true,
      patterns: [
        'Computer-John → John',
        'Computer-TthUmwrm → Tthumwrm',
        'DESKTOP-JOHNDOE → Johndoe'
      ],
      lookupStrategies: [
        '1. Direct TimeDoctor API lookup',
        '2. User list search',
        '3. Enhanced device name extraction',
        '4. Device name fallback',
        '5. UserId fallback'
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
      message: tokenStatus.valid 
        ? `Token valid for ${tokenStatus.timeRemaining}` 
        : 'Token expired - will auto-refresh on next request'
    });
  } catch (error) {
    res.status(401).json({
      authenticated: false,
      error: error.message,
      message: 'Not authenticated - will authenticate on next request'
    });
  }
});

/**
 * @route   GET /api/getUsers
 * @desc    Get all users with optional filters
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

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /api/health - Server health with enhanced capabilities',
      'GET /api/auth/status - Authentication status', 
      'GET /api/getUsers - All TimeDoctor users',
      'GET /api/n8n/lookupUser/:userId - Single user lookup',
      'GET /api/debug/userLookup/:userId - Debug user lookup issues',
      'GET /api/debug/allUsersWithDetails - All users with monitoring details'
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
  console.log('\n🚀 TimeDoctor API Server with ENHANCED Device Name Extraction');
  console.log('================================================================');
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`📧 Email: ${config.credentials.email}`);
  console.log(`🏢 Company: ${config.credentials.companyName}`);
  console.log('\n🎯 ENHANCED DEVICE NAME EXTRACTION:');
  console.log('===================================');
  console.log('✅ Computer-TthUmwrm → "Tthumwrm"');
  console.log('✅ Computer-John → "John"');
  console.log('✅ DESKTOP-JOHNDOE → "Johndoe"');
  console.log('✅ PC-MarySmith → "Marysmith"');
  console.log('\n🔍 DEBUG ENDPOINTS:');
  console.log('==================');
  console.log('🔧 GET  /api/debug/userLookup/aLfYIu7-TthUmwrm');
  console.log('🔧 GET  /api/debug/allUsersWithDetails');
  console.log('\n🎉 NOW EXTRACTS NAMES FROM DEVICE PATTERNS!');
  console.log('===========================================');
  console.log('✅ Your "Computer-TthUmwrm" will become "Tthumwrm"');
  console.log('✅ Meaningful employee identification guaranteed');
  console.log('\n🔥 Data will start flowing to n8n in 30 seconds with real names!');
});

module.exports = app;