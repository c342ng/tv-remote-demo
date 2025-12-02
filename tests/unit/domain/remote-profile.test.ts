/**
 * Unit tests for RemoteProfile and TVCapabilities interaction
 * T037: Tests button visibility and availability based on platform capabilities
 */
import {
  RemoteCommandType,
  TVCapabilities,
  RemoteButton,
  RemoteProfile,
} from '@remote/domain/models';
import {
  isCommandSupported,
  getCommandMetadata,
  getSupportedCommands,
} from '@remote/services/command-dispatcher';

describe('RemoteProfile and TVCapabilities Interaction', () => {
  /**
   * Helper to create a remote button
   */
  const createButton = (
    command: RemoteCommandType,
    label: string,
    requiresCapability?: keyof TVCapabilities | null
  ): RemoteButton => ({
    id: `btn-${command}`,
    label,
    command,
    requiresCapability,
  });

  /**
   * Create a basic remote profile
   */
  const createProfile = (): RemoteProfile => ({
    id: 'default',
    name: 'Default Remote',
    buttons: [
      createButton(RemoteCommandType.Up, '上', null),
      createButton(RemoteCommandType.Down, '下', null),
      createButton(RemoteCommandType.Left, '左', null),
      createButton(RemoteCommandType.Right, '右', null),
      createButton(RemoteCommandType.Select, '确认', null),
      createButton(RemoteCommandType.Back, '返回', null),
      createButton(RemoteCommandType.Home, '主页', null),
      createButton(RemoteCommandType.Power, '电源', 'powerControl'),
      createButton(RemoteCommandType.VolumeUp, '音量+', 'volumeControl'),
      createButton(RemoteCommandType.VolumeDown, '音量-', 'volumeControl'),
      createButton(RemoteCommandType.Mute, '静音', 'volumeControl'),
      createButton(RemoteCommandType.ChannelUp, '频道+', 'channelControl'),
      createButton(RemoteCommandType.ChannelDown, '频道-', 'channelControl'),
    ],
  });

  describe('Full Capabilities Device', () => {
    const fullCapabilities: TVCapabilities = {
      powerControl: true,
      volumeControl: true,
      channelControl: true,
      voiceInput: true,
      keyboard: true,
      apps: true,
    };

    it('should support all navigation commands', () => {
      expect(isCommandSupported(RemoteCommandType.Up, fullCapabilities)).toBe(true);
      expect(isCommandSupported(RemoteCommandType.Down, fullCapabilities)).toBe(true);
      expect(isCommandSupported(RemoteCommandType.Left, fullCapabilities)).toBe(true);
      expect(isCommandSupported(RemoteCommandType.Right, fullCapabilities)).toBe(true);
      expect(isCommandSupported(RemoteCommandType.Select, fullCapabilities)).toBe(true);
      expect(isCommandSupported(RemoteCommandType.Back, fullCapabilities)).toBe(true);
      expect(isCommandSupported(RemoteCommandType.Home, fullCapabilities)).toBe(true);
    });

    it('should support power control', () => {
      expect(isCommandSupported(RemoteCommandType.Power, fullCapabilities)).toBe(true);
    });

    it('should support volume control', () => {
      expect(isCommandSupported(RemoteCommandType.VolumeUp, fullCapabilities)).toBe(true);
      expect(isCommandSupported(RemoteCommandType.VolumeDown, fullCapabilities)).toBe(true);
      expect(isCommandSupported(RemoteCommandType.Mute, fullCapabilities)).toBe(true);
    });

    it('should support channel control', () => {
      expect(isCommandSupported(RemoteCommandType.ChannelUp, fullCapabilities)).toBe(true);
      expect(isCommandSupported(RemoteCommandType.ChannelDown, fullCapabilities)).toBe(true);
    });

    it('should return all commands as supported', () => {
      const supported = getSupportedCommands(fullCapabilities);
      expect(supported.length).toBeGreaterThan(15);
      expect(supported).toContain(RemoteCommandType.Power);
      expect(supported).toContain(RemoteCommandType.VolumeUp);
      expect(supported).toContain(RemoteCommandType.ChannelUp);
    });
  });

  describe('Limited Capabilities Device (Streaming Box)', () => {
    const limitedCapabilities: TVCapabilities = {
      powerControl: false,
      volumeControl: false,  // No volume control (TV handles it)
      channelControl: false,
      voiceInput: false,
      keyboard: true,
      apps: true,
    };

    it('should support navigation commands', () => {
      expect(isCommandSupported(RemoteCommandType.Up, limitedCapabilities)).toBe(true);
      expect(isCommandSupported(RemoteCommandType.Select, limitedCapabilities)).toBe(true);
      expect(isCommandSupported(RemoteCommandType.Back, limitedCapabilities)).toBe(true);
    });

    it('should NOT support power control', () => {
      expect(isCommandSupported(RemoteCommandType.Power, limitedCapabilities)).toBe(false);
    });

    it('should NOT support volume control', () => {
      expect(isCommandSupported(RemoteCommandType.VolumeUp, limitedCapabilities)).toBe(false);
      expect(isCommandSupported(RemoteCommandType.VolumeDown, limitedCapabilities)).toBe(false);
      expect(isCommandSupported(RemoteCommandType.Mute, limitedCapabilities)).toBe(false);
    });

    it('should NOT support channel control', () => {
      expect(isCommandSupported(RemoteCommandType.ChannelUp, limitedCapabilities)).toBe(false);
      expect(isCommandSupported(RemoteCommandType.ChannelDown, limitedCapabilities)).toBe(false);
    });

    it('should filter out unsupported commands', () => {
      const supported = getSupportedCommands(limitedCapabilities);
      expect(supported).not.toContain(RemoteCommandType.Power);
      expect(supported).not.toContain(RemoteCommandType.VolumeUp);
      expect(supported).not.toContain(RemoteCommandType.ChannelUp);
    });
  });

  describe('Roku Device Capabilities', () => {
    const rokuCapabilities: TVCapabilities = {
      powerControl: true,
      volumeControl: true,
      channelControl: false,  // Roku doesn't have channel control
      voiceInput: false,
      keyboard: true,
      apps: true,
    };

    it('should support Roku standard commands', () => {
      const supported = getSupportedCommands(rokuCapabilities);
      
      // Navigation
      expect(supported).toContain(RemoteCommandType.Up);
      expect(supported).toContain(RemoteCommandType.Select);
      expect(supported).toContain(RemoteCommandType.Home);
      
      // Power and Volume
      expect(supported).toContain(RemoteCommandType.Power);
      expect(supported).toContain(RemoteCommandType.VolumeUp);
      expect(supported).toContain(RemoteCommandType.Mute);
      
      // No channel control
      expect(supported).not.toContain(RemoteCommandType.ChannelUp);
      expect(supported).not.toContain(RemoteCommandType.ChannelDown);
    });
  });

  describe('Android TV Device Capabilities', () => {
    const androidTvCapabilities: TVCapabilities = {
      powerControl: true,
      volumeControl: true,
      channelControl: true,  // Live channels support
      voiceInput: true,
      keyboard: true,
      apps: true,
    };

    it('should support full command set', () => {
      const supported = getSupportedCommands(androidTvCapabilities);
      
      expect(supported).toContain(RemoteCommandType.Power);
      expect(supported).toContain(RemoteCommandType.VolumeUp);
      expect(supported).toContain(RemoteCommandType.ChannelUp);
    });
  });

  describe('Button Visibility Rules', () => {
    const profile = createProfile();

    it('should identify buttons that require capabilities', () => {
      const powerButton = profile.buttons.find((b) => b.command === RemoteCommandType.Power);
      expect(powerButton?.requiresCapability).toBe('powerControl');

      const volumeButton = profile.buttons.find((b) => b.command === RemoteCommandType.VolumeUp);
      expect(volumeButton?.requiresCapability).toBe('volumeControl');
    });

    it('should identify buttons that are always visible', () => {
      const navButton = profile.buttons.find((b) => b.command === RemoteCommandType.Up);
      expect(navButton?.requiresCapability).toBe(null);
    });

    it('should calculate visible buttons for limited device', () => {
      const limitedCaps: TVCapabilities = {
        powerControl: false,
        volumeControl: false,
        channelControl: false,
        voiceInput: false,
        keyboard: true,
        apps: true,
      };

      const visibleButtons = profile.buttons.filter((btn) => {
        if (!btn.requiresCapability) return true;
        return limitedCaps[btn.requiresCapability] === true;
      });

      // Should only show navigation buttons
      expect(visibleButtons).toHaveLength(7); // Up, Down, Left, Right, Select, Back, Home
      expect(visibleButtons.map((b) => b.command)).not.toContain(RemoteCommandType.Power);
      expect(visibleButtons.map((b) => b.command)).not.toContain(RemoteCommandType.VolumeUp);
    });

    it('should show all buttons for full capability device', () => {
      const fullCaps: TVCapabilities = {
        powerControl: true,
        volumeControl: true,
        channelControl: true,
        voiceInput: true,
        keyboard: true,
        apps: true,
      };

      const visibleButtons = profile.buttons.filter((btn) => {
        if (!btn.requiresCapability) return true;
        return fullCaps[btn.requiresCapability] === true;
      });

      expect(visibleButtons).toHaveLength(profile.buttons.length);
    });
  });

  describe('Command Metadata', () => {
    it('should provide correct metadata for navigation commands', () => {
      const upMeta = getCommandMetadata(RemoteCommandType.Up);
      expect(upMeta?.displayName).toBe('上');
      expect(upMeta?.category).toBe('navigation');
      expect(upMeta?.repeatable).toBe(true);
    });

    it('should provide correct metadata for volume commands', () => {
      const volMeta = getCommandMetadata(RemoteCommandType.VolumeUp);
      expect(volMeta?.displayName).toBe('音量+');
      expect(volMeta?.category).toBe('volume');
      expect(volMeta?.requiresCapability).toBe('volumeControl');
    });

    it('should provide correct metadata for power command', () => {
      const powerMeta = getCommandMetadata(RemoteCommandType.Power);
      expect(powerMeta?.displayName).toBe('电源');
      expect(powerMeta?.category).toBe('system');
      expect(powerMeta?.repeatable).toBe(false);
      expect(powerMeta?.requiresCapability).toBe('powerControl');
    });
  });
});
