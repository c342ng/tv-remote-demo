/**
 * Unit tests for discovery-cache.ts
 *
 * Tests for:
 * - Cache read/write operations
 * - Persistence and reload
 * - Expiry and cleanup logic
 * - Cache update merging
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { TVPlatform } from '../../../src/remote/domain/models';

// Import after mocking
import { DiscoveryCacheService } from '../../../src/remote/services/discovery-cache';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('discovery-cache', () => {
  let cache: DiscoveryCacheService;

  // Sample device for testing
  const sampleDevice = {
    id: 'roku-192.168.1.100',
    name: 'Living Room Roku',
    ipAddress: '192.168.1.100',
    port: 8060,
    platform: TVPlatform.Roku,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    cache = new DiscoveryCacheService();
    mockedAsyncStorage.getItem.mockResolvedValue(null);
    mockedAsyncStorage.setItem.mockResolvedValue(undefined);
    mockedAsyncStorage.removeItem.mockResolvedValue(undefined);
  });

  describe('initialization', () => {
    it('should start with empty cache when no stored data', async () => {
      mockedAsyncStorage.getItem.mockResolvedValue(null);

      const devices = await cache.getCachedDevices();

      expect(devices).toEqual([]);
      expect(mockedAsyncStorage.getItem).toHaveBeenCalledWith('@tv_remote/discovery_cache');
    });

    it('should load cached devices from storage', async () => {
      const cachedData = {
        version: 1,
        devices: [
          {
            ...sampleDevice,
            lastSeen: new Date().toISOString(),
            lastVerified: new Date().toISOString(),
            discoveryMethod: 'ssdp',
          },
        ],
        lastUpdated: new Date().toISOString(),
      };

      mockedAsyncStorage.getItem.mockResolvedValue(JSON.stringify(cachedData));

      const devices = await cache.getCachedDevices();

      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe('Living Room Roku');
    });

    it('should only initialize once', async () => {
      mockedAsyncStorage.getItem.mockResolvedValue(null);

      // Call multiple times
      await cache.getCachedDevices();
      await cache.getCachedDevices();
      await cache.getCachedDevices();

      // Should only read storage once
      expect(mockedAsyncStorage.getItem).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateCache', () => {
    it('should add new device to cache', async () => {
      await cache.updateCache(sampleDevice, false, 'scan');

      const devices = await cache.getCachedDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].ipAddress).toBe('192.168.1.100');
      expect(devices[0].discoveryMethod).toBe('scan');
    });

    it('should update existing device', async () => {
      // Add device first
      await cache.updateCache(sampleDevice, false, 'scan');

      // Update with new info
      const updatedDevice = { ...sampleDevice, name: 'Updated Roku' };
      await cache.updateCache(updatedDevice, true, 'ssdp');

      const devices = await cache.getCachedDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe('Updated Roku');
      expect(devices[0].discoveryMethod).toBe('ssdp');
      expect(devices[0].lastVerified).not.toBeNull();
    });

    it('should set lastVerified when verified is true', async () => {
      await cache.updateCache(sampleDevice, true, 'scan');

      const devices = await cache.getCachedDevices();
      expect(devices[0].lastVerified).not.toBeNull();
      expect(devices[0].isStale).toBe(false);
    });

    it('should preserve lastVerified when verified is false', async () => {
      // Add verified device
      await cache.updateCache(sampleDevice, true, 'scan');
      const devices1 = await cache.getCachedDevices();
      const originalVerified = devices1[0].lastVerified;

      // Update without verification
      const updatedDevice = { ...sampleDevice, name: 'Updated' };
      await cache.updateCache(updatedDevice, false, 'scan');

      const devices2 = await cache.getCachedDevices();
      expect(devices2[0].lastVerified).toBe(originalVerified);
    });

    it('should save to storage after update', async () => {
      await cache.updateCache(sampleDevice, false, 'scan');

      expect(mockedAsyncStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('markVerified', () => {
    it('should update lastVerified timestamp', async () => {
      await cache.updateCache(sampleDevice, false, 'scan');
      const devices1 = await cache.getCachedDevices();
      const originalVerified = devices1[0].lastVerified;

      // Wait a bit to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));

      await cache.markVerified(sampleDevice.id);

      const devices2 = await cache.getCachedDevices();
      expect(devices2[0].lastVerified).not.toBe(originalVerified);
      expect(devices2[0].isStale).toBe(false);
    });

    it('should do nothing for non-existent device', async () => {
      await cache.markVerified('non-existent-id');

      expect(mockedAsyncStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('removeFromCache', () => {
    it('should remove device by id', async () => {
      await cache.updateCache(sampleDevice, false, 'scan');
      expect(await cache.getCachedDevices()).toHaveLength(1);

      await cache.removeFromCache(sampleDevice.id);

      expect(await cache.getCachedDevices()).toHaveLength(0);
    });

    it('should do nothing for non-existent device', async () => {
      await cache.removeFromCache('non-existent-id');
      expect(await cache.getCachedDevices()).toHaveLength(0);
    });
  });

  describe('removeByKey', () => {
    it('should remove device by IP and platform', async () => {
      await cache.updateCache(sampleDevice, false, 'scan');

      await cache.removeByKey('192.168.1.100', TVPlatform.Roku);

      expect(await cache.getCachedDevices()).toHaveLength(0);
    });
  });

  describe('clearCache', () => {
    it('should clear all cached devices', async () => {
      await cache.updateCache(sampleDevice, false, 'scan');
      await cache.updateCache(
        { ...sampleDevice, id: 'device-2', ipAddress: '192.168.1.101' },
        false,
        'scan'
      );

      expect(await cache.getCachedDevices()).toHaveLength(2);

      await cache.clearCache();

      expect(await cache.getCachedDevices()).toHaveLength(0);
      expect(mockedAsyncStorage.removeItem).toHaveBeenCalled();
    });
  });

  describe('getFreshDevices and getStaleDevices', () => {
    it('should separate fresh and stale devices', async () => {
      // Add fresh device
      await cache.updateCache(sampleDevice, true, 'scan');

      // Get devices
      const fresh = await cache.getFreshDevices();
      const stale = await cache.getStaleDevices();

      expect(fresh).toHaveLength(1);
      expect(stale).toHaveLength(0);
    });
  });

  describe('isCached and getDevice', () => {
    it('should check if device is cached', async () => {
      await cache.updateCache(sampleDevice, false, 'scan');

      const isCached = await cache.isCached('192.168.1.100', TVPlatform.Roku);
      expect(isCached).toBe(true);

      const notCached = await cache.isCached('192.168.1.200', TVPlatform.Roku);
      expect(notCached).toBe(false);
    });

    it('should get specific cached device', async () => {
      await cache.updateCache(sampleDevice, false, 'scan');

      const device = await cache.getDevice('192.168.1.100', TVPlatform.Roku);
      expect(device).not.toBeNull();
      expect(device?.name).toBe('Living Room Roku');

      const notFound = await cache.getDevice('192.168.1.200', TVPlatform.Roku);
      expect(notFound).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      await cache.updateCache(sampleDevice, true, 'ssdp');
      await cache.updateCache(
        {
          ...sampleDevice,
          id: 'android-tv-1',
          ipAddress: '192.168.1.101',
          platform: TVPlatform.AndroidTV,
        },
        true,
        'scan'
      );

      const stats = await cache.getStats();

      expect(stats.total).toBe(2);
      expect(stats.fresh).toBe(2);
      expect(stats.stale).toBe(0);
      expect(stats.byPlatform[TVPlatform.Roku]).toBe(1);
      expect(stats.byPlatform[TVPlatform.AndroidTV]).toBe(1);
      expect(stats.byMethod['ssdp']).toBe(1);
      expect(stats.byMethod['scan']).toBe(1);
    });
  });

  describe('expiry and cleanup', () => {
    it('should mark old devices as stale on load', async () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

      const cachedData = {
        version: 1,
        devices: [
          {
            ...sampleDevice,
            lastSeen: eightDaysAgo.toISOString(),
            lastVerified: eightDaysAgo.toISOString(),
            discoveryMethod: 'scan',
          },
        ],
        lastUpdated: new Date().toISOString(),
      };

      mockedAsyncStorage.getItem.mockResolvedValue(JSON.stringify(cachedData));

      // Create new cache instance to trigger load
      const newCache = new DiscoveryCacheService();
      const devices = await newCache.getCachedDevices();

      expect(devices).toHaveLength(1);
      expect(devices[0].isStale).toBe(true);
    });

    it('should remove very old devices on load', async () => {
      const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

      const cachedData = {
        version: 1,
        devices: [
          {
            ...sampleDevice,
            lastSeen: thirtyOneDaysAgo.toISOString(),
            lastVerified: thirtyOneDaysAgo.toISOString(),
            discoveryMethod: 'scan',
          },
        ],
        lastUpdated: new Date().toISOString(),
      };

      mockedAsyncStorage.getItem.mockResolvedValue(JSON.stringify(cachedData));

      // Create new cache instance to trigger load
      const newCache = new DiscoveryCacheService();
      const devices = await newCache.getCachedDevices();

      // Device should be cleaned up (>30 days)
      expect(devices).toHaveLength(0);
    });

    it('should handle version mismatch by clearing cache', async () => {
      const cachedData = {
        version: 999, // Future version
        devices: [
          {
            ...sampleDevice,
            lastSeen: new Date().toISOString(),
            lastVerified: new Date().toISOString(),
            discoveryMethod: 'scan',
          },
        ],
        lastUpdated: new Date().toISOString(),
      };

      mockedAsyncStorage.getItem.mockResolvedValue(JSON.stringify(cachedData));

      const newCache = new DiscoveryCacheService();
      const devices = await newCache.getCachedDevices();

      // Should be empty due to version mismatch
      expect(devices).toHaveLength(0);
    });
  });
});
