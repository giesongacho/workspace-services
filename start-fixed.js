#!/usr/bin/env node

// 🎯 SINGLE CALL Workspace Services Startup
// This sends ALL users in ONE clean JSON payload to your webhook (no individual calls)

console.log('🚀 Starting SINGLE CALL TimeDoctor API Server...');
console.log('=================================================');
console.log('✅ SINGLE JSON PAYLOAD:');
console.log('   1. Real usernames like "Levi Daniels", "Joshua Banks"');  
console.log('   2. ALL users wrapped in ONE JSON payload');
console.log('   3. Sent to n8n ONCE (not every 2 minutes)');
console.log('   4. NO individual webhook calls (no more spam!)');
console.log('   5. Clean, beautiful JSON structure');
console.log('\n🔗 WEBHOOK URL:');
console.log('===============');
console.log('https://n8n.srv470812.hstgr.cloud/webhook/workspace-url-n8n');
console.log('\n🎯 Result: ONE clean n8n execution with ALL users inside!');
console.log('🎉 No more ugly individual webhook calls!');

// Load the updated batch server (now sends single JSON payload)
require('./src/batch-server.js');