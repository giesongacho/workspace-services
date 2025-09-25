/**
 * Send individual user data to n8n webhook WITH REAL USER NAME
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