/**
 * mDNS Discovery Service for Android TV / Google TV devices
 *
 * Uses mDNS (Multicast DNS) to discover Android TV devices on the local network.
 * Android TV devices advertise the following services:
 * - _androidtvremote._tcp - Android TV Remote Service (official protocol)
 * - _googlecast._tcp - Chromecast/Google Cast (for Google TV devices)
 *
 * This implementation uses react-native-zeroconf for mDNS discovery.
 *
 * @module mdns-discovery
 */

import type { DiscoveredDevice } from '../domain/remote-interfaces';
import { TVPlatform } from '../domain/models';

/** Debug logger for mDNS discovery */
const DEBUG_TAG = '[mDNS]';
const debug = {
  log: (...args: unknown[]) => console.log(DEBUG_TAG, ...args),
  warn: (...args: unknown[]) => console.warn(DEBUG_TAG, ...args),
  error: (...args: unknown[]) => console.error(DEBUG_TAG, ...args),
};

/**
 * mDNS service types for Android TV discovery
 *
 * react-native-zeroconf API:
 * - scan(type, protocol, domain) where:
 *   - type: just the service name (e.g., 'http', 'ssh', 'androidtvremote')
 *   - protocol: 'tcp' or 'udp'
 *   - domain: 'local.' (default)
 *
 * The library constructs the full service type as: _<type>._<protocol>.<domain>
 */
const ANDROID_TV_SERVICE_NAME = 'androidtvremote';
const GOOGLECAST_SERVICE_NAME = 'googlecast';

/** Default ADB port for network debugging */
const ADB_DEFAULT_PORT = 5555;

/** Android TV Remote Service port */
const ANDROID_TV_REMOTE_PORT = 6466;

/** Default timeout for mDNS discovery in milliseconds */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Lazy-load the Zeroconf module to avoid crashes at import time
 * Returns null if the module is not available
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getZeroconfModule(): any | null {
  try {
    // Dynamic require to avoid import-time crashes
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Zeroconf = require('react-native-zeroconf').default;

    if (!Zeroconf) {
      debug.warn('react-native-zeroconf module is null');
      return null;
    }

    return Zeroconf;
  } catch (err) {
    debug.warn('Failed to load react-native-zeroconf:', err);
    return null;
  }
}

/**
 * Interface for Zeroconf resolved service
 */
interface ZeroconfService {
  name: string;
  fullName: string;
  host: string;
  port: number;
  txt?: Record<string, string>;
  addresses?: string[];
}

/**
 * Parse device info from mDNS service TXT records
 */
function parseDeviceInfo(service: ZeroconfService): {
  name: string;
  model: string;
  manufacturer: string;
  id: string;
} {
  const txt = service.txt || {};

  // Different services use different TXT record formats
  // _googlecast._tcp uses: fn (friendly name), md (model), id
  // _androidtvremote._tcp uses: bt (device type), fn (friendly name)

  const friendlyName = txt.fn || txt.name || service.name || `Android TV (${service.host})`;
  const model = txt.md || txt.model || 'Android TV';
  const manufacturer = txt.mf || txt.manufacturer || 'Unknown';
  const id = txt.id || txt.uuid || service.name || service.host;

  return {
    name: friendlyName,
    model,
    manufacturer,
    id,
  };
}

/**
 * Get the primary IP address from a Zeroconf service
 */
function getPrimaryIpAddress(service: ZeroconfService): string | null {
  // Prefer IPv4 addresses
  const addresses = service.addresses || [];

  // Find IPv4 address (doesn't contain ':')
  const ipv4 = addresses.find((addr) => !addr.includes(':'));
  if (ipv4) return ipv4;

  // Fall back to first address
  if (addresses.length > 0) return addresses[0];

  // Use host if no addresses
  if (service.host) return service.host;

  return null;
}

/**
 * Discover Android TV devices on the local network using mDNS
 *
 * This function uses react-native-zeroconf to scan for Android TV devices.
 * It looks for both _androidtvremote._tcp and _googlecast._tcp services.
 *
 * @param timeoutMs - Maximum time to wait for responses (default: 5000ms)
 * @param onDeviceFound - Optional callback fired immediately when a device is found
 * @returns Promise resolving to array of discovered devices
 *
 * @example
 * ```typescript
 * const devices = await discoverAndroidTvViaMdns(5000, (device) => {
 *   console.log('Found device:', device.name);
 * });
 * ```
 */
export async function discoverAndroidTvViaMdns(
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  onDeviceFound?: (device: DiscoveredDevice) => void
): Promise<DiscoveredDevice[]> {
  debug.log('Starting mDNS discovery...');
  debug.log(`Timeout: ${timeoutMs}ms`);

  const ZeroconfClass = getZeroconfModule();
  if (!ZeroconfClass) {
    debug.warn('mDNS discovery not available: react-native-zeroconf module not loaded');
    return [];
  }

  debug.log('react-native-zeroconf module loaded successfully');

  return new Promise((resolve) => {
    const discovered = new Map<string, DiscoveredDevice>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let zeroconf: any = null;
    let zeroconf2: any = null;
    let timeoutHandle: NodeJS.Timeout | null = null;
    let isCompleted = false;

    // Helper to add device and trigger callback
    const addDevice = (device: DiscoveredDevice) => {
      if (!discovered.has(device.id)) {
        discovered.set(device.id, device);
        debug.log(`[mDNS] Found Android TV: ${device.name} at ${device.ipAddress}`);
        
        // Trigger real-time callback immediately
        if (onDeviceFound) {
          try {
            onDeviceFound(device);
          } catch (err) {
            debug.warn('onDeviceFound callback error:', err);
          }
        }
      }
    };

    // Cleanup function - always resolves with discovered devices, never rejects
    const cleanup = (reason: string) => {
      if (isCompleted) return;
      isCompleted = true;

      debug.log(`mDNS cleanup triggered: ${reason}`);

      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }

      // Stop first zeroconf instance
      if (zeroconf) {
        try {
          zeroconf.stop();
        } catch (stopErr) {
          debug.warn('Error stopping Zeroconf:', stopErr);
        }
        zeroconf = null;
      }

      // Stop second zeroconf instance (Google Cast)
      if (zeroconf2) {
        try {
          zeroconf2.stop();
        } catch (stopErr) {
          debug.warn('Error stopping Zeroconf2:', stopErr);
        }
        zeroconf2 = null;
      }

      const devices = Array.from(discovered.values());
      debug.log(`mDNS discovery completed. Found ${devices.length} device(s)`);
      devices.forEach((d) => {
        debug.log(`  Found Android TV: ${d.name} at ${d.ipAddress}`);
      });
      resolve(devices);
    };

    // Set timeout for overall discovery
    timeoutHandle = setTimeout(() => {
      debug.log('mDNS discovery timeout reached');
      cleanup('timeout');
    }, timeoutMs);

    try {
      debug.log('Creating Zeroconf instance...');
      zeroconf = new ZeroconfClass();

      // Handle errors
      zeroconf.on('error', (err: Error) => {
        debug.error('Zeroconf error:', err.message);
        cleanup('zeroconf_error');
      });

      // Handle start event
      zeroconf.on('start', () => {
        debug.log('Zeroconf scan started');
      });

      // Handle resolved services
      zeroconf.on('resolved', (service: ZeroconfService) => {
        if (isCompleted) return;

        debug.log(`Resolved service: ${service.name}`);
        debug.log(`  Host: ${service.host}`);
        debug.log(`  Port: ${service.port}`);
        debug.log(`  Addresses: ${service.addresses?.join(', ') || 'none'}`);
        debug.log(`  TXT: ${JSON.stringify(service.txt || {})}`);

        const ipAddress = getPrimaryIpAddress(service);
        if (!ipAddress) {
          debug.warn(`No IP address found for service ${service.name}`);
          return;
        }

        const deviceInfo = parseDeviceInfo(service);

        // Skip if already discovered
        if (discovered.has(deviceInfo.id)) {
          debug.log(`Duplicate device skipped: ${deviceInfo.id}`);
          return;
        }

        const device: DiscoveredDevice = {
          id: deviceInfo.id,
          name: deviceInfo.name,
          ipAddress: ipAddress,
          // Use the service port for Android TV Remote, or ADB port for general control
          port: service.port === ANDROID_TV_REMOTE_PORT ? service.port : ADB_DEFAULT_PORT,
          platform: TVPlatform.AndroidTV,
        };

        // Use addDevice helper to trigger callback
        addDevice(device);
      });

      // Handle found services (before resolution)
      zeroconf.on('found', (name: string) => {
        debug.log(`Found service (pending resolution): ${name}`);
      });

      // Handle removed services
      zeroconf.on('remove', (name: string) => {
        debug.log(`Service removed: ${name}`);
      });

      // Start scanning for Android TV services
      debug.log('Starting scan for Android TV services...');

      // Scan for Android TV Remote service
      // react-native-zeroconf signature: scan(type, protocol, domain)
      // type: service name without underscore prefix
      // protocol: 'tcp' or 'udp'
      // domain: usually 'local.' (optional)
      zeroconf.scan(ANDROID_TV_SERVICE_NAME, 'tcp', 'local.');

      // Also scan for Google Cast (to find Google TV devices)
      setTimeout(() => {
        if (!isCompleted) {
          debug.log('Also scanning for Google Cast services...');
          try {
            // Create a second zeroconf instance for Google Cast
            zeroconf2 = new ZeroconfClass();

            zeroconf2.on('error', (err: Error) => {
              debug.warn('Zeroconf2 (GoogleCast) error:', err);
              // Don't cleanup, just log - this is a secondary scan
            });

            zeroconf2.on('resolved', (service: ZeroconfService) => {
              if (isCompleted) return;

              // Check if this is a Google TV device (not just a Chromecast)
              const txt = service.txt || {};
              const isAndroidTv =
                txt.md?.toLowerCase().includes('android') ||
                txt.md?.toLowerCase().includes('google tv') ||
                txt.md?.toLowerCase().includes('chromecast with google tv');

              if (!isAndroidTv) {
                debug.log(`Skipping non-Android TV Google Cast device: ${service.name}`);
                return;
              }

              const ipAddress = getPrimaryIpAddress(service);
              if (!ipAddress) return;

              const deviceInfo = parseDeviceInfo(service);

              if (!discovered.has(deviceInfo.id)) {
                const device: DiscoveredDevice = {
                  id: deviceInfo.id,
                  name: deviceInfo.name,
                  ipAddress: ipAddress,
                  port: ADB_DEFAULT_PORT,
                  platform: TVPlatform.AndroidTV,
                };
                // Use addDevice helper to trigger callback
                addDevice(device);
                debug.log(`[mDNS/Cast] Found Google TV: ${device.name} at ${device.ipAddress}`);
              }
            });

            zeroconf2.scan(GOOGLECAST_SERVICE_NAME, 'tcp', 'local.');
            // zeroconf2 will be stopped in the cleanup function
          } catch (err) {
            debug.warn('Failed to start Google Cast scan:', err);
          }
        }
      }, 100);
    } catch (err) {
      debug.error('Failed to create Zeroconf instance:', err);
      cleanup('create_zeroconf_error');
    }
  });
}

/**
 * Check if mDNS discovery is supported on this platform
 *
 * mDNS requires native module support, which may not be available
 * in all environments (e.g., Expo Go).
 *
 * @returns true if mDNS discovery is likely to work
 */
export function isMdnsSupported(): boolean {
  try {
    const ZeroconfClass = getZeroconfModule();
    const supported = ZeroconfClass !== null;
    debug.log(`mDNS support check: ${supported ? 'available' : 'not available'}`);
    return supported;
  } catch (err) {
    debug.warn('mDNS support check failed:', err);
    return false;
  }
}
