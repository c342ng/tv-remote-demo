/**
 * Amazon Fire TV adapter
 *
 * Fire TV is based on Fire OS (Android fork), so it shares the same ADB protocol.
 * This adapter extends the Android TV adapter with Fire TV specific discovery.
 *
 * Discovery methods:
 * 1. DIAL endpoint probing - Check for Fire TV DIAL service (port 8008)
 * 2. ADB protocol - Query device properties to identify Fire TV (ro.product.brand = Amazon)
 *
 * Prerequisites:
 * - User must enable "Developer Options" on the Fire TV
 * - User must enable "ADB Debugging" in Developer Options
 * - Device must accept ADB connection (first-time authorization on TV)
 *
 * Note: Fire TV uses its own remote protocol (WhisperPlay) for the official
 * Fire TV Remote app, but ADB provides a simpler and more universal approach.
 *
 * @module fire-tv-adapter
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
import { getSubnetsToScan, getDeviceNetworkInfo, SubnetInfo } from '../services/network-utils';
import { probeAdbDevice, isAdbClientSupported, sendAdbKeyEvent, type AdbDeviceInfo } from '../services/adb-client';

/** Debug logger for Fire TV adapter */
const DEBUG_TAG = '[FireTVAdapter]';
const debug = {
  log: (...args: unknown[]) => console.log(DEBUG_TAG, ...args),
  warn: (...args: unknown[]) => console.warn(DEBUG_TAG, ...args),
  error: (...args: unknown[]) => console.error(DEBUG_TAG, ...args),
};

/** Default ADB port for network debugging */
const ADB_DEFAULT_PORT = 5555;

/** Fire TV DIAL/SSDP service port */
const FIRE_TV_DIAL_PORT = 8008;

/**
 * Android KeyEvent code mapping (shared with Android TV)
 * Fire OS uses the same keycodes as Android
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
 * Fire TV Session implementation
 * Uses the same ADB approach as Android TV
 */
class FireTVSession implements TVSession {
  readonly sessionId: string;
  readonly device: TVDevice;
  private _status: ConnectionStatus = ConnectionStatus.Connected;

  constructor(device: TVDevice) {
    this.sessionId = `firetv-${device.id}-${Date.now()}`;
    this.device = device;
    debug.log(`Session created: ${this.sessionId} for device ${device.name}`);
  }

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
          message: `Command ${command} not mapped for Fire TV`,
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
    this._status = ConnectionStatus.Disconnected;
  }

  getStatus(): ConnectionStatus {
    return this._status;
  }
}

/**
 * Fire TV Platform Adapter
 *
 * Provides discovery and control for Amazon Fire TV devices.
 */
export class FireTVAdapter implements PlatformAdapter {
  readonly platform = TVPlatform.FireTV;
  private _status: ConnectionStatus = ConnectionStatus.Idle;

  // ─────────────────────────────────────────────────────────────────────────
  // Discovery
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Discover Fire TV devices on the local network.
   *
   * Strategy:
   * 1. Try DIAL endpoint probing first (fast, reliable for some devices)
   * 2. Use ADB protocol to query device properties (reliable for all Fire TV)
   *    - Connects to ADB port 5555
   *    - Queries ro.product.brand / ro.product.manufacturer
   *    - Identifies Fire TV by Amazon brand
   */
  async discover(
    timeoutMs = 5000,
    options?: { onDeviceFound?: (device: DiscoveredDevice) => void }
  ): Promise<DiscoveredDevice[]> {
    debug.log('Starting device discovery...');
    debug.log(`Timeout: ${timeoutMs}ms`);
    debug.log(`ADB client supported: ${isAdbClientSupported()}`);

    this._status = ConnectionStatus.Discovering;

    const discovered: DiscoveredDevice[] = [];
    const foundIps = new Set<string>();
    const onDeviceFound = options?.onDeviceFound;

    // Helper to add device and trigger callback
    const addDevice = (device: DiscoveredDevice, ip: string) => {
      if (!foundIps.has(ip)) {
        foundIps.add(ip);
        discovered.push(device);
        debug.log(`[FireTV] Found device: ${device.name} at ${device.ipAddress}`);
        
        if (onDeviceFound) {
          try {
            onDeviceFound(device);
          } catch (err) {
            debug.warn('onDeviceFound callback error:', err);
          }
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

    // Group by priority
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
          if (foundIps.has(ip)) continue;

          scanPromises.push(
            this.probeFireTvDevice(ip, timeoutMs)
              .then((dev) => {
                if (dev && !foundIps.has(ip)) {
                  debug.log(`✓ Found Fire TV device at ${ip}`);
                  // Use addDevice helper to trigger callback
                  addDevice(dev, ip);
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
   * Probe a single IP for Fire TV device
   *
   * Uses a two-phase approach:
   * 1. Try DIAL endpoint (fast, works for some Fire TV devices)
   * 2. If DIAL fails, use ADB protocol to query device properties
   *    - Connects to ADB port 5555
   *    - Identifies Fire TV by manufacturer (Amazon)
   *
   * @param ip - IP address to probe
   * @param timeoutMs - Timeout in milliseconds
   * @param assumeFireTv - If true, assume any ADB-enabled device is a Fire TV
   */
  private async probeFireTvDevice(
    ip: string,
    timeoutMs: number,
    assumeFireTv: boolean = false
  ): Promise<DiscoveredDevice | null> {
    // Phase 1: Try DIAL endpoint (fast check)
    const dialResult = await this.probeDialEndpoint(ip, Math.min(timeoutMs, 1000));
    if (dialResult) {
      return dialResult;
    }

    // Phase 2: Use ADB protocol to identify device
    // This is more reliable as it queries the actual device properties
    if (isAdbClientSupported()) {
      const adbResult = await this.probeAdbEndpoint(ip, Math.min(timeoutMs, 2000), assumeFireTv);
      if (adbResult) {
        return adbResult;
      }
    }

    return null;
  }

  /**
   * Probe device using ADB protocol
   * Queries device properties to identify Fire TV (ro.product.brand = Amazon)
   *
   * NOTE: When ADB returns AUTH response, we can't determine if it's Fire TV
   * or regular Android TV without full authentication. In this case, we return
   * the device as a potential Fire TV and let the AndroidTVAdapter also claim it.
   * The user can choose which adapter to use based on device behavior.
   *
   * @param ip - IP address to probe
   * @param timeoutMs - Timeout in milliseconds
   * @param assumeFireTv - If true, assume any ADB-enabled device is a Fire TV (for known IPs)
   */
  private async probeAdbEndpoint(
    ip: string,
    timeoutMs: number,
    assumeFireTv: boolean = false
  ): Promise<DiscoveredDevice | null> {
    try {
      const deviceInfo: AdbDeviceInfo | null = await probeAdbDevice(ip, timeoutMs);

      if (!deviceInfo?.isAdbEnabled) {
        return null;
      }

      // If device requires AUTH and we're assuming it's a Fire TV (known IP)
      if (assumeFireTv && deviceInfo.isAdbEnabled) {
        debug.log(`ADB discovery: Assuming Fire TV at known IP ${ip}`);
        debug.log(`  ADB enabled: true, AUTH required`);

        return {
          id: `firetv-${ip}`,
          name: `Fire TV (${ip})`,
          ipAddress: ip,
          port: ADB_DEFAULT_PORT,
          platform: TVPlatform.FireTV,
        };
      }

      if (deviceInfo.isFireTv) {
        const name = deviceInfo.model
          ? `Fire TV (${deviceInfo.model})`
          : deviceInfo.manufacturer
            ? `Fire TV (${deviceInfo.manufacturer})`
            : `Fire TV (${ip})`;

        debug.log(`ADB discovery: Found Fire TV at ${ip}`);
        debug.log(`  Manufacturer: ${deviceInfo.manufacturer || 'unknown'}`);
        debug.log(`  Model: ${deviceInfo.model || 'unknown'}`);

        return {
          id: `firetv-${ip}`,
          name,
          ipAddress: ip,
          port: ADB_DEFAULT_PORT,
          platform: TVPlatform.FireTV,
        };
      }

      // If ADB is enabled but we couldn't determine device type (AUTH required),
      // still return it as a potential Fire TV device
      // This happens when the device hasn't authorized this client yet
      if (deviceInfo.isAdbEnabled && !deviceInfo.isFireTv && !deviceInfo.isAndroidTv) {
        debug.log(`ADB discovery: ADB-enabled device at ${ip} (type unknown, needs AUTH)`);
        debug.log(`  Returning as potential Fire TV for user to verify`);

        return {
          id: `firetv-${ip}`,
          name: `Fire TV (${ip})`,
          ipAddress: ip,
          port: ADB_DEFAULT_PORT,
          platform: TVPlatform.FireTV,
        };
      }

      return null;
    } catch (err) {
      debug.warn(`ADB probe failed for ${ip}:`, err);
      return null;
    }
  }

  /**
   * Probe DIAL endpoint for Fire TV identification
   */
  private async probeDialEndpoint(ip: string, timeoutMs: number): Promise<DiscoveredDevice | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 1000));

      const dialUrl = `http://${ip}:${FIRE_TV_DIAL_PORT}/dial/dd.xml`;

      try {
        const res = await fetch(dialUrl, {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (res.ok) {
          const text = await res.text();

          // Check if this is a Fire TV device
          if (
            text.toLowerCase().includes('fire') ||
            text.toLowerCase().includes('amazon') ||
            text.toLowerCase().includes('aftt') || // Fire TV Stick model prefix
            text.toLowerCase().includes('aftm') || // Fire TV Stick 4K
            text.toLowerCase().includes('aftn') // Fire TV Cube
          ) {
            // Parse device name from XML
            const nameMatch = text.match(/<friendlyName>([^<]+)<\/friendlyName>/i);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const modelMatch = text.match(/<modelName>([^<]+)<\/modelName>/i);
            const uuidMatch = text.match(/<UDN>uuid:([^<]+)<\/UDN>/i);

            const name = nameMatch?.[1] ?? `Fire TV (${ip})`;
            const id = uuidMatch?.[1] ?? ip;

            debug.log(`DIAL discovery: Found ${name} at ${ip}`);

            return {
              id,
              name,
              ipAddress: ip,
              port: ADB_DEFAULT_PORT,
              platform: TVPlatform.FireTV,
            };
          }
        }
      } catch {
        clearTimeout(timer);
      }

      return null;
    } catch {
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Connect / Disconnect
  // ─────────────────────────────────────────────────────────────────────────

  async connect(device: TVDevice): Promise<TVSession | null> {
    debug.log(`Connecting to device: ${device.name} at ${device.ipAddress}:${device.port}`);
    this._status = ConnectionStatus.Connecting;

    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      debug.log(`Connection attempt ${attempt}/${maxRetries}`);

      try {
        // Verify device is reachable
        const isReachable = await this.verifyDeviceReachable(device.ipAddress);

        if (!isReachable) {
          debug.warn(`Device not reachable on attempt ${attempt}`);
          if (attempt === maxRetries) {
            this._status = ConnectionStatus.Unavailable;
            return null;
          }
          await this.delay(500);
          continue;
        }

        // Create session with Fire TV capabilities
        const enhancedDevice: TVDevice = {
          ...device,
          capabilities: {
            powerControl: true,
            volumeControl: true,
            channelControl: false,
            voiceInput: false, // Alexa voice would need separate implementation
            keyboard: true,
            apps: true,
          },
        };

        this._status = ConnectionStatus.Connected;
        debug.log(`Successfully connected to ${device.name}`);
        return new FireTVSession(enhancedDevice);
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

  private async verifyDeviceReachable(ip: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(`http://${ip}:${FIRE_TV_DIAL_PORT}/dial/dd.xml`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timer);
      return res.ok;
    } catch {
      // Device might still be reachable via ADB
      debug.warn(`Cannot verify device at ${ip} via DIAL, assuming reachable`);
      return true;
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
