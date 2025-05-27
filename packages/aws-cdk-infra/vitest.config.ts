import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // or 'jsdom' if you test browser-like environments
    coverage: {
      provider: 'v8', // or 'istanbul'
      reporter: ['text', 'json', 'html'],
    },
    include: ['src/**/*.test.ts'], // Pattern to find test files (excludes test-workflow)
    exclude: ['test-workflow/**'], // Explicitly exclude integration tests
  },
});
