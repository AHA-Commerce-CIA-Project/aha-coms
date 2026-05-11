import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import globals from 'globals';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		},
		rules: {
			'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			'@typescript-eslint/no-unused-expressions': 'off',
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-this-alias': 'off',
			'no-empty': 'warn',
			'no-prototype-builtins': 'off',
			'no-cond-assign': 'off',
			'no-useless-escape': 'off',
			'no-func-assign': 'off',
			'no-fallthrough': 'off',
			'no-undef': 'off',
			'no-control-regex': 'off',
			'no-unreachable': 'warn',
			'no-case-declarations': 'off',
			'no-irregular-whitespace': 'off',
			'no-constant-condition': 'off',
			'no-extra-boolean-cast': 'off',
			'getter-return': 'off'
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parser: svelteParser,
			parserOptions: {
				parser: ts.parser
			}
		},
		rules: {
			'svelte/no-navigation-without-resolve': 'off',
			'svelte/require-each-key': 'warn',
			'svelte/prefer-svelte-reactivity': 'warn'
		}
	},
	{
		files: ['**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parser: svelteParser,
			parserOptions: {
				parser: ts.parser
			}
		}
	},
	{
		files: ['**/sw.js'],
		rules: {
			'@typescript-eslint/no-unused-vars': 'off'
		}
	},
		{
			files: ['**/paraglide/**'],
			rules: {
				'@typescript-eslint/no-unused-vars': 'off',
				'no-misleading-character-class': 'off'
			}
		},
		{
			ignores: [
				'**/node_modules/',
				'**/.svelte-kit/',
				'**/build/',
				'**/dist/',
				'**/paraglide/',
				'**/.old_modules*/',
				'**/.output/',
				'my-designs/'
			]
		}
);
