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
  }

  async sendCommand(command: RemoteCommandType): Promise<CommandResult> {
    if (this._status !== ConnectionStatus.Connected) {
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
      const res = await fetch(`${this._baseUrl}/keypress/${rokuKey}`, {
        method: 'POST',
      });
      if (res.ok) {
        return { success: true };
      }
      return {
        success: false,
        error: {
          code: SessionErrorCode.Unknown,
          message: `Roku returned status ${res.status}`,
          at: new Date().toISOString(),
        },
      };
    } catch (err) {
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
  // Discovery via SSDP (simplified: we use a direct HTTP fallback scan)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Discover Roku devices on the local network.
   *
   * NOTE: React Native / Expo do not natively support UDP multicast (SSDP).
   * For MVP, we provide a manual IP entry fallback. In a production app,
   * you could use a native module or Expo Dev Client with custom native code.
   *
   * This simplified implementation attempts to query common subnet IPs
   * on port 8060 (Roku ECP default) and returns devices that respond.
   */
  async discover(timeoutMs = 5000): Promise<DiscoveredDevice[]> {
    this._status = ConnectionStatus.Discovering;
    const discovered: DiscoveredDevice[] = [];

    // Fallback: scan a small range or allow manual entry.
    // For demo purposes, we scan 192.168.1.1-254 on port 8060.
    // In a real app, get the local subnet from device info or use native SSDP.
    const subnetPrefix = '192.168.1.';
    const scanPromises: Promise<void>[] = [];

    for (let i = 1; i <= 254; i++) {
      const ip = `${subnetPrefix}${i}`;
      scanPromises.push(
        this.probeDevice(ip, timeoutMs)
          .then((dev) => {
            if (dev) discovered.push(dev);
          })
          .catch(() => {
            /* ignore */
          })
      );
    }

    await Promise.all(scanPromises);
    this._status = ConnectionStatus.Idle;
    return discovered;
  }

  /**
   * Probe a single IP for Roku ECP and return device info if found.
   */
  private async probeDevice(ip: string, timeoutMs: number): Promise<DiscoveredDevice | null> {
    const url = `http://${ip}:8060/query/device-info`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;

      const text = await res.text();
      // Parse basic device-info XML for name and serial
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
    this._status = ConnectionStatus.Connecting;
    const baseUrl = `http://${device.ipAddress}:${device.port}`;

    // Verify device is reachable
    try {
      const res = await fetch(`${baseUrl}/query/device-info`, {
        method: 'GET',
      });
      if (!res.ok) {
        this._status = ConnectionStatus.Unavailable;
        return null;
      }
      const text = await res.text();

      // Update device capabilities based on device info
      const powerControl = text.includes('<power-mode>') || text.includes('<supports-suspend>');
      const volumeControl =
        text.includes('<supports-audio-output>') || text.includes('<headphones-connected>');

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
      return new RokuSession(enhancedDevice);
    } catch (err) {
      this._status = ConnectionStatus.Unavailable;
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Status
  // ─────────────────────────────────────────────────────────────────────────

  getStatus(): ConnectionStatus {
    return this._status;
  }
}
