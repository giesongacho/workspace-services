# TimeDoctor API Server

A comprehensive REST API server that connects to TimeDoctor and automatically fetches **ALL DATA** without limits using smart pagination. Now includes **COMPLETE API COVERAGE** with all TimeDoctor endpoints!

---

## 🎯 Key Features

### ✨ **Complete TimeDoctor API Coverage**
- **37 Endpoints** - Full coverage of TimeDoctor's API
- **User Management** - Create, read, update, delete users
- **Task Management** - Full CRUD operations for tasks
- **Activity Analytics** - Comprehensive activity tracking
- **File Management** - Complete file operations
- **Time Tracking** - Detailed time tracking data

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

// Create new user invitation
async function inviteUser(email, name, role = 'user') {
  try {
    const response = await axios.post('http://localhost:3000/api/invite', {
      email,
      name,
      role
    });
    console.log('User invited successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error inviting user:', error.message);
  }
}

// Get comprehensive activity data
async function getActivityData(userId, fromDate, toDate) {
  try {
    const [worklog, timeuse, stats] = await Promise.all([
      axios.get(`http://localhost:3000/api/getActivityWorklog?user=${userId}&from=${fromDate}&to=${toDate}`),
      axios.get(`http://localhost:3000/api/getActivityTimeuse?user=${userId}&from=${fromDate}&to=${toDate}`),
      axios.get(`http://localhost:3000/api/timeuseStats?user=${userId}&from=${fromDate}&to=${toDate}`)
    ]);
    
    return {
      worklog: worklog.data,
      timeuse: timeuse.data,
      stats: stats.data
    };
  } catch (error) {
    console.error('Error fetching activity data:', error.message);
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

# Create new task
task_data = {
    'name': 'Python API Task',
    'description': 'Created via Python',
    'project': 'PROJECT_ID'
}
response = requests.post('http://localhost:3000/api/newTask', json=task_data)
task = response.json()
print(f"Task created: {task}")

# Get file data
response = requests.get('http://localhost:3000/api/getFiles')
files = response.json()
print(f"Retrieved {files['count']} files!")

# Get activity analytics
params = {
    'from': '2025-09-01',
    'to': '2025-09-23',
    'user': 'USER_ID'
}
response = requests.get('http://localhost:3000/api/getActivityWorklog', params=params)
worklog = response.json()
print(f"Worklog entries: {worklog['count']}")
```

---

## 🧪 Testing with Postman

A complete Postman testing guide is provided above with all 37 endpoints. Here are the key testing scenarios:

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

### Success Response (single item)
```json
{
  "success": true,
  "data": {
    // Single object data
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
| **User Management** | 6 | Full CRUD + invitations + activity |
| **Task Management** | 4 | Full CRUD operations for tasks |
| **Activity Analytics** | 8 | Comprehensive activity tracking |
| **File Management** | 6 | Complete file operations |
| **Projects & Time** | 4 | Projects, work logs, time tracking |
| **Advanced Features** | 3 | Filtering, summaries, analytics |
| **Total Coverage** | **37** | **Complete TimeDoctor API** |

---

## 🚀 Features Summary

| Feature | Description |
|---------|-------------|
| **Complete API Coverage** | All 37 TimeDoctor endpoints implemented |
| **No Pagination Limits** | ALL data is fetched automatically |
| **Auto Token Refresh** | Never fails due to expired tokens |
| **Smart Error Handling** | Detailed error messages and retry logic |
| **Complete CRUD Operations** | Create, read, update, delete for all entities |
| **Comprehensive Analytics** | Full activity and time tracking data |
| **File Management** | Upload, download, organize files |
| **User Management** | Complete user lifecycle management |
| **Task Management** | Full task operations |
| **Real-time Data** | Always up-to-date information |

---

## 🛠️ Troubleshooting

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

1. **Use Date Ranges**: Specify `from` and `to` dates for better performance
2. **Filter Results**: Use user, project filters to reduce data size
3. **Monitor Console**: Watch server logs for API call details
4. **Cache Results**: Store frequently accessed data locally
5. **Batch Operations**: Use bulk endpoints when available

---

## 🔗 Links

- **GitHub Repository**: [workspace-services](https://github.com/giesongacho/workspace-services)
- **TimeDoctor API Docs**: [timedoctor.redoc.ly](https://timedoctor.redoc.ly)
- **Postman Collection**: Import the testing guide endpoints

---

## 📄 License

ISC License

---

**🎉 You now have COMPLETE TimeDoctor API coverage with 37 endpoints, automatic pagination, token management, and comprehensive testing capabilities!**