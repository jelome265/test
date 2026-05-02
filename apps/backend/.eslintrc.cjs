module.exports = {
  extends: ['../../.eslintrc.base.js'],
  parserOptions: {
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname
  },
  ignorePatterns: ['test/', 'vitest.config.ts']
};
