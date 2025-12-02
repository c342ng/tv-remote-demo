/**
 * Protocol adapter factory
 * Returns real or mock PlatformAdapter based on environment and platform.
 */

import type { PlatformAdapter } from '../domain';
import { TVPlatform } from '../domain/models';
import { isMockEnv } from '../services/env';
import { RokuAdapter } from './roku-adapter';
// Future: import other adapters here

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
    case TVPlatform.FireTV:
    case TVPlatform.WebOS:
    case TVPlatform.Tizen:
      throw new Error(`Adapter for ${platform} not yet implemented`);
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}
