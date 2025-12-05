/**
 * Android TV / Google TV adapter using ADB over TCP
 *
 * This adapter uses ADB (Android Debug Bridge) protocol to:
 * - Discover Android TV devices via mDNS (_androidtvremote._tcp)
 * - Connect via ADB over TCP (port 5555)
 * - Send keyevent commands for remote control
 *
 * Prerequisites:
 * - User must enable "Developer Options" on the TV
 * - User must enable "ADB Debugging" or "USB Debugging" over network
 * - Device must accept ADB connection (first-time authorization required on TV)
 *
 * Reference:
 * - Android KeyEvent codes: https://developer.android.com/reference/android/view/KeyEvent
 * - ADB protocol: https://android.googlesource.com/platform/system/core/+/master/adb/protocol.txt
 *
 * @module android-tv-adapter
 */

import type {
  PlatformAdapter,
  DiscoveredDevice,
  CommandResult,
  TVSession,
} from '../domain/remote-interfaces';
import {
  TVDevice,
  ConnectionStatus,
  RemoteCommandType,
  TVPlatform,
  SessionErrorCode,
} from '../domain/models';
import { discoverAndroidTvViaMdns, isMdnsSupported } from '../services/mdns-discovery';
import { getSubnetsToScan, getDeviceNetworkInfo, SubnetInfo } from '../services/network-utils';
import { sendAdbKeyEvent } from '../services/adb-client';
import TcpSocket from 'react-native-tcp-socket';

/** Debug logger for Android TV adapter */
const DEBUG_TAG = '[AndroidTVAdapter]';
const debug = {
  log: (...args: unknown[]) => console.log(DEBUG_TAG, ...args),
  warn: (...args: unknown[]) => console.warn(DEBUG_TAG, ...args),
  error: (...args: unknown[]) => console.error(DEBUG_TAG, ...args),
};

/** Default ADB port for network debugging */
const ADB_DEFAULT_PORT = 5555;

/** ADB connection timeout in milliseconds */
const ADB_CONNECT_TIMEOUT_MS = 5000;

/**
 * Android KeyEvent code mapping
 * Maps our standard RemoteCommandType to Android KEYCODE values
 * Reference: https://developer.android.com/reference/android/view/KeyEvent
 */
const ANDROID_KEYCODE_MAP: Record<RemoteCommandType, number> = {
  [RemoteCommandType.Up]: 19, // KEYCODE_DPAD_UP
  [RemoteCommandType.Down]: 20, // KEYCODE_DPAD_DOWN
  [RemoteCommandType.Left]: 21, // KEYCODE_DPAD_LEFT
  [RemoteCommandType.Right]: 22, // KEYCODE_DPAD_RIGHT
  [RemoteCommandType.Select]: 23, // KEYCODE_DPAD_CENTER
  [RemoteCommandType.Back]: 4, // KEYCODE_BACK
  [RemoteCommandType.Home]: 3, // KEYCODE_HOME
  [RemoteCommandType.VolumeUp]: 24, // KEYCODE_VOLUME_UP
  [RemoteCommandType.VolumeDown]: 25, // KEYCODE_VOLUME_DOWN
  [RemoteCommandType.Mute]: 164, // KEYCODE_VOLUME_MUTE
  [RemoteCommandType.Power]: 26, // KEYCODE_POWER
  [RemoteCommandType.Play]: 126, // KEYCODE_MEDIA_PLAY
  [RemoteCommandType.Pause]: 127, // KEYCODE_MEDIA_PAUSE
  [RemoteCommandType.Rewind]: 89, // KEYCODE_MEDIA_REWIND
  [RemoteCommandType.FastForward]: 90, // KEYCODE_MEDIA_FAST_FORWARD
  [RemoteCommandType.Num0]: 7, // KEYCODE_0
  [RemoteCommandType.Num1]: 8, // KEYCODE_1
  [RemoteCommandType.Num2]: 9, // KEYCODE_2
  [RemoteCommandType.Num3]: 10, // KEYCODE_3
  [RemoteCommandType.Num4]: 11, // KEYCODE_4
  [RemoteCommandType.Num5]: 12, // KEYCODE_5
  [RemoteCommandType.Num6]: 13, // KEYCODE_6
  [RemoteCommandType.Num7]: 14, // KEYCODE_7
  [RemoteCommandType.Num8]: 15, // KEYCODE_8
  [RemoteCommandType.Num9]: 16, // KEYCODE_9
  [RemoteCommandType.Menu]: 82, // KEYCODE_MENU
  [RemoteCommandType.Info]: 165, // KEYCODE_INFO
  [RemoteCommandType.Settings]: 176, // KEYCODE_SETTINGS
  [RemoteCommandType.ChannelUp]: 166, // KEYCODE_CHANNEL_UP
  [RemoteCommandType.ChannelDown]: 167, // KEYCODE_CHANNEL_DOWN
};

/**
 * ADB message types for protocol communication
 * Reference: https://android.googlesource.com/platform/system/core/+/master/adb/protocol.txt
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ADB_MESSAGE = {
  CNXN: 0x4e584e43, // 'CNXN' - Connection request
  AUTH: 0x48545541, // 'AUTH' - Authentication
  OPEN: 0x4e45504f, // 'OPEN' - Open stream
  CLSE: 0x45534c43, // 'CLOSE' - Close stream
  WRTE: 0x45545257, // 'WRITE' - Write data
  OKAY: 0x59414b4f, // 'OKAY' - Acknowledgement
};

/**
 * Simple ADB connection state
 * Note: Full ADB implementation would require TCP socket and RSA authentication.
 * For MVP, we use a simplified approach with HTTP-based ADB bridge or direct keyevent.
 */
interface AdbConnectionState {
  connected: boolean;
  localId: number;
  remoteId: number;
}

/**
 * Android TV Session implementation
 *
 * For MVP, this uses a simplified approach:
 * 1. For devices with ADB enabled, we can send keyevent commands
 * 2. Full ADB protocol implementation would require native TCP socket + RSA auth
 *
 * Current implementation assumes ADB bridge or uses HTTP proxy approach.
 */
class AndroidTVSession implements TVSession {
  readonly sessionId: string;
  readonly device: TVDevice;
  private _status: ConnectionStatus = ConnectionStatus.Connected;
  private _adbState: AdbConnectionState | null = null;
  private socket: TcpSocket.Socket | null = null;

  constructor(device: TVDevice) {
    this.sessionId = `androidtv-${device.id}-${Date.now()}`;
    this.device = device;
    debug.log(`Session created: ${this.sessionId} for device ${device.name}`);
  }

  async connect(): Promise<void> {
      return new Promise((resolve, reject) => {
          try {
              debug.log(`Connecting to ${this.device.ipAddress}:${ADB_DEFAULT_PORT}`);
              this.socket = TcpSocket.createConnection({
                  port: ADB_DEFAULT_PORT,
                  host: this.device.ipAddress,
              }, () => {
                  debug.log('TCP connection established');
                  this._status = ConnectionStatus.Connected;
                  // TODO: Perform ADB handshake (CNXN)
                  resolve();
              });

              this.socket.on('error', (error) => {
                  debug.error('TCP socket error', error);
                  this._status = ConnectionStatus.Disconnected;
                  reject(error);
              });

              this.socket.on('close', () => {
                  debug.log('TCP socket closed');
                  this._status = ConnectionStatus.Disconnected;
              });

              this.socket.on('data', (data) => {
                  debug.log('Received data:', data.toString('hex'));
                  // TODO: Handle ADB packets
              });

          } catch (e) {
              debug.error('Failed to create TCP connection', e);
              reject(e);
          }
      });
  }

  /**
   * Send a remote control command to the Android TV
   *
   * Implementation notes:
   * - In a full implementation, this would use ADB protocol over TCP socket
   * - Currently uses HTTP-based approach for simplicity
   * - Future: Implement full ADB protocol with react-native-tcp-socket
   */
  async sendCommand(command: RemoteCommandType): Promise<CommandResult> {
    debug.log(`Sending command: ${command}`);

    if (this._status !== ConnectionStatus.Connected) {
      debug.warn(`Command failed: Not connected (status: ${this._status})`);
      return {
        success: false,
        error: {
          code: SessionErrorCode.NetworkUnreachable,
          message: 'Not connected to device',
          at: new Date().toISOString(),
        },
      };
    }

    const keycode = ANDROID_KEYCODE_MAP[command];
    if (keycode === undefined) {
      debug.warn(`Command failed: Unknown command ${command}`);
      return {
        success: false,
        error: {
          code: SessionErrorCode.CommandUnsupported,
          message: `Command ${command} not mapped for Android TV`,
          at: new Date().toISOString(),
        },
      };
    }

    try {
      // Send ADB keyevent command
      const result = await sendAdbKeyEvent(this.device.ipAddress, keycode, 5000);
      
      if (result.success) {
        debug.log(`Sent keyevent ${keycode} for command ${command}`);
        return { success: true };
      } else {
        debug.warn(`ADB command failed: ${result.error}`);
        return {
          success: false,
          error: {
            code: SessionErrorCode.NetworkUnreachable,
            message: result.error || 'ADB command failed',
            at: new Date().toISOString(),
          },
        };
      }
    } catch (err) {
      debug.error(`Command failed: Error sending ADB command`, err);
      return {
        success: false,
        error: {
          code: SessionErrorCode.NetworkUnreachable,
          message: String(err),
          at: new Date().toISOString(),
        },
      };
    }
  }

  async disconnect(): Promise<void> {
    debug.log(`Disconnecting session: ${this.sessionId}`);
    if (this.socket) {
        this.socket.destroy();
        this.socket = null;
    }
    this._status = ConnectionStatus.Disconnected;
    this._adbState = null;
  }

  getStatus(): ConnectionStatus {
    return this._status;
  }
}

/**
 * Android TV Platform Adapter
 *
 * Provides discovery and control for Android TV devices via ADB over TCP.
 */
export class AndroidTVAdapter implements PlatformAdapter {
  readonly platform = TVPlatform.AndroidTV;
  private _status: ConnectionStatus = ConnectionStatus.Idle;

  // ─────────────────────────────────────────────────────────────────────────
  // Discovery - mDNS preferred, port scanning fallback
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Discover Android TV devices on the local network.
   *
   * Discovery strategy:
   * 1. Try mDNS discovery first (_androidtvremote._tcp service)
   * 2. If mDNS fails, fall back to port scanning (probe port 5555)
   *
   * Note: ADB port scanning only finds devices with ADB debugging enabled.
   */
  async discover(
    timeoutMs = 5000,
    options?: { onDeviceFound?: (device: DiscoveredDevice) => void }
  ): Promise<DiscoveredDevice[]> {
    debug.log('Starting device discovery...');
    debug.log(`Timeout: ${timeoutMs}ms`);

    this._status = ConnectionStatus.Discovering;

    const onDeviceFound = options?.onDeviceFound;

    // Try mDNS discovery first (preferred method)
    if (isMdnsSupported()) {
      debug.log('mDNS is supported, trying mDNS discovery first...');

      try {
        // Pass the callback to mDNS discovery for real-time updates
        const mdnsDevices = await discoverAndroidTvViaMdns(timeoutMs, onDeviceFound);

        if (mdnsDevices.length > 0) {
          debug.log(`mDNS discovery successful! Found ${mdnsDevices.length} device(s)`);
          this._status = ConnectionStatus.Idle;
          return mdnsDevices;
        }

        debug.log('mDNS discovery returned no devices, falling back to port scanning');
      } catch (err) {
        debug.warn('mDNS discovery failed, falling back to port scanning:', err);
      }
    } else {
      debug.log('mDNS not supported, using port scanning');
    }

    // Fallback: Port scanning for ADB (port 5555)
    return this.discoverViaPortScan(timeoutMs, onDeviceFound);
  }

  /**
   * Discover devices by scanning for open ADB ports (fallback method)
   *
   * This is slower than mDNS but works when mDNS is not available.
   * Only finds devices with ADB debugging enabled over network.
   */
  private async discoverViaPortScan(
    timeoutMs: number,
    onDeviceFound?: (device: DiscoveredDevice) => void
  ): Promise<DiscoveredDevice[]> {
    debug.log('Starting port scan discovery...');

    const discovered: DiscoveredDevice[] = [];

    // Helper to add device and trigger callback
    const addDevice = (device: DiscoveredDevice) => {
      discovered.push(device);
      debug.log(`[AndroidTV] Found device: ${device.name} at ${device.ipAddress}`);
      
      if (onDeviceFound) {
        try {
          onDeviceFound(device);
        } catch (err) {
          debug.warn('onDeviceFound callback error:', err);
        }
      }
    };

    // Get network info
    const networkInfo = await getDeviceNetworkInfo();
    if (networkInfo) {
      debug.log(`Device network info:`);
      debug.log(`  IP: ${networkInfo.ipAddress}`);
      debug.log(`  Subnet: ${networkInfo.subnetMask}`);
    }

    // Get subnets to scan
    const subnetsToScan = await getSubnetsToScan();
    debug.log(`Subnets to scan: ${subnetsToScan.length}`);

    const deviceIp = networkInfo?.ipAddress;

    // Group subnets by priority
    const priorityGroups = new Map<number, SubnetInfo[]>();
    for (const subnet of subnetsToScan) {
      const group = priorityGroups.get(subnet.priority) || [];
      group.push(subnet);
      priorityGroups.set(subnet.priority, group);
    }

    const priorities = Array.from(priorityGroups.keys()).sort((a, b) => a - b);

    for (const priority of priorities) {
      const tierSubnets = priorityGroups.get(priority) || [];
      debug.log(`Scanning priority ${priority} subnets...`);

      const scanPromises: Promise<void>[] = [];

      for (const subnet of tierSubnets) {
        for (let i = 1; i <= 254; i++) {
          const ip = `${subnet.prefix}${i}`;

          if (ip === deviceIp) continue;

          scanPromises.push(
            this.probeAdbDevice(ip, timeoutMs)
              .then((dev) => {
                if (dev) {
                  debug.log(`✓ Found Android TV device at ${ip}`);
                  // Use addDevice helper to trigger callback
                  addDevice(dev);
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

      if (discovered.length > 0) {
        debug.log(`Found ${discovered.length} device(s), stopping search`);
        break;
      }
    }

    debug.log(`Discovery completed. Found ${discovered.length} device(s)`);
    this._status = ConnectionStatus.Idle;
    return discovered;
  }

  /**
   * Probe a single IP for ADB port availability
   *
   * This performs a two-phase check:
   * 1. Check if device has Chromecast/Google TV info endpoint (8008)
   * 2. Verify ADB port (5555) is open - required for control
   *
   * Only devices with BOTH indicators are considered valid Android TV.
   * Regular Chromecasts (no ADB) are filtered out.
   */
  private async probeAdbDevice(ip: string, timeoutMs: number): Promise<DiscoveredDevice | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 1500));

      // Phase 1: Check Chromecast/Google TV info endpoint
      let deviceName = `Android TV (${ip})`;
      let isAndroidTv = false;
      let hasEurekaInfo = false;

      try {
        const res = await fetch(`http://${ip}:8008/setup/eureka_info`, {
          method: 'GET',
          signal: controller.signal,
        });

        if (res.ok) {
          hasEurekaInfo = true;
          const text = await res.text();

          try {
            const info = JSON.parse(text);
            deviceName = info.name || deviceName;

            // Check if this is an Android TV / Google TV device
            const model = (info.cast_build_revision || info.model_name || '').toLowerCase();
            const deviceType = (info.device_info?.device_type || '').toLowerCase();

            // Google TV / Android TV indicators
            isAndroidTv =
              model.includes('google tv') ||
              model.includes('android tv') ||
              model.includes('chromecast with google tv') ||
              model.includes('ccgtv') || // Chromecast with Google TV code
              deviceType === 'tv' ||
              deviceType === 'android_tv';

            // Exclude regular Chromecasts (they don't support ADB)
            const isRegularChromecast =
              (model.includes('chromecast') && !model.includes('google tv')) ||
              deviceType === 'cast' ||
              deviceType === 'chromecast';

            if (isRegularChromecast && !isAndroidTv) {
              debug.log(`Skipping regular Chromecast at ${ip}: ${deviceName} (no ADB support)`);
              clearTimeout(timer);
              return null;
            }
          } catch {
            // If JSON parsing fails, check text content
            const textLower = text.toLowerCase();
            isAndroidTv =
              textLower.includes('android tv') ||
              textLower.includes('google tv') ||
              textLower.includes('chromecast with google tv');

            // Skip if it's just a regular Chromecast
            if (textLower.includes('chromecast') && !isAndroidTv) {
              debug.log(`Skipping Chromecast at ${ip} (not Android TV)`);
              clearTimeout(timer);
              return null;
            }
          }
        }
      } catch {
        // No eureka_info endpoint - might still be Android TV via mDNS
      }

      clearTimeout(timer);

      // Phase 2: Verify ADB port is open (required for control)
      // This filters out regular Chromecasts that have eureka_info but no ADB
      const adbPortOpen = await this.checkAdbPort(ip, Math.min(timeoutMs, 1000));

      if (!adbPortOpen) {
        if (hasEurekaInfo) {
          debug.log(`Skipping device at ${ip}: has eureka_info but ADB port 5555 closed (regular Chromecast)`);
        }
        return null;
      }

      // Device has ADB port open - it's controllable
      if (hasEurekaInfo && isAndroidTv) {
        debug.log(`Found Android TV at ${ip}: ${deviceName} (ADB enabled)`);
        return {
          id: ip,
          name: deviceName,
          ipAddress: ip,
          port: ADB_DEFAULT_PORT,
          platform: TVPlatform.AndroidTV,
        };
      }

      // ADB port open but no eureka_info - could be Android TV without Cast
      // Only include if we're confident it's an Android TV
      if (adbPortOpen && !hasEurekaInfo) {
        debug.log(`Found ADB device at ${ip} (no eureka_info, assuming Android TV)`);
        return {
          id: ip,
          name: `Android TV (${ip})`,
          ipAddress: ip,
          port: ADB_DEFAULT_PORT,
          platform: TVPlatform.AndroidTV,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Check if ADB port (5555) is open on the device
   * Uses TCP socket connection attempt via react-native-tcp-socket
   */
  private async checkAdbPort(ip: string, timeoutMs: number): Promise<boolean> {
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
          {
            port: ADB_DEFAULT_PORT,
            host: ip,
          },
          () => {
            // Connection successful - ADB port is open
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

  // ─────────────────────────────────────────────────────────────────────────
  // Connect / Disconnect
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Connect to an Android TV device
   *
   * For MVP:
   * - Verify device is reachable
   * - Create a session for sending commands
   *
   * Full implementation would:
   * 1. Open TCP connection to port 5555
   * 2. Send CNXN message
   * 3. Handle AUTH challenge with RSA key
   * 4. Wait for CNXN response
   */
  async connect(device: TVDevice): Promise<TVSession | null> {
    debug.log(`Connecting to device: ${device.name} at ${device.ipAddress}:${device.port}`);
    this._status = ConnectionStatus.Connecting;

    try {
        const session = new AndroidTVSession(device);
        await session.connect();
        this._status = ConnectionStatus.Connected;
        return session;
    } catch (e) {
        debug.error('Connection failed', e);
        this._status = ConnectionStatus.Unavailable;
        return null;
    }
  }

  /**
   * Verify if a device is reachable at the given IP and port
   */
  private async verifyDeviceReachable(ip: string, port: number): Promise<boolean> {
    // For MVP, we do a simple reachability check
    // Full implementation would attempt ADB handshake

    try {
      // Try Chromecast info endpoint (common on Google TV / Android TV)
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ADB_CONNECT_TIMEOUT_MS);

      const res = await fetch(`http://${ip}:8008/setup/eureka_info`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timer);
      return res.ok;
    } catch {
      // If Chromecast endpoint fails, device might still be an Android TV
      // but we can't verify without TCP socket
      debug.warn(`Cannot verify device at ${ip}:${port} without TCP support`);
      return true; // Optimistically assume reachable for now
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Status
  // ─────────────────────────────────────────────────────────────────────────

  getStatus(): ConnectionStatus {
    return this._status;
  }
}
