/**
 * Network utilities for device discovery
 * Provides functions to get device network info and calculate subnet ranges
 *
 * Uses react-native-network-info for accurate subnet mask information
 *
 * Updated: Removed hardcoded fallback subnets, dynamic calculation based on
 * actual network configuration with priority-based scanning blocks.
 */

import { NetworkInfo } from 'react-native-network-info';

/** Debug logger */
const DEBUG_TAG = '[NetworkUtils]';
const debug = {
  log: (...args: unknown[]) => console.log(DEBUG_TAG, ...args),
  warn: (...args: unknown[]) => console.warn(DEBUG_TAG, ...args),
  error: (...args: unknown[]) => console.error(DEBUG_TAG, ...args),
};

/** Network info for the device */
export interface DeviceNetworkInfo {
  /** Device's IP address */
  ipAddress: string;
  /** Subnet mask (e.g., "255.255.255.0") */
  subnetMask: string;
  /** Gateway IP address */
  gateway: string | null;
  /** Broadcast address */
  broadcast: string | null;
  /** CIDR prefix length (e.g., 24 for /24) */
  cidrPrefix: number;
}

/** Subnet info for scanning */
export interface SubnetInfo {
  /** Subnet prefix (e.g., "192.168.1.") */
  prefix: string;
  /** Device's own IP address */
  deviceIp: string;
  /** Whether this is the primary/current network */
  isPrimary: boolean;
  /** Priority for scanning (lower = higher priority) */
  priority: number;
}

/**
 * Scan block with priority for ordered scanning
 */
export interface ScanBlock {
  /** /24 subnet prefix (e.g., "192.168.1.") */
  prefix: string;
  /** Priority (1 = highest, phone IP block; 2 = gateway block; higher = further away) */
  priority: number;
  /** Distance from phone's /24 block (0 = same block) */
  distance: number;
}

/**
 * Convert subnet mask to CIDR prefix length
 * @example "255.255.255.0" => 24
 * @example "255.255.0.0" => 16
 */
export function subnetMaskToCidr(mask: string): number {
  const parts = mask.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4) return 24; // default to /24

  let cidr = 0;
  for (const part of parts) {
    // Count set bits in each octet
    let n = part;
    while (n > 0) {
      cidr += n & 1;
      n >>= 1;
    }
  }
  return cidr;
}

/**
 * Get the /24 subnet prefix from an IP address
 * @example "192.168.1.105" => "192.168.1."
 */
export function getSubnetPrefix24(ipAddress: string): string | null {
  const parts = ipAddress.split('.');
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}.`;
}

/**
 * Get the /16 subnet prefix from an IP address
 * @example "10.13.12.45" => "10.13."
 */
export function getSubnetPrefix16(ipAddress: string): string | null {
  const parts = ipAddress.split('.');
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}.`;
}

/**
 * Check if an IP address is a private/local network address
 */
export function isPrivateIP(ipAddress: string): boolean {
  const parts = ipAddress.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4) return false;

  // 10.0.0.0 - 10.255.255.255 (Class A private)
  if (parts[0] === 10) return true;

  // 172.16.0.0 - 172.31.255.255 (Class B private)
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

  // 192.168.0.0 - 192.168.255.255 (Class C private)
  if (parts[0] === 192 && parts[1] === 168) return true;

  // 169.254.0.0 - 169.254.255.255 (Link-local)
  if (parts[0] === 169 && parts[1] === 254) return true;

  return false;
}

/**
 * Get detailed network info using react-native-network-info
 */
export async function getDeviceNetworkInfo(): Promise<DeviceNetworkInfo | null> {
  try {
    const [ipAddress, subnetMask, gateway, broadcast] = await Promise.all([
      NetworkInfo.getIPV4Address(),
      NetworkInfo.getSubnet(),
      NetworkInfo.getGatewayIPAddress(),
      NetworkInfo.getBroadcast(),
    ]);

    debug.log('Network info retrieved:');
    debug.log(`  IP: ${ipAddress}`);
    debug.log(`  Subnet: ${subnetMask}`);
    debug.log(`  Gateway: ${gateway}`);
    debug.log(`  Broadcast: ${broadcast}`);

    if (!ipAddress || !subnetMask) {
      debug.warn('Missing IP or subnet mask');
      return null;
    }

    const cidrPrefix = subnetMaskToCidr(subnetMask);
    debug.log(`  CIDR: /${cidrPrefix}`);

    return {
      ipAddress,
      subnetMask,
      gateway,
      broadcast,
      cidrPrefix,
    };
  } catch (err) {
    debug.error('Failed to get network info:', err);
    return null;
  }
}

/**
 * Generate all /24 subnet prefixes within a larger subnet
 *
 * UPDATED: Now generates ALL /24 blocks within the subnet mask range,
 * without arbitrary limits for large networks.
 *
 * @param ipAddress Device IP address
 * @param cidrPrefix CIDR prefix length (e.g., 16, 24)
 */
export function generateSubnetPrefixes(ipAddress: string, cidrPrefix: number): string[] {
  const parts = ipAddress.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4) return [];

  const prefixes: string[] = [];

  if (cidrPrefix >= 24) {
    // /24 or smaller - just scan this subnet
    prefixes.push(`${parts[0]}.${parts[1]}.${parts[2]}.`);
  } else if (cidrPrefix >= 16) {
    // /16 to /23 - scan all /24 subnets within
    const numSubnets = Math.pow(2, 24 - cidrPrefix);
    const startThirdOctet = parts[2] & (256 - numSubnets); // Align to subnet boundary

    for (let i = 0; i < numSubnets && i < 256; i++) {
      prefixes.push(`${parts[0]}.${parts[1]}.${startThirdOctet + i}.`);
    }
  } else if (cidrPrefix >= 8) {
    // /8 to /15 - generate all /24 blocks within the network range
    // For /8: 256 * 256 = 65536 subnets (too many)
    // For /12: 16 * 256 = 4096 subnets
    // For practical purposes, generate all blocks but let caller prioritize
    const numSecondOctets = Math.pow(2, 16 - cidrPrefix);
    const startSecondOctet = parts[1] & (256 - numSecondOctets);

    for (let j = 0; j < numSecondOctets && j < 256; j++) {
      for (let i = 0; i < 256; i++) {
        prefixes.push(`${parts[0]}.${startSecondOctet + j}.${i}.`);
      }
    }
  }

  return prefixes;
}

/**
 * Generate scan blocks with priority ordering
 *
 * Priority strategy:
 * - Priority 1: Phone's current /24 block
 * - Priority 2: Gateway's /24 block (if different from phone)
 * - Priority 3+: Other blocks, ordered by distance from phone's block
 *
 * @param ipAddress Device IP address
 * @param cidrPrefix CIDR prefix length
 * @param gatewayIp Gateway IP address (optional)
 * @returns Array of scan blocks sorted by priority
 */
export function generateScanBlocks(
  ipAddress: string,
  cidrPrefix: number,
  gatewayIp?: string | null
): ScanBlock[] {
  const parts = ipAddress.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4) return [];

  const phoneThirdOctet = parts[2];
  const phonePrefix = `${parts[0]}.${parts[1]}.${phoneThirdOctet}.`;

  // Get gateway's third octet if available
  let gatewayThirdOctet: number | null = null;
  let gatewayPrefix: string | null = null;
  if (gatewayIp) {
    const gwParts = gatewayIp.split('.').map((p) => parseInt(p, 10));
    if (gwParts.length === 4 && gwParts[0] === parts[0] && gwParts[1] === parts[1]) {
      gatewayThirdOctet = gwParts[2];
      gatewayPrefix = `${gwParts[0]}.${gwParts[1]}.${gatewayThirdOctet}.`;
    }
  }

  const blocks: ScanBlock[] = [];

  if (cidrPrefix >= 24) {
    // /24 or smaller - only one block
    blocks.push({
      prefix: phonePrefix,
      priority: 1,
      distance: 0,
    });
  } else if (cidrPrefix >= 16) {
    // /16 to /23 - multiple /24 blocks
    const numSubnets = Math.pow(2, 24 - cidrPrefix);
    const startThirdOctet = parts[2] & (256 - numSubnets);

    for (let i = 0; i < numSubnets && i < 256; i++) {
      const thirdOctet = startThirdOctet + i;
      const prefix = `${parts[0]}.${parts[1]}.${thirdOctet}.`;
      const distance = Math.abs(thirdOctet - phoneThirdOctet);

      let priority: number;
      if (thirdOctet === phoneThirdOctet) {
        priority = 1; // Phone's block - highest priority
      } else if (gatewayThirdOctet !== null && thirdOctet === gatewayThirdOctet) {
        priority = 2; // Gateway's block - second priority
      } else {
        priority = 3 + distance; // Other blocks by distance
      }

      blocks.push({ prefix, priority, distance });
    }
  } else if (cidrPrefix >= 8) {
    // /8 to /15 - very large networks
    // Generate blocks but with smart prioritization
    const numSecondOctets = Math.pow(2, 16 - cidrPrefix);
    const startSecondOctet = parts[1] & (256 - numSecondOctets);

    for (let j = 0; j < numSecondOctets && j < 256; j++) {
      const secondOctet = startSecondOctet + j;
      const secondOctetDistance = Math.abs(secondOctet - parts[1]);

      for (let i = 0; i < 256; i++) {
        const thirdOctet = i;
        const prefix = `${parts[0]}.${secondOctet}.${thirdOctet}.`;

        // Calculate total distance (second octet weight * 256 + third octet distance)
        const thirdOctetDistance =
          secondOctet === parts[1] ? Math.abs(thirdOctet - phoneThirdOctet) : 256;
        const totalDistance = secondOctetDistance * 256 + thirdOctetDistance;

        let priority: number;
        if (secondOctet === parts[1] && thirdOctet === phoneThirdOctet) {
          priority = 1;
        } else if (gatewayIp && gatewayPrefix === prefix) {
          priority = 2;
        } else {
          priority = 3 + totalDistance;
        }

        blocks.push({ prefix, priority, distance: totalDistance });
      }
    }
  }

  // Sort by priority
  blocks.sort((a, b) => a.priority - b.priority);

  return blocks;
}

/**
 * Get the /24 subnet prefix where the gateway resides
 */
export function getGatewaySubnetPrefix(gatewayIp: string): string | null {
  return getSubnetPrefix24(gatewayIp);
}

/**
 * Get subnets to scan in priority order
 *
 * UPDATED: No longer uses hardcoded fallback subnets.
 * Only returns actual subnets within the device's network range.
 *
 * Priority ordering:
 * 1. Phone's current /24 block (priority 1)
 * 2. Gateway's /24 block if different (priority 2)
 * 3. Other blocks within subnet, ordered by distance (priority 3+)
 */
export async function getSubnetsToScan(): Promise<SubnetInfo[]> {
  const subnets: SubnetInfo[] = [];

  // Get device network info
  const networkInfo = await getDeviceNetworkInfo();

  if (!networkInfo || !isPrivateIP(networkInfo.ipAddress)) {
    debug.warn('Could not get valid network info, cannot scan');
    return [];
  }

  // Generate scan blocks with priority
  const scanBlocks = generateScanBlocks(
    networkInfo.ipAddress,
    networkInfo.cidrPrefix,
    networkInfo.gateway
  );

  debug.log(`Network: ${networkInfo.ipAddress}/${networkInfo.cidrPrefix}`);
  debug.log(`Gateway: ${networkInfo.gateway}`);
  debug.log(`Generated ${scanBlocks.length} scan blocks`);

  // Convert ScanBlocks to SubnetInfo for backward compatibility
  const phonePrefix = getSubnetPrefix24(networkInfo.ipAddress);

  for (const block of scanBlocks) {
    subnets.push({
      prefix: block.prefix,
      deviceIp: networkInfo.ipAddress,
      isPrimary: block.prefix === phonePrefix,
      priority: block.priority,
    });
  }

  // Log first few blocks for debugging
  const previewCount = Math.min(10, subnets.length);
  debug.log(`First ${previewCount} subnets to scan:`);
  for (let i = 0; i < previewCount; i++) {
    const s = subnets[i];
    debug.log(`  ${i + 1}. ${s.prefix}x (priority: ${s.priority}, primary: ${s.isPrimary})`);
  }

  if (subnets.length > previewCount) {
    debug.log(`  ... and ${subnets.length - previewCount} more`);
  }

  return subnets;
}

/**
 * @deprecated Use generateScanBlocks() for new implementations.
 * Kept for backward compatibility with existing code.
 */
export const FALLBACK_SUBNET_PREFIXES: string[] = [];

/**
 * Get device's current network subnets (legacy function for compatibility)
 */
export async function getDeviceSubnets(): Promise<SubnetInfo[]> {
  const networkInfo = await getDeviceNetworkInfo();

  if (!networkInfo || !isPrivateIP(networkInfo.ipAddress)) {
    return [];
  }

  const prefix = getSubnetPrefix24(networkInfo.ipAddress);
  if (!prefix) return [];

  return [
    {
      prefix,
      deviceIp: networkInfo.ipAddress,
      isPrimary: true,
      priority: 1,
    },
  ];
}

/**
 * Generate all IPs in a subnet (1-254)
 * Excludes the device's own IP if provided
 */
export function generateSubnetIPs(prefix: string, excludeIp?: string): string[] {
  const ips: string[] = [];

  for (let i = 1; i <= 254; i++) {
    const ip = `${prefix}${i}`;
    if (ip !== excludeIp) {
      ips.push(ip);
    }
  }

  return ips;
}
