/**
 * Environment helpers for mock/real mode switching
 *
 * When TV_REMOTE_ENV === 'mock', the app uses mock adapters.
 * Any other value (or unset) means real/production mode.
 */

import Constants from 'expo-constants';

const TV_REMOTE_ENV_KEY = 'TV_REMOTE_ENV';

/**
 * Returns true if we are in mock mode.
 */
export function isMockEnv(): boolean {
  // Expo exposes extra env via Constants.expoConfig.extra or process.env in some setups
  const envValue =
    (Constants.expoConfig?.extra as Record<string, unknown>)?.[TV_REMOTE_ENV_KEY] ??
    process.env[TV_REMOTE_ENV_KEY];
  return envValue === 'mock';
}

/**
 * Returns 'mock' | 'real' for logging/diagnostics.
 */
export function getEnvMode(): 'mock' | 'real' {
  return isMockEnv() ? 'mock' : 'real';
}
