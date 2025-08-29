import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Ignore build + deps everywhere
  globalIgnores(['dist', 'node_modules']),

  {
    files: ['**/*.{js,jsx}'],
    ignores: [], // add patterns here if you want to skip specific folders

    extends: [
      js.configs.recommended,                // modern JS rules
      reactHooks.configs['recommended-latest'], // safe hooks usage
      reactRefresh.configs.vite,             // good DX with Vite HMR
    ],

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      // Browser globals (add ...globals.node if you reference process, __dirname, etc.)
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },

    rules: {
      // Common niceties
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'warn',
    },
  },
])
