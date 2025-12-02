/**
 * Base Platform Adapter
 * Abstract base class for platform-specific protocol implementations
 */
import {
  ConnectionStatus,
  RemoteCommandType,
  SessionErrorCode,
  TVDevice,
  TVPlatform,
} from '../domain/models';
import {
  CommandResult,
  DiscoveredDevice,
  PlatformAdapter,
  TVSession,
} from '../domain/remote-interfaces';

/**
 * Standard error codes for adapter operations
 */
export const AdapterErrorCodes = {
  DISCOVERY_TIMEOUT: 'DISCOVERY_TIMEOUT',
  DISCOVERY_FAILED: 'DISCOVERY_FAILED',
  CONNECTION_REFUSED: 'CONNECTION_REFUSED',
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_FAILED: 'AUTH_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  PROTOCOL_ERROR: 'PROTOCOL_ERROR',
  DEVICE_OFFLINE: 'DEVICE_OFFLINE',
  COMMAND_TIMEOUT: 'COMMAND_TIMEOUT',
} as const;

export type AdapterErrorCode = (typeof AdapterErrorCodes)[keyof typeof AdapterErrorCodes];

/**
 * Adapter error with additional context
 */
export class AdapterError extends Error {
  readonly code: AdapterErrorCode;
  readonly deviceId?: string;
  readonly recoverable: boolean;

  constructor(
    code: AdapterErrorCode,
    message: string,
    options?: { deviceId?: string; recoverable?: boolean }
  ) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    this.deviceId = options?.deviceId;
    this.recoverable = options?.recoverable ?? false;
  }
}

/**
 * Base session implementation with common functionality
 */
export abstract class BaseSession implements TVSession {
  abstract readonly sessionId: string;
  abstract readonly device: TVDevice;

  protected status: ConnectionStatus = ConnectionStatus.Connected;
  protected lastActivityAt: string = new Date().toISOString();

  abstract sendCommand(command: RemoteCommandType): Promise<CommandResult>;
  abstract disconnect(): Promise<void>;

  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Update last activity timestamp
   */
  protected updateActivity(): void {
    this.lastActivityAt = new Date().toISOString();
  }

  /**
   * Create a success result
   */
  protected successResult(): CommandResult {
    return { success: true };
  }

  /**
   * Create an error result
   */
  protected errorResult(code: SessionErrorCode, message: string): CommandResult {
    return {
      success: false,
      error: {
        code,
        message,
        at: new Date().toISOString(),
      },
    };
  }
}

/**
 * Abstract base class for platform adapters
 * Provides common functionality and enforces consistent behavior
 */
export abstract class BasePlatformAdapter implements PlatformAdapter {
  abstract readonly platform: TVPlatform;

  protected status: ConnectionStatus = ConnectionStatus.Idle;
  protected activeSession: TVSession | null = null;

  /**
   * Default discovery timeout in milliseconds
   */
  protected readonly defaultDiscoveryTimeout = 5000;

  /**
   * Default connection timeout in milliseconds
   */
  protected readonly defaultConnectionTimeout = 10000;

  /**
   * Default command timeout in milliseconds
   */
  protected readonly defaultCommandTimeout = 5000;

  /**
   * Perform platform-specific device discovery
   * @param timeoutMs Maximum time to wait for discovery
   */
  abstract discover(timeoutMs?: number): Promise<DiscoveredDevice[]>;

  /**
   * Establish connection to a device
   * @param device Device to connect to
   */
  abstract connect(device: TVDevice): Promise<TVSession | null>;

  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Get currently active session
   */
  getActiveSession(): TVSession | null {
    return this.activeSession;
  }

  /**
   * Transition adapter status
   */
  protected setStatus(status: ConnectionStatus): void {
    this.status = status;
  }

  /**
   * Create a command result from error
   */
  protected createErrorResult(code: SessionErrorCode, message: string): CommandResult {
    return {
      success: false,
      error: {
        code,
        message,
        at: new Date().toISOString(),
      },
    };
  }

  /**
   * Map adapter error to session error code
   */
  protected mapErrorToSessionCode(error: AdapterError): SessionErrorCode {
    switch (error.code) {
      case AdapterErrorCodes.AUTH_FAILED:
      case AdapterErrorCodes.AUTH_REQUIRED:
        return SessionErrorCode.AuthFailed;
      case AdapterErrorCodes.COMMAND_TIMEOUT:
      case AdapterErrorCodes.CONNECTION_TIMEOUT:
      case AdapterErrorCodes.DISCOVERY_TIMEOUT:
        return SessionErrorCode.Timeout;
      case AdapterErrorCodes.NETWORK_ERROR:
      case AdapterErrorCodes.DEVICE_OFFLINE:
      case AdapterErrorCodes.CONNECTION_REFUSED:
        return SessionErrorCode.NetworkUnreachable;
      default:
        return SessionErrorCode.Unknown;
    }
  }

  /**
   * Check if a command is supported by this adapter
   * Default implementation returns true for all standard commands
   */
  isCommandSupported(command: RemoteCommandType): boolean {
    // All standard navigation and basic commands are supported by default
    const standardCommands: RemoteCommandType[] = [
      RemoteCommandType.Up,
      RemoteCommandType.Down,
      RemoteCommandType.Left,
      RemoteCommandType.Right,
      RemoteCommandType.Select,
      RemoteCommandType.Back,
      RemoteCommandType.Home,
    ];
    return standardCommands.includes(command);
  }

  /**
   * Get supported commands for this adapter
   * Subclasses should override to provide platform-specific capabilities
   */
  getSupportedCommands(): RemoteCommandType[] {
    return [
      RemoteCommandType.Up,
      RemoteCommandType.Down,
      RemoteCommandType.Left,
      RemoteCommandType.Right,
      RemoteCommandType.Select,
      RemoteCommandType.Back,
      RemoteCommandType.Home,
    ];
  }
}
