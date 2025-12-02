/**
 * Logger Security Tests
 * Verifies that sensitive data is properly sanitized in logs
 */

// Import the sanitize function for testing (we'll test it indirectly through logger)
import { logger } from '@remote/services/logger';

describe('Logger Security', () => {
  let consoleSpy: jest.SpyInstance;
  let capturedLogs: string[] = [];

  beforeEach(() => {
    capturedLogs = [];
    // Capture console.log output
    consoleSpy = jest.spyOn(console, 'log').mockImplementation((...args) => {
      capturedLogs.push(args.join(' '));
    });
    // Also capture console.error and console.warn
    jest.spyOn(console, 'error').mockImplementation((...args) => {
      capturedLogs.push(args.join(' '));
    });
    jest.spyOn(console, 'warn').mockImplementation((...args) => {
      capturedLogs.push(args.join(' '));
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('IP Address Sanitization', () => {
    it('should mask the last octet of IPv4 addresses in messages', () => {
      logger.system('info', 'Device at 192.168.1.100 connected');

      expect(capturedLogs.length).toBeGreaterThan(0);
      const log = capturedLogs[0];
      expect(log).toContain('192.168.1.***');
      expect(log).not.toContain('192.168.1.100');
    });

    it('should mask IP addresses in payload', () => {
      logger.discovery('info', 'Device found', {
        ipAddress: '10.0.0.50',
        name: 'Test TV',
      });

      expect(capturedLogs.length).toBeGreaterThan(0);
      const log = capturedLogs[0];
      expect(log).toContain('10.0.0.***');
      expect(log).not.toContain('10.0.0.50');
    });

    it('should mask multiple IP addresses', () => {
      logger.system('info', 'Devices: 192.168.1.100 and 192.168.1.200');

      expect(capturedLogs.length).toBeGreaterThan(0);
      const log = capturedLogs[0];
      expect(log).toContain('192.168.1.***');
      expect(log).not.toContain('192.168.1.100');
      expect(log).not.toContain('192.168.1.200');
    });
  });

  describe('Sensitive Key Sanitization', () => {
    it('should redact password fields', () => {
      logger.system('info', 'Auth attempt', {
        password: 'secret123',
        username: 'testuser',
      });

      expect(capturedLogs.length).toBeGreaterThan(0);
      const log = capturedLogs[0];
      expect(log).toContain('[REDACTED]');
      expect(log).not.toContain('secret123');
      expect(log).toContain('testuser');
    });

    it('should redact token fields', () => {
      logger.system('info', 'Session info', {
        token: 'abc123xyz',
        sessionId: 'session-001',
      });

      expect(capturedLogs.length).toBeGreaterThan(0);
      const log = capturedLogs[0];
      expect(log).toContain('[REDACTED]');
      expect(log).not.toContain('abc123xyz');
      expect(log).toContain('session-001');
    });

    it('should redact auth fields', () => {
      logger.system('info', 'Config', {
        auth: 'bearer-token-here',
        url: 'https://api.example.com',
      });

      expect(capturedLogs.length).toBeGreaterThan(0);
      const log = capturedLogs[0];
      expect(log).toContain('[REDACTED]');
      expect(log).not.toContain('bearer-token-here');
    });
  });

  describe('Safe Data Preservation', () => {
    it('should preserve non-sensitive data', () => {
      logger.connection('info', 'Connected to Living Room TV', 'device-123', 'session-456');

      expect(capturedLogs.length).toBeGreaterThan(0);
      const log = capturedLogs[0];
      expect(log).toContain('Living Room TV');
      expect(log).toContain('device-123');
      expect(log).toContain('session-456');
    });

    it('should preserve command types', () => {
      logger.command('info', 'Command sent', 'dev-1', 'sess-1', {
        command: 'POWER_TOGGLE',
      });

      expect(capturedLogs.length).toBeGreaterThan(0);
      const log = capturedLogs[0];
      expect(log).toContain('POWER_TOGGLE');
    });
  });

  describe('Error Logging', () => {
    it('should always log errors regardless of dev mode', () => {
      logger.error('system', 'Critical failure', { error: 'Connection refused' });

      expect(capturedLogs.length).toBeGreaterThan(0);
      const log = capturedLogs[0];
      expect(log).toContain('SYSTEM');
      expect(log).toContain('Critical failure');
    });
  });
});
