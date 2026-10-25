const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['node_modules/', 'android/', 'ios/', 'dist/', '.expo/', 'functions/lib/'],
  },
  {
    // React Compiler rules that eslint-config-expo 56 turned on as errors.
    // They flag patterns the app already used before the SDK upgrade (setState
    // in effects, manual memoization) rather than bugs, so they are warnings
    // until the code is migrated on purpose, not as part of an SDK bump.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
]);
