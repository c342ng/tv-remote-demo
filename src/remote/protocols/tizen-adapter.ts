/**
 * Samsung Tizen TV Protocol Adapter
 *
 * Tizen Smart TVs (2016+) use a WebSocket-based protocol
 * The connection uses wss://TV_IP:8002/api/v2/channels/samsung.remote.control
 *
 * Protocol Details:
 * - Port: 8002 (secure WebSocket)
 * - Path: /api/v2/channels/samsung.remote.control
 * - Token-based authentication for pairing
 * - Commands sent as JSON with specific event structure
 *
 * TODO: Full implementation requires Tizen SDK and real device testing
 */

import {
  ConnectionStatus,
  TVDevice,
  TVPlatform,
  RemoteCommandType,
  SessionErrorCode,
} from '../domain/models';
import {
  CommandResult,
  DiscoveredDevice,
  PlatformAdapter,
  TVSession,
} from '../domain/remote-interfaces';
import { discoverDevicesViaSsdp } from '../services/ssdp-discovery';
import { Buffer } from 'buffer';

/** Tizen remote control key codes */
const TIZEN_KEY_CODES: Partial<Record<RemoteCommandType, string>> = {
  [RemoteCommandType.Power]: 'KEY_POWER',
  [RemoteCommandType.VolumeUp]: 'KEY_VOLUP',
  [RemoteCommandType.VolumeDown]: 'KEY_VOLDOWN',
  [RemoteCommandType.Mute]: 'KEY_MUTE',
  [RemoteCommandType.ChannelUp]: 'KEY_CHUP',
  [RemoteCommandType.ChannelDown]: 'KEY_CHDOWN',
  [RemoteCommandType.Up]: 'KEY_UP',
  [RemoteCommandType.Down]: 'KEY_DOWN',
  [RemoteCommandType.Left]: 'KEY_LEFT',
  [RemoteCommandType.Right]: 'KEY_RIGHT',
  [RemoteCommandType.Select]: 'KEY_ENTER',
  [RemoteCommandType.Back]: 'KEY_RETURN',
  [RemoteCommandType.Home]: 'KEY_HOME',
  [RemoteCommandType.Menu]: 'KEY_MENU',
  [RemoteCommandType.PlayPause]: 'KEY_PLAY',
  [RemoteCommandType.FastForward]: 'KEY_FF',
  [RemoteCommandType.Rewind]: 'KEY_REWIND',
  [RemoteCommandType.Info]: 'KEY_INFO',
  [RemoteCommandType.Guide]: 'KEY_GUIDE',
};

/** Tizen WebSocket message structure */
interface TizenMessage {
  method: 'ms.channel.connect' | 'ms.remote.control';
  params: {
    Cmd?: string;
    DataOfCmd?: string;
    Option?: string;
    TypeOfRemote?: string;
    token?: string;
    name?: string;
    event?: string;
    data?: {
        token?: string;
    };
  };
}

const TIZEN_SERVICE_TYPE = 'urn:samsung.com:device:RemoteControlReceiver:1';
const APP_NAME = 'TVRemoteApp';

/**
 * Tizen TV Session implementation
 */
class TizenTVSession implements TVSession {
  readonly sessionId: string;
  readonly device: TVDevice;
  private status: ConnectionStatus = ConnectionStatus.Connecting;
  private token: string | null = null;
  private socket: WebSocket | null = null;

  constructor(device: TVDevice, token?: string) {
    this.sessionId = `tizen-session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.device = device;
    this.token = token ?? null;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const name = Buffer.from(APP_NAME).toString('base64');
        let url = `wss://${this.device.ipAddress}:8002/api/v2/channels/samsung.remote.control?name=${name}`;
        if (this.token) {
            url += `&token=${this.token}`;
        }

        console.log(`[Tizen] Connecting to ${url}`);
        this.socket = new WebSocket(url);

        this.socket.onopen = () => {
          console.log('[Tizen] WebSocket connected');
          // Tizen usually sends a token in the response to connection or we wait for 'ms.channel.connect' response
        };

        this.socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data as string);
            this.handleMessage(message, resolve, reject);
          } catch (e) {
            console.error('[Tizen] Failed to parse message', e);
          }
        };

        this.socket.onerror = (error) => {
          console.error('[Tizen] WebSocket error', error);
          this.status = ConnectionStatus.Disconnected;
          reject(error);
        };

        this.socket.onclose = () => {
          console.log('[Tizen] WebSocket closed');
          this.status = ConnectionStatus.Disconnected;
        };
      } catch (e) {
        this.status = ConnectionStatus.Disconnected;
        reject(e);
      }
    });
  }

  private handleMessage(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    message: any,
    resolve: () => void,
    reject: (reason?: any) => void
  ) {
      if (message.event === 'ms.channel.connect') {
          if (message.data && message.data.token) {
              this.token = message.data.token;
              console.log('[Tizen] Token received:', this.token);
          }
          this.status = ConnectionStatus.Connected;
          console.log('[Tizen] Connected successfully');
          resolve();
      } else if (message.event === 'ms.channel.unauthorized') {
          console.error('[Tizen] Unauthorized');
          this.status = ConnectionStatus.Disconnected;
          reject(new Error('Unauthorized'));
      }
  }

  async sendCommand(command: RemoteCommandType): Promise<CommandResult> {
    if (this.status !== ConnectionStatus.Connected) {
      return {
        success: false,
        error: {
          code: SessionErrorCode.NetworkUnreachable,
          message: 'Session not connected',
          at: new Date().toISOString(),
        },
      };
    }

    const keyCode = TIZEN_KEY_CODES[command];
    if (!keyCode) {
      return {
        success: false,
        error: {
          code: SessionErrorCode.CommandUnsupported,
          message: `Command ${command} not supported on Tizen`,
          at: new Date().toISOString(),
        },
      };
    }

    const payload = {
        method: 'ms.remote.control',
        params: {
            Cmd: 'Click',
            DataOfCmd: keyCode,
            Option: 'false',
            TypeOfRemote: 'SendRemoteKey'
        }
    };

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify(payload));
        return { success: true };
    } else {
        return {
            success: false,
            error: {
                code: SessionErrorCode.NetworkUnreachable,
                message: 'Socket not open',
                at: new Date().toISOString()
            }
        };
    }
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
        this.socket.close();
        this.socket = null;
    }
    this.status = ConnectionStatus.Disconnected;
    console.log(`[Tizen] Session ${this.sessionId} disconnected`);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }
}

/**
 * Tizen Platform Adapter
 *
 * Discovery uses SSDP with Samsung-specific service types:
 * - urn:samsung.com:device:RemoteControlReceiver:1
 * - urn:dial-multiscreen-org:device:dial:1
 */
export class TizenAdapter implements PlatformAdapter {
  readonly platform = TVPlatform.Tizen;
  private status: ConnectionStatus = ConnectionStatus.Idle;

  /**
   * Discover Samsung Tizen TVs on the network
   * Uses SSDP and/or mDNS
   */
  async discover(timeoutMs?: number): Promise<DiscoveredDevice[]> {
    this.status = ConnectionStatus.Discovering;
    try {
        const devices = await discoverDevicesViaSsdp(TIZEN_SERVICE_TYPE, TVPlatform.Tizen, timeoutMs);
        this.status = ConnectionStatus.Idle;
        return devices;
    } catch (e) {
        console.error('[Tizen] Discovery failed', e);
        this.status = ConnectionStatus.Idle;
        return [];
    }
  }

  /**
   * Connect to a Tizen TV
   * Requires secure WebSocket connection and token exchange
   */
  async connect(device: TVDevice): Promise<TVSession | null> {
    this.status = ConnectionStatus.Connecting;

    try {
        const session = new TizenTVSession(device);
        await session.connect();
        this.status = ConnectionStatus.Connected;
        return session;
    } catch (e) {
        console.error('[Tizen] Connection failed', e);
        this.status = ConnectionStatus.Unavailable;
        return null;
    }
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }
}
