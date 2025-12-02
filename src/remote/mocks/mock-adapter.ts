/**
 * Mock Platform Adapter for testing
 * Provides simulated TV device behavior without network access
 */
import {
  ConnectionStatus,
  RemoteCommandType,
  SessionErrorCode,
  TVDevice,
  TVPlatform,
} from '@remote/domain/models';
import {
  CommandResult,
  DiscoveredDevice,
  PlatformAdapter,
  TVSession,
} from '@remote/domain/remote-interfaces';

/**
 * Configuration for mock behavior
 */
export interface MockAdapterConfig {
  /** Simulated discovery delay in ms */
  discoveryDelay?: number;
  /** Simulated connection delay in ms */
  connectDelay?: number;
  /** Simulated command execution delay in ms */
  commandDelay?: number;
  /** Whether connect should fail */
  shouldFailConnect?: boolean;
  /** Commands that should fail */
  failingCommands?: RemoteCommandType[];
  /** Commands that are unsupported */
  unsupportedCommands?: RemoteCommandType[];
  /** Pre-defined mock devices */
  mockDevices?: DiscoveredDevice[];
}

const DEFAULT_MOCK_DEVICES: DiscoveredDevice[] = [
  {
    id: 'mock-roku-001',
    name: '模拟 Roku 设备',
    ipAddress: '192.168.1.100',
    port: 8060,
    platform: TVPlatform.Roku,
  },
  {
    id: 'mock-androidtv-001',
    name: '模拟 Android TV',
    ipAddress: '192.168.1.101',
    port: 5555,
    platform: TVPlatform.AndroidTV,
  },
];

/**
 * Mock TV Session implementation
 */
export class MockTVSession implements TVSession {
  readonly sessionId: string;
  readonly device: TVDevice;
  private status: ConnectionStatus = ConnectionStatus.Connected;
  private commandLog: { command: RemoteCommandType; timestamp: string }[] = [];
  private config: Required<
    Pick<MockAdapterConfig, 'commandDelay' | 'failingCommands' | 'unsupportedCommands'>
  >;

  constructor(device: TVDevice, config?: Partial<MockAdapterConfig>) {
    this.sessionId = `mock-session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.device = device;
    this.config = {
      commandDelay: config?.commandDelay ?? 50,
      failingCommands: config?.failingCommands ?? [],
      unsupportedCommands: config?.unsupportedCommands ?? [],
    };
  }

  async sendCommand(command: RemoteCommandType): Promise<CommandResult> {
    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, this.config.commandDelay));

    // Check connection status
    if (this.status !== ConnectionStatus.Connected) {
      return {
        success: false,
        error: {
          code: SessionErrorCode.NetworkUnreachable,
          message: '设备未连接',
          at: new Date().toISOString(),
        },
      };
    }

    // Check if command is unsupported
    if (this.config.unsupportedCommands.includes(command)) {
      return {
        success: false,
        error: {
          code: SessionErrorCode.CommandUnsupported,
          message: `命令 ${command} 不受支持`,
          at: new Date().toISOString(),
        },
      };
    }

    // Check if command should fail
    if (this.config.failingCommands.includes(command)) {
      return {
        success: false,
        error: {
          code: SessionErrorCode.Unknown,
          message: `命令 ${command} 执行失败`,
          at: new Date().toISOString(),
        },
      };
    }

    // Log successful command
    this.commandLog.push({
      command,
      timestamp: new Date().toISOString(),
    });

    if (__DEV__) {
      console.log(`[MockSession] Command sent: ${command}`);
    }

    return { success: true };
  }

  async disconnect(): Promise<void> {
    this.status = ConnectionStatus.Disconnected;
    if (__DEV__) {
      console.log(`[MockSession] Disconnected: ${this.sessionId}`);
    }
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Test helpers
  // ─────────────────────────────────────────────────────────────────────────

  /** Get command history */
  getCommandLog(): { command: RemoteCommandType; timestamp: string }[] {
    return [...this.commandLog];
  }

  /** Simulate connection loss */
  simulateDisconnect(): void {
    this.status = ConnectionStatus.Disconnected;
  }

  /** Simulate reconnection */
  simulateReconnect(): void {
    this.status = ConnectionStatus.Connected;
  }

  /** Set status (for testing) */
  setStatus(status: ConnectionStatus): void {
    this.status = status;
  }
}

/**
 * Mock Platform Adapter
 * Simulates TV platform behavior for testing without real devices
 */
export class MockPlatformAdapter implements PlatformAdapter {
  readonly platform: TVPlatform;
  private status: ConnectionStatus = ConnectionStatus.Idle;
  private config: Required<MockAdapterConfig>;
  private activeSession: MockTVSession | null = null;
  private discoveryHistory: { timestamp: string; deviceCount: number }[] = [];

  constructor(platform: TVPlatform = TVPlatform.Roku, config?: MockAdapterConfig) {
    this.platform = platform;
    this.config = {
      discoveryDelay: config?.discoveryDelay ?? 500,
      connectDelay: config?.connectDelay ?? 200,
      commandDelay: config?.commandDelay ?? 50,
      shouldFailConnect: config?.shouldFailConnect ?? false,
      failingCommands: config?.failingCommands ?? [],
      unsupportedCommands: config?.unsupportedCommands ?? [],
      mockDevices: config?.mockDevices ?? DEFAULT_MOCK_DEVICES,
    };
  }

  async discover(timeoutMs?: number): Promise<DiscoveredDevice[]> {
    this.status = ConnectionStatus.Discovering;
    if (__DEV__) {
      console.log(`[MockAdapter] Starting discovery...`);
    }

    // Simulate discovery delay
    const delay = Math.min(this.config.discoveryDelay, timeoutMs ?? 5000);
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Filter devices by platform
    const devices = this.config.mockDevices.filter((d) => d.platform === this.platform);

    this.status = ConnectionStatus.Idle;
    this.discoveryHistory.push({
      timestamp: new Date().toISOString(),
      deviceCount: devices.length,
    });

    if (__DEV__) {
      console.log(`[MockAdapter] Discovery complete: found ${devices.length} devices`);
    }
    return devices;
  }

  async connect(device: TVDevice): Promise<TVSession | null> {
    this.status = ConnectionStatus.Connecting;
    if (__DEV__) {
      console.log(`[MockAdapter] Connecting to ${device.name}...`);
    }

    // Simulate connection delay
    await new Promise((resolve) => setTimeout(resolve, this.config.connectDelay));

    // Check if connection should fail
    if (this.config.shouldFailConnect) {
      this.status = ConnectionStatus.Unavailable;
      if (__DEV__) {
        console.log(`[MockAdapter] Connection failed`);
      }
      return null;
    }

    // Create session
    this.status = ConnectionStatus.Connected;
    this.activeSession = new MockTVSession(device, {
      commandDelay: this.config.commandDelay,
      failingCommands: this.config.failingCommands,
      unsupportedCommands: this.config.unsupportedCommands,
    });

    if (__DEV__) {
      console.log(`[MockAdapter] Connected: ${this.activeSession.sessionId}`);
    }
    return this.activeSession;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Test helpers
  // ─────────────────────────────────────────────────────────────────────────

  /** Get active session */
  getActiveSession(): MockTVSession | null {
    return this.activeSession;
  }

  /** Get discovery history */
  getDiscoveryHistory(): { timestamp: string; deviceCount: number }[] {
    return [...this.discoveryHistory];
  }

  /** Reset adapter state */
  reset(): void {
    this.status = ConnectionStatus.Idle;
    this.activeSession = null;
    this.discoveryHistory = [];
  }

  /** Update mock devices */
  setMockDevices(devices: DiscoveredDevice[]): void {
    this.config.mockDevices = devices;
  }

  /** Set connection failure mode */
  setConnectionFailure(shouldFail: boolean): void {
    this.config.shouldFailConnect = shouldFail;
  }
}

/**
 * Create a mock adapter with default configuration
 */
export function createMockAdapter(
  platform: TVPlatform = TVPlatform.Roku,
  config?: MockAdapterConfig
): MockPlatformAdapter {
  return new MockPlatformAdapter(platform, config);
}

/**
 * Create a mock device for testing
 */
export function createMockDevice(overrides?: Partial<TVDevice>): TVDevice {
  return {
    id: `mock-device-${Date.now()}`,
    name: '测试设备',
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
  };
}
