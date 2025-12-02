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
// Future: import WebOS and Tizen adapters here

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
    case TVPlatform.Tizen:
      throw new Error(`Adapter for ${platform} not yet implemented`);
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

  // Only include implemented adapters
  adapters.push(new RokuAdapter());
  adapters.push(new AndroidTVAdapter());
  adapters.push(new FireTVAdapter());
  // TODO: Add WebOS and Tizen when implemented

  return adapters;
}

/**
 * Check if a platform adapter is available
 */
export function isAdapterAvailable(platform: TVPlatform): boolean {
  switch (platform) {
    case TVPlatform.Roku:
    case TVPlatform.AndroidTV:
    case TVPlatform.FireTV:
      return true;
    case TVPlatform.WebOS:
    case TVPlatform.Tizen:
      return false; // Not yet implemented
    default:
      return false;
  }
}
