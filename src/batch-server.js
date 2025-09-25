const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const TimeDoctorAPI = require('./api');
const config = require('./config');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// 🔗 WEBHOOK URL
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.srv470812.hstgr.cloud/webhook/workspace-url-n8n';

// 🎯 SINGLE SEND CONFIGURATION
const SEND_ONCE_ON_STARTUP = true;
const SEND_RECURRING = false;

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

// ==================== ONE SINGLE WEBHOOK CALL ====================

/**
 * 🎯 SEND ALL USERS IN ONE SINGLE WEBHOOK CALL - NO INDIVIDUAL CALLS!
 */
async function sendAllUsersInOneCall() {
  try {
    console.log('\n🚀 [ONE CALL] Collecting ALL users for ONE single webhook...');
    
    // Get all users with real names
    const allUsers = await api.getUsers({ limit: 1000, detail: 'extended' });
    
    if (!allUsers.data || allUsers.data.length === 0) {
      console.log('❌ No users found');
      return;
    }

    console.log(`📊 [ONE CALL] Found ${allUsers.data.length} users to send in ONE call`);
    
    // Process all users into one array
    const processedUsers = allUsers.data.map(user => {
      const realName = user.name || 
                      user.displayName || 
                      user.fullName || 
                      user.username ||
                      user.email?.split('@')[0] ||
                      'Unknown User';
      
      console.log(`✅ [ONE CALL] Adding "${realName}" to single payload`);
      
      return {
        name: realName,
        email: user.email || 'Email not available',
        userId: user.id,
        realName: realName,
        realEmail: user.email || 'Email not available',
        timezone: user.timezone || 'Unknown',
        role: user.role || 'Unknown',
        status: user.status || 'Unknown',
        processedAt: new Date().toISOString()
      };
    });

    // 🎯 CREATE ONE SINGLE JSON PAYLOAD WITH ALL USERS
    const oneJsonPayload = {
      batchInfo: {
        type: 'ALL_USERS_IN_ONE_CALL',
        totalUsers: processedUsers.length,
        timestamp: new Date().toISOString(),
        source: 'timekeeper-workspace-services',
        webhookUrl: N8N_WEBHOOK_URL,
        description: 'ALL users in ONE single webhook call - NO individual calls!'
      },
      
      // 👥 ALL USERS IN ONE ARRAY
      allUsers: processedUsers,
      
      // 📈 SUMMARY
      summary: {
        totalUsers: processedUsers.length,
        realNamesFound: processedUsers.map(u => u.name),
        generatedAt: new Date().toISOString()
      }
    };

    console.log('\n📤 [ONE CALL] Sending ALL users in ONE single webhook call...');
    console.log(`📊 Total users: ${processedUsers.length}`);
    console.log(`✅ Names: ${oneJsonPayload.summary.realNamesFound.join(', ')}`);
    console.log(`🔗 Webhook: ${N8N_WEBHOOK_URL}`);
    console.log('🎯 THIS IS ONE CALL - NOT INDIVIDUAL CALLS!');
    
    // 🚀 SEND ONE SINGLE WEBHOOK CALL
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Workspace-Services-One-Call/1.0'
      },
      body: JSON.stringify(oneJsonPayload),
      timeout: 30000
    });

    console.log(`📡 Response: ${response.status} ${response.statusText}`);

    if (response.ok) {
      console.log('\n✅ [ONE CALL] SUCCESS!');
      console.log(`🎉 Sent ALL ${processedUsers.length} users in ONE webhook call!`);
      console.log(`🎯 Your n8n will show ONE execution, not individual calls!`);
      return true;
    } else {
      const errorText = await response.text().catch(() => 'Unable to read response');
      console.error(`❌ [ONE CALL] FAILED: ${response.status} ${response.statusText}`);
      console.error(`❌ Error: ${errorText}`);
      return false;
    }
    
  } catch (error) {
    console.error(`❌ [ONE CALL] Error: ${error.message}`);
    return false;
  }
}

// ==================== API ENDPOINTS ====================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'TimeDoctor API Server - ONE SINGLE WEBHOOK CALL',
    timestamp: new Date().toISOString(),
    configuration: {
      webhookUrl: N8N_WEBHOOK_URL,
      sendMode: 'ONE CALL - All users in single payload',
      sendOnce: SEND_ONCE_ON_STARTUP,
      description: 'NO individual calls - ALL users sent in ONE webhook'
    }
  });
});

app.post('/api/sync/now', async (req, res) => {
  try {
    console.log('🚀 [MANUAL] Manual ONE CALL trigger...');
    
    sendAllUsersInOneCall().then(() => {
      console.log('✅ [MANUAL] ONE CALL completed');
    }).catch(error => {
      console.error('❌ [MANUAL] ONE CALL failed:', error.message);
    });
    
    res.json({
      success: true,
      message: 'ONE CALL with ALL users started',
      description: 'ALL users will be sent in ONE webhook call',
      webhookUrl: N8N_WEBHOOK_URL,
      note: 'Check your n8n - you will see ONE execution only'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/debug/allUsers', async (req, res) => {
  try {
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
      email: user.email || 'NO EMAIL'
    }));
    
    res.json({
      success: true,
      message: `Found ${userList.length} users - will send in ONE call`,
      totalUsers: userList.length,
      data: userList,
      webhookInfo: {
        url: N8N_WEBHOOK_URL,
        method: 'ONE CALL - All users in single payload'
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
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
  console.log('\n🚀 TimeDoctor API Server - ONE SINGLE WEBHOOK CALL');
  console.log('==================================================');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`📧 Email: ${config.credentials.email}`);
  console.log(`🏢 Company: ${config.credentials.companyName}`);
  console.log('\n🎯 ONE CALL CONFIGURATION:');
  console.log('==========================');
  console.log('✅ ALL users in ONE JSON payload');
  console.log('✅ ONE webhook call (NO individual calls)'); 
  console.log('✅ Real usernames from TimeDoctor');
  console.log('✅ Sent ONCE on startup');
  console.log('\n🔗 WEBHOOK:');
  console.log('===========');
  console.log(`🎯 URL: ${N8N_WEBHOOK_URL}`);
  console.log('📊 Format: ONE JSON with ALL users');
  console.log('🎉 Result: ONE n8n execution only');
  
  // 🚀 Send ONE call on startup
  if (SEND_ONCE_ON_STARTUP) {
    setTimeout(() => {
      console.log('\n🚀 [STARTUP] Sending ONE webhook call with ALL users...');
      console.log('🎯 This will be ONE execution in your n8n!');
      sendAllUsersInOneCall();
    }, 10000);
  }
  
  console.log('\n🎉 Server ready! ONE webhook call coming up!');
});

module.exports = app;