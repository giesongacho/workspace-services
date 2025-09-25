# TimeDoctor API Server

A comprehensive REST API server that connects to TimeDoctor and automatically fetches **ALL DATA** without limits using smart pagination. Now includes **ENHANCED MULTI-STRATEGY USER LOOKUP** to guarantee employee identification for monitoring!

---

## 🎯 Key Features

### ✨ **ENHANCED Employee Identification for Monitoring**
- **5 Lookup Strategies** - Guarantees user identification for every employee
- **Device Name Extraction** - Extracts names from "Computer-John" patterns  
- **Automatic Fallbacks** - Always provides meaningful identifiers
- **Debug Endpoints** - Troubleshoot identification issues
- **Confidence Levels** - Know how reliable each identification is
- **NO MORE "UNKNOWN" USERS** - Every employee gets identified

### ✨ **Complete TimeDoctor API Coverage**
- **39 Endpoints** - Full coverage of TimeDoctor's API
- **User Management** - Create, read, update, delete users
- **Task Management** - Full CRUD operations for tasks
- **Activity Analytics** - Comprehensive activity tracking
- **File Management** - Complete file operations
- **Time Tracking** - Detailed time tracking data

### 🔍 **N8N User Lookup System**
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

### Step 4: Test Employee Identification

```bash
# Test the enhanced health endpoint
curl http://localhost:3000/api/health

# Debug user identification for a specific user
curl http://localhost:3000/api/debug/userLookup/aLfYIu7-TthUmwrm

# Get all users with monitoring readiness
curl http://localhost:3000/api/debug/allUsersWithDetails
```

---

# 📚 Complete API Documentation

## Base URL
```
http://localhost:3000/api
```

---

## 🎯 **NEW: Enhanced Employee Identification**

### The Problem: Employee Monitoring Without Identification
When monitoring employees, you often get data like:
```json
{
  "userId": "aLfYIu7-TthUmwrm",
  "email": "Unknown",
  "deviceName": "Computer-TthUmwrm"
}
```
**How do you know which employee this is?**

### The Solution: 5 Automatic Lookup Strategies

Our enhanced server **automatically tries 5 different strategies** to identify every employee:

#### **Strategy 1: Direct TimeDoctor API Lookup** (Highest Accuracy)
- Directly queries TimeDoctor API for user details
- **Result**: "John Doe" <john.doe@company.com>
- **Confidence**: High

#### **Strategy 2: User List Search** (Backup Method)
- Searches through all company users for matching ID
- **Result**: Found in user directory
- **Confidence**: High

#### **Strategy 3: Device Name Extraction** (Smart Pattern Recognition)
- Extracts names from device patterns:
  - `Computer-John` → "John"
  - `DESKTOP-JOHNDOE` → "Johndoe"  
  - `PC-MarySmith` → "Marysmith"
- **Result**: "John" <john@company.com>
- **Confidence**: Medium

#### **Strategy 4: Device Name Fallback** (Descriptive Identifier)
- Uses full device name as identifier
- **Result**: "User of Computer-TthUmwrm"
- **Confidence**: Low

#### **Strategy 5: UserId Fallback** (Always Works)
- Creates identifier from userId
- **Result**: "User aLfYIu7T"
- **Confidence**: Very Low

### **Guaranteed Result**
```json
{
  "name": "John Doe",  // Always has a meaningful value!
  "realEmail": "john.doe@company.com",
  "user": {
    "lookupMethod": "device_name_extraction",
    "confidenceLevel": "medium",
    "monitoringReliable": true
  }
}
```

---

## 🔧 **Debug Endpoints for Employee Identification**

### Debug User Lookup Issues
- **GET** `/api/debug/userLookup/:userId` - Diagnose identification problems

**Example:**
```bash
curl http://localhost:3000/api/debug/userLookup/aLfYIu7-TthUmwrm
```

**Response shows:**
- ✅ Authentication status
- ✅ All users in TimeDoctor account  
- ✅ Whether the userId exists
- ✅ What lookup strategies worked/failed
- ✅ Final diagnosis and recommendations

### Get All Employees with Monitoring Readiness
- **GET** `/api/debug/allUsersWithDetails` - Shows all employees and their monitoring status

**Example:**
```bash
curl http://localhost:3000/api/debug/allUsersWithDetails
```

**Response shows:**
```json
{
  "data": {
    "totalUsers": 15,
    "usersWithNames": 12,
    "usersWithEmails": 14,
    "monitoringReadyUsers": 11,
    "users": [
      {
        "userId": "abc123",
        "name": "John Doe",
        "email": "john.doe@company.com",
        "monitoringReady": true,
        "displayName": "John Doe"
      }
    ]
  }
}
```

---

## 🔍 **N8N User Lookup Endpoints**

### Resolve "Unknown" Emails from N8N Data

When n8n receives monitoring data with `"email": "Unknown"` but a valid `userId`, use these endpoints:

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
- **GET** `/api/health` - Server health status with enhanced capabilities
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

### Employee Monitoring Examples

#### Automatic Employee Identification
```javascript
// Your monitoring data automatically includes employee identification
const monitoringData = {
  "name": "John Doe",  // ← Real employee name (automatically resolved!)
  "realEmail": "john.doe@company.com",
  "user": {
    "userId": "aLfYIu7-TthUmwrm",
    "deviceName": "Computer-TthUmwrm", 
    "realName": "John Doe",
    "lookupMethod": "device_name_extraction",
    "confidenceLevel": "medium"
  },
  "timeUsage": [
    {
      "title": "Google Sheets - Project Report",
      "time": 3600,
      "category": "productive"
    }
  ]
};

console.log(`${monitoringData.name} spent ${monitoringData.timeUsage[0].time/60} minutes on ${monitoringData.timeUsage[0].title}`);
// Output: "John Doe spent 60 minutes on Google Sheets - Project Report"
```

#### Debug Employee Identification Issues
```javascript
// If you're getting "Name not available" for a user, debug it:
const debugUserId = "aLfYIu7-TthUmwrm";
const debugResponse = await fetch(`http://localhost:3000/api/debug/userLookup/${debugUserId}`);
const debug = await debugResponse.json();

console.log('Debug Steps:');
debug.debug.debugSteps.forEach(step => console.log(step));

console.log('Final Diagnosis:', debug.debug.diagnosis);
console.log('Monitoring Name:', debug.debug.monitoringName);
console.log('Monitoring Email:', debug.debug.monitoringEmail);

// Shows exactly why identification failed and how to fix it
```

#### Get All Employees with Monitoring Status
```javascript
// See which employees are ready for monitoring
const allUsers = await fetch('http://localhost:3000/api/debug/allUsersWithDetails');
const userData = await allUsers.json();

console.log(`Found ${userData.data.totalUsers} employees:`);
console.log(`- ${userData.data.monitoringReadyUsers} ready for monitoring`);
console.log(`- ${userData.data.usersWithNames} have names in TimeDoctor`);
console.log(`- ${userData.data.usersWithEmails} have emails in TimeDoctor`);

// List employees not ready for monitoring
const notReady = userData.data.users.filter(u => !u.monitoringReady);
console.log('Employees needing profile updates:', notReady.map(u => u.userId));
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

// Debug user identification
fetch('http://localhost:3000/api/debug/userLookup/aLfYIu7-TthUmwrm')
  .then(response => response.json())
  .then(debug => {
    console.log('Employee Identification Debug:');
    console.log('- Final Diagnosis:', debug.debug.diagnosis);
    console.log('- Monitoring Name:', debug.debug.monitoringName);
    console.log('- Confidence Level:', debug.debug.confidenceLevel);
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

// Debug employee identification
async function debugEmployeeIdentification(userId) {
  try {
    const response = await axios.get(`http://localhost:3000/api/debug/userLookup/${userId}`);
    const debug = response.data.debug;
    
    console.log('Employee Identification Analysis:');
    console.log(`User ID: ${debug.requestedUserId}`);
    console.log(`Authentication: ${debug.authenticationStatus.valid ? '✅ Valid' : '❌ Failed'}`);
    console.log(`Total Users in System: ${debug.allUsers.count}`);
    console.log(`User Found: ${debug.userFound ? '✅ Yes' : '❌ No'}`);
    console.log(`Final Diagnosis: ${debug.diagnosis}`);
    console.log(`Monitoring Name: ${debug.monitoringName}`);
    
    if (debug.recommendations.length > 0) {
      console.log('Recommendations:');
      debug.recommendations.forEach(rec => console.log(`- ${rec}`));
    }
    
    return debug;
  } catch (error) {
    console.error('Debug failed:', error.message);
  }
}

// Usage
debugEmployeeIdentification("aLfYIu7-TthUmwrm");
```

### Python

```python
import requests

# Debug employee identification
def debug_employee_identification(user_id):
    response = requests.get(f'http://localhost:3000/api/debug/userLookup/{user_id}')
    if response.ok:
        debug = response.json()['debug']
        
        print("Employee Identification Analysis:")
        print(f"User ID: {debug['requestedUserId']}")
        print(f"Authentication: {'✅ Valid' if debug['authenticationStatus']['valid'] else '❌ Failed'}")
        print(f"Total Users in System: {debug['allUsers']['count']}")
        print(f"User Found: {'✅ Yes' if debug['userFound'] else '❌ No'}")
        print(f"Final Diagnosis: {debug['diagnosis']}")
        print(f"Monitoring Name: {debug['monitoringName']}")
        
        if debug['recommendations']:
            print("Recommendations:")
            for rec in debug['recommendations']:
                print(f"- {rec}")
                
        return debug
    else:
        print(f"Debug failed: {response.json()['error']}")
        return None

# Get all employees with monitoring status
def get_employee_monitoring_status():
    response = requests.get('http://localhost:3000/api/debug/allUsersWithDetails')
    if response.ok:
        data = response.json()['data']
        
        print(f"Employee Monitoring Status:")
        print(f"Total Employees: {data['totalUsers']}")
        print(f"Ready for Monitoring: {data['monitoringReadyUsers']}")
        print(f"With Names: {data['usersWithNames']}")
        print(f"With Emails: {data['usersWithEmails']}")
        
        print("\nEmployee Details:")
        for user in data['users'][:5]:  # Show first 5 users
            status = "✅ Ready" if user['monitoringReady'] else "⚠️ Needs Setup"
            print(f"- {user['displayName']} ({user['userId'][:8]}...) - {status}")
            
        return data
    else:
        print(f"Error: {response.json()['error']}")
        return None

# Usage
debug_employee_identification("aLfYIu7-TthUmwrm")
get_employee_monitoring_status()
```

---

## 🧪 Testing with Postman

### Employee Identification Testing

1. **Debug User Identification:**
   - Method: `GET`
   - URL: `http://localhost:3000/api/debug/userLookup/aLfYIu7-TthUmwrm`
   - Expected: Complete diagnosis of identification process

2. **Get All Employees Status:**
   - Method: `GET`
   - URL: `http://localhost:3000/api/debug/allUsersWithDetails`
   - Expected: List of all employees with monitoring readiness

3. **Health Check with Capabilities:**
   - Method: `GET`
   - URL: `http://localhost:3000/api/health`
   - Expected: Server status with enhanced user lookup capabilities

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

### Success Response (with enhanced user data)
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

### Enhanced Employee Monitoring Response
```json
{
  "name": "John Doe",  // Real employee name
  "realEmail": "john.doe@company.com",
  "user": {
    "userId": "aLfYIu7-TthUmwrm",
    "realName": "John Doe",
    "realEmail": "john.doe@company.com",
    "lookupMethod": "device_name_extraction",
    "confidenceLevel": "medium",
    "lookupSuccess": true
  },
  "monitoring": {
    "employeeIdentification": {
      "identifiedName": "John Doe",
      "identifiedEmail": "john.doe@company.com", 
      "identificationMethod": "device_name_extraction",
      "confidenceLevel": "medium",
      "monitoringReliable": true
    }
  }
}
```

### Debug Response
```json
{
  "success": true,
  "debug": {
    "diagnosis": "SUCCESS: User can be identified for monitoring",
    "monitoringName": "John Doe",
    "monitoringEmail": "john.doe@company.com",
    "authenticationStatus": { "valid": true },
    "userFound": true,
    "recommendations": []
  }
}
```

---

## 🎯 API Coverage Summary

| Category | Endpoints | Description |
|----------|-----------|-------------|
| **Authentication** | 4 | Health, auth status, token management |
| **Employee Identification** | 2 | Debug user lookup, employee monitoring status |
| **N8N User Lookup** | 4 | Resolve "Unknown" emails, batch lookup, enrichment |
| **User Management** | 6 | Full CRUD + invitations + activity |
| **Task Management** | 4 | Full CRUD operations for tasks |
| **Activity Analytics** | 8 | Comprehensive activity tracking |
| **File Management** | 6 | Complete file operations |
| **Projects & Time** | 4 | Projects, work logs, time tracking |
| **Advanced Features** | 3 | Filtering, summaries, analytics |
| **Total Coverage** | **41** | **Complete TimeDoctor API + Enhanced User Identification** |

---

## 🚀 Enhanced Features Summary

| Feature | Description |
|---------|-------------|
| **5-Strategy User Lookup** | Guarantees employee identification using multiple methods |
| **Device Name Extraction** | Extracts employee names from computer names |
| **Automatic Fallbacks** | Always provides meaningful identifiers |
| **Debug Endpoints** | Troubleshoot identification issues |
| **Confidence Levels** | Know how reliable each identification is |
| **Complete API Coverage** | All 37 TimeDoctor endpoints + enhanced features |
| **No Pagination Limits** | ALL data is fetched automatically |
| **Auto Token Refresh** | Never fails due to expired tokens |
| **Smart Error Handling** | Detailed error messages and retry logic |
| **Employee Monitoring Ready** | Perfect for tracking employee productivity |

---

## 🛠️ Troubleshooting

### Employee Identification Issues

**Getting "Name not available" for employees:**

1. **Run Debug Diagnosis:**
   ```bash
   curl http://localhost:3000/api/debug/userLookup/aLfYIu7-TthUmwrm
   ```

2. **Check All Employees Status:**
   ```bash
   curl http://localhost:3000/api/debug/allUsersWithDetails
   ```

3. **Common Solutions:**
   - **No TimeDoctor API access**: Check `.env` credentials
   - **User doesn't exist**: Verify userId from debug output
   - **Missing name/email**: Update employee profile in TimeDoctor dashboard
   - **Wrong device pattern**: Check device naming conventions

**Device Name Pattern Recognition:**
- ✅ `Computer-John` → "John"
- ✅ `DESKTOP-JOHNDOE` → "Johndoe"
- ✅ `PC-MarySmith` → "Marysmith" 
- ❌ `Random123ABC` → Falls back to "User of Random123ABC"

### Common Issues

**Getting "User not found" errors:**
- Verify the userId exists in TimeDoctor using `/api/debug/allUsersWithDetails`
- Check if user has been deleted or archived
- Ensure API has permission to access user data

**Getting low confidence levels:**
- Add proper names to employee profiles in TimeDoctor
- Use consistent device naming patterns (Computer-FirstName)
- Update employee emails in TimeDoctor dashboard

**Slow Response?**
Large datasets take time. The console shows progress:
- Watch for `Strategy X: ...` messages in server logs
- Each strategy tries different identification methods
- Be patient for large employee lists

**Authentication Issues?**
- Verify `.env` credentials are correct
- Check TimeDoctor account has API access
- Use `/api/auth/status` to check token status
- Use `/api/debug/userLookup/USER_ID` to test auth

---

## 📈 Performance Tips

1. **Use Enhanced Auto-Identification**: Server automatically identifies employees with 5 fallback strategies
2. **Check Confidence Levels**: Higher confidence = more reliable identification
3. **Update Employee Profiles**: Add names/emails in TimeDoctor for best results
4. **Use Consistent Device Names**: Follow "Computer-Name" pattern for automatic extraction
5. **Monitor Debug Endpoints**: Use debug tools to optimize identification success
6. **Cache Results**: Store frequently accessed employee data locally

---

## 🔗 Links

- **GitHub Repository**: [workspace-services](https://github.com/giesongacho/workspace-services)
- **TimeDoctor API Docs**: [timedoctor.redoc.ly](https://timedoctor.redoc.ly)
- **Postman Collection**: Import the testing guide endpoints

---

## 📄 License

ISC License

---

**🎉 You now have GUARANTEED employee identification with 41 endpoints, including multi-strategy user lookup, automatic fallbacks, debug tools, and comprehensive employee monitoring capabilities!**

**🔥 Perfect for reliable employee monitoring with automatic employee identification!**