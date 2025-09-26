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

// 🔧 FIXED: Send data only ONCE - disable recurring cron job
const SEND_ONCE_ON_STARTUP = true; // Set to true to send once on startup
const SEND_RECURRING = false; // Set to false to disable recurring sends

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

// ==================== ENHANCED: GET USER STATUS & SCREENSHOTS ====================

/**
 * 🎯 GET ENHANCED USER STATUS (Online/Offline/Working)
 */
async function getEnhancedUserStatus(userId) {
  try {
    console.log(`🔍 [STATUS] Getting enhanced status for user: ${userId}`);
    
    // Get user details with status
    const userDetails = await api.getUser(userId);
    
    if (!userDetails.success || !userDetails.data) {
      console.log(`⚠️ [STATUS] No user details found for ${userId}`);
      return {
        status: 'unknown',
        onlineStatus: 'offline',
        workingStatus: 'not_working',
        lastSeen: null,
        isCurrentlyWorking: false
      };
    }
    
    const user = userDetails.data;
    console.log(`📊 [STATUS] User details:`, JSON.stringify(user, null, 2));
    
    // Determine online/offline status
    const lastSeen = user.lastSeenGlobal || user.lastSeen;
    const isRecentlyActive = lastSeen ? 
      (new Date() - new Date(lastSeen)) < (15 * 60 * 1000) : false; // 15 minutes
    
    // Get today's activity to determine if currently working
    const today = new Date().toISOString().split('T')[0];
    const todayActivity = await api.getUserActivity(userId, { from: today, to: today });
    
    const hasRecentActivity = todayActivity.success && 
      todayActivity.data && 
      todayActivity.data.length > 0;
    
    // Determine working status
    let workingStatus = 'not_working';
    let isCurrentlyWorking = false;
    
    if (hasRecentActivity) {
      const latestActivity = todayActivity.data[todayActivity.data.length - 1];
      const activityTime = new Date(latestActivity.start);
      const timeSinceActivity = (new Date() - activityTime) / (1000 * 60); // minutes
      
      if (timeSinceActivity < 30) { // Within 30 minutes
        workingStatus = 'currently_working';
        isCurrentlyWorking = true;
      } else if (timeSinceActivity < 120) { // Within 2 hours
        workingStatus = 'recently_worked';
      }
    }
    
    const enhancedStatus = {
      status: user.status || 'unknown',
      onlineStatus: isRecentlyActive ? 'online' : 'offline',
      workingStatus: workingStatus,
      lastSeen: lastSeen,
      isCurrentlyWorking: isCurrentlyWorking,
      isRecentlyActive: isRecentlyActive,
      lastActivity: hasRecentActivity ? todayActivity.data[todayActivity.data.length - 1] : null,
      statusDetails: {
        rawStatus: user.status,
        lastSeenGlobal: user.lastSeenGlobal,
        timezoneOffset: user.timezoneOffset,
        hasRecentActivity: hasRecentActivity,
        minutesSinceLastSeen: lastSeen ? Math.round((new Date() - new Date(lastSeen)) / (1000 * 60)) : null
      }
    };
    
    console.log(`✅ [STATUS] Enhanced status for ${userId}: ${enhancedStatus.onlineStatus} / ${enhancedStatus.workingStatus}`);
    return enhancedStatus;
    
  } catch (error) {
    console.error(`❌ [STATUS] Error getting enhanced status for ${userId}:`, error.message);
    return {
      status: 'error',
      onlineStatus: 'offline',
      workingStatus: 'not_working',
      lastSeen: null,
      isCurrentlyWorking: false,
      error: error.message
    };
  }
}

/**
 * 🎯 GET INDIVIDUAL USER SCREENSHOTS WITH DETAILS
 */
async function getEnhancedUserScreenshots(userId, dateFrom, dateTo) {
  try {
    console.log(`📸 [SCREENSHOTS] Getting enhanced screenshots for user: ${userId}`);
    
    // Get screenshots for the user
    const screenshotsResult = await api.getScreenshots({
      from: dateFrom,
      to: dateTo,
      user: userId,
      limit: 100 // Get more screenshots
    });
    
    if (!screenshotsResult.success || !screenshotsResult.data) {
      console.log(`⚠️ [SCREENSHOTS] No screenshots found for ${userId}`);
      return {
        screenshots: [],
        totalCount: 0,
        averageScore: 0,
        productivityLevel: 'unknown'
      };
    }
    
    const screenshots = screenshotsResult.data;
    console.log(`📸 [SCREENSHOTS] Found ${screenshots.length} screenshots for ${userId}`);
    
    // Process screenshots with enhanced details
    const enhancedScreenshots = screenshots.map(screenshot => ({
      id: screenshot.id,
      userId: screenshot.userId || userId,
      timestamp: screenshot.timestamp || screenshot.start,
      score: screenshot.score || 0,
      category: screenshot.category,
      title: screenshot.title || 'Unknown Activity',
      url: screenshot.url,
      thumbnailUrl: screenshot.thumbnailUrl,
      
      // Enhanced fields
      productivityScore: screenshot.score || 0,
      isProductive: (screenshot.score || 0) >= 5, // 5+ is productive
      timeOfDay: screenshot.timestamp ? 
        new Date(screenshot.timestamp).toLocaleTimeString() : 'Unknown',
      dayOfWeek: screenshot.timestamp ? 
        new Date(screenshot.timestamp).toLocaleDateString('en-US', { weekday: 'long' }) : 'Unknown',
      
      // Screenshot metadata
      width: screenshot.width,
      height: screenshot.height,
      fileSize: screenshot.fileSize,
      device: screenshot.device || 'Unknown Device'
    }));
    
    // Calculate productivity metrics
    const totalScore = enhancedScreenshots.reduce((sum, s) => sum + (s.productivityScore || 0), 0);
    const averageScore = enhancedScreenshots.length > 0 ? 
      Math.round(totalScore / enhancedScreenshots.length * 100) / 100 : 0;
    
    let productivityLevel = 'low';
    if (averageScore >= 7) productivityLevel = 'high';
    else if (averageScore >= 5) productivityLevel = 'medium';
    
    const screenshotSummary = {
      screenshots: enhancedScreenshots,
      totalCount: enhancedScreenshots.length,
      averageScore: averageScore,
      productivityLevel: productivityLevel,
      productiveCount: enhancedScreenshots.filter(s => s.isProductive).length,
      unproductiveCount: enhancedScreenshots.filter(s => !s.isProductive).length,
      
      // Time-based analysis
      morningScreenshots: enhancedScreenshots.filter(s => {
        const hour = s.timestamp ? new Date(s.timestamp).getHours() : 0;
        return hour >= 6 && hour < 12;
      }).length,
      afternoonScreenshots: enhancedScreenshots.filter(s => {
        const hour = s.timestamp ? new Date(s.timestamp).getHours() : 0;
        return hour >= 12 && hour < 18;
      }).length,
      eveningScreenshots: enhancedScreenshots.filter(s => {
        const hour = s.timestamp ? new Date(s.timestamp).getHours() : 0;
        return hour >= 18 || hour < 6;
      }).length
    };
    
    console.log(`✅ [SCREENSHOTS] Enhanced ${userId}: ${screenshotSummary.totalCount} screenshots, avg score: ${screenshotSummary.averageScore}`);
    return screenshotSummary;
    
  } catch (error) {
    console.error(`❌ [SCREENSHOTS] Error getting enhanced screenshots for ${userId}:`, error.message);
    return {
      screenshots: [],
      totalCount: 0,
      averageScore: 0,
      productivityLevel: 'error',
      error: error.message
    };
  }
}

// ==================== FIXED USERNAME IDENTIFICATION ====================

/**
 * FIXED USER LOOKUP - This matches names from TimeDoctor Dashboard to userIds
 */
async function getFixedUserLookup(userId) {
  console.log(`🔍 [FIXED LOOKUP] Getting real username for userId: ${userId}`);
  
  try {
    // Strategy 1: Get all users first and match by ID
    console.log('📊 [FIXED] Step 1: Getting all users from TimeDoctor...');
    const allUsers = await api.getUsers({ limit: 1000, detail: 'extended' });
    
    if (!allUsers.data || allUsers.data.length === 0) {
      console.log('❌ [FIXED] No users found in TimeDoctor');
      return { username: 'Unknown User', email: 'Email not available', method: 'no_users' };
    }
    
    console.log(`📊 [FIXED] Found ${allUsers.data.length} users in TimeDoctor company`);
    
    // Find the user by exact ID match
    const matchedUser = allUsers.data.find(user => user.id === userId);
    
    if (matchedUser) {
      console.log(`✅ [FIXED] Found user in list:`, JSON.stringify(matchedUser, null, 2));
      
      // Extract the real name - try multiple fields
      const realName = matchedUser.name || 
                      matchedUser.displayName || 
                      matchedUser.fullName || 
                      matchedUser.username ||
                      `${matchedUser.firstName || ''} ${matchedUser.lastName || ''}`.trim() ||
                      matchedUser.email?.split('@')[0] ||
                      'Unknown User';
      
      const realEmail = matchedUser.email || 'Email not available';
      
      console.log(`✅ [FIXED] SUCCESS! Real name: "${realName}", Email: "${realEmail}"`);
      
      return {
        username: realName,
        fullName: matchedUser.fullName || realName,
        email: realEmail,
        timezone: matchedUser.timezone,
        role: matchedUser.role,
        method: 'direct_match',
        confidence: 'high',
        success: true
      };
      
    } else {
      console.log(`❌ [FIXED] User ${userId} NOT FOUND in user list`);
      console.log(`📊 Available user IDs: ${allUsers.data.map(u => u.id).join(', ')}`);
      
      return {
        username: `User ${userId.substring(0, 8)}`,
        email: 'Email not available', 
        method: 'not_found_fallback',
        confidence: 'low',
        success: false
      };
    }
    
  } catch (error) {
    console.error(`❌ [FIXED] User lookup failed: ${error.message}`);
    return {
      username: `User ${userId.substring(0, 8)}`,
      email: 'Email not available',
      method: 'error_fallback',
      error: error.message,
      confidence: 'low',
      success: false
    };
  }
}

// ==================== ENHANCED: ALL USERS IN ONE WEBHOOK CALL WITH STATUS & SCREENSHOTS ====================

/**
 * 🎯 ENHANCED: Collect all user monitoring data with STATUS & SCREENSHOTS and send ALL USERS IN ONE WEBHOOK CALL
 */
async function syncAllUsersToN8N_OneCall() {
  try {
    console.log('\n🚀 [ENHANCED] Starting ONE-CALL sync with STATUS + SCREENSHOTS + FIXED USERNAMES...');
    console.log(`🔗 n8n Webhook: ${N8N_WEBHOOK_URL}`);
    
    // Get date range (last 24 hours)
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];
    
    console.log(`📅 Date range: ${from} to ${to}`);
    
    // Get monitoring data for all users with FIXED username identification
    const allMonitoringData = await api.getAllUsersMonitoring({ from, to });

    if (!allMonitoringData.success || !allMonitoringData.data) {
      console.log('⚠️ No monitoring data available for one-call sync');
      return;
    }

    console.log(`📊 [ENHANCED] Found ${allMonitoringData.data.length} users to process for ONE webhook call`);
    
    // 🔥 PROCESS ALL USERS WITH STATUS, SCREENSHOTS, & COMPLETE ACTIVITY DATA
    const allUsersWithCompleteData = [];
    
    for (const userData of allMonitoringData.data) {
      console.log(`\n🔄 [ENHANCED] Processing user: ${userData.userId}`);
      
      // 🎯 FIXED USERNAME LOOKUP - Get real names like "Levi Daniels", "Joshua Banks"
      const userLookup = await getFixedUserLookup(userData.userId);
      
      // 🎯 ENHANCED STATUS - Get online/offline and working status
      const enhancedStatus = await getEnhancedUserStatus(userData.userId);
      
      // 🎯 ENHANCED SCREENSHOTS - Get individual screenshots with details
      const enhancedScreenshots = await getEnhancedUserScreenshots(userData.userId, from, to);
      
      const enhancedUserData = {
        // 👤 REAL NAME (like "Levi Daniels" from TimeDoctor dashboard)
        name: userLookup.username,
        email: userData.userInfo?.email || 'Unknown',
        userId: userData.userId,
        realName: userLookup.username,
        realEmail: userLookup.email,
        timezone: userData.userInfo?.timezone || userLookup.timezone || 'Unknown',
        role: userData.userInfo?.role || userLookup.role || 'user',
        processedAt: new Date().toISOString(),
        
        // 🎯 ENHANCED STATUS INFORMATION
        status: enhancedStatus.status,
        onlineStatus: enhancedStatus.onlineStatus, // 'online' | 'offline'
        workingStatus: enhancedStatus.workingStatus, // 'currently_working' | 'recently_worked' | 'not_working'
        isCurrentlyWorking: enhancedStatus.isCurrentlyWorking,
        isOnline: enhancedStatus.onlineStatus === 'online',
        lastSeen: enhancedStatus.lastSeen,
        minutesSinceLastSeen: enhancedStatus.statusDetails?.minutesSinceLastSeen,
        
        // 🎯 DEVICE OWNER INFO
        deviceOwner: userLookup.username,
        whoOwnsThisDevice: userLookup.username,
        
        // 📊 SUMMARY COUNTS
        lookupSuccess: userLookup.success,
        hasData: userData.summary?.hasData || false,
        totalActivities: userData.activitySummary?.totalRecords || 0,
        totalScreenshots: enhancedScreenshots.totalCount || 0,
        totalDisconnections: userData.disconnectionEvents?.totalEvents || 0,
        totalTimeUsage: userData.timeUsage?.totalRecords || 0,
        
        // 🎯 COMPLETE ACTIVITY DATA ARRAYS
        activities: userData.activitySummary?.data || [],
        timeUsage: userData.timeUsage?.data || [],
        disconnections: userData.disconnectionEvents?.data || [],
        
        // 🎯 ENHANCED SCREENSHOTS WITH DETAILS
        screenshots: enhancedScreenshots.screenshots || [],
        screenshotSummary: {
          totalCount: enhancedScreenshots.totalCount,
          averageProductivityScore: enhancedScreenshots.averageScore,
          productivityLevel: enhancedScreenshots.productivityLevel,
          productiveCount: enhancedScreenshots.productiveCount,
          unproductiveCount: enhancedScreenshots.unproductiveCount,
          morningScreenshots: enhancedScreenshots.morningScreenshots,
          afternoonScreenshots: enhancedScreenshots.afternoonScreenshots,
          eveningScreenshots: enhancedScreenshots.eveningScreenshots
        },
        
        // 📈 PRODUCTIVITY & STATS DATA  
        productivityStats: userData.productivityStats?.data || null,
        overallStats: userData.overallStats?.data || null,
        
        // 📅 DATE RANGE
        dateRange: { from, to },
        
        // 🔍 USER INFO & LOOKUP DETAILS
        user: {
          userId: userData.userId,
          
          // 🎯 FIXED: Real names from TimeDoctor (like dashboard shows)
          deviceOwner: userLookup.username,
          whoOwnsThisDevice: userLookup.username,
          realName: userLookup.username,
          realUsername: userLookup.username,
          realEmail: userLookup.email,
          realTimezone: userLookup.timezone,
          realRole: userLookup.role,
          
          // 🎯 ENHANCED STATUS
          onlineStatus: enhancedStatus.onlineStatus,
          workingStatus: enhancedStatus.workingStatus,
          isCurrentlyWorking: enhancedStatus.isCurrentlyWorking,
          lastSeen: enhancedStatus.lastSeen,
          statusDetails: enhancedStatus.statusDetails,
          
          // Original device name (for reference)
          deviceName: userData.userInfo?.name || 'Unknown Device',
          email: userData.userInfo?.email || 'Unknown',
          
          // 🔍 LOOKUP SUCCESS INFORMATION
          lookupMethod: userLookup.method,
          lookupError: userLookup.error || null,
          lookupSuccess: userLookup.success,
          confidence: userLookup.confidence,
          
          timezone: userData.userInfo?.timezone || 'Unknown',
          lastSeen: userData.userInfo?.lastSeenGlobal,
          deviceInfo: {
            ...userData.userInfo?.deviceInfo || {},
            deviceOwner: userLookup.username,
            whoOwnsThisDevice: userLookup.username,
            enrichedWithRealData: true,
            enrichedAt: new Date().toISOString()
          }
        },
        
        // 👤 EMPLOYEE IDENTIFICATION (FIXED TO SHOW REAL NAMES)
        monitoring: {
          dateRange: userData.dateRange,
          hasData: userData.summary?.hasData || false,
          totalActivities: userData.activitySummary?.totalRecords || 0,
          totalScreenshots: enhancedScreenshots.totalCount || 0,
          totalDisconnections: userData.disconnectionEvents?.totalEvents || 0,
          totalTimeUsageRecords: userData.timeUsage?.totalRecords || 0,
          
          // 🎯 ENHANCED STATUS MONITORING
          currentStatus: {
            online: enhancedStatus.onlineStatus,
            working: enhancedStatus.workingStatus,
            isActive: enhancedStatus.isCurrentlyWorking,
            lastActivity: enhancedStatus.lastActivity
          },
          
          employeeIdentification: {
            identifiedName: userLookup.username,
            identifiedEmail: userLookup.email,
            deviceOwner: userLookup.username,
            whoOwnsThisDevice: userLookup.username,
            identificationMethod: userLookup.method,
            confidenceLevel: userLookup.confidence,
            monitoringReliable: userLookup.success
          }
        },
        
        // 🔍 DEBUG & MONITORING STATUS
        monitoringStatus: {
          activityStatus: userData.activitySummary?.status || 'no_data',
          screenshotStatus: enhancedScreenshots.totalCount > 0 ? 'has_data' : 'no_data',
          timeUsageStatus: userData.timeUsage?.status || 'no_data',
          disconnectionStatus: userData.disconnectionEvents?.status || 'no_data',
          overallStatus: enhancedStatus.onlineStatus
        }
      };
      
      console.log(`✅ [ENHANCED] Added "${userLookup.username}" with STATUS + SCREENSHOTS`);
      console.log(`   👤 Status: ${enhancedStatus.onlineStatus} / ${enhancedStatus.workingStatus}`);
      console.log(`   📊 Activities: ${enhancedUserData.totalActivities}`);
      console.log(`   📸 Screenshots: ${enhancedUserData.totalScreenshots} (avg score: ${enhancedScreenshots.averageScore})`);
      console.log(`   ⏱️  Time Usage: ${enhancedUserData.totalTimeUsage}`);
      console.log(`   🔌 Disconnections: ${enhancedUserData.totalDisconnections}`);
      
      allUsersWithCompleteData.push(enhancedUserData);
      
      // Small delay between user processing
      await new Promise(resolve => setTimeout(resolve, 500)); // Increased delay for API calls
    }

    // 🎯 CREATE ONE SINGLE JSON PAYLOAD WITH STATUS, SCREENSHOTS & COMPLETE DATA
    const oneCallPayload = {
      batchInfo: {
        type: 'ALL_USERS_WITH_STATUS_SCREENSHOTS_AND_COMPLETE_DATA_IN_ONE_CALL',
        totalUsers: allUsersWithCompleteData.length,
        timestamp: new Date().toISOString(),
        source: 'timekeeper-workspace-services-enhanced-with-status-screenshots',
        webhookUrl: N8N_WEBHOOK_URL,
        description: 'ALL users with STATUS + SCREENSHOTS + COMPLETE activity data in ONE webhook call!',
        includes: [
          'FIXED real usernames like "Levi Daniels", "Joshua Banks"',
          'ONLINE/OFFLINE status and working status for each user',
          'Individual screenshots with productivity scores and details',
          'Complete activities array with detailed records',
          'TimeUsage array with app/website usage patterns',
          'Disconnections array with idle time data',
          'Productivity stats and overall statistics'
        ],
        dateRange: { from, to }
      },
      
      // 👥 ALL USERS WITH STATUS, SCREENSHOTS & COMPLETE ACTIVITY DATA
      allUsers: allUsersWithCompleteData,
      
      // 📈 ENHANCED SUMMARY
      summary: {
        totalUsers: allUsersWithCompleteData.length,
        usersWithData: allUsersWithCompleteData.filter(u => u.hasData).length,
        usersWithFixedNames: allUsersWithCompleteData.filter(u => u.lookupSuccess).length,
        usersOnline: allUsersWithCompleteData.filter(u => u.isOnline).length,
        usersCurrentlyWorking: allUsersWithCompleteData.filter(u => u.isCurrentlyWorking).length,
        totalActivities: allUsersWithCompleteData.reduce((sum, u) => sum + u.totalActivities, 0),
        totalScreenshots: allUsersWithCompleteData.reduce((sum, u) => sum + u.totalScreenshots, 0),
        totalTimeUsage: allUsersWithCompleteData.reduce((sum, u) => sum + u.totalTimeUsage, 0),
        totalDisconnections: allUsersWithCompleteData.reduce((sum, u) => sum + u.totalDisconnections, 0),
        realNamesFound: allUsersWithCompleteData.map(u => u.name),
        onlineUsers: allUsersWithCompleteData.filter(u => u.isOnline).map(u => u.name),
        workingUsers: allUsersWithCompleteData.filter(u => u.isCurrentlyWorking).map(u => u.name),
        dateRange: { from, to },
        generatedAt: new Date().toISOString()
      }
    };

    console.log('\n📤 [ENHANCED] Sending ALL users with STATUS + SCREENSHOTS + COMPLETE DATA...');
    console.log(`📊 Total users: ${allUsersWithCompleteData.length}`);
    console.log(`👤 Users online: ${oneCallPayload.summary.usersOnline}`);
    console.log(`💼 Users working: ${oneCallPayload.summary.usersCurrentlyWorking}`);
    console.log(`📊 Total activities: ${oneCallPayload.summary.totalActivities}`);
    console.log(`📸 Total screenshots: ${oneCallPayload.summary.totalScreenshots}`);
    console.log(`✅ Names: ${oneCallPayload.summary.realNamesFound.join(', ')}`);
    console.log(`🟢 Online: ${oneCallPayload.summary.onlineUsers.join(', ') || 'None'}`);
    console.log(`💼 Working: ${oneCallPayload.summary.workingUsers.join(', ') || 'None'}`);
    console.log(`🔗 Webhook: ${N8N_WEBHOOK_URL}`);
    
    // 🚀 SEND ONE SINGLE ENHANCED WEBHOOK CALL
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Workspace-Services-Enhanced-Status-Screenshots/1.0'
      },
      body: JSON.stringify(oneCallPayload),
      timeout: 60000 // Increased timeout for larger payloads
    });

    console.log(`📡 Response: ${response.status} ${response.statusText}`);

    if (response.ok) {
      console.log('\n✅ [ENHANCED] ONE CALL SUCCESS!');
      console.log(`🎉 Sent ALL ${allUsersWithCompleteData.length} users with STATUS + SCREENSHOTS!`);
      console.log(`👤 Online users: ${oneCallPayload.summary.usersOnline}`);
      console.log(`💼 Working users: ${oneCallPayload.summary.usersCurrentlyWorking}`);
      console.log(`📸 Total screenshots: ${oneCallPayload.summary.totalScreenshots} with productivity scores!`);
      return true;
    } else {
      const errorText = await response.text().catch(() => 'Unable to read response');
      console.error(`❌ [ENHANCED] ONE CALL FAILED: ${response.status} ${response.statusText}`);
      console.error(`❌ Error: ${errorText}`);
      return false;
    }
    
  } catch (error) {
    console.error(`❌ [ENHANCED] Error during enhanced one-call sync: ${error.message}`);
    console.error(error.stack);
    return false;
  }
}

// ==================== DEBUG ENDPOINTS ====================

/**
 * @route   GET /api/debug/userStatus/:userId
 * @desc    DEBUG user online/offline status
 */
app.get('/api/debug/userStatus/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`🔍 [DEBUG] Testing user status for: ${userId}`);
    
    const enhancedStatus = await getEnhancedUserStatus(userId);
    
    res.json({
      success: true,
      message: 'User status debug completed',
      userId: userId,
      status: enhancedStatus,
      explanation: {
        onlineStatus: enhancedStatus.onlineStatus === 'online' ? 
          '✅ User is online (active within 15 minutes)' : 
          '⚠️ User is offline (no activity in 15+ minutes)',
        workingStatus: enhancedStatus.isCurrentlyWorking ? 
          '💼 User is currently working' : 
          '⏸️ User is not actively working',
        lastSeen: enhancedStatus.lastSeen ? 
          `Last seen: ${new Date(enhancedStatus.lastSeen).toLocaleString()}` : 
          'No last seen data available'
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      userId: req.params.userId
    });
  }
});

/**
 * @route   GET /api/debug/userScreenshots/:userId
 * @desc    DEBUG user screenshots
 */
app.get('/api/debug/userScreenshots/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];
    
    console.log(`📸 [DEBUG] Testing user screenshots for: ${userId}`);
    
    const enhancedScreenshots = await getEnhancedUserScreenshots(userId, from, to);
    
    res.json({
      success: true,
      message: 'User screenshots debug completed',
      userId: userId,
      screenshots: enhancedScreenshots,
      summary: {
        totalScreenshots: enhancedScreenshots.totalCount,
        averageScore: enhancedScreenshots.averageScore,
        productivityLevel: enhancedScreenshots.productivityLevel,
        sampleScreenshots: enhancedScreenshots.screenshots.slice(0, 3)
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      userId: req.params.userId
    });
  }
});

/**
 * @route   GET /api/debug/fixedUserLookup/:userId
 * @desc    DEBUG the FIXED user lookup
 */
app.get('/api/debug/fixedUserLookup/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`🔍 [DEBUG] Testing FIXED user lookup for: ${userId}`);
    
    const result = await getFixedUserLookup(userId);
    
    res.json({
      success: true,
      message: 'FIXED user lookup debug completed',
      userId: userId,
      result: result,
      explanation: {
        whatHappened: result.success 
          ? `✅ Found real username: "${result.username}"` 
          : `❌ User not found, using fallback: "${result.username}"`,
        method: result.method,
        confidence: result.confidence,
        nextSteps: result.success 
          ? 'User will show with real name + status + screenshots in ONE webhook call to n8n'
          : 'Check if userId exists in TimeDoctor or update user profile'
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      userId: req.params.userId
    });
  }
});

/**
 * @route   GET /api/debug/allUsers
 * @desc    See all users with status preview
 */
app.get('/api/debug/allUsers', async (req, res) => {
  try {
    console.log('📊 [DEBUG] Fetching all TimeDoctor users with status preview...');
    
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
      displayName: user.displayName || 'NO DISPLAY NAME', 
      username: user.username || 'NO USERNAME',
      fullName: user.fullName || 'NO FULL NAME',
      email: user.email || 'NO EMAIL',
      role: user.role || 'NO ROLE',
      status: user.status || 'NO STATUS',
      lastSeen: user.lastSeenGlobal || user.lastSeen || 'Never',
      
      // Show what name will be used in webhook
      finalName: user.name || 
               user.displayName || 
               user.fullName || 
               user.username ||
               `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
               user.email?.split('@')[0] ||
               'Unknown User'
    }));
    
    console.log(`✅ [DEBUG] Found ${userList.length} users in TimeDoctor`);
    
    res.json({
      success: true,
      message: `Found ${userList.length} users - will get STATUS + SCREENSHOTS for each in ONE webhook call`,
      totalUsers: userList.length,
      data: userList,
      testEndpoints: [
        'GET /api/debug/userStatus/{userId} - Test status detection',
        'GET /api/debug/userScreenshots/{userId} - Test screenshot analysis',
        'GET /api/debug/fixedUserLookup/{userId} - Test name lookup'
      ]
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== MANUAL SYNC ENDPOINTS ====================

/**
 * @route   POST /api/sync/now
 * @desc    Manually trigger enhanced ONE CALL sync with status + screenshots
 */
app.post('/api/sync/now', async (req, res) => {
  try {
    console.log('🚀 [MANUAL] Manual ENHANCED ONE CALL sync with STATUS + SCREENSHOTS triggered...');
    
    // Run ONE CALL sync in background
    syncAllUsersToN8N_OneCall().then(() => {
      console.log('✅ [MANUAL] Background ENHANCED ONE CALL sync completed');
    }).catch(error => {
      console.error('❌ [MANUAL] Background ENHANCED ONE CALL sync failed:', error.message);
    });
    
    res.json({
      success: true,
      message: 'Manual ENHANCED ONE CALL sync started in background',
      description: 'ALL users with STATUS + SCREENSHOTS + COMPLETE activity data will be sent in ONE webhook call',
      status: 'ENHANCED sync is running, check console for progress',
      enhancement: 'Includes online/offline status and individual screenshots for each user!'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== HEALTH ENDPOINT ====================

/**
 * @route   GET /api/health
 * @desc    Health check with ENHANCED status + screenshots
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'TimeDoctor API Server with STATUS + SCREENSHOTS + FIXED Usernames',
    timestamp: new Date().toISOString(),
    enhancements: {
      userStatus: 'NEW - Gets online/offline and working status for each user',
      individualScreenshots: 'NEW - Gets individual screenshots with productivity scores',
      fixedUsernames: 'Gets real names like "Levi Daniels", "Joshua Banks"',
      oneCallWebhook: 'ALL users sent in ONE JSON payload to n8n',
      completeActivityData: 'Full activities, screenshots, timeUsage, disconnections arrays'
    },
    newFeatures: {
      onlineOfflineStatus: 'Each user shows online/offline status',
      workingStatus: 'Detects if user is currently working, recently worked, or not working',
      enhancedScreenshots: 'Individual screenshots with productivity scores and timing analysis',
      statusTracking: 'Tracks last seen time and activity recency'
    },
    testEndpoints: [
      'GET /api/debug/userStatus/{userId} - Test online/offline status detection',
      'GET /api/debug/userScreenshots/{userId} - Test individual screenshots',
      'GET /api/debug/fixedUserLookup/{userId} - Test name lookup',
      'GET /api/debug/allUsers - See all users with status preview',
      'POST /api/sync/now - Manual sync with STATUS + SCREENSHOTS'
    ],
    webhookConfig: {
      url: N8N_WEBHOOK_URL,
      sendOnce: SEND_ONCE_ON_STARTUP,
      sendRecurring: SEND_RECURRING,
      method: 'ONE CALL - All users with STATUS + SCREENSHOTS + activity data'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /api/health - Server health with ENHANCED features',
      'GET /api/debug/userStatus/:userId - Test user online/offline status',
      'GET /api/debug/userScreenshots/:userId - Test user screenshots',
      'GET /api/debug/fixedUserLookup/:userId - Test FIXED user lookup',
      'GET /api/debug/allUsers - See all users with status preview',
      'POST /api/sync/now - Manually trigger ENHANCED sync'
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
  console.log('\n🚀 TimeDoctor API Server - ENHANCED with STATUS + SCREENSHOTS');
  console.log('================================================================');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`📧 Email: ${config.credentials.email}`);
  console.log(`🏢 Company: ${config.credentials.companyName}`);
  console.log('\n🔥 NEW ENHANCED FEATURES:');
  console.log('========================');
  console.log('🎯 1. ONLINE/OFFLINE Status - Know who is online right now');
  console.log('🎯 2. WORKING Status - Detect currently working vs not working');
  console.log('🎯 3. Individual Screenshots - Get all screenshots with productivity scores');
  console.log('🎯 4. Enhanced User Data - Complete user profiles with status');
  console.log('🎯 5. Real Names - Fixed usernames like "Levi Daniels", "Joshua Banks"');
  console.log('\n🔍 TEST THE NEW FEATURES:');
  console.log('========================');
  console.log('1. Test user status: GET  /api/debug/userStatus/{userId}');
  console.log('2. Test screenshots: GET  /api/debug/userScreenshots/{userId}');
  console.log('3. Check all users: GET  /api/debug/allUsers');  
  console.log('4. Manual sync: POST /api/sync/now');
  console.log('\n🎉 ENHANCED WEBHOOK INCLUDES:');
  console.log('============================');
  console.log(`✅ Real employee names (Alice Hale, Levi Daniels, etc.)`);
  console.log(`✅ Online/Offline status for each user`);
  console.log(`✅ Working/Not Working status`);
  console.log(`✅ Individual screenshots with scores`);
  console.log(`✅ Complete activity data arrays`);
  console.log(`✅ Productivity analysis per user`);
  console.log(`✅ Last seen timestamps`);
  
  // 🚀 ENHANCED: Send data ONCE on startup with STATUS + SCREENSHOTS
  if (SEND_ONCE_ON_STARTUP) {
    setTimeout(() => {
      console.log('\n🚀 [STARTUP] Running ENHANCED sync with STATUS + SCREENSHOTS...');
      console.log('🎯 This includes online/offline status and individual screenshots!');
      syncAllUsersToN8N_OneCall();
    }, 10000); // Wait 10 seconds for server to fully start
  } else {
    console.log('\n⏸️ One-time sync disabled. Use POST /api/sync/now to manually trigger');
  }
  
  console.log('\n🎯 Server ready! STATUS + SCREENSHOTS + complete data coming up!');
  console.log('🎉 Your n8n will show online/offline status and individual screenshots!');
});

module.exports = app;