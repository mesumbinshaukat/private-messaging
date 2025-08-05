import type { Config } from 'jest';

const config: Config = {
  displayName: 'shared',
  preset: '../../jest.preset.ts',
  testEnvironment: 'node',
  transform: {
    '^.+\.[tj]sx?$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../coverage/packages/shared',
};

export default config;

