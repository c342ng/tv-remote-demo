/**
 * LG webOS TV Protocol Adapter
 *
 * WebOS TVs use a WebSocket-based protocol called SSAP (Simple Service Access Protocol)
 * The connection uses ws://TV_IP:3000/ and requires a handshake with pairing key
 *
 * SSAP Protocol References:
 * - Port: 3000 (default)
 * - Protocol: wss:// or ws://
 * - Commands are sent as JSON messages
 *
 * TODO: Full implementation requires webOS SDK and real device testing
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
import { discoverDevicesViaSsdp, WEBOS_SERVICE_TYPE } from '../services/ssdp-discovery';

/** WebOS SSAP message structure */
interface SSAPMessage {
  type: 'register' | 'request' | 'response' | 'error';
  id?: string;
  uri?: string;
  payload?: Record<string, unknown>;
}

/** WebOS command URI mappings */
const WEBOS_COMMAND_URIS: Partial<Record<RemoteCommandType, string>> = {
  [RemoteCommandType.Power]: 'ssap://system/turnOff',
  [RemoteCommandType.VolumeUp]: 'ssap://audio/volumeUp',
  [RemoteCommandType.VolumeDown]: 'ssap://audio/volumeDown',
  [RemoteCommandType.Mute]: 'ssap://audio/setMute',
  [RemoteCommandType.ChannelUp]: 'ssap://tv/channelUp',
  [RemoteCommandType.ChannelDown]: 'ssap://tv/channelDown',
  [RemoteCommandType.Up]: 'ssap://com.webos.service.ime/sendKeyInput',
  [RemoteCommandType.Down]: 'ssap://com.webos.service.ime/sendKeyInput',
  [RemoteCommandType.Left]: 'ssap://com.webos.service.ime/sendKeyInput',
  [RemoteCommandType.Right]: 'ssap://com.webos.service.ime/sendKeyInput',
  [RemoteCommandType.Select]: 'ssap://com.webos.service.ime/sendKeyInput',
  [RemoteCommandType.Back]: 'ssap://com.webos.service.ime/sendKeyInput',
  [RemoteCommandType.Home]: 'ssap://system.launcher/open',
  [RemoteCommandType.PlayPause]: 'ssap://media.controls/play',
};

/**
 * WebOS TV Session implementation
 */
class WebOSTVSession implements TVSession {
  readonly sessionId: string;
  readonly device: TVDevice;
  private status: ConnectionStatus = ConnectionStatus.Connecting;
  private pairingKey: string | null = null;
  private socket: WebSocket | null = null;
  private messageIdCounter = 0;

  constructor(device: TVDevice, pairingKey?: string) {
    this.sessionId = `webos-session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.device = device;
    this.pairingKey = pairingKey ?? null;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = `ws://${this.device.ipAddress}:3000`;
        console.log(`[WebOS] Connecting to ${url}`);
        this.socket = new WebSocket(url);

        this.socket.onopen = () => {
          console.log('[WebOS] WebSocket connected');
          this.register();
        };

        this.socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data as string) as SSAPMessage;
            this.handleMessage(message, resolve, reject);
          } catch (e) {
            console.error('[WebOS] Failed to parse message', e);
          }
        };

        this.socket.onerror = (error) => {
          console.error('[WebOS] WebSocket error', error);
          this.status = ConnectionStatus.Disconnected;
          reject(error);
        };

        this.socket.onclose = () => {
          console.log('[WebOS] WebSocket closed');
          this.status = ConnectionStatus.Disconnected;
        };
      } catch (e) {
        this.status = ConnectionStatus.Disconnected;
        reject(e);
      }
    });
  }

  private register() {
    // Simplified registration payload
    const payload = {
      forcePairing: false,
      pairingType: 'PROMPT',
      manifest: {
        manifestVersion: 1,
        appVersion: '1.1',
        signed: {
          created: '20140509',
          appId: 'com.lge.test',
          vendorId: 'com.lge',
          localizedAppNames: {
            '': 'LG Remote App',
            'en-US': 'LG Remote App',
          },
          localizedVendorNames: {
            '': 'LG Electronics',
          },
          permissions: [
            'TEST_SECURE',
            'CONTROL_INPUT_TEXT',
            'CONTROL_MOUSE_AND_KEYBOARD',
            'READ_INSTALLED_APPS',
            'READ_LGE_SDX',
            'READ_CURRENT_CHANNEL',
            'READ_RUNNING_APPS',
            'WRITE_NOTIFICATION_TOAST',
            'POWER',
            'READ_NETWORK_STATE',
            'WRITE_SETTINGS',
            'TV_POWER',
          ],
          serial: '20140509',
        },
        permissions: [
          'TEST_SECURE',
          'CONTROL_INPUT_TEXT',
          'CONTROL_MOUSE_AND_KEYBOARD',
          'READ_INSTALLED_APPS',
          'READ_LGE_SDX',
          'READ_CURRENT_CHANNEL',
          'READ_RUNNING_APPS',
          'WRITE_NOTIFICATION_TOAST',
          'POWER',
          'READ_NETWORK_STATE',
          'WRITE_SETTINGS',
          'TV_POWER',
        ],
        signatures: [
          {
            signatureVersion: 1,
            signature: 'eyJhbGdvcml0aG0iOiJSU0EtU0hBMjU2In0.eyJpbmZvIjp7ImFwcElkIjoiY29tLmxnZS50ZXN0IiwiY3JlYXRlZCI6IjIwMTQwNTA5In0sInZlcnNpb24iOjF9.jH9...',
          },
        ],
      },
    };

    if (this.pairingKey) {
      // @ts-ignore - adding client-key if available
      payload['client-key'] = this.pairingKey;
    }

    this.send({
      type: 'register',
      payload,
    });
  }

  private handleMessage(
    message: SSAPMessage,
    resolve: () => void,
    reject: (reason?: any) => void
  ) {
    if (message.type === 'response' && message.payload && message.payload['client-key']) {
      this.pairingKey = message.payload['client-key'] as string;
      this.status = ConnectionStatus.Connected;
      console.log('[WebOS] Registered successfully, key:', this.pairingKey);
      resolve();
    } else if (message.type === 'error') {
      console.error('[WebOS] Error message:', message);
      // Don't reject immediately on error, might be transient
    } else if (message.type === 'registered') {
        // Some versions send type: 'registered'
        if (message.payload && message.payload['client-key']) {
            this.pairingKey = message.payload['client-key'] as string;
        }
        this.status = ConnectionStatus.Connected;
        console.log('[WebOS] Registered successfully');
        resolve();
    }
  }

  private send(message: SSAPMessage) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      message.id = `msg_${this.messageIdCounter++}`;
      this.socket.send(JSON.stringify(message));
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

    const uri = WEBOS_COMMAND_URIS[command];
    if (!uri) {
      return {
        success: false,
        error: {
          code: SessionErrorCode.CommandUnsupported,
          message: `Command ${command} not supported on webOS`,
          at: new Date().toISOString(),
        },
      };
    }

    this.send({
      type: 'request',
      uri,
    });

    return {
      success: true,
    };
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.status = ConnectionStatus.Disconnected;
    console.log(`[WebOS] Session ${this.sessionId} disconnected`);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }
}

/**
 * WebOS Platform Adapter
 *
 * Discovery uses SSDP (same as Roku) with different service types:
 * - urn:lge-com:service:webos-second-screen:1
 * - urn:dial-multiscreen-org:device:dial:1
 */
export class WebOSAdapter implements PlatformAdapter {
  readonly platform = TVPlatform.WebOS;
  private status: ConnectionStatus = ConnectionStatus.Idle;

  /**
   * Discover LG webOS TVs on the network
   * Uses SSDP to find devices
   */
  async discover(timeoutMs?: number): Promise<DiscoveredDevice[]> {
    this.status = ConnectionStatus.Discovering;
    try {
        const devices = await discoverDevicesViaSsdp(WEBOS_SERVICE_TYPE, TVPlatform.WebOS, timeoutMs);
        this.status = ConnectionStatus.Idle;
        return devices;
    } catch (e) {
        console.error('[WebOS] Discovery failed', e);
        this.status = ConnectionStatus.Idle;
        return [];
    }
  }

  /**
   * Connect to a webOS TV
   * Requires WebSocket connection and pairing handshake
   */
  async connect(device: TVDevice): Promise<TVSession | null> {
    this.status = ConnectionStatus.Connecting;

    try {
        const session = new WebOSTVSession(device);
        await session.connect();
        this.status = ConnectionStatus.Connected;
        return session;
    } catch (e) {
        console.error('[WebOS] Connection failed', e);
        this.status = ConnectionStatus.Unavailable;
        return null;
    }
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }
}
