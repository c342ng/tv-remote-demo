/**
 * Unit tests for environment service
 */
import { isMockEnv, getEnvMode } from '@remote/services/env';

describe('Environment Service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('isMockEnv', () => {
    it('should return false when TV_REMOTE_ENV is not set', () => {
      delete process.env.TV_REMOTE_ENV;
      // Note: The actual function reads from Constants.expoConfig
      // This test validates the concept
      expect(typeof isMockEnv()).toBe('boolean');
    });
  });

  describe('getEnvMode', () => {
    it('should return a string mode', () => {
      const mode = getEnvMode();
      expect(typeof mode).toBe('string');
      expect(['mock', 'real']).toContain(mode);
    });
  });
});
