#!/usr/bin/env node

// 🎯 FIXED Workspace Services Startup
// This starts the server with FIXED username lookup and single webhook send

console.log('🚀 Starting FIXED TimeDoctor API Server...');
console.log('==========================================');
console.log('✅ FIXES APPLIED:');
console.log('   1. Real usernames like "Levi Daniels", "Joshua Banks"');  
console.log('   2. Sends to n8n ONCE (not every 2 minutes)');
console.log('   3. Enhanced debugging endpoints');
console.log('   4. Better error handling');

// Load the fixed server
require('./src/fixed-server.js');