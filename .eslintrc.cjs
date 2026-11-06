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
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-cond-assign': 'error',
    'no-fallthrough': 'warn',
    'no-self-assign': 'warn',
    'no-use-before-define': ['warn', { functions: false, variables: true }],
    eqeqeq: ['warn', 'smart'],
  },
  overrides: [
    {
      // 测试脚本用 global.window = global 桩模拟浏览器，同时用 require/process/__dirname，
      // 因此 node + browser 都要开，否则 window/document/localStorage 会被 no-undef 误报
      files: ['test/**/*.cjs'],
      env: { node: true, browser: true },
      parserOptions: { ecmaVersion: 2022, sourceType: 'script' },
    },
  ],
  ignorePatterns: ['node_modules/', '.pw-browsers/', 'test/shot_*.png', 'js/gen.worker.js'],
};
