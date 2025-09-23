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
   * Get a specific user by ID
   * Endpoint: /api/1.0/users/{userId}
   */
  async getUser(userId) {
    console.log(`👤 Fetching user ${userId}...`);
    const endpoint = `/api/1.0/users/${userId}`;
    return await this.request(endpoint, { method: 'GET' });
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