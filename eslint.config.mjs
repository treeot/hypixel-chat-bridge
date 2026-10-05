import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config({ ignores: ['dist/**', 'node_modules/**'] }, js.configs.recommended, ...tseslint.configs.recommended, prettier, {
  rules: { eqeqeq: ['error', 'smart'], '@typescript-eslint/no-explicit-any': 'warn' }
})
