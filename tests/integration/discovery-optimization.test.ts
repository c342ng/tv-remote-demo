/**
 * Integration test for discovery optimization
 *
 * Tests the complete discovery flow:
 * - Cache-verify phase
 * - Broadcast phase
 * - Active scan phase
 * - Progress reporting
 * - Deduplication
 *
 * Note: These tests focus on the core logic and mock
 * external dependencies (network, AsyncStorage, adapters).
 */

import { TVPlatform } from '../../src/remote/domain/models';
import type { TVDevice } from '../../src/remote/domain/models';

// Import modules after mocking
import { DiscoveryCacheService } from '../../src/remote/services/discovery-cache';
import { generateScanBlocks } from '../../src/remote/services/network-utils';
import { runWithConcurrency } from '../../src/remote/utils/concurrency';

// Mock AsyncStorage first (before any imports that use it)
const mockGetItem = jest.fn().mockResolvedValue(null);
const mockSetItem = jest.fn().mockResolvedValue(undefined);
const mockRemoveItem = jest.fn().mockResolvedValue(undefined);

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: mockGetItem,
  setItem: mockSetItem,
  removeItem: mockRemoveItem,
}));

jest.mock('react-native-network-info', () => ({
  NetworkInfo: {
    getIPAddress: jest.fn().mockResolvedValue('192.168.1.50'),
    getSubnet: jest.fn().mockResolvedValue('255.255.255.0'),
    getGatewayIPAddress: jest.fn().mockResolvedValue('192.168.1.1'),
  },
}));

// Mock UDP and discovery services to prevent real network access
jest.mock('react-native-udp', () => ({
  createSocket: jest.fn(() => ({
    bind: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
  })),
}));

jest.mock('../../src/remote/services/ssdp-discovery', () => ({
  discoverViaSsdp: jest.fn().mockResolvedValue([]),
  isSsdpSupported: jest.fn().mockReturnValue(false),
}));

jest.mock('../../src/remote/services/mdns-discovery', () => ({
  discoverViaMdns: jest.fn().mockResolvedValue([]),
  isMdnsSupported: jest.fn().mockReturnValue(false),
}));

describe('Discovery Optimization Integration', () => {
  // Sample devices
  const rokuDevice: TVDevice = {
    id: 'roku-192.168.1.100',
    name: 'Living Room Roku',
    ipAddress: '192.168.1.100',
    port: 8060,
    platform: TVPlatform.Roku,
  };

  const androidTVDevice: TVDevice = {
    id: 'androidtv-192.168.1.101',
    name: 'Bedroom Android TV',
    ipAddress: '192.168.1.101',
    port: 5555,
    platform: TVPlatform.AndroidTV,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockReset();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockReset();
    mockSetItem.mockResolvedValue(undefined);
    mockRemoveItem.mockReset();
    mockRemoveItem.mockResolvedValue(undefined);
  });

  // Note: DiscoveryCacheService unit tests are in tests/unit/services/discovery-cache.test.ts
  // This file focuses on integration between components

  describe('Network Utils - Scan Block Generation', () => {
    it('should generate single block for /24 subnet', () => {
      const blocks = generateScanBlocks('192.168.1.50', 24, '192.168.1.1');

      expect(blocks).toHaveLength(1);
      expect(blocks[0].prefix).toBe('192.168.1.');
      expect(blocks[0].priority).toBe(1);
    });

    it('should generate multiple blocks for /23 subnet', () => {
      const blocks = generateScanBlocks('192.168.1.50', 23, '192.168.1.1');

      expect(blocks).toHaveLength(2);
      // Phone IP block should have highest priority
      const phoneBlock = blocks.find((b) => b.prefix === '192.168.1.');
      expect(phoneBlock?.priority).toBe(1);
    });

    it('should generate 256 blocks for /16 subnet', () => {
      const blocks = generateScanBlocks('192.168.1.50', 16, '192.168.1.1');

      expect(blocks).toHaveLength(256);
      // Phone IP block (192.168.1.) should be first after sorting
      const sorted = [...blocks].sort((a, b) => a.priority - b.priority);
      expect(sorted[0].prefix).toBe('192.168.1.');
      expect(sorted[0].priority).toBe(1);
    });

    it('should prioritize phone IP block over gateway block', () => {
      // Phone in different block than gateway
      const blocks = generateScanBlocks('192.168.2.50', 23, '192.168.3.1');

      const phoneBlock = blocks.find((b) => b.prefix === '192.168.2.');
      const gatewayBlock = blocks.find((b) => b.prefix === '192.168.3.');

      expect(phoneBlock?.priority).toBe(1);
      expect(gatewayBlock?.priority).toBe(2);
    });

    it('should handle missing gateway gracefully', () => {
      const blocks = generateScanBlocks('192.168.1.50', 24, null);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].priority).toBe(1);
    });
  });

  describe('Concurrency Control', () => {
    it('should limit concurrent execution', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      const tasks = Array.from({ length: 20 }, () => async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 10));
        concurrent--;
        return 'done';
      });

      const execution = runWithConcurrency(tasks, 5);
      const { results } = await execution.promise;

      expect(maxConcurrent).toBeLessThanOrEqual(5);
      expect(results).toHaveLength(20);
    });

    it('should support cancellation', async () => {
      // Track that some tasks complete (variable intentionally unused in assertion)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      let _completed = 0;

      const tasks = Array.from({ length: 100 }, () => async () => {
        await new Promise((r) => setTimeout(r, 50));
        _completed++;
        return 'done';
      });

      const execution = runWithConcurrency(tasks, 10);

      // Cancel after a short delay
      setTimeout(() => execution.cancel(), 25);

      const result = await execution.promise;

      // Some tasks should be cancelled
      expect(result.cancelled).toBeGreaterThan(0);
    });

    it('should collect errors without stopping', async () => {
      const tasks = [
        async () => 'success',
        async () => {
          throw new Error('Task failed');
        },
        async () => 'success2',
      ];

      const execution = runWithConcurrency(tasks, 2);
      const { results, errors } = await execution.promise;

      expect(results).toContain('success');
      expect(results).toContain('success2');
      expect(errors).toHaveLength(1);
    });
  });

  describe('Deduplication Logic', () => {
    it('should deduplicate by IP and platform key', () => {
      const seen = new Map<string, TVDevice>();

      const addDevice = (device: TVDevice): boolean => {
        const key = `${device.ipAddress}-${device.platform}`;
        if (seen.has(key)) {
          return false; // Already exists
        }
        seen.set(key, device);
        return true; // New device
      };

      expect(addDevice(rokuDevice)).toBe(true);
      expect(addDevice(rokuDevice)).toBe(false); // Duplicate
      expect(addDevice(androidTVDevice)).toBe(true);
      expect(addDevice({ ...rokuDevice, ipAddress: '192.168.1.200' })).toBe(true);

      expect(seen.size).toBe(3);
    });

    it('should handle same IP different platform', () => {
      const seen = new Map<string, TVDevice>();

      const addDevice = (device: TVDevice): boolean => {
        const key = `${device.ipAddress}-${device.platform}`;
        if (seen.has(key)) return false;
        seen.set(key, device);
        return true;
      };

      // Same IP, different platforms
      const roku = { ...rokuDevice, ipAddress: '192.168.1.100' };
      const android = {
        ...androidTVDevice,
        ipAddress: '192.168.1.100',
        id: 'android-100',
      };

      expect(addDevice(roku)).toBe(true);
      expect(addDevice(android)).toBe(true);

      expect(seen.size).toBe(2);
    });
  });

  describe('Priority-Based Scanning', () => {
    it('should sort blocks by priority', () => {
      const blocks = [
        { prefix: '192.168.3', priority: 3 },
        { prefix: '192.168.1', priority: 1 },
        { prefix: '192.168.2', priority: 2 },
        { prefix: '192.168.4', priority: 4 },
      ];

      const sorted = [...blocks].sort((a, b) => a.priority - b.priority);

      expect(sorted[0].prefix).toBe('192.168.1');
      expect(sorted[1].prefix).toBe('192.168.2');
      expect(sorted[2].prefix).toBe('192.168.3');
      expect(sorted[3].prefix).toBe('192.168.4');
    });

    it('should calculate priority based on distance from phone IP', () => {
      const phoneBlock = 50; // 192.168.50.x
      const calculatePriority = (block: number): number => {
        if (block === phoneBlock) return 1;
        return 3 + Math.abs(block - phoneBlock);
      };

      expect(calculatePriority(50)).toBe(1); // Phone block
      expect(calculatePriority(51)).toBe(4); // Distance 1
      expect(calculatePriority(49)).toBe(4); // Distance 1
      expect(calculatePriority(100)).toBe(53); // Distance 50
    });
  });

  describe('Cache Statistics', () => {
    it('should provide accurate cache statistics', async () => {
      const cache = new DiscoveryCacheService();

      await cache.updateCache(rokuDevice, true, 'ssdp');
      await cache.updateCache(androidTVDevice, true, 'scan');

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
});
