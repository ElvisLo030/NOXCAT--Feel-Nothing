import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'dist-server/**', 'coverage/**', 'public/vendor/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.worker }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    files: ['server/**/*.ts', 'scripts/**/*.mjs', '*.config.ts'],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser }
    }
  }
);
