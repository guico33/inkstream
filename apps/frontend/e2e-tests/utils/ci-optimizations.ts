// CI-specific optimizations for Playwright tests
import { Page } from '@playwright/test';
import { TEST_TIMEOUTS } from './test-config';

/**
 * Wait for network to be idle with CI-appropriate timeout
 */
export async function waitForNetworkIdle(page: Page, timeout = TEST_TIMEOUTS.NETWORK_IDLE) {
  await page.waitForLoadState('networkidle', { timeout });
}
