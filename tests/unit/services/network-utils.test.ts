/**
 * Unit tests for network-utils.ts
 *
 * Tests for:
 * - subnetMaskToCidr conversion
 * - generateScanBlocks priority ordering
 * - getGatewaySubnetPrefix
 * - Various CIDR sizes (/24, /23, /20, /16, /8)
 */

import {
  subnetMaskToCidr,
  getSubnetPrefix24,
  getSubnetPrefix16,
  isPrivateIP,
  generateSubnetPrefixes,
  generateScanBlocks,
  getGatewaySubnetPrefix,
} from '../../../src/remote/services/network-utils';

describe('network-utils', () => {
  describe('subnetMaskToCidr', () => {
    it('should convert /24 mask correctly', () => {
      expect(subnetMaskToCidr('255.255.255.0')).toBe(24);
    });

    it('should convert /16 mask correctly', () => {
      expect(subnetMaskToCidr('255.255.0.0')).toBe(16);
    });

    it('should convert /8 mask correctly', () => {
      expect(subnetMaskToCidr('255.0.0.0')).toBe(8);
    });

    it('should convert /23 mask correctly', () => {
      expect(subnetMaskToCidr('255.255.254.0')).toBe(23);
    });

    it('should convert /20 mask correctly', () => {
      expect(subnetMaskToCidr('255.255.240.0')).toBe(20);
    });

    it('should convert /32 mask correctly', () => {
      expect(subnetMaskToCidr('255.255.255.255')).toBe(32);
    });

    it('should handle invalid mask and return default', () => {
      expect(subnetMaskToCidr('invalid')).toBe(24);
      expect(subnetMaskToCidr('255.255')).toBe(24);
    });
  });

  describe('getSubnetPrefix24', () => {
    it('should extract /24 prefix correctly', () => {
      expect(getSubnetPrefix24('192.168.1.105')).toBe('192.168.1.');
      expect(getSubnetPrefix24('10.13.12.45')).toBe('10.13.12.');
      expect(getSubnetPrefix24('172.16.0.1')).toBe('172.16.0.');
    });

    it('should return null for invalid IP', () => {
      expect(getSubnetPrefix24('invalid')).toBeNull();
      expect(getSubnetPrefix24('192.168.1')).toBeNull();
    });
  });

  describe('getSubnetPrefix16', () => {
    it('should extract /16 prefix correctly', () => {
      expect(getSubnetPrefix16('192.168.1.105')).toBe('192.168.');
      expect(getSubnetPrefix16('10.13.12.45')).toBe('10.13.');
    });

    it('should return null for invalid IP', () => {
      expect(getSubnetPrefix16('invalid')).toBeNull();
    });
  });

  describe('isPrivateIP', () => {
    it('should identify Class A private IPs (10.x.x.x)', () => {
      expect(isPrivateIP('10.0.0.1')).toBe(true);
      expect(isPrivateIP('10.255.255.255')).toBe(true);
      expect(isPrivateIP('10.13.12.45')).toBe(true);
    });

    it('should identify Class B private IPs (172.16-31.x.x)', () => {
      expect(isPrivateIP('172.16.0.1')).toBe(true);
      expect(isPrivateIP('172.31.255.255')).toBe(true);
      expect(isPrivateIP('172.20.0.1')).toBe(true);
    });

    it('should reject non-private 172.x.x.x IPs', () => {
      expect(isPrivateIP('172.15.0.1')).toBe(false);
      expect(isPrivateIP('172.32.0.1')).toBe(false);
    });

    it('should identify Class C private IPs (192.168.x.x)', () => {
      expect(isPrivateIP('192.168.0.1')).toBe(true);
      expect(isPrivateIP('192.168.255.255')).toBe(true);
      expect(isPrivateIP('192.168.1.100')).toBe(true);
    });

    it('should identify link-local IPs (169.254.x.x)', () => {
      expect(isPrivateIP('169.254.0.1')).toBe(true);
      expect(isPrivateIP('169.254.255.255')).toBe(true);
    });

    it('should reject public IPs', () => {
      expect(isPrivateIP('8.8.8.8')).toBe(false);
      expect(isPrivateIP('1.1.1.1')).toBe(false);
      expect(isPrivateIP('142.250.80.46')).toBe(false);
    });

    it('should handle invalid IPs', () => {
      expect(isPrivateIP('invalid')).toBe(false);
      expect(isPrivateIP('')).toBe(false);
    });
  });

  describe('generateSubnetPrefixes', () => {
    it('should generate single prefix for /24 network', () => {
      const prefixes = generateSubnetPrefixes('192.168.1.100', 24);
      expect(prefixes).toHaveLength(1);
      expect(prefixes[0]).toBe('192.168.1.');
    });

    it('should generate 2 prefixes for /23 network', () => {
      const prefixes = generateSubnetPrefixes('192.168.1.100', 23);
      expect(prefixes).toHaveLength(2);
      expect(prefixes).toContain('192.168.0.');
      expect(prefixes).toContain('192.168.1.');
    });

    it('should generate 16 prefixes for /20 network', () => {
      const prefixes = generateSubnetPrefixes('10.13.12.45', 20);
      expect(prefixes).toHaveLength(16);
      // Should include 10.13.0. through 10.13.15.
      expect(prefixes).toContain('10.13.0.');
      expect(prefixes).toContain('10.13.15.');
    });

    it('should generate 256 prefixes for /16 network', () => {
      const prefixes = generateSubnetPrefixes('10.13.12.45', 16);
      expect(prefixes).toHaveLength(256);
      expect(prefixes).toContain('10.13.0.');
      expect(prefixes).toContain('10.13.255.');
    });

    it('should generate all prefixes for /8 network', () => {
      const prefixes = generateSubnetPrefixes('10.13.12.45', 8);
      // /8 network has 256 * 256 = 65536 /24 subnets
      expect(prefixes.length).toBe(65536);
      expect(prefixes).toContain('10.0.0.');
      expect(prefixes).toContain('10.255.255.');
    });

    it('should return empty array for invalid IP', () => {
      const prefixes = generateSubnetPrefixes('invalid', 24);
      expect(prefixes).toHaveLength(0);
    });
  });

  describe('generateScanBlocks', () => {
    it('should return single block with priority 1 for /24 network', () => {
      const blocks = generateScanBlocks('192.168.1.100', 24);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].prefix).toBe('192.168.1.');
      expect(blocks[0].priority).toBe(1);
      expect(blocks[0].distance).toBe(0);
    });

    it('should prioritize phone IP block for /23 network', () => {
      const blocks = generateScanBlocks('192.168.1.100', 23);
      expect(blocks).toHaveLength(2);

      // Phone's block should be first (priority 1)
      expect(blocks[0].prefix).toBe('192.168.1.');
      expect(blocks[0].priority).toBe(1);

      // Other block should have lower priority
      expect(blocks[1].prefix).toBe('192.168.0.');
      expect(blocks[1].priority).toBeGreaterThan(1);
    });

    it('should prioritize gateway block second for /16 network', () => {
      const blocks = generateScanBlocks('10.13.12.45', 16, '10.13.0.1');
      expect(blocks).toHaveLength(256);

      // First should be phone's block (priority 1)
      expect(blocks[0].prefix).toBe('10.13.12.');
      expect(blocks[0].priority).toBe(1);

      // Gateway's block should be second (priority 2)
      expect(blocks[1].prefix).toBe('10.13.0.');
      expect(blocks[1].priority).toBe(2);

      // Verify sorted by priority
      for (let i = 1; i < blocks.length; i++) {
        expect(blocks[i].priority).toBeGreaterThanOrEqual(blocks[i - 1].priority);
      }
    });

    it('should order blocks by distance from phone IP', () => {
      const blocks = generateScanBlocks('192.168.10.100', 20);
      expect(blocks).toHaveLength(16);

      // Phone's block (192.168.10.) should be first
      expect(blocks[0].prefix).toBe('192.168.10.');

      // Adjacent blocks should have lower priority than distant ones
      const block9 = blocks.find((b) => b.prefix === '192.168.9.');
      const block11 = blocks.find((b) => b.prefix === '192.168.11.');
      const block0 = blocks.find((b) => b.prefix === '192.168.0.');

      expect(block9).toBeDefined();
      expect(block11).toBeDefined();
      expect(block0).toBeDefined();

      // Adjacent blocks should have higher priority (lower number) than distant blocks
      expect(block9!.priority).toBeLessThan(block0!.priority);
      expect(block11!.priority).toBeLessThan(block0!.priority);
    });

    it('should handle gateway in different subnet gracefully', () => {
      // Gateway in different /16 should be ignored
      const blocks = generateScanBlocks('192.168.1.100', 24, '10.0.0.1');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].prefix).toBe('192.168.1.');
    });

    it('should return empty array for invalid IP', () => {
      const blocks = generateScanBlocks('invalid', 24);
      expect(blocks).toHaveLength(0);
    });
  });

  describe('getGatewaySubnetPrefix', () => {
    it('should extract gateway subnet prefix', () => {
      expect(getGatewaySubnetPrefix('192.168.1.1')).toBe('192.168.1.');
      expect(getGatewaySubnetPrefix('10.0.0.1')).toBe('10.0.0.');
    });

    it('should return null for invalid gateway IP', () => {
      expect(getGatewaySubnetPrefix('invalid')).toBeNull();
    });
  });
});
