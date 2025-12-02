/**
 * Roku ECP (External Control Protocol) adapter
 *
 * This adapter uses the official Roku ECP over HTTP to:
 * - Discover Roku devices via SSDP (roku:ecp)
 * - Send keypress commands
 *
 * Reference: https://developer.roku.com/docs/developer-program/debugging/external-control-api.md
 */

import type {
  PlatformAdapter,
  DiscoveredDevice,
  CommandResult,
  TVSession,
} from '../domain/remote-interfaces';
import {
  TVDevice,
  TVCapabilities,
  ConnectionStatus,
  RemoteCommandType,
  TVPlatform,
  SessionErrorCode,
} from '../domain/models';
import { getSubnetsToScan, getDeviceNetworkInfo, SubnetInfo } from '../services/network-utils';

/** Debug logger for Roku adapter */
const DEBUG_TAG = '[RokuAdapter]';
const debug = {
  log: (...args: unknown[]) => console.log(DEBUG_TAG, ...args),
  warn: (...args: unknown[]) => console.warn(DEBUG_TAG, ...args),
  error: (...args: unknown[]) => console.error(DEBUG_TAG, ...args),
};

/** Roku keypress endpoint key names */
const ROKU_KEY_MAP: Record<RemoteCommandType, string> = {
  [RemoteCommandType.Up]: 'Up',
  [RemoteCommandType.Down]: 'Down',
  [RemoteCommandType.Left]: 'Left',
  [RemoteCommandType.Right]: 'Right',
  [RemoteCommandType.Select]: 'Select',
  [RemoteCommandType.Back]: 'Back',
  [RemoteCommandType.Home]: 'Home',
  [RemoteCommandType.VolumeUp]: 'VolumeUp',
  [RemoteCommandType.VolumeDown]: 'VolumeDown',
  [RemoteCommandType.Mute]: 'VolumeMute',
  [RemoteCommandType.Power]: 'PowerOff',
  [RemoteCommandType.Play]: 'Play',
  [RemoteCommandType.Pause]: 'Pause',
  [RemoteCommandType.Rewind]: 'Rev',
  [RemoteCommandType.FastForward]: 'Fwd',
  [RemoteCommandType.Num0]: 'Lit_0',
  [RemoteCommandType.Num1]: 'Lit_1',
  [RemoteCommandType.Num2]: 'Lit_2',
  [RemoteCommandType.Num3]: 'Lit_3',
  [RemoteCommandType.Num4]: 'Lit_4',
  [RemoteCommandType.Num5]: 'Lit_5',
  [RemoteCommandType.Num6]: 'Lit_6',
  [RemoteCommandType.Num7]: 'Lit_7',
  [RemoteCommandType.Num8]: 'Lit_8',
  [RemoteCommandType.Num9]: 'Lit_9',
  [RemoteCommandType.Menu]: 'Info',
  [RemoteCommandType.Info]: 'Info',
  [RemoteCommandType.Settings]: 'Info',
  [RemoteCommandType.ChannelUp]: 'ChannelUp',
  [RemoteCommandType.ChannelDown]: 'ChannelDown',
};

/** Roku session implementation */
class RokuSession implements TVSession {
  readonly sessionId: string;
  readonly device: TVDevice;
  private _baseUrl: string;
  private _status: ConnectionStatus = ConnectionStatus.Connected;

  constructor(device: TVDevice) {
    this.sessionId = `roku-${device.id}-${Date.now()}`;
    this.device = device;
    this._baseUrl = `http://${device.ipAddress}:${device.port}`;
    debug.log(`Session created: ${this.sessionId} for device ${device.name} at ${this._baseUrl}`);
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

    const rokuKey = ROKU_KEY_MAP[command];
    if (!rokuKey) {
      debug.warn(`Command failed: Unknown command ${command}`);
      return {
        success: false,
        error: {
          code: SessionErrorCode.CommandUnsupported,
          message: `Command ${command} not mapped for Roku`,
          at: new Date().toISOString(),
        },
      };
    }

    try {
      const url = `${this._baseUrl}/keypress/${rokuKey}`;
      debug.log(`POST ${url}`);
      
      const res = await fetch(url, { method: 'POST' });
      
      if (res.ok) {
        debug.log(`Command ${command} (${rokuKey}) sent successfully`);
        return { success: true };
      }
      
      debug.error(`Command failed: Roku returned status ${res.status}`);
      return {
        success: false,
        error: {
          code: SessionErrorCode.Unknown,
          message: `Roku returned status ${res.status}`,
          at: new Date().toISOString(),
        },
      };
    } catch (err) {
      debug.error(`Command failed: Network error`, err);
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

export class RokuAdapter implements PlatformAdapter {
  readonly platform = TVPlatform.Roku;

  private _status: ConnectionStatus = ConnectionStatus.Idle;

  // ─────────────────────────────────────────────────────────────────────────
  // Discovery via HTTP probe (with dynamic subnet detection)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Discover Roku devices on the local network.
   *
   * This implementation:
   * 1. Gets the device's current IP and determines the local subnet
   * 2. Scans that subnet for Roku devices on port 8060 (ECP default)
   * 3. Falls back to common subnet prefixes if network info unavailable
   *
   * NOTE: For true SSDP discovery, a native module would be needed.
   */
  async discover(timeoutMs = 3000): Promise<DiscoveredDevice[]> {
    debug.log('Starting device discovery...');
    debug.log(`Timeout per probe: ${timeoutMs}ms`);
    
    this._status = ConnectionStatus.Discovering;
    const discovered: DiscoveredDevice[] = [];
    
    // Get network info for logging
    const networkInfo = await getDeviceNetworkInfo();
    if (networkInfo) {
      debug.log(`Device network info:`);
      debug.log(`  IP: ${networkInfo.ipAddress}`);
      debug.log(`  Subnet mask: ${networkInfo.subnetMask}`);
      debug.log(`  CIDR: /${networkInfo.cidrPrefix}`);
      debug.log(`  Broadcast: ${networkInfo.broadcast}`);
    } else {
      debug.log('Could not get device network info, using fallback subnets');
    }
    
    // Get subnets to scan (sorted by priority)
    const subnetsToScan = await getSubnetsToScan();
    debug.log(`Subnets to scan: ${subnetsToScan.length}`);
    subnetsToScan.forEach((s: SubnetInfo) => {
      debug.log(`  - ${s.prefix}x (priority: ${s.priority}, primary: ${s.isPrimary})`);
    });
    
    // Get device's own IP to skip during scan
    const deviceIp = networkInfo?.ipAddress;
    
    // Group subnets by priority for tiered scanning
    const priorityGroups = new Map<number, SubnetInfo[]>();
    for (const subnet of subnetsToScan) {
      const group = priorityGroups.get(subnet.priority) || [];
      group.push(subnet);
      priorityGroups.set(subnet.priority, group);
    }
    
    // Scan by priority tier - stop early if we find devices
    const priorities = Array.from(priorityGroups.keys()).sort((a, b) => a - b);
    
    for (const priority of priorities) {
      const tierSubnets = priorityGroups.get(priority) || [];
      debug.log(`\nScanning priority ${priority} subnets (${tierSubnets.length} subnets)...`);
      
      const scanPromises: Promise<void>[] = [];
      
      for (const subnet of tierSubnets) {
        debug.log(`  Scanning subnet: ${subnet.prefix}x`);
        
        for (let i = 1; i <= 254; i++) {
          const ip = `${subnet.prefix}${i}`;
          
          // Skip device's own IP
          if (ip === deviceIp) {
            continue;
          }
          
          scanPromises.push(
            this.probeDevice(ip, timeoutMs)
              .then((dev) => {
                if (dev) {
                  debug.log(`✓ Found device: ${dev.name} at ${dev.ipAddress}`);
                  discovered.push(dev);
                }
              })
              .catch(() => {
                // Silently ignore individual probe failures
              })
          );
        }
      }
      
      debug.log(`  Probing ${scanPromises.length} addresses...`);
      await Promise.all(scanPromises);
      
      // If we found devices in this priority tier, we can stop
      if (discovered.length > 0) {
        debug.log(`Found ${discovered.length} device(s) at priority ${priority}, stopping search`);
        break;
      }
      
      debug.log(`  No devices found at priority ${priority}`);
    }
    
    debug.log(`\nDiscovery completed. Found ${discovered.length} device(s)`);
    discovered.forEach((d) => {
      debug.log(`  - ${d.name} (${d.id}) at ${d.ipAddress}:${d.port}`);
    });
    
    this._status = ConnectionStatus.Idle;
    return discovered;
  }

  /**
   * Probe a single IP for Roku ECP
   */
  private async probeDevice(ip: string, timeoutMs: number): Promise<DiscoveredDevice | null> {
    const url = `http://${ip}:8060/query/device-info`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { 
        signal: controller.signal,
        headers: {
          'Accept': 'application/xml, text/xml, */*',
        },
      });
      clearTimeout(timer);
      
      if (!res.ok) {
        return null;
      }

      const text = await res.text();
      
      const nameMatch = text.match(/<user-device-name>([^<]+)<\/user-device-name>/);
      const serialMatch = text.match(/<serial-number>([^<]+)<\/serial-number>/);

      const name = nameMatch?.[1] ?? `Roku (${ip})`;
      const id = serialMatch?.[1] ?? ip;

      return {
        id,
        name,
        ipAddress: ip,
        port: 8060,
        platform: TVPlatform.Roku,
      };
    } catch {
      clearTimeout(timer);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Connect / Disconnect
  // ─────────────────────────────────────────────────────────────────────────

  async connect(device: TVDevice): Promise<TVSession | null> {
    debug.log(`Connecting to device: ${device.name} at ${device.ipAddress}:${device.port}`);
    this._status = ConnectionStatus.Connecting;
    const baseUrl = `http://${device.ipAddress}:${device.port}`;

    // Retry logic for unstable network
    const maxRetries = 3;
    const timeoutMs = 5000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      debug.log(`Connection attempt ${attempt}/${maxRetries}`);
      
      try {
        const url = `${baseUrl}/query/device-info`;
        debug.log(`Verifying device at ${url}`);
        
        // Use AbortController for timeout
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        
        const res = await fetch(url, { 
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timer);
        
        if (!res.ok) {
          debug.error(`Connection failed: Device returned status ${res.status}`);
          if (attempt === maxRetries) {
            this._status = ConnectionStatus.Unavailable;
            return null;
          }
          debug.log(`Retrying in 500ms...`);
          await this.delay(500);
          continue;
        }
        
        const text = await res.text();
        debug.log(`Device info received (${text.length} bytes)`);

        // Update device capabilities based on device info
        const powerControl = text.includes('<power-mode>') || text.includes('<supports-suspend>');
        const volumeControl =
          text.includes('<supports-audio-output>') || text.includes('<headphones-connected>');

        debug.log(`Capabilities detected:`);
        debug.log(`  Power control: ${powerControl}`);
        debug.log(`  Volume control: ${volumeControl}`);

        // Create enhanced device with parsed capabilities
        const enhancedDevice: TVDevice = {
          ...device,
          capabilities: {
            powerControl,
            volumeControl,
            channelControl: false,
            voiceInput: false,
            keyboard: true,
            apps: true,
            raw: { deviceInfoSnippet: text.slice(0, 500) },
          },
        };

        this._status = ConnectionStatus.Connected;
        debug.log(`Successfully connected to ${device.name}`);
        return new RokuSession(enhancedDevice);
        
      } catch (err) {
        debug.error(`Connection attempt ${attempt} failed:`, err);
        
        if (attempt === maxRetries) {
          debug.error(`All ${maxRetries} attempts failed`);
          this._status = ConnectionStatus.Unavailable;
          return null;
        }
        
        debug.log(`Retrying in 500ms...`);
        await this.delay(500);
      }
    }
    
    this._status = ConnectionStatus.Unavailable;
    return null;
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Status
  // ─────────────────────────────────────────────────────────────────────────

  getStatus(): ConnectionStatus {
    return this._status;
  }
}
