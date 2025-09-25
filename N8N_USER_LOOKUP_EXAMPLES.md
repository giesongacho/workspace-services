# N8N User Lookup Examples

This file contains practical examples for using the new user lookup endpoints in your n8n workflows to resolve "Unknown" emails from TimeDoctor monitoring data.

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

The email is "Unknown" but you have a valid `userId`. These endpoints solve this problem!

---

## Solution 1: Single User Lookup (HTTP Request Node)

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
  resolvedUser: {
    name: items[1].json.data.realName,
    email: items[1].json.data.realEmail,
    timezone: items[1].json.data.timezone
  }
};
```

---

## Solution 2: Batch Lookup for Multiple Users

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
    timezone: user.timezone
  };
});

return [{ json: { userMap: userMap } }];
```

---

## Solution 3: Data Enrichment (Transform Monitoring Data)

### Step 1: Enrich Data (HTTP Request Node)
- **Method**: `POST`
- **URL**: `http://localhost:3000/api/n8n/enrichMonitoringData`
- **Headers**: `Content-Type: application/json`
- **Body**: `{{$json}}`

### Step 2: Use Enriched Data
The original monitoring data is returned with additional fields:
```json
{
  "body": {
    "user": {
      "userId": "aLfYIu7-TthUmwrm",
      "email": "Unknown",
      "deviceName": "Computer-TthUmwrm",
      "realEmail": "john.doe@company.com",
      "realName": "John Doe",
      "timezone": "America/New_York"
    }
  },
  "enrichmentInfo": {
    "enrichedAt": "2025-09-25T06:15:00Z",
    "userFound": true
  }
}
```

---

## Solution 4: Cached User Map (Best Performance)

### Step 1: Get User Map Once (HTTP Request Node)
- **Method**: `GET`
- **URL**: `http://localhost:3000/api/n8n/userMap`

### Step 2: Store in n8n Memory/Variable
Set a workflow variable with the user map for reuse.

### Step 3: Fast Lookups (Code Node)
```javascript
// Use cached user map (stored in workflow variable)
const userMap = $vars.userMap; // Your cached user map
const userId = items[0].json.body.user.userId;

const user = userMap[userId];
if (user) {
  return [{
    json: {
      ...items[0].json,
      resolvedUser: {
        name: user.name,
        email: user.email,
        timezone: user.timezone
      }
    }
  }];
} else {
  return [{
    json: {
      ...items[0].json,
      resolvedUser: {
        name: 'User not found',
        email: 'unknown@company.com',
        timezone: 'Unknown'
      }
    }
  }];
}
```

---

## Complete N8N Workflow Examples

### Workflow 1: Simple Email Resolution

1. **Webhook Trigger** → Receives monitoring data
2. **HTTP Request** → `/api/n8n/lookupUser/{{$json["body"]["user"]["userId"]}}`
3. **Set Node** → Merge original data with resolved email
4. **Send Email** → Use the real email address

### Workflow 2: Batch Processing with Database

1. **Schedule Trigger** → Every 5 minutes
2. **Database** → Get monitoring records with "Unknown" emails
3. **Code Node** → Extract unique userIds
4. **HTTP Request** → `/api/n8n/lookupUsers` (batch lookup)
5. **Code Node** → Process results and update records
6. **Database** → Update records with real emails

### Workflow 3: Real-time Enrichment

1. **Webhook Trigger** → Receives monitoring data
2. **HTTP Request** → `/api/n8n/enrichMonitoringData`
3. **Switch Node** → Check if user was found
4. **Slack/Email** → Send notification with real user name
5. **Database** → Store enriched data

---

## Error Handling

### Handle User Not Found
```javascript
// In a Code Node after HTTP Request
if (items[0].json.success === false) {
  return [{
    json: {
      ...originalData,
      error: 'User not found',
      fallbackEmail: 'unknown@company.com'
    }
  }];
} else {
  return [{
    json: {
      ...originalData,
      resolvedUser: items[0].json.data
    }
  }];
}
```

### Rate Limiting Protection
```javascript
// Add delays between requests for large batches
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
await delay(100); // 100ms delay between requests
```

---

## Testing Your N8N Workflows

### Test Data
Use this sample data to test your workflows:

```json
{
  "body": {
    "user": {
      "userId": "aLfYIu7-TthUmwrm",
      "email": "Unknown",
      "deviceName": "Computer-TthUmwrm",
      "timezone": "America/New_York"
    },
    "monitoring": {
      "totalActivities": 1,
      "hasData": true
    }
  }
}
```

### Expected Results
After processing through user lookup:
- `realName`: "John Doe" (or actual user name)
- `realEmail`: "john.doe@company.com" (real email)
- `timezone`: "America/New_York" (user timezone)

---

## Performance Tips for N8N

1. **Cache User Maps**: Use workflow variables to cache user mappings
2. **Batch Process**: Lookup multiple users at once instead of individual requests
3. **Error Handling**: Always handle cases where users are not found
4. **Rate Limiting**: Add small delays between API calls for large datasets
5. **Data Validation**: Check if userId exists before making API calls

---

## Common N8N Patterns

### Pattern 1: Transform and Forward
```
Webhook → Lookup User → Transform Data → Forward to Next Service
```

### Pattern 2: Enrich and Store
```
Schedule → Get Data → Batch Lookup → Enrich → Store in Database
```

### Pattern 3: Real-time Notifications
```
Webhook → Lookup User → Format Message → Send to Slack/Email
```

---

## Troubleshooting

### "Cannot read property of undefined"
Make sure the incoming data structure matches what you expect:
```javascript
// Safe property access
const userId = items[0].json?.body?.user?.userId;
if (!userId) {
  return [{ json: { error: 'No userId found in data' } }];
}
```

### Rate Limiting
If you get too many requests errors:
```javascript
// Add delay between requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
await delay(200); // 200ms delay
```

### User Not Found
Always handle cases where the user doesn't exist:
```javascript
if (lookupResult.success) {
  // User found - use real data
  const realEmail = lookupResult.data.realEmail;
} else {
  // User not found - use fallback
  const realEmail = 'unknown@company.com';
}
```

---

**🎉 With these examples, you can easily resolve "Unknown" emails in your n8n workflows and get real user names and emails from TimeDoctor monitoring data!**