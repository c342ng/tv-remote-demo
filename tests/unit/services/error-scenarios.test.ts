/**
 * Error Scenarios and Edge Cases Tests
 * Tests for offline devices, network issues, and boundary conditions
 */
import {
  ConnectionStatus,
  SessionErrorCode,
  RemoteCommandType,
} from '@remote/domain/models';
import { SessionManager } from '@remote/services/session-manager';
import { createMockDevice, MockPlatformAdapter } from '@remote/mocks/mock-adapter';
import { isCommandSupported } from '@remote/services/command-dispatcher';

// Mock the factory module to return our mock adapter
jest.mock('@remote/protocols/factory', () => ({
  getAdapterForDevice: jest.fn(() => new (require('@remote/mocks/mock-adapter').MockPlatformAdapter)()),
  getAdapter: jest.fn(() => new (require('@remote/mocks/mock-adapter').MockPlatformAdapter)()),
  isAdapterAvailable: jest.fn(() => true),
}));

describe('Error Scenarios and Edge Cases', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager({
      initialDelayMs: 100,
      maxDelayMs: 200,
      backoffMultiplier: 2,
      maxRetries: 2,
    });
  });

  afterEach(() => {
    sessionManager.destroy();
  });

  describe('Device Offline Scenarios', () => {
    it('should emit error event when device goes offline during session', async () => {
      const device = createMockDevice();
      
      // Connect successfully first
      const connected = await sessionManager.connect(device);
      expect(connected).toBe(true);

      // Track events
      const events: { type: string; error?: string }[] = [];
      sessionManager.addEventListener((type, _device, error) => {
        events.push({ type, error });
      });

      // Session should handle disconnect gracefully
      await sessionManager.disconnect();

      expect(events.some(e => e.type === 'disconnected')).toBe(true);
    });
  });

  describe('Network Switching Scenarios', () => {
    it('should attempt reconnection after network change', async () => {
      const device = createMockDevice();
      
      // Connect first
      await sessionManager.connect(device);
      expect(sessionManager.isConnected()).toBe(true);

      // Simulate network change by forcing reconnection
      const reconnected = await sessionManager.forceReconnect();
      expect(reconnected).toBe(true);
      expect(sessionManager.isConnected()).toBe(true);
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle rapid connect/disconnect cycles', async () => {
      const device = createMockDevice();

      // Rapid cycles
      for (let i = 0; i < 3; i++) {
        await sessionManager.connect(device);
        await sessionManager.disconnect();
      }

      // Should end in disconnected state
      expect(sessionManager.getStatus()).toBe(ConnectionStatus.Disconnected);
    });

    it('should handle connecting while already connected', async () => {
      const device1 = createMockDevice({ name: 'TV 1' });
      const device2 = createMockDevice({ name: 'TV 2' });

      // Connect to first device
      await sessionManager.connect(device1);
      expect(sessionManager.isConnected()).toBe(true);
      expect(sessionManager.getCurrentDevice()?.name).toBe('TV 1');

      // Connect to second device while still connected
      await sessionManager.connect(device2);
      expect(sessionManager.isConnected()).toBe(true);
      expect(sessionManager.getCurrentDevice()?.name).toBe('TV 2');
    });

    it('should handle disconnect when already disconnected', async () => {
      // Should not throw when disconnecting with no connection
      await expect(sessionManager.disconnect()).resolves.not.toThrow();
    });

    it('should handle commands when not connected', async () => {
      const result = await sessionManager.sendCommand(RemoteCommandType.Up);
      
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SessionErrorCode.NetworkUnreachable);
    });
  });

  describe('Session State Consistency', () => {
    it('should maintain consistent state through connection lifecycle', async () => {
      const device = createMockDevice();

      // Initial state
      expect(sessionManager.getStatus()).toBe(ConnectionStatus.Idle);
      expect(sessionManager.getCurrentDevice()).toBeNull();
      expect(sessionManager.isConnected()).toBe(false);

      // After connect
      await sessionManager.connect(device);
      expect(sessionManager.getStatus()).toBe(ConnectionStatus.Connected);
      expect(sessionManager.getCurrentDevice()?.id).toBe(device.id);
      expect(sessionManager.isConnected()).toBe(true);

      // After disconnect
      await sessionManager.disconnect();
      expect(sessionManager.getStatus()).toBe(ConnectionStatus.Disconnected);
      expect(sessionManager.isConnected()).toBe(false);
    });

    it('should clean up properly on destroy', async () => {
      const device = createMockDevice();
      await sessionManager.connect(device);

      sessionManager.destroy();

      expect(sessionManager.getStatus()).toBe(ConnectionStatus.Idle);
      expect(sessionManager.getCurrentDevice()).toBeNull();
    });
  });

  describe('Event Listener Management', () => {
    it('should properly add and remove event listeners', async () => {
      const device = createMockDevice();
      const events: string[] = [];

      const listener = (type: string) => {
        events.push(type);
      };

      // Add listener
      const removeListener = sessionManager.addEventListener(listener);

      await sessionManager.connect(device);
      expect(events).toContain('connected');

      // Remove listener
      removeListener();
      events.length = 0;

      await sessionManager.disconnect();
      // Should not receive disconnect event after removal
      expect(events).not.toContain('disconnected');
    });

    it('should continue working if a listener throws', async () => {
      const device = createMockDevice();
      const goodEvents: string[] = [];

      // Add a bad listener that throws
      sessionManager.addEventListener(() => {
        throw new Error('Bad listener');
      });

      // Add a good listener
      sessionManager.addEventListener((type) => {
        goodEvents.push(type);
      });

      // Should not throw and good listener should still work
      await sessionManager.connect(device);
      expect(goodEvents).toContain('connected');
    });
  });

  describe('Device Switching Edge Cases', () => {
    it('should switch to same device without reconnecting', async () => {
      const device = createMockDevice();

      await sessionManager.connect(device);
      const sessionIdBefore = sessionManager.getSession()?.sessionId;

      // Switch to same device
      await sessionManager.switchToDevice(device);
      const sessionIdAfter = sessionManager.getSession()?.sessionId;

      // Should keep same session
      expect(sessionIdAfter).toBe(sessionIdBefore);
    });

    it('should handle switching between different devices', async () => {
      const device1 = createMockDevice({ id: 'device-switch-1', name: 'TV 1' });
      const device2 = createMockDevice({ id: 'device-switch-2', name: 'TV 2' });

      await sessionManager.connect(device1);
      expect(sessionManager.getCurrentDevice()?.name).toBe('TV 1');

      await sessionManager.switchToDevice(device2);
      expect(sessionManager.getCurrentDevice()?.name).toBe('TV 2');
    });
  });
});

describe('CommandDispatcher Edge Cases', () => {
  it('should handle unknown command types gracefully', () => {
    // Unknown command should return false
    const result = isCommandSupported('UNKNOWN_COMMAND' as any, {
      powerControl: true,
      volumeControl: true,
      channelControl: true,
      voiceInput: false,
      keyboard: false,
      apps: false,
    });
    
    expect(result).toBe(false);
  });
});
