const fetch = require('node-fetch');
const AuthManager = require('./auth');
const config = require('./config');

class TimeDoctorAPI {
  constructor() {
    this.authManager = new AuthManager();
    this.baseUrl = config.api.baseUrl;
    this.version = config.api.version;
    
    console.log('TimeDoctorAPI initialized');
  }

  async request(endpoint, options = {}) {
    const { token, companyId } = await this.authManager.getCredentials();
    endpoint = endpoint.replace('{companyId}', companyId);
    
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    
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

    try {
      console.log(`API Request: ${url}`); // Added for debugging
      const response = await fetch(url, requestOptions);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API Request failed:', error.message);
      throw error;
    }
  }

  async getCompanyId() {
    const { companyId } = await this.authManager.getCredentials();
    return companyId;
  }

  async getUsers(params = {}) {
    const companyId = await this.getCompanyId();
    const query = new URLSearchParams({ company: companyId, ...params }).toString();
    return await this.request(`/api/1.0/users?${query}`, { method: 'GET' });
  }

  async getUser(userId) {
    return await this.request(`/api/1.0/users/${userId}`, { method: 'GET' });
  }

  async getActivityWorklog(params = {}) {
    const companyId = await this.getCompanyId();
    const queryParams = {
      company: companyId,
      from: params.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: params.to || new Date().toISOString().split('T')[0],
      limit: params.limit || 100,
      ...params
    };
    
    const query = new URLSearchParams(queryParams).toString();
    return await this.request(`/api/1.0/activity/worklog?${query}`, { method: 'GET' });
  }

  async getScreenshots(params = {}) {
    const companyId = await this.getCompanyId();
    const queryParams = {
      company: companyId,
      from: params.from || new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: params.to || new Date().toISOString().split('T')[0],
      limit: params.limit || 100,
      ...params
    };
    
    console.log('Screenshot API params:', queryParams); // Added for debugging
    
    const query = new URLSearchParams(queryParams).toString();
    return await this.request(`/api/1.0/screenshots?${query}`, { method: 'GET' });
  }

  async getFiles(params = {}) {
    const companyId = await this.getCompanyId();
    
    const dateFilter = params['filter[date]'] || 
      `${params.from || new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}_${params.to || new Date().toISOString().split('T')[0]}`;
    
    const queryParams = {
      company: companyId,
      'filter[date]': dateFilter,
      limit: params.limit || 100
    };
    
    if (params.user) {
      queryParams.user = params.user;
    }
    
    const query = new URLSearchParams(queryParams).toString();
    return await this.request(`/api/1.0/files?${query}`, { method: 'GET' });
  }

  async getActivityTimeuse(params = {}) {
    const companyId = await this.getCompanyId();
    const queryParams = {
      company: companyId,
      from: params.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: params.to || new Date().toISOString().split('T')[0],
      limit: params.limit || 100,
      ...params
    };
    
    const query = new URLSearchParams(queryParams).toString();
    return await this.request(`/api/1.0/activity/timeuse?${query}`, { method: 'GET' });
  }

  async getDisconnectivity(params = {}) {
    const companyId = await this.getCompanyId();
    const queryParams = {
      company: companyId,
      from: params.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: params.to || new Date().toISOString().split('T')[0],
      limit: params.limit || 100,
      ...params
    };
    
    const query = new URLSearchParams(queryParams).toString();
    return await this.request(`/api/1.0/activity/disconnectivity?${query}`, { method: 'GET' });
  }

  async timeuseStats(params = {}) {
    const companyId = await this.getCompanyId();
    const queryParams = {
      company: companyId,
      from: params.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: params.to || new Date().toISOString().split('T')[0],
      ...params
    };
    
    const query = new URLSearchParams(queryParams).toString();
    return await this.request(`/api/1.0/activity/timeuse/stats?${query}`, { method: 'GET' });
  }

  async stats1_total(params = {}) {
    const companyId = await this.getCompanyId();
    const queryParams = {
      company: companyId,
      from: params.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: params.to || new Date().toISOString().split('T')[0],
      ...params
    };
    
    const query = new URLSearchParams(queryParams).toString();
    return await this.request(`/api/1.0/activity/stats/total?${query}`, { method: 'GET' });
  }

  async getUserActivity(userId, params = {}) {
    const companyId = await this.getCompanyId();
    const queryParams = {
      company: companyId,
      user: userId,
      from: params.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: params.to || new Date().toISOString().split('T')[0],
      ...params
    };
    
    const query = new URLSearchParams(queryParams).toString();
    return await this.request(`/api/1.0/activity/summary?${query}`, { method: 'GET' });
  }

  async getAllUsersMonitoring(params = {}) {
    try {
      const users = await this.getUsers({ limit: 1000 });
      const userList = users.data || [];
      
      if (userList.length === 0) {
        return { success: false, message: 'No users found', data: [] };
      }

      const allMonitoringData = [];
      
      for (const user of userList) {
        const username = user.name || user.email || `User ${user.id.substring(0, 8)}`;
        
        try {
          const companyId = await this.getCompanyId();
          
          const queryParams = {
            from: params.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            to: params.to || new Date().toISOString().split('T')[0],
            user: user.id,
            company: companyId,
            limit: 100
          };

          const [activityWorklog, screenshots, timeUseData, disconnectivity] = await Promise.allSettled([
            this.getActivityWorklog(queryParams),
            this.getScreenshots(queryParams),
            this.getActivityTimeuse(queryParams),
            this.getDisconnectivity(queryParams)
          ]);

          const monitoringData = {
            userId: user.id,
            username: username,
            email: user.email,
            userInfo: user,
            activitySummary: {
              totalRecords: activityWorklog.value?.data?.length || 0,
              data: activityWorklog.value?.data || []
            },
            screenshots: {
              totalScreenshots: screenshots.value?.data?.length || 0,
              data: screenshots.value?.data || []
            },
            timeUsage: {
              totalRecords: timeUseData.value?.data?.length || 0,
              data: timeUseData.value?.data || []
            },
            disconnectionEvents: {
              totalEvents: disconnectivity.value?.data?.length || 0,
              data: disconnectivity.value?.data || []
            },
            summary: { hasData: false }
          };

          monitoringData.summary.hasData = 
            monitoringData.activitySummary.totalRecords > 0 ||
            monitoringData.screenshots.totalScreenshots > 0 ||
            monitoringData.timeUsage.totalRecords > 0 ||
            monitoringData.disconnectionEvents.totalEvents > 0;

          allMonitoringData.push(monitoringData);
          
          await new Promise(resolve => setTimeout(resolve, 300));
          
        } catch (error) {
          allMonitoringData.push({
            userId: user.id,
            username: username,
            error: error.message,
            summary: { hasData: false }
          });
        }
      }

      return {
        success: true,
        summary: {
          totalUsers: allMonitoringData.length,
          usersWithData: allMonitoringData.filter(u => u.summary?.hasData).length
        },
        data: allMonitoringData
      };

    } catch (error) {
      throw new Error(`Failed to monitor users: ${error.message}`);
    }
  }

  async debugRawRequest(endpoint, params = {}) {
    try {
      const companyId = await this.getCompanyId();
      const queryParams = { company: companyId, ...params };
      const query = new URLSearchParams(queryParams).toString();
      const fullEndpoint = `${endpoint}?${query}`;
      
      const response = await this.request(fullEndpoint, { method: 'GET' });
      
      return {
        success: true,
        endpoint: fullEndpoint,
        response: response,
        analysis: {
          hasData: !!response?.data,
          dataIsArray: Array.isArray(response?.data),
          dataLength: response?.data?.length || 0,
          firstRecord: response?.data?.[0] || null
        }
      };
    } catch (error) {
      return {
        success: false,
        endpoint,
        error: error.message
      };
    }
  }

  async debugUserActivities(userId, params = {}) {
    const companyId = await this.getCompanyId();
    const defaultParams = {
      from: params.from || '2025-09-29',
      to: params.to || '2025-09-30',
      user: userId,
      company: companyId,
      limit: 100
    };
    
    const endpoints = [
      '/api/1.0/activity/worklog',
      '/api/1.0/activity/summary',
      '/api/1.0/activity/timeuse'
    ];
    
    const results = {
      userId,
      dateRange: { from: defaultParams.from, to: defaultParams.to },
      tests: []
    };
    
    for (const endpoint of endpoints) {
      try {
        const query = new URLSearchParams(defaultParams).toString();
        const fullEndpoint = `${endpoint}?${query}`;
        const response = await this.request(fullEndpoint, { method: 'GET' });
        
        const hasData = response?.data && Array.isArray(response.data) && response.data.length > 0;
        
        results.tests.push({
          endpoint,
          success: true,
          hasData,
          dataLength: response?.data?.length || 0,
          sampleRecord: hasData ? response.data[0] : null
        });
        
      } catch (error) {
        results.tests.push({
          endpoint,
          success: false,
          error: error.message
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return results;
  }

  async debugCompleteDiagnostic(userId) {
    const diagnostic = {
      userId,
      timestamp: new Date().toISOString(),
      tests: {}
    };
    
    try {
      const userInfo = await this.getUser(userId);
      diagnostic.tests.userInfo = { success: true, data: userInfo };
    } catch (error) {
      diagnostic.tests.userInfo = { success: false, error: error.message };
    }
    
    diagnostic.tests.activityEndpoints = await this.debugUserActivities(userId, {
      from: '2025-09-29',
      to: '2025-09-30'
    });
    
    try {
      const screenshots = await this.getScreenshots({
        user: userId,
        from: '2025-09-29',
        to: '2025-09-30',
        limit: 100
      });
      diagnostic.tests.screenshots = {
        success: true,
        count: screenshots?.data?.length || 0,
        sampleData: screenshots?.data?.[0] || null
      };
    } catch (error) {
      diagnostic.tests.screenshots = {
        success: false,
        error: error.message
      };
    }
    
    return diagnostic;
  }

  async clearCache() {
    await this.authManager.clearCache();
  }
}

module.exports = TimeDoctorAPI;