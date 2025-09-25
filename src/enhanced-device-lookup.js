const fetch = require('node-fetch');

/**
 * Enhanced Device Lookup - Gets REAL computer names from TimeDoctor
 * Extracts actual computer names like "Macbooks-MacBook-Air.local" instead of patterns
 */
class EnhancedDeviceLookup {
  constructor(api) {
    this.api = api;
    this.deviceCache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes cache
  }

  /**
   * Get the REAL computer/device name from TimeDoctor API
   * This accesses the actual computer hostname, not just patterns
   * 
   * @param {string} userId - User ID to lookup device for
   * @param {object} options - Additional options
   * @returns {object} Device information with real computer name
   */
  async getRealComputerName(userId, options = {}) {
    const cacheKey = `device_${userId}`;
    
    // Check cache first
    if (this.deviceCache.has(cacheKey)) {
      const cached = this.deviceCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        console.log(`📱 Using cached device info for ${userId}`);
        return cached.data;
      }
    }

    console.log(`🔍 Looking up REAL computer name for user ${userId}...`);

    const deviceInfo = {
      userId: userId,
      computerName: 'Unknown Computer',
      hostname: null,
      deviceType: 'Unknown',
      operatingSystem: null,
      ipAddress: null,
      lastSeen: null,
      userAgent: null,
      lookupMethod: 'none',
      success: false,
      error: null
    };

    try {
      // Strategy 1: Get user details with extended info
      await this.tryUserDetailsLookup(userId, deviceInfo);
      
      // Strategy 2: Check activity records for device info
      if (!deviceInfo.success) {
        await this.tryActivityDeviceLookup(userId, deviceInfo);
      }
      
      // Strategy 3: Check screenshots metadata for device info
      if (!deviceInfo.success) {
        await this.tryScreenshotDeviceLookup(userId, deviceInfo);
      }
      
      // Strategy 4: Check worklog records for computer info
      if (!deviceInfo.success) {
        await this.tryWorklogDeviceLookup(userId, deviceInfo);
      }
      
      // Strategy 5: Try user connection/session info
      if (!deviceInfo.success) {
        await this.trySessionDeviceLookup(userId, deviceInfo);
      }

      // Cache the result
      this.deviceCache.set(cacheKey, {
        data: deviceInfo,
        timestamp: Date.now()
      });

      if (deviceInfo.success) {
        console.log(`✅ Found REAL computer name: ${deviceInfo.computerName} for user ${userId}`);
      } else {
        console.log(`⚠️ Could not find real computer name for user ${userId}, using fallback`);
      }

      return deviceInfo;

    } catch (error) {
      console.error(`❌ Error getting real computer name for ${userId}:`, error.message);
      deviceInfo.error = error.message;
      return deviceInfo;
    }
  }

  /**
   * Strategy 1: Try to get computer name from user details
   */
  async tryUserDetailsLookup(userId, deviceInfo) {
    try {
      console.log(`🔍 Strategy 1: User details lookup for ${userId}`);
      
      const userDetails = await this.api.getUser(userId);
      
      // Check various fields that might contain computer info
      const computerFields = [
        userDetails.computerName,
        userDetails.deviceName,
        userDetails.hostname,
        userDetails.machineName,
        userDetails.workstationName,
        userDetails.clientName,
        userDetails.systemInfo?.hostname,
        userDetails.deviceInfo?.name,
        userDetails.device?.hostname,
        userDetails.machine?.name
      ];

      for (const field of computerFields) {
        if (field && typeof field === 'string' && field.trim() !== '') {
          const computerName = field.trim();
          
          // Check if this looks like a real computer name (not a pattern)
          if (this.isRealComputerName(computerName)) {
            deviceInfo.computerName = computerName;
            deviceInfo.hostname = computerName;
            deviceInfo.lookupMethod = 'user_details';
            deviceInfo.success = true;
            
            // Try to extract additional info
            if (userDetails.os) deviceInfo.operatingSystem = userDetails.os;
            if (userDetails.lastSeenGlobal) deviceInfo.lastSeen = userDetails.lastSeenGlobal;
            
            console.log(`✅ Strategy 1 SUCCESS: Found computer name in user details`);
            return;
          }
        }
      }

      console.log(`⚠️ Strategy 1: No real computer name in user details`);
      
    } catch (error) {
      console.log(`⚠️ Strategy 1 failed: ${error.message}`);
    }
  }

  /**
   * Strategy 2: Try to get computer name from activity records
   */
  async tryActivityDeviceLookup(userId, deviceInfo) {
    try {
      console.log(`🔍 Strategy 2: Activity device lookup for ${userId}`);
      
      // Get recent activity data
      const activityData = await this.api.getActivityWorklog({
        user: userId,
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0],
        limit: 100
      });

      if (activityData.data && activityData.data.length > 0) {
        // Check recent activity records for device info
        for (const activity of activityData.data.slice(0, 20)) {
          const computerFields = [
            activity.computerName,
            activity.deviceName,
            activity.hostname,
            activity.machineName,
            activity.client_name,
            activity.device?.name,
            activity.computer?.hostname,
            activity.systemInfo?.hostname
          ];

          for (const field of computerFields) {
            if (field && typeof field === 'string' && this.isRealComputerName(field.trim())) {
              deviceInfo.computerName = field.trim();
              deviceInfo.hostname = field.trim();
              deviceInfo.lookupMethod = 'activity_records';
              deviceInfo.success = true;
              deviceInfo.lastSeen = activity.startTime || activity.timestamp;
              
              console.log(`✅ Strategy 2 SUCCESS: Found computer name in activity records`);
              return;
            }
          }
        }
      }

      console.log(`⚠️ Strategy 2: No real computer name in activity records`);

    } catch (error) {
      console.log(`⚠️ Strategy 2 failed: ${error.message}`);
    }
  }

  /**
   * Strategy 3: Try to get computer name from screenshot metadata
   */
  async tryScreenshotDeviceLookup(userId, deviceInfo) {
    try {
      console.log(`🔍 Strategy 3: Screenshot device lookup for ${userId}`);
      
      const screenshots = await this.api.getScreenshots({
        user: userId,
        from: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0],
        limit: 50
      });

      if (screenshots.data && screenshots.data.length > 0) {
        for (const screenshot of screenshots.data.slice(0, 10)) {
          const computerFields = [
            screenshot.computerName,
            screenshot.deviceName,
            screenshot.hostname,
            screenshot.metadata?.hostname,
            screenshot.metadata?.computerName,
            screenshot.system?.hostname,
            screenshot.device?.name
          ];

          for (const field of computerFields) {
            if (field && typeof field === 'string' && this.isRealComputerName(field.trim())) {
              deviceInfo.computerName = field.trim();
              deviceInfo.hostname = field.trim();
              deviceInfo.lookupMethod = 'screenshot_metadata';
              deviceInfo.success = true;
              deviceInfo.lastSeen = screenshot.timestamp || screenshot.createdAt;
              
              console.log(`✅ Strategy 3 SUCCESS: Found computer name in screenshot metadata`);
              return;
            }
          }
        }
      }

      console.log(`⚠️ Strategy 3: No real computer name in screenshot metadata`);

    } catch (error) {
      console.log(`⚠️ Strategy 3 failed: ${error.message}`);
    }
  }

  /**
   * Strategy 4: Try to get computer name from worklog records
   */
  async tryWorklogDeviceLookup(userId, deviceInfo) {
    try {
      console.log(`🔍 Strategy 4: Worklog device lookup for ${userId}`);
      
      const worklogs = await this.api.getWorkLogs({
        user: userId,
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0],
        limit: 100
      });

      if (worklogs.data && worklogs.data.length > 0) {
        for (const worklog of worklogs.data.slice(0, 20)) {
          const computerFields = [
            worklog.computerName,
            worklog.deviceName,
            worklog.hostname,
            worklog.machineName,
            worklog.client?.hostname,
            worklog.device?.name,
            worklog.system?.hostname
          ];

          for (const field of computerFields) {
            if (field && typeof field === 'string' && this.isRealComputerName(field.trim())) {
              deviceInfo.computerName = field.trim();
              deviceInfo.hostname = field.trim();
              deviceInfo.lookupMethod = 'worklog_records';
              deviceInfo.success = true;
              deviceInfo.lastSeen = worklog.startTime || worklog.timestamp;
              
              console.log(`✅ Strategy 4 SUCCESS: Found computer name in worklog records`);
              return;
            }
          }
        }
      }

      console.log(`⚠️ Strategy 4: No real computer name in worklog records`);

    } catch (error) {
      console.log(`⚠️ Strategy 4 failed: ${error.message}`);
    }
  }

  /**
   * Strategy 5: Try direct session/connection info
   */
  async trySessionDeviceLookup(userId, deviceInfo) {
    try {
      console.log(`🔍 Strategy 5: Session device lookup for ${userId}`);
      
      // Try to get session or connection info directly
      const companyId = await this.api.getCompanyId();
      
      // Try a few different endpoints that might have device session info
      const possibleEndpoints = [
        `/api/1.0/users/${userId}/sessions`,
        `/api/1.0/users/${userId}/devices`,
        `/api/1.0/users/${userId}/connections`,
        `/api/1.0/activity/sessions?user=${userId}&company=${companyId}`,
        `/api/1.0/device-info?user=${userId}&company=${companyId}`
      ];

      for (const endpoint of possibleEndpoints) {
        try {
          const response = await this.api.request(endpoint, { method: 'GET' });
          
          if (response && (response.data || response.devices || response.sessions)) {
            const data = response.data || response.devices || response.sessions || [response];
            const devices = Array.isArray(data) ? data : [data];
            
            for (const device of devices) {
              const computerFields = [
                device.hostname,
                device.computerName,
                device.deviceName,
                device.machineName,
                device.name,
                device.clientName
              ];

              for (const field of computerFields) {
                if (field && typeof field === 'string' && this.isRealComputerName(field.trim())) {
                  deviceInfo.computerName = field.trim();
                  deviceInfo.hostname = field.trim();
                  deviceInfo.deviceType = device.deviceType || device.type || 'Unknown';
                  deviceInfo.operatingSystem = device.os || device.operatingSystem;
                  deviceInfo.ipAddress = device.ipAddress || device.ip;
                  deviceInfo.userAgent = device.userAgent;
                  deviceInfo.lookupMethod = 'session_info';
                  deviceInfo.success = true;
                  deviceInfo.lastSeen = device.lastSeen || device.lastActivity;
                  
                  console.log(`✅ Strategy 5 SUCCESS: Found computer name in session info`);
                  return;
                }
              }
            }
          }
        } catch (endpointError) {
          // Silently continue to next endpoint
          continue;
        }
      }

      console.log(`⚠️ Strategy 5: No real computer name in session info`);

    } catch (error) {
      console.log(`⚠️ Strategy 5 failed: ${error.message}`);
    }
  }

  /**
   * Check if a string looks like a real computer name vs a pattern
   * Real computer names: "Macbooks-MacBook-Air.local", "DESKTOP-ABC123", "Johns-iMac"
   * Patterns: "Computer-TthUmwrm", "User123"
   */
  isRealComputerName(name) {
    if (!name || name.length < 3) return false;
    
    // Real computer name indicators
    const realComputerPatterns = [
      /.*\.local$/i,                    // .local domains like "Macbooks-MacBook-Air.local"
      /.*\.domain\.com$/i,              // Domain names
      /DESKTOP-[A-Z0-9]{6,}/i,          // Windows computer names
      /^[A-Z][a-z]+-[A-Z][a-z]+/,      // "Johns-MacBook", "Maries-iMac"
      /MacBook|iMac|iPad|iPhone/i,      // Apple device names
      /LAPTOP-[A-Z0-9]+/i,              // Laptop names
      /^[A-Z]{2,}[0-9]{2,}/,            // Corporate patterns like "WS001", "DEV123"
    ];

    // Generic pattern indicators (NOT real computer names)
    const genericPatterns = [
      /^Computer-[A-Za-z0-9]{8}$/,      // "Computer-TthUmwrm"
      /^User[0-9]+$/,                   // "User123"
      /^Device[0-9]+$/,                 // "Device456"
      /^Unknown/i,                      // "Unknown Device"
    ];

    // Check if it matches a generic pattern (NOT a real computer name)
    for (const pattern of genericPatterns) {
      if (pattern.test(name)) {
        return false;
      }
    }

    // Check if it matches a real computer name pattern
    for (const pattern of realComputerPatterns) {
      if (pattern.test(name)) {
        return true;
      }
    }

    // Additional heuristics for real computer names
    if (name.includes('.') || name.includes('-') && name.length > 8) {
      return true;
    }

    // If it has mixed case and reasonable length, probably real
    if (/[A-Z]/.test(name) && /[a-z]/.test(name) && name.length > 5) {
      return true;
    }

    // Default to false for safety
    return false;
  }

  /**
   * Get device information with both real computer name and fallback
   */
  async getEnhancedDeviceInfo(userId, userInfo = null) {
    console.log(`🖥️ Getting enhanced device info for user ${userId}...`);
    
    // First try to get the real computer name
    const realDeviceInfo = await this.getRealComputerName(userId);
    
    // Also get the existing pattern-based extraction as fallback
    const patternDeviceInfo = this.getPatternBasedDeviceName(userInfo);
    
    return {
      userId: userId,
      realComputerName: realDeviceInfo.success ? realDeviceInfo.computerName : null,
      patternDeviceName: patternDeviceInfo,
      hostname: realDeviceInfo.hostname,
      deviceType: realDeviceInfo.deviceType,
      operatingSystem: realDeviceInfo.operatingSystem,
      ipAddress: realDeviceInfo.ipAddress,
      lastSeen: realDeviceInfo.lastSeen,
      
      // Final computer name (prefer real name over pattern)
      finalComputerName: realDeviceInfo.success ? realDeviceInfo.computerName : patternDeviceInfo,
      
      // Metadata
      lookupMethod: realDeviceInfo.success ? realDeviceInfo.lookupMethod : 'pattern_extraction',
      realNameFound: realDeviceInfo.success,
      confidenceLevel: realDeviceInfo.success ? 'high' : 'low',
      error: realDeviceInfo.error,
      
      debug: {
        realDeviceInfo: realDeviceInfo,
        patternDeviceInfo: patternDeviceInfo,
        recommendedName: realDeviceInfo.success ? realDeviceInfo.computerName : patternDeviceInfo
      }
    };
  }

  /**
   * Existing pattern-based device name extraction (fallback)
   */
  getPatternBasedDeviceName(userInfo, activityData = null) {
    // This is the existing logic from your api.js
    const possibleDeviceFields = [
      userInfo?.deviceName,
      userInfo?.computerName,
      userInfo?.machineName,
      userInfo?.hostname,
      userInfo?.device_name,
      userInfo?.computer_name,
      userInfo?.machine_name,
      userInfo?.workstation,
      userInfo?.client_name,
      userInfo?.device?.name,
      userInfo?.computer?.name,
      userInfo?.machine?.name,
      userInfo?.computerInfo?.name,
      userInfo?.systemInfo?.hostname
    ];

    // Check for device name in user info first
    for (const field of possibleDeviceFields) {
      if (field && typeof field === 'string' && field.trim() !== '') {
        return field.trim();
      }
    }

    // If activity data is available, try to extract device info from there
    if (activityData && Array.isArray(activityData) && activityData.length > 0) {
      for (const activity of activityData.slice(0, 10)) {
        const deviceFields = [
          activity?.deviceName,
          activity?.computerName,
          activity?.machineName,
          activity?.hostname,
          activity?.device_name,
          activity?.computer_name,
          activity?.client_name,
          activity?.workstation,
          activity?.device?.name,
          activity?.computer?.name,
          activity?.systemInfo?.hostname,
          activity?.computerInfo?.name
        ];

        for (const field of deviceFields) {
          if (field && typeof field === 'string' && field.trim() !== '') {
            return field.trim();
          }
        }
      }
    }

    // Fallback patterns
    if (userInfo?.name && userInfo.name !== 'Unknown' && userInfo.name.trim() !== '') {
      return `${userInfo.name.trim()}'s Device`;
    }

    if (userInfo?.email && userInfo.email !== 'Unknown' && userInfo.email.includes('@')) {
      const emailPrefix = userInfo.email.split('@')[0];
      return `${emailPrefix}-Computer`;
    }

    if (userInfo?.id) {
      return `Computer-${userInfo.id.slice(-8)}`;
    }

    return 'Unknown Device';
  }

  /**
   * Clear the device cache
   */
  clearCache() {
    this.deviceCache.clear();
    console.log('🗑️ Device lookup cache cleared');
  }
}

module.exports = EnhancedDeviceLookup;