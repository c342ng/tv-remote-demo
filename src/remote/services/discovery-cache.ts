/**
 * Discovery Cache Service
 *
 * Provides persistent caching for discovered devices to enable:
 * - Fast startup by verifying cached devices first
 * - Reduced network scanning when devices are already known
 * - Tracking of device discovery history
 *
 * Cache strategy:
 * - Devices are cached with lastSeen and lastVerified timestamps
 * - Stale devices (>7 days unverified) are marked but kept
 * - Old devices (>30 days unseen) are automatically cleaned
 *
 * @module discovery-cache
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DiscoveredDevice } from '../domain/remote-interfaces';
import { TVPlatform } from '../domain/models';

/** Storage key for discovery cache */
const CACHE_STORAGE_KEY = '@tv_remote/discovery_cache';

/** Cache expiry thresholds in milliseconds */
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CLEANUP_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Discovery method types */
export type DiscoveryMethod = 'ssdp' | 'mdns' | 'scan' | 'manual' | 'cache';

/** Debug logger */
const DEBUG_TAG = '[DiscoveryCache]';
const debug = {
  log: (...args: unknown[]) => console.log(DEBUG_TAG, ...args),
  warn: (...args: unknown[]) => console.warn(DEBUG_TAG, ...args),
  error: (...args: unknown[]) => console.error(DEBUG_TAG, ...args),
};

/**
 * Extended device interface for cached devices
 */
export interface CachedDevice extends DiscoveredDevice {
  /** Timestamp when device was last seen (any discovery method) */
  lastSeen: string;
  /** Timestamp when device was last successfully verified (reachable) */
  lastVerified: string | null;
  /** Method used to discover this device */
  discoveryMethod: DiscoveryMethod;
  /** Whether the device is considered stale (not verified recently) */
  isStale?: boolean;
}

/**
 * Cache data structure
 */
interface CacheData {
  version: number;
  devices: CachedDevice[];
  lastUpdated: string;
}

/** Current cache version for migration purposes */
const CACHE_VERSION = 1;

/**
 * Discovery Cache Service
 *
 * Manages persistent caching of discovered devices
 */
class DiscoveryCacheService {
  private _cache: Map<string, CachedDevice> = new Map();
  private _initialized = false;
  private _initPromise: Promise<void> | null = null;

  /**
   * Initialize the cache by loading from persistent storage
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = this._loadCache();
    await this._initPromise;
    this._initialized = true;
  }

  /**
   * Load cache from AsyncStorage
   */
  private async _loadCache(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(CACHE_STORAGE_KEY);
      if (!stored) {
        debug.log('No existing cache found, starting fresh');
        return;
      }

      const data: CacheData = JSON.parse(stored);

      // Handle version migration if needed
      if (data.version !== CACHE_VERSION) {
        debug.warn(`Cache version mismatch: ${data.version} -> ${CACHE_VERSION}, migrating...`);
        // For now, just clear old cache; add migration logic as needed
        await this.clearCache();
        return;
      }

      // Load devices into memory and apply cleanup
      const now = Date.now();
      let cleanedCount = 0;

      for (const device of data.devices) {
        const lastSeenTime = new Date(device.lastSeen).getTime();
        const age = now - lastSeenTime;

        // Skip devices that haven't been seen in 30 days
        if (age > CLEANUP_THRESHOLD_MS) {
          cleanedCount++;
          continue;
        }

        // Mark stale devices
        const lastVerifiedTime = device.lastVerified
          ? new Date(device.lastVerified).getTime()
          : lastSeenTime;
        device.isStale = now - lastVerifiedTime > STALE_THRESHOLD_MS;

        const key = this._getDeviceKey(device);
        this._cache.set(key, device);
      }

      if (cleanedCount > 0) {
        debug.log(`Cleaned ${cleanedCount} old devices from cache`);
        await this._saveCache();
      }

      debug.log(`Loaded ${this._cache.size} cached devices`);
    } catch (err) {
      debug.error('Failed to load cache:', err);
      this._cache.clear();
    }
  }

  /**
   * Save cache to AsyncStorage
   */
  private async _saveCache(): Promise<void> {
    try {
      const data: CacheData = {
        version: CACHE_VERSION,
        devices: Array.from(this._cache.values()),
        lastUpdated: new Date().toISOString(),
      };

      await AsyncStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(data));
      debug.log(`Saved ${data.devices.length} devices to cache`);
    } catch (err) {
      debug.error('Failed to save cache:', err);
    }
  }

  /**
   * Generate a unique key for a device
   */
  private _getDeviceKey(device: DiscoveredDevice): string {
    return `${device.ipAddress}-${device.platform}`;
  }

  /**
   * Get all cached devices
   */
  async getCachedDevices(): Promise<CachedDevice[]> {
    await this.initialize();
    return Array.from(this._cache.values());
  }

  /**
   * Get cached devices that are not stale (recently verified)
   */
  async getFreshDevices(): Promise<CachedDevice[]> {
    const devices = await this.getCachedDevices();
    return devices.filter((d) => !d.isStale);
  }

  /**
   * Get stale devices (need re-verification)
   */
  async getStaleDevices(): Promise<CachedDevice[]> {
    const devices = await this.getCachedDevices();
    return devices.filter((d) => d.isStale);
  }

  /**
   * Update cache with a discovered/verified device
   *
   * @param device The device to cache or update
   * @param verified Whether the device was verified as reachable
   * @param method The discovery method used
   */
  async updateCache(
    device: DiscoveredDevice,
    verified: boolean = false,
    method: DiscoveryMethod = 'scan'
  ): Promise<void> {
    await this.initialize();

    const key = this._getDeviceKey(device);
    const now = new Date().toISOString();

    const existing = this._cache.get(key);

    const cached: CachedDevice = {
      ...device,
      lastSeen: now,
      lastVerified: verified ? now : (existing?.lastVerified ?? null),
      discoveryMethod: method,
      isStale: false,
    };

    this._cache.set(key, cached);
    await this._saveCache();

    debug.log(
      `Updated cache: ${device.name} (${device.ipAddress}) via ${method}, verified: ${verified}`
    );
  }

  /**
   * Mark a device as verified (reachable)
   */
  async markVerified(deviceId: string): Promise<void> {
    await this.initialize();

    for (const [key, device] of this._cache.entries()) {
      if (device.id === deviceId) {
        device.lastVerified = new Date().toISOString();
        device.isStale = false;
        this._cache.set(key, device);
        await this._saveCache();
        debug.log(`Marked device as verified: ${device.name}`);
        return;
      }
    }
  }

  /**
   * Remove a device from cache
   */
  async removeFromCache(deviceId: string): Promise<void> {
    await this.initialize();

    for (const [key, device] of this._cache.entries()) {
      if (device.id === deviceId) {
        this._cache.delete(key);
        await this._saveCache();
        debug.log(`Removed device from cache: ${device.name}`);
        return;
      }
    }
  }

  /**
   * Remove a device by IP and platform
   */
  async removeByKey(ipAddress: string, platform: TVPlatform): Promise<void> {
    await this.initialize();

    const key = `${ipAddress}-${platform}`;
    if (this._cache.has(key)) {
      const device = this._cache.get(key);
      this._cache.delete(key);
      await this._saveCache();
      debug.log(`Removed device from cache: ${device?.name} (${key})`);
    }
  }

  /**
   * Clear all cached devices
   */
  async clearCache(): Promise<void> {
    this._cache.clear();
    await AsyncStorage.removeItem(CACHE_STORAGE_KEY);
    debug.log('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    total: number;
    fresh: number;
    stale: number;
    byPlatform: Record<string, number>;
    byMethod: Record<string, number>;
  }> {
    const devices = await this.getCachedDevices();

    const byPlatform: Record<string, number> = {};
    const byMethod: Record<string, number> = {};
    let fresh = 0;
    let stale = 0;

    for (const device of devices) {
      // Count by platform
      byPlatform[device.platform] = (byPlatform[device.platform] || 0) + 1;

      // Count by discovery method
      byMethod[device.discoveryMethod] = (byMethod[device.discoveryMethod] || 0) + 1;

      // Count fresh vs stale
      if (device.isStale) {
        stale++;
      } else {
        fresh++;
      }
    }

    return {
      total: devices.length,
      fresh,
      stale,
      byPlatform,
      byMethod,
    };
  }

  /**
   * Check if a device is cached
   */
  async isCached(ipAddress: string, platform: TVPlatform): Promise<boolean> {
    await this.initialize();
    const key = `${ipAddress}-${platform}`;
    return this._cache.has(key);
  }

  /**
   * Get a specific cached device
   */
  async getDevice(ipAddress: string, platform: TVPlatform): Promise<CachedDevice | null> {
    await this.initialize();
    const key = `${ipAddress}-${platform}`;
    return this._cache.get(key) ?? null;
  }
}

// Export singleton instance
export const discoveryCache = new DiscoveryCacheService();

// Export class for testing
export { DiscoveryCacheService };
