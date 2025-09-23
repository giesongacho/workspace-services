# TimeDoctor API Server

A REST API server that connects to TimeDoctor and automatically fetches **ALL DATA** without limits using smart pagination.

---

## 🎯 Key Features

### ✨ **Automatic Full Data Retrieval**
- **NO LIMITS** - Automatically fetches ALL records
- **Smart Pagination** - Automatically handles multiple pages
- **Complete Results** - Never miss any data
- **Efficient** - Fetches 1000 records per page for speed

### 🔄 **Automatic Token Management**
- **Auto-refresh** when tokens expire
- **Token caching** for better performance
- **Never fails** due to authentication

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [API Documentation](#api-documentation)
3. [Examples](#examples)
4. [Configuration](#configuration)
5. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Step 1: Install the Project

```bash
git clone https://github.com/iceman-vici/special-task-tdm-api.git
cd special-task-tdm-api
npm install
```

### Step 2: Set Up Your Credentials

Create a `.env` file from the template:

```bash
cp .env.example .env
```

Edit `.env` and add your TimeDoctor credentials:

```
TD_EMAIL=your-email@example.com
TD_PASSWORD=your-password
TD_COMPANY_NAME=Your Company Name
```

### Step 3: Start the Server

```bash
npm start
```

The server will start at: **http://localhost:3000**

### Step 4: Test the API

Open your browser or use curl to test:

```bash
curl http://localhost:3000/api/health
```

---

## API Documentation

### Base URL
```
http://localhost:3000/api
```

### 📊 **IMPORTANT: All Endpoints Return ALL Data**

All endpoints automatically fetch **ALL available data** using pagination. You don't need to worry about limits or pagination - the API handles everything automatically!

---

## API Endpoints

### 1. Get ALL Users

**Endpoint:** `GET /api/getUsers`

**Description:** Retrieves ALL users in your TimeDoctor account (no limits).

**Example Request:**
```bash
curl http://localhost:3000/api/getUsers
```

**Example Response:**
```json
{
  "success": true,
  "count": 150,
  "data": {
    "data": [
      // ALL 150 users returned automatically
    ],
    "total": 150,
    "fetched_all": true
  }
}
```

**What happens behind the scenes:**
```
📄 Fetching all data (automatic pagination)...
📄 Fetching page 1...
  ✅ Page 1: Retrieved 100 records (Total: 100)
📄 Fetching page 2...
  ✅ Page 2: Retrieved 50 records (Total: 150)
📊 All data retrieved!
✅ Retrieved ALL 150 users
```

---

### 2. Get Single User

**Endpoint:** `GET /api/getUser/:userId`

**Description:** Get detailed information about a specific user.

**Example Request:**
```bash
curl http://localhost:3000/api/getUser/123456
```

---

### 3. Get User Activity

**Endpoint:** `GET /api/getUserActivity/:userId`

**Description:** Get ALL activity and time tracking data for a specific user.

**Example Request:**
```bash
curl "http://localhost:3000/api/getUserActivity/123456?from=2025-01-01&to=2025-01-31"
```

---

### 4. Get ALL Projects

**Endpoint:** `GET /api/getProjects`

**Description:** Get ALL projects in your TimeDoctor account (no limits).

**Example Request:**
```bash
curl http://localhost:3000/api/getProjects
```

**Response:** Returns ALL projects automatically paginated.

---

### 5. Get ALL Tasks

**Endpoint:** `GET /api/getTasks`

**Description:** Get ALL tasks across all projects (no limits).

**Example Request:**
```bash
curl http://localhost:3000/api/getTasks
```

---

### 6. Get ALL Work Logs

**Endpoint:** `GET /api/getWorkLogs`

**Description:** Get ALL time tracking logs for your team (no limits).

**Example Request:**
```bash
curl "http://localhost:3000/api/getWorkLogs?from=2025-01-01&to=2025-01-31"
```

**Note:** Automatically fetches ALL records in the date range, no matter how many!

---

### 7. Get ALL Screenshots

**Endpoint:** `GET /api/getScreenshots`

**Description:** Get ALL screenshots taken by TimeDoctor (no limits).

**Example Request:**
```bash
curl "http://localhost:3000/api/getScreenshots?from=2025-01-01"
```

---

### 8. Get ALL Time Tracking

**Endpoint:** `GET /api/getTimeTracking`

**Description:** Get ALL detailed time tracking data (no limits).

**Example Request:**
```bash
curl http://localhost:3000/api/getTimeTracking
```

---

## How Automatic Pagination Works

The API automatically handles pagination for you:

1. **Requests 1000 records per page** (maximum efficiency)
2. **Automatically fetches next page** if more data exists
3. **Combines all pages** into single response
4. **Returns complete dataset** with `fetched_all: true`

### Example Console Output:
```
👥 Fetching ALL users...
📄 Fetching all data (automatic pagination)...
📄 Fetching page 1...
  ✅ Page 1: Retrieved 1000 records (Total: 1000)
📄 Fetching page 2...
  ✅ Page 2: Retrieved 1000 records (Total: 2000)
📄 Fetching page 3...
  ✅ Page 3: Retrieved 234 records (Total: 2234)
📊 All data retrieved!
✅ Retrieved ALL 2234 users
```

---

## Examples

### JavaScript (Fetch API)

```javascript
// Get ALL users - no need to specify limit!
fetch('http://localhost:3000/api/getUsers')
  .then(response => response.json())
  .then(data => {
    console.log(`Got ALL ${data.count} users!`);
    console.log('Users:', data.data);
  });

// Get ALL work logs for January
fetch('http://localhost:3000/api/getWorkLogs?from=2025-01-01&to=2025-01-31')
  .then(response => response.json())
  .then(data => {
    console.log(`Got ALL ${data.count} work logs!`);
  });
```

### Node.js (Axios)

```javascript
const axios = require('axios');

async function getAllUsers() {
  try {
    const response = await axios.get('http://localhost:3000/api/getUsers');
    console.log(`Retrieved ALL ${response.data.count} users`);
    return response.data;
  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function getAllWorkLogs() {
  try {
    const response = await axios.get('http://localhost:3000/api/getWorkLogs');
    console.log(`Retrieved ALL ${response.data.count} work logs`);
    return response.data;
  } catch (error) {
    console.error('Error:', error.message);
  }
}
```

### Python

```python
import requests

# Get ALL users automatically
response = requests.get('http://localhost:3000/api/getUsers')
users = response.json()
print(f"Retrieved ALL {users['count']} users!")

# Get ALL projects automatically
response = requests.get('http://localhost:3000/api/getProjects')
projects = response.json()
print(f"Retrieved ALL {projects['count']} projects!")
```

---

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Required Settings
TD_EMAIL=your-email@example.com
TD_PASSWORD=your-password
TD_COMPANY_NAME=Your Company Name

# Optional Settings
PORT=3000                    # Server port (default: 3000)
NODE_ENV=production         # Environment (production/development)
TD_TOTP_CODE=123456        # Only if you have 2FA enabled
```

---

## Response Format

All endpoints return a consistent JSON response format:

### Success Response (with ALL data)
```json
{
  "success": true,
  "count": 2234,
  "data": {
    "data": [...],  // ALL records
    "total": 2234,
    "fetched_all": true  // Confirms all data was fetched
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message"
}
```

---

## Features Summary

| Feature | Description |
|---------|-------------|
| **No Limits** | ALL data is fetched automatically |
| **Auto Pagination** | Handles multiple pages seamlessly |
| **Token Auto-Refresh** | Never fails due to expired tokens |
| **Complete Data** | Always returns 100% of available records |
| **Efficient** | Fetches 1000 records per page |
| **Smart Caching** | Tokens cached for performance |

---

## Common Use Cases

### 1. Export ALL Users to CSV

```javascript
fetch('http://localhost:3000/api/getUsers')
  .then(res => res.json())
  .then(data => {
    // data.data.data contains ALL users
    const users = data.data.data;
    console.log(`Exporting ${users.length} users to CSV`);
    // Export logic here
  });
```

### 2. Get Complete Work History

```javascript
fetch('http://localhost:3000/api/getWorkLogs?from=2024-01-01&to=2024-12-31')
  .then(res => res.json())
  .then(data => {
    // Returns ALL work logs for the entire year
    console.log(`Total work logs: ${data.count}`);
  });
```

### 3. Full Data Backup

```javascript
async function backupAllData() {
  const users = await fetch('http://localhost:3000/api/getUsers').then(r => r.json());
  const projects = await fetch('http://localhost:3000/api/getProjects').then(r => r.json());
  const tasks = await fetch('http://localhost:3000/api/getTasks').then(r => r.json());
  
  console.log('Backup complete:');
  console.log(`- ${users.count} users`);
  console.log(`- ${projects.count} projects`);
  console.log(`- ${tasks.count} tasks`);
}
```

---

## Troubleshooting

### Getting Too Much Data?

If you need to limit results, add `keepLimit=true` to preserve your limit:

```bash
# This will respect the limit of 10
curl "http://localhost:3000/api/getUsers?limit=10&keepLimit=true"
```

### Slow Response?

Large datasets take time. The console shows progress:
- Watch for `Fetching page X...` messages
- Each page fetches up to 1000 records
- Be patient for large datasets

---

## Support

**Need Help?**
- Create an issue on [GitHub](https://github.com/iceman-vici/special-task-tdm-api)
- Check [TimeDoctor API Docs](https://timedoctor.redoc.ly)

---

## License

ISC License