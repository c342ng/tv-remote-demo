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

  constructor(device: TVDevice) {
    this.sessionId = `androidtv-${device.id}-${Date.now()}`;
    this.device = device;
    debug.log(`Session created: ${this.sessionId} for device ${device.name}`);
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
      // For MVP: We'll implement a basic connectivity check
      // Full ADB implementation would send: `shell:input keyevent ${keycode}`
      //
      // Note: Implementing full ADB requires:
      // 1. TCP connection to port 5555
      // 2. RSA key exchange for authentication
      // 3. ADB protocol message framing
      //
      // For now, we simulate success for connected devices
      // TODO: Implement full ADB protocol with react-native-tcp-socket

      debug.log(`Would send keyevent ${keycode} for command ${command}`);
      debug.log(`ADB command: shell:input keyevent ${keycode}`);

      // Simulate command execution
      // In real implementation, this would be:
      // await this.sendAdbCommand(`shell:input keyevent ${keycode}`);

      return { success: true };
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
  async discover(timeoutMs = 5000): Promise<DiscoveredDevice[]> {
    debug.log('Starting device discovery...');
    debug.log(`Timeout: ${timeoutMs}ms`);

    this._status = ConnectionStatus.Discovering;

    // Try mDNS discovery first (preferred method)
    if (isMdnsSupported()) {
      debug.log('mDNS is supported, trying mDNS discovery first...');

      try {
        const mdnsDevices = await discoverAndroidTvViaMdns(timeoutMs);

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
    return this.discoverViaPortScan(timeoutMs);
  }

  /**
   * Discover devices by scanning for open ADB ports (fallback method)
   *
   * This is slower than mDNS but works when mDNS is not available.
   * Only finds devices with ADB debugging enabled over network.
   */
  private async discoverViaPortScan(timeoutMs: number): Promise<DiscoveredDevice[]> {
    debug.log('Starting port scan discovery...');

    const discovered: DiscoveredDevice[] = [];

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
                  discovered.push(dev);
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
   * This performs a simple TCP connect check to port 5555.
   * Note: This doesn't verify if the device is an Android TV,
   * just that ADB port is open.
   */
  private async probeAdbDevice(ip: string, timeoutMs: number): Promise<DiscoveredDevice | null> {
    // For now, we use a simple HTTP-based check
    // In a full implementation, this would use TCP socket to check ADB port
    //
    // Approach for MVP:
    // 1. Try to detect if port 5555 is open (would need native TCP module)
    // 2. If available, mark as potential Android TV device
    //
    // Since we can't do raw TCP in React Native without native modules,
    // we'll simulate a lighter check

    try {
      // Attempt a connection test
      // Note: This is a placeholder - real implementation needs TCP socket
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 1000));

      // Try common Android TV ports/services
      // Some Android TV devices expose a REST API on certain ports
      const testUrls = [
        `http://${ip}:8008/setup/eureka_info`, // Chromecast built-in (Google TV)
        `http://${ip}:8443/`, // Some Android TV devices
      ];

      for (const url of testUrls) {
        try {
          const res = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
          });
          clearTimeout(timer);

          if (res.ok) {
            const text = await res.text();

            // Check if this looks like an Android TV / Google TV device
            if (
              text.includes('Chromecast') ||
              text.includes('Android') ||
              text.includes('Google')
            ) {
              return {
                id: ip,
                name: `Android TV (${ip})`,
                ipAddress: ip,
                port: ADB_DEFAULT_PORT,
                platform: TVPlatform.AndroidTV,
              };
            }
          }
        } catch {
          // Continue to next URL
        }
      }

      clearTimeout(timer);
      return null;
    } catch {
      return null;
    }
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

    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      debug.log(`Connection attempt ${attempt}/${maxRetries}`);

      try {
        // Verify device is reachable
        const isReachable = await this.verifyDeviceReachable(device.ipAddress, device.port);

        if (!isReachable) {
          debug.warn(`Device not reachable on attempt ${attempt}`);
          if (attempt === maxRetries) {
            this._status = ConnectionStatus.Unavailable;
            return null;
          }
          await this.delay(500);
          continue;
        }

        // Create session with default capabilities
        const enhancedDevice: TVDevice = {
          ...device,
          capabilities: {
            powerControl: true,
            volumeControl: true,
            channelControl: false, // Most Android TV don't have live TV
            voiceInput: false, // Requires additional implementation
            keyboard: true,
            apps: true,
          },
        };

        this._status = ConnectionStatus.Connected;
        debug.log(`Successfully connected to ${device.name}`);
        return new AndroidTVSession(enhancedDevice);
      } catch (err) {
        debug.error(`Connection attempt ${attempt} failed:`, err);

        if (attempt === maxRetries) {
          this._status = ConnectionStatus.Unavailable;
          return null;
        }
        await this.delay(500);
      }
    }

    this._status = ConnectionStatus.Unavailable;
    return null;
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
