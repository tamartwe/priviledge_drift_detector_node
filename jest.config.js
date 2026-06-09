/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  // Strip .js extensions so ts-jest resolves the actual .ts source files.
  moduleNameMapper: {
    "^(\\.{1,2}/.+)\\.js$": "$1",
  },
  transform: {
    "^.+\\.ts$": ["ts-jest", {
      tsconfig: "./tsconfig.test.json",
    }],
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/index.ts",
    "!src/**/__tests__/**",
  ],
  coverageDirectory: "coverage",
};
