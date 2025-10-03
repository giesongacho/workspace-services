const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const fetch = require('node-fetch');
const TimeDoctorAPI = require('./api');

const app = express();
const PORT = process.env.PORT || 3000;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.srv470812.hstgr.cloud/webhook/workspace';

const SEND_ONCE_ON_STARTUP = true;
const SEND_RECURRING = true;
const CRON_SCHEDULE = '0 4 * * *'; // Runs at 12:00 AM New York Time (4:00 AM UTC)

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const api = new TimeDoctorAPI();

let lastSyncTime = null;
let syncInProgress = false;
let totalSyncs = 0;

// Helper function to format date as YYYY-MM-DD
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper function to get date range (2-day window, 3 days ago to 2 days ago)
// This accounts for Time Doctor API processing delay and requirement for date ranges
function getDateRange() {
  const nowInNY = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  const nyDate = new Date(nowInNY);
  
  // Get date from 3 days ago
  const fromDate = new Date(nyDate);
  fromDate.setDate(fromDate.getDate() - 1);
  
  // Get date from 2 days ago
  const toDate = new Date(nyDate);
  toDate.setDate(toDate.getDate());
  
  return {
    from: formatDate(fromDate),
    to: formatDate(toDate)
  };
}

async function syncAllUsersToN8N_OneCall() {
  if (syncInProgress) {
    console.log('Sync in progress');
    return false;
  }

  syncInProgress = true;
  
  try {
    console.log('STARTING SYNC');
    console.log('Current NY Time:', new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    
    // Get date from 2 days ago (based on New York timezone)
    const { from, to } = getDateRange();
    console.log(`Date Range: ${from} to ${to} (New York Timezone, 2 days ago due to API processing delay)`);
    
    const allMonitoringData = await api.getAllUsersMonitoring({ from, to });

    if (!allMonitoringData.success || !allMonitoringData.data) {
      console.log('No data');
      syncInProgress = false;
      return false;
    }

    console.log(`Processing ${allMonitoringData.data.length} users...`);

    const processedUsers = [];
    for (const user of allMonitoringData.data) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Fetching screenshots for user: ${user.userId}`);
      console.log(`User: ${user.username}`);
      console.log(`DEBUG - User ID being passed:`, user.userId);
      
      try {
        const screenshotResult = await api.getFiles({
          user: user.userId,
          from: from,
          to: to,
          limit: 100
        });
        
        console.log('\n--- SCREENSHOT API RESPONSE ---');
        console.log(`Total screenshots found: ${screenshotResult.data?.length || 0}`);
        
        if (screenshotResult.data && screenshotResult.data.length > 0) {
          console.log('\n--- FIRST SCREENSHOT SAMPLE ---');
          console.log(JSON.stringify(screenshotResult.data[0], null, 2));
        }
        
        let screenshots = [];
        if (screenshotResult.data) {
          screenshots = screenshotResult.data.map(file => {
            return {
              id: file.id,
              timestamp: file.timestamp || file.created || file.date,
              userId: file.userId,
              url: file.url || file.signedUrl || file.fileUrl || file.imageUrl || file.link || file.screenshotUrl,
              thumbnailUrl: file.thumbnailUrl || file.thumbnail,
              title: file.title || file.name || file.fileName,
              isBlurred: file.isBlurred,
              rawData: file
            };
          });
          console.log(`Mapped ${screenshots.length} screenshots`);
        } else {
          console.log('No screenshots data in response');
        }
        
        processedUsers.push({
          ...user,
          screenshots: {
            totalScreenshots: screenshots.length,
            data: screenshots
          }
        });
      } catch (error) {
        console.error(`Error fetching screenshots for ${user.userId}:`, error.message);
        console.error('Stack:', error.stack);
        processedUsers.push({
          ...user,
          screenshots: {
            totalScreenshots: 0,
            data: []
          }
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    const payload = {
      body: {
        system: "timedoctor",
        allUsers: processedUsers,
        dateRange: { from, to }
      }
    };

    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      totalSyncs++;
      lastSyncTime = new Date();
      console.log('\nSYNC SUCCESS');
      console.log(`Total syncs completed: ${totalSyncs}`);
      console.log(`Last sync time: ${lastSyncTime.toISOString()}`);
      syncInProgress = false;
      return true;
    } else {
      console.error('\nSYNC FAILED:', response.status);
      syncInProgress = false;
      return false;
    }
    
  } catch (error) {
    console.error('\nSYNC ERROR:', error.message);
    syncInProgress = false;
    return false;
  }
}

app.get('/api/health', (req, res) => {
  const dateRange = getDateRange();
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    lastSyncTime: lastSyncTime,
    totalSyncs: totalSyncs,
    syncInProgress: syncInProgress,
    nextSyncDateRange: dateRange
  });
});

app.post('/api/sync/now', async (req, res) => {
  if (syncInProgress) {
    return res.json({ success: false, message: 'Sync in progress' });
  }
  
  const result = await syncAllUsersToN8N_OneCall();
  res.json({ 
    success: result, 
    message: result ? 'Sync completed successfully' : 'Sync failed',
    dateRange: getDateRange()
  });
});

app.get('/api/debug/user/:userId', async (req, res) => {
  try {
    const diagnostic = await api.debugCompleteDiagnostic(req.params.userId);
    res.json(diagnostic);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/debug/activities/:userId', async (req, res) => {
  try {
    const { from, to } = getDateRange();
    const results = await api.debugUserActivities(req.params.userId, { from, to });
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/debug/raw/:userId', async (req, res) => {
  try {
    const { from, to } = getDateRange();
    const result = await api.debugRawRequest('/api/1.0/activity/worklog', {
      user: req.params.userId,
      from,
      to,
      limit: 100
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/debug/screenshots/:userId', async (req, res) => {
  try {
    const { from, to } = getDateRange();
    const result = await api.getScreenshots({
      user: req.params.userId,
      from,
      to,
      limit: 10
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

if (SEND_RECURRING) {
  cron.schedule(CRON_SCHEDULE, () => {
    console.log('\n' + '='.repeat(80));
    console.log('SCHEDULED SYNC TRIGGERED (New York Timezone)');
    console.log('Time: ' + new Date().toISOString());
    console.log('NY Time: ' + new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    console.log('='.repeat(80) + '\n');
    syncAllUsersToN8N_OneCall();
  }, { scheduled: true, timezone: "UTC" });
  console.log('✓ Cron job scheduled successfully');
}

app.listen(PORT, () => {
  const dateRange = getDateRange();
  console.log('\n' + '='.repeat(80));
  console.log('🚀 TIME DOCTOR SYNC SERVER STARTED');
  console.log('='.repeat(80));
  console.log(`📡 Server running on port: ${PORT}`);
  console.log(`⏰ Cron schedule: ${CRON_SCHEDULE}`);
  console.log(`🕐 Runs at: 12:00 AM New York Time (4:00 AM UTC)`);
  console.log(`📅 Will sync data from: ${dateRange.from} to ${dateRange.to} (2-day range)`);
  console.log(`⚠️  Note: Using 2-3 day delay to account for Time Doctor API processing time`);
  console.log(`🔗 N8N Webhook: ${N8N_WEBHOOK_URL}`);
  console.log(`🌐 Time Doctor Timezone: New York (UTC -04:00)`);
  console.log('='.repeat(80) + '\n');
  
  console.log('Available endpoints:');
  console.log('  GET  /api/health');
  console.log('  POST /api/sync/now');
  console.log('  GET  /api/debug/user/:userId');
  console.log('  GET  /api/debug/activities/:userId');
  console.log('  GET  /api/debug/raw/:userId');
  console.log('  GET  /api/debug/screenshots/:userId');
  console.log('\n');
  
  if (SEND_ONCE_ON_STARTUP) {
    setTimeout(() => {
      console.log('🔄 Running initial sync in 10 seconds...');
      setTimeout(() => {
        syncAllUsersToN8N_OneCall();
      }, 10000);
    }, 0);
  }
});

module.exports = app;