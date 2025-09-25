# TimeDoctor API Server

A comprehensive REST API server that connects to TimeDoctor and automatically fetches **ALL DATA** without limits using smart pagination. Now includes **COMPLETE API COVERAGE** with all TimeDoctor endpoints + **N8N USER LOOKUP** for resolving "Unknown" emails!

---

## 🎯 Key Features

### ✨ **Complete TimeDoctor API Coverage**
- **37 Endpoints** - Full coverage of TimeDoctor's API
- **User Management** - Create, read, update, delete users
- **Task Management** - Full CRUD operations for tasks
- **Activity Analytics** - Comprehensive activity tracking
- **File Management** - Complete file operations
- **Time Tracking** - Detailed time tracking data

### 🔍 **NEW: N8N User Lookup System**
- **Resolve "Unknown" Emails** - Get real names and emails from userIds
- **Single User Lookup** - `/api/n8n/lookupUser/:userId`
- **Batch User Lookup** - `/api/n8n/lookupUsers` for multiple users
- **Data Enrichment** - Transform monitoring data with real user info
- **User Mapping** - Complete userId → userInfo lookup table

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

## Quick Start

### Step 1: Install the Project

```bash
git clone https://github.com/giesongacho/workspace-services.git
cd workspace-services
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

# 📚 Complete API Documentation

## Base URL
```
http://localhost:3000/api
```

---

## 🔍 **NEW: N8N User Lookup Endpoints**

### Resolve "Unknown" Emails from N8N Data

When n8n receives monitoring data with `"email": "Unknown"` but a valid `userId`, use these endpoints to get the real user information:

#### Single User Lookup
- **GET** `/api/n8n/lookupUser/:userId` - Get real name and email for one user
  
**Example:**
```bash
curl http://localhost:3000/api/n8n/lookupUser/aLfYIu7-TthUmwrm
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "aLfYIu7-TthUmwrm",
    "realName": "John Doe",
    "realEmail": "john.doe@company.com",
    "timezone": "America/New_York",
    "role": "user",
    "status": "active"
  }
}
```

#### Batch User Lookup
- **POST** `/api/n8n/lookupUsers` - Lookup multiple users at once

**Example:**
```bash
curl -X POST http://localhost:3000/api/n8n/lookupUsers \
  -H "Content-Type: application/json" \
  -d '{"userIds": ["aLfYIu7-TthUmwrm", "another-user-id"]}'
```

#### Enrich Monitoring Data
- **POST** `/api/n8n/enrichMonitoringData` - Transform n8n data with real user info

**Example:**
```javascript
const monitoringData = {
  body: {
    user: {
      userId: "aLfYIu7-TthUmwrm",
      email: "Unknown",
      deviceName: "Computer-TthUmwrm"
    }
  }
};

const response = await fetch('/api/n8n/enrichMonitoringData', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(monitoringData)
});

// Returns same structure but with:
// realEmail: "john.doe@company.com"
// realName: "John Doe"
```

#### User Mapping for N8N Caching
- **GET** `/api/n8n/userMap` - Get complete userId → userInfo mapping

**Example:**
```javascript
// Cache this in n8n for fast lookups
const userMap = await fetch('/api/n8n/userMap').then(r => r.json());

// Then use: userMap.data.userMap[userId] to get user details instantly
const user = userMap.data.userMap["aLfYIu7-TthUmwrm"];
console.log(`${user.name} <${user.email}>`); // John Doe <john.doe@company.com>
```

---

## 🔐 Authentication & Health Endpoints

### Health Check
- **GET** `/api/health` - Server health status
- **GET** `/api/auth/status` - Authentication status and token info
- **POST** `/api/auth/refresh` - Force token refresh
- **DELETE** `/api/auth/cache` - Clear token cache

---

## 👥 User Management Endpoints

### Get Users
- **GET** `/api/getUsers` - Get ALL users (auto-paginated)
  - Query: `limit`, `detail`, `task-project-names`, `include-archived-users`
- **GET** `/api/getManagedUsers` - Get users you can manage
  - Query: `limit`, `page`

### Individual User Operations
- **GET** `/api/getUser/:userId` - Get specific user details
- **PUT** `/api/putUser/:userId` - Update user information
- **DELETE** `/api/deleteUser/:userId` - Delete user
- **POST** `/api/invite` - Invite new user to company

### User Activity
- **GET** `/api/getUserActivity/:userId` - Get user activity stats
  - Query: `from`, `to` (date range)

---

## 📋 Task Management Endpoints

### Task Operations
- **GET** `/api/getTasks` - Get ALL tasks (auto-paginated)
- **GET** `/api/tasks` - Alternative tasks endpoint
  - Query: `limit`, `project`, `assignee`
- **POST** `/api/newTask` - Create new task
- **GET** `/api/task/:taskId` - Get specific task details

---

## 📊 Activity & Analytics Endpoints

### Activity Data
- **GET** `/api/getActivityWorklog` - Get activity work logs
- **GET** `/api/getActivityTimeuse` - Get time usage data
- **GET** `/api/timeuseStats` - Get time usage statistics
- **GET** `/api/getDisconnectivity` - Get disconnection data
- **GET** `/api/stats1_total` - Get total statistics

### Activity Time Editing
- **GET** `/api/getActivityEditTime` - Get edit time records
- **POST** `/api/postActivityEditTime` - Create edit time entry
- **PUT** `/api/putBulkEditTime` - Bulk update edit times
- **PUT** `/api/putActivityEditTime/:id` - Update specific edit time

---

## 📁 File Management Endpoints

### File Operations
- **GET** `/api/getFiles` - Get ALL files
- **DELETE** `/api/deleteFiles` - Delete multiple files
- **GET** `/api/getTypeFiles/:fileType` - Get files by type
- **GET** `/api/getSignedUrl` - Get signed URL for upload
- **PUT** `/api/putFile/:fileId` - Upload/update file
- **DELETE** `/api/deleteFile/:fileId` - Delete specific file

---

## 📁 Project & Time Tracking Endpoints

### Projects & Work Data
- **GET** `/api/getProjects` - Get ALL projects
- **GET** `/api/getWorkLogs` - Get work logs
  - Query: `from`, `to`, `user`, `project`
- **GET** `/api/getTimeTracking` - Get detailed time tracking
- **GET** `/api/getScreenshots` - Get screenshots
  - Query: `from`, `to`, `user`

---

## 🔍 Advanced Endpoints

### Advanced Operations
- **POST** `/api/users/filter` - Advanced user filtering
- **GET** `/api/summary/daily` - Daily work summary
  - Query: `date`, `user`
- **GET** `/api/summary/weekly` - Weekly work summary
  - Query: `from`, `to`, `user`

---

## 📖 Usage Examples

### N8N User Lookup Examples

#### Resolve Single "Unknown" Email
```javascript
// When n8n receives userId but "Unknown" email
const userId = "aLfYIu7-TthUmwrm";
const response = await fetch(`http://localhost:3000/api/n8n/lookupUser/${userId}`);
const userData = await response.json();

console.log(`Real name: ${userData.data.realName}`);
console.log(`Real email: ${userData.data.realEmail}`);
// Output: Real name: John Doe
//         Real email: john.doe@company.com
```

#### Batch Lookup for Multiple Users
```javascript
const userIds = ["aLfYIu7-TthUmwrm", "bNgZKw8-UuiVnxsn"];
const response = await fetch('http://localhost:3000/api/n8n/lookupUsers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userIds })
});

const result = await response.json();
result.data.users.forEach(user => {
  console.log(`${user.userId} = ${user.realName} <${user.realEmail}>`);
});
```

#### Cache User Map in N8N
```javascript
// Step 1: Get and cache the user map
const userMapResponse = await fetch('http://localhost:3000/api/n8n/userMap');
const userMapData = await userMapResponse.json();
const userMap = userMapData.data.userMap;

// Step 2: Use cached map for instant lookups
function getUserInfo(userId) {
  const user = userMap[userId];
  return user ? {
    name: user.name,
    email: user.email,
    timezone: user.timezone
  } : null;
}

// Step 3: Fast lookups without API calls
const user = getUserInfo("aLfYIu7-TthUmwrm");
console.log(`${user.name} <${user.email}>`); // Instant response!
```

### JavaScript (Fetch API)

```javascript
// Get ALL users - no need to specify limit!
fetch('http://localhost:3000/api/getUsers')
  .then(response => response.json())
  .then(data => {
    console.log(`Got ALL ${data.count} users!`);
    console.log('Users:', data.data);
  });

// Create a new task
fetch('http://localhost:3000/api/newTask', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'New Project Task',
    description: 'Task description',
    project: 'PROJECT_ID'
  })
})
.then(response => response.json())
.then(data => console.log('Task created:', data));

// Get activity worklog
fetch('http://localhost:3000/api/getActivityWorklog?from=2025-01-01&to=2025-01-31')
  .then(response => response.json())
  .then(data => {
    console.log(`Got ${data.count} worklog entries`);
  });
```

### Node.js (Axios)

```javascript
const axios = require('axios');

async function getAllData() {
  try {
    // Get users, projects, and tasks in parallel
    const [users, projects, tasks] = await Promise.all([
      axios.get('http://localhost:3000/api/getUsers'),
      axios.get('http://localhost:3000/api/getProjects'),
      axios.get('http://localhost:3000/api/getTasks')
    ]);
    
    console.log(`Retrieved:`);
    console.log(`- ${users.data.count} users`);
    console.log(`- ${projects.data.count} projects`);
    console.log(`- ${tasks.data.count} tasks`);
    
    return { users: users.data, projects: projects.data, tasks: tasks.data };
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Resolve "Unknown" emails from n8n data
async function resolveUnknownEmails(userIds) {
  try {
    const response = await axios.post('http://localhost:3000/api/n8n/lookupUsers', {
      userIds: userIds
    });
    
    console.log('Resolved users:');
    response.data.data.users.forEach(user => {
      console.log(`${user.userId}: ${user.realName} <${user.realEmail}>`);
    });
    
    return response.data.data.users;
  } catch (error) {
    console.error('Error resolving users:', error.message);
  }
}

// Usage
resolveUnknownEmails(["aLfYIu7-TthUmwrm", "bNgZKw8-UuiVnxsn"]);
```

### Python

```python
import requests

# Resolve "Unknown" email to real user data
def lookup_user(user_id):
    response = requests.get(f'http://localhost:3000/api/n8n/lookupUser/{user_id}')
    if response.ok:
        user = response.json()['data']
        print(f"User ID: {user['userId']}")
        print(f"Real Name: {user['realName']}")
        print(f"Real Email: {user['realEmail']}")
        return user
    else:
        print(f"Error: {response.json()['error']}")
        return None

# Batch lookup multiple users
def batch_lookup_users(user_ids):
    response = requests.post('http://localhost:3000/api/n8n/lookupUsers', 
                           json={'userIds': user_ids})
    if response.ok:
        users = response.json()['data']['users']
        for user in users:
            print(f"{user['userId']} = {user['realName']} <{user['realEmail']}>")
        return users
    else:
        print(f"Error: {response.json()['error']}")
        return []

# Get ALL users automatically
response = requests.get('http://localhost:3000/api/getUsers')
users = response.json()
print(f"Retrieved ALL {users['count']} users!")

# Example usage
lookup_user("aLfYIu7-TthUmwrm")
batch_lookup_users(["aLfYIu7-TthUmwrm", "bNgZKw8-UuiVnxsn"])
```

---

## 🧪 Testing with Postman

### N8N User Lookup Testing

1. **Single User Lookup Test:**
   - Method: `GET`
   - URL: `http://localhost:3000/api/n8n/lookupUser/aLfYIu7-TthUmwrm`
   - Expected: Real name and email for the user

2. **Batch Lookup Test:**
   - Method: `POST`
   - URL: `http://localhost:3000/api/n8n/lookupUsers`
   - Body: `{"userIds": ["aLfYIu7-TthUmwrm", "another-user-id"]}`
   - Expected: Array of resolved users

3. **User Map Caching Test:**
   - Method: `GET`
   - URL: `http://localhost:3000/api/n8n/userMap`
   - Expected: Complete userId → userInfo mapping

### Basic Flow Testing
1. **Health Check** → **Auth Status** → **Get Users**
2. **Get Projects** → **Get Tasks** → **Create New Task**
3. **Get Activity Data** → **Get Time Tracking** → **Get Stats**
4. **File Operations** → **Upload** → **Download** → **Delete**

### Advanced Testing
- **User Management**: Create, update, delete users
- **Activity Analytics**: Compare different activity endpoints
- **File Management**: Full file lifecycle testing
- **Time Tracking**: Comprehensive time data analysis
- **N8N Integration**: Test all user lookup scenarios

---

## 🔧 Configuration

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

## 📊 Response Format

All endpoints return a consistent JSON response format:

### Success Response (with data)
```json
{
  "success": true,
  "count": 2234,  // For list endpoints
  "data": {
    "data": [...],  // ALL records (auto-paginated)
    "total": 2234,
    "fetched_all": true  // Confirms all data was fetched
  }
}
```

### N8N User Lookup Response
```json
{
  "success": true,
  "data": {
    "userId": "aLfYIu7-TthUmwrm",
    "realName": "John Doe",
    "realEmail": "john.doe@company.com",
    "timezone": "America/New_York",
    "role": "user",
    "status": "active"
  },
  "n8nIntegration": {
    "usage": "Use realName and realEmail in your n8n workflow"
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

## 🎯 API Coverage Summary

| Category | Endpoints | Description |
|----------|-----------|-------------|
| **Authentication** | 4 | Health, auth status, token management |
| **N8N User Lookup** | 4 | Resolve "Unknown" emails, batch lookup, enrichment |
| **User Management** | 6 | Full CRUD + invitations + activity |
| **Task Management** | 4 | Full CRUD operations for tasks |
| **Activity Analytics** | 8 | Comprehensive activity tracking |
| **File Management** | 6 | Complete file operations |
| **Projects & Time** | 4 | Projects, work logs, time tracking |
| **Advanced Features** | 3 | Filtering, summaries, analytics |
| **Total Coverage** | **39** | **Complete TimeDoctor API + N8N Integration** |

---

## 🚀 Features Summary

| Feature | Description |
|---------|-------------|
| **Complete API Coverage** | All 37 TimeDoctor endpoints + 4 N8N lookup endpoints |
| **N8N User Lookup** | Resolve "Unknown" emails to real user data |
| **Batch Processing** | Lookup multiple users at once |
| **Data Enrichment** | Transform monitoring data with real names/emails |
| **User Mapping** | Complete userId → userInfo lookup table for caching |
| **No Pagination Limits** | ALL data is fetched automatically |
| **Auto Token Refresh** | Never fails due to expired tokens |
| **Smart Error Handling** | Detailed error messages and retry logic |
| **Complete CRUD Operations** | Create, read, update, delete for all entities |
| **Comprehensive Analytics** | Full activity and time tracking data |
| **File Management** | Upload, download, organize files |
| **Real-time Data** | Always up-to-date information |

---

## 🛠️ Troubleshooting

### N8N User Lookup Issues

**"User not found" errors:**
- Verify the userId exists in TimeDoctor
- Check if user has been deleted or archived
- Ensure API has permission to access user data

**Getting "Unknown" emails in n8n:**
```javascript
// Instead of using the "Unknown" email directly:
const monitoringData = {
  user: {
    userId: "aLfYIu7-TthUmwrm",
    email: "Unknown"  // Don't use this!
  }
};

// Use the lookup endpoint to get real data:
const realUser = await fetch(`/api/n8n/lookupUser/${monitoringData.user.userId}`);
const userData = await realUser.json();
console.log(userData.data.realEmail); // "john.doe@company.com"
```

### Common Issues

**Getting Too Much Data?**
If you need to limit results, add `keepLimit=true` to preserve your limit:
```bash
curl "http://localhost:3000/api/getUsers?limit=10&keepLimit=true"
```

**Slow Response?**
Large datasets take time. The console shows progress:
- Watch for `Fetching page X...` messages
- Each page fetches up to 1000 records
- Be patient for large datasets

**Authentication Issues?**
- Verify `.env` credentials are correct
- Check TimeDoctor account has API access
- Use `/api/auth/status` to check token status
- Use `/api/auth/refresh` to force token refresh

---

## 📈 Performance Tips

1. **Use N8N User Map**: Cache the user map in n8n for instant lookups
2. **Batch Lookups**: Use batch lookup endpoint for multiple users
3. **Use Date Ranges**: Specify `from` and `to` dates for better performance
4. **Filter Results**: Use user, project filters to reduce data size
5. **Monitor Console**: Watch server logs for API call details
6. **Cache Results**: Store frequently accessed data locally

---

## 🔗 Links

- **GitHub Repository**: [workspace-services](https://github.com/giesongacho/workspace-services)
- **TimeDoctor API Docs**: [timedoctor.redoc.ly](https://timedoctor.redoc.ly)
- **Postman Collection**: Import the testing guide endpoints

---

## 📄 License

ISC License

---

**🎉 You now have COMPLETE TimeDoctor API coverage with 39 endpoints, including N8N user lookup to resolve "Unknown" emails, automatic pagination, token management, and comprehensive testing capabilities!**

**🔥 Perfect for N8N workflows that need to resolve user identities from monitoring data!**