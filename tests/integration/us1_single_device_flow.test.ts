/**
 * Integration tests for US1: Single device flow
 * T014: Validates discover → connect → send command flow using mock adapter
 */
import {
  ConnectionStatus,
  RemoteCommandType,
  SessionErrorCode,
  TVDevice,
  TVPlatform,
} from '@remote/domain/models';
import {
  TVSession,
  CommandResult,
  DiscoveredDevice,
  PlatformAdapter,
} from '@remote/domain/remote-interfaces';

/**
 * Mock TV Session for integration testing
 */
class MockIntegrationSession implements TVSession {
  readonly sessionId: string;
  readonly device: TVDevice;
  private status: ConnectionStatus;
  private commandLog: RemoteCommandType[] = [];

  constructor(device: TVDevice) {
    this.sessionId = `int-session-${Date.now()}`;
    this.device = device;
    this.status = ConnectionStatus.Connected;
  }

  async sendCommand(command: RemoteCommandType): Promise<CommandResult> {
    if (this.status !== ConnectionStatus.Connected) {
      return {
        success: false,
        error: {
          code: SessionErrorCode.NetworkUnreachable,
          message: 'Not connected',
          at: new Date().toISOString(),
        },
      };
    }
    
    this.commandLog.push(command);
    return { success: true };
  }

  async disconnect(): Promise<void> {
    this.status = ConnectionStatus.Disconnected;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getCommandLog(): RemoteCommandType[] {
    return [...this.commandLog];
  }
}

/**
 * Mock Platform Adapter for integration testing
 */
class MockIntegrationAdapter implements PlatformAdapter {
  readonly platform = TVPlatform.Roku;
  private status: ConnectionStatus = ConnectionStatus.Idle;
  private mockDevices: DiscoveredDevice[];
  private activeSession: MockIntegrationSession | null = null;
  private discoveryDelay: number;
  private connectDelay: number;
  private shouldFailConnect: boolean;

  constructor(options: {
    devices?: DiscoveredDevice[];
    discoveryDelay?: number;
    connectDelay?: number;
    shouldFailConnect?: boolean;
  } = {}) {
    this.mockDevices = options.devices ?? [
      {
        id: 'roku-001',
        name: 'Living Room Roku',
        ipAddress: '192.168.1.101',
        port: 8060,
        platform: TVPlatform.Roku,
      },
    ];
    this.discoveryDelay = options.discoveryDelay ?? 100;
    this.connectDelay = options.connectDelay ?? 50;
    this.shouldFailConnect = options.shouldFailConnect ?? false;
  }

  async discover(timeoutMs?: number): Promise<DiscoveredDevice[]> {
    this.status = ConnectionStatus.Discovering;
    
    // Simulate network discovery
    await new Promise((resolve) => 
      setTimeout(resolve, Math.min(this.discoveryDelay, timeoutMs ?? 5000))
    );
    
    this.status = ConnectionStatus.Idle;
    return this.mockDevices;
  }

  async connect(device: TVDevice): Promise<TVSession | null> {
    this.status = ConnectionStatus.Connecting;
    
    // Simulate connection handshake
    await new Promise((resolve) => setTimeout(resolve, this.connectDelay));
    
    if (this.shouldFailConnect) {
      this.status = ConnectionStatus.Unavailable;
      return null;
    }
    
    this.status = ConnectionStatus.Connected;
    this.activeSession = new MockIntegrationSession(device);
    return this.activeSession;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getActiveSession(): MockIntegrationSession | null {
    return this.activeSession;
  }
}

describe('US1: Single Device Flow Integration', () => {
  describe('Complete Flow: Discover → Connect → Control', () => {
    it('should complete full flow with mock Roku device', async () => {
      // 1. Setup adapter with mock device
      const adapter = new MockIntegrationAdapter({
        devices: [
          {
            id: 'roku-test',
            name: 'Test Roku TV',
            ipAddress: '192.168.1.100',
            port: 8060,
            platform: TVPlatform.Roku,
          },
        ],
        discoveryDelay: 50,
        connectDelay: 30,
      });

      // 2. Discover devices
      expect(adapter.getStatus()).toBe(ConnectionStatus.Idle);
      const discovered = await adapter.discover();
      
      expect(discovered).toHaveLength(1);
      expect(discovered[0].name).toBe('Test Roku TV');
      expect(discovered[0].platform).toBe(TVPlatform.Roku);

      // 3. Convert to TVDevice and connect
      const device: TVDevice = {
        id: discovered[0].id,
        name: discovered[0].name,
        platform: discovered[0].platform,
        ipAddress: discovered[0].ipAddress,
        port: discovered[0].port,
        capabilities: {
          powerControl: true,
          volumeControl: true,
          channelControl: false,
          voiceInput: false,
          keyboard: true,
          apps: true,
        },
      };

      const session = await adapter.connect(device);
      
      expect(session).not.toBeNull();
      expect(adapter.getStatus()).toBe(ConnectionStatus.Connected);

      // 4. Send basic commands
      const upResult = await session!.sendCommand(RemoteCommandType.Up);
      expect(upResult.success).toBe(true);

      const selectResult = await session!.sendCommand(RemoteCommandType.Select);
      expect(selectResult.success).toBe(true);

      const volumeResult = await session!.sendCommand(RemoteCommandType.VolumeUp);
      expect(volumeResult.success).toBe(true);

      // 5. Verify command log
      const commandLog = adapter.getActiveSession()!.getCommandLog();
      expect(commandLog).toEqual([
        RemoteCommandType.Up,
        RemoteCommandType.Select,
        RemoteCommandType.VolumeUp,
      ]);

      // 6. Disconnect
      await session!.disconnect();
      expect(session!.getStatus()).toBe(ConnectionStatus.Disconnected);
    });

    it('should handle empty discovery results', async () => {
      const adapter = new MockIntegrationAdapter({
        devices: [],
        discoveryDelay: 50,
      });

      const discovered = await adapter.discover();
      
      expect(discovered).toHaveLength(0);
      expect(adapter.getStatus()).toBe(ConnectionStatus.Idle);
    });

    it('should handle connection failure', async () => {
      const adapter = new MockIntegrationAdapter({
        devices: [
          {
            id: 'roku-fail',
            name: 'Failing Device',
            ipAddress: '192.168.1.200',
            port: 8060,
            platform: TVPlatform.Roku,
          },
        ],
        shouldFailConnect: true,
      });

      const discovered = await adapter.discover();
      expect(discovered).toHaveLength(1);

      const device: TVDevice = {
        id: discovered[0].id,
        name: discovered[0].name,
        platform: discovered[0].platform,
        ipAddress: discovered[0].ipAddress,
        port: discovered[0].port,
        capabilities: {
          powerControl: true,
          volumeControl: true,
          channelControl: false,
          voiceInput: false,
          keyboard: true,
          apps: true,
        },
      };

      const session = await adapter.connect(device);
      
      expect(session).toBeNull();
      expect(adapter.getStatus()).toBe(ConnectionStatus.Unavailable);
    });
  });

  describe('Navigation Commands Flow', () => {
    let adapter: MockIntegrationAdapter;
    let session: TVSession;

    beforeEach(async () => {
      adapter = new MockIntegrationAdapter({
        discoveryDelay: 20,
        connectDelay: 20,
      });
      const discovered = await adapter.discover();
      const device: TVDevice = {
        id: discovered[0].id,
        name: discovered[0].name,
        platform: discovered[0].platform,
        ipAddress: discovered[0].ipAddress,
        port: discovered[0].port,
        capabilities: {
          powerControl: true,
          volumeControl: true,
          channelControl: false,
          voiceInput: false,
          keyboard: true,
          apps: true,
        },
      };
      session = (await adapter.connect(device))!;
    });

    it('should navigate through menu', async () => {
      // Navigate: down → down → right → select
      const commands = [
        RemoteCommandType.Down,
        RemoteCommandType.Down,
        RemoteCommandType.Right,
        RemoteCommandType.Select,
      ];

      for (const cmd of commands) {
        const result = await session.sendCommand(cmd);
        expect(result.success).toBe(true);
      }

      const log = adapter.getActiveSession()!.getCommandLog();
      expect(log).toEqual(commands);
    });

    it('should handle back navigation', async () => {
      await session.sendCommand(RemoteCommandType.Select);
      await session.sendCommand(RemoteCommandType.Back);
      await session.sendCommand(RemoteCommandType.Home);

      const log = adapter.getActiveSession()!.getCommandLog();
      expect(log).toContain(RemoteCommandType.Back);
      expect(log).toContain(RemoteCommandType.Home);
    });
  });

  describe('Playback Commands Flow', () => {
    let adapter: MockIntegrationAdapter;
    let session: TVSession;

    beforeEach(async () => {
      adapter = new MockIntegrationAdapter({
        discoveryDelay: 20,
        connectDelay: 20,
      });
      const discovered = await adapter.discover();
      const device: TVDevice = {
        id: discovered[0].id,
        name: discovered[0].name,
        platform: discovered[0].platform,
        ipAddress: discovered[0].ipAddress,
        port: discovered[0].port,
        capabilities: {
          powerControl: true,
          volumeControl: true,
          channelControl: false,
          voiceInput: false,
          keyboard: true,
          apps: true,
        },
      };
      session = (await adapter.connect(device))!;
    });

    it('should control media playback', async () => {
      const playResult = await session.sendCommand(RemoteCommandType.Play);
      expect(playResult.success).toBe(true);

      const pauseResult = await session.sendCommand(RemoteCommandType.Pause);
      expect(pauseResult.success).toBe(true);
    });

    it('should control volume', async () => {
      // Volume up 3 times
      for (let i = 0; i < 3; i++) {
        const result = await session.sendCommand(RemoteCommandType.VolumeUp);
        expect(result.success).toBe(true);
      }

      // Mute
      const muteResult = await session.sendCommand(RemoteCommandType.Mute);
      expect(muteResult.success).toBe(true);

      const log = adapter.getActiveSession()!.getCommandLog();
      expect(log.filter((c) => c === RemoteCommandType.VolumeUp)).toHaveLength(3);
      expect(log).toContain(RemoteCommandType.Mute);
    });
  });

  describe('Error Recovery Flow', () => {
    it('should report error when sending commands after disconnect', async () => {
      const adapter = new MockIntegrationAdapter({
        discoveryDelay: 20,
        connectDelay: 20,
      });
      const discovered = await adapter.discover();
      const device: TVDevice = {
        id: discovered[0].id,
        name: discovered[0].name,
        platform: discovered[0].platform,
        ipAddress: discovered[0].ipAddress,
        port: discovered[0].port,
        capabilities: {
          powerControl: true,
          volumeControl: true,
          channelControl: false,
          voiceInput: false,
          keyboard: true,
          apps: true,
        },
      };
      const session = (await adapter.connect(device))!;

      // Send a successful command
      const successResult = await session.sendCommand(RemoteCommandType.Up);
      expect(successResult.success).toBe(true);

      // Disconnect
      await session.disconnect();

      // Try to send command after disconnect
      const failResult = await session.sendCommand(RemoteCommandType.Up);
      expect(failResult.success).toBe(false);
      expect(failResult.error?.code).toBe(SessionErrorCode.NetworkUnreachable);
    });
  });

  describe('Multi-device Discovery', () => {
    it('should discover multiple devices on network', async () => {
      const adapter = new MockIntegrationAdapter({
        devices: [
          {
            id: 'roku-001',
            name: 'Living Room Roku',
            ipAddress: '192.168.1.101',
            port: 8060,
            platform: TVPlatform.Roku,
          },
          {
            id: 'roku-002',
            name: 'Bedroom Roku',
            ipAddress: '192.168.1.102',
            port: 8060,
            platform: TVPlatform.Roku,
          },
          {
            id: 'roku-003',
            name: 'Office Roku',
            ipAddress: '192.168.1.103',
            port: 8060,
            platform: TVPlatform.Roku,
          },
        ],
        discoveryDelay: 50,
      });

      const discovered = await adapter.discover();
      
      expect(discovered).toHaveLength(3);
      expect(discovered.map((d) => d.name)).toEqual([
        'Living Room Roku',
        'Bedroom Roku',
        'Office Roku',
      ]);
    });
  });
});
