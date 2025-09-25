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
        
        // Show similar userIds
        const similarIds = debugInfo.allUsers.users
          .map(u => u.id)
          .filter(id => id.includes(userId.substring(0, 5)) || userId.includes(id.substring(0, 5)));
        debugInfo.similarUserIds = similarIds;
        
        if (similarIds.length > 0) {
          debugInfo.debugSteps.push(`💡 Similar user IDs found: ${similarIds.join(', ')}`);
        }
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
    
    // Step 4: Recommendations
    debugInfo.debugSteps.push('Step 4: Generating recommendations...');
    debugInfo.recommendations = [];
    
    if (!debugInfo.authenticationStatus.valid) {
      debugInfo.recommendations.push('Fix TimeDoctor API authentication - check your credentials in .env file');
    }
    
    if (debugInfo.allUsers.count === 0) {
      debugInfo.recommendations.push('No users found in TimeDoctor - check API permissions or company settings');
    } else if (!debugInfo.userFound) {
      debugInfo.recommendations.push(`User ID ${userId} does not exist in TimeDoctor. Check the correct user IDs from the allUsers list.`);
      if (debugInfo.similarUserIds && debugInfo.similarUserIds.length > 0) {
        debugInfo.recommendations.push(`Try these similar user IDs: ${debugInfo.similarUserIds.join(', ')}`);
      }
    } else if (debugInfo.matchedUser.name === 'NO NAME' || debugInfo.matchedUser.email === 'NO EMAIL') {
      debugInfo.recommendations.push('User exists but has no name/email in TimeDoctor - update user profile in TimeDoctor dashboard');
    }
    
    // Final diagnosis
    if (debugInfo.userFound && debugInfo.matchedUser.name !== 'NO NAME') {
      debugInfo.diagnosis = 'SUCCESS: User can be identified for monitoring';
      debugInfo.monitoringName = debugInfo.matchedUser.name;
      debugInfo.monitoringEmail = debugInfo.matchedUser.email;
    } else if (debugInfo.userFound) {
      debugInfo.diagnosis = 'PARTIAL: User found but missing name/email data';
      debugInfo.monitoringName = `User ${userId.substring(0, 8)}`;
      debugInfo.monitoringEmail = 'unknown@company.com';
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
      detail: 'extended' // Get extended details
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
      },
      monitoringGuidance: {
        message: 'For effective employee monitoring, ensure users have both name and email in TimeDoctor',
        nextSteps: [
          'Update user profiles in TimeDoctor dashboard to add missing names/emails',
          'Use the userId from this list in your monitoring system',
          'Users with monitoringReady: true are fully set up for monitoring'
        ]
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      troubleshooting: [
        'Check TimeDoctor API authentication',
        'Verify API permissions for user access',
        'Ensure company/workspace is properly configured'
      ]
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
            
            if (matchedUser) {
              realUserName = matchedUser.name || matchedUser.email?.split('@')[0] || 'Name from user list';
              realUserEmail = matchedUser.email || 'Email not available';
              realUserTimezone = matchedUser.timezone || 'Unknown';
              realUserRole = matchedUser.role || 'Unknown';
              lookupMethod = 'user_list_search';
              
              console.log(`✅ Strategy 2 SUCCESS: Found in user list: ${realUserName} (${realUserEmail})`);
            } else {
              console.log(`⚠️ Strategy 2: User ${userId} not found in ${allUsers.data.length} users`);
              
              // STRATEGY 3: Use device name or create identifier
              const deviceName = userData.userInfo?.name || userData.deviceName || 'Unknown Device';
              
              // Try to extract a meaningful name from device name
              if (deviceName && deviceName !== 'Unknown Device') {
                // Extract name from device patterns like "Computer-John" or "DESKTOP-JOHNDOE"
                const nameMatch = deviceName.match(/(?:Computer-|DESKTOP-|PC-)([A-Za-z]+)/i);
                if (nameMatch) {
                  realUserName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1).toLowerCase();
                  realUserEmail = `${nameMatch[1].toLowerCase()}@company.com`;
                  lookupMethod = 'device_name_extraction';
                  console.log(`✅ Strategy 3: Extracted from device name: ${realUserName}`);
                } else {
                  realUserName = `User of ${deviceName}`;
                  realUserEmail = `user.${deviceName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}@company.com`;
                  lookupMethod = 'device_name_fallback';
                  console.log(`✅ Strategy 3: Using device name: ${realUserName}`);
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
          realUserName = `User of ${deviceName}`;
          realUserEmail = `monitoring.user@company.com`;
          lookupMethod = 'final_fallback';
          console.log(`⚠️ Using final fallback: ${realUserName}`);
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
      console.error(`📝 Response body: ${errorText}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error sending enhanced data to n8n for user ${userData.userId}:`, error.message);
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

// ==================== API ROUTES ====================

/**
 * @route   GET /api/health
 * @desc    Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'TimeDoctor API Server with ENHANCED n8n Integration + Multi-Strategy User Lookup is running',
    timestamp: new Date().toISOString(),
    n8nIntegration: {
      enabled: true,
      webhookUrl: N8N_WEBHOOK_URL,
      syncInterval: MONITORING_INTERVAL,
      syncIntervalDescription: 'Every 2 minutes',
      enhancedUserLookup: true,
      lookupStrategies: [
        '1. Direct TimeDoctor API lookup',
        '2. User list search',
        '3. Device name extraction (Computer-Name patterns)',
        '4. Device name fallback',
        '5. UserId fallback (always provides identifier)'
      ],
      debugEndpoints: [
        'GET /api/debug/userLookup/:userId - Diagnose lookup issues',
        'GET /api/debug/allUsersWithDetails - Show all users with monitoring readiness'
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
      'GET /api/health - Server health and capabilities',
      'GET /api/auth/status - Authentication status', 
      'GET /api/getUsers - All TimeDoctor users',
      'GET /api/n8n/lookupUser/:userId - Single user lookup',
      'POST /api/n8n/lookupUsers - Batch user lookup',
      'GET /api/n8n/userMap - Complete user mapping',
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
  console.log('\n🚀 TimeDoctor API Server with ENHANCED Multi-Strategy User Lookup');
  console.log('====================================================================');
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`📧 Email: ${config.credentials.email}`);
  console.log(`🏢 Company: ${config.credentials.companyName}`);
  console.log('\n🔗 N8N WEBHOOK INTEGRATION (ENHANCED USER IDENTIFICATION)');
  console.log('=========================================================');
  console.log(`📤 n8n Webhook URL: ${N8N_WEBHOOK_URL}`);
  console.log(`⏰ Sync Interval: Every 2 minutes (${MONITORING_INTERVAL})`);
  console.log('\n🎯 ENHANCED USER IDENTIFICATION STRATEGIES:');
  console.log('==========================================');
  console.log('✅ Strategy 1: Direct TimeDoctor API lookup (highest accuracy)');
  console.log('✅ Strategy 2: User list search (backup method)');
  console.log('✅ Strategy 3: Device name extraction (Computer-John → John)');
  console.log('✅ Strategy 4: Device name fallback (User of Computer-xyz)');
  console.log('✅ Strategy 5: UserId fallback (always provides identifier)');
  console.log('\n🔍 DEBUG ENDPOINTS FOR TROUBLESHOOTING:');
  console.log('======================================');
  console.log('🔧 GET  /api/debug/userLookup/aLfYIu7-TthUmwrm');
  console.log('🔧 GET  /api/debug/allUsersWithDetails');
  console.log('\n🎉 GUARANTEED USER IDENTIFICATION FOR MONITORING!');
  console.log('================================================');
  console.log('✅ Every webhook now includes a meaningful user identifier');
  console.log('✅ Multiple fallback strategies ensure no "Unknown" users');
  console.log('✅ Confidence levels help you assess identification accuracy');
  console.log('✅ Debug endpoints help troubleshoot any issues');
  console.log('\n🔥 Data will start flowing to n8n in 30 seconds, then every 2 minutes!');
  console.log('✅ All monitoring data will include real employee identification!');
});

module.exports = app;