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

// ==================== USERNAME IDENTIFICATION ENDPOINTS ====================

/**
 * @route   GET /api/getUserName/:userId
 * @desc    Get the REAL USERNAME from TimeDoctor (like "Dev Team") to identify who owns the laptop
 * @param   userId - User ID to lookup
 */
app.get('/api/getUserName/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    if (!userId || userId === 'undefined') {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
        example: 'GET /api/getUserName/aLfYIu7-TthUmwrm'
      });
    }

    console.log(`👤 USERNAME lookup requested for: ${userId}`);
    
    // Get the real username identification
    const userIdentification = await api.getUserOwnerInfo(userId);
    
    const response = {
      userId: userId,
      success: userIdentification.success,
      
      // 👤 PRIMARY: Username information
      username: userIdentification.username,
      fullName: userIdentification.fullName,
      email: userIdentification.email,
      
      // Secondary information
      timezone: userIdentification.timezone,
      role: userIdentification.role,
      status: userIdentification.status,
      computerName: userIdentification.computerName,
      
      // Lookup metadata
      lookupMethod: userIdentification.lookupMethod,
      confidence: userIdentification.confidence,
      error: userIdentification.error,
      
      // Display information
      displayName: userIdentification.username,
      whoOwnsThisDevice: userIdentification.username,
      
      debug: {
        message: userIdentification.success 
          ? `✅ SUCCESS: "${userIdentification.username}" owns this laptop/computer`
          : `⚠️ FALLBACK: Using "${userIdentification.username}" as identifier`,
        strategies: [
          '1. Direct TimeDoctor user lookup',
          '2. Company user list search',
          '3. Activity data username lookup'
        ],
        actualMethod: userIdentification.lookupMethod,
        confidence: userIdentification.confidence
      }
    };
    
    if (userIdentification.success) {
      console.log(`✅ USERNAME found: "${userIdentification.username}" owns this device (${userIdentification.lookupMethod})`);
    } else {
      console.log(`⚠️ Using fallback: "${userIdentification.username}" (${userIdentification.lookupMethod})`);
    }
    
    res.json({
      success: true,
      message: `Username lookup completed for ${userId}`,
      data: response
    });
    
  } catch (error) {
    console.error(`❌ USERNAME lookup error for ${req.params.userId}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      userId: req.params.userId,
      message: 'Failed to get username'
    });
  }
});

/**
 * @route   GET /api/getAllUserNames
 * @desc    Get USERNAMES for ALL users in the company to identify who owns each laptop/computer
 */
app.get('/api/getAllUserNames', async (req, res) => {
  try {
    console.log('👤 Getting USERNAMES for ALL users (laptop/computer owners)...');
    
    // Get all users first
    const users = await api.getUsers({ limit: 1000 });
    const userList = users.data || [];
    
    if (userList.length === 0) {
      return res.json({
        success: true,
        message: 'No users found in company',
        data: {
          totalUsers: 0,
          usernamesFound: 0,
          users: []
        }
      });
    }

    console.log(`📊 Found ${userList.length} users to get usernames for`);
    
    const allUserNames = [];
    let usernamesFound = 0;
    
    // Get username for each user
    for (const user of userList) {
      try {
        console.log(`🔍 Getting username for user ${user.id}...`);
        
        const userIdentification = await api.getUserIdentification(user.id, user);
        
        const userNameInfo = {
          userId: user.id,
          
          // 👤 PRIMARY: Who owns this laptop/computer
          username: userIdentification.username,
          fullName: userIdentification.fullName,
          email: userIdentification.email,
          whoOwnsThisDevice: userIdentification.username,
          
          // Secondary information
          timezone: userIdentification.timezone,
          role: userIdentification.role,
          status: userIdentification.status,
          computerName: userIdentification.computerName,
          
          // Lookup metadata
          lookupMethod: userIdentification.lookupMethod,
          success: userIdentification.success,
          confidence: userIdentification.confidence,
          
          // Status display
          status: userIdentification.success ? '✅ USERNAME FOUND' : '⚠️ USING FALLBACK',
          displayName: `${userIdentification.username} (${userIdentification.confidence} confidence)`,
          
          // Ownership information
          deviceOwner: userIdentification.username,
          ownershipInfo: userIdentification.success 
            ? `${userIdentification.username} owns this laptop/computer`
            : `Identified as: ${userIdentification.username}`
        };
        
        if (userIdentification.success && 
            userIdentification.username !== 'Unknown User' && 
            !userIdentification.username.startsWith('User ')) {
          usernamesFound++;
          console.log(`  ✅ USERNAME: "${userIdentification.username}" (${userIdentification.lookupMethod})`);
        } else {
          console.log(`  ⚠️ Fallback: "${userIdentification.username}"`);
        }
        
        allUserNames.push(userNameInfo);
        
        // Small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ Failed to get username for user ${user.id}: ${error.message}`);
        allUserNames.push({
          userId: user.id,
          username: user.name || user.username || `User ${user.id.substring(0, 8)}`,
          fullName: user.fullName || user.name || null,
          email: user.email || null,
          whoOwnsThisDevice: user.name || 'Unknown Owner',
          lookupMethod: 'error',
          success: false,
          confidence: 'none',
          status: '❌ ERROR',
          error: error.message,
          deviceOwner: 'Error getting owner',
          ownershipInfo: 'Could not determine laptop/computer owner'
        });
      }
    }

    // Sort by successful usernames first, then by username
    allUserNames.sort((a, b) => {
      if (a.success && !b.success) return -1;
      if (!a.success && b.success) return 1;
      return (a.username || '').localeCompare(b.username || '');
    });

    console.log(`✅ Username lookup complete for all users`);
    console.log(`   👥 Total users: ${allUserNames.length}`);
    console.log(`   👤 REAL usernames found: ${usernamesFound}`);
    console.log(`   📊 Success rate: ${Math.round((usernamesFound / allUserNames.length) * 100)}%`);

    res.json({
      success: true,
      message: `Username lookup completed for all ${allUserNames.length} users`,
      data: {
        totalUsers: allUserNames.length,
        usernamesFound: usernamesFound,
        successRate: `${Math.round((usernamesFound / allUserNames.length) * 100)}%`,
        
        summary: {
          identifiedOwners: allUserNames.filter(u => u.success),
          fallbackIdentifiers: allUserNames.filter(u => !u.success && !u.error),
          errors: allUserNames.filter(u => u.error)
        },
        
        // 👤 WHO OWNS WHICH LAPTOP/COMPUTER
        laptopOwners: allUserNames.map(u => ({
          userId: u.userId,
          deviceOwner: u.deviceOwner,
          username: u.username,
          email: u.email,
          computer: u.computerName || 'Unknown Computer',
          ownershipInfo: u.ownershipInfo
        })),
        
        users: allUserNames
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting all usernames:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to get usernames for all users'
    });
  }
});

// ==================== ENHANCED N8N WEBHOOK ENDPOINT WITH FULL ACTIVITY DATA ====================

/**
 * @route   GET /api/monitorAllUsers
 * @desc    Get complete monitoring data for ALL users with full activity details for N8N webhook
 */
app.get('/api/monitorAllUsers', async (req, res) => {
  try {
    console.log('🕵️ MONITOR ALL USERS: Getting complete activity data for N8N webhook...');
    
    // Get date range parameters (default to last 24 hours)
    const from = req.query.from || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to = req.query.to || new Date().toISOString().split('T')[0];
    
    console.log(`📅 Date range: ${from} to ${to}`);
    
    // Get monitoring data for all users WITH FULL ACTIVITY DETAILS
    const allMonitoringData = await api.getAllUsersMonitoring({
      from: from,
      to: to
    });

    if (!allMonitoringData.success || !allMonitoringData.data) {
      return res.json({
        success: false,
        message: 'No monitoring data available',
        data: []
      });
    }

    console.log(`📊 Found ${allMonitoringData.data.length} users with activity data`);
    
    // Send ALL users data in ONE webhook call (batch style)
    const batchInfo = {
      type: "ALL_USERS_IN_ONE_CALL",
      totalUsers: allMonitoringData.data.length,
      timestamp: new Date().toISOString(),
      source: "timekeeper-workspace-services",
      webhookUrl: N8N_WEBHOOK_URL,
      description: "ALL users in ONE single webhook call - NO individual calls!"
    };

    // Prepare all users with COMPLETE activity data
    const allUsers = allMonitoringData.data.map(userData => ({
      // 👤 USER IDENTIFICATION
      name: userData.userInfo?.name || userData.username || 'Unknown',
      email: userData.userInfo?.email || 'Unknown',
      userId: userData.userId,
      realName: userData.userInfo?.username || userData.username || 'Unknown',
      realEmail: userData.userInfo?.email || 'Unknown',
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
      
      // 🎯 COMPLETE ACTIVITY DATA ARRAYS (This is what was missing!)
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
      
      // 🔍 DEBUG INFO
      userInfo: userData.userInfo || {},
      monitoringStatus: {
        activityStatus: userData.activitySummary?.status || 'no_data',
        screenshotStatus: userData.screenshots?.status || 'no_data',
        timeUsageStatus: userData.timeUsage?.status || 'no_data',
        disconnectionStatus: userData.disconnectionEvents?.status || 'no_data'
      }
    }));

    const webhookPayload = {
      body: {
        batchInfo: batchInfo,
        allUsers: allUsers
      }
    };

    // Send to N8N webhook immediately
    if (N8N_WEBHOOK_URL && N8N_WEBHOOK_URL !== 'https://n8n.srv470812.hstgr.cloud/webhook/workspace-url-n8n') {
      try {
        console.log(`📤 Sending ALL users activity data to N8N webhook...`);
        console.log(`🔗 Webhook URL: ${N8N_WEBHOOK_URL}`);
        
        const webhookResponse = await fetch(N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Workspace-Services-Monitor/1.0'
          },
          body: JSON.stringify(webhookPayload),
          timeout: 30000 // 30 second timeout for large payloads
        });

        if (webhookResponse.ok) {
          console.log(`✅ Successfully sent ALL users activity data to N8N!`);
          console.log(`📊 Payload included: ${allUsers.length} users with complete activity arrays`);
        } else {
          console.error(`❌ Failed to send to N8N: ${webhookResponse.status} ${webhookResponse.statusText}`);
        }
        
      } catch (webhookError) {
        console.error(`❌ Error sending to N8N webhook: ${webhookError.message}`);
      }
    }

    // Also return the data as API response
    res.json({
      success: true,
      message: `Complete monitoring data retrieved for ${allUsers.length} users`,
      summary: {
        totalUsers: allUsers.length,
        usersWithData: allUsers.filter(u => u.hasData).length,
        totalActivities: allUsers.reduce((sum, u) => sum + u.totalActivities, 0),
        totalScreenshots: allUsers.reduce((sum, u) => sum + u.totalScreenshots, 0),
        totalDisconnections: allUsers.reduce((sum, u) => sum + u.totalDisconnections, 0),
        totalTimeUsage: allUsers.reduce((sum, u) => sum + u.totalTimeUsage, 0),
        dateRange: { from, to },
        webhookSent: !!N8N_WEBHOOK_URL,
        webhookUrl: N8N_WEBHOOK_URL
      },
      data: webhookPayload
    });
    
  } catch (error) {
    console.error('❌ Error monitoring all users:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to get monitoring data for all users'
    });
  }
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
    
    // Get user details with USERNAME priority
    const userIdentification = await api.getUserOwnerInfo(userId);
    
    // Extract the essential info for n8n
    const lookupResult = {
      userId: userId,
      realName: userIdentification.username,
      realEmail: userIdentification.email || 'Email not available',
      timezone: userIdentification.timezone || 'Unknown',
      role: userIdentification.role || 'Unknown',
      status: userIdentification.status || 'Unknown',
      
      // WHO OWNS THIS DEVICE
      deviceOwner: userIdentification.username,
      whoOwnsThisLaptop: userIdentification.username,
      
      fullUserData: userIdentification // Complete user object for reference
    };
    
    console.log(`✅ Found device owner: "${lookupResult.realName}" (${lookupResult.realEmail})`);
    
    res.json({
      success: true,
      message: `User lookup successful - ${lookupResult.realName} owns this device`,
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
 * @desc    DEBUG endpoint to diagnose user lookup issues WITH USERNAME PRIORITY
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
          username: user.username || 'NO USERNAME',
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
          username: directUser.username || 'NO USERNAME',
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

    // NEW Step 4: Try USERNAME identification lookup
    debugInfo.debugSteps.push('Step 4: Attempting USERNAME identification lookup...');
    try {
      const userIdentification = await api.getUserOwnerInfo(userId);
      debugInfo.usernameIdentification = {
        success: userIdentification.success,
        username: userIdentification.username,
        fullName: userIdentification.fullName,
        email: userIdentification.email,
        lookupMethod: userIdentification.lookupMethod,
        confidence: userIdentification.confidence,
        whoOwnsDevice: userIdentification.username,
        error: userIdentification.error
      };
      
      if (userIdentification.success) {
        debugInfo.debugSteps.push(`✅ USERNAME identification: "${userIdentification.username}" owns this device (${userIdentification.lookupMethod})`);
      } else {
        debugInfo.debugSteps.push(`⚠️ Using fallback identifier: "${userIdentification.username}"`);
      }
    } catch (usernameError) {
      debugInfo.usernameIdentification = {
        success: false,
        error: usernameError.message
      };
      debugInfo.debugSteps.push(`❌ Username identification: FAILED - ${usernameError.message}`);
    }
    
    // Final diagnosis (UPDATED to prioritize USERNAME)
    if (debugInfo.usernameIdentification?.success) {
      debugInfo.diagnosis = 'SUCCESS: Device owner identified via USERNAME';
      debugInfo.deviceOwner = debugInfo.usernameIdentification.username;
      debugInfo.monitoringName = debugInfo.usernameIdentification.username;
      debugInfo.monitoringEmail = debugInfo.usernameIdentification.email || 'Email not available';
      debugInfo.confidenceLevel = debugInfo.usernameIdentification.confidence;
    } else if (debugInfo.userFound && debugInfo.matchedUser.name !== 'NO NAME') {
      debugInfo.diagnosis = 'SUCCESS: User identified via direct lookup';
      debugInfo.deviceOwner = debugInfo.matchedUser.name;
      debugInfo.monitoringName = debugInfo.matchedUser.name;
      debugInfo.monitoringEmail = debugInfo.matchedUser.email;
      debugInfo.confidenceLevel = 'medium';
    } else if (debugInfo.usernameIdentification?.username) {
      debugInfo.diagnosis = 'PARTIAL: Using fallback identification';
      debugInfo.deviceOwner = debugInfo.usernameIdentification.username;
      debugInfo.monitoringName = debugInfo.usernameIdentification.username;
      debugInfo.monitoringEmail = 'Email not available';
      debugInfo.confidenceLevel = 'low';
    } else {
      debugInfo.diagnosis = 'FAILED: Cannot identify device owner';
      debugInfo.deviceOwner = 'Unknown Owner';
      debugInfo.monitoringName = 'Unknown User';
      debugInfo.monitoringEmail = 'unknown@company.com';
      debugInfo.confidenceLevel = 'none';
    }
    
    debugInfo.debugSteps.push(`🎯 FINAL DIAGNOSIS: ${debugInfo.diagnosis}`);
    debugInfo.debugSteps.push(`👤 DEVICE OWNER: ${debugInfo.deviceOwner}`);
    
    res.json({
      success: true,
      message: 'Username identification debugging completed',
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
 * @desc    Get all TimeDoctor users with USERNAME focus for device ownership
 */
app.get('/api/debug/allUsersWithDetails', async (req, res) => {
  try {
    console.log('🔍 Debug: Fetching all users with USERNAME details...');
    
    const allUsers = await api.getUsers({ 
      limit: 1000,
      detail: 'extended'
    });
    
    const userDetails = allUsers.data?.map(user => ({
      userId: user.id,
      username: user.name || user.username || 'NO USERNAME AVAILABLE',
      fullName: user.fullName || user.name || null,
      email: user.email || 'NO EMAIL AVAILABLE',
      role: user.role || 'Unknown',
      status: user.status || 'Unknown',
      timezone: user.timezone || 'Unknown',
      
      // WHO OWNS THIS DEVICE
      deviceOwner: user.name || user.username || 'Unknown Owner',
      whoOwnsThisLaptop: user.name || user.username || 'Unknown Owner',
      
      monitoringReady: !!(user.name && user.email),
      displayName: user.name || user.username || user.email?.split('@')[0] || `User ${user.id.substring(0, 8)}`
    })) || [];
    
    res.json({
      success: true,
      message: `Found ${userDetails.length} users in TimeDoctor account with USERNAME focus`,
      data: {
        totalUsers: userDetails.length,
        usersWithUsernames: userDetails.filter(u => u.username !== 'NO USERNAME AVAILABLE').length,
        usersWithEmails: userDetails.filter(u => u.email !== 'NO EMAIL AVAILABLE').length,
        monitoringReadyUsers: userDetails.filter(u => u.monitoringReady).length,
        
        // WHO OWNS WHICH LAPTOP/COMPUTER
        deviceOwnership: userDetails.map(u => ({
          userId: u.userId,
          deviceOwner: u.deviceOwner,
          username: u.username,
          email: u.email
        })),
        
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

// ==================== ENHANCED N8N WEBHOOK FUNCTIONS ====================

/**
 * Send individual user data to n8n webhook WITH COMPLETE ACTIVITY DATA
 * @param {object} userData - Individual user monitoring data
 * @returns {Promise<boolean>} Success status
 */
async function sendUserDataToN8N(userData) {
  try {
    // 👤 USERNAME PRIORITY LOOKUP - Focus on identifying WHO owns the device
    let deviceOwner = 'Unknown Owner';
    let realUserName = 'Name not available';
    let realUserEmail = 'Email not available';
    let realUserTimezone = 'Unknown';
    let realUserRole = 'Unknown';
    let lookupMethod = 'none';
    let lookupError = null;
    let confidence = 'low';
    
    const userId = userData.userId;
    
    if (userId && userId !== 'undefined') {
      console.log(`👤 USERNAME priority lookup for user: ${userId}`);
      
      try {
        // Get the USERNAME to identify device owner
        const userIdentification = await api.getUserOwnerInfo(userId);
        
        if (userIdentification.success) {
          deviceOwner = userIdentification.username;
          realUserName = userIdentification.username;
          realUserEmail = userIdentification.email || 'Email not available';
          realUserTimezone = userIdentification.timezone || 'Unknown';
          realUserRole = userIdentification.role || 'Unknown';
          lookupMethod = userIdentification.lookupMethod;
          confidence = userIdentification.confidence;
          
          console.log(`✅ Device owner identified: "${deviceOwner}" (${lookupMethod})`);
        } else {
          // Use fallback but still try to get a meaningful identifier
          deviceOwner = userIdentification.username || 'Unknown Owner';
          realUserName = deviceOwner;
          lookupMethod = userIdentification.lookupMethod;
          lookupError = userIdentification.error;
          confidence = 'very_low';
          
          console.log(`⚠️ Using fallback device owner: "${deviceOwner}"`);
        }
        
      } catch (lookupErrorException) {
        console.error(`❌ Username lookup failed: ${lookupErrorException.message}`);
        lookupError = lookupErrorException.message;
        deviceOwner = `User ${userId.substring(0, 8)}`;
        realUserName = deviceOwner;
        lookupMethod = 'final_fallback';
      }
    }

    const n8nPayload = {
      // 👤 PRIMARY: WHO OWNS THIS LAPTOP/COMPUTER (REAL USERNAME FROM TIMEKEEPER)
      name: realUserName,
      email: userData.userInfo?.email || 'Unknown',
      userId: userData.userId,
      realName: realUserName,
      realEmail: realUserEmail,
      timezone: userData.userInfo?.timezone || realUserTimezone,
      role: userData.userInfo?.role || realUserRole,
      status: userData.userInfo?.status || 'offline',
      processedAt: new Date().toISOString(),
      
      // 📊 SUMMARY COUNTS
      lookupSuccess: lookupMethod !== 'none' && !lookupError,
      hasData: userData.summary?.hasData || false,
      totalActivities: userData.activitySummary?.totalRecords || 0,
      totalScreenshots: userData.screenshots?.totalScreenshots || 0,
      totalDisconnections: userData.disconnectionEvents?.totalEvents || 0,
      
      // 🚀 COMPLETE ACTIVITY DATA ARRAYS (FIXED: Now includes full arrays!)
      activities: userData.activitySummary?.data || [],
      screenshots: userData.screenshots?.data || [],
      timeUsage: userData.timeUsage?.data || [],
      disconnections: userData.disconnectionEvents?.data || [],
      
      // 📈 PRODUCTIVITY & STATS DATA  
      productivityStats: userData.productivityStats?.data || null,
      overallStats: userData.overallStats?.data || null,
      
      // Device ownership information
      deviceOwner: deviceOwner,
      whoOwnsThisDevice: deviceOwner,
      laptopOwner: deviceOwner,
      computerOwner: deviceOwner,
      
      // Enhanced metadata
      timestamp: new Date().toISOString(),
      source: 'timekeeper-workspace-services',
      type: 'user_monitoring',
      lookupMethod: lookupMethod,
      lookupError: lookupError,
      confidence: confidence,
      
      // Debug info
      userInfo: userData.userInfo || {},
      monitoringStatus: {
        activityStatus: userData.activitySummary?.status || 'no_data',
        screenshotStatus: userData.screenshots?.status || 'no_data',
        timeUsageStatus: userData.timeUsage?.status || 'no_data',
        disconnectionStatus: userData.disconnectionEvents?.status || 'no_data'
      }
    };

    console.log(`📤 Sending COMPLETE monitoring data for device owner: "${deviceOwner}" (Method: ${lookupMethod})`);
    console.log(`📊 Data includes: ${n8nPayload.activities.length} activities, ${n8nPayload.screenshots.length} screenshots, ${n8nPayload.timeUsage.length} time usage records, ${n8nPayload.disconnections.length} disconnections`);
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
      console.log(`✅ Successfully sent COMPLETE data to n8n for device owner: "${deviceOwner}" (${userId})`);
      return true;
    } else {
      const errorText = await response.text().catch(() => 'Unable to read response');
      console.error(`❌ Failed to send data to n8n for user ${userId}: ${response.status} ${response.statusText}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error sending data to n8n for user ${userData.userId}:`, error.message);
    return false;
  }
}

/**
 * Collect all user monitoring data and send to n8n (each user separately) WITH COMPLETE ACTIVITY DATA
 */
async function syncAllUsersToN8N() {
  try {
    console.log('\n🔄 Starting automated n8n sync with COMPLETE ACTIVITY DATA...');
    console.log(`🔗 n8n Webhook URL: ${N8N_WEBHOOK_URL}`);
    
    // Get monitoring data for all users WITH USERNAME IDENTIFICATION AND FULL ACTIVITY DATA
    const allMonitoringData = await api.getAllUsersMonitoring({
      from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 24 hours
      to: new Date().toISOString().split('T')[0]
    });

    if (!allMonitoringData.success || !allMonitoringData.data) {
      console.log('⚠️ No monitoring data available for n8n sync');
      return;
    }

    console.log(`📊 Found ${allMonitoringData.data.length} device owners with COMPLETE ACTIVITY DATA to sync to n8n`);
    console.log(`👤 USERNAMES identified: ${allMonitoringData.summary.usernamesIdentified || 0}`);
    console.log(`📈 Total activities: ${allMonitoringData.data.reduce((sum, u) => sum + (u.activitySummary?.totalRecords || 0), 0)}`);
    console.log(`📸 Total screenshots: ${allMonitoringData.data.reduce((sum, u) => sum + (u.screenshots?.totalScreenshots || 0), 0)}`);
    console.log(`📊 Total time usage: ${allMonitoringData.data.reduce((sum, u) => sum + (u.timeUsage?.totalRecords || 0), 0)}`);
    console.log(`🔌 Total disconnections: ${allMonitoringData.data.reduce((sum, u) => sum + (u.disconnectionEvents?.totalEvents || 0), 0)}`);
    
    let successCount = 0;
    let errorCount = 0;

    // Send each user's COMPLETE data separately to n8n
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

    console.log(`✅ n8n sync with COMPLETE ACTIVITY DATA completed: ${successCount} device owners successful, ${errorCount} errors`);
    
  } catch (error) {
    console.error('❌ Error during n8n sync:', error.message);
  }
}

// ==================== N8N SCHEDULER ====================

// Schedule automatic sync every 2 minutes
console.log('⏰ Setting up n8n sync scheduler with COMPLETE ACTIVITY DATA (every 2 minutes)...');
cron.schedule(MONITORING_INTERVAL, () => {
  console.log('\n⏰ Scheduled n8n sync triggered with COMPLETE ACTIVITY DATA');
  syncAllUsersToN8N();
}, {
  scheduled: true,
  timezone: "UTC"
});

// Initial sync after 30 seconds of server start
setTimeout(() => {
  console.log('🚀 Running initial n8n sync with COMPLETE ACTIVITY DATA...');
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
    message: 'TimeDoctor API Server with COMPLETE ACTIVITY DATA is running',
    timestamp: new Date().toISOString(),
    enhancedFeatures: {
      completeActivityData: true,
      usernamePriorityDetection: true,
      examples: [
        '"Dev Team" → Real TimeDoctor username found!',
        '"John Smith" → Actual employee name',
        '"Alice Johnson" → Real user identification'
      ],
      activityDataIncludes: [
        'activities[] - Full activity records with start times, duration, mode',
        'screenshots[] - Complete screenshot data with scores, categories',
        'timeUsage[] - Time usage patterns and records',
        'disconnections[] - All disconnection events'
      ],
      lookupStrategies: [
        '1. Direct TimeDoctor user lookup',
        '2. Company user list search',
        '3. Activity data username lookup'
      ],
      newEndpoints: [
        'GET /api/getUserName/:userId',
        'GET /api/getAllUserNames',
        'GET /api/monitorAllUsers (NEW: Complete activity data for N8N)'
      ],
      focusOn: 'COMPLETE ACTIVITY DATA + WHO OWNS THE LAPTOP/COMPUTER'
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
      'GET /api/health - Server health with COMPLETE ACTIVITY DATA',
      'GET /api/auth/status - Authentication status', 
      'GET /api/getUsers - All TimeDoctor users',
      'GET /api/getUserName/:userId - Get USERNAME (device owner)',
      'GET /api/getAllUserNames - Get USERNAMES for ALL users (device owners)',
      'GET /api/monitorAllUsers - NEW: Complete activity data for N8N webhook',
      'GET /api/n8n/lookupUser/:userId - Single user lookup with USERNAME',
      'GET /api/debug/userLookup/:userId - Debug user lookup with USERNAME focus',
      'GET /api/debug/allUsersWithDetails - All users with USERNAME details'
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
  console.log('\n🚀 TimeDoctor API Server with COMPLETE ACTIVITY DATA + USERNAME PRIORITY Detection');
  console.log('===================================================================================');
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`📧 Email: ${config.credentials.email}`);
  console.log(`🏢 Company: ${config.credentials.companyName}`);
  console.log('\n📊 COMPLETE ACTIVITY DATA FOR N8N:');
  console.log('==================================');
  console.log('✅ activities[] - Full activity records with start times, duration, mode');
  console.log('✅ screenshots[] - Complete screenshot data with scores, categories, titles');  
  console.log('✅ timeUsage[] - Time usage patterns and records');
  console.log('✅ disconnections[] - All disconnection events and idle time');
  console.log('\n👤 USERNAME PRIORITY DETECTION:');
  console.log('===============================');
  console.log('✅ "Dev Team" → Real TimeDoctor username (device owner)');
  console.log('✅ "John Smith" → Actual employee name');
  console.log('✅ "Alice Johnson" → Real user identification');
  console.log('✅ WHO OWNS THE LAPTOP/COMPUTER (not random device names)');
  console.log('\n🔍 TEST ENDPOINTS FOR COMPLETE ACTIVITY DATA:');
  console.log('==============================================');
  console.log('👤 GET  /api/getUserName/aLfYIu7-TthUmwrm');
  console.log('👤 GET  /api/getAllUserNames');
  console.log('📊 GET  /api/monitorAllUsers (NEW: Complete activity data for N8N)');
  console.log('\n🔧 DEBUG ENDPOINTS:');
  console.log('==================');
  console.log('🔧 GET  /api/debug/userLookup/aLfYIu7-TthUmwrm');
  console.log('🔧 GET  /api/debug/allUsersWithDetails');
  console.log('\n🎉 NOW SENDS COMPLETE ACTIVITY DATA TO N8N!');
  console.log('=============================================');
  console.log('✅ Activities, screenshots, timeUsage, disconnections included');
  console.log('✅ Real employee names from TimeDoctor usernames');
  console.log('✅ Each user gets complete monitoring arrays in webhook');
  console.log('✅ Know exactly who owns each device + their full activity data');
  console.log('\n🔥 COMPLETE monitoring data will start flowing to n8n in 30 seconds!');
});

module.exports = app;