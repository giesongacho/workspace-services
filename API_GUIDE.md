# API Quick Reference

## 🚀 **NEW: Automatic Full Data Retrieval**

**ALL endpoints now fetch ALL data automatically!**

- ✅ **No limits** - Gets every single record
- ✅ **Auto-pagination** - Handles multiple pages automatically
- ✅ **Complete results** - Never miss any data
- ✅ **Zero configuration** - Just call the endpoint!

---

## 🔄 Automatic Token Management

**The API automatically handles token expiration!**

- ✅ **Tokens auto-refresh** when expired
- ✅ **No manual intervention** needed
- ✅ **Cached for performance** (reduces login requests)
- ✅ **Seamless operation** - API calls never fail due to expired tokens

---

## Server Setup
1. Install: `npm install`
2. Configure: Edit `.env` file with your credentials
3. Start: `npm start`
4. Server runs at: `http://localhost:3000`

---

## All API Endpoints

### Base URL
```
http://localhost:3000/api
```

### Endpoints List (ALL return complete data)

| Endpoint | Method | Description | Returns |
|----------|--------|-------------|---------|
| `/health` | GET | Check if server is running | Status |
| `/auth/status` | GET | Check token status & validity | Token info |
| `/auth/refresh` | POST | Force generate new token | New token |
| `/getUsers` | GET | Get users | **ALL users** |
| `/getUser/:userId` | GET | Get one user | Single user |
| `/getUserActivity/:userId` | GET | Get user's activity | **ALL activity** |
| `/getProjects` | GET | Get projects | **ALL projects** |
| `/getTasks` | GET | Get tasks | **ALL tasks** |
| `/getWorkLogs` | GET | Get work logs | **ALL logs** |
| `/getScreenshots` | GET | Get screenshots | **ALL screenshots** |
| `/getTimeTracking` | GET | Get time tracking | **ALL tracking data** |

---

## How It Works

### Automatic Pagination Example

When you call `/api/getUsers`, here's what happens:

```
Request: GET /api/getUsers

Behind the scenes:
📄 Fetching page 1... (1000 records)
📄 Fetching page 2... (1000 records)
📄 Fetching page 3... (234 records)
📊 All data retrieved!

Response: 2234 total users (ALL of them!)
```

---

## Simple Examples

### 1. Get ALL Users (no limit needed!)
```bash
curl http://localhost:3000/api/getUsers
```
**Returns:** Every single user in your account

### 2. Get ALL Projects
```bash
curl http://localhost:3000/api/getProjects
```
**Returns:** Every single project

### 3. Get ALL Work Logs for January
```bash
curl "http://localhost:3000/api/getWorkLogs?from=2025-01-01&to=2025-01-31"
```
**Returns:** Every work log in January (could be thousands!)

### 4. Get ALL Tasks
```bash
curl http://localhost:3000/api/getTasks
```
**Returns:** Every task across all projects

---

## JavaScript Examples

```javascript
// Get ALL users - automatically paginated!
fetch('http://localhost:3000/api/getUsers')
  .then(response => response.json())
  .then(data => {
    console.log(`Got ALL ${data.count} users!`);
    // data.data.data contains EVERY user
  });

// Get ALL work logs for a date range
fetch('http://localhost:3000/api/getWorkLogs?from=2025-01-01&to=2025-01-31')
  .then(response => response.json())
  .then(data => {
    console.log(`Got ALL ${data.count} work logs!`);
    // No matter if it's 10 or 10,000 logs!
  });

// Get ALL projects
fetch('http://localhost:3000/api/getProjects')
  .then(response => response.json())
  .then(data => {
    console.log(`Got ALL ${data.count} projects!`);
  });
```

---

## Response Format

### Success (with ALL data)
```json
{
  "success": true,
  "count": 2234,
  "data": {
    "data": [...],  // ALL 2234 records here!
    "total": 2234,
    "fetched_all": true
  }
}
```

### Error
```json
{
  "success": false,
  "error": "Error message"
}
```

---

## Query Parameters (Optional)

| Parameter | What it does | Example |
|-----------|-------------|---------|
| `from` | Start date | `?from=2025-01-01` |
| `to` | End date | `?to=2025-01-31` |
| `keepLimit` | Use specific limit | `?limit=10&keepLimit=true` |

**Note:** You don't need `limit` anymore - API fetches ALL data by default!

---

## Real-World Examples

### Export ALL Users to Excel
```javascript
async function exportAllUsers() {
  const response = await fetch('http://localhost:3000/api/getUsers');
  const data = await response.json();
  
  console.log(`Exporting ${data.count} users to Excel`);
  // data.data.data has ALL users
  // Export to Excel logic here
}
```

### Get Complete Year's Data
```javascript
async function getYearData() {
  const response = await fetch(
    'http://localhost:3000/api/getWorkLogs?from=2024-01-01&to=2024-12-31'
  );
  const data = await response.json();
  
  console.log(`Retrieved ALL ${data.count} work logs for 2024`);
  // Process complete year's data
}
```

### Full Backup
```javascript
async function backupEverything() {
  const [users, projects, tasks] = await Promise.all([
    fetch('http://localhost:3000/api/getUsers').then(r => r.json()),
    fetch('http://localhost:3000/api/getProjects').then(r => r.json()),
    fetch('http://localhost:3000/api/getTasks').then(r => r.json())
  ]);
  
  console.log(`Backup complete:
    - ${users.count} users
    - ${projects.count} projects
    - ${tasks.count} tasks`);
}
```

---

## Token Lifecycle

1. **First Request**: Authenticates and gets token (valid for ~24 hours)
2. **Subsequent Requests**: Uses cached token
3. **Token Expires**: Automatically gets new token
4. **You Never Need To**: Manually manage tokens!

---

## Console Output Example

When fetching large datasets, you'll see progress:

```
👥 Fetching ALL users...
📄 Fetching all data (automatic pagination)...
📄 Fetching page 1...
  ✅ Page 1: Retrieved 1000 records (Total: 1000)
📄 Fetching page 2...
  ✅ Page 2: Retrieved 1000 records (Total: 2000)
📄 Fetching page 3...
  ✅ Page 3: Retrieved 567 records (Total: 2567)
📊 All data retrieved!
✅ Retrieved ALL 2567 users
```

---

## Need Specific Limits?

If you really need to limit results, use `keepLimit=true`:

```bash
# Get only 10 users
curl "http://localhost:3000/api/getUsers?limit=10&keepLimit=true"
```

---

## Need Help?

- Check if server is running: `http://localhost:3000/api/health`
- Check token status: `http://localhost:3000/api/auth/status`
- Make sure `.env` file has your credentials
- Date format must be: `YYYY-MM-DD`
- Large datasets take time - be patient!