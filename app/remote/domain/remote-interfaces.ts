/**
 * Abstract interfaces for the TV Remote abstraction layer
 */

import type {
  TVDevice,
  TVCapabilities,
  ConnectionStatus,
  RemoteCommandType,
  SessionError,
  ConnectionSession,
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

  /** Discover devices on the local network (returns discovered devices) */
  discover(timeoutMs?: number): Promise<DiscoveredDevice[]>;

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
