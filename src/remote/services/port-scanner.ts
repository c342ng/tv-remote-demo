/**
 * Port Scanner Service
 *
 * Provides unified port scanning logic for device discovery.
 * Used by protocol adapters to scan subnets for specific ports.
 *
 * Features:
 * - Concurrent scanning with configurable limits
 * - Priority-based block scanning
 * - Cancellation support
 * - Async generator for streaming results
 *
 * @module port-scanner
 */

import { runWithConcurrency, type CancellableExecution } from '../utils/concurrency';
import type { ScanBlock } from './network-utils';

/** Debug logger */
const DEBUG_TAG = '[PortScanner]';
const debug = {
  log: (...args: unknown[]) => console.log(DEBUG_TAG, ...args),
  warn: (...args: unknown[]) => console.warn(DEBUG_TAG, ...args),
  error: (...args: unknown[]) => console.error(DEBUG_TAG, ...args),
};

/** Default values */
const DEFAULT_TIMEOUT_MS = 1000;
const DEFAULT_CONCURRENCY = 50;

/**
 * Result of a port scan
 */
export interface ScanResult {
  /** IP address that was scanned */
  ip: string;
  /** Port that was scanned */
  port: number;
  /** Whether the port is open */
  isOpen: boolean;
  /** Response time in milliseconds (if open) */
  responseTimeMs?: number;
}

/**
 * Options for subnet scanning
 */
export interface ScanOptions {
  /** Timeout for each probe in milliseconds */
  timeoutMs?: number;
  /** Maximum concurrent probes */
  concurrency?: number;
  /** Callback when an open port is found */
  onFound?: (ip: string, responseTimeMs: number) => void;
  /** Skip these IPs (e.g., device's own IP) */
  excludeIps?: string[];
}

/**
 * Check if a specific port is open on an IP address
 *
 * Uses HTTP HEAD request for HTTP ports, TCP socket probe for others.
 */
export async function probePort(
  ip: string,
  port: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<ScanResult> {
  const startTime = Date.now();

  try {
    // For common HTTP ports, use fetch with HEAD request
    if ([80, 443, 8008, 8060, 8080, 8443, 8001, 8002, 9000].includes(port)) {
      const protocol = port === 443 || port === 8443 ? 'https' : 'http';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        await fetch(`${protocol}://${ip}:${port}/`, {
          method: 'HEAD',
          signal: controller.signal,
        });

        clearTimeout(timeout);
        const responseTimeMs = Date.now() - startTime;

        return {
          ip,
          port,
          isOpen: true,
          responseTimeMs,
        };
      } catch (err) {
        clearTimeout(timeout);

        // Check if it's a connection refused (port open but different protocol)
        // vs timeout (port closed/filtered)
        const error = err as Error;
        if (error.name === 'AbortError') {
          return { ip, port, isOpen: false };
        }

        // Some errors indicate the port is open but returned an error
        // (e.g., SSL handshake failure on non-SSL port)
        if (error.message?.includes('SSL') || error.message?.includes('certificate')) {
          return {
            ip,
            port,
            isOpen: true,
            responseTimeMs: Date.now() - startTime,
          };
        }

        return { ip, port, isOpen: false };
      }
    }

    // For non-HTTP ports, try a simple fetch to see if connection is refused
    // This is a workaround since React Native doesn't have raw TCP sockets
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      await fetch(`http://${ip}:${port}/`, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return {
        ip,
        port,
        isOpen: true,
        responseTimeMs: Date.now() - startTime,
      };
    } catch (err) {
      clearTimeout(timeout);
      const error = err as Error;

      // AbortError means timeout - port is likely closed or filtered
      if (error.name === 'AbortError') {
        return { ip, port, isOpen: false };
      }

      // Connection refused means port is closed
      // But network error could mean port is open with different protocol
      return { ip, port, isOpen: false };
    }
  } catch {
    return { ip, port, isOpen: false };
  }
}

/**
 * Scan a single /24 subnet for a specific port
 *
 * @param prefix Subnet prefix (e.g., "192.168.1.")
 * @param port Port to scan
 * @param options Scan options
 * @returns Array of IPs with open ports
 */
export async function scanSubnetForPort(
  prefix: string,
  port: number,
  options: ScanOptions = {}
): Promise<string[]> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    concurrency = DEFAULT_CONCURRENCY,
    onFound,
    excludeIps = [],
  } = options;

  const excludeSet = new Set(excludeIps);
  const openIps: string[] = [];

  // Generate all IPs in the subnet (1-254)
  const ips: string[] = [];
  for (let i = 1; i <= 254; i++) {
    const ip = `${prefix}${i}`;
    if (!excludeSet.has(ip)) {
      ips.push(ip);
    }
  }

  debug.log(`Scanning ${prefix}x:${port} (${ips.length} IPs, concurrency: ${concurrency})`);

  // Create probe tasks
  const tasks = ips.map((ip) => async () => {
    const result = await probePort(ip, port, timeoutMs);
    if (result.isOpen) {
      openIps.push(ip);
      if (onFound) {
        onFound(ip, result.responseTimeMs ?? 0);
      }
    }
    return result;
  });

  // Run with concurrency control
  const { promise } = runWithConcurrency(tasks, concurrency);
  await promise;

  debug.log(`Scan complete: ${prefix}x:${port} - ${openIps.length} open`);
  return openIps;
}

/**
 * Scan multiple /24 blocks for a specific port with priority ordering
 *
 * Returns results as they are found via async generator.
 *
 * @param blocks Array of scan blocks with priority
 * @param port Port to scan
 * @param options Scan options
 */
export async function* scanBlocksForPort(
  blocks: ScanBlock[],
  port: number,
  options: ScanOptions = {}
): AsyncGenerator<string, void, unknown> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    concurrency = DEFAULT_CONCURRENCY,
    excludeIps = [],
  } = options;

  const excludeSet = new Set(excludeIps);
  const foundIps = new Set<string>();

  // Sort blocks by priority (should already be sorted, but ensure)
  const sortedBlocks = [...blocks].sort((a, b) => a.priority - b.priority);

  debug.log(`Scanning ${sortedBlocks.length} blocks for port ${port}`);

  for (const block of sortedBlocks) {
    // Generate IPs for this block
    const ips: string[] = [];
    for (let i = 1; i <= 254; i++) {
      const ip = `${block.prefix}${i}`;
      if (!excludeSet.has(ip) && !foundIps.has(ip)) {
        ips.push(ip);
      }
    }

    if (ips.length === 0) continue;

    // Create probe tasks
    const tasks = ips.map((ip) => async () => {
      const result = await probePort(ip, port, timeoutMs);
      return { ip, isOpen: result.isOpen };
    });

    // Run block with concurrency
    const { promise } = runWithConcurrency(tasks, concurrency);
    const { results } = await promise;

    // Yield found IPs
    for (const result of results) {
      if (result.isOpen && !foundIps.has(result.ip)) {
        foundIps.add(result.ip);
        yield result.ip;
      }
    }
  }

  debug.log(`Block scan complete: found ${foundIps.size} IPs with port ${port} open`);
}

/**
 * Cancellable subnet scanner
 *
 * Scans multiple blocks with cancellation support.
 */
export function createCancellableScanner(
  blocks: ScanBlock[],
  port: number,
  options: ScanOptions = {}
): CancellableExecution<string[]> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    concurrency = DEFAULT_CONCURRENCY,
    onFound,
    excludeIps = [],
  } = options;

  const excludeSet = new Set(excludeIps);
  let cancelled = false;

  const cancel = () => {
    cancelled = true;
    debug.log('Scanner cancelled');
  };

  const isCancelled = () => cancelled;

  const promise = (async () => {
    const openIps: string[] = [];
    const sortedBlocks = [...blocks].sort((a, b) => a.priority - b.priority);

    for (const block of sortedBlocks) {
      if (cancelled) break;

      // Generate IPs for this block
      const ips: string[] = [];
      for (let i = 1; i <= 254; i++) {
        const ip = `${block.prefix}${i}`;
        if (!excludeSet.has(ip)) {
          ips.push(ip);
        }
      }

      // Create probe tasks
      const tasks = ips.map((ip) => async () => {
        if (cancelled) return { ip, isOpen: false };
        const result = await probePort(ip, port, timeoutMs);
        if (result.isOpen) {
          openIps.push(ip);
          if (onFound) {
            onFound(ip, result.responseTimeMs ?? 0);
          }
        }
        return result;
      });

      // Run with concurrency
      const execution = runWithConcurrency(tasks, concurrency);

      // Forward cancellation
      if (cancelled) {
        execution.cancel();
        break;
      }

      await execution.promise;
    }

    return {
      results: [openIps],
      errors: [],
      cancelled: cancelled ? 1 : 0,
      durationMs: 0, // Filled by caller if needed
    };
  })();

  return {
    promise: promise.then((r) => r),
    cancel,
    isCancelled,
  };
}

/**
 * Quick probe of known IPs for a specific port
 *
 * Useful for verifying cached devices quickly.
 */
export async function probeKnownIps(
  ips: string[],
  port: number,
  options: ScanOptions = {}
): Promise<Map<string, boolean>> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, concurrency = DEFAULT_CONCURRENCY } = options;

  const results = new Map<string, boolean>();

  debug.log(`Probing ${ips.length} known IPs on port ${port}`);

  const tasks = ips.map((ip) => async () => {
    const result = await probePort(ip, port, timeoutMs);
    results.set(ip, result.isOpen);
    return result;
  });

  const { promise } = runWithConcurrency(tasks, concurrency);
  await promise;

  const openCount = Array.from(results.values()).filter((v) => v).length;
  debug.log(`Probe complete: ${openCount}/${ips.length} IPs responding on port ${port}`);

  return results;
}
