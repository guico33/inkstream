// CI-specific optimizations for Playwright tests
import { Page } from '@playwright/test';

/**
 * Wait for network to be idle with CI-appropriate timeout
 */
export async function waitForNetworkIdle(page: Page, timeout = 30000) {
  if (process.env.CI) {
    // Longer timeout on CI
    await page.waitForLoadState('networkidle', { timeout: timeout * 1.5 });
  } else {
    await page.waitForLoadState('networkidle', { timeout });
  }
}
