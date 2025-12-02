/**
 * Command Dispatcher
 * Maps normalized commands to PlatformAdapter and handles errors
 */
import { RemoteCommandType, TVDevice, TVCapabilities, SessionErrorCode } from '../domain/models';
import { CommandResult, TVSession } from '../domain/remote-interfaces';
import { logger } from './logger';

/**
 * Command metadata for UI display
 */
interface CommandMetadata {
  /** Display name */
  displayName: string;
  /** Required capability key (null = always available) */
  requiresCapability: keyof TVCapabilities | null;
  /** Whether command can be repeated (long press) */
  repeatable: boolean;
  /** Category for grouping */
  category: 'navigation' | 'playback' | 'volume' | 'system' | 'input';
}

/**
 * Command metadata mapping
 */
const COMMAND_METADATA: Record<RemoteCommandType, CommandMetadata> = {
  [RemoteCommandType.Up]: {
    displayName: '上',
    requiresCapability: null,
    repeatable: true,
    category: 'navigation',
  },
  [RemoteCommandType.Down]: {
    displayName: '下',
    requiresCapability: null,
    repeatable: true,
    category: 'navigation',
  },
  [RemoteCommandType.Left]: {
    displayName: '左',
    requiresCapability: null,
    repeatable: true,
    category: 'navigation',
  },
  [RemoteCommandType.Right]: {
    displayName: '右',
    requiresCapability: null,
    repeatable: true,
    category: 'navigation',
  },
  [RemoteCommandType.Select]: {
    displayName: '确认',
    requiresCapability: null,
    repeatable: false,
    category: 'navigation',
  },
  [RemoteCommandType.Back]: {
    displayName: '返回',
    requiresCapability: null,
    repeatable: false,
    category: 'navigation',
  },
  [RemoteCommandType.Home]: {
    displayName: '主页',
    requiresCapability: null,
    repeatable: false,
    category: 'system',
  },
  [RemoteCommandType.Menu]: {
    displayName: '菜单',
    requiresCapability: null,
    repeatable: false,
    category: 'system',
  },
  [RemoteCommandType.Info]: {
    displayName: '信息',
    requiresCapability: null,
    repeatable: false,
    category: 'system',
  },
  [RemoteCommandType.Settings]: {
    displayName: '设置',
    requiresCapability: null,
    repeatable: false,
    category: 'system',
  },
  [RemoteCommandType.Power]: {
    displayName: '电源',
    requiresCapability: 'powerControl',
    repeatable: false,
    category: 'system',
  },
  [RemoteCommandType.VolumeUp]: {
    displayName: '音量+',
    requiresCapability: 'volumeControl',
    repeatable: true,
    category: 'volume',
  },
  [RemoteCommandType.VolumeDown]: {
    displayName: '音量-',
    requiresCapability: 'volumeControl',
    repeatable: true,
    category: 'volume',
  },
  [RemoteCommandType.Mute]: {
    displayName: '静音',
    requiresCapability: 'volumeControl',
    repeatable: false,
    category: 'volume',
  },
  [RemoteCommandType.ChannelUp]: {
    displayName: '频道+',
    requiresCapability: 'channelControl',
    repeatable: true,
    category: 'input',
  },
  [RemoteCommandType.ChannelDown]: {
    displayName: '频道-',
    requiresCapability: 'channelControl',
    repeatable: true,
    category: 'input',
  },
  [RemoteCommandType.Play]: {
    displayName: '播放',
    requiresCapability: null,
    repeatable: false,
    category: 'playback',
  },
  [RemoteCommandType.Pause]: {
    displayName: '暂停',
    requiresCapability: null,
    repeatable: false,
    category: 'playback',
  },
  [RemoteCommandType.Rewind]: {
    displayName: '快退',
    requiresCapability: null,
    repeatable: true,
    category: 'playback',
  },
  [RemoteCommandType.FastForward]: {
    displayName: '快进',
    requiresCapability: null,
    repeatable: true,
    category: 'playback',
  },
  [RemoteCommandType.Num0]: {
    displayName: '0',
    requiresCapability: null,
    repeatable: false,
    category: 'input',
  },
  [RemoteCommandType.Num1]: {
    displayName: '1',
    requiresCapability: null,
    repeatable: false,
    category: 'input',
  },
  [RemoteCommandType.Num2]: {
    displayName: '2',
    requiresCapability: null,
    repeatable: false,
    category: 'input',
  },
  [RemoteCommandType.Num3]: {
    displayName: '3',
    requiresCapability: null,
    repeatable: false,
    category: 'input',
  },
  [RemoteCommandType.Num4]: {
    displayName: '4',
    requiresCapability: null,
    repeatable: false,
    category: 'input',
  },
  [RemoteCommandType.Num5]: {
    displayName: '5',
    requiresCapability: null,
    repeatable: false,
    category: 'input',
  },
  [RemoteCommandType.Num6]: {
    displayName: '6',
    requiresCapability: null,
    repeatable: false,
    category: 'input',
  },
  [RemoteCommandType.Num7]: {
    displayName: '7',
    requiresCapability: null,
    repeatable: false,
    category: 'input',
  },
  [RemoteCommandType.Num8]: {
    displayName: '8',
    requiresCapability: null,
    repeatable: false,
    category: 'input',
  },
  [RemoteCommandType.Num9]: {
    displayName: '9',
    requiresCapability: null,
    repeatable: false,
    category: 'input',
  },
};

/**
 * Check if a command is supported by device capabilities
 */
export function isCommandSupported(
  command: RemoteCommandType,
  capabilities: TVCapabilities
): boolean {
  const metadata = COMMAND_METADATA[command];
  if (!metadata) return false;
  if (!metadata.requiresCapability) return true;
  return capabilities[metadata.requiresCapability] === true;
}

/**
 * Get command metadata
 */
export function getCommandMetadata(command: RemoteCommandType): CommandMetadata | null {
  return COMMAND_METADATA[command] || null;
}

/**
 * Get all commands for a category
 */
export function getCommandsByCategory(category: CommandMetadata['category']): RemoteCommandType[] {
  return Object.entries(COMMAND_METADATA)
    .filter(([_, meta]) => meta.category === category)
    .map(([cmd, _]) => cmd as RemoteCommandType);
}

/**
 * Get supported commands for a device
 */
export function getSupportedCommands(capabilities: TVCapabilities): RemoteCommandType[] {
  return Object.keys(COMMAND_METADATA).filter((cmd) =>
    isCommandSupported(cmd as RemoteCommandType, capabilities)
  ) as RemoteCommandType[];
}

/**
 * Command Dispatcher class
 */
export class CommandDispatcher {
  private session: TVSession | null = null;
  private device: TVDevice | null = null;

  /**
   * Set current session
   */
  setSession(session: TVSession | null, device: TVDevice | null): void {
    this.session = session;
    this.device = device;
  }

  /**
   * Check if dispatcher is ready
   */
  isReady(): boolean {
    return this.session !== null && this.device !== null;
  }

  /**
   * Check if a command is available
   */
  isCommandAvailable(command: RemoteCommandType): boolean {
    if (!this.device) return false;
    return isCommandSupported(command, this.device.capabilities);
  }

  /**
   * Dispatch a command to the current session
   */
  async dispatch(command: RemoteCommandType): Promise<CommandResult> {
    // Check if session is available
    if (!this.session || !this.device) {
      logger.command('warn', 'Cannot dispatch command: no active session', null, null, {
        command,
      });
      return {
        success: false,
        error: {
          code: SessionErrorCode.NetworkUnreachable,
          message: '未连接到设备',
          at: new Date().toISOString(),
        },
      };
    }

    // Check if command is supported
    if (!this.isCommandAvailable(command)) {
      const metadata = getCommandMetadata(command);
      logger.command(
        'warn',
        'Command not supported by device',
        this.device.id,
        this.session.sessionId,
        {
          command,
          commandName: metadata?.displayName,
        }
      );
      return {
        success: false,
        error: {
          code: SessionErrorCode.CommandUnsupported,
          message: `${metadata?.displayName || command} 不受此设备支持`,
          at: new Date().toISOString(),
        },
      };
    }

    // Dispatch command
    const startTime = Date.now();
    try {
      const result = await this.session.sendCommand(command);
      const elapsed = Date.now() - startTime;

      if (result.success) {
        logger.command(
          'info',
          'Command sent successfully',
          this.device.id,
          this.session.sessionId,
          {
            command,
            elapsed,
          }
        );
      } else {
        logger.command('warn', 'Command failed', this.device.id, this.session.sessionId, {
          command,
          elapsed,
          error: result.error,
        });
      }

      return result;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      logger.command('error', 'Command dispatch error', this.device.id, this.session.sessionId, {
        command,
        elapsed,
        error: String(error),
      });

      return {
        success: false,
        error: {
          code: SessionErrorCode.Unknown,
          message: String(error),
          at: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Dispatch multiple commands in sequence
   */
  async dispatchSequence(commands: RemoteCommandType[], delayMs = 100): Promise<CommandResult[]> {
    const results: CommandResult[] = [];

    for (const command of commands) {
      const result = await this.dispatch(command);
      results.push(result);

      if (!result.success) {
        // Stop on first failure
        break;
      }

      if (delayMs > 0 && commands.indexOf(command) < commands.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }
}

// Export singleton instance
export const commandDispatcher = new CommandDispatcher();
