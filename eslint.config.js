/**
 * ESLint flat config (v9+). Adapted from midi-daddy's eslint.config.js
 * with project-specific blocks (browser-side apps, Max for Live)
 * stripped — server-cli-core is a Node-side library only.
 *
 * Conservative preset: @eslint/js recommended for real-bug rules
 * plus a curated stylistic block matching midi-daddy's house style
 * (single quotes, semicolons, 2-space indent).
 */

import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'coverage/**'
    ]
  },

  js.configs.recommended,

  {
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/indent': ['error', 2],
      '@stylistic/quotes': ['error', 'single', { allowTemplateLiterals: 'always', avoidEscape: true }],
      '@stylistic/arrow-parens': ['error', 'as-needed'],
      '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
      '@stylistic/comma-dangle': ['error', 'never'],
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/space-infix-ops': 'error',
      '@stylistic/comma-spacing': 'error',
      '@stylistic/key-spacing': 'error',
      '@stylistic/no-multi-spaces': 'error',
      '@stylistic/quote-props': ['error', 'as-needed'],
      '@stylistic/no-floating-decimal': 'error',
      '@stylistic/space-before-blocks': 'error',
      '@stylistic/max-statements-per-line': 'off',
      '@stylistic/multiline-ternary': 'off',
      '@stylistic/operator-linebreak': 'off',
      '@stylistic/padded-blocks': 'off'
    }
  },

  {
    rules: {
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_'
      }]
    }
  },

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    }
  },

  {
    files: ['**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.jest
      }
    }
  }
];
