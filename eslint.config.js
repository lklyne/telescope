// Flat ESLint config. Minimal surface: enforces the two spec §6
// interaction-layer invariants via local custom rules. General lint
// coverage can be expanded later; this config exists first to lock
// down the layout-pass and pointer-event invariants.

import tseslint from 'typescript-eslint'
import localRules from './eslint-rules/index.js'

export default tseslint.config(
  {
    ignores: [
      '.vite/**',
      'out/**',
      'dist/**',
      'node_modules/**',
      '**/*.d.ts',
      'eslint-rules/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { local: localRules },
    rules: {
      // Phase 5d-v2 E4: rules stand up as warnings because pre-existing
      // call sites are pervasive (window-init layout, wireframe mouse
      // events). The rules are visible in CI / PR review so no new
      // violations land; conversion to 'error' waits until the legacy
      // sites are migrated in a follow-up.
      'local/no-direct-view-mutation': 'warn',
      'local/no-mouse-events': 'warn',
    },
  },
)
