/**
 * Session Manager
 * Manages TV sessions with automatic reconnection strategy
 */
import { ConnectionStatus, RemoteCommandType, SessionErrorCode, TVDevice } from '../domain/models';
import { CommandResult, PlatformAdapter, TVSession } from '../domain/remote-interfaces';
import { logger } from './logger';
import { getAdapterForDevice } from '../protocols/factory';

/**
 * Reconnection configuration
 */
interface ReconnectionConfig {
  /** Initial retry delay in ms */
  initialDelayMs: number;
  /** Maximum retry delay in ms */
  maxDelayMs: number;
  /** Delay multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Maximum number of retry attempts */
  maxRetries: number;
}

const DEFAULT_RECONNECTION_CONFIG: ReconnectionConfig = {
  initialDelayMs: 2000, // 2s
  maxDelayMs: 8000, // 8s
  backoffMultiplier: 2,
  maxRetries: 3,
};

/**
 * Session state for tracking
 */
interface SessionState {
  device: TVDevice;
  session: TVSession | null;
  adapter: PlatformAdapter | null;
  status: ConnectionStatus;
  retryCount: number;
  lastError: string | null;
  reconnectTimeoutId: ReturnType<typeof setTimeout> | null;
}

/**
 * Session event types
 */
export type SessionEventType =
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'reconnect_failed'
  | 'error';

/**
 * Session event listener
 */
export type SessionEventListener = (
  eventType: SessionEventType,
  device: TVDevice,
  error?: string
) => void;

/**
 * Session Manager - manages TV session lifecycle
 */
export class SessionManager {
  private state: SessionState | null = null;
  private config: ReconnectionConfig;
  private eventListeners: SessionEventListener[] = [];

  constructor(config?: Partial<ReconnectionConfig>) {
    this.config = { ...DEFAULT_RECONNECTION_CONFIG, ...config };
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return this.state?.status ?? ConnectionStatus.Idle;
  }

  /**
   * Get current device
   */
  getCurrentDevice(): TVDevice | null {
    return this.state?.device ?? null;
  }

  /**
   * Get current session
   */
  getSession(): TVSession | null {
    return this.state?.session ?? null;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state?.status === ConnectionStatus.Connected && this.state.session !== null;
  }

  /**
   * Add event listener
   */
  addEventListener(listener: SessionEventListener): () => void {
    this.eventListeners.push(listener);
    return () => {
      const index = this.eventListeners.indexOf(listener);
      if (index >= 0) {
        this.eventListeners.splice(index, 1);
      }
    };
  }

  /**
   * Emit event to all listeners
   */
  private emitEvent(type: SessionEventType, device: TVDevice, error?: string): void {
    for (const listener of this.eventListeners) {
      try {
        listener(type, device, error);
      } catch (e) {
        logger.error('system', 'Event listener error', { error: String(e) });
      }
    }
  }

  /**
   * Connect to a device
   */
  async connect(device: TVDevice): Promise<boolean> {
    // Disconnect existing session if any
    if (this.state?.session) {
      await this.disconnect();
    }

    // Initialize state
    this.state = {
      device,
      session: null,
      adapter: null,
      status: ConnectionStatus.Connecting,
      retryCount: 0,
      lastError: null,
      reconnectTimeoutId: null,
    };

    logger.connection('info', `Connecting to ${device.name}`, device.id);

    try {
      // Get appropriate adapter for device
      const adapter = getAdapterForDevice(device);
      if (!adapter) {
        throw new Error(`No adapter available for platform: ${device.platform}`);
      }

      this.state.adapter = adapter;

      // Attempt connection
      const session = await adapter.connect(device);

      if (!session) {
        throw new Error('Connection failed: no session returned');
      }

      // Success
      this.state.session = session;
      this.state.status = ConnectionStatus.Connected;
      this.state.retryCount = 0;
      this.state.lastError = null;

      logger.connection('info', `Connected to ${device.name}`, device.id, session.sessionId);
      this.emitEvent('connected', device);

      return true;
    } catch (error) {
      const errorMessage = String(error);
      this.state.lastError = errorMessage;
      this.state.status = ConnectionStatus.Unavailable;

      logger.connection('error', `Connection failed: ${errorMessage}`, device.id);
      this.emitEvent('error', device, errorMessage);

      return false;
    }
  }

  /**
   * Disconnect from current device
   */
  async disconnect(): Promise<void> {
    if (!this.state) return;

    // Cancel any pending reconnection
    this.cancelReconnection();

    const { device, session } = this.state;

    if (session) {
      try {
        await session.disconnect();
        logger.connection('info', 'Disconnected', device.id);
      } catch (error) {
        logger.connection('warn', `Disconnect error: ${error}`, device.id);
      }
    }

    this.state.status = ConnectionStatus.Disconnected;
    this.state.session = null;
    this.emitEvent('disconnected', device);
  }

  /**
   * Send a command through the current session
   */
  async sendCommand(command: RemoteCommandType): Promise<CommandResult> {
    if (!this.state?.session || this.state.status !== ConnectionStatus.Connected) {
      return {
        success: false,
        error: {
          code: SessionErrorCode.NetworkUnreachable,
          message: '未连接到设备',
          at: new Date().toISOString(),
        },
      };
    }

    try {
      const result = await this.state.session.sendCommand(command);

      // Check if we need to trigger reconnection
      if (!result.success && result.error?.code === SessionErrorCode.NetworkUnreachable) {
        this.scheduleReconnection();
      }

      return result;
    } catch (error) {
      logger.command('error', `Command error: ${error}`, this.state.device.id);

      // Trigger reconnection on error
      this.scheduleReconnection();

      return {
        success: false,
        error: {
          code: SessionErrorCode.Unknown,
          message: String(error),
          at: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnection(): void {
    if (!this.state || this.state.status === ConnectionStatus.Reconnecting) {
      return;
    }

    // Check retry limit
    if (this.state.retryCount >= this.config.maxRetries) {
      logger.connection('error', 'Max reconnection attempts reached', this.state.device.id);
      this.state.status = ConnectionStatus.Unavailable;
      this.emitEvent('reconnect_failed', this.state.device);
      return;
    }

    this.state.status = ConnectionStatus.Reconnecting;
    this.state.retryCount++;

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.config.initialDelayMs *
        Math.pow(this.config.backoffMultiplier, this.state.retryCount - 1),
      this.config.maxDelayMs
    );

    logger.connection(
      'info',
      `Scheduling reconnection in ${delay}ms (attempt ${this.state.retryCount}/${this.config.maxRetries})`,
      this.state.device.id
    );

    this.emitEvent('reconnecting', this.state.device);

    this.state.reconnectTimeoutId = setTimeout(() => {
      this.attemptReconnection();
    }, delay);
  }

  /**
   * Attempt to reconnect
   */
  private async attemptReconnection(): Promise<void> {
    if (!this.state || !this.state.adapter) {
      return;
    }

    const { device, adapter } = this.state;

    logger.connection(
      'info',
      `Attempting reconnection (${this.state.retryCount}/${this.config.maxRetries})`,
      device.id
    );

    try {
      const session = await adapter.connect(device);

      if (!session) {
        throw new Error('Reconnection failed: no session returned');
      }

      // Success
      this.state.session = session;
      this.state.status = ConnectionStatus.Connected;
      this.state.retryCount = 0;
      this.state.lastError = null;

      logger.connection('info', 'Reconnection successful', device.id, session.sessionId);
      this.emitEvent('connected', device);
    } catch (error) {
      const errorMessage = String(error);
      this.state.lastError = errorMessage;

      logger.connection('warn', `Reconnection failed: ${errorMessage}`, device.id);

      // Schedule another attempt if under limit
      if (this.state.retryCount < this.config.maxRetries) {
        this.scheduleReconnection();
      } else {
        this.state.status = ConnectionStatus.Unavailable;
        this.emitEvent('reconnect_failed', device);
      }
    }
  }

  /**
   * Cancel pending reconnection
   */
  private cancelReconnection(): void {
    if (this.state?.reconnectTimeoutId) {
      clearTimeout(this.state.reconnectTimeoutId);
      this.state.reconnectTimeoutId = null;
    }
  }

  /**
   * Force immediate reconnection attempt
   */
  async forceReconnect(): Promise<boolean> {
    if (!this.state) {
      return false;
    }

    this.cancelReconnection();
    this.state.retryCount = 0;

    return this.connect(this.state.device);
  }

  /**
   * Switch to a different device
   * Disconnects from current device (if any) and connects to the new device
   *
   * @param device - The new device to connect to
   * @returns Promise<boolean> - True if switch was successful
   */
  async switchToDevice(device: TVDevice): Promise<boolean> {
    const currentDeviceId = this.state?.device?.id;

    // If switching to the same device and already connected, just return success
    if (currentDeviceId === device.id && this.isConnected()) {
      logger.connection('info', `Already connected to ${device.name}`, device.id);
      return true;
    }

    // If there's a current session, disconnect first
    if (this.state?.session) {
      logger.connection('info', `Switching from ${this.state.device.name} to ${device.name}`);
      await this.disconnect();
    }

    // Connect to the new device
    return this.connect(device);
  }

  /**
   * Check if currently connected to a specific device
   *
   * @param deviceId - The device ID to check
   * @returns boolean - True if connected to the specified device
   */
  isConnectedTo(deviceId: string): boolean {
    return this.state?.device?.id === deviceId && this.isConnected();
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.cancelReconnection();
    this.eventListeners = [];
    if (this.state?.session) {
      this.state.session.disconnect().catch(() => {});
    }
    this.state = null;
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();

// Export class for testing
export { SessionManager as SessionManagerClass };
