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
import { getSubnetsToScan, getDeviceNetworkInfo } from '../services/network-utils';
import TcpSocket from 'react-native-tcp-socket';

/** Debug logger for WebOS adapter */
const DEBUG_TAG = '[WebOSAdapter]';
const debug = {
  log: (...args: unknown[]) => console.log(DEBUG_TAG, ...args),
  warn: (...args: unknown[]) => console.warn(DEBUG_TAG, ...args),
  error: (...args: unknown[]) => console.error(DEBUG_TAG, ...args),
};

/** WebOS SSAP port */
const WEBOS_PORT = 3000;
/** Alternative WebOS SSAP secure port */
const WEBOS_SECURE_PORT = 3001;

/** WebOS SSAP message structure */
interface SSAPMessage {
  type: 'register' | 'request' | 'response' | 'error' | 'registered';
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
  // Navigation uses sendEnterKey for select and com.webos.service.ime/sendKeyInput for directions
  [RemoteCommandType.Up]: 'ssap://com.webos.service.ime/sendEnterKey',
  [RemoteCommandType.Down]: 'ssap://com.webos.service.ime/sendEnterKey',
  [RemoteCommandType.Left]: 'ssap://com.webos.service.ime/sendEnterKey',
  [RemoteCommandType.Right]: 'ssap://com.webos.service.ime/sendEnterKey',
  [RemoteCommandType.Select]: 'ssap://com.webos.service.ime/sendEnterKey',
  [RemoteCommandType.Back]: 'ssap://com.webos.service.ime/sendEnterKey',
  [RemoteCommandType.Home]: 'ssap://system.launcher/open',
  [RemoteCommandType.Play]: 'ssap://media.controls/play',
  [RemoteCommandType.Pause]: 'ssap://media.controls/pause',
};

/**
 * WebOS key codes for navigation
 * These are the button names used in the SSAP sendEnterKey payload
 */
const WEBOS_KEY_NAMES: Partial<Record<RemoteCommandType, string>> = {
  [RemoteCommandType.Up]: 'UP',
  [RemoteCommandType.Down]: 'DOWN',
  [RemoteCommandType.Left]: 'LEFT',
  [RemoteCommandType.Right]: 'RIGHT',
  [RemoteCommandType.Select]: 'ENTER',
  [RemoteCommandType.Back]: 'BACK',
  [RemoteCommandType.Home]: 'HOME',
  [RemoteCommandType.Menu]: 'MENU',
  [RemoteCommandType.Info]: 'INFO',
  [RemoteCommandType.Num0]: '0',
  [RemoteCommandType.Num1]: '1',
  [RemoteCommandType.Num2]: '2',
  [RemoteCommandType.Num3]: '3',
  [RemoteCommandType.Num4]: '4',
  [RemoteCommandType.Num5]: '5',
  [RemoteCommandType.Num6]: '6',
  [RemoteCommandType.Num7]: '7',
  [RemoteCommandType.Num8]: '8',
  [RemoteCommandType.Num9]: '9',
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

    // Build message with payload for navigation keys
    const keyName = WEBOS_KEY_NAMES[command];
    if (keyName) {
      // Navigation commands need a payload with the key name
      this.send({
        type: 'request',
        uri,
        payload: { key: keyName },
      });
      debug.log(`Sent webOS key: ${keyName}`);
    } else {
      // Other commands (volume, power, etc.) don't need a payload
      this.send({
        type: 'request',
        uri,
      });
      debug.log(`Sent webOS command: ${uri}`);
    }

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
 * 
 * Also includes port scanning fallback for devices that don't respond to SSDP.
 */
export class WebOSAdapter implements PlatformAdapter {
  readonly platform = TVPlatform.WebOS;
  private status: ConnectionStatus = ConnectionStatus.Idle;

  /**
   * Discover LG webOS TVs on the network
   * Uses SSDP first, then falls back to port scanning if no devices found
   */
  async discover(
    timeoutMs?: number,
    options?: { onDeviceFound?: (device: DiscoveredDevice) => void }
  ): Promise<DiscoveredDevice[]> {
    this.status = ConnectionStatus.Discovering;
    const discovered: DiscoveredDevice[] = [];
    const foundIps = new Set<string>();
    const onDeviceFound = options?.onDeviceFound;

    // Helper to add device and trigger callback
    const addDevice = (device: DiscoveredDevice) => {
      if (!foundIps.has(device.ipAddress)) {
        foundIps.add(device.ipAddress);
        discovered.push(device);
        debug.log(`Found webOS device: ${device.name} at ${device.ipAddress}`);
        
        if (onDeviceFound) {
          try {
            onDeviceFound(device);
          } catch (err) {
            debug.warn('onDeviceFound callback error:', err);
          }
        }
      }
    };

    try {
      // Phase 1: Try SSDP discovery (fast, reliable when it works)
      debug.log('Phase 1: SSDP discovery...');
      const ssdpDevices = await discoverDevicesViaSsdp(WEBOS_SERVICE_TYPE, TVPlatform.WebOS, timeoutMs);
      
      for (const device of ssdpDevices) {
        // Validate the device is actually a webOS TV
        const isWebOS = await this.validateWebOSDevice(device.ipAddress, 2000);
        if (isWebOS) {
          addDevice(device);
        } else {
          debug.log(`Skipping non-webOS device at ${device.ipAddress}`);
        }
      }

      // Phase 2: If no SSDP results, try port scanning fallback
      if (discovered.length === 0) {
        debug.log('Phase 2: Port scanning fallback...');
        const portScanDevices = await this.discoverViaPortScan(timeoutMs ?? 5000, foundIps);
        for (const device of portScanDevices) {
          addDevice(device);
        }
      }

      this.status = ConnectionStatus.Idle;
      return discovered;
    } catch (e) {
      console.error('[WebOS] Discovery failed', e);
      this.status = ConnectionStatus.Idle;
      return discovered;
    }
  }

  /**
   * Discover webOS devices via port scanning
   * Scans port 3000 (SSAP) and validates via WebSocket handshake
   */
  private async discoverViaPortScan(
    timeoutMs: number,
    excludeIps: Set<string>
  ): Promise<DiscoveredDevice[]> {
    const devices: DiscoveredDevice[] = [];

    // Get network info
    const networkInfo = await getDeviceNetworkInfo();
    const deviceIp = networkInfo?.ipAddress;

    // Get subnets to scan
    const subnetsToScan = await getSubnetsToScan();
    debug.log(`Port scanning ${subnetsToScan.length} subnets for webOS devices...`);

    // Group by priority
    const priorityGroups = new Map<number, typeof subnetsToScan>();
    for (const subnet of subnetsToScan) {
      const group = priorityGroups.get(subnet.priority) || [];
      group.push(subnet);
      priorityGroups.set(subnet.priority, group);
    }

    const priorities = Array.from(priorityGroups.keys()).sort((a, b) => a - b);
    const probeTimeout = Math.min(timeoutMs / 2, 1500);

    for (const priority of priorities) {
      const tierSubnets = priorityGroups.get(priority) || [];
      debug.log(`Scanning priority ${priority} subnets...`);

      const scanPromises: Promise<void>[] = [];

      for (const subnet of tierSubnets) {
        for (let i = 1; i <= 254; i++) {
          const ip = `${subnet.prefix}${i}`;

          if (ip === deviceIp) continue;
          if (excludeIps.has(ip)) continue;

          scanPromises.push(
            this.probeWebOSDevice(ip, probeTimeout)
              .then((device) => {
                if (device) {
                  devices.push(device);
                  debug.log(`✓ Found webOS device at ${ip}`);
                }
              })
              .catch(() => {
                // Silently ignore probe failures
              })
          );
        }
      }

      debug.log(`  Probing ${scanPromises.length} addresses...`);
      await Promise.all(scanPromises);

      // Stop early if we found devices
      if (devices.length > 0) {
        debug.log(`Found ${devices.length} device(s), stopping port scan`);
        break;
      }
    }

    return devices;
  }

  /**
   * Probe a single IP for webOS device
   * 
   * Steps:
   * 1. Check if port 3000 is open
   * 2. Validate it's a webOS TV via WebSocket handshake
   */
  private async probeWebOSDevice(
    ip: string,
    timeoutMs: number
  ): Promise<DiscoveredDevice | null> {
    // Step 1: Check if port 3000 is open
    const isPortOpen = await this.checkWebOSPort(ip, timeoutMs);
    if (!isPortOpen) {
      return null;
    }

    // Step 2: Validate via WebSocket handshake
    const isWebOS = await this.validateWebOSDevice(ip, timeoutMs);
    if (!isWebOS) {
      debug.log(`Port 3000 open at ${ip} but not a webOS TV`);
      return null;
    }

    return {
      id: `webos-${ip}`,
      name: `LG TV (${ip})`,
      ipAddress: ip,
      port: WEBOS_PORT,
      platform: TVPlatform.WebOS,
    };
  }

  /**
   * Check if webOS SSAP port (3000) is open
   */
  private async checkWebOSPort(ip: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let resolved = false;
      const safeResolve = (value: boolean) => {
        if (!resolved) {
          resolved = true;
          resolve(value);
        }
      };

      try {
        const socket = TcpSocket.createConnection(
          { host: ip, port: WEBOS_PORT },
          () => {
            // Connection successful - port is open
            socket.destroy();
            safeResolve(true);
          }
        );

        socket.on('error', () => {
          socket.destroy();
          safeResolve(false);
        });

        socket.on('close', () => {
          safeResolve(false);
        });

        // Fallback timeout
        setTimeout(() => {
          socket.destroy();
          safeResolve(false);
        }, timeoutMs);
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Validate that an IP is a webOS TV via WebSocket handshake
   * 
   * This distinguishes LG TVs from other services on port 3000 (like Grafana).
   * LG webOS TVs respond to WebSocket upgrade requests with specific headers.
   */
  private async validateWebOSDevice(ip: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let resolved = false;
      const safeResolve = (value: boolean) => {
        if (!resolved) {
          resolved = true;
          resolve(value);
        }
      };

      try {
        const socket = TcpSocket.createConnection(
          { host: ip, port: WEBOS_PORT },
          () => {
            // Send WebSocket upgrade request
            // Generate a random base64 key using btoa (available in React Native)
            const randomBytes = Array.from({ length: 16 }, () => 
              Math.floor(Math.random() * 256)
            );
            const key = btoa(String.fromCharCode(...randomBytes));
            const request = [
              'GET / HTTP/1.1',
              `Host: ${ip}:${WEBOS_PORT}`,
              'Upgrade: websocket',
              'Connection: Upgrade',
              `Sec-WebSocket-Key: ${key}`,
              'Sec-WebSocket-Version: 13',
              '',
              '',
            ].join('\r\n');

            socket.write(request);
          }
        );

        socket.on('data', (data: string | Buffer) => {
          const response = typeof data === 'string' ? data : data.toString();
          socket.destroy();

          // Check for WebSocket upgrade response (101 Switching Protocols)
          // webOS TVs respond with 101, while HTTP servers like Grafana respond with 30x or 200
          if (response.includes('101') && response.toLowerCase().includes('upgrade')) {
            debug.log(`Validated webOS TV at ${ip} (WebSocket upgrade accepted)`);
            safeResolve(true);
          } else if (response.includes('HTTP/1.') && (response.includes('200') || response.includes('30') || response.includes('40'))) {
            // Regular HTTP server (not webOS)
            debug.log(`Not webOS at ${ip} (HTTP response: ${response.substring(0, 50)}...)`);
            safeResolve(false);
          } else {
            // Unknown response, could be webOS
            debug.log(`Unknown response from ${ip}: ${response.substring(0, 100)}`);
            safeResolve(false);
          }
        });

        socket.on('error', () => {
          socket.destroy();
          safeResolve(false);
        });

        socket.on('close', () => {
          safeResolve(false);
        });

        // Timeout
        setTimeout(() => {
          socket.destroy();
          safeResolve(false);
        }, timeoutMs);
      } catch {
        resolve(false);
      }
    });
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
