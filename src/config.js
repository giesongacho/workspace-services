require('dotenv').config();

const config = {
  credentials: {
    email: process.env.TD_EMAIL || 'levi84088@gmail.com',
    password: process.env.TD_PASSWORD || 'Y$PkmJBf3W5sKS',
    companyName: process.env.TD_COMPANY_NAME,
    totpCode: process.env.TD_TOTP_CODE || null
  },
  api: {
    baseUrl: process.env.TD_API_BASE_URL || 'https://api2.timedoctor.com',
    version: process.env.TD_API_VERSION || '1.0',
    authEndpoint: '/api/1.0/authorization/login'
  },
  isDevelopment: process.env.NODE_ENV === 'development'
};

// Validate required configuration
const validateConfig = () => {
  const required = [
    ['Email', config.credentials.email],
    ['Password', config.credentials.password],
    ['Company Name', config.credentials.companyName]
  ];

  const missing = required.filter(([name, value]) => !value);
  
  if (missing.length > 0) {
    console.error('\n⚠️  Missing required configuration:');
    missing.forEach(([name]) => {
      console.error(`  - ${name}`);
    });
    console.error('\nPlease add these values to your .env file');
    console.error('Copy .env.example to .env and fill in the required values\n');
    throw new Error(`Missing required configuration: ${missing.map(([name]) => name).join(', ')}`);
  }
};

validateConfig();

module.exports = config;