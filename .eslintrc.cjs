/** ESLint flat-ish config (classic format for broad tool compat). */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  env: {
    node: true,
    es2022: true
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
    ],
    'prefer-const': 'error',
    'no-var': 'error',
    'eqeqeq': ['error', 'always']
  },
  ignorePatterns: [
    'dist/',
    'json-schema/',
    'generated/',
    'node_modules/',
    '*.cjs',
    '*.mjs'
  ],
  overrides: [
    {
      files: ['**/tests/**/*.ts', '**/*.test.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off'
      }
    }
  ]
};
