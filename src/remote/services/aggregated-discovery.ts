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
 * UPDATED: Now implements three-phase discovery:
 * 1. Cache verification - verify cached devices first
 * 2. Broadcast discovery - SSDP/mDNS passive listening
 * 3. Active scanning - port scan by priority blocks
 *
 * @module aggregated-discovery
 */

import type { DiscoveredDevice, PlatformAdapter } from '../domain/remote-interfaces';
import { TVPlatform } from '../domain/models';
import { RokuAdapter } from '../protocols/roku-adapter';
import { AndroidTVAdapter } from '../protocols/android-tv-adapter';
import { FireTVAdapter } from '../protocols/fire-tv-adapter';
import { WebOSAdapter } from '../protocols/webos-adapter';
import { TizenAdapter } from '../protocols/tizen-adapter';
import { discoveryCache } from './discovery-cache';
import { getDeviceNetworkInfo, generateScanBlocks, type ScanBlock } from './network-utils';
import { probePort } from './port-scanner';
import { runWithConcurrency, delay } from '../utils/concurrency';

/** Debug logger for aggregated discovery */
const DEBUG_TAG = '[AggregatedDiscovery]';
const debug = {
  log: (...args: unknown[]) => console.log(DEBUG_TAG, ...args),
  warn: (...args: unknown[]) => console.warn(DEBUG_TAG, ...args),
  error: (...args: unknown[]) => console.error(DEBUG_TAG, ...args),
};

/** Default timeout for discovery in milliseconds */
const DEFAULT_TIMEOUT_MS = 5000;

/** Broadcast interval in milliseconds */
const BROADCAST_INTERVAL_MS = 5000;

/** Default concurrency for scanning */
const DEFAULT_SCAN_CONCURRENCY = 50;

/** Discovery phase types */
export type DiscoveryPhase = 'idle' | 'cache-verify' | 'broadcast' | 'scan' | 'complete';

/**
 * Discovery event emitter interface
 */
export interface DiscoveryEventEmitter {
  /** Called when a new device is found */
  onDeviceFound?: (device: DiscoveredDevice) => void;
  /** Called when a device becomes unreachable */
  onDeviceLost?: (deviceId: string) => void;
  /** Called when discovery phase changes */
  onPhaseChange?: (phase: DiscoveryPhase, progress?: number) => void;
  /** Called on discovery error */
  onError?: (error: Error, platform?: TVPlatform) => void;
}

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
  /** Callback when discovery phase changes */
  onPhaseChange?: (phase: DiscoveryPhase, progress?: number) => void;
  /** Whether to skip cache verification (default: false) */
  skipCacheVerification?: boolean;
  /** Whether to skip broadcast discovery (default: false) */
  skipBroadcast?: boolean;
  /** Maximum concurrent scans (default: 50) */
  scanConcurrency?: number;
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
  /** Number of cached devices that were verified */
  cachedDevicesVerified?: number;
  /** Number of scan blocks processed */
  blocksScanned?: number;
}

/** Port mapping for each platform */
const PLATFORM_PORTS: Record<TVPlatform, number[]> = {
  [TVPlatform.Roku]: [8060],
  [TVPlatform.AndroidTV]: [5555, 6466], // ADB port, Android TV Remote
  [TVPlatform.FireTV]: [5555, 8008], // ADB port, DIAL
  [TVPlatform.WebOS]: [3000, 3001], // WebOS WebSocket
  [TVPlatform.Tizen]: [8001, 8002], // Samsung WebSocket
};

/**
 * Platform adapter factory map
 */
const ADAPTER_FACTORIES: Partial<Record<TVPlatform, () => PlatformAdapter>> = {
  [TVPlatform.Roku]: () => new RokuAdapter(),
  [TVPlatform.AndroidTV]: () => new AndroidTVAdapter(),
  [TVPlatform.FireTV]: () => new FireTVAdapter(),
  [TVPlatform.WebOS]: () => new WebOSAdapter(),
  [TVPlatform.Tizen]: () => new TizenAdapter(),
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

  // Helper function to check if platform A is more specific than platform B
  function isPlatformMoreSpecific(a: TVPlatform, b: TVPlatform): boolean {
    // Fire TV is a specific type of Android device
    if (a === TVPlatform.FireTV && b === TVPlatform.AndroidTV) return true;
    return false;
  }

  // Helper function to process a single discovered device
  // Uses IP-only deduplication to prevent Fire TV/Android TV duplicates
  function processDevice(device: DiscoveredDevice): boolean {
    // Generate a unique key based on IP only
    const deviceKey = device.ipAddress;

    const existingDeviceId = Array.from(seenDeviceIds).find((id) => id === deviceKey);

    if (existingDeviceId) {
      // Find the existing device
      const existingDevice = allDevices.find((d) => d.ipAddress === deviceKey);
      
      if (existingDevice) {
        if (existingDevice.platform === device.platform) {
          debug.log(`Duplicate device skipped: ${device.name} (${deviceKey})`);
          return false;
        }

        // Check if new device is more specific
        if (isPlatformMoreSpecific(device.platform, existingDevice.platform)) {
          debug.log(`Replacing ${existingDevice.platform} with ${device.platform} at ${deviceKey}`);
          
          // Remove from allDevices and byPlatform
          const index = allDevices.indexOf(existingDevice);
          if (index >= 0) allDevices.splice(index, 1);
          
          const oldPlatformDevices = byPlatform.get(existingDevice.platform) || [];
          const oldIndex = oldPlatformDevices.indexOf(existingDevice);
          if (oldIndex >= 0) oldPlatformDevices.splice(oldIndex, 1);
          
          // Add new device
          allDevices.push(device);
          const platformDevices = byPlatform.get(device.platform) || [];
          platformDevices.push(device);
          byPlatform.set(device.platform, platformDevices);
          
          if (onDeviceFound) {
            try {
              onDeviceFound(device);
            } catch (err) {
              debug.warn('onDeviceFound callback error:', err);
            }
          }
          return true;
        }
        
        debug.log(`Keeping ${existingDevice.platform} over ${device.platform} at ${deviceKey}`);
        return false;
      }
    }

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

/**
 * Discovery Orchestrator
 *
 * Coordinates three-phase discovery:
 * 1. Cache verification - verify cached devices first
 * 2. Broadcast discovery - SSDP/mDNS passive listening
 * 3. Active scanning - port scan by priority blocks
 *
 * Provides real-time deduplication and event emission.
 */
export class DiscoveryOrchestrator {
  private _phase: DiscoveryPhase = 'idle';
  private _isRunning = false;
  private _shouldStop = false;
  private _discoveredDevices = new Map<string, DiscoveredDevice>();
  private _eventEmitter: DiscoveryEventEmitter = {};
  private _scanBlocks: ScanBlock[] = [];
  private _blocksScanned = 0;
  private _broadcastIntervalId: ReturnType<typeof setInterval> | null = null;

  /**
   * Current discovery phase
   */
  get phase(): DiscoveryPhase {
    return this._phase;
  }

  /**
   * Whether discovery is currently running
   */
  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Number of discovered devices
   */
  get deviceCount(): number {
    return this._discoveredDevices.size;
  }

  /**
   * Get all discovered devices
   */
  getDiscoveredDevices(): DiscoveredDevice[] {
    return Array.from(this._discoveredDevices.values());
  }

  /**
   * Set event emitter for discovery events
   */
  setEventEmitter(emitter: DiscoveryEventEmitter): void {
    this._eventEmitter = emitter;
  }

  /**
   * Generate device key for deduplication
   * Uses only IP address to prevent duplicate entries from Fire TV and Android TV
   */
  private _getDeviceKey(device: DiscoveredDevice): string {
    return device.ipAddress;
  }

  /**
   * Check if platform A is more specific than platform B
   * Fire TV is more specific than Android TV (Fire TV is Amazon's Android fork)
   */
  private _isPlatformMoreSpecific(a: TVPlatform, b: TVPlatform): boolean {
    // Fire TV is a specific type of Android device
    if (a === TVPlatform.FireTV && b === TVPlatform.AndroidTV) return true;
    // Tizen/webOS are already specific platforms
    return false;
  }

  /**
   * Process a discovered device (deduplicate and emit)
   * If same IP exists with different platform, keep the more specific one
   */
  private _processDevice(device: DiscoveredDevice, source: string): boolean {
    const key = this._getDeviceKey(device);
    const existingDevice = this._discoveredDevices.get(key);

    if (existingDevice) {
      // Same IP already exists
      if (existingDevice.platform === device.platform) {
        debug.log(`Device already known: ${device.name} at ${device.ipAddress} (via ${source})`);
        return false;
      }

      // Different platform - check which is more specific
      if (this._isPlatformMoreSpecific(device.platform, existingDevice.platform)) {
        debug.log(`Replacing ${existingDevice.platform} with more specific ${device.platform} at ${device.ipAddress}`);
        this._discoveredDevices.set(key, device);
        
        // Update cache
        discoveryCache.updateCache(device, true, source as any).catch((err) => {
          debug.warn('Failed to update cache:', err);
        });

        // Emit event for the updated device
        if (this._eventEmitter.onDeviceFound) {
          try {
            this._eventEmitter.onDeviceFound(device);
          } catch (err) {
            debug.warn('onDeviceFound callback error:', err);
          }
        }
        return true;
      } else if (this._isPlatformMoreSpecific(existingDevice.platform, device.platform)) {
        debug.log(`Keeping more specific ${existingDevice.platform} over ${device.platform} at ${device.ipAddress}`);
        return false;
      } else {
        // Neither is more specific, keep the first one found
        debug.log(`Device already known with different platform: ${device.ipAddress} (${existingDevice.platform} vs ${device.platform})`);
        return false;
      }
    }

    this._discoveredDevices.set(key, device);
    debug.log(`New device found: ${device.name} at ${device.ipAddress} (via ${source})`);

    // Update cache
    discoveryCache.updateCache(device, true, source as any).catch((err) => {
      debug.warn('Failed to update cache:', err);
    });

    // Emit event
    if (this._eventEmitter.onDeviceFound) {
      try {
        this._eventEmitter.onDeviceFound(device);
      } catch (err) {
        debug.warn('onDeviceFound callback error:', err);
      }
    }

    return true;
  }

  /**
   * Change discovery phase and emit event
   */
  private _setPhase(phase: DiscoveryPhase, progress?: number): void {
    this._phase = phase;
    debug.log(`Phase change: ${phase}${progress !== undefined ? ` (${progress}%)` : ''}`);

    if (this._eventEmitter.onPhaseChange) {
      try {
        this._eventEmitter.onPhaseChange(phase, progress);
      } catch (err) {
        debug.warn('onPhaseChange callback error:', err);
      }
    }
  }

  /**
   * Phase 1: Verify cached devices
   */
  private async _verifyCachedDevices(): Promise<number> {
    this._setPhase('cache-verify');

    const cachedDevices = await discoveryCache.getCachedDevices();
    if (cachedDevices.length === 0) {
      debug.log('No cached devices to verify');
      return 0;
    }

    debug.log(`Phase 1: Verifying ${cachedDevices.length} cached devices...`);

    let verifiedCount = 0;

    // Create verification tasks
    const tasks = cachedDevices.map((cached) => async () => {
      if (this._shouldStop) return null;

      // Try to probe the device's port
      const ports = PLATFORM_PORTS[cached.platform] || [8060];
      for (const port of ports) {
        const result = await probePort(cached.ipAddress, port, 1500);
        if (result.isOpen) {
          // Device is reachable
          const device: DiscoveredDevice = {
            id: cached.id,
            name: cached.name,
            ipAddress: cached.ipAddress,
            port: port,
            platform: cached.platform,
          };

          if (this._processDevice(device, 'cache')) {
            verifiedCount++;
            await discoveryCache.markVerified(cached.id);
          }
          return device;
        }
      }

      debug.log(`Cached device not reachable: ${cached.name} (${cached.ipAddress})`);
      return null;
    });

    // Run verification with concurrency
    const { promise } = runWithConcurrency(tasks, DEFAULT_SCAN_CONCURRENCY);
    await promise;

    debug.log(`Cache verification complete: ${verifiedCount}/${cachedDevices.length} verified`);
    return verifiedCount;
  }

  /**
   * Phase 2: Broadcast discovery (SSDP/mDNS)
   */
  private async _startBroadcastDiscovery(
    platforms: TVPlatform[],
    timeoutMs: number
  ): Promise<void> {
    this._setPhase('broadcast');
    debug.log('Phase 2: Starting broadcast discovery...');

    // Create a callback that processes devices through _processDevice
    // This ensures real-time UI updates as devices are found
    const onDeviceFoundCallback = (device: DiscoveredDevice) => {
      this._processDevice(device, 'broadcast');
    };

    // Start periodic broadcast queries
    const runBroadcast = async () => {
      if (this._shouldStop) return;

      debug.log('Sending broadcast queries...');

      // Run platform-specific discovery in parallel
      // Pass the real-time callback to each adapter
      const discoveryPromises = platforms.map(async (platform) => {
        const adapterFactory = ADAPTER_FACTORIES[platform];
        if (!adapterFactory) return [];

        try {
          const adapter = adapterFactory();
          // Pass callback for real-time device discovery
          const devices = await adapter.discover(Math.min(timeoutMs, 2000), {
            onDeviceFound: onDeviceFoundCallback,
          });

          // Note: Devices are already processed via callback, 
          // but we still process them here for any that might have been missed
          for (const device of devices) {
            this._processDevice(device, 'broadcast');
          }

          return devices;
        } catch (err) {
          debug.warn(`${platform} broadcast discovery error:`, err);
          return [];
        }
      });

      await Promise.allSettled(discoveryPromises);
    };

    // Run first broadcast immediately
    await runBroadcast();

    // Set up interval for continuous broadcast
    this._broadcastIntervalId = setInterval(() => {
      if (!this._shouldStop && this._isRunning) {
        runBroadcast();
      } else if (this._broadcastIntervalId) {
        clearInterval(this._broadcastIntervalId);
        this._broadcastIntervalId = null;
      }
    }, BROADCAST_INTERVAL_MS);
  }

  /**
   * Phase 3: Active scanning
   */
  private async _runActiveScan(platforms: TVPlatform[], concurrency: number): Promise<number> {
    this._setPhase('scan', 0);
    debug.log('Phase 3: Starting active scan...');

    // Get network info and generate scan blocks
    const networkInfo = await getDeviceNetworkInfo();
    if (!networkInfo) {
      debug.warn('Could not get network info, skipping active scan');
      return 0;
    }

    this._scanBlocks = generateScanBlocks(
      networkInfo.ipAddress,
      networkInfo.cidrPrefix,
      networkInfo.gateway
    );

    debug.log(`Generated ${this._scanBlocks.length} scan blocks`);

    // Limit blocks for very large networks
    const maxBlocks = 256; // Max /16 network
    const blocksToScan = this._scanBlocks.slice(0, maxBlocks);

    this._blocksScanned = 0;
    let devicesFound = 0;

    // Get all ports to scan
    const portsToScan = new Set<number>();
    for (const platform of platforms) {
      const ports = PLATFORM_PORTS[platform];
      if (ports) {
        ports.forEach((p) => portsToScan.add(p));
      }
    }

    debug.log(`Scanning ports: ${Array.from(portsToScan).join(', ')}`);

    for (const block of blocksToScan) {
      if (this._shouldStop) break;

      // Update progress
      const progress = Math.round((this._blocksScanned / blocksToScan.length) * 100);
      this._setPhase('scan', progress);

      // Generate IPs for this block
      const ips: string[] = [];
      for (let i = 1; i <= 254; i++) {
        const ip = `${block.prefix}${i}`;
        if (ip !== networkInfo.ipAddress) {
          ips.push(ip);
        }
      }

      // Scan each IP for all ports
      const tasks = ips.flatMap((ip) =>
        Array.from(portsToScan).map((port) => async () => {
          if (this._shouldStop) return null;

          const result = await probePort(ip, port, 1000);
          if (!result.isOpen) return null;

          // Determine platform based on port
          let detectedPlatform: TVPlatform | null = null;
          for (const [platform, ports] of Object.entries(PLATFORM_PORTS)) {
            if (ports.includes(port)) {
              detectedPlatform = platform as TVPlatform;
              break;
            }
          }

          if (!detectedPlatform || !platforms.includes(detectedPlatform)) return null;

          // Try to get device info using platform adapter
          const adapterFactory = ADAPTER_FACTORIES[detectedPlatform];
          if (!adapterFactory) return null;

          // Create a minimal device for now
          const device: DiscoveredDevice = {
            id: `${detectedPlatform}-${ip}`,
            name: `${detectedPlatform} Device (${ip})`,
            ipAddress: ip,
            port,
            platform: detectedPlatform,
          };

          if (this._processDevice(device, 'scan')) {
            devicesFound++;
          }

          return device;
        })
      );

      // Run block scan with concurrency
      const { promise } = runWithConcurrency(tasks, concurrency);
      await promise;

      this._blocksScanned++;
    }

    debug.log(
      `Active scan complete: ${devicesFound} devices found in ${this._blocksScanned} blocks`
    );
    return devicesFound;
  }

  /**
   * Start three-phase discovery
   */
  async startDiscovery(
    options: AggregatedDiscoveryOptions = {}
  ): Promise<AggregatedDiscoveryResult> {
    const {
      timeoutMs = DEFAULT_TIMEOUT_MS,
      platforms = getSupportedPlatforms(),
      onDeviceFound,
      onPhaseChange,
      skipCacheVerification = false,
      skipBroadcast = false,
      scanConcurrency = DEFAULT_SCAN_CONCURRENCY,
    } = options;

    if (this._isRunning) {
      debug.warn('Discovery already in progress');
      return this._buildResult(Date.now());
    }

    // Reset state
    this._isRunning = true;
    this._shouldStop = false;
    this._discoveredDevices.clear();
    this._blocksScanned = 0;

    // Set up event emitter
    const existingEmitter = this._eventEmitter || {};
    this._eventEmitter = {
      ...existingEmitter,
      ...(onDeviceFound ? { onDeviceFound } : {}),
      ...(onPhaseChange ? { onPhaseChange } : {}),
    };

    const startTime = Date.now();
    let cachedDevicesVerified = 0;

    debug.log('Starting three-phase discovery...');
    debug.log(`Timeout: ${timeoutMs}ms, Platforms: ${platforms.join(', ')}`);

    try {
      // Phase 1: Cache verification
      if (!skipCacheVerification) {
        cachedDevicesVerified = await this._verifyCachedDevices();
      }

      if (this._shouldStop) {
        return this._buildResult(startTime, cachedDevicesVerified);
      }

      // Phase 2 & 3 run in parallel
      // Broadcast runs continuously, scan runs once
      // Note: broadcastPromise is intentionally not awaited as broadcast continues in background
      void (skipBroadcast
        ? Promise.resolve()
        : this._startBroadcastDiscovery(platforms, timeoutMs));

      const scanPromise = this._runActiveScan(platforms, scanConcurrency);

      // Wait for scan to complete (broadcast continues)
      await scanPromise;

      // Give broadcast a bit more time
      await delay(1000);
    } catch (err) {
      debug.error('Discovery error:', err);
      if (this._eventEmitter.onError) {
        this._eventEmitter.onError(err as Error);
      }
    } finally {
      // Stop broadcast interval
      if (this._broadcastIntervalId) {
        clearInterval(this._broadcastIntervalId);
        this._broadcastIntervalId = null;
      }

      this._isRunning = false;
      this._setPhase('complete');
    }

    return this._buildResult(startTime, cachedDevicesVerified);
  }

  /**
   * Build discovery result
   */
  private _buildResult(startTime: number, cachedDevicesVerified = 0): AggregatedDiscoveryResult {
    const devices = this.getDiscoveredDevices();
    const byPlatform = new Map<TVPlatform, DiscoveredDevice[]>();

    for (const device of devices) {
      const list = byPlatform.get(device.platform) || [];
      list.push(device);
      byPlatform.set(device.platform, list);
    }

    return {
      devices,
      byPlatform,
      durationMs: Date.now() - startTime,
      errors: [],
      cachedDevicesVerified,
      blocksScanned: this._blocksScanned,
    };
  }

  /**
   * Stop discovery
   */
  stopDiscovery(): void {
    debug.log('Stopping discovery...');
    this._shouldStop = true;

    if (this._broadcastIntervalId) {
      clearInterval(this._broadcastIntervalId);
      this._broadcastIntervalId = null;
    }
  }

  /**
   * Clear discovered devices
   */
  clear(): void {
    this._discoveredDevices.clear();
  }
}

// Export singleton orchestrator
export const discoveryOrchestrator = new DiscoveryOrchestrator();
