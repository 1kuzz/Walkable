export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allow longer subject lines for descriptive commits
    'subject-max-length': [1, 'always', 120],
    // Body lines can be long (URLs in CI-injected footers exceed 100 chars)
    'body-max-line-length': [0],
    // Scope is optional
    'scope-empty': [0],
    // Allow common MOPS-specific types beyond conventional
    'type-enum': [
      2,
      'always',
      [
        'feat',     // new feature
        'fix',      // bug fix
        'chore',    // maintenance, deps, tooling
        'docs',     // documentation only
        'style',    // formatting, no logic change
        'refactor', // code change without feature/fix
        'perf',     // performance improvement
        'test',     // add or fix tests
        'build',    // build system or dependency changes
        'ci',       // CI/CD changes
        'revert',   // revert a previous commit
      ],
    ],
  },
};
