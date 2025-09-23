const TimeDoctorAPI = require('./api');
const config = require('./config');

// Create API instance
const api = new TimeDoctorAPI();

/**
 * Example usage of the TimeDoctor API
 */
async function main() {
  try {
    console.log('🚀 TimeDoctor API Integration');
    console.log('================================\n');

    // Authenticate and get company info
    const companyId = await api.getCompanyId();
    console.log(`🏢 Using company: ${config.credentials.companyName}`);
    console.log(`🆔 Company ID: ${companyId}\n`);

    // 1. Fetch all users
    console.log('📋 Fetching users list...');
    const users = await api.getUsers({
      limit: '10',  // Limit to 10 users for demo
      detail: 'email'
    });
    
    if (users.data && users.data.length > 0) {
      console.log(`\n📊 Found ${users.data.length} users:`);
      users.data.forEach((user, index) => {
        console.log(`  ${index + 1}. ${user.name || 'N/A'} (${user.email || 'N/A'})`);
      });

      // 2. Get details for the first user
      const firstUser = users.data[0];
      if (firstUser && firstUser.id) {
        console.log(`\n🔍 Getting details for user: ${firstUser.name}`);
        const userDetails = await api.getUser(firstUser.id);
        console.log('User details:', JSON.stringify(userDetails.data, null, 2));
      }
    } else {
      console.log('No users found.');
    }

    // 3. Fetch projects
    console.log('\n📁 Fetching projects...');
    const projects = await api.getProjects({ limit: '5' });
    if (projects.data && projects.data.length > 0) {
      console.log(`Found ${projects.data.length} projects:`);
      projects.data.forEach((project, index) => {
        console.log(`  ${index + 1}. ${project.name || 'N/A'}`);
      });
    }

    // 4. Fetch recent work logs
    console.log('\n📝 Fetching recent work logs...');
    const workLogs = await api.getWorkLogs({ limit: '5' });
    if (workLogs.data && workLogs.data.length > 0) {
      console.log(`Found ${workLogs.data.length} work logs from the last 7 days`);
    }

    // 5. Fetch time tracking data
    console.log('\n⏱️ Fetching time tracking data...');
    const timeTracking = await api.getTimeTracking({ limit: '5' });
    if (timeTracking.data) {
      console.log('Time tracking data retrieved successfully');
    }

    console.log('\n✅ API integration test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('Company') && error.message.includes('not found')) {
      console.log('\n💡 Check the available companies listed above and update TD_COMPANY_NAME in your .env file');
    } else if (error.message.includes('Invalid credentials')) {
      console.log('\n💡 Tips:');
      console.log('  1. Check your email and password in the .env file');
      console.log('  2. If you have 2FA enabled, add TD_TOTP_CODE to your .env file');
    } else if (error.message.includes('Authentication denied')) {
      console.log('\n💡 Tips:');
      console.log('  1. Verify your password is correct');
      console.log('  2. Check if API access is enabled for your account');
      console.log('  3. Ensure your account is active and not suspended');
    }
    
    // Clear cache on error to force re-authentication next time
    if (error.message.includes('auth') || error.message.includes('Auth')) {
      await api.clearCache();
    }
    
    process.exit(1);
  }
}

// Export the API instance for use in other modules
module.exports = api;

// Run main function if this file is executed directly
if (require.main === module) {
  main();
}