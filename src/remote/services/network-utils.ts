/**
 * Network utilities for device discovery
 * Provides functions to get device network info and calculate subnet ranges
 * 
 * Uses react-native-network-info for accurate subnet mask information
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
 * Convert subnet mask to CIDR prefix length
 * @example "255.255.255.0" => 24
 * @example "255.255.0.0" => 16
 */
export function subnetMaskToCidr(mask: string): number {
  const parts = mask.split('.').map(p => parseInt(p, 10));
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
  const parts = ipAddress.split('.').map(p => parseInt(p, 10));
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
 * For example, if device is at 10.13.12.45/16, generate:
 * - 10.13.0., 10.13.1., ..., 10.13.255.
 * 
 * @param ipAddress Device IP address
 * @param cidrPrefix CIDR prefix length (e.g., 16, 24)
 */
export function generateSubnetPrefixes(ipAddress: string, cidrPrefix: number): string[] {
  const parts = ipAddress.split('.').map(p => parseInt(p, 10));
  if (parts.length !== 4) return [];
  
  const prefixes: string[] = [];
  
  if (cidrPrefix >= 24) {
    // /24 or smaller - just scan this subnet
    prefixes.push(`${parts[0]}.${parts[1]}.${parts[2]}.`);
  } else if (cidrPrefix >= 16) {
    // /16 to /23 - scan all /24 subnets within
    // For /16: 256 subnets (0-255)
    // For /20: 16 subnets
    const numSubnets = Math.pow(2, 24 - cidrPrefix);
    const startThirdOctet = parts[2] & (256 - numSubnets); // Align to subnet boundary
    
    for (let i = 0; i < numSubnets && i < 256; i++) {
      prefixes.push(`${parts[0]}.${parts[1]}.${startThirdOctet + i}.`);
    }
  } else {
    // /8 to /15 - too large, just scan a few adjacent subnets
    // Scan current /24 + adjacent ones
    for (let delta = -2; delta <= 2; delta++) {
      const thirdOctet = parts[2] + delta;
      if (thirdOctet >= 0 && thirdOctet <= 255) {
        prefixes.push(`${parts[0]}.${parts[1]}.${thirdOctet}.`);
      }
    }
  }
  
  return prefixes;
}

/**
 * Get subnets to scan in priority order:
 * 1. All /24 subnets within the device's actual subnet (based on mask) - highest priority
 * 2. Common fallback subnets
 */
export async function getSubnetsToScan(): Promise<SubnetInfo[]> {
  const subnets: SubnetInfo[] = [];
  const addedPrefixes = new Set<string>();
  
  // Get device network info
  const networkInfo = await getDeviceNetworkInfo();
  
  if (networkInfo && isPrivateIP(networkInfo.ipAddress)) {
    // Priority 1: All /24 subnets within the device's actual subnet
    // For /23 (255.255.254.0): includes both 10.13.12.x and 10.13.13.x
    // For /24: just the current subnet
    // For /16: all 256 subnets in 10.13.x.x
    const actualSubnetPrefixes = generateSubnetPrefixes(
      networkInfo.ipAddress,
      networkInfo.cidrPrefix
    );
    
    debug.log(`Priority 1 - Actual subnet /${networkInfo.cidrPrefix}: ${actualSubnetPrefixes.length} /24 blocks`);
    actualSubnetPrefixes.forEach(p => debug.log(`  - ${p}x`));
    
    for (const prefix of actualSubnetPrefixes) {
      if (!addedPrefixes.has(prefix)) {
        subnets.push({
          prefix,
          deviceIp: networkInfo.ipAddress,
          isPrimary: prefix === getSubnetPrefix24(networkInfo.ipAddress),
          priority: 1,
        });
        addedPrefixes.add(prefix);
      }
    }
    
    // Priority 2: Common fallback subnets (in case device is on different VLAN)
    const fallbacks = FALLBACK_SUBNET_PREFIXES.filter(p => !addedPrefixes.has(p));
    for (const prefix of fallbacks) {
      subnets.push({
        prefix,
        deviceIp: networkInfo.ipAddress,
        isPrimary: false,
        priority: 2,
      });
      addedPrefixes.add(prefix);
    }
    debug.log(`Priority 2 - Fallbacks: ${fallbacks.join(', ')}`);
  } else {
    // No network info, use fallbacks only
    debug.warn('Could not get network info, using fallbacks');
    for (const prefix of FALLBACK_SUBNET_PREFIXES) {
      subnets.push({
        prefix,
        deviceIp: '',
        isPrimary: false,
        priority: 2,
      });
      addedPrefixes.add(prefix);
    }
  }
  
  // Sort by priority, then put primary first within same priority
  subnets.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return 0;
  });
  
  debug.log(`Total subnets to scan: ${subnets.length}`);
  return subnets;
}

/**
 * Fallback subnet prefixes for common home/office networks
 */
export const FALLBACK_SUBNET_PREFIXES = [
  '192.168.1.',   // Most common home router default
  '192.168.0.',   // Common alternative (Netgear, TP-Link, etc.)
  '192.168.2.',   // Some routers use this
  '10.0.0.',      // Apple AirPort, some enterprise
  '10.0.1.',      // Apple AirPort alternative
  '10.13.12.',    // Common enterprise/VPN subnet
  '172.16.0.',    // Class B private
  '172.16.1.',    // Class B private alternative
];

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
  
  return [{
    prefix,
    deviceIp: networkInfo.ipAddress,
    isPrimary: true,
    priority: 1,
  }];
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
