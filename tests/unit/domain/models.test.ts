/**
 * Unit tests for domain models
 */
import {
  TVPlatform,
  ConnectionStatus,
  RemoteCommandType,
  SessionErrorCode,
} from '@remote/domain/models';

describe('Domain Models', () => {
  describe('TVPlatform enum', () => {
    it('should have correct platform values', () => {
      expect(TVPlatform.Roku).toBe('roku');
      expect(TVPlatform.AndroidTV).toBe('android_tv');
      expect(TVPlatform.FireTV).toBe('fire_tv');
      expect(TVPlatform.WebOS).toBe('lg_webos');
      expect(TVPlatform.Tizen).toBe('samsung_tizen');
    });

    it('should contain all expected platforms', () => {
      const platforms = Object.values(TVPlatform);
      expect(platforms).toHaveLength(5);
      expect(platforms).toContain('roku');
      expect(platforms).toContain('android_tv');
    });
  });

  describe('ConnectionStatus enum', () => {
    it('should have correct status values', () => {
      expect(ConnectionStatus.Idle).toBe('idle');
      expect(ConnectionStatus.Connected).toBe('connected');
      expect(ConnectionStatus.Disconnected).toBe('disconnected');
      expect(ConnectionStatus.Connecting).toBe('connecting');
      expect(ConnectionStatus.Reconnecting).toBe('reconnecting');
    });

    it('should contain all expected statuses', () => {
      const statuses = Object.values(ConnectionStatus);
      expect(statuses).toHaveLength(7);
    });
  });

  describe('RemoteCommandType enum', () => {
    it('should have navigation commands', () => {
      expect(RemoteCommandType.Up).toBe('UP');
      expect(RemoteCommandType.Down).toBe('DOWN');
      expect(RemoteCommandType.Left).toBe('LEFT');
      expect(RemoteCommandType.Right).toBe('RIGHT');
      expect(RemoteCommandType.Select).toBe('OK');
    });

    it('should have playback commands', () => {
      expect(RemoteCommandType.Play).toBe('PLAY');
      expect(RemoteCommandType.Pause).toBe('PAUSE');
      expect(RemoteCommandType.Rewind).toBe('REV');
      expect(RemoteCommandType.FastForward).toBe('FWD');
    });

    it('should have volume commands', () => {
      expect(RemoteCommandType.VolumeUp).toBe('VOLUME_UP');
      expect(RemoteCommandType.VolumeDown).toBe('VOLUME_DOWN');
      expect(RemoteCommandType.Mute).toBe('MUTE');
    });

    it('should have number keys', () => {
      expect(RemoteCommandType.Num0).toBe('NUM_0');
      expect(RemoteCommandType.Num9).toBe('NUM_9');
    });
  });

  describe('SessionErrorCode enum', () => {
    it('should have correct error codes', () => {
      expect(SessionErrorCode.NetworkUnreachable).toBe('NETWORK_UNREACHABLE');
      expect(SessionErrorCode.AuthFailed).toBe('AUTH_FAILED');
      expect(SessionErrorCode.CommandUnsupported).toBe('COMMAND_UNSUPPORTED');
      expect(SessionErrorCode.Timeout).toBe('TIMEOUT');
      expect(SessionErrorCode.Unknown).toBe('UNKNOWN');
    });
  });
});
