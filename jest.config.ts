import type {Config} from "jest";

const config: Config = {
	testEnvironment: "node",
	rootDir: ".",
	testMatch: ["<rootDir>/src/**/__tests__/**/*.test.ts"],
	transform: {
		"^.+\\.tsx?$": [
			"ts-jest",
			{
				tsconfig: {allowJs: true},
			},
		],
	},
	moduleNameMapper: {
		"^@/(.*)$": "<rootDir>/src/$1",
		"^.*/config/env(\\.ts)?$": "<rootDir>/src/__tests__/__mocks__/env.ts",
		"^.*/config/logger(\\.ts)?$": "<rootDir>/src/__tests__/__mocks__/logger.ts",
		"^.*/config/database(\\.ts)?$":
			"<rootDir>/src/__tests__/__mocks__/database.ts",
	},
	clearMocks: true,
	collectCoverageFrom: [
		"src/**/*.ts",
		"!src/**/*.d.ts",
		"!src/**/index.ts",
		"!src/docs/**",
		"!src/server.ts",
	],
	coverageThreshold: {
		global: {
			lines: 70,
			functions: 70,
		},
	},
};

export default config;
