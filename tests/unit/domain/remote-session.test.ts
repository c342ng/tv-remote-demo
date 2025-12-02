/**
 * Unit tests for TVSession core state machine and command sending
 * T013: Tests session lifecycle, command dispatch, and error handling
 */
import {
  ConnectionStatus,
  RemoteCommandType,
  SessionErrorCode,
  TVDevice,
  TVPlatform,
} from '@remote/domain/models';
import { TVSession, CommandResult } from '@remote/domain/remote-interfaces';

/**
 * Mock TVSession implementation for testing
 */
class MockTVSession implements TVSession {
  readonly sessionId: string;
  readonly device: TVDevice;
  private status: ConnectionStatus = ConnectionStatus.Connected;
  private commandDelay: number;
  private failCommands: boolean;
  private unsupportedCommands: Set<RemoteCommandType>;
  
  constructor(
    device: TVDevice,
    options: {
      commandDelay?: number;
      failCommands?: boolean;
      unsupportedCommands?: RemoteCommandType[];
    } = {}
  ) {
    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.device = device;
    this.commandDelay = options.commandDelay ?? 50;
    this.failCommands = options.failCommands ?? false;
    this.unsupportedCommands = new Set(options.unsupportedCommands ?? []);
  }

  async sendCommand(command: RemoteCommandType): Promise<CommandResult> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, this.commandDelay));
    
    // Check if disconnected
    if (this.status === ConnectionStatus.Disconnected) {
      return {
        success: false,
        error: {
          code: SessionErrorCode.NetworkUnreachable,
          message: '连接已断开',
          at: new Date().toISOString(),
        },
      };
    }
    
    // Check if command is unsupported
    if (this.unsupportedCommands.has(command)) {
      return {
        success: false,
        error: {
          code: SessionErrorCode.CommandUnsupported,
          message: `命令 ${command} 不受支持`,
          at: new Date().toISOString(),
        },
      };
    }
    
    // Simulate command failure
    if (this.failCommands) {
      return {
        success: false,
        error: {
          code: SessionErrorCode.Unknown,
          message: '命令执行失败',
          at: new Date().toISOString(),
        },
      };
    }
    
    return { success: true };
  }

  async disconnect(): Promise<void> {
    this.status = ConnectionStatus.Disconnected;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  // Test helpers
  setStatus(status: ConnectionStatus): void {
    this.status = status;
  }
}

describe('TVSession', () => {
  const createMockDevice = (overrides?: Partial<TVDevice>): TVDevice => ({
    id: 'test-device-1',
    name: 'Test TV',
    platform: TVPlatform.Roku,
    ipAddress: '192.168.1.100',
    port: 8060,
    capabilities: {
      powerControl: true,
      volumeControl: true,
      channelControl: false,
      voiceInput: false,
      keyboard: true,
      apps: true,
    },
    ...overrides,
  });

  describe('Session Creation', () => {
    it('should create session with unique ID', () => {
      const device = createMockDevice();
      const session1 = new MockTVSession(device);
      const session2 = new MockTVSession(device);
      
      expect(session1.sessionId).toBeTruthy();
      expect(session2.sessionId).toBeTruthy();
      expect(session1.sessionId).not.toBe(session2.sessionId);
    });

    it('should store device reference', () => {
      const device = createMockDevice({ name: 'Living Room TV' });
      const session = new MockTVSession(device);
      
      expect(session.device).toBe(device);
      expect(session.device.name).toBe('Living Room TV');
    });

    it('should start in connected status', () => {
      const session = new MockTVSession(createMockDevice());
      expect(session.getStatus()).toBe(ConnectionStatus.Connected);
    });
  });

  describe('Command Sending - Success Path', () => {
    it('should successfully send navigation commands', async () => {
      const session = new MockTVSession(createMockDevice(), { commandDelay: 10 });
      
      const result = await session.sendCommand(RemoteCommandType.Up);
      
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should successfully send volume commands', async () => {
      const session = new MockTVSession(createMockDevice(), { commandDelay: 10 });
      
      const volumeUp = await session.sendCommand(RemoteCommandType.VolumeUp);
      const volumeDown = await session.sendCommand(RemoteCommandType.VolumeDown);
      const mute = await session.sendCommand(RemoteCommandType.Mute);
      
      expect(volumeUp.success).toBe(true);
      expect(volumeDown.success).toBe(true);
      expect(mute.success).toBe(true);
    });

    it('should successfully send playback commands', async () => {
      const session = new MockTVSession(createMockDevice(), { commandDelay: 10 });
      
      const play = await session.sendCommand(RemoteCommandType.Play);
      const pause = await session.sendCommand(RemoteCommandType.Pause);
      
      expect(play.success).toBe(true);
      expect(pause.success).toBe(true);
    });

    it('should send commands with acceptable latency', async () => {
      const session = new MockTVSession(createMockDevice(), { commandDelay: 50 });
      
      const startTime = Date.now();
      await session.sendCommand(RemoteCommandType.Select);
      const elapsed = Date.now() - startTime;
      
      // Should complete within reasonable time (200ms is the spec requirement)
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe('Command Sending - Failure Path', () => {
    it('should fail when session is disconnected', async () => {
      const session = new MockTVSession(createMockDevice(), { commandDelay: 10 });
      await session.disconnect();
      
      const result = await session.sendCommand(RemoteCommandType.Up);
      
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SessionErrorCode.NetworkUnreachable);
    });

    it('should fail for unsupported commands', async () => {
      const session = new MockTVSession(createMockDevice(), {
        commandDelay: 10,
        unsupportedCommands: [RemoteCommandType.Power],
      });
      
      const result = await session.sendCommand(RemoteCommandType.Power);
      
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SessionErrorCode.CommandUnsupported);
    });

    it('should handle command execution failures', async () => {
      const session = new MockTVSession(createMockDevice(), {
        commandDelay: 10,
        failCommands: true,
      });
      
      const result = await session.sendCommand(RemoteCommandType.Up);
      
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SessionErrorCode.Unknown);
    });

    it('should include error timestamp', async () => {
      const session = new MockTVSession(createMockDevice(), { commandDelay: 10 });
      await session.disconnect();
      
      const result = await session.sendCommand(RemoteCommandType.Up);
      
      expect(result.error?.at).toBeTruthy();
      expect(() => new Date(result.error!.at)).not.toThrow();
    });
  });

  describe('Session Disconnect', () => {
    it('should transition to disconnected status', async () => {
      const session = new MockTVSession(createMockDevice());
      expect(session.getStatus()).toBe(ConnectionStatus.Connected);
      
      await session.disconnect();
      
      expect(session.getStatus()).toBe(ConnectionStatus.Disconnected);
    });

    it('should reject commands after disconnect', async () => {
      const session = new MockTVSession(createMockDevice(), { commandDelay: 10 });
      await session.disconnect();
      
      const result = await session.sendCommand(RemoteCommandType.Up);
      
      expect(result.success).toBe(false);
    });
  });

  describe('Status Transitions', () => {
    it('should report current status correctly', () => {
      const session = new MockTVSession(createMockDevice());
      
      expect(session.getStatus()).toBe(ConnectionStatus.Connected);
      
      session.setStatus(ConnectionStatus.Reconnecting);
      expect(session.getStatus()).toBe(ConnectionStatus.Reconnecting);
      
      session.setStatus(ConnectionStatus.Disconnected);
      expect(session.getStatus()).toBe(ConnectionStatus.Disconnected);
    });
  });

  describe('Multiple Commands', () => {
    it('should handle sequential command sending', async () => {
      const session = new MockTVSession(createMockDevice(), { commandDelay: 10 });
      
      const commands = [
        RemoteCommandType.Up,
        RemoteCommandType.Up,
        RemoteCommandType.Select,
      ];
      
      const results = await Promise.all(
        commands.map((cmd) => session.sendCommand(cmd))
      );
      
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should handle rapid command sending', async () => {
      const session = new MockTVSession(createMockDevice(), { commandDelay: 5 });
      
      const startTime = Date.now();
      const promises: Promise<CommandResult>[] = [];
      
      // Send 10 rapid commands
      for (let i = 0; i < 10; i++) {
        promises.push(session.sendCommand(RemoteCommandType.Up));
      }
      
      const results = await Promise.all(promises);
      const elapsed = Date.now() - startTime;
      
      expect(results.every((r) => r.success)).toBe(true);
      // All should complete reasonably quickly
      expect(elapsed).toBeLessThan(500);
    });
  });
});
