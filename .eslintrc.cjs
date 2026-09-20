/* eslint 工程化：规则从宽，只查真正的坑，不与现有风格打架。
 * 各 js 以 IIFE 挂 window.EchoX，内部用局部别名（D/C/R/...），不直接用全局名，
 * 故 no-undef 不会误报模块名。gen.js 的 UMD `typeof module` 由 env.node + typeof 安全检查覆盖。
 */
module.exports = {
  root: true,
  env: { browser: true, node: true, es2022: true, worker: true },
  parserOptions: { ecmaVersion: 2022, sourceType: 'script' },
  rules: {
    'no-undef': 'error',
    'no-unused-vars': ['warn', { args: 'none', vars: 'local' }],
    'no-empty': ['warn', { allowStatementCursors: true }],
    'no-cond-assign': 'error',
    'no-fallthrough': 'warn',
    'no-self-assign': 'warn',
    'no-use-before-define': ['warn', { functions: false, variables: true }],
    eqeqeq: ['warn', 'smart'],
  },
  overrides: [
    {
      files: ['test/**/*.cjs'],
      env: { node: true, browser: false },
      parserOptions: { ecmaVersion: 2022, sourceType: 'script' },
    },
  ],
  ignorePatterns: ['node_modules/', '.pw-browsers/', 'test/shot_*.png', 'js/gen.worker.js'],
};
