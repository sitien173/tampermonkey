import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.greasemonkey,
        GM_xmlhttpRequest: 'readonly',
        GM_setValue: 'readonly',
        GM_getValue: 'readonly',
        GM_deleteValue: 'readonly',
        GM_listValues: 'readonly',
        GM_addStyle: 'readonly',
        GM_setClipboard: 'readonly',
        GM_notification: 'readonly',
        GM_openInTab: 'readonly',
        GM_registerMenuCommand: 'readonly',
        GM_unregisterMenuCommand: 'readonly',
        GM_getResourceText: 'readonly',
        GM_getResourceURL: 'readonly',
        GM_log: 'readonly',
        GM_info: 'readonly',
        GM_cookie: 'readonly',
        unsafeWindow: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-undef': 'error',
      'eqeqeq': ['warn', 'smart'],
      'curly': ['warn', 'multi-line'],
      'no-var': 'warn',
      'prefer-const': 'warn',
    },
  },
  {
    ignores: ['dist/**', 'export/**', 'node_modules/**', 'gulpfile.cjs'],
  },
];

