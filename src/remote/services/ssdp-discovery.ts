/**
 * SSDP Discovery Service for Roku devices
 *
 * Uses SSDP (Simple Service Discovery Protocol) to discover Roku devices
 * on the local network. This is much faster than IP subnet scanning.
 *
 * Protocol details (from research.md):
 * - Roku advertises via SSDP with service type `roku:ecp`
 * - Send M-SEARCH request to 239.255.255.250:1900
 * - Response contains LOCATION field with device ECP URL
 *
 * @module ssdp-discovery
 */

import { Buffer } from 'buffer';
import type { DiscoveredDevice } from '../domain/remote-interfaces';
import { TVPlatform } from '../domain/models';

/** Debug logger for SSDP discovery */
const DEBUG_TAG = '[SSDP]';
const debug = {
  log: (...args: unknown[]) => console.log(DEBUG_TAG, ...args),
  warn: (...args: unknown[]) => console.warn(DEBUG_TAG, ...args),
  error: (...args: unknown[]) => console.error(DEBUG_TAG, ...args),
};

/** SSDP multicast address */
const SSDP_MULTICAST_ADDRESS = '239.255.255.250';

/** SSDP port */
const SSDP_PORT = 1900;

/** Roku ECP service type for SSDP discovery */
const ROKU_SERVICE_TYPE = 'roku:ecp';

/** Default timeout for SSDP discovery in milliseconds (5 seconds for better reliability) */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Lazy-load the dgram module to avoid crashes at import time
 * Returns null if the module is not available
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDgramModule(): any | null {
  try {
    // Dynamic require to avoid import-time crashes
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dgram = require('react-native-udp');
    
    // Check if the module is properly initialized
    if (!dgram) {
      debug.warn('react-native-udp module is null');
      return null;
    }
    
    // The module exports a class with static createSocket method
    // Check both direct and default export patterns
    const createSocket = dgram.createSocket || dgram.default?.createSocket;
    
    if (typeof createSocket !== 'function') {
      debug.warn('react-native-udp.createSocket is not a function');
      debug.log('dgram type:', typeof dgram);
      debug.log('dgram keys:', dgram ? Object.keys(dgram) : 'null');
      debug.log('dgram.default:', dgram?.default);
      return null;
    }
    
    // Return a wrapper that uses the correct createSocket
    return {
      createSocket: createSocket.bind(dgram.default || dgram),
    };
  } catch (err) {
    debug.warn('Failed to load react-native-udp:', err);
    return null;
  }
}

/**
 * SSDP M-SEARCH request template for Roku devices
 * 
 * Format follows RFC 2616 and UPnP standards:
 * - M-SEARCH * HTTP/1.1
 * - Host: multicast address:port
 * - Man: "ssdp:discover"
 * - ST: search target (service type)
 * - MX: maximum wait time in seconds
 */
function buildMSearchRequest(serviceType: string, maxWaitSeconds: number = 2): string {
  return [
    'M-SEARCH * HTTP/1.1',
    `Host: ${SSDP_MULTICAST_ADDRESS}:${SSDP_PORT}`,
    'Man: "ssdp:discover"',
    `ST: ${serviceType}`,
    `MX: ${maxWaitSeconds}`,
    '',
    '',
  ].join('\r\n');
}

/**
 * Parse SSDP response headers
 * 
 * Response format:
 * ```
 * HTTP/1.1 200 OK
 * LOCATION: http://10.13.12.37:8060/
 * USN: uuid:roku:ecp:P0A070000000
 * ST: roku:ecp
 * ...
 * ```
 */
function parseSsdpResponse(response: string): { location: string | null; usn: string | null } {
  const lines = response.split(/\r?\n/);
  let location: string | null = null;
  let usn: string | null = null;

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const headerName = line.substring(0, colonIndex).trim().toUpperCase();
    const headerValue = line.substring(colonIndex + 1).trim();

    if (headerName === 'LOCATION') {
      location = headerValue;
    } else if (headerName === 'USN') {
      usn = headerValue;
    }
  }

  return { location, usn };
}

/**
 * Extract IP address and port from a LOCATION URL
 * @example "http://10.13.12.37:8060/" => { ip: "10.13.12.37", port: 8060 }
 */
function parseLocationUrl(location: string): { ip: string; port: number } | null {
  try {
    // Parse URL format: http://ip:port/
    const match = location.match(/^https?:\/\/([^/:]+):?(\d+)?/);
    if (!match) return null;

    const ip = match[1];
    const port = match[2] ? parseInt(match[2], 10) : 8060; // Default Roku ECP port

    return { ip, port };
  } catch {
    return null;
  }
}

/**
 * Extract device ID from USN field
 * @example "uuid:roku:ecp:P0A070000000" => "P0A070000000"
 */
function parseUsn(usn: string): string | null {
  // USN format: uuid:roku:ecp:<serial>
  const match = usn.match(/uuid:roku:ecp:(.+)/i);
  return match ? match[1] : null;
}

/**
 * Fetch device info from Roku ECP endpoint
 * 
 * Calls /query/device-info to get device name, model, and serial number
 */
async function fetchDeviceInfo(
  ip: string,
  port: number,
  timeoutMs: number = 2000
): Promise<{ name: string; model: string; serialNumber: string } | null> {
  const url = `http://${ip}:${port}/query/device-info`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/xml, text/xml, */*',
      },
    });

    clearTimeout(timer);

    if (!response.ok) {
      debug.warn(`Device info request failed for ${ip}: HTTP ${response.status}`);
      return null;
    }

    const text = await response.text();

    // Parse XML response
    const nameMatch = text.match(/<user-device-name>([^<]+)<\/user-device-name>/);
    const modelMatch = text.match(/<model-name>([^<]+)<\/model-name>/);
    const serialMatch = text.match(/<serial-number>([^<]+)<\/serial-number>/);

    return {
      name: nameMatch?.[1] ?? `Roku (${ip})`,
      model: modelMatch?.[1] ?? 'Unknown Model',
      serialNumber: serialMatch?.[1] ?? ip,
    };
  } catch (err) {
    clearTimeout(timer);
    debug.warn(`Failed to fetch device info for ${ip}:`, err);
    return null;
  }
}

/**
 * Discover Roku devices on the local network using SSDP
 *
 * This function sends an M-SEARCH request to the SSDP multicast address
 * and listens for responses from Roku devices.
 *
 * @param timeoutMs - Maximum time to wait for responses (default: 3000ms)
 * @returns Promise resolving to array of discovered devices
 *
 * @example
 * ```typescript
 * const devices = await discoverRokuViaSsdp();
 * // devices: [{ id: 'P0A070000000', name: 'Living Room Roku', ... }]
 * ```
 */
export async function discoverRokuViaSsdp(
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<DiscoveredDevice[]> {
  debug.log('Starting SSDP discovery...');
  debug.log(`Timeout: ${timeoutMs}ms`);

  // Get the dgram module
  const dgram = getDgramModule();
  if (!dgram) {
    debug.error('SSDP discovery not available: react-native-udp module not loaded');
    return [];
  }
  
  debug.log('react-native-udp module loaded successfully');

  return new Promise((resolve) => {
    const discovered = new Map<string, DiscoveredDevice>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let socket: any = null;
    let timeoutHandle: NodeJS.Timeout | null = null;
    let isCompleted = false;

    // Cleanup function
    const cleanup = (reason: string) => {
      if (isCompleted) return;
      isCompleted = true;

      debug.log(`Cleanup triggered: ${reason}`);

      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }

      if (socket) {
        try {
          debug.log('Closing socket...');
          socket.close();
          debug.log('Socket closed');
        } catch (closeErr) {
          debug.warn('Error closing socket:', closeErr);
        }
        socket = null;
      }

      const devices = Array.from(discovered.values());
      debug.log(`Discovery completed. Found ${devices.length} device(s)`);
      devices.forEach((d) => {
        debug.log(`  Found Roku: ${d.name} at ${d.ipAddress}`);
      });
      resolve(devices);
    };

    // Set timeout for overall discovery
    timeoutHandle = setTimeout(() => {
      debug.log('Discovery timeout reached');
      cleanup('timeout');
    }, timeoutMs);

    try {
      debug.log('Creating UDP socket...');
      
      // Create UDP socket
      socket = dgram.createSocket({ type: 'udp4' });
      
      debug.log('UDP socket created successfully');

      // Handle socket errors
      socket.on('error', (err: Error) => {
        debug.error('Socket error:', err.message);
        cleanup('socket_error');
      });

      // Handle incoming messages (SSDP responses)
      socket.on('message', async (msg: Buffer, rinfo: { address: string; port: number }) => {
        if (isCompleted) {
          debug.log('Ignoring message after completion');
          return;
        }

        debug.log(`Received SSDP response from ${rinfo.address}:${rinfo.port}`);
        
        const response = msg.toString('utf8');
        debug.log(`Response content (first 200 chars): ${response.substring(0, 200)}`);

        // Parse SSDP response
        const { location, usn } = parseSsdpResponse(response);
        debug.log(`Parsed - LOCATION: ${location}, USN: ${usn}`);

        if (!location) {
          debug.warn('Response missing LOCATION header');
          return;
        }

        // Parse location URL
        const urlInfo = parseLocationUrl(location);
        if (!urlInfo) {
          debug.warn(`Failed to parse LOCATION: ${location}`);
          return;
        }

        // Generate device ID from USN or IP
        const deviceIdFromUsn = usn ? parseUsn(usn) : null;
        const deviceId = deviceIdFromUsn ?? urlInfo.ip;

        // Skip if already discovered
        if (discovered.has(deviceId)) {
          debug.log(`Duplicate device skipped: ${deviceId}`);
          return;
        }

        debug.log(`New Roku discovered at ${urlInfo.ip}:${urlInfo.port} (ID: ${deviceId})`);

        // Fetch device info
        debug.log(`Fetching device info from ${urlInfo.ip}:${urlInfo.port}...`);
        const deviceInfo = await fetchDeviceInfo(urlInfo.ip, urlInfo.port);
        debug.log(`Device info: ${JSON.stringify(deviceInfo)}`);

        const device: DiscoveredDevice = {
          id: deviceInfo?.serialNumber ?? deviceId,
          name: deviceInfo?.name ?? `Roku (${urlInfo.ip})`,
          ipAddress: urlInfo.ip,
          port: urlInfo.port,
          platform: TVPlatform.Roku,
        };

        discovered.set(device.id, device);
        debug.log(`[SSDP] Found Roku: ${device.name} at ${device.ipAddress}`);
      });

      // Bind to a random port and send M-SEARCH request
      debug.log('Binding socket to random port...');
      
      socket.bind(0, () => {
        if (isCompleted || !socket) {
          debug.log('Socket bind callback: already completed or socket null');
          return;
        }

        const address = socket.address?.() || { port: 'unknown' };
        debug.log(`Socket bound to port ${address.port}`);

        const request = buildMSearchRequest(ROKU_SERVICE_TYPE);

        debug.log('Sending M-SEARCH request to multicast address...');
        debug.log(`Request:\n${request}`);

        // react-native-udp accepts string directly, it will convert to Buffer internally
        // Using simplified API: send(msg, port, address, callback)
        socket.send(
          request,
          undefined,  // offset - not needed for string
          undefined,  // length - not needed for string  
          SSDP_PORT,
          SSDP_MULTICAST_ADDRESS,
          (err: Error | null) => {
            if (err) {
              debug.error('Failed to send M-SEARCH:', err.message);
              cleanup('send_error');
            } else {
              debug.log('M-SEARCH request sent successfully');
              debug.log(`Waiting for responses (timeout: ${timeoutMs}ms)...`);
            }
          }
        );
      });
    } catch (err) {
      debug.error('Failed to create socket:', err);
      cleanup('create_socket_error');
    }
  });
}

/**
 * Check if SSDP discovery is supported on this platform
 *
 * SSDP requires UDP multicast support, which may not be available
 * in all environments (e.g., some simulators, web, Expo Go).
 *
 * @returns true if SSDP discovery is likely to work
 */
export function isSsdpSupported(): boolean {
  try {
    const dgram = getDgramModule();
    const supported = dgram !== null;
    debug.log(`SSDP support check: ${supported ? 'available' : 'not available'}`);
    return supported;
  } catch (err) {
    debug.warn('SSDP support check failed:', err);
    return false;
  }
}
