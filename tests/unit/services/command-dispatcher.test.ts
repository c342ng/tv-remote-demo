/**
 * Unit tests for CommandDispatcher
 */
import {
  CommandDispatcher,
  isCommandSupported,
  getCommandMetadata,
  getSupportedCommands,
} from '@remote/services/command-dispatcher';
import { RemoteCommandType, TVCapabilities, SessionErrorCode } from '@remote/domain/models';

describe('Command Dispatcher', () => {
  describe('isCommandSupported', () => {
    const fullCapabilities: TVCapabilities = {
      powerControl: true,
      volumeControl: true,
      channelControl: true,
      voiceInput: false,
      keyboard: true,
      apps: true,
    };

    const limitedCapabilities: TVCapabilities = {
      powerControl: false,
      volumeControl: false,
      channelControl: false,
      voiceInput: false,
      keyboard: true,
      apps: false,
    };

    it('should return true for navigation commands (no capability required)', () => {
      expect(isCommandSupported(RemoteCommandType.Up, limitedCapabilities)).toBe(true);
      expect(isCommandSupported(RemoteCommandType.Down, limitedCapabilities)).toBe(true);
      expect(isCommandSupported(RemoteCommandType.Select, limitedCapabilities)).toBe(true);
    });

    it('should return true for power when powerControl is true', () => {
      expect(isCommandSupported(RemoteCommandType.Power, fullCapabilities)).toBe(true);
    });

    it('should return false for power when powerControl is false', () => {
      expect(isCommandSupported(RemoteCommandType.Power, limitedCapabilities)).toBe(false);
    });

    it('should return true for volume when volumeControl is true', () => {
      expect(isCommandSupported(RemoteCommandType.VolumeUp, fullCapabilities)).toBe(true);
      expect(isCommandSupported(RemoteCommandType.Mute, fullCapabilities)).toBe(true);
    });

    it('should return false for volume when volumeControl is false', () => {
      expect(isCommandSupported(RemoteCommandType.VolumeUp, limitedCapabilities)).toBe(false);
      expect(isCommandSupported(RemoteCommandType.Mute, limitedCapabilities)).toBe(false);
    });
  });

  describe('getCommandMetadata', () => {
    it('should return metadata for valid commands', () => {
      const metadata = getCommandMetadata(RemoteCommandType.Up);
      expect(metadata).not.toBeNull();
      expect(metadata?.displayName).toBe('上');
      expect(metadata?.category).toBe('navigation');
      expect(metadata?.repeatable).toBe(true);
    });

    it('should return correct metadata for power command', () => {
      const metadata = getCommandMetadata(RemoteCommandType.Power);
      expect(metadata?.displayName).toBe('电源');
      expect(metadata?.requiresCapability).toBe('powerControl');
      expect(metadata?.repeatable).toBe(false);
    });
  });

  describe('getSupportedCommands', () => {
    it('should return all navigation commands for limited capabilities', () => {
      const capabilities: TVCapabilities = {
        powerControl: false,
        volumeControl: false,
        channelControl: false,
        voiceInput: false,
        keyboard: true,
        apps: false,
      };

      const supported = getSupportedCommands(capabilities);

      expect(supported).toContain(RemoteCommandType.Up);
      expect(supported).toContain(RemoteCommandType.Down);
      expect(supported).toContain(RemoteCommandType.Select);
      expect(supported).not.toContain(RemoteCommandType.Power);
      expect(supported).not.toContain(RemoteCommandType.VolumeUp);
    });

    it('should return more commands for full capabilities', () => {
      const capabilities: TVCapabilities = {
        powerControl: true,
        volumeControl: true,
        channelControl: true,
        voiceInput: false,
        keyboard: true,
        apps: true,
      };

      const supported = getSupportedCommands(capabilities);

      expect(supported).toContain(RemoteCommandType.Power);
      expect(supported).toContain(RemoteCommandType.VolumeUp);
      expect(supported).toContain(RemoteCommandType.ChannelUp);
    });
  });

  describe('CommandDispatcher', () => {
    let dispatcher: CommandDispatcher;

    beforeEach(() => {
      dispatcher = new CommandDispatcher();
    });

    it('should not be ready without session', () => {
      expect(dispatcher.isReady()).toBe(false);
    });

    it('should return error when dispatching without session', async () => {
      const result = await dispatcher.dispatch(RemoteCommandType.Up);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SessionErrorCode.NetworkUnreachable);
    });
  });
});
