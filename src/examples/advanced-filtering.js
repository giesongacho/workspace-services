const api = require('../index');

/**
 * Advanced filtering examples for TimeDoctor API
 */
async function advancedFiltering() {
  try {
    console.log('🔍 Advanced Filtering Examples');
    console.log('================================\n');

    // Example 1: Filter users by email
    console.log('1️⃣  Filtering users by email pattern...');
    const usersByEmail = await api.getUsers({
      'filter[email]': '@gmail.com',
      limit: '5'
    });
    console.log(`Found ${usersByEmail.data?.length || 0} Gmail users\n`);

    // Example 2: Filter users by role
    console.log('2️⃣  Filtering users by role...');
    const managers = await api.getUsers({
      'filter[role]': 'manager',
      'filter[showOnReports]': 'true',
      limit: '10'
    });
    console.log(`Found ${managers.data?.length || 0} managers\n`);

    // Example 3: Filter active users with recent activity
    console.log('3️⃣  Filtering recently active users...');
    const today = new Date();
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const activeUsers = await api.getUsers({
      'filter[lastTrack]': lastWeek.toISOString(),
      'filter[inviteAccepted]': 'true',
      sort: 'lastTrack',
      limit: '20'
    });
    console.log(`Found ${activeUsers.data?.length || 0} recently active users\n`);

    // Example 4: Filter users with specific tags
    console.log('4️⃣  Filtering users by tags...');
    const taggedUsers = await api.getUsers({
      'filter[tag]': 'developer',
      'include-archived-users': 'false',
      limit: '15'
    });
    console.log(`Found ${taggedUsers.data?.length || 0} users tagged as 'developer'\n`);

    // Example 5: Complex filtering with multiple criteria
    console.log('5️⃣  Complex filtering with multiple criteria...');
    const complexFilter = await api.getUsers({
      'filter[inviteAccepted]': 'true',
      'filter[showOnReports]': 'true',
      'filter[screenshots]': '1',  // Screenshots enabled
      'filter[payrollAccess]': 'true',
      sort: 'name',
      limit: '50'
    });
    console.log(`Found ${complexFilter.data?.length || 0} users matching complex criteria\n`);

    // Example 6: Pagination example
    console.log('6️⃣  Pagination example...');
    let page = 1;
    let allUsers = [];
    let hasMore = true;
    
    while (hasMore && page <= 3) {  // Limit to 3 pages for demo
      const pageData = await api.getUsers({
        page: page.toString(),
        limit: '10'
      });
      
      if (pageData.data && pageData.data.length > 0) {
        allUsers = allUsers.concat(pageData.data);
        console.log(`  Page ${page}: Retrieved ${pageData.data.length} users`);
        page++;
        
        // Check if there are more pages (this depends on API response structure)
        hasMore = pageData.data.length === 10;
      } else {
        hasMore = false;
      }
    }
    console.log(`Total users retrieved: ${allUsers.length}\n`);

    console.log('✅ Advanced filtering examples completed!');
    
  } catch (error) {
    console.error('❌ Error in advanced filtering:', error.message);
  }
}

// Run if executed directly
if (require.main === module) {
  advancedFiltering();
}