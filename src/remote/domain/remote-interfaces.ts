/**
 * Abstract interfaces for the TV Remote abstraction layer
 */

import type {
  TVDevice,
  ConnectionStatus,
  RemoteCommandType,
  SessionError,
  TVPlatform,
} from './models';

/** Result of sending a command */
export interface CommandResult {
  success: boolean;
  error?: SessionError;
}

/** Discovery result for a single device */
export interface DiscoveredDevice {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  platform: TVPlatform;
}

/** Options for device discovery */
export interface DiscoveryOptions {
  /** Maximum time to wait for discovery (ms) */
  timeoutMs?: number;
  /** Callback fired immediately when a device is found */
  onDeviceFound?: (device: DiscoveredDevice) => void;
}

/** TV Session: represents an active connection to a device */
export interface TVSession {
  readonly sessionId: string;
  readonly device: TVDevice;

  /** Send a command through the adapter */
  sendCommand(command: RemoteCommandType): Promise<CommandResult>;

  /** Gracefully disconnect */
  disconnect(): Promise<void>;

  /** Current connection status */
  getStatus(): ConnectionStatus;
}

/** Platform adapter: per-platform protocol implementation */
export interface PlatformAdapter {
  /** Platform identifier */
  readonly platform: TVPlatform;

  /** 
   * Discover devices on the local network
   * @param timeoutMs - Maximum time to wait (deprecated, use options.timeoutMs)
   * @param options - Discovery options including real-time callback
   */
  discover(timeoutMs?: number, options?: DiscoveryOptions): Promise<DiscoveredDevice[]>;

  /** Connect to a device and return a session */
  connect(device: TVDevice): Promise<TVSession | null>;

  /** Current connection status */
  getStatus(): ConnectionStatus;
}

/** Discovery service interface */
export interface DiscoveryService {
  /** Start discovering devices (may be platform-specific or aggregated) */
  startDiscovery(): Promise<DiscoveredDevice[]>;

  /** Stop any ongoing discovery */
  stopDiscovery(): void;
}

/** Device manager for multi-device state */
export interface DeviceManager {
  /** Get all saved devices */
  getDevices(): Promise<TVDevice[]>;

  /** Get the currently active device (if any) */
  getActiveDevice(): Promise<TVDevice | null>;

  /** Set active device by ID */
  setActiveDevice(deviceId: string): Promise<void>;

  /** Add or update a device */
  saveDevice(device: TVDevice): Promise<void>;

  /** Remove a device by ID */
  removeDevice(deviceId: string): Promise<void>;

  /** Rename a device */
  renameDevice(deviceId: string, newName: string): Promise<void>;
}
