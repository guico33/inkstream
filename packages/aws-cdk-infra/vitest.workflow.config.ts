import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test-workflow/test-workflow.ts'], // Only include the actual test file
    testTimeout: 900000, // 15 minute timeout for integration tests
  },
});
