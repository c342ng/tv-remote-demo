/**
 * Protocol adapter factory
 * Returns real or mock PlatformAdapter based on environment and platform.
 */

import type { PlatformAdapter } from '../domain/index';
import { TVPlatform } from '../domain/models';
import { isMockEnv } from '../services/env';
import { RokuAdapter } from './roku-adapter';
import { AndroidTVAdapter } from './android-tv-adapter';
import { FireTVAdapter } from './fire-tv-adapter';
import { WebOSAdapter } from './webos-adapter';
import { TizenAdapter } from './tizen-adapter';

/**
 * Get a PlatformAdapter for the given platform.
 * In mock mode, returns a mock adapter; otherwise returns the real adapter.
 */
export function getAdapter(platform: TVPlatform): PlatformAdapter {
  if (isMockEnv()) {
    // TODO: return mock adapter once implemented
    throw new Error(`Mock adapter for ${platform} not yet implemented`);
  }

  switch (platform) {
    case TVPlatform.Roku:
      return new RokuAdapter();
    case TVPlatform.AndroidTV:
      return new AndroidTVAdapter();
    case TVPlatform.FireTV:
      return new FireTVAdapter();
    case TVPlatform.WebOS:
      return new WebOSAdapter();
    case TVPlatform.Tizen:
      return new TizenAdapter();
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

/**
 * Get all available platform adapters
 * Useful for aggregated discovery
 */
export function getAllAdapters(): PlatformAdapter[] {
  const adapters: PlatformAdapter[] = [];

  // Include all implemented adapters
  adapters.push(new RokuAdapter());
  adapters.push(new AndroidTVAdapter());
  adapters.push(new FireTVAdapter());
  adapters.push(new WebOSAdapter());
  adapters.push(new TizenAdapter());

  return adapters;
}

/**
 * Check if a platform adapter is available (fully implemented)
 */
export function isAdapterAvailable(platform: TVPlatform): boolean {
  switch (platform) {
    case TVPlatform.Roku:
    case TVPlatform.AndroidTV:
    case TVPlatform.FireTV:
      return true;
    case TVPlatform.WebOS:
    case TVPlatform.Tizen:
      return false; // Skeleton only, not fully implemented
    default:
      return false;
  }
}

/**
 * Get adapter for a specific device
 * Convenience function that extracts platform from device
 */
export function getAdapterForDevice(device: { platform: TVPlatform }): PlatformAdapter | null {
  try {
    return getAdapter(device.platform);
  } catch {
    return null;
  }
}
