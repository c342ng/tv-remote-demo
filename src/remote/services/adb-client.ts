/**
 * ADB Client Service
 *
 * Implements a simplified ADB (Android Debug Bridge) protocol client
 * for device identification and basic command execution.
 *
 * ADB Protocol Overview:
 * - ADB uses TCP port 5555 for network debugging
 * - Messages have a 24-byte header followed by optional payload
 * - For device identification, we can check if port is open and
 *   query device properties via shell commands
 *
 * This implementation focuses on:
 * 1. Detecting if a device has ADB enabled (port 5555 open)
 * 2. Identifying device type (Fire TV, Android TV, etc.) by manufacturer/model
 *
 * @module adb-client
 */

import type { DiscoveredDevice } from '../domain/remote-interfaces';
import { TVPlatform } from '../domain/models';

/** Debug logger for ADB client */
const DEBUG_TAG = '[ADB]';
const debug = {
  log: (...args: unknown[]) => console.log(DEBUG_TAG, ...args),
  warn: (...args: unknown[]) => console.warn(DEBUG_TAG, ...args),
  error: (...args: unknown[]) => console.error(DEBUG_TAG, ...args),
};

/** Default ADB port */
const ADB_PORT = 5555;

/** Connection timeout in milliseconds - increased for cross-subnet connections */
const CONNECTION_TIMEOUT_MS = 5000;

/** ADB protocol constants */
const ADB_PROTOCOL = {
  /** ADB protocol version */
  VERSION: 0x01000000,
  /** Maximum payload size */
  MAX_PAYLOAD: 4096,
  /** ADB commands */
  CMD: {
    CNXN: 0x4e584e43, // 'CNXN' - Connection request
    AUTH: 0x48545541, // 'AUTH' - Authentication
    OPEN: 0x4e45504f, // 'OPEN' - Open stream
    OKAY: 0x59414b4f, // 'OKAY' - Success
    CLSE: 0x45534c43, // 'CLSE' - Close stream
    WRTE: 0x45545257, // 'WRTE' - Write data
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Binary utilities (React Native compatible - no Buffer)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert string to Uint8Array
 */
function stringToBytes(str: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

/**
 * Convert Uint8Array to string
 */
function bytesToString(bytes: Uint8Array): string {
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(bytes);
}

/**
 * Write a 32-bit unsigned integer in little-endian format
 */
function writeUInt32LE(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  bytes[0] = value & 0xff;
  bytes[1] = (value >> 8) & 0xff;
  bytes[2] = (value >> 16) & 0xff;
  bytes[3] = (value >> 24) & 0xff;
  return bytes;
}

/**
 * Read a 32-bit unsigned integer in little-endian format
 */
function readUInt32LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    ((bytes[offset + 3] << 24) >>> 0)
  );
}

/**
 * Concatenate multiple Uint8Arrays
 */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Simple checksum calculation for ADB protocol
 */
function calculateChecksum(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
  }
  return sum;
}

// ─────────────────────────────────────────────────────────────────────────────
// TCP Module
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lazy-load the TCP socket module
 * Returns the module object with connect/createConnection methods
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tcpModuleCache: any = null;
let tcpModuleLoaded = false;

function getTcpModule(): any | null {
  if (tcpModuleLoaded) {
    return tcpModuleCache;
  }

  tcpModuleLoaded = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TcpSocket = require('react-native-tcp-socket');
    // The module exports: { connect, createConnection, createServer, Socket, ... }
    if (
      TcpSocket &&
      (TcpSocket.createConnection || TcpSocket.default?.createConnection)
    ) {
      tcpModuleCache = TcpSocket.default || TcpSocket;
      debug.log('TCP socket module loaded successfully');
      return tcpModuleCache;
    }
    debug.warn(
      'TCP socket module has unexpected structure:',
      Object.keys(TcpSocket || {})
    );
    return null;
  } catch (err) {
    debug.warn('Failed to load react-native-tcp-socket:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADB Device Info
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of ADB device identification
 */
export interface AdbDeviceInfo {
  /** IP address of the device */
  ip: string;
  /** Whether ADB port is open */
  isAdbEnabled: boolean;
  /** Device manufacturer (e.g., 'Amazon', 'Google') */
  manufacturer?: string;
  /** Device model (e.g., 'AFTMM', 'Chromecast') */
  model?: string;
  /** Device product name */
  product?: string;
  /** Whether this is likely a Fire TV device */
  isFireTv: boolean;
  /** Whether this is likely an Android TV device */
  isAndroidTv: boolean;
}

/**
 * Known Fire TV device identifiers
 *
 * Fire TV devices have specific manufacturer and model prefixes
 */
const FIRE_TV_IDENTIFIERS = {
  manufacturers: ['amazon', 'amzn'],
  modelPrefixes: [
    'aft', // Amazon Fire TV (all models)
    'fire', // Fire TV Stick/Cube naming
  ],
  products: [
    'mantis', // Fire TV Stick 4K
    'tank', // Fire TV Cube
    'sheldon', // Fire TV Stick
    'montoya', // Fire TV Stick Lite
    'raven', // Fire TV (3rd gen)
  ],
};

/**
 * Check if device info indicates a Fire TV
 */
function isFireTvDevice(info: Partial<AdbDeviceInfo>): boolean {
  const manufacturer = (info.manufacturer || '').toLowerCase();
  const model = (info.model || '').toLowerCase();
  const product = (info.product || '').toLowerCase();

  // Check manufacturer
  if (
    FIRE_TV_IDENTIFIERS.manufacturers.some((m) => manufacturer.includes(m))
  ) {
    return true;
  }

  // Check model prefix
  if (FIRE_TV_IDENTIFIERS.modelPrefixes.some((p) => model.startsWith(p))) {
    return true;
  }

  // Check known product names
  if (FIRE_TV_IDENTIFIERS.products.some((p) => product.includes(p))) {
    return true;
  }

  return false;
}

/**
 * Parse device information from ADB device string
 *
 * The device string format is typically:
 * "device::ro.product.name=xxx;ro.product.model=xxx;ro.product.device=xxx;..."
 */
function parseAdbDeviceString(deviceString: string): Partial<AdbDeviceInfo> {
  const info: Partial<AdbDeviceInfo> = {};

  // Split by ';' or '::' or newlines
  const parts = deviceString.split(/[;\n:]+/);

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (!key || !value) continue;

    const keyLower = key.toLowerCase().trim();
    const valueTrimmed = value.trim();

    if (
      keyLower.includes('manufacturer') ||
      keyLower === 'ro.product.manufacturer'
    ) {
      info.manufacturer = valueTrimmed;
    } else if (keyLower.includes('model') || keyLower === 'ro.product.model') {
      info.model = valueTrimmed;
    } else if (
      keyLower.includes('product') ||
      keyLower === 'ro.product.name'
    ) {
      info.product = valueTrimmed;
    } else if (
      keyLower.includes('device') ||
      keyLower === 'ro.product.device'
    ) {
      // Also check device name for Fire TV indicators
      if (!info.product) {
        info.product = valueTrimmed;
      }
    }
  }

  return info;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADB Protocol Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build an ADB CNXN (connection) message
 */
function buildAdbCnxnMessage(): Uint8Array {
  const systemIdentity = 'host::\0';
  const identityBytes = stringToBytes(systemIdentity);

  // Build ADB message header (24 bytes)
  // Format: command(4) + arg0(4) + arg1(4) + data_length(4) + data_crc32(4) + magic(4)
  const header = concatBytes(
    writeUInt32LE(ADB_PROTOCOL.CMD.CNXN), // command
    writeUInt32LE(ADB_PROTOCOL.VERSION), // arg0 = version
    writeUInt32LE(ADB_PROTOCOL.MAX_PAYLOAD), // arg1 = max payload
    writeUInt32LE(identityBytes.length), // data length
    writeUInt32LE(calculateChecksum(identityBytes)), // data checksum
    writeUInt32LE(ADB_PROTOCOL.CMD.CNXN ^ 0xffffffff) // magic
  );

  return concatBytes(header, identityBytes);
}

/**
 * Probe a device via ADB to identify its type
 *
 * This attempts to connect to the device and read basic properties
 * to determine if it's a Fire TV, Android TV, or other device.
 *
 * Note: Full ADB authentication requires RSA key exchange which is
 * complex to implement. For MVP, we use a simplified approach:
 * 1. Check if ADB port is open (indicates Android device with ADB enabled)
 * 2. For Fire TV detection, we check the ADB banner response
 *
 * @param ip - IP address to probe
 * @param timeoutMs - Connection timeout
 * @returns Device information if ADB is available
 */
export async function probeAdbDevice(
  ip: string,
  timeoutMs: number = CONNECTION_TIMEOUT_MS
): Promise<AdbDeviceInfo | null> {
  const TcpSocket = getTcpModule();
  if (!TcpSocket) {
    // Only log once, not for every IP
    return null;
  }

  // Only log for known Fire TV IPs to reduce noise
  const isKnownIp = ip === '10.13.12.80';
  if (isKnownIp) {
    debug.log(`Probing known Fire TV IP ${ip}:${ADB_PORT} (timeout: ${timeoutMs}ms)...`);
  }

  return new Promise((resolve) => {
    let resolved = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let socket: any = null;
    let dataChunks: Uint8Array[] = [];

    const cleanup = (result: AdbDeviceInfo | null) => {
      if (resolved) return;
      resolved = true;

      if (socket) {
        try {
          socket.destroy();
        } catch {
          // Ignore cleanup errors
        }
      }
      resolve(result);
    };

    // Set timeout
    const timer = setTimeout(() => {
      if (isKnownIp) {
        debug.log(`ADB probe TIMEOUT for ${ip} after ${timeoutMs}ms`);
      }
      cleanup(null);
    }, timeoutMs);

    try {
      socket = TcpSocket.createConnection(
        {
          host: ip,
          port: ADB_PORT,
          timeout: timeoutMs,
        },
        () => {
          // Connection successful
          debug.log(`Connected to ADB at ${ip}:${ADB_PORT}`);

          // Send ADB CNXN (connection) message
          try {
            const message = buildAdbCnxnMessage();
            socket.write(message);
            debug.log(`Sent ADB CNXN to ${ip}`);
          } catch (writeErr) {
            debug.error(`Failed to send ADB CNXN to ${ip}:`, writeErr);
            clearTimeout(timer);
            // Still return basic info since port is open
            cleanup({
              ip,
              isAdbEnabled: true,
              isFireTv: false,
              isAndroidTv: true, // Assume it's some Android device
            });
          }
        }
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.on('data', (data: any) => {
        // Convert data to Uint8Array if needed
        let bytes: Uint8Array;
        if (data instanceof Uint8Array) {
          bytes = data;
        } else if (Array.isArray(data)) {
          bytes = new Uint8Array(data);
        } else if (typeof data === 'string') {
          bytes = stringToBytes(data);
        } else {
          // Assume it's a Buffer-like object with array-like access
          bytes = new Uint8Array(data.length);
          for (let i = 0; i < data.length; i++) {
            bytes[i] = data[i];
          }
        }

        dataChunks.push(bytes);
        const dataBuffer = concatBytes(...dataChunks);
        debug.log(`Received ${bytes.length} bytes from ${ip}, total: ${dataBuffer.length}`);

        // Try to parse ADB response
        if (dataBuffer.length >= 24) {
          const command = readUInt32LE(dataBuffer, 0);
          const dataLength = readUInt32LE(dataBuffer, 12);

          debug.log(`ADB response command: 0x${command.toString(16)}`);

          // Check for CNXN response (device info) or AUTH request
          if (
            command === ADB_PROTOCOL.CMD.CNXN &&
            dataBuffer.length >= 24 + dataLength
          ) {
            // Parse device string from CNXN response
            const deviceBytes = dataBuffer.slice(24, 24 + dataLength);
            const deviceString = bytesToString(deviceBytes);
            debug.log(`ADB device string: ${deviceString}`);

            // Parse device info from the string
            const info = parseAdbDeviceString(deviceString);

            clearTimeout(timer);
            cleanup({
              ip,
              isAdbEnabled: true,
              manufacturer: info.manufacturer,
              model: info.model,
              product: info.product,
              isFireTv: isFireTvDevice(info),
              isAndroidTv: !isFireTvDevice(info),
            });
          } else if (command === ADB_PROTOCOL.CMD.AUTH) {
            // Device requires authentication - this is expected for first connection
            // We can still identify it as an ADB-enabled Android device
            debug.log(`ADB AUTH required from ${ip} - device is ADB-enabled`);
            clearTimeout(timer);
            cleanup({
              ip,
              isAdbEnabled: true,
              isFireTv: false,
              isAndroidTv: true,
            });
          }
        }
      });

      socket.on('error', (err: Error) => {
        clearTimeout(timer);
        if (isKnownIp) {
          debug.log(`ADB connection ERROR at ${ip}: ${err?.message || err}`);
        }
        cleanup(null);
      });

      socket.on('timeout', () => {
        clearTimeout(timer);
        if (isKnownIp) {
          debug.log(`ADB socket timeout at ${ip}`);
        }
        cleanup(null);
      });

      socket.on('close', () => {
        clearTimeout(timer);
        // If we connected but got closed, it's still an ADB device
        if (!resolved) {
          if (isKnownIp) {
            debug.log(`ADB connection closed by ${ip}`);
          }
          cleanup({
            ip,
            isAdbEnabled: true,
            isFireTv: false,
            isAndroidTv: true,
          });
        }
      });
    } catch (err) {
      clearTimeout(timer);
      if (isKnownIp) {
        debug.error(`Failed to probe ADB at ${ip}:`, err);
      }
      cleanup(null);
    }
  });
}

/**
 * Check if a device has ADB port open
 *
 * This is a quick check to see if the device might support ADB.
 * It just tries to establish a TCP connection to port 5555.
 */
export async function isAdbPortOpen(
  ip: string,
  timeoutMs: number = CONNECTION_TIMEOUT_MS
): Promise<boolean> {
  const TcpSocket = getTcpModule();
  if (!TcpSocket) {
    debug.warn('TCP socket module not available');
    return false;
  }

  return new Promise((resolve) => {
    let resolved = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let socket: any = null;

    const cleanup = (result: boolean) => {
      if (resolved) return;
      resolved = true;

      if (socket) {
        try {
          socket.destroy();
        } catch {
          // Ignore cleanup errors
        }
      }
      resolve(result);
    };

    // Set timeout
    const timer = setTimeout(() => {
      debug.log(`ADB port check timeout for ${ip}`);
      cleanup(false);
    }, timeoutMs);

    try {
      socket = TcpSocket.createConnection(
        {
          host: ip,
          port: ADB_PORT,
          timeout: timeoutMs,
        },
        () => {
          // Connection successful - port is open
          clearTimeout(timer);
          debug.log(`ADB port open at ${ip}:${ADB_PORT}`);
          cleanup(true);
        }
      );

      socket.on('error', (err: Error) => {
        clearTimeout(timer);
        debug.log(`ADB port closed at ${ip}: ${err.message}`);
        cleanup(false);
      });

      socket.on('timeout', () => {
        clearTimeout(timer);
        debug.log(`ADB port check timeout at ${ip}`);
        cleanup(false);
      });
    } catch (err) {
      clearTimeout(timer);
      debug.error(`Failed to check ADB port at ${ip}:`, err);
      cleanup(false);
    }
  });
}

/**
 * Scan a subnet for Fire TV devices using ADB
 *
 * This scans all IPs in a subnet range for devices with ADB enabled,
 * then identifies which ones are Fire TV devices.
 *
 * @param subnetPrefix - Subnet prefix (e.g., '192.168.1.')
 * @param options - Scan options
 * @returns Array of discovered Fire TV devices
 */
export async function scanSubnetForFireTv(
  subnetPrefix: string,
  options: {
    startIp?: number;
    endIp?: number;
    concurrency?: number;
    timeoutMs?: number;
    excludeIp?: string;
  } = {}
): Promise<DiscoveredDevice[]> {
  const {
    startIp = 1,
    endIp = 254,
    concurrency = 50,
    timeoutMs = CONNECTION_TIMEOUT_MS,
    excludeIp,
  } = options;

  debug.log(`Scanning subnet ${subnetPrefix}* for Fire TV devices...`);
  debug.log(`  Range: ${startIp}-${endIp}, Concurrency: ${concurrency}`);

  const discovered: DiscoveredDevice[] = [];
  const ipsToScan: string[] = [];

  // Build list of IPs to scan
  for (let i = startIp; i <= endIp; i++) {
    const ip = `${subnetPrefix}${i}`;
    if (ip !== excludeIp) {
      ipsToScan.push(ip);
    }
  }

  // Process in batches for concurrency control
  for (let i = 0; i < ipsToScan.length; i += concurrency) {
    const batch = ipsToScan.slice(i, i + concurrency);

    const results = await Promise.all(
      batch.map(async (ip) => {
        const deviceInfo = await probeAdbDevice(ip, timeoutMs);
        return { ip, deviceInfo };
      })
    );

    // Collect Fire TV devices
    for (const { ip, deviceInfo } of results) {
      if (deviceInfo?.isFireTv) {
        debug.log(`✓ Found Fire TV at ${ip}`);
        discovered.push({
          id: `firetv-${ip}`,
          name: deviceInfo.model
            ? `Fire TV (${deviceInfo.model})`
            : `Fire TV (${ip})`,
          ipAddress: ip,
          port: ADB_PORT,
          platform: TVPlatform.FireTV,
        });
      }
    }

    // Early exit if we found devices
    if (discovered.length > 0 && i + concurrency >= ipsToScan.length * 0.5) {
      // Found devices and scanned at least half
      debug.log(`Found ${discovered.length} Fire TV device(s), stopping scan`);
      break;
    }
  }

  debug.log(
    `Subnet scan complete. Found ${discovered.length} Fire TV device(s)`
  );
  return discovered;
}

/**
 * Check if ADB client is supported on this platform
 */
export function isAdbClientSupported(): boolean {
  const TcpSocket = getTcpModule();
  const supported = TcpSocket !== null;
  return supported;
}
