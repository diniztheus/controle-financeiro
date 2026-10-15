import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

export default ts.config(
  {
    ignores: [
      'build/',
      '.svelte-kit/',
      'node_modules/',
      'test-results/',
      'playwright-report/',
      'drizzle/',
      '.taste-skill/',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
        svelteConfig,
      },
    },
  },
  {
    // dominio/ é regra pura: não conhece banco, servidor nem tela.
    files: ['src/lib/dominio/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '$lib/server/*',
                '**/server/**',
                'better-sqlite3',
                'drizzle-orm',
                'drizzle-orm/*',
              ],
              message: 'dominio/ não pode importar banco.',
            },
            {
              group: ['*.svelte', '$app/*', '$lib/ui/*', '**/ui/**'],
              message: 'dominio/ não pode importar UI.',
            },
            { group: ['node:*'], message: 'dominio/ é puro: sem APIs do Node.' },
          ],
        },
      ],
    },
  },
);
