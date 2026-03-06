import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals:     true,
    environment: 'node',
    coverage: {
      provider:  'v8',
      reporter:  ['text', 'lcov'],
      include:   ['src/**/*.js'],
      exclude:   ['src/**/*.test.js'],
      thresholds: {
        lines:   80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
