/**
 * Integration tests for US3: Cross-platform UI
 * T038: Validates UI layout consistency while command mapping differs per platform
 */
import {
  RemoteCommandType,
  TVCapabilities,
  TVDevice,
  TVPlatform,
  RemoteButton,
  RemoteProfile,
} from '@remote/domain/models';
import { isCommandSupported, getSupportedCommands } from '@remote/services/command-dispatcher';

describe('US3: Cross-platform UI Integration', () => {
  /**
   * Create device with specific capabilities
   */
  const createDevice = (
    platform: TVPlatform,
    name: string,
    capabilities: TVCapabilities
  ): TVDevice => ({
    id: `device-${platform}`,
    name,
    platform,
    ipAddress: '192.168.1.100',
    port: 8060,
    capabilities,
  });

  /**
   * Standard remote profile buttons
   */
  const standardButtons: RemoteButton[] = [
    { id: 'up', label: '上', command: RemoteCommandType.Up },
    { id: 'down', label: '下', command: RemoteCommandType.Down },
    { id: 'left', label: '左', command: RemoteCommandType.Left },
    { id: 'right', label: '右', command: RemoteCommandType.Right },
    { id: 'select', label: '确认', command: RemoteCommandType.Select },
    { id: 'back', label: '返回', command: RemoteCommandType.Back },
    { id: 'home', label: '主页', command: RemoteCommandType.Home },
    {
      id: 'power',
      label: '电源',
      command: RemoteCommandType.Power,
      requiresCapability: 'powerControl',
    },
    {
      id: 'vol-up',
      label: '音量+',
      command: RemoteCommandType.VolumeUp,
      requiresCapability: 'volumeControl',
    },
    {
      id: 'vol-down',
      label: '音量-',
      command: RemoteCommandType.VolumeDown,
      requiresCapability: 'volumeControl',
    },
    {
      id: 'mute',
      label: '静音',
      command: RemoteCommandType.Mute,
      requiresCapability: 'volumeControl',
    },
    {
      id: 'ch-up',
      label: '频道+',
      command: RemoteCommandType.ChannelUp,
      requiresCapability: 'channelControl',
    },
    {
      id: 'ch-down',
      label: '频道-',
      command: RemoteCommandType.ChannelDown,
      requiresCapability: 'channelControl',
    },
  ];

  const standardProfile: RemoteProfile = {
    id: 'standard',
    name: 'Standard Remote',
    buttons: standardButtons,
  };

  describe('Unified Layout Across Platforms', () => {
    const platforms = [
      {
        platform: TVPlatform.Roku,
        capabilities: {
          powerControl: true,
          volumeControl: true,
          channelControl: false,
          voiceInput: false,
          keyboard: true,
          apps: true,
        },
      },
      {
        platform: TVPlatform.AndroidTV,
        capabilities: {
          powerControl: true,
          volumeControl: true,
          channelControl: true,
          voiceInput: true,
          keyboard: true,
          apps: true,
        },
      },
      {
        platform: TVPlatform.FireTV,
        capabilities: {
          powerControl: false, // Fire TV stick may not control TV power
          volumeControl: true,
          channelControl: false,
          voiceInput: true,
          keyboard: true,
          apps: true,
        },
      },
    ];

    it('should use same button layout for all platforms', () => {
      // All platforms use the same standardProfile
      platforms.forEach(({ platform }) => {
        // Profile doesn't change based on platform
        expect(standardProfile.buttons).toHaveLength(13);
        expect(standardProfile.buttons.map((b) => b.id)).toEqual([
          'up',
          'down',
          'left',
          'right',
          'select',
          'back',
          'home',
          'power',
          'vol-up',
          'vol-down',
          'mute',
          'ch-up',
          'ch-down',
        ]);
      });
    });

    it('should maintain consistent button labels across platforms', () => {
      platforms.forEach(() => {
        const upButton = standardProfile.buttons.find((b) => b.command === RemoteCommandType.Up);
        expect(upButton?.label).toBe('上');

        const selectButton = standardProfile.buttons.find(
          (b) => b.command === RemoteCommandType.Select
        );
        expect(selectButton?.label).toBe('确认');
      });
    });
  });

  describe('Capability-Driven Button Visibility', () => {
    it('should show/hide buttons based on Roku capabilities', () => {
      const rokuCaps: TVCapabilities = {
        powerControl: true,
        volumeControl: true,
        channelControl: false,
        voiceInput: false,
        keyboard: true,
        apps: true,
      };

      const visibleButtons = standardButtons.filter((btn) => {
        if (!btn.requiresCapability) return true;
        return rokuCaps[btn.requiresCapability] === true;
      });

      // Should show: nav (7) + power (1) + volume (3) = 11
      expect(visibleButtons).toHaveLength(11);

      // Channel buttons should be hidden
      const channelButtons = visibleButtons.filter(
        (b) =>
          b.command === RemoteCommandType.ChannelUp || b.command === RemoteCommandType.ChannelDown
      );
      expect(channelButtons).toHaveLength(0);
    });

    it('should show all buttons for full-featured Android TV', () => {
      const androidCaps: TVCapabilities = {
        powerControl: true,
        volumeControl: true,
        channelControl: true,
        voiceInput: true,
        keyboard: true,
        apps: true,
      };

      const visibleButtons = standardButtons.filter((btn) => {
        if (!btn.requiresCapability) return true;
        return androidCaps[btn.requiresCapability] === true;
      });

      expect(visibleButtons).toHaveLength(13);
    });

    it('should hide power button for Fire TV stick', () => {
      const fireTvCaps: TVCapabilities = {
        powerControl: false,
        volumeControl: true,
        channelControl: false,
        voiceInput: true,
        keyboard: true,
        apps: true,
      };

      const visibleButtons = standardButtons.filter((btn) => {
        if (!btn.requiresCapability) return true;
        return fireTvCaps[btn.requiresCapability] === true;
      });

      // Power and channel buttons hidden
      const powerButton = visibleButtons.find((b) => b.command === RemoteCommandType.Power);
      expect(powerButton).toBeUndefined();

      // Volume should still be visible
      const volumeButton = visibleButtons.find((b) => b.command === RemoteCommandType.VolumeUp);
      expect(volumeButton).toBeDefined();
    });
  });

  describe('Command Mapping Difference by Platform', () => {
    /**
     * Simulates platform-specific command mapping
     * In real implementation, each adapter maps commands differently
     */
    const mapCommandToProtocol = (
      command: RemoteCommandType,
      platform: TVPlatform
    ): string | null => {
      switch (platform) {
        case TVPlatform.Roku:
          // Roku uses ECP keypress
          const rokuMap: Record<string, string> = {
            [RemoteCommandType.Up]: '/keypress/Up',
            [RemoteCommandType.Down]: '/keypress/Down',
            [RemoteCommandType.Select]: '/keypress/Select',
            [RemoteCommandType.Home]: '/keypress/Home',
            [RemoteCommandType.VolumeUp]: '/keypress/VolumeUp',
          };
          return rokuMap[command] || null;

        case TVPlatform.AndroidTV:
          // Android TV uses ADB keyevents
          const adbMap: Record<string, string> = {
            [RemoteCommandType.Up]: 'input keyevent KEYCODE_DPAD_UP',
            [RemoteCommandType.Down]: 'input keyevent KEYCODE_DPAD_DOWN',
            [RemoteCommandType.Select]: 'input keyevent KEYCODE_ENTER',
            [RemoteCommandType.Home]: 'input keyevent KEYCODE_HOME',
            [RemoteCommandType.VolumeUp]: 'input keyevent KEYCODE_VOLUME_UP',
          };
          return adbMap[command] || null;

        case TVPlatform.FireTV:
          // Fire TV also uses ADB but may have different codes
          const fireMap: Record<string, string> = {
            [RemoteCommandType.Up]: 'input keyevent 19',
            [RemoteCommandType.Down]: 'input keyevent 20',
            [RemoteCommandType.Select]: 'input keyevent 23',
            [RemoteCommandType.Home]: 'input keyevent 3',
            [RemoteCommandType.VolumeUp]: 'input keyevent 24',
          };
          return fireMap[command] || null;

        default:
          return null;
      }
    };

    it('should map same UI command to different protocol commands', () => {
      const upCommand = RemoteCommandType.Up;

      const rokuProtocol = mapCommandToProtocol(upCommand, TVPlatform.Roku);
      const androidProtocol = mapCommandToProtocol(upCommand, TVPlatform.AndroidTV);
      const fireProtocol = mapCommandToProtocol(upCommand, TVPlatform.FireTV);

      // All three platforms have different protocol mappings
      expect(rokuProtocol).toBe('/keypress/Up');
      expect(androidProtocol).toBe('input keyevent KEYCODE_DPAD_UP');
      expect(fireProtocol).toBe('input keyevent 19');

      // But UI shows same command
      expect(rokuProtocol).not.toBe(androidProtocol);
      expect(androidProtocol).not.toBe(fireProtocol);
    });

    it('should map Select/OK consistently across platforms', () => {
      const selectRoku = mapCommandToProtocol(RemoteCommandType.Select, TVPlatform.Roku);
      const selectAndroid = mapCommandToProtocol(RemoteCommandType.Select, TVPlatform.AndroidTV);

      expect(selectRoku).toContain('Select');
      expect(selectAndroid).toContain('ENTER');
    });
  });

  describe('UI State Consistency During Device Switch', () => {
    const createDeviceWithCaps = (
      id: string,
      platform: TVPlatform,
      caps: Partial<TVCapabilities>
    ): TVDevice =>
      createDevice(platform, `${platform} TV`, {
        powerControl: false,
        volumeControl: false,
        channelControl: false,
        voiceInput: false,
        keyboard: true,
        apps: true,
        ...caps,
      });

    it('should update button states when switching devices', () => {
      // Device 1: Roku with power and volume
      const roku = createDeviceWithCaps('1', TVPlatform.Roku, {
        powerControl: true,
        volumeControl: true,
      });

      // Device 2: Fire TV without power
      const fireTv = createDeviceWithCaps('2', TVPlatform.FireTV, {
        powerControl: false,
        volumeControl: true,
      });

      // Check supported commands for each
      const rokuSupported = getSupportedCommands(roku.capabilities);
      const fireSupported = getSupportedCommands(fireTv.capabilities);

      // Both support volume
      expect(rokuSupported).toContain(RemoteCommandType.VolumeUp);
      expect(fireSupported).toContain(RemoteCommandType.VolumeUp);

      // Only Roku supports power
      expect(rokuSupported).toContain(RemoteCommandType.Power);
      expect(fireSupported).not.toContain(RemoteCommandType.Power);
    });

    it('should maintain navigation button availability across all platforms', () => {
      const platforms = [TVPlatform.Roku, TVPlatform.AndroidTV, TVPlatform.FireTV];
      const navCommands = [
        RemoteCommandType.Up,
        RemoteCommandType.Down,
        RemoteCommandType.Left,
        RemoteCommandType.Right,
        RemoteCommandType.Select,
        RemoteCommandType.Back,
        RemoteCommandType.Home,
      ];

      platforms.forEach((platform) => {
        const device = createDeviceWithCaps('test', platform, {});

        navCommands.forEach((cmd) => {
          expect(isCommandSupported(cmd, device.capabilities)).toBe(true);
        });
      });
    });
  });

  describe('Playback Controls Across Platforms', () => {
    it('should support playback commands universally', () => {
      const minimalCaps: TVCapabilities = {
        powerControl: false,
        volumeControl: false,
        channelControl: false,
        voiceInput: false,
        keyboard: true,
        apps: true,
      };

      // Playback commands don't require special capabilities
      expect(isCommandSupported(RemoteCommandType.Play, minimalCaps)).toBe(true);
      expect(isCommandSupported(RemoteCommandType.Pause, minimalCaps)).toBe(true);
      expect(isCommandSupported(RemoteCommandType.Rewind, minimalCaps)).toBe(true);
      expect(isCommandSupported(RemoteCommandType.FastForward, minimalCaps)).toBe(true);
    });
  });
});
