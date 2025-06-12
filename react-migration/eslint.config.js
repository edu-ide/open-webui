import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { 
    ignores: [
      'dist',
      'dist-ssr',
      'dist-webcomponent',
      'build',
      'node_modules',
      'coverage',
      '*.local',
      '.vite',
      '.turbo',
      '.parcel-cache',
      'playwright-report',
      'test-results',
      '.nyc_output',
      '*.tsbuildinfo',
      '.eslintcache',
      '*.min.js',
      '*.umd.js',
      'public/libs',
      'k8s/secrets',
      'logs',
      'temp',
      'tmp'
    ] 
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { 
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true 
        }
      ],
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/no-namespace': 'warn',
      'prefer-const': 'warn'
    },
  },
)
