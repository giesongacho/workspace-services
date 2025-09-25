const fetch = require('node-fetch');
const AuthManager = require('./auth');
const config = require('./config');

class TimeDoctorAPI {
  constructor() {
    this.authManager = new AuthManager();
    this.baseUrl = config.api.baseUrl;
    this.version = config.api.version;
    
    console.log('👤 TimeDoctorAPI initialized with USERNAME priority lookup');
  }

  /**
   * Make authenticated API request
   */
  async request(endpoint, options = {}) {
    // Get current token and company ID
    const { token, companyId } = await this.authManager.getCredentials();
    
    // Replace {companyId} placeholder in endpoint if present
    endpoint = endpoint.replace('{companyId}', companyId);
    
    const url = endpoint.startsWith('http') 
      ? endpoint 
      : `${this.baseUrl}${endpoint}`;
    
    const defaultHeaders = {
      'Authorization': `JWT ${token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    const requestOptions = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers
      }
    };

    if (config.isDevelopment) {
      console.log(`🔍 API Request: ${options.method || 'GET'} ${url}`);
    }

    try {
      const response = await fetch(url, requestOptions);
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
        
        if (response.status === 401) {
          // Token might be expired, try to re-authenticate
          console.log('🔄 Token expired, re-authenticating...');
          await this.authManager.clearCache();
          await this.authManager.authenticate();
          
          // Retry the request once
          const { token: newToken } = await this.authManager.getCredentials();
          requestOptions.headers['Authorization'] = `JWT ${newToken}`;
          
          const retryResponse = await fetch(url, requestOptions);
          if (retryResponse.ok) {
            return await retryResponse.json();
          }
          errorMessage = 'Unauthorized: Authentication failed after retry';
        } else if (response.status === 403) {
          errorMessage = 'Forbidden: Insufficient permissions for this resource';
        } else if (response.status === 404) {
          errorMessage = 'Not Found: Resource or endpoint does not exist';
        }
        
        console.error(`❌ ${errorMessage}`);
        if (errorText) {
          console.error('Details:', errorText);
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if (error.message.includes('fetch')) {
        console.error('❌ Network error: Unable to connect to TimeDoctor API');
      }
      throw error;
    }
  }

  /**
   * Fetch all pages of data automatically
   */
  async fetchAllPages(endpoint, params = {}, pageParam = 'page') {
    console.log('📄 Fetching all data (automatic pagination)...');
    
    let allData = [];
    let page = 1;
    let hasMoreData = true;
    const maxLimit = 1000; // Maximum records per page
    
    // Set maximum limit per page for efficiency
    params.limit = params.limit || maxLimit;
    
    while (hasMoreData) {
      // Add page parameter
      const paginatedParams = { ...params, [pageParam]: page };
      const query = new URLSearchParams(paginatedParams).toString();
      const paginatedEndpoint = `${endpoint}${endpoint.includes('?') ? '&' : '?'}${query}`;
      
      console.log(`📄 Fetching page ${page}...`);
      const response = await this.request(paginatedEndpoint, { method: 'GET' });
      
      if (response.data && Array.isArray(response.data)) {
        const pageData = response.data;
        allData = allData.concat(pageData);
        
        console.log(`  ✅ Page ${page}: Retrieved ${pageData.length} records (Total: ${allData.length})`);
        
        // Check if there's more data
        if (pageData.length < params.limit) {
          // Less data than limit means this is the last page
          hasMoreData = false;
          console.log('📊 All data retrieved!');
        } else {
          // Check if we have pagination info in response
          if (response.pagination) {
            hasMoreData = response.pagination.hasMore || 
                        response.pagination.has_more || 
                        response.pagination.next_page ||
                        (response.pagination.total_pages && page < response.pagination.total_pages);
          } else {
            // Continue to next page if we got full page of data
            page++;
          }
        }
      } else if (response.data && !Array.isArray(response.data)) {
        // Single response, not paginated
        console.log('📄 Single page response received');
        return response;
      } else {
        // No more data
        hasMoreData = false;
      }
      
      // Safety check to prevent infinite loops
      if (page > 100) {
        console.warn('⚠️  Reached maximum page limit (100), stopping pagination');
        hasMoreData = false;
      }
    }
    
    // Return response in same format as original
    return {
      data: allData,
      total: allData.length,
      fetched_all: true
    };
  }

  /**
   * Get current company ID
   */
  async getCompanyId() {
    const { companyId } = await this.authManager.getCredentials();
    return companyId;
  }

  /**
   * Get REAL TimeDoctor USERNAME (the person who owns the device)
   * This is what identifies WHO is using the laptop/computer
   * 
   * @param {string} userId - User ID to lookup
   * @returns {object} User identification information
   */
  async getUserOwnerInfo(userId) {
    console.log(`👤 Getting REAL USERNAME for user ${userId}...`);
    
    const userInfo = {
      userId: userId,
      username: 'Unknown User',
      fullName: null,
      email: null,
      timezone: null,
      role: null,
      status: null,
      computerName: null,
      lookupMethod: 'none',
      success: false,
      error: null,
      confidence: 'low'
    };

    try {
      // Strategy 1: Direct user lookup - this should get the username
      console.log(`👤 Strategy 1: Direct user lookup for ${userId}`);
      
      const userDetails = await this.getUser(userId);
      
      if (userDetails) {
        // PRIORITY: Get the actual username from TimeDoctor
        userInfo.username = userDetails.name || userDetails.username || userDetails.displayName || 'Unknown User';
        userInfo.fullName = userDetails.fullName || userDetails.name || null;
        userInfo.email = userDetails.email || null;
        userInfo.timezone = userDetails.timezone || null;
        userInfo.role = userDetails.role || null;
        userInfo.status = userDetails.status || null;
        
        // Also try to get computer name if available
        userInfo.computerName = userDetails.computerName || userDetails.deviceName || userDetails.hostname || null;
        
        userInfo.lookupMethod = 'direct_user_lookup';
        userInfo.success = true;
        userInfo.confidence = 'high';
        
        console.log(`✅ Strategy 1 SUCCESS: Found USERNAME: "${userInfo.username}" for user ${userId}`);
        return userInfo;
      }
      
    } catch (directError) {
      console.log(`⚠️ Strategy 1 failed: ${directError.message}`);
      userInfo.error = directError.message;
    }

    try {
      // Strategy 2: Search through all users to find the username
      console.log(`👤 Strategy 2: User list search for ${userId}`);
      
      const allUsers = await this.getUsers({ limit: 1000 });
      
      if (allUsers.data && allUsers.data.length > 0) {
        const matchedUser = allUsers.data.find(user => user.id === userId);
        
        if (matchedUser) {
          userInfo.username = matchedUser.name || matchedUser.username || matchedUser.displayName || 'Unknown User';
          userInfo.fullName = matchedUser.fullName || matchedUser.name || null;
          userInfo.email = matchedUser.email || null;
          userInfo.timezone = matchedUser.timezone || null;
          userInfo.role = matchedUser.role || null;
          userInfo.status = matchedUser.status || null;
          userInfo.computerName = matchedUser.computerName || matchedUser.deviceName || null;
          
          userInfo.lookupMethod = 'user_list_search';
          userInfo.success = true;
          userInfo.confidence = 'high';
          
          console.log(`✅ Strategy 2 SUCCESS: Found USERNAME: "${userInfo.username}" in user list`);
          return userInfo;
        }
      }
      
    } catch (listError) {
      console.log(`⚠️ Strategy 2 failed: ${listError.message}`);
    }

    // Strategy 3: Try to get username from activity data
    try {
      console.log(`👤 Strategy 3: Activity data lookup for ${userId}`);
      
      const activityData = await this.getActivityWorklog({
        user: userId,
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0],
        limit: 50
      });

      if (activityData.data && activityData.data.length > 0) {
        // Look for username in activity records
        for (const activity of activityData.data.slice(0, 10)) {
          const possibleUsername = activity.userName || activity.username || activity.user?.name || activity.assignedUser;
          
          if (possibleUsername && typeof possibleUsername === 'string' && possibleUsername.trim() !== '') {
            userInfo.username = possibleUsername.trim();
            userInfo.computerName = activity.computerName || activity.deviceName || null;
            userInfo.lookupMethod = 'activity_data_lookup';
            userInfo.success = true;
            userInfo.confidence = 'medium';
            
            console.log(`✅ Strategy 3 SUCCESS: Found USERNAME: "${userInfo.username}" from activity data`);
            return userInfo;
          }
        }
      }
      
    } catch (activityError) {
      console.log(`⚠️ Strategy 3 failed: ${activityError.message}`);
    }

    // Final fallback - create a meaningful identifier
    userInfo.username = `User ${userId.substring(0, 8)}`;
    userInfo.lookupMethod = 'fallback_identifier';
    userInfo.success = false;
    userInfo.confidence = 'very_low';
    
    console.log(`⚠️ Using fallback USERNAME: "${userInfo.username}" for ${userId}`);
    
    return userInfo;
  }

  /**
   * Get user identification info with USERNAME priority
   * This is the main function to identify WHO owns a device
   */
  async getUserIdentification(userId, userInfo = null) {
    console.log(`🔍 Getting user identification (USERNAME priority) for ${userId}...`);
    
    // If we already have user info, try to extract username from it first
    if (userInfo) {
      const username = userInfo.name || userInfo.username || userInfo.displayName;
      if (username && username !== 'Unknown' && username.trim() !== '') {
        console.log(`✅ Found USERNAME from provided user info: "${username}"`);
        return {
          userId: userId,
          username: username,
          fullName: userInfo.fullName || userInfo.name,
          email: userInfo.email,
          timezone: userInfo.timezone,
          role: userInfo.role,
          status: userInfo.status,
          computerName: userInfo.computerName || userInfo.deviceName,
          lookupMethod: 'provided_user_info',
          success: true,
          confidence: 'high'
        };
      }
    }
    
    // Otherwise, do a full lookup
    return await this.getUserOwnerInfo(userId);
  }

  // ==================== COMPREHENSIVE USER MONITORING WITH USERNAME PRIORITY ====================

  /**
   * COMPREHENSIVE USER MONITORING API WITH USERNAME IDENTIFICATION
   * Get complete monitoring data for a user with REAL USERNAME
   * 
   * @param {string} userId - User ID to monitor
   * @param {object} params - Parameters including from/to dates
   * @returns {object} Complete monitoring data with real username
   */
  async getCompleteUserMonitoring(userId, params = {}) {
    console.log(`🕵️ Fetching COMPLETE monitoring data with REAL USERNAME for user ${userId}...`);
    
    const companyId = await this.getCompanyId();
    
    // Default to last 7 days if no dates provided
    const defaultParams = {
      from: params.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: params.to || new Date().toISOString().split('T')[0],
      user: userId,
      company: companyId,
      limit: '1000'
    };

    const queryParams = { ...defaultParams, ...params };
    
    try {
      console.log(`📊 Gathering monitoring data from ${queryParams.from} to ${queryParams.to}...`);
      
      // Fetch all monitoring data in parallel for efficiency
      const [
        activityWorklog,
        screenshots,
        timeUseData,
        timeUseStats,
        disconnectivity,
        totalStats
      ] = await Promise.allSettled([
        // Activity and time tracking
        this.getActivityWorklog(queryParams).catch(err => ({ error: err.message, data: [] })),
        
        // Screenshots for visual monitoring
        this.getScreenshots(queryParams).catch(err => ({ error: err.message, data: [] })),
        
        // Time usage patterns
        this.getActivityTimeuse(queryParams).catch(err => ({ error: err.message, data: [] })),
        
        // Productivity statistics
        this.timeuseStats(queryParams).catch(err => ({ error: err.message, data: null })),
        
        // Disconnection/idle time monitoring
        this.getDisconnectivity(queryParams).catch(err => ({ error: err.message, data: [] })),
        
        // Overall statistics
        this.stats1_total(queryParams).catch(err => ({ error: err.message, data: null }))
      ]);

      // Get user information with USERNAME priority
      let userInfo = null;
      let userIdentification = null;
      
      try {
        const users = await this.getUsers({ limit: 1000 });
        userInfo = users.data?.find(u => u.id === userId) || null;
        
        // Get the real username identification
        userIdentification = await this.getUserIdentification(userId, userInfo);
        
      } catch (err) {
        console.warn('Could not fetch user info:', err.message);
        // Try direct lookup
        try {
          userIdentification = await this.getUserOwnerInfo(userId);
        } catch (directErr) {
          console.warn('Direct user lookup also failed:', directErr.message);
        }
      }

      // Use USERNAME as the primary identifier
      const displayName = userIdentification?.username || 'Unknown User';
      const realEmail = userIdentification?.email || 'Unknown Email';

      // Process and format the results with USERNAME priority
      const monitoringData = {
        userId: userId,
        companyId: companyId,
        
        // 👤 PRIMARY: USERNAME identification
        username: userIdentification?.username || 'Unknown User',
        displayName: displayName,
        
        dateRange: {
          from: queryParams.from,
          to: queryParams.to
        },
        
        userInfo: {
          // Core identification
          id: userId,
          username: userIdentification?.username || 'Unknown User',
          fullName: userIdentification?.fullName,
          email: realEmail,
          timezone: userIdentification?.timezone || 'Unknown',
          role: userIdentification?.role || 'Unknown',
          status: userIdentification?.status || 'Unknown',
          
          // Computer information (secondary)
          computerName: userIdentification?.computerName,
          
          // Lookup metadata
          lookupMethod: userIdentification?.lookupMethod || 'none',
          lookupSuccess: userIdentification?.success || false,
          confidence: userIdentification?.confidence || 'low',
          
          // Legacy fields for backward compatibility
          name: displayName,
          lastSeenGlobal: userInfo?.lastSeenGlobal || null,
          isInteractiveAutoTracking: userInfo?.isInteractiveAutoTracking || false,
          hasPassword: userInfo?.hasPassword || false,
          
          // Device information
          deviceInfo: {
            originalName: userInfo?.name || 'Unknown',
            extractedDeviceName: displayName,
            hasActivityData: (activityWorklog.value?.data || []).length > 0,
            activityRecords: (activityWorklog.value?.data || []).length,
            
            // Computer information
            realComputerName: userIdentification?.computerName,
            hostname: userIdentification?.computerName,
            
            // Enhanced metadata
            enrichedWithRealData: true,
            enrichedAt: new Date().toISOString(),
            identificationMethod: userIdentification?.lookupMethod || 'none'
          }
        },
        
        // Activity and Time Tracking
        activitySummary: {
          status: activityWorklog.status === 'fulfilled' ? 'success' : 'error',
          error: activityWorklog.status === 'rejected' ? activityWorklog.reason?.message : null,
          totalRecords: activityWorklog.value?.data?.length || 0,
          data: activityWorklog.value?.data || []
        },
        
        // Screenshots for monitoring
        screenshots: {
          status: screenshots.status === 'fulfilled' ? 'success' : 'error',
          error: screenshots.status === 'rejected' ? screenshots.reason?.message : null,
          totalScreenshots: screenshots.value?.data?.length || 0,
          data: screenshots.value?.data || []
        },
        
        // Time usage patterns
        timeUsage: {
          status: timeUseData.status === 'fulfilled' ? 'success' : 'error',
          error: timeUseData.status === 'rejected' ? timeUseData.reason?.message : null,
          totalRecords: timeUseData.value?.data?.length || 0,
          data: timeUseData.value?.data || []
        },
        
        // Productivity metrics
        productivityStats: {
          status: timeUseStats.status === 'fulfilled' ? 'success' : 'error',
          error: timeUseStats.status === 'rejected' ? timeUseStats.reason?.message : null,
          data: timeUseStats.value?.data || null
        },
        
        // Disconnection monitoring
        disconnectionEvents: {
          status: disconnectivity.status === 'fulfilled' ? 'success' : 'error',
          error: disconnectivity.status === 'rejected' ? disconnectivity.reason?.message : null,
          totalEvents: disconnectivity.value?.data?.length || 0,
          data: disconnectivity.value?.data || []
        },
        
        // Overall statistics
        overallStats: {
          status: totalStats.status === 'fulfilled' ? 'success' : 'error',
          error: totalStats.status === 'rejected' ? totalStats.reason?.message : null,
          data: totalStats.value?.data || null
        },
        
        // Summary metrics
        summary: {
          hasData: false,
          totalActiveTime: 0,
          totalScreenshots: screenshots.value?.data?.length || 0,
          totalDisconnections: disconnectivity.value?.data?.length || 0,
          monitoringPeriod: `${queryParams.from} to ${queryParams.to}`,
          dataCollectedAt: new Date().toISOString(),
          
          // Primary identification
          username: displayName,
          userIdentification: userIdentification
        }
      };

      // Calculate if we have any monitoring data
      monitoringData.summary.hasData = 
        monitoringData.activitySummary.totalRecords > 0 ||
        monitoringData.screenshots.totalScreenshots > 0 ||
        monitoringData.timeUsage.totalRecords > 0 ||
        monitoringData.disconnectionEvents.totalEvents > 0;

      console.log(`✅ Complete monitoring data retrieved for user ${userId}`);
      console.log(`   👤 USERNAME: ${displayName} (${userIdentification?.lookupMethod || 'none'})`);
      console.log(`   📧 Email: ${realEmail}`);
      console.log(`   🖥️ Computer: ${userIdentification?.computerName || 'Unknown'}`);
      console.log(`   📊 Activity records: ${monitoringData.activitySummary.totalRecords}`);
      console.log(`   📸 Screenshots: ${monitoringData.screenshots.totalScreenshots}`);
      console.log(`   📈 Has monitoring data: ${monitoringData.summary.hasData}`);

      return monitoringData;

    } catch (error) {
      console.error(`❌ Error fetching monitoring data for user ${userId}:`, error.message);
      throw new Error(`Failed to fetch monitoring data: ${error.message}`);
    }
  }

  /**
   * MONITOR ALL USERS - Get monitoring data for all users with REAL USERNAMES
   * @param {object} params - Parameters including from/to dates
   * @returns {object} Monitoring data for all users with usernames
   */
  async getAllUsersMonitoring(params = {}) {
    console.log('👥🕵️ Fetching monitoring data for ALL users with REAL USERNAMES...');
    
    try {
      // First get all users
      const users = await this.getUsers({ limit: 1000 });
      const userList = users.data || [];
      
      if (userList.length === 0) {
        return {
          success: false,
          message: 'No users found in company',
          data: []
        };
      }

      console.log(`📊 Found ${userList.length} users to monitor with USERNAME identification`);
      
      // Monitor each user (sequential to avoid overwhelming the API)
      const allMonitoringData = [];
      
      for (const user of userList) {
        // Get username identification first
        let username = 'Unknown User';
        try {
          const userIdentification = await this.getUserIdentification(user.id, user);
          username = userIdentification.username;
          
          console.log(`🔍 Monitoring user: "${username}" (ID: ${user.id})`);
        } catch (userError) {
          username = user.name || user.username || `User ${user.id.substring(0, 8)}`;
          console.log(`🔍 Monitoring user: "${username}" (Fallback) - ${user.id}`);
        }
        
        try {
          const userMonitoring = await this.getCompleteUserMonitoring(user.id, params);
          allMonitoringData.push(userMonitoring);
          
          // Small delay to avoid overwhelming the API
          await new Promise(resolve => setTimeout(resolve, 200));
          
        } catch (error) {
          console.warn(`⚠️ Failed to monitor user ${user.id}: ${error.message}`);
          allMonitoringData.push({
            userId: user.id,
            username: username,
            error: error.message,
            userInfo: {
              ...user,
              username: username,
              name: username,
              deviceInfo: {
                originalName: user.name || 'Unknown',
                extractedDeviceName: username,
                hasActivityData: false,
                activityRecords: 0,
                identificationMethod: 'error_fallback'
              }
            },
            summary: { hasData: false, username: username }
          });
        }
      }

      // Calculate overall summary
      const totalWithData = allMonitoringData.filter(u => u.summary?.hasData).length;
      const totalScreenshots = allMonitoringData.reduce((sum, u) => sum + (u.screenshots?.totalScreenshots || 0), 0);
      const totalActivityRecords = allMonitoringData.reduce((sum, u) => sum + (u.activitySummary?.totalRecords || 0), 0);
      const usernamesFound = allMonitoringData.filter(u => u.username && u.username !== 'Unknown User' && !u.username.startsWith('User ')).length;

      console.log(`✅ USERNAME monitoring complete for all users`);
      console.log(`   👥 Total users monitored: ${allMonitoringData.length}`);
      console.log(`   📊 Users with data: ${totalWithData}`);
      console.log(`   👤 USERNAMES identified: ${usernamesFound}`);
      console.log(`   📸 Total screenshots: ${totalScreenshots}`);
      console.log(`   📈 Total activity records: ${totalActivityRecords}`);

      return {
        success: true,
        summary: {
          totalUsers: allMonitoringData.length,
          usersWithData: totalWithData,
          usernamesIdentified: usernamesFound,
          totalScreenshots: totalScreenshots,
          totalActivityRecords: totalActivityRecords,
          monitoringPeriod: `${params.from || 'last 7 days'} to ${params.to || 'today'}`,
          generatedAt: new Date().toISOString()
        },
        data: allMonitoringData
      };

    } catch (error) {
      console.error('❌ Error monitoring all users:', error.message);
      throw new Error(`Failed to monitor all users: ${error.message}`);
    }
  }

  // ==================== EXISTING METHODS (keeping all previous methods) ====================

  /**
   * Get ALL users using the correct endpoint
   * Endpoint: /api/1.0/users?company={companyId}
   */
  async getUsers(params = {}) {
    console.log('👥 Fetching ALL users...');
    
    const companyId = await this.getCompanyId();
    
    // Build query parameters
    const queryParams = {
      detail: params.detail || 'id',
      'task-project-names': params['task-project-names'] || 'true',
      'include-archived-users': params['include-archived-users'] || 'false',
      limit: '1000', // Maximum per page
      ...params
    };
    
    // Remove any user-specified limit to ensure we get all data
    if (!params.keepLimit) {
      queryParams.limit = '1000';
    }
    
    // Remove undefined values
    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === undefined || queryParams[key] === 'string') {
        delete queryParams[key];
      }
    });
    
    // Use the correct endpoint format: /api/1.0/users?company={companyId}
    const endpoint = `/api/1.0/users?company=${companyId}`;
    
    // Fetch all pages
    const result = await this.fetchAllPages(endpoint, queryParams);
    
    console.log(`✅ Retrieved ALL ${result.data?.length || 0} users`);
    return result;
  }

  /**
   * Get managed users (users that the authenticated user can manage)
   * Endpoint: /api/1.0/users/managed
   */
  async getManagedUsers(params = {}) {
    console.log('👥 Fetching managed users...');
    
    const companyId = await this.getCompanyId();
    
    const queryParams = {
      company: companyId,
      limit: '1000', // Maximum per page
      ...params
    };
    
    // Remove any user-specified limit to ensure we get all data
    if (!params.keepLimit) {
      queryParams.limit = '1000';
    }
    
    const endpoint = `/api/1.0/users/managed`;
    const result = await this.fetchAllPages(endpoint, queryParams);
    
    console.log(`✅ Retrieved ${result.data?.length || 0} managed users`);
    return result;
  }

  /**
   * Get a specific user by ID
   * Endpoint: /api/1.0/users/{userId}
   */
  async getUser(userId) {
    console.log(`👤 Fetching user ${userId}...`);
    const endpoint = `/api/1.0/users/${userId}`;
    return await this.request(endpoint, { method: 'GET' });
  }

  /**
   * Update a specific user
   * Endpoint: PUT /api/1.0/users/{userId}
   */
  async putUser(userId, userData) {
    console.log(`✏️ Updating user ${userId}...`);
    const endpoint = `/api/1.0/users/${userId}`;
    return await this.request(endpoint, { 
      method: 'PUT',
      body: JSON.stringify(userData)
    });
  }

  /**
   * Delete a specific user
   * Endpoint: DELETE /api/1.0/users/{userId}
   */
  async deleteUser(userId) {
    console.log(`🗑️ Deleting user ${userId}...`);
    const endpoint = `/api/1.0/users/${userId}`;
    return await this.request(endpoint, { method: 'DELETE' });
  }

  /**
   * Invite a user to the company
   * Endpoint: POST /api/1.0/users/invite
   */
  async invite(inviteData) {
    console.log('✉️ Sending user invitation...');
    const companyId = await this.getCompanyId();
    const endpoint = `/api/1.0/users/invite`;
    return await this.request(endpoint, { 
      method: 'POST',
      body: JSON.stringify({
        company: companyId,
        ...inviteData
      })
    });
  }

  /**
   * Get user activity/stats
   * Endpoint: /api/1.0/activity/summary
   */
  async getUserActivity(userId, params = {}) {
    console.log(`📊 Fetching activity for user ${userId}...`);
    
    const companyId = await this.getCompanyId();
    
    const defaultParams = {
      company: companyId,
      user: userId,
      from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 7 days
      to: new Date().toISOString().split('T')[0]
    };

    const queryParams = { ...defaultParams, ...params };
    const query = new URLSearchParams(queryParams).toString();
    const endpoint = `/api/1.0/activity/summary?${query}`;
    
    return await this.request(endpoint, { method: 'GET' });
  }

  // ==================== TASK ENDPOINTS ====================

  /**
   * Get ALL tasks
   * Endpoint: /api/1.0/tasks?company={companyId}
   */
  async getTasks(params = {}) {
    console.log('📋 Fetching ALL tasks...');
    
    const companyId = await this.getCompanyId();
    
    const queryParams = {
      limit: '1000', // Maximum per page
      ...params
    };
    
    // Remove any user-specified limit to ensure we get all data
    if (!params.keepLimit) {
      queryParams.limit = '1000';
    }
    
    // Use the correct endpoint format
    const endpoint = `/api/1.0/tasks?company=${companyId}`;
    
    // Fetch all pages
    const result = await this.fetchAllPages(endpoint, queryParams);
    
    console.log(`✅ Retrieved ALL ${result.data?.length || 0} tasks`);
    return result;
  }

  /**
   * Get ALL tasks (alias for backward compatibility)
   * Endpoint: /api/1.0/tasks?company={companyId}
   */
  async tasks(params = {}) {
    return await this.getTasks(params);
  }

  /**
   * Create a new task
   * Endpoint: POST /api/1.0/tasks
   */
  async newTask(taskData) {
    console.log('➕ Creating new task...');
    const companyId = await this.getCompanyId();
    const endpoint = `/api/1.0/tasks`;
    return await this.request(endpoint, { 
      method: 'POST',
      body: JSON.stringify({
        company: companyId,
        ...taskData
      })
    });
  }

  /**
   * Get a specific task by ID
   * Endpoint: /api/1.0/tasks/{taskId}
   */
  async task(taskId) {
    console.log(`📋 Fetching task ${taskId}...`);
    const endpoint = `/api/1.0/tasks/${taskId}`;
    return await this.request(endpoint, { method: 'GET' });
  }

  // ==================== ACTIVITY ENDPOINTS ====================

  /**
   * Get activity worklog
   * Endpoint: /api/1.0/activity/worklog
   */
  async getActivityWorklog(params = {}) {
    console.log('📊 Fetching activity worklog...');
    
    const companyId = await this.getCompanyId();
    
    const queryParams = {
      company: companyId,
      from: params.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: params.to || new Date().toISOString().split('T')[0],
      limit: '1000',
      ...params
    };
    
    if (!params.keepLimit) {
      queryParams.limit = '1000';
    }
    
    const endpoint = `/api/1.0/activity/worklog`;
    const result = await this.fetchAllPages(endpoint, queryParams);
    
    console.log(`✅ Retrieved ${result.data?.length || 0} activity worklog records`);
    return result;
  }

  /**
   * Get activity timeuse
   * Endpoint: /api/1.0/activity/timeuse
   */
  async getActivityTimeuse(params = {}) {
    console.log('⏱️ Fetching activity timeuse...');
    
    const companyId = await this.getCompanyId();
    
    const queryParams = {
      company: companyId,
      from: params.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: params.to || new Date().toISOString().split('T')[0],
      limit: '1000',
      ...params
    };
    
    if (!params.keepLimit) {
      queryParams.limit = '1000';
    }
    
    const endpoint = `/api/1.0/activity/timeuse`;
    const result = await this.fetchAllPages(endpoint, queryParams);
    
    console.log(`✅ Retrieved ${result.data?.length || 0} activity timeuse records`);
    return result;
  }

  /**
   * Get timeuse statistics
   * Endpoint: /api/1.0/activity/timeuse/stats
   */
  async timeuseStats(params = {}) {
    console.log('📈 Fetching timeuse statistics...');
    
    const companyId = await this.getCompanyId();
    
    const queryParams = {
      company: companyId,
      from: params.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: params.to || new Date().toISOString().split('T')[0],
      ...params
    };
    
    const query = new URLSearchParams(queryParams).toString();
    const endpoint = `/api/1.0/activity/timeuse/stats?${query}`;
    
    return await this.request(endpoint, { method: 'GET' });
  }

  /**
   * Get activity edit time
   * Endpoint: /api/1.0/activity/edit-time
   */
  async getActivityEditTime(params = {}) {
    console.log('✏️ Fetching activity edit time...');
    
    const companyId = await this.getCompanyId();
    
    const queryParams = {
      company: companyId,
      from: params.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: params.to || new Date().toISOString().split('T')[0],
      limit: '1000',
      ...params
    };
    
    if (!params.keepLimit) {
      queryParams.limit = '1000';
    }
    
    const endpoint = `/api/1.0/activity/edit-time`;
    const result = await this.fetchAllPages(endpoint, queryParams);
    
    console.log(`✅ Retrieved ${result.data?.length || 0} activity edit time records`);
    return result;
  }

  /**
   * Post activity edit time
   * Endpoint: POST /api/1.0/activity/edit-time
   */
  async postActivityEditTime(editTimeData) {
    console.log('📝 Posting activity edit time...');
    const companyId = await this.getCompanyId();
    const endpoint = `/api/1.0/activity/edit-time`;
    return await this.request(endpoint, { 
      method: 'POST',
      body: JSON.stringify({
        company: companyId,
        ...editTimeData
      })
    });
  }

  /**
   * Bulk edit time update
   * Endpoint: PUT /api/1.0/activity/edit-time/bulk
   */
  async putBulkEditTime(bulkEditData) {
    console.log('📦 Bulk updating edit time...');
    const companyId = await this.getCompanyId();
    const endpoint = `/api/1.0/activity/edit-time/bulk`;
    return await this.request(endpoint, { 
      method: 'PUT',
      body: JSON.stringify({
        company: companyId,
        ...bulkEditData
      })
    });
  }

  /**
   * Update specific activity edit time
   * Endpoint: PUT /api/1.0/activity/edit-time/{editTimeId}
   */
  async putActivityEditTime(editTimeId, editTimeData) {
    console.log(`✏️ Updating activity edit time ${editTimeId}...`);
    const endpoint = `/api/1.0/activity/edit-time/${editTimeId}`;
    return await this.request(endpoint, { 
      method: 'PUT',
      body: JSON.stringify(editTimeData)
    });
  }

  /**
   * Get disconnectivity data
   * Endpoint: /api/1.0/activity/disconnectivity
   */
  async getDisconnectivity(params = {}) {
    console.log('🔌 Fetching disconnectivity data...');
    
    const companyId = await this.getCompanyId();
    
    const queryParams = {
      company: companyId,
      from: params.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: params.to || new Date().toISOString().split('T')[0],
      limit: '1000',
      ...params
    };
    
    if (!params.keepLimit) {
      queryParams.limit = '1000';
    }
    
    const endpoint = `/api/1.0/activity/disconnectivity`;
    const result = await this.fetchAllPages(endpoint, queryParams);
    
    console.log(`✅ Retrieved ${result.data?.length || 0} disconnectivity records`);
    return result;
  }

  /**
   * Get total stats
   * Endpoint: /api/1.0/activity/stats/total
   */
  async stats1_total(params = {}) {
    console.log('📊 Fetching total statistics...');
    
    const companyId = await this.getCompanyId();
    
    const queryParams = {
      company: companyId,
      from: params.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: params.to || new Date().toISOString().split('T')[0],
      ...params
    };
    
    const query = new URLSearchParams(queryParams).toString();
    const endpoint = `/api/1.0/activity/stats/total?${query}`;
    
    return await this.request(endpoint, { method: 'GET' });
  }

  // ==================== FILE ENDPOINTS ====================

  /**
   * Get files
   * Endpoint: /api/1.0/files
   */
  async getFiles(params = {}) {
    console.log('📁 Fetching files...');
    
    const companyId = await this.getCompanyId();
    
    const queryParams = {
      company: companyId,
      limit: '1000',
      ...params
    };
    
    if (!params.keepLimit) {
      queryParams.limit = '1000';
    }
    
    const endpoint = `/api/1.0/files`;
    const result = await this.fetchAllPages(endpoint, queryParams);
    
    console.log(`✅ Retrieved ${result.data?.length || 0} files`);
    return result;
  }

  /**
   * Delete multiple files
   * Endpoint: DELETE /api/1.0/files
   */
  async deleteFiles(fileIds) {
    console.log('🗑️ Deleting multiple files...');
    const endpoint = `/api/1.0/files`;
    return await this.request(endpoint, { 
      method: 'DELETE',
      body: JSON.stringify({ files: fileIds })
    });
  }

  /**
   * Get files by type
   * Endpoint: /api/1.0/files/type/{fileType}
   */
  async getTypeFiles(fileType, params = {}) {
    console.log(`📁 Fetching files of type ${fileType}...`);
    
    const companyId = await this.getCompanyId();
    
    const queryParams = {
      company: companyId,
      limit: '1000',
      ...params
    };
    
    if (!params.keepLimit) {
      queryParams.limit = '1000';
    }
    
    const endpoint = `/api/1.0/files/type/${fileType}`;
    const result = await this.fetchAllPages(endpoint, queryParams);
    
    console.log(`✅ Retrieved ${result.data?.length || 0} files of type ${fileType}`);
    return result;
  }

  /**
   * Get signed URL for file upload
   * Endpoint: /api/1.0/files/signed-url
   */
  async getSignedUrl(params = {}) {
    console.log('🔗 Getting signed URL for file upload...');
    
    const companyId = await this.getCompanyId();
    
    const queryParams = {
      company: companyId,
      ...params
    };
    
    const query = new URLSearchParams(queryParams).toString();
    const endpoint = `/api/1.0/files/signed-url?${query}`;
    
    return await this.request(endpoint, { method: 'GET' });
  }

  /**
   * Upload/Put file
   * Endpoint: PUT /api/1.0/files/{fileId}
   */
  async putFile(fileId, fileData) {
    console.log(`📤 Uploading file ${fileId}...`);
    const endpoint = `/api/1.0/files/${fileId}`;
    return await this.request(endpoint, { 
      method: 'PUT',
      body: JSON.stringify(fileData)
    });
  }

  /**
   * Delete a specific file
   * Endpoint: DELETE /api/1.0/files/{fileId}
   */
  async deleteFile(fileId) {
    console.log(`🗑️ Deleting file ${fileId}...`);
    const endpoint = `/api/1.0/files/${fileId}`;
    return await this.request(endpoint, { method: 'DELETE' });
  }

  // ==================== EXISTING PROJECT & TIME TRACKING ENDPOINTS ====================

  /**
   * Get ALL projects
   * Endpoint: /api/1.0/projects?company={companyId}
   */
  async getProjects(params = {}) {
    console.log('📁 Fetching ALL projects...');
    
    const companyId = await this.getCompanyId();
    
    const queryParams = {
      limit: '1000', // Maximum per page
      ...params
    };
    
    // Remove any user-specified limit to ensure we get all data
    if (!params.keepLimit) {
      queryParams.limit = '1000';
    }
    
    // Use the correct endpoint format
    const endpoint = `/api/1.0/projects?company=${companyId}`;
    
    // Fetch all pages
    const result = await this.fetchAllPages(endpoint, queryParams);
    
    console.log(`✅ Retrieved ALL ${result.data?.length || 0} projects`);
    return result;
  }

  /**
   * Get ALL work logs
   * Endpoint: /api/1.0/work-logs?company={companyId}
   */
  async getWorkLogs(params = {}) {
    console.log('📝 Fetching ALL work logs...');
    
    const companyId = await this.getCompanyId();
    
    const queryParams = {
      from: params.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: params.to || new Date().toISOString().split('T')[0],
      limit: '1000', // Maximum per page
      ...params
    };
    
    // Remove any user-specified limit to ensure we get all data
    if (!params.keepLimit) {
      queryParams.limit = '1000';
    }
    
    // Use the correct endpoint format
    const endpoint = `/api/1.0/work-logs?company=${companyId}`;
    
    // Fetch all pages
    const result = await this.fetchAllPages(endpoint, queryParams);
    
    console.log(`✅ Retrieved ALL ${result.data?.length || 0} work logs`);
    return result;
  }

  /**
   * Get ALL screenshots
   * Endpoint: /api/1.0/screenshots?company={companyId}
   */
  async getScreenshots(params = {}) {
    console.log('📸 Fetching ALL screenshots...');
    
    const companyId = await this.getCompanyId();
    
    const queryParams = {
      from: params.from || new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: params.to || new Date().toISOString().split('T')[0],
      limit: '1000', // Maximum per page
      ...params
    };
    
    // Remove any user-specified limit to ensure we get all data
    if (!params.keepLimit) {
      queryParams.limit = '1000';
    }
    
    // Use the correct endpoint format
    const endpoint = `/api/1.0/screenshots?company=${companyId}`;
    
    // Fetch all pages
    const result = await this.fetchAllPages(endpoint, queryParams);
    
    console.log(`✅ Retrieved ALL ${result.data?.length || 0} screenshots`);
    return result;
  }

  /**
   * Get ALL time tracking data
   * Endpoint: /api/1.0/activity/worklog?company={companyId}
   */
  async getTimeTracking(params = {}) {
    console.log('⏱️ Fetching ALL time tracking data...');
    
    const companyId = await this.getCompanyId();
    
    const queryParams = {
      from: params.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: params.to || new Date().toISOString().split('T')[0],
      'task-project-names': params['task-project-names'] || 'true',
      limit: '1000', // Maximum per page
      ...params
    };
    
    // Remove any user-specified limit to ensure we get all data
    if (!params.keepLimit) {
      queryParams.limit = '1000';
    }
    
    // Use the correct endpoint format
    const endpoint = `/api/1.0/activity/worklog?company=${companyId}`;
    
    // Fetch all pages
    const result = await this.fetchAllPages(endpoint, queryParams);
    
    console.log(`✅ Retrieved ALL ${result.data?.length || 0} time tracking records`);
    return result;
  }

  /**
   * Clear authentication cache
   */
  async clearCache() {
    await this.authManager.clearCache();
    console.log('🗑️ Cache cleared');
  }
}

module.exports = TimeDoctorAPI;