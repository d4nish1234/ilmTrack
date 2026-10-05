import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Triggers write to Firestore through the Admin SDK, so these share one
    // emulator and must not race each other.
    fileParallelism: false,
    include: ['tests/**/*.test.ts'],
  },
});
