module.exports = {
  root: true,
  extends: ['./.eslintrc.base.js'],
  parserOptions: {
    project: ['./tsconfig.base.json']
  },
  ignorePatterns: ['node_modules/', 'dist/', 'build/', '.expo/']
};
