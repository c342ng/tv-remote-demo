/**
 * Platform Utilities
 * Shared helpers for TV platform display and formatting
 */
import { TVPlatform } from '../domain/models';

/**
 * Platform display names for UI
 */
const PLATFORM_NAMES: Record<TVPlatform, string> = {
  [TVPlatform.Roku]: 'Roku',
  [TVPlatform.AndroidTV]: 'Android TV',
  [TVPlatform.FireTV]: 'Fire TV',
  [TVPlatform.WebOS]: 'LG webOS',
  [TVPlatform.Tizen]: 'Samsung',
  [TVPlatform.Unknown]: '未知',
};

/**
 * Platform icons (emoji) for UI
 */
const PLATFORM_ICONS: Record<TVPlatform, string> = {
  [TVPlatform.Roku]: '📺',
  [TVPlatform.AndroidTV]: '🤖',
  [TVPlatform.FireTV]: '🔥',
  [TVPlatform.WebOS]: '🌐',
  [TVPlatform.Tizen]: '📱',
  [TVPlatform.Unknown]: '❓',
};

/**
 * Get human-readable platform name
 */
export function getPlatformName(platform: TVPlatform): string {
  return PLATFORM_NAMES[platform] ?? '未知';
}

/**
 * Get platform icon (emoji)
 */
export function getPlatformIcon(platform: TVPlatform): string {
  return PLATFORM_ICONS[platform] ?? '❓';
}

/**
 * Get platform display string with icon
 */
export function getPlatformDisplay(platform: TVPlatform): string {
  return `${getPlatformIcon(platform)} ${getPlatformName(platform)}`;
}

/**
 * Check if platform is implemented
 */
export function isPlatformImplemented(platform: TVPlatform): boolean {
  return (
    platform === TVPlatform.Roku ||
    platform === TVPlatform.AndroidTV ||
    platform === TVPlatform.FireTV
  );
}
