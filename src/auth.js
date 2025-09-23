const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');
const config = require('./config');

class AuthManager {
  constructor() {
    this.token = null;
    this.companyId = null;
    this.tokenExpiry = null;
    this.cachePath = path.join(__dirname, '..', '.token-cache.json');
    this.isRefreshing = false; // Prevent multiple simultaneous refreshes
  }

  /**
   * Load cached token if valid
   */
  async loadCachedToken() {
    try {
      const data = await fs.readFile(this.cachePath, 'utf8');
      const cached = JSON.parse(data);
      
      // Check if cache is for same credentials
      if (cached.email !== config.credentials.email || 
          cached.companyName !== config.credentials.companyName) {
        console.log('🔄 Credentials changed, need new token');
        return false;
      }
      
      // Check if token is still valid (with 5 minute buffer)
      if (cached.token && cached.expiresAt) {
        const expiryDate = new Date(cached.expiresAt);
        const now = new Date();
        const timeRemaining = expiryDate.getTime() - now.getTime();
        
        if (timeRemaining > 5 * 60 * 1000) {
          this.token = cached.token;
          this.companyId = cached.companyId;
          this.tokenExpiry = expiryDate;
          
          const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
          const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
          console.log(`✅ Using cached token (expires in ${hoursRemaining}h ${minutesRemaining}m)`);
          return true;
        } else if (timeRemaining > 0) {
          console.log('⚠️  Token expiring soon, will refresh');
        } else {
          console.log('❌ Token expired, will authenticate');
        }
      }
    } catch (error) {
      // Cache doesn't exist or is invalid
      console.log('📝 No valid token cache found');
    }
    return false;
  }

  /**
   * Save token to cache
   */
  async saveToCache() {
    try {
      const cacheData = {
        token: this.token,
        companyId: this.companyId,
        expiresAt: this.tokenExpiry,
        email: config.credentials.email,
        companyName: config.credentials.companyName,
        cachedAt: new Date().toISOString()
      };
      await fs.writeFile(this.cachePath, JSON.stringify(cacheData, null, 2));
      console.log('💾 Token cached successfully');
    } catch (error) {
      console.warn('⚠️  Could not cache token:', error.message);
    }
  }

  /**
   * Authenticate and get token
   */
  async authenticate() {
    // Prevent multiple simultaneous authentication attempts
    if (this.isRefreshing) {
      console.log('⏳ Authentication already in progress...');
      // Wait for the current refresh to complete
      while (this.isRefreshing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return { token: this.token, companyId: this.companyId };
    }

    this.isRefreshing = true;

    try {
      // Try to use cached token first
      if (await this.loadCachedToken()) {
        return { token: this.token, companyId: this.companyId };
      }

      console.log('🔐 Authenticating with TimeDoctor...');
      console.log(`📧 Email: ${config.credentials.email}`);
      console.log(`🏢 Looking for company: ${config.credentials.companyName}`);
      
      const authUrl = `${config.api.baseUrl}${config.api.authEndpoint}`;
      
      const requestBody = {
        email: config.credentials.email,
        password: config.credentials.password,
        permissions: 'write'
      };

      // Add TOTP code if provided (for 2FA)
      if (config.credentials.totpCode) {
        requestBody.totpCode = config.credentials.totpCode;
      }

      const response = await fetch(authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const responseText = await response.text();
      let responseData;
      
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Invalid response from API: ${responseText}`);
      }

      if (!response.ok) {
        this.handleAuthError(response.status, responseData);
      }
      
      // Extract token from response
      if (!responseData.data || !responseData.data.token) {
        throw new Error('No token received in authentication response');
      }

      this.token = responseData.data.token;
      console.log('🎫 New token obtained');
      
      // Find company ID by searching through companies
      let foundCompany = false;
      if (responseData.data.companies) {
        // Search for company by name property
        for (const [key, company] of Object.entries(responseData.data.companies)) {
          if (company.name === config.credentials.companyName) {
            this.companyId = company.id;
            foundCompany = true;
            console.log(`✅ Found company '${company.name}'`);
            console.log(`🆔 Company ID: ${this.companyId}`);
            break;
          }
        }
        
        // If not found, check if company name was used as a key
        if (!foundCompany && responseData.data.companies[config.credentials.companyName]) {
          const company = responseData.data.companies[config.credentials.companyName];
          this.companyId = company.id;
          foundCompany = true;
          console.log(`✅ Found company '${config.credentials.companyName}'`);
          console.log(`🆔 Company ID: ${this.companyId}`);
        }
        
        // If still not found, list available companies
        if (!foundCompany) {
          console.error(`\n❌ Company '${config.credentials.companyName}' not found!`);
          const availableCompanies = [];
          
          for (const [key, company] of Object.entries(responseData.data.companies)) {
            const companyName = company.name || key;
            availableCompanies.push({
              name: companyName,
              id: company.id
            });
          }
          
          if (availableCompanies.length > 0) {
            console.error('\nAvailable companies:');
            availableCompanies.forEach(company => {
              console.error(`  - ${company.name} (ID: ${company.id})`);
            });
            console.error('\nPlease update TD_COMPANY_NAME in your .env file with one of the above company names.');
          }
          
          throw new Error(`Company '${config.credentials.companyName}' not found in account`);
        }
      } else {
        throw new Error('No companies found in authentication response');
      }

      // Set token expiry (if provided, otherwise default to 24 hours)
      if (responseData.data.expiresAt) {
        this.tokenExpiry = new Date(responseData.data.expiresAt);
      } else {
        // Default to 24 hours from now
        this.tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      }
      
      // Calculate token lifetime
      const tokenLifetime = this.tokenExpiry.getTime() - Date.now();
      const hours = Math.floor(tokenLifetime / (1000 * 60 * 60));
      const minutes = Math.floor((tokenLifetime % (1000 * 60 * 60)) / (1000 * 60));
      
      console.log('✅ Authentication successful!');
      console.log(`🔑 Token valid for: ${hours} hours ${minutes} minutes`);
      console.log(`⏰ Expires at: ${this.tokenExpiry.toLocaleString()}`);
      
      // Save to cache
      await this.saveToCache();
      
      return { token: this.token, companyId: this.companyId };
    } catch (error) {
      if (!error.message.includes('Company')) {
        console.error('\n❌ Authentication failed:', error.message);
      }
      throw error;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Handle authentication errors
   */
  handleAuthError(status, responseData) {
    const message = responseData.message || responseData.error || 'Unknown error';
    
    if (status === 403) {
      console.error('\n❌ 403 Forbidden:', message);
      console.error('\nPossible causes:');
      console.error('  1. Incorrect password');
      console.error('  2. API access not enabled for this account');
      console.error('  3. Account locked or suspended');
      throw new Error(`Authentication denied: ${message}`);
    } else if (status === 401) {
      console.error('\n❌ 401 Unauthorized:', message);
      console.error('Check your email and password in .env file');
      
      // Check if 2FA is required
      if (message.toLowerCase().includes('totp') || message.toLowerCase().includes('2fa')) {
        console.error('\n🔐 Two-factor authentication is required!');
        console.error('Add TD_TOTP_CODE to your .env file with your current 2FA code');
      }
      throw new Error('Invalid credentials');
    } else if (status === 404) {
      console.error('\n❌ 404 Not Found');
      console.error('The authentication endpoint may have changed');
      throw new Error('Authentication endpoint not found');
    } else {
      throw new Error(`Authentication failed (${status}): ${message}`);
    }
  }

  /**
   * Get valid token (authenticate if needed)
   * This is the main method that ensures we always have a valid token
   */
  async getCredentials() {
    // Check if token exists and is not expired
    if (!this.token || this.isTokenExpired()) {
      console.log('🔄 Token expired or missing, refreshing...');
      await this.authenticate();
    }
    
    return { token: this.token, companyId: this.companyId };
  }

  /**
   * Check if token is expired or about to expire
   */
  isTokenExpired() {
    if (!this.tokenExpiry) return true;
    
    const now = new Date();
    const timeRemaining = this.tokenExpiry.getTime() - now.getTime();
    
    // Consider token expired if less than 5 minutes remaining
    if (timeRemaining < 5 * 60 * 1000) {
      if (timeRemaining > 0) {
        console.log('⚠️  Token expiring in less than 5 minutes');
      } else {
        console.log('❌ Token has expired');
      }
      return true;
    }
    
    return false;
  }

  /**
   * Force token refresh (manually trigger new authentication)
   */
  async refreshToken() {
    console.log('🔄 Manually refreshing token...');
    await this.clearCache();
    return await this.authenticate();
  }

  /**
   * Clear cached token
   */
  async clearCache() {
    try {
      await fs.unlink(this.cachePath);
      console.log('🗑️  Token cache cleared');
    } catch (error) {
      // Cache file doesn't exist
    }
    this.token = null;
    this.companyId = null;
    this.tokenExpiry = null;
  }

  /**
   * Get token status (for debugging)
   */
  getTokenStatus() {
    if (!this.token) {
      return { status: 'No token', valid: false };
    }
    
    const now = new Date();
    const timeRemaining = this.tokenExpiry ? this.tokenExpiry.getTime() - now.getTime() : 0;
    
    if (timeRemaining <= 0) {
      return { 
        status: 'Expired', 
        valid: false,
        expiredAt: this.tokenExpiry
      };
    }
    
    const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
    
    return {
      status: 'Valid',
      valid: true,
      expiresAt: this.tokenExpiry,
      timeRemaining: `${hours}h ${minutes}m`,
      companyId: this.companyId
    };
  }
}

module.exports = AuthManager;