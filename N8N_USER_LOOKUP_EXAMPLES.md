# N8N User Lookup Examples

This file contains practical examples for using the **enhanced multi-strategy user lookup system** in your n8n workflows to resolve "Unknown" emails from TimeDoctor monitoring data and **guarantee employee identification**.

## The Problem

When you receive monitoring data from TimeDoctor in n8n, you often get:

```json
{
  "body": {
    "user": {
      "userId": "aLfYIu7-TthUmwrm",
      "email": "Unknown",
      "deviceName": "Computer-TthUmwrm"
    }
  }
}
```

The email is "Unknown" but you have a valid `userId`. **How do you know which employee this is for monitoring?**

## The Enhanced Solution: 5 Automatic Strategies

Our enhanced server **automatically tries 5 different strategies** to identify every employee, so you get this instead:

```json
{
  "name": "John Doe",  // ← Real employee name!
  "realEmail": "john.doe@company.com",
  "user": {
    "userId": "aLfYIu7-TthUmwrm", 
    "realName": "John Doe",
    "lookupMethod": "device_name_extraction",
    "confidenceLevel": "medium",
    "monitoringReliable": true
  },
  "monitoring": {
    "employeeIdentification": {
      "identifiedName": "John Doe",
      "identifiedEmail": "john.doe@company.com",
      "confidenceLevel": "medium"
    }
  }
}
```

---

## Solution 1: Automatic Employee Identification (Recommended)

**No n8n changes needed!** The server automatically includes employee identification.

### Your n8n webhook now receives:
```json
{
  "name": "John Doe",  // ← Always has employee name
  "realEmail": "john.doe@company.com",
  "user": {
    "realName": "John Doe",
    "realEmail": "john.doe@company.com",
    "lookupMethod": "device_name_extraction",
    "confidenceLevel": "medium"
  }
}
```

### Use in n8n workflows:
```javascript
// Access employee name directly
const employeeName = $json.name;  // "John Doe"
const employeeEmail = $json.realEmail;  // "john.doe@company.com"
const confidenceLevel = $json.user.confidenceLevel;  // "medium"

// Send employee-specific notifications
const message = `Employee ${employeeName} has been active for ${activityTime} minutes`;
```

---

## Solution 2: Debug Employee Identification Issues

If you're getting "Name not available" instead of real employee names, use the debug endpoint.

### Step 1: Add Debug HTTP Request Node
- **Method**: `GET`
- **URL**: `http://localhost:3000/api/debug/userLookup/{{$json["body"]["user"]["userId"]}}`

### Step 2: Analyze Debug Results (Code Node)
```javascript
const debug = items[0].json.debug;

console.log('Employee Identification Analysis:');
console.log(`User ID: ${debug.requestedUserId}`);
console.log(`Authentication: ${debug.authenticationStatus.valid ? '✅' : '❌'}`);
console.log(`User Found: ${debug.userFound ? '✅' : '❌'}`);
console.log(`Final Diagnosis: ${debug.diagnosis}`);
console.log(`Employee Name: ${debug.monitoringName}`);
console.log(`Employee Email: ${debug.monitoringEmail}`);

if (debug.recommendations.length > 0) {
  console.log('Fix Recommendations:');
  debug.recommendations.forEach(rec => console.log(`- ${rec}`));
}

return [{
  json: {
    originalUserId: debug.requestedUserId,
    employeeIdentified: debug.userFound,
    employeeName: debug.monitoringName,
    employeeEmail: debug.monitoringEmail,
    needsAttention: debug.recommendations.length > 0,
    recommendations: debug.recommendations
  }
}];
```

---

## Solution 3: Get All Employees Monitoring Status

Check which employees are ready for monitoring and which need profile updates.

### Step 1: Get Employee Status (HTTP Request Node)
- **Method**: `GET`
- **URL**: `http://localhost:3000/api/debug/allUsersWithDetails`

### Step 2: Process Employee Status (Code Node)
```javascript
const employeeData = items[0].json.data;

console.log(`Employee Monitoring Status:`);
console.log(`Total Employees: ${employeeData.totalUsers}`);
console.log(`Ready for Monitoring: ${employeeData.monitoringReadyUsers}`);
console.log(`Need Setup: ${employeeData.totalUsers - employeeData.monitoringReadyUsers}`);

// Separate employees by monitoring readiness
const readyEmployees = employeeData.users.filter(u => u.monitoringReady);
const needsSetupEmployees = employeeData.users.filter(u => !u.monitoringReady);

console.log('\n✅ Ready for Monitoring:');
readyEmployees.forEach(emp => {
  console.log(`- ${emp.displayName} (${emp.userId.substring(0, 8)}...)`);
});

console.log('\n⚠️ Need Profile Updates:');
needsSetupEmployees.forEach(emp => {
  const missing = [];
  if (emp.name === 'NO NAME AVAILABLE') missing.push('name');
  if (emp.email === 'NO EMAIL AVAILABLE') missing.push('email');
  console.log(`- ${emp.userId.substring(0, 8)}... - Missing: ${missing.join(', ')}`);
});

return [{
  json: {
    totalEmployees: employeeData.totalUsers,
    readyEmployees: readyEmployees.length,
    needsSetupEmployees: needsSetupEmployees.length,
    employeeList: readyEmployees,
    setupNeededList: needsSetupEmployees
  }
}];
```

---

## Solution 4: Single User Lookup (HTTP Request Node)

For specific user identification when needed.

### Step 1: Add HTTP Request Node
- **Method**: `GET`
- **URL**: `http://localhost:3000/api/n8n/lookupUser/{{$json["body"]["user"]["userId"]}}`
- **Authentication**: None

### Step 2: Use the Result
The response will be:
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

### Step 3: Set Node to Merge Data
```javascript
// Merge original data with resolved user info
return {
  ...items[0].json, // Original monitoring data
  employeeInfo: {
    name: items[1].json.data.realName,
    email: items[1].json.data.realEmail,
    timezone: items[1].json.data.timezone,
    role: items[1].json.data.role
  }
};
```

---

## Solution 5: Batch Lookup for Multiple Users

### Step 1: Extract User IDs (Code Node)
```javascript
// Extract all userIds from incoming data
const userIds = items.map(item => item.json.body.user.userId);
return [{ json: { userIds: userIds } }];
```

### Step 2: Batch Lookup (HTTP Request Node)
- **Method**: `POST`
- **URL**: `http://localhost:3000/api/n8n/lookupUsers`
- **Headers**: `Content-Type: application/json`
- **Body**: `{{$json}}`

### Step 3: Create User Map (Code Node)
```javascript
// Create a lookup map for fast access
const users = items[0].json.data.users;
const userMap = {};
users.forEach(user => {
  userMap[user.userId] = {
    name: user.realName,
    email: user.realEmail,
    timezone: user.timezone,
    role: user.role
  };
});

return [{ json: { userMap: userMap } }];
```

---

## Complete N8N Workflow Examples

### Workflow 1: Automatic Employee Monitoring (Recommended)

```
Webhook Trigger → Set Node → Database/Email/Slack
     ↓               ↓              ↓
Receives data    Access employee  Send notifications
with automatic   name directly:   with real names:
identification   $json.name       "John Doe active"
```

**Code for Set Node:**
```javascript
const employeeName = $json.name;  // Real name automatically included
const employeeEmail = $json.realEmail;  // Real email automatically included
const confidenceLevel = $json.user.confidenceLevel;  // How reliable the ID is

return [{
  json: {
    ...items[0].json,
    displayMessage: `Employee ${employeeName} active on ${$json.user.deviceName}`,
    reliable: confidenceLevel !== 'very_low',
    employeeIdentified: $json.user.lookupSuccess
  }
}];
```

### Workflow 2: Employee Monitoring with Identification Confidence

```
Webhook Trigger → Switch Node → High Confidence → Slack Notification
                      ↓              ↓                    ↓
                 Check confidence  Send detailed       "John Doe (confident)"
                      ↓          notification
                 Low Confidence → Email Alert → "User needs profile update"
```

**Switch Node Conditions:**
- **High Confidence**: `{{$json.user.confidenceLevel}}` equals `high` or `medium`
- **Low Confidence**: `{{$json.user.confidenceLevel}}` equals `low` or `very_low`

### Workflow 3: Employee Setup Monitoring

```
Schedule Trigger → Get Employee Status → Filter → Email HR
     ↓                    ↓                ↓           ↓
Every Monday        /debug/allUsersWithDetails  Employees   "Update these
   morning                                    needing     employee profiles"
                                             setup
```

### Workflow 4: Debug Failed Identifications

```
Webhook Trigger → Switch Node → Failed ID → Debug Lookup → Email IT
     ↓               ↓             ↓             ↓            ↓
Check if name    Look for      Run debug    Get detailed   Send fix
is "Name not    "Name not     endpoint     analysis       instructions
available"      available"
```

---

## Error Handling

### Handle Different Confidence Levels
```javascript
// In a Code Node after webhook
const confidenceLevel = $json.user.confidenceLevel;
const employeeName = $json.name;

let reliability, action;

switch (confidenceLevel) {
  case 'high':
    reliability = '✅ Highly Reliable';
    action = 'proceed_normal';
    break;
  case 'medium':  
    reliability = '🔶 Medium Reliability';
    action = 'proceed_normal';
    break;
  case 'low':
    reliability = '⚠️ Low Reliability';
    action = 'flag_for_review';
    break;
  case 'very_low':
    reliability = '❌ Very Low Reliability';
    action = 'needs_profile_update';
    break;
  default:
    reliability = '❓ Unknown';
    action = 'investigate';
}

return [{
  json: {
    ...items[0].json,
    employeeName: employeeName,
    reliability: reliability,
    recommendedAction: action,
    needsAttention: ['low', 'very_low'].includes(confidenceLevel)
  }
}];
```

### Handle Failed Lookups
```javascript
// Check if employee identification failed
const lookupSuccess = $json.user.lookupSuccess;
const lookupMethod = $json.user.lookupMethod;

if (!lookupSuccess || lookupMethod === 'final_fallback') {
  return [{
    json: {
      ...items[0].json,
      alert: 'Employee identification failed',
      userId: $json.user.userId,
      action: 'debug_required',
      debugUrl: `http://localhost:3000/api/debug/userLookup/${$json.user.userId}`
    }
  }];
} else {
  return [{
    json: {
      ...items[0].json,
      status: 'employee_identified'
    }
  }];
}
```

---

## Testing Your N8N Workflows

### Test Data for Employee Identification
Use this sample data to test different identification scenarios:

**High Confidence (Direct Lookup):**
```json
{
  "name": "John Doe",
  "realEmail": "john.doe@company.com", 
  "user": {
    "userId": "real-user-id-123",
    "lookupMethod": "direct_lookup",
    "confidenceLevel": "high",
    "lookupSuccess": true
  }
}
```

**Medium Confidence (Device Name Extraction):**
```json
{
  "name": "John",
  "realEmail": "john@company.com",
  "user": {
    "userId": "unknown-id-456",
    "deviceName": "Computer-John",
    "lookupMethod": "device_name_extraction", 
    "confidenceLevel": "medium",
    "lookupSuccess": true
  }
}
```

**Low Confidence (Fallback):**
```json
{
  "name": "User of Computer-xyz",
  "realEmail": "monitoring.user@company.com",
  "user": {
    "userId": "fallback-id-789",
    "lookupMethod": "final_fallback",
    "confidenceLevel": "very_low",
    "lookupSuccess": true
  }
}
```

---

## Performance Tips for N8N

1. **Use Automatic Identification**: Let the server handle identification automatically (no extra n8n nodes needed)
2. **Check Confidence Levels**: Use confidence levels to determine how to handle each employee
3. **Cache Employee Status**: Use the debug endpoints once to understand your employee setup
4. **Monitor Failed IDs**: Set up alerts for very low confidence identifications
5. **Update Employee Profiles**: Fix underlying issues in TimeDoctor for better identification
6. **Use Batch Processing**: For bulk operations, use batch lookup endpoints

---

## Common N8N Patterns

### Pattern 1: Automatic Employee Monitoring
```
Webhook → Access $json.name directly → Send notification with employee name
```

### Pattern 2: Confidence-Based Processing  
```
Webhook → Check $json.user.confidenceLevel → Route based on reliability
```

### Pattern 3: Failed Identification Handling
```
Webhook → Check $json.user.lookupSuccess → Debug failed identifications
```

### Pattern 4: Employee Profile Maintenance
```
Schedule → Get all employee status → Alert HR about missing profiles
```

---

## Troubleshooting

### "Name not available" Still Appearing
If you're still getting generic names instead of real employee names:

1. **Check debug endpoint:**
   ```
   GET /api/debug/userLookup/YOUR_USER_ID
   ```

2. **Common fixes:**
   - Update employee profiles in TimeDoctor dashboard
   - Use consistent device naming (Computer-FirstName)
   - Check TimeDoctor API authentication
   - Verify employee hasn't been archived

### Understanding Confidence Levels
- **High**: Direct TimeDoctor API match - employee name/email from profile
- **Medium**: Extracted from device name pattern (Computer-John → John)
- **Low**: Generic identifier but still meaningful (User of Computer-xyz)
- **Very Low**: Last resort fallback (User aLfYIu7T)

### Device Name Patterns That Work
- ✅ `Computer-John` → "John" (medium confidence)
- ✅ `DESKTOP-JOHNDOE` → "Johndoe" (medium confidence)
- ✅ `PC-MarySmith` → "Marysmith" (medium confidence)
- ❌ `Random123ABC` → "User of Random123ABC" (low confidence)

### Rate Limiting Protection
```javascript
// Add delays between requests for large batches
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
await delay(200); // 200ms delay between requests
```

---

## Monitoring Best Practices

### 1. Set Up Confidence Level Alerts
```javascript
// Alert when employee identification confidence is low
if (['low', 'very_low'].includes($json.user.confidenceLevel)) {
  // Send alert to IT/HR team
  const alertMessage = `Employee ${$json.name} has ${$json.user.confidenceLevel} identification confidence. Please update their TimeDoctor profile.`;
}
```

### 2. Track Identification Success Rates
```javascript
// Track how often employee identification succeeds
const stats = {
  totalIdentifications: items.length,
  highConfidence: items.filter(i => i.json.user.confidenceLevel === 'high').length,
  mediumConfidence: items.filter(i => i.json.user.confidenceLevel === 'medium').length,
  lowConfidence: items.filter(i => i.json.user.confidenceLevel === 'low').length,
  successRate: (items.filter(i => i.json.user.lookupSuccess).length / items.length) * 100
};
```

### 3. Employee Profile Maintenance Workflow
```javascript
// Weekly check for employees needing profile updates
// Schedule: Every Monday at 9 AM
// GET /api/debug/allUsersWithDetails
// Filter employees with monitoringReady: false
// Email HR team with list of employees needing updates
```

---

**🎉 With these enhanced examples, you can now reliably identify every employee in your n8n monitoring workflows with confidence levels and automatic fallbacks!**

**🔥 No more "Unknown" emails - every monitoring event includes meaningful employee identification!**