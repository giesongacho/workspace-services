# Getting Started in 5 Minutes

## 1️⃣ Install (30 seconds)
```bash
git clone https://github.com/iceman-vici/special-task-tdm-api.git
cd special-task-tdm-api
npm install
```

## 2️⃣ Configure (1 minute)
```bash
cp .env.example .env
```

Edit `.env` file:
```
TD_EMAIL=your-email@example.com
TD_PASSWORD=your-password
TD_COMPANY_NAME=Your Company Name
```

## 3️⃣ Start Server (10 seconds)
```bash
npm start
```

You'll see:
```
🚀 TimeDoctor API Server
========================
📡 Server running on: http://localhost:3000
✅ Server is ready to accept requests!
```

## 4️⃣ Test It Works (10 seconds)
Open browser and go to:
```
http://localhost:3000/api/health
```

You should see:
```json
{
  "status": "ok",
  "message": "TimeDoctor API Server is running"
}
```

## 5️⃣ Try Your First API Call

### Get All Users:
```
http://localhost:3000/api/getUsers
```

### Get All Projects:
```
http://localhost:3000/api/getProjects
```

### Get Today's Work Logs:
```
http://localhost:3000/api/getWorkLogs
```

---

## That's It! 🎉

Your TimeDoctor API server is now running!

### What Now?

- Check [API_GUIDE.md](API_GUIDE.md) for all endpoints
- Read [README.md](README.md) for detailed documentation
- Start making API calls from your application

### Quick Tips

✅ **Date Format:** Always use `YYYY-MM-DD` (like `2025-01-08`)

✅ **User IDs:** Get them from `/api/getUsers` endpoint first

✅ **Filters:** Add `?limit=10` to limit results

✅ **Logs:** Check your terminal for request logs

---

## Common Issues & Quick Fixes

### ❌ "Authentication Failed"
- Check email/password in `.env`
- Enable API access in TimeDoctor settings

### ❌ "Company Not Found"
- Check exact company name in TimeDoctor
- Update `TD_COMPANY_NAME` in `.env`

### ❌ "Port 3000 in use"
- Change port: `PORT=3001 npm start`

### ❌ "No data returned"
- Check date format (YYYY-MM-DD)
- Verify you have data for that date range

---

## Need More Help?

- 📖 Full Documentation: [README.md](README.md)
- 📚 API Reference: [API_GUIDE.md](API_GUIDE.md)
- 🐛 Report Issues: [GitHub Issues](https://github.com/iceman-vici/special-task-tdm-api/issues)
