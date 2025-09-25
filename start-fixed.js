#!/usr/bin/env node

// 🎯 BATCH Workspace Services Startup with UPDATED WEBHOOK
// This starts the server with BATCH processing - ALL users in ONE webhook call

console.log('🚀 Starting BATCH TimeDoctor API Server...');
console.log('==========================================');
console.log('✅ BATCH PROCESSING ENABLED:');
console.log('   1. Real usernames like "Levi Daniels", "Joshua Banks"');  
console.log('   2. Sends to n8n ONCE (not every 2 minutes)');
console.log('   3. ALL users in ONE webhook call (not individual)');
console.log('   4. Enhanced debugging endpoints');
console.log('   5. Better error handling');
console.log('\n🔗 WEBHOOK URL UPDATED:');
console.log('=======================');
console.log('OLD: https://n8n.srv470812.hstgr.cloud/webhook/workspace-url-n8n');
console.log('NEW: https://n8n.srv470812.hstgr.cloud/webhook-test/workspace-url-n8n');
console.log('\n🎯 Instead of 10+ individual webhook calls, you get 1 batch call to the NEW webhook!');

// Load the batch server
require('./src/batch-server.js');