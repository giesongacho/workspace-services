/**
 * @route   GET /api/debug/exploreUserData/:userId
 * @desc    Explore ALL available user data from TimeDoctor to find computer name
 * @param   userId - User ID to explore
 */
app.get('/api/debug/exploreUserData/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    if (!userId || userId === 'undefined') {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
        example: 'GET /api/debug/exploreUserData/aLfYIu7-TthUmwrm'
      });
    }

    console.log(`🔍 DEEP EXPLORATION: Finding computer name data for user ${userId}...`);
    
    const companyId = await api.getCompanyId();
    const explorationResults = {
      userId: userId,
      companyId: companyId,
      timestamp: new Date().toISOString(),
      dataFound: {},
      errors: {},
      potentialComputerNameFields: []
    };

    // List of TimeDoctor API endpoints that might contain computer/device information
    const endpointsToTry = [
      // User endpoints
      `/api/1.0/users/${userId}`,
      `/api/1.0/users/${userId}/profile`,
      `/api/1.0/users/${userId}/details`,
      `/api/1.0/users/${userId}/info`,
      `/api/1.0/users/${userId}/device`,
      `/api/1.0/users/${userId}/devices`,
      `/api/1.0/users/${userId}/sessions`,
      `/api/1.0/users/${userId}/connections`,
      `/api/1.0/users/${userId}/settings`,
      
      // Device/Computer specific endpoints
      `/api/1.0/devices?user=${userId}&company=${companyId}`,
      `/api/1.0/user-devices?user=${userId}&company=${companyId}`,
      `/api/1.0/computer-info?user=${userId}&company=${companyId}`,
      `/api/1.0/device-info?user=${userId}&company=${companyId}`,
      `/api/1.0/client-info?user=${userId}&company=${companyId}`,
      `/api/1.0/workstation?user=${userId}&company=${companyId}`,
      
      // Activity endpoints that might have device info
      `/api/1.0/activity/sessions?user=${userId}&company=${companyId}&from=${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}&to=${new Date().toISOString().split('T')[0]}`,
      `/api/1.0/activity/devices?user=${userId}&company=${companyId}`,
      `/api/1.0/activity/computers?user=${userId}&company=${companyId}`,
      
      // Screenshots might have metadata
      `/api/1.0/screenshots?user=${userId}&company=${companyId}&from=${new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}&to=${new Date().toISOString().split('T')[0]}&limit=5`,
      
      // Recent activity that might contain device metadata
      `/api/1.0/activity/worklog?user=${userId}&company=${companyId}&from=${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}&to=${new Date().toISOString().split('T')[0]}&limit=10`
    ];

    console.log(`🔍 Trying ${endpointsToTry.length} different API endpoints to find computer name...`);

    // Try each endpoint
    for (const endpoint of endpointsToTry) {
      try {
        console.log(`  📡 Trying: ${endpoint.split('?')[0]}...`);
        const response = await api.request(endpoint, { method: 'GET' });
        
        if (response) {
          const endpointKey = endpoint.split('/').pop().split('?')[0];
          explorationResults.dataFound[endpointKey] = response;
          
          // Look for potential computer name fields in this response
          const computerNameFields = findComputerNameFields(response);
          if (computerNameFields.length > 0) {
            explorationResults.potentialComputerNameFields.push({
              endpoint: endpoint,
              fields: computerNameFields
            });
          }
          
          console.log(`    ✅ Success - Found ${JSON.stringify(response).length} bytes of data`);
        }
      } catch (error) {
        const endpointKey = endpoint.split('/').pop().split('?')[0];
        explorationResults.errors[endpointKey] = error.message;
        console.log(`    ❌ Failed: ${error.message}`);
      }
      
      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Summary of findings
    const summary = {
      endpointsWorked: Object.keys(explorationResults.dataFound).length,
      endpointsFailed: Object.keys(explorationResults.errors).length,
      potentialComputerNameFields: explorationResults.potentialComputerNameFields.length,
      recommendations: []
    };

    if (explorationResults.potentialComputerNameFields.length > 0) {
      summary.recommendations.push('✅ Found potential computer name fields! Check the potentialComputerNameFields array.');
      console.log(`🎯 FOUND ${explorationResults.potentialComputerNameFields.length} potential computer name fields!`);
    } else {
      summary.recommendations.push('⚠️ No obvious computer name fields found. The data might be in a nested object or different field name.');
      summary.recommendations.push('🔍 Check the dataFound object manually for hostname, computerName, deviceName, etc.');
    }

    console.log(`✅ Exploration complete: ${summary.endpointsWorked} endpoints worked, ${summary.endpointsFailed} failed`);

    res.json({
      success: true,
      message: `Deep exploration completed for user ${userId}`,
      summary: summary,
      data: explorationResults
    });

  } catch (error) {
    console.error(`❌ Deep exploration error for ${req.params.userId}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      userId: req.params.userId,
      message: 'Deep exploration failed'
    });
  }
});

/**
 * Helper function to find potential computer name fields in API responses
 */
function findComputerNameFields(obj, path = '') {
  const potentialFields = [];
  
  if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      // Check if this key looks like it might contain computer name
      const computerNameKeys = [
        'computername', 'computer_name', 'computerName',
        'hostname', 'host_name', 'hostName',
        'devicename', 'device_name', 'deviceName', 
        'machinename', 'machine_name', 'machineName',
        'workstation', 'workstationname', 'workstation_name',
        'clientname', 'client_name', 'clientName',
        'systemname', 'system_name', 'systemName',
        'pcname', 'pc_name', 'pcName'
      ];
      
      if (computerNameKeys.includes(key.toLowerCase())) {
        potentialFields.push({
          path: currentPath,
          key: key,
          value: value,
          type: typeof value,
          looks_like_computer_name: isLikelyComputerName(value)
        });
      }
      
      // Also check if the value itself looks like a computer name
      if (typeof value === 'string' && isLikelyComputerName(value)) {
        potentialFields.push({
          path: currentPath,
          key: key,
          value: value,
          type: 'string',
          looks_like_computer_name: true,
          reason: 'Value matches computer name pattern'
        });
      }
      
      // Recursively check nested objects and arrays
      if (typeof value === 'object' && value !== null) {
        potentialFields.push(...findComputerNameFields(value, currentPath));
      }
    }
  }
  
  return potentialFields;
}

/**
 * Helper function to detect if a string looks like a computer name
 */
function isLikelyComputerName(value) {
  if (typeof value !== 'string' || !value) return false;
  
  const computerNamePatterns = [
    /.*\.local$/i,                    // .local domains like "Macbooks-MacBook-Air.local"
    /.*\.domain\.(com|net|org)$/i,    // Domain names
    /DESKTOP-[A-Z0-9]{6,}/i,          // Windows computer names
    /^[A-Z][a-z]+-[A-Z][a-z]+/,      // "Johns-MacBook", "Maries-iMac"  
    /MacBook|iMac|iPad|iPhone/i,      // Apple device names
    /LAPTOP-[A-Z0-9]+/i,              // Laptop names
    /^[A-Z]{2,}[0-9]{2,}/,            // Corporate patterns like "WS001", "DEV123"
    /^[A-Za-z]+-[A-Za-z0-9-]+\.(local|home|corp)$/i  // hostname patterns
  ];
  
  return computerNamePatterns.some(pattern => pattern.test(value));
}

/**
 * @route   GET /api/debug/findComputerNameEndpoint/:userId
 * @desc    Specifically look for the endpoint that contains computer name like "Macbooks-MacBook-Air.local"
 * @param   userId - User ID to search
 */
app.get('/api/debug/findComputerNameEndpoint/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    if (!userId || userId === 'undefined') {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    console.log(`🎯 TARGETED SEARCH: Looking specifically for computer name like 'Macbooks-MacBook-Air.local' for user ${userId}...`);
    
    const companyId = await api.getCompanyId();
    const results = {
      userId: userId,
      targetPattern: 'Looking for patterns like: Macbooks-MacBook-Air.local, DESKTOP-ABC123, etc.',
      findings: [],
      recommendations: []
    };

    // Try the most promising endpoints first
    const priorityEndpoints = [
      // User endpoints with full details
      { endpoint: `/api/1.0/users/${userId}`, description: 'Basic user info' },
      
      // Try getting recent screenshots with metadata - this often contains device info
      { 
        endpoint: `/api/1.0/screenshots?user=${userId}&company=${companyId}&from=${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}&to=${new Date().toISOString().split('T')[0]}&limit=20`,
        description: 'Recent screenshots (often contain device metadata)'
      },
      
      // Activity logs often have device information
      {
        endpoint: `/api/1.0/activity/worklog?user=${userId}&company=${companyId}&from=${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}&to=${new Date().toISOString().split('T')[0]}&limit=50`,
        description: 'Activity worklog (may contain device info in metadata)'
      },
      
      // Try time use data which might have device context
      {
        endpoint: `/api/1.0/activity/timeuse?user=${userId}&company=${companyId}&from=${new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}&to=${new Date().toISOString().split('T')[0]}&limit=20`,
        description: 'Time usage data (may include device context)'
      }
    ];

    for (const {endpoint, description} of priorityEndpoints) {
      try {
        console.log(`🔍 Checking: ${description}...`);
        const response = await api.request(endpoint, { method: 'GET' });
        
        if (response) {
          // Deep search for computer name patterns
          const computerNames = deepSearchForComputerNames(response);
          
          if (computerNames.length > 0) {
            results.findings.push({
              endpoint: endpoint,
              description: description,
              computerNames: computerNames,
              success: true
            });
            
            console.log(`  ✅ FOUND ${computerNames.length} potential computer names!`);
            computerNames.forEach(name => {
              console.log(`    🖥️ ${name.value} (found in: ${name.path})`);
            });
          } else {
            results.findings.push({
              endpoint: endpoint, 
              description: description,
              computerNames: [],
              success: false,
              note: 'No computer name patterns found'
            });
            console.log(`  ⚠️ No computer names found in this endpoint`);
          }
        }
      } catch (error) {
        results.findings.push({
          endpoint: endpoint,
          description: description,
          error: error.message,
          success: false
        });
        console.log(`  ❌ Failed: ${error.message}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Generate recommendations based on findings
    const successfulFindings = results.findings.filter(f => f.success && f.computerNames.length > 0);
    
    if (successfulFindings.length > 0) {
      results.recommendations.push('🎉 SUCCESS: Found computer names in TimeDoctor data!');
      results.recommendations.push(`✅ Found computer names in ${successfulFindings.length} different endpoints`);
      
      const allComputerNames = successfulFindings.flatMap(f => f.computerNames);
      const uniqueNames = [...new Set(allComputerNames.map(n => n.value))];
      
      results.recommendations.push(`📊 Total unique computer names found: ${uniqueNames.length}`);
      results.recommendations.push('🔧 Update your enhanced-device-lookup.js to check these specific endpoints and field paths');
    } else {
      results.recommendations.push('⚠️ No computer names found in the checked endpoints');
      results.recommendations.push('🔍 The computer name might be in a different API endpoint not yet checked');
      results.recommendations.push('📱 Try checking if the TimeDoctor client sends device info during login/session creation');
      results.recommendations.push('🛠️ Consider checking TimeDoctor API documentation for device/computer endpoints');
    }

    res.json({
      success: true,
      message: `Computer name search completed for user ${userId}`,
      data: results
    });

  } catch (error) {
    console.error(`❌ Computer name search error for ${req.params.userId}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      userId: req.params.userId
    });
  }
});

/**
 * Deep search function to find computer names in complex nested objects
 */
function deepSearchForComputerNames(obj, path = '', maxDepth = 10, currentDepth = 0) {
  const results = [];
  
  if (currentDepth >= maxDepth || !obj || typeof obj !== 'object') {
    return results;
  }
  
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      results.push(...deepSearchForComputerNames(item, `${path}[${index}]`, maxDepth, currentDepth + 1));
    });
  } else {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      // Check if this value looks like a computer name
      if (typeof value === 'string' && isLikelyComputerName(value)) {
        results.push({
          path: currentPath,
          key: key,
          value: value,
          confidence: getComputerNameConfidence(value)
        });
      }
      
      // Continue searching deeper
      results.push(...deepSearchForComputerNames(value, currentPath, maxDepth, currentDepth + 1));
    }
  }
  
  return results;
}

/**
 * Get confidence level for computer name detection
 */
function getComputerNameConfidence(value) {
  if (/.*\.local$/i.test(value)) return 'very_high'; // .local domains
  if (/MacBook|iMac/i.test(value)) return 'very_high'; // Apple devices
  if (/DESKTOP-[A-Z0-9]{6,}/i.test(value)) return 'high'; // Windows
  if (/^[A-Za-z]+-[A-Za-z0-9-]+\./i.test(value)) return 'high'; // hostname patterns
  if (/Computer-|LAPTOP-/i.test(value)) return 'medium'; // Generic patterns
  return 'low';
}