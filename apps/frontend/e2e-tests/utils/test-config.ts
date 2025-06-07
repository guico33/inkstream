// Centralized timeout configurations for e2e tests

export const TEST_TIMEOUTS = {
  // Base timeouts (adjust based on CI environment)
  get DEFAULT() {
    return process.env.CI ? 30000 : 20000;
  },
  
  get EXTENDED() {
    return process.env.CI ? 45000 : 30000;
  },
  
  get LONG() {
    return process.env.CI ? 90000 : 60000;
  },
  
  get VERY_LONG() {
    return process.env.CI ? 120000 : 90000;
  },
  
  get EXTRA_LONG() {
    return process.env.CI ? 180000 : 120000;
  },

  // Specific operation timeouts
  get NAVIGATION() {
    return process.env.CI ? 90000 : 60000;
  },
  
  get NETWORK_IDLE() {
    return process.env.CI ? 45000 : 30000;
  },
  
  get DOWNLOAD() {
    return 15000; // Downloads should be fast regardless of environment
  },
  
  get WORKFLOW_START() {
    return process.env.CI ? 30000 : 15000;
  },
  
  get AUTH_REDIRECT() {
    return 3100; // Fixed redirect timeout
  }
};

// Test suite timeouts for different types of tests
export const SUITE_TIMEOUTS = {
  get DOWNLOAD_TESTS() {
    return process.env.CI ? 120000 : 90000; // 2 minutes on CI, 1.5 minutes locally
  },
  
  get FULL_LIFECYCLE() {
    return process.env.CI ? 180000 : 120000; // 3 minutes on CI, 2 minutes locally
  },
  
  get ERROR_HANDLING() {
    return process.env.CI ? 150000 : 90000; // 2.5 minutes on CI, 1.5 minutes locally
  }
};