module.exports = {
  collectCoverageFrom: [
    'backend/src/**/*.ts',
    'frontend/src/**/*.ts',
    'shared/*/src**/*.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/shared/jest.setup.ts'],
  testPathIgnorePatterns: ['node_modules', 'dist'],
  // emittery ships ESM only, so it has to go through babel like our own code
  transformIgnorePatterns: ['node_modules/(?!emittery/)'],
  moduleNameMapper: {
    '^@remote-mixer/(.+)$': '<rootDir>/shared/$1/src/index.ts',
  },
}
