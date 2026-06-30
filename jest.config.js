module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  transform: {
    '^.+\\.[tj]s$': 'ts-jest',
  },
  // uuid v14+ ships pure ESM, so it must be transformed instead of ignored.
  transformIgnorePatterns: ['/node_modules/(?!(uuid)/)'],
  // collectCoverage: true,
  // coverageDirectory: 'coverage',
};
