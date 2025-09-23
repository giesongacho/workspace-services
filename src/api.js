const fetch = require('node-fetch');
const AuthManager = require('./auth');
const config = require('./config');

class TimeDoctorAPI {
  constructor() {
    this.authManager = new AuthManager();
    this.baseUrl = config.api.baseUrl;
    this.version = config.api.version;
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

  // ==================== USER ENDPOINTS ====================

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
  }
}

module.exports = TimeDoctorAPI;