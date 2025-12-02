/**
 * Platform Utils Tests
 */
import { TVPlatform } from '@remote/domain/models';
import {
  getPlatformName,
  getPlatformIcon,
  getPlatformDisplay,
  isPlatformImplemented,
} from '@remote/utils/platform-utils';

describe('Platform Utils', () => {
  describe('getPlatformName', () => {
    it('should return correct names for all platforms', () => {
      expect(getPlatformName(TVPlatform.Roku)).toBe('Roku');
      expect(getPlatformName(TVPlatform.AndroidTV)).toBe('Android TV');
      expect(getPlatformName(TVPlatform.FireTV)).toBe('Fire TV');
      expect(getPlatformName(TVPlatform.WebOS)).toBe('LG webOS');
      expect(getPlatformName(TVPlatform.Tizen)).toBe('Samsung');
      expect(getPlatformName(TVPlatform.Unknown)).toBe('未知');
    });

    it('should return fallback for unknown values', () => {
      expect(getPlatformName('invalid' as TVPlatform)).toBe('未知');
    });
  });

  describe('getPlatformIcon', () => {
    it('should return correct icons for all platforms', () => {
      expect(getPlatformIcon(TVPlatform.Roku)).toBe('📺');
      expect(getPlatformIcon(TVPlatform.AndroidTV)).toBe('🤖');
      expect(getPlatformIcon(TVPlatform.FireTV)).toBe('🔥');
      expect(getPlatformIcon(TVPlatform.WebOS)).toBe('🌐');
      expect(getPlatformIcon(TVPlatform.Tizen)).toBe('📱');
      expect(getPlatformIcon(TVPlatform.Unknown)).toBe('❓');
    });

    it('should return fallback for unknown values', () => {
      expect(getPlatformIcon('invalid' as TVPlatform)).toBe('❓');
    });
  });

  describe('getPlatformDisplay', () => {
    it('should combine icon and name', () => {
      expect(getPlatformDisplay(TVPlatform.Roku)).toBe('📺 Roku');
      expect(getPlatformDisplay(TVPlatform.AndroidTV)).toBe('🤖 Android TV');
      expect(getPlatformDisplay(TVPlatform.FireTV)).toBe('🔥 Fire TV');
    });
  });

  describe('isPlatformImplemented', () => {
    it('should return true for implemented platforms', () => {
      expect(isPlatformImplemented(TVPlatform.Roku)).toBe(true);
      expect(isPlatformImplemented(TVPlatform.AndroidTV)).toBe(true);
      expect(isPlatformImplemented(TVPlatform.FireTV)).toBe(true);
    });

    it('should return false for unimplemented platforms', () => {
      expect(isPlatformImplemented(TVPlatform.WebOS)).toBe(false);
      expect(isPlatformImplemented(TVPlatform.Tizen)).toBe(false);
      expect(isPlatformImplemented(TVPlatform.Unknown)).toBe(false);
    });
  });
});
