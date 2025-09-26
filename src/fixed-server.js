const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const fetch = require('node-fetch');
const TimeDoctorAPI = require('./api');
const config = require('./config');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// N8N Webhook Configuration - FIXED: Updated to correct webhook-test URL
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.srv470812.hstgr.cloud/webhook-test/workspace-url-n8n';

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
 * 🎯 GET ENHANCED SCREENSHOTS WITH VIEWABLE URLS
 */
async function getEnhancedUserScreenshots(userId, dateFrom, dateTo) {
  try {
    console.log(`📸 [SCREENSHOTS] Getting enhanced screenshots with URLs for user: ${userId}`);
    
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
    
    // Process screenshots with enhanced details and viewable URLs
    const enhancedScreenshots = screenshots.map(screenshot => {
      const screenshotId = screenshot.id;
      const timestamp = screenshot.timestamp || screenshot.start;
      
      return {
        id: screenshotId,
        userId: screenshot.userId || userId,
        timestamp: timestamp,
        score: screenshot.score || 0,
        category: screenshot.category,
        title: screenshot.title || screenshot.windowTitle || 'Unknown Activity',
        
        // 🎯 ENHANCED: Multiple ways to view the screenshot
        originalUrl: screenshot.url, // Original TimeDoctor URL
        thumbnailUrl: screenshot.thumbnailUrl, // Thumbnail URL
        viewableUrl: `http://localhost:${PORT}/api/screenshot/view/${screenshotId}?userId=${userId}`, // Direct view through our server
        downloadUrl: `http://localhost:${PORT}/api/screenshot/download/${screenshotId}?userId=${userId}`, // Download link
        proxyUrl: `http://localhost:${PORT}/api/screenshot/proxy/${screenshotId}?userId=${userId}`, // Proxy URL for CORS issues
        
        // Enhanced fields
        productivityScore: screenshot.score || 0,
        isProductive: (screenshot.score || 0) >= 5, // 5+ is productive
        timeOfDay: timestamp ? new Date(timestamp).toLocaleTimeString() : 'Unknown',
        dayOfWeek: timestamp ? new Date(timestamp).toLocaleDateString('en-US', { weekday: 'long' }) : 'Unknown',
        
        // Screenshot metadata
        width: screenshot.width,
        height: screenshot.height,
        fileSize: screenshot.fileSize,
        device: screenshot.device || screenshot.deviceName || 'Unknown Device',
        
        // Additional data
        windowTitle: screenshot.windowTitle,
        applicationName: screenshot.applicationName,
        websiteUrl: screenshot.websiteUrl,
        activityType: screenshot.activityType || 'unknown'
      };
    });
    
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
      }).length,
      
      // 🎯 ENHANCED: Quick access URLs
      latestScreenshotUrl: enhancedScreenshots.length > 0 ? 
        enhancedScreenshots[enhancedScreenshots.length - 1].viewableUrl : null,
      bestProductiveScreenshot: enhancedScreenshots
        .filter(s => s.isProductive)
        .sort((a, b) => (b.productivityScore || 0) - (a.productivityScore || 0))[0]?.viewableUrl || null
    };
    
    console.log(`✅ [SCREENSHOTS] Enhanced ${userId}: ${screenshotSummary.totalCount} screenshots, avg score: ${screenshotSummary.averageScore}`);
    console.log(`📸 [SCREENSHOTS] Latest screenshot URL: ${screenshotSummary.latestScreenshotUrl}`);
    
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

// ==================== SCREENSHOT VIEWING ENDPOINTS ====================

/**
 * 🎯 VIEW SCREENSHOT DIRECTLY - Returns HTML page with the screenshot
 */
app.get('/api/screenshot/view/:screenshotId', async (req, res) => {
  try {
    const { screenshotId } = req.params;
    const { userId } = req.query;
    
    console.log(`📸 [VIEW] Viewing screenshot ${screenshotId} for user ${userId}`);
    
    // Get screenshot details
    const screenshotDetails = await api.getScreenshot(screenshotId);
    
    if (!screenshotDetails.success || !screenshotDetails.data) {
      return res.status(404).send(`
        <html><body>
          <h1>Screenshot Not Found</h1>
          <p>Screenshot ID: ${screenshotId}</p>
          <p>User ID: ${userId}</p>
        </body></html>
      `);
    }
    
    const screenshot = screenshotDetails.data;
    const screenshotUrl = screenshot.url || screenshot.thumbnailUrl;
    
    if (!screenshotUrl) {
      return res.status(404).send(`
        <html><body>
          <h1>Screenshot URL Not Available</h1>
          <p>Screenshot ID: ${screenshotId}</p>
        </body></html>
      `);
    }
    
    // Return HTML page with the screenshot
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Screenshot - ${screenshot.title || 'Unknown'}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .screenshot-container { text-align: center; }
          .screenshot { max-width: 100%; border: 1px solid #ddd; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .metadata { background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px; }
          .score { font-size: 24px; font-weight: bold; color: ${(screenshot.score || 0) >= 5 ? 'green' : 'orange'}; }
        </style>
      </head>
      <body>
        <div class="screenshot-container">
          <h1>📸 Screenshot Preview</h1>
          <img src="${screenshotUrl}" alt="Screenshot" class="screenshot" />
          
          <div class="metadata">
            <h3>Screenshot Details</h3>
            <p><strong>Title:</strong> ${screenshot.title || screenshot.windowTitle || 'Unknown'}</p>
            <p><strong>Productivity Score:</strong> <span class="score">${screenshot.score || 0}/10</span></p>
            <p><strong>Timestamp:</strong> ${screenshot.timestamp ? new Date(screenshot.timestamp).toLocaleString() : 'Unknown'}</p>
            <p><strong>User ID:</strong> ${userId}</p>
            <p><strong>Application:</strong> ${screenshot.applicationName || 'Unknown'}</p>
            <p><strong>Website:</strong> ${screenshot.websiteUrl || 'N/A'}</p>
            <p><strong>Device:</strong> ${screenshot.device || screenshot.deviceName || 'Unknown'}</p>
          </div>
          
          <div>
            <a href="${screenshotUrl}" target="_blank">🔗 Open Original</a> | 
            <a href="/api/screenshot/download/${screenshotId}?userId=${userId}">💾 Download</a> |
            <a href="/api/screenshot/proxy/${screenshotId}?userId=${userId}">🖼️ Direct Image</a>
          </div>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error(`❌ [VIEW] Error viewing screenshot:`, error.message);
    res.status(500).send(`
      <html><body>
        <h1>Error Loading Screenshot</h1>
        <p>Error: ${error.message}</p>
      </body></html>
    `);
  }
});

/**
 * 🎯 PROXY SCREENSHOT - Returns the image directly (for CORS issues)
 */
app.get('/api/screenshot/proxy/:screenshotId', async (req, res) => {
  try {
    const { screenshotId } = req.params;
    const { userId } = req.query;
    
    console.log(`📸 [PROXY] Proxying screenshot ${screenshotId} for user ${userId}`);
    
    // Get screenshot details
    const screenshotDetails = await api.getScreenshot(screenshotId);
    
    if (!screenshotDetails.success || !screenshotDetails.data) {
      return res.status(404).json({ error: 'Screenshot not found' });
    }
    
    const screenshot = screenshotDetails.data;
    const screenshotUrl = screenshot.url || screenshot.thumbnailUrl;
    
    if (!screenshotUrl) {
      return res.status(404).json({ error: 'Screenshot URL not available' });
    }
    
    // Fetch the image and proxy it
    const imageResponse = await fetch(screenshotUrl, {
      headers: {
        'User-Agent': 'Workspace-Services-Screenshot-Proxy/1.0'
      }
    });
    
    if (!imageResponse.ok) {
      console.error(`❌ [PROXY] Failed to fetch screenshot: ${imageResponse.status}`);
      return res.status(404).json({ error: 'Failed to fetch screenshot image' });
    }
    
    // Set appropriate headers
    res.setHeader('Content-Type', imageResponse.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    // Stream the image
    imageResponse.body.pipe(res);
    
  } catch (error) {
    console.error(`❌ [PROXY] Error proxying screenshot:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 🎯 DOWNLOAD SCREENSHOT - Forces download
 */
app.get('/api/screenshot/download/:screenshotId', async (req, res) => {
  try {
    const { screenshotId } = req.params;
    const { userId } = req.query;
    
    console.log(`📸 [DOWNLOAD] Downloading screenshot ${screenshotId} for user ${userId}`);
    
    // Get screenshot details
    const screenshotDetails = await api.getScreenshot(screenshotId);
    
    if (!screenshotDetails.success || !screenshotDetails.data) {
      return res.status(404).json({ error: 'Screenshot not found' });
    }
    
    const screenshot = screenshotDetails.data;
    const screenshotUrl = screenshot.url || screenshot.thumbnailUrl;
    
    if (!screenshotUrl) {
      return res.status(404).json({ error: 'Screenshot URL not available' });
    }
    
    // Fetch the image
    const imageResponse = await fetch(screenshotUrl);
    
    if (!imageResponse.ok) {
      console.error(`❌ [DOWNLOAD] Failed to fetch screenshot: ${imageResponse.status}`);
      return res.status(404).json({ error: 'Failed to fetch screenshot image' });
    }
    
    // Generate filename
    const timestamp = screenshot.timestamp ? new Date(screenshot.timestamp).toISOString().replace(/[:.]/g, '-') : 'unknown';
    const filename = `screenshot-${userId}-${timestamp}.jpg`;
    
    // Set download headers
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Stream the image
    imageResponse.body.pipe(res);
    
  } catch (error) {
    console.error(`❌ [DOWNLOAD] Error downloading screenshot:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 🎯 LIST USER SCREENSHOTS - JSON API
 */
app.get('/api/user/:userId/screenshots', async (req, res) => {
  try {
    const { userId } = req.params;
    const from = req.query.from || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to = req.query.to || new Date().toISOString().split('T')[0];
    
    console.log(`📸 [LIST] Getting screenshots list for user ${userId}`);
    
    const enhancedScreenshots = await getEnhancedUserScreenshots(userId, from, to);
    
    res.json({
      success: true,
      userId: userId,
      dateRange: { from, to },
      screenshots: enhancedScreenshots,
      quickLinks: {
        latestScreenshot: enhancedScreenshots.latestScreenshotUrl,
        bestProductiveScreenshot: enhancedScreenshots.bestProductiveScreenshot
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

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

// ==================== ENHANCED: ALL USERS IN ONE WEBHOOK CALL WITH VIEWABLE SCREENSHOTS ====================

/**
 * 🎯 ENHANCED: Collect all user monitoring data with STATUS & VIEWABLE SCREENSHOTS
 */
async function syncAllUsersToN8N_OneCall() {
  try {
    console.log('\n🚀 [ENHANCED] Starting ONE-CALL sync with STATUS + VIEWABLE SCREENSHOTS...');
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
    
    // 🔥 PROCESS ALL USERS WITH STATUS, VIEWABLE SCREENSHOTS, & COMPLETE ACTIVITY DATA
    const allUsersWithCompleteData = [];
    
    for (const userData of allMonitoringData.data) {
      console.log(`\n🔄 [ENHANCED] Processing user: ${userData.userId}`);
      
      // 🎯 FIXED USERNAME LOOKUP - Get real names like "Levi Daniels", "Joshua Banks"
      const userLookup = await getFixedUserLookup(userData.userId);
      
      // 🎯 ENHANCED STATUS - Get online/offline and working status
      const enhancedStatus = await getEnhancedUserStatus(userData.userId);
      
      // 🎯 ENHANCED SCREENSHOTS WITH VIEWABLE URLS
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
        
        // 🎯 ENHANCED SCREENSHOTS WITH VIEWABLE URLS
        screenshots: enhancedScreenshots.screenshots || [],
        screenshotSummary: {
          totalCount: enhancedScreenshots.totalCount,
          averageProductivityScore: enhancedScreenshots.averageScore,
          productivityLevel: enhancedScreenshots.productivityLevel,
          productiveCount: enhancedScreenshots.productiveCount,
          unproductiveCount: enhancedScreenshots.unproductiveCount,
          morningScreenshots: enhancedScreenshots.morningScreenshots,
          afternoonScreenshots: enhancedScreenshots.afternoonScreenshots,
          eveningScreenshots: enhancedScreenshots.eveningScreenshots,
          
          // 🎯 QUICK ACCESS URLs
          latestScreenshotUrl: enhancedScreenshots.latestScreenshotUrl,
          bestProductiveScreenshotUrl: enhancedScreenshots.bestProductiveScreenshot,
          allScreenshotsUrl: `http://localhost:${PORT}/api/user/${userData.userId}/screenshots`
        },
        
        // 📈 PRODUCTIVITY & STATS DATA  
        productivityStats: userData.productivityStats?.data || null,
        overallStats: userData.overallStats?.data || null,
        
        // 📅 DATE RANGE
        dateRange: { from, to }
      };
      
      console.log(`✅ [ENHANCED] Added "${userLookup.username}" with VIEWABLE SCREENSHOTS`);
      console.log(`   👤 Status: ${enhancedStatus.onlineStatus} / ${enhancedStatus.workingStatus}`);
      console.log(`   📊 Activities: ${enhancedUserData.totalActivities}`);
      console.log(`   📸 Screenshots: ${enhancedUserData.totalScreenshots} (latest: ${enhancedScreenshots.latestScreenshotUrl})`);
      console.log(`   ⏱️  Time Usage: ${enhancedUserData.totalTimeUsage}`);
      console.log(`   🔌 Disconnections: ${enhancedUserData.totalDisconnections}`);
      
      allUsersWithCompleteData.push(enhancedUserData);
      
      // Small delay between user processing
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 🎯 CREATE ONE SINGLE JSON PAYLOAD WITH VIEWABLE SCREENSHOTS + SYSTEM IDENTIFIER
    const oneCallPayload = {
      headers: {
        "host": "n8n.srv470812.hstgr.cloud",
        "user-agent": "Workspace-Services-Fixed-Enhanced-One-Call/1.0",
        "content-length": "2532021",
        "accept": "*/*",
        "accept-encoding": "gzip,deflate",
        "content-type": "application/json",
        "x-forwarded-for": "124.217.31.66",
        "x-forwarded-host": "n8n.srv470812.hstgr.cloud",
        "x-forwarded-port": "443",
        "x-forwarded-proto": "https",
        "x-forwarded-server": "3c5fbe68e13d",
        "x-real-ip": "124.217.31.66"
      },
      params: {},
      query: {},
      body: {
        // 🎯 SYSTEM IDENTIFIER IN BODY
        system: "timedoctor",
        
        batchInfo: {
          type: 'ALL_USERS_WITH_FIXED_USERNAMES_AND_COMPLETE_ACTIVITY_DATA_IN_ONE_CALL',
          totalUsers: allUsersWithCompleteData.length,
          timestamp: new Date().toISOString(),
          source: 'timekeeper-workspace-services-fixed-enhanced',
          webhookUrl: N8N_WEBHOOK_URL,
          description: 'ALL users with FIXED USERNAMES + COMPLETE activity data in ONE webhook call!',
          includes: [
            'FIXED real usernames like "Levi Daniels", "Joshua Banks"',
            'Complete activities array with detailed records',
            'Screenshots array with scores and categories',
            'TimeUsage array with app/website usage patterns',
            'Disconnections array with idle time data',
            'Productivity stats and overall statistics'
          ],
          // 🎯 ENHANCED: Multiple ways to view the screenshot
          system: "timedoctor",
          dateRange: { from, to }
        },
        
        // 👥 ALL USERS WITH VIEWABLE SCREENSHOTS & COMPLETE DATA
        allUsers: allUsersWithCompleteData,
        
        // 📈 ENHANCED SUMMARY
        summary: {
          totalUsers: allUsersWithCompleteData.length,
          usersOnline: allUsersWithCompleteData.filter(u => u.isOnline).length,
          usersCurrentlyWorking: allUsersWithCompleteData.filter(u => u.isCurrentlyWorking).length,
          totalScreenshots: allUsersWithCompleteData.reduce((sum, u) => sum + u.totalScreenshots, 0),
          realNamesFound: allUsersWithCompleteData.map(u => u.name),
          onlineUsers: allUsersWithCompleteData.filter(u => u.isOnline).map(u => u.name),
          workingUsers: allUsersWithCompleteData.filter(u => u.isCurrentlyWorking).map(u => u.name),
          screenshotServerUrl: `http://localhost:${PORT}`,
          system: 'timedoctor', // System identifier in summary too
          dateRange: { from, to },
          generatedAt: new Date().toISOString()
        }
      }
    };

    console.log('\n📤 [ENHANCED] Sending ALL users with VIEWABLE SCREENSHOTS + SYSTEM: timedoctor...');
    console.log(`📊 Total users: ${allUsersWithCompleteData.length}`);
    console.log(`👤 Users online: ${oneCallPayload.body.summary.usersOnline}`);
    console.log(`💼 Users working: ${oneCallPayload.body.summary.usersCurrentlyWorking}`);
    console.log(`📸 Total screenshots: ${oneCallPayload.body.summary.totalScreenshots}`);
    console.log(`🖼️  Screenshot server: http://localhost:${PORT}`);
    console.log(`🏢 System: ${oneCallPayload.body.system}`);
    console.log(`✅ Names: ${oneCallPayload.body.summary.realNamesFound.join(', ')}`);
    console.log(`🟢 Online: ${oneCallPayload.body.summary.onlineUsers.join(', ') || 'None'}`);
    console.log(`💼 Working: ${oneCallPayload.body.summary.workingUsers.join(', ') || 'None'}`);
    
    // 🚀 SEND ONE SINGLE ENHANCED WEBHOOK CALL
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Workspace-Services-Enhanced-Viewable-Screenshots/1.0'
      },
      body: JSON.stringify(oneCallPayload),
      timeout: 60000
    });

    console.log(`📡 Response: ${response.status} ${response.statusText}`);

    if (response.ok) {
      console.log('\n✅ [ENHANCED] SUCCESS! TIMEDOCTOR DATA WITH VIEWABLE SCREENSHOTS SENT!');
      console.log(`🎉 Sent ${allUsersWithCompleteData.length} users with system: "timedoctor" in body!`);
      console.log(`📸 You can now click screenshot URLs to view actual images!`);
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

// ==================== DEBUG ENDPOINTS ====================

app.get('/api/debug/userStatus/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const enhancedStatus = await getEnhancedUserStatus(userId);
    res.json({ success: true, userId, status: enhancedStatus });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/debug/userScreenshots/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];
    
    const enhancedScreenshots = await getEnhancedUserScreenshots(userId, from, to);
    res.json({ success: true, userId, screenshots: enhancedScreenshots });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/debug/allUsers', async (req, res) => {
  try {
    const allUsers = await api.getUsers({ limit: 1000, detail: 'extended' });
    if (!allUsers.data) {
      return res.json({ success: false, message: 'No users found', data: [] });
    }
    
    const userList = allUsers.data.map(user => ({
      userId: user.id,
      name: user.name || 'NO NAME',
      email: user.email || 'NO EMAIL',
      status: user.status || 'NO STATUS',
      screenshotsUrl: `http://localhost:${PORT}/api/user/${user.id}/screenshots`
    }));
    
    res.json({
      success: true,
      message: `Found ${userList.length} users - each will have viewable screenshot URLs`,
      totalUsers: userList.length,
      data: userList,
      testEndpoints: [
        'GET /api/debug/userScreenshots/{userId} - Test viewable screenshots',
        'GET /api/user/{userId}/screenshots - List all screenshots with URLs',
        'GET /api/screenshot/view/{screenshotId}?userId={userId} - View screenshot'
      ]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== MANUAL SYNC & HEALTH ENDPOINTS ====================

app.post('/api/sync/now', async (req, res) => {
  try {
    console.log('🚀 [MANUAL] Manual sync with SYSTEM: timedoctor + VIEWABLE SCREENSHOTS triggered...');
    
    syncAllUsersToN8N_OneCall().then(() => {
      console.log('✅ [MANUAL] Background sync with system: timedoctor completed');
    }).catch(error => {
      console.error('❌ [MANUAL] Background sync failed:', error.message);
    });
    
    res.json({
      success: true,
      message: 'Manual sync with system: "timedoctor" + VIEWABLE SCREENSHOTS started',
      description: 'ALL users with STATUS + VIEWABLE SCREENSHOTS will be sent',
      system: 'timedoctor',
      screenshotFeatures: [
        'Clickable screenshot URLs that show actual images',
        'Multiple viewing options: view, download, proxy',
        'Direct HTML preview with metadata',
        'Productivity scores and timing analysis'
      ]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'TimeDoctor API Server with VIEWABLE SCREENSHOTS + System Identifier',
    timestamp: new Date().toISOString(),
    system: 'timedoctor', // System identifier
    newFeatures: {
      systemIdentifier: 'FIXED - All webhook data includes "system": "timedoctor" in body structure',
      webhookUrl: 'FIXED - Updated to correct /webhook-test/ endpoint',
      viewableScreenshots: 'Clickable URLs to view actual screenshot images',
      multipleViewingOptions: 'View, download, proxy options for each screenshot',
      screenshotServer: 'Built-in server to serve screenshots with metadata',
      directImageAccess: 'No more broken links - direct access to images'
    },
    screenshotEndpoints: [
      'GET /api/screenshot/view/{screenshotId}?userId={userId} - View screenshot in HTML',
      'GET /api/screenshot/proxy/{screenshotId}?userId={userId} - Direct image',
      'GET /api/screenshot/download/{screenshotId}?userId={userId} - Download image',
      'GET /api/user/{userId}/screenshots - List all user screenshots'
    ],
    testEndpoints: [
      'GET /api/debug/userScreenshots/{userId} - Test viewable screenshots',
      'GET /api/debug/allUsers - See all users with screenshot URLs',
      'POST /api/sync/now - Manual sync with system: timedoctor + screenshots'
    ],
    webhookConfig: {
      url: N8N_WEBHOOK_URL,
      system: 'timedoctor',
      includes: 'STATUS + VIEWABLE SCREENSHOTS + complete activity data + system identifier in body'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    system: 'timedoctor',
    availableEndpoints: [
      'GET /api/health - Server health with screenshot features',
      'GET /api/screenshot/view/{screenshotId}?userId={userId} - View screenshot',
      'GET /api/user/{userId}/screenshots - List user screenshots',
      'GET /api/debug/userScreenshots/{userId} - Test screenshots',
      'POST /api/sync/now - Manual sync with system: timedoctor + screenshots'
    ]
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error', 
    message: err.message,
    system: 'timedoctor'
  });
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log('\n🚀 TimeDoctor API Server - FIXED WEBHOOK URL + SYSTEM IDENTIFIER + VIEWABLE SCREENSHOTS');
  console.log('========================================================================================');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`📧 Email: ${config.credentials.email}`);
  console.log(`🏢 Company: ${config.credentials.companyName}`);
  console.log(`🏢 System: timedoctor`);
  console.log(`🔗 Webhook: ${N8N_WEBHOOK_URL}`);
  console.log('\n🔥 FIXES APPLIED:');
  console.log('================');
  console.log('🎯 1. FIXED WEBHOOK URL - Now using /webhook-test/ instead of /webhook/');
  console.log('🎯 2. SYSTEM IDENTIFIER - All webhook data includes "system": "timedoctor" in body');
  console.log('🎯 3. VIEWABLE SCREENSHOTS - Click URLs to see actual images');
  console.log('🎯 4. Multiple Viewing Options - View, download, proxy each screenshot');
  console.log('🎯 5. Screenshot Server - Built-in server with HTML previews');
  console.log('🎯 6. Direct Image Access - No more broken screenshot links');
  console.log('🎯 7. Productivity Analysis - Scores and metadata for each image');
  console.log('\n📸 SCREENSHOT ENDPOINTS:');
  console.log('=======================');
  console.log(`1. View screenshot: GET  /api/screenshot/view/{screenshotId}?userId={userId}`);
  console.log(`2. Direct image: GET  /api/screenshot/proxy/{screenshotId}?userId={userId}`);
  console.log(`3. Download image: GET  /api/screenshot/download/{screenshotId}?userId={userId}`);
  console.log(`4. List screenshots: GET  /api/user/{userId}/screenshots`);
  console.log('\n🔍 TEST THE FEATURES:');
  console.log('====================');
  console.log('1. Test screenshots: GET  /api/debug/userScreenshots/{userId}');
  console.log('2. Check all users: GET  /api/debug/allUsers');  
  console.log('3. Manual sync: POST /api/sync/now');
  console.log('\n🎉 YOUR N8N SHOULD NOW RECEIVE:');
  console.log('===============================');
  console.log(`✅ "system": "timedoctor" identifier in body structure`);
  console.log(`✅ Real employee names (Alice Hale, Levi Daniels, etc.)`);
  console.log(`✅ Online/Offline status for each user`);
  console.log(`✅ CLICKABLE screenshot URLs you can view directly`);
  console.log(`✅ Multiple ways to access each screenshot`);
  console.log(`✅ Complete activity data arrays`);
  console.log(`✅ Productivity scores per screenshot`);
  console.log(`✅ NO MORE 404 ERRORS - Correct webhook endpoint!`);
  
  if (SEND_ONCE_ON_STARTUP) {
    setTimeout(() => {
      console.log('\n🚀 [STARTUP] Running sync with CORRECTED webhook URL + SYSTEM: timedoctor...');
      console.log(`🔗 Using: ${N8N_WEBHOOK_URL}`);
      console.log('📸 This includes "system": "timedoctor" in body + clickable screenshot URLs!');
      syncAllUsersToN8N_OneCall();
    }, 10000);
  }
  
  console.log('\n🎯 Server ready! FIXED webhook + SYSTEM: timedoctor in body + VIEWABLE SCREENSHOTS!');
  console.log('🎉 Your n8n will now receive data at the correct endpoint with system identifier!');
});

module.exports = app;