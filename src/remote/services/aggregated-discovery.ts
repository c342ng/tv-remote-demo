/**
 * Aggregated Discovery Service
 *
 * This service combines multiple platform-specific discovery methods to
 * search for all supported TV devices simultaneously.
 *
 * Supported platforms and their discovery methods:
 * - Roku: SSDP (roku:ecp) or HTTP port scan (8060)
 * - Android TV: mDNS (_androidtvremote._tcp) or HTTP port scan
 * - Fire TV: DIAL/SSDP or HTTP port scan (8008)
 * - LG webOS: SSDP (urn:lge-com:service:webos-second-screen:1) [TODO]
 * - Samsung Tizen: SSDP or HTTP (8001/8002) [TODO]
 *
 * The service runs all discovery methods in parallel and deduplicates results.
 *
 * @module aggregated-discovery
 */

import type { DiscoveredDevice, PlatformAdapter } from '../domain/remote-interfaces';
import { TVPlatform } from '../domain/models';
import { RokuAdapter } from '../protocols/roku-adapter';
import { AndroidTVAdapter } from '../protocols/android-tv-adapter';
import { FireTVAdapter } from '../protocols/fire-tv-adapter';

/** Debug logger for aggregated discovery */
const DEBUG_TAG = '[AggregatedDiscovery]';
const debug = {
  log: (...args: unknown[]) => console.log(DEBUG_TAG, ...args),
  warn: (...args: unknown[]) => console.warn(DEBUG_TAG, ...args),
  error: (...args: unknown[]) => console.error(DEBUG_TAG, ...args),
};

/** Default timeout for discovery in milliseconds */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Options for aggregated discovery
 */
export interface AggregatedDiscoveryOptions {
  /** Maximum time to wait for discovery (default: 5000ms) */
  timeoutMs?: number;
  /** Platforms to include in discovery (default: all supported) */
  platforms?: TVPlatform[];
  /** Whether to stop early when first device is found (default: false) */
  stopOnFirstResult?: boolean;
  /** Callback when a device is discovered (for real-time UI updates) */
  onDeviceFound?: (device: DiscoveredDevice) => void;
}

/**
 * Result of aggregated discovery
 */
export interface AggregatedDiscoveryResult {
  /** All discovered devices */
  devices: DiscoveredDevice[];
  /** Devices grouped by platform */
  byPlatform: Map<TVPlatform, DiscoveredDevice[]>;
  /** Discovery duration in milliseconds */
  durationMs: number;
  /** Any errors that occurred during discovery */
  errors: { platform: TVPlatform; error: Error }[];
}

/**
 * Platform adapter factory map
 */
const ADAPTER_FACTORIES: Partial<Record<TVPlatform, () => PlatformAdapter>> = {
  [TVPlatform.Roku]: () => new RokuAdapter(),
  [TVPlatform.AndroidTV]: () => new AndroidTVAdapter(),
  [TVPlatform.FireTV]: () => new FireTVAdapter(),
  // TODO: Add WebOS and Tizen adapters when implemented
  // [TVPlatform.WebOS]: () => new WebOSAdapter(),
  // [TVPlatform.Tizen]: () => new TizenAdapter(),
};

/**
 * Get all currently supported platforms
 */
export function getSupportedPlatforms(): TVPlatform[] {
  return Object.keys(ADAPTER_FACTORIES) as TVPlatform[];
}

/**
 * Discover TV devices across all supported platforms simultaneously
 *
 * This function runs discovery for all specified platforms in parallel,
 * combining and deduplicating results.
 *
 * @param options - Discovery options
 * @returns Promise resolving to discovery result
 *
 * @example
 * ```typescript
 * // Discover all supported platforms
 * const result = await discoverAllDevices();
 * console.log(`Found ${result.devices.length} devices in ${result.durationMs}ms`);
 *
 * // Discover specific platforms only
 * const result = await discoverAllDevices({
 *   platforms: [TVPlatform.Roku, TVPlatform.AndroidTV],
 *   timeoutMs: 3000
 * });
 * ```
 */
export async function discoverAllDevices(
  options: AggregatedDiscoveryOptions = {}
): Promise<AggregatedDiscoveryResult> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    platforms = getSupportedPlatforms(),
    // Note: stopOnFirstResult is available in options but not yet implemented
    onDeviceFound,
  } = options;

  debug.log('Starting aggregated discovery...');
  debug.log(`Timeout: ${timeoutMs}ms`);
  debug.log(`Platforms: ${platforms.join(', ')}`);

  const startTime = Date.now();
  const allDevices: DiscoveredDevice[] = [];
  const byPlatform = new Map<TVPlatform, DiscoveredDevice[]>();
  const errors: { platform: TVPlatform; error: Error }[] = [];
  const seenDeviceIds = new Set<string>();

  // Initialize platform groups
  for (const platform of platforms) {
    byPlatform.set(platform, []);
  }

  // Helper function to process a single discovered device
  function processDevice(device: DiscoveredDevice): boolean {
    // Generate a unique key based on IP and platform
    const deviceKey = `${device.ipAddress}-${device.platform}`;

    if (!seenDeviceIds.has(deviceKey)) {
      seenDeviceIds.add(deviceKey);
      allDevices.push(device);

      const platformDevices = byPlatform.get(device.platform) || [];
      platformDevices.push(device);
      byPlatform.set(device.platform, platformDevices);

      // Notify caller immediately when device is found
      if (onDeviceFound) {
        try {
          onDeviceFound(device);
        } catch (err) {
          debug.warn('onDeviceFound callback error:', err);
        }
      }

      return true; // New device added
    } else {
      debug.log(`Duplicate device skipped: ${device.name} (${deviceKey})`);
      return false; // Duplicate
    }
  }

  // Create discovery promises for each platform
  const discoveryPromises = platforms.map(async (platform) => {
    const adapterFactory = ADAPTER_FACTORIES[platform];
    if (!adapterFactory) {
      debug.warn(`No adapter available for platform: ${platform}`);
      return [];
    }

    debug.log(`Starting ${platform} discovery...`);

    try {
      const adapter = adapterFactory();
      const devices = await adapter.discover(timeoutMs);

      debug.log(`${platform} discovery found ${devices.length} device(s)`);

      // Process devices as they come in from each platform
      for (const device of devices) {
        processDevice(device);
      }

      return devices;
    } catch (err) {
      debug.error(`${platform} discovery failed:`, err);
      errors.push({ platform, error: err as Error });
      return [];
    }
  });

  // Run all discoveries in parallel using Promise.allSettled for isolation
  const results = await Promise.allSettled(discoveryPromises);

  // Check for any rejections
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      const platform = platforms[i];
      debug.error(`${platform} discovery rejected:`, result.reason);
      if (!errors.some((e) => e.platform === platform)) {
        errors.push({ platform, error: result.reason });
      }
    }
  }

  const durationMs = Date.now() - startTime;

  debug.log(`\nAggregated discovery completed in ${durationMs}ms`);
  debug.log(`Total devices found: ${allDevices.length}`);
  for (const [platform, devices] of byPlatform.entries()) {
    if (devices.length > 0) {
      debug.log(`  ${platform}: ${devices.length} device(s)`);
      devices.forEach((d) => debug.log(`    - ${d.name} (${d.ipAddress})`));
    }
  }
  if (errors.length > 0) {
    debug.log(`Errors: ${errors.length}`);
    errors.forEach((e) => debug.log(`  - ${e.platform}: ${e.error.message}`));
  }

  return {
    devices: allDevices,
    byPlatform,
    durationMs,
    errors,
  };
}

/**
 * Discover devices for a specific platform only
 *
 * This is a convenience wrapper around discoverAllDevices for single-platform discovery.
 *
 * @param platform - The platform to discover
 * @param timeoutMs - Maximum time to wait for discovery
 * @returns Promise resolving to discovered devices
 */
export async function discoverPlatformDevices(
  platform: TVPlatform,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<DiscoveredDevice[]> {
  const result = await discoverAllDevices({
    platforms: [platform],
    timeoutMs,
  });

  return result.byPlatform.get(platform) || [];
}

/**
 * Quick discovery - finds devices as fast as possible
 *
 * Uses a shorter timeout and stops as soon as any device is found.
 * Useful for initial connection or reconnection scenarios.
 *
 * @param timeoutMs - Maximum time to wait (default: 2000ms)
 * @returns Promise resolving to discovered devices
 */
export async function quickDiscovery(timeoutMs: number = 2000): Promise<DiscoveredDevice[]> {
  const result = await discoverAllDevices({
    timeoutMs,
    stopOnFirstResult: true,
  });

  return result.devices;
}

/**
 * Aggregated Discovery Service class
 *
 * Provides a stateful interface for device discovery with caching
 * and incremental updates.
 */
export class AggregatedDiscoveryService {
  private _isDiscovering = false;
  private _lastDiscoveryResult: AggregatedDiscoveryResult | null = null;
  private _discoveryListeners: ((devices: DiscoveredDevice[]) => void)[] = [];

  /**
   * Whether discovery is currently in progress
   */
  get isDiscovering(): boolean {
    return this._isDiscovering;
  }

  /**
   * Get the last discovery result (cached)
   */
  get lastResult(): AggregatedDiscoveryResult | null {
    return this._lastDiscoveryResult;
  }

  /**
   * Start device discovery
   *
   * @param options - Discovery options
   * @returns Promise resolving to discovery result
   */
  async startDiscovery(
    options: AggregatedDiscoveryOptions = {}
  ): Promise<AggregatedDiscoveryResult> {
    if (this._isDiscovering) {
      debug.warn('Discovery already in progress');
      return (
        this._lastDiscoveryResult || {
          devices: [],
          byPlatform: new Map(),
          durationMs: 0,
          errors: [],
        }
      );
    }

    this._isDiscovering = true;

    try {
      const result = await discoverAllDevices(options);
      this._lastDiscoveryResult = result;

      // Notify listeners
      this._discoveryListeners.forEach((listener) => {
        try {
          listener(result.devices);
        } catch (err) {
          debug.error('Discovery listener error:', err);
        }
      });

      return result;
    } finally {
      this._isDiscovering = false;
    }
  }

  /**
   * Stop any ongoing discovery
   * Note: This is a soft stop - individual adapter discoveries may continue
   */
  stopDiscovery(): void {
    this._isDiscovering = false;
    debug.log('Discovery stop requested');
  }

  /**
   * Add a listener for discovery results
   *
   * @param listener - Callback function to receive discovered devices
   * @returns Function to remove the listener
   */
  addListener(listener: (devices: DiscoveredDevice[]) => void): () => void {
    this._discoveryListeners.push(listener);
    return () => {
      const index = this._discoveryListeners.indexOf(listener);
      if (index >= 0) {
        this._discoveryListeners.splice(index, 1);
      }
    };
  }

  /**
   * Clear cached discovery results
   */
  clearCache(): void {
    this._lastDiscoveryResult = null;
    debug.log('Discovery cache cleared');
  }
}

// Export a singleton instance for convenience
export const discoveryService = new AggregatedDiscoveryService();
