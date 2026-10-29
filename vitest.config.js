import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['backend/tests/**/*.test.js'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
