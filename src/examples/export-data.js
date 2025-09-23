const fs = require('fs').promises;
const path = require('path');
const api = require('../index');

/**
 * Export TimeDoctor data to JSON and CSV formats
 */
async function exportData() {
  try {
    console.log('📤 Data Export Example');
    console.log('======================\n');

    // Create exports directory
    const exportDir = path.join(__dirname, '..', '..', 'exports');
    await fs.mkdir(exportDir, { recursive: true });

    // 1. Export all users
    console.log('Exporting users...');
    const users = await api.getUsers({ limit: '1000' });
    
    if (users.data && users.data.length > 0) {
      // Save as JSON
      const usersJsonPath = path.join(exportDir, `users_${Date.now()}.json`);
      await fs.writeFile(usersJsonPath, JSON.stringify(users.data, null, 2));
      console.log(`✅ Exported ${users.data.length} users to ${usersJsonPath}`);
      
      // Save as CSV
      const usersCsvPath = path.join(exportDir, `users_${Date.now()}.csv`);
      const csvHeaders = Object.keys(users.data[0]).join(',');
      const csvRows = users.data.map(user => 
        Object.values(user).map(val => 
          typeof val === 'string' && val.includes(',') ? `"${val}"` : val
        ).join(',')
      );
      const csvContent = [csvHeaders, ...csvRows].join('\n');
      await fs.writeFile(usersCsvPath, csvContent);
      console.log(`✅ Exported users to CSV: ${usersCsvPath}`);
    }

    // 2. Export projects
    console.log('\nExporting projects...');
    const projects = await api.getProjects({ limit: '1000' });
    
    if (projects.data && projects.data.length > 0) {
      const projectsJsonPath = path.join(exportDir, `projects_${Date.now()}.json`);
      await fs.writeFile(projectsJsonPath, JSON.stringify(projects.data, null, 2));
      console.log(`✅ Exported ${projects.data.length} projects to ${projectsJsonPath}`);
    }

    // 3. Export work logs for the last 30 days
    console.log('\nExporting work logs (last 30 days)...');
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const today = new Date();
    
    const workLogs = await api.getWorkLogs({
      from: thirtyDaysAgo.toISOString().split('T')[0],
      to: today.toISOString().split('T')[0],
      limit: '1000'
    });
    
    if (workLogs.data && workLogs.data.length > 0) {
      const workLogsJsonPath = path.join(exportDir, `worklogs_${Date.now()}.json`);
      await fs.writeFile(workLogsJsonPath, JSON.stringify(workLogs.data, null, 2));
      console.log(`✅ Exported ${workLogs.data.length} work logs to ${workLogsJsonPath}`);
    }

    // 4. Create a summary report
    console.log('\nCreating summary report...');
    const summary = {
      exportDate: new Date().toISOString(),
      statistics: {
        totalUsers: users.data?.length || 0,
        totalProjects: projects.data?.length || 0,
        totalWorkLogs: workLogs.data?.length || 0,
        dateRange: {
          from: thirtyDaysAgo.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0]
        }
      },
      users: users.data?.slice(0, 5).map(u => ({ id: u.id, name: u.name, email: u.email })) || [],
      projects: projects.data?.slice(0, 5).map(p => ({ id: p.id, name: p.name })) || []
    };
    
    const summaryPath = path.join(exportDir, `summary_${Date.now()}.json`);
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`✅ Created summary report: ${summaryPath}`);

    console.log('\n🎉 Data export completed successfully!');
    console.log(`📁 All files saved to: ${exportDir}`);
    
  } catch (error) {
    console.error('❌ Error exporting data:', error.message);
  }
}

// Run if executed directly
if (require.main === module) {
  exportData();
}