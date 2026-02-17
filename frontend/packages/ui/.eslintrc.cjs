/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  env: {
    browser: true,
    node: true,
    es2021: true,
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    // React 17+ JSX transform — no need to import React
    'react/react-in-jsx-scope': 'off',
    // Using TypeScript for prop validation instead of prop-types
    'react/prop-types': 'off',
    // Allow unescaped entities in JSX (common in stories/docs)
    'react/no-unescaped-entities': 'off',
    // Allow custom HTML attributes (e.g., cmdk-input-wrapper)
    'react/no-unknown-property': 'off',
    // Allow prop spreading for UI components
    'react/jsx-props-no-spreading': 'off',
    // Allow default exports for barrel files
    'import/prefer-default-export': 'off',
    // Relax unused vars for _ prefix
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    // Allow explicit any in test helpers and type utilities
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    {
      // Relax hooks rules for Storybook render functions
      files: ['**/*.stories.{ts,tsx}'],
      rules: {
        'react-hooks/rules-of-hooks': 'off',
      },
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/', 'storybook-static/', '*.config.*'],
};
