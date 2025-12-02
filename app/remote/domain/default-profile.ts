/**
 * Default remote profile configuration
 * Defines the standard button layout for TV remote control
 */
import { RemoteButton, RemoteCommandType, RemoteProfile } from './models';

// Navigation buttons
const navButtons: RemoteButton[] = [
  { id: 'up', label: '▲', command: RemoteCommandType.Up, order: 1 },
  { id: 'down', label: '▼', command: RemoteCommandType.Down, order: 3 },
  { id: 'left', label: '◀', command: RemoteCommandType.Left, order: 2 },
  { id: 'right', label: '▶', command: RemoteCommandType.Right, order: 4 },
  { id: 'select', label: 'OK', command: RemoteCommandType.Select, order: 0 },
];

// Playback control buttons
const playbackButtons: RemoteButton[] = [
  { id: 'play', label: '▶', command: RemoteCommandType.Play, order: 0 },
  { id: 'pause', label: '⏸', command: RemoteCommandType.Pause, order: 1 },
  { id: 'rewind', label: '⏪', command: RemoteCommandType.Rewind, order: 2 },
  { id: 'forward', label: '⏩', command: RemoteCommandType.FastForward, order: 3 },
];

// System control buttons
const systemButtons: RemoteButton[] = [
  { id: 'power', label: '⏻', command: RemoteCommandType.Power, order: 0 },
  { id: 'home', label: '⌂', command: RemoteCommandType.Home, order: 1 },
  { id: 'back', label: '←', command: RemoteCommandType.Back, order: 2 },
  { id: 'mute', label: '🔇', command: RemoteCommandType.Mute, order: 3 },
];

// Volume control buttons
const volumeButtons: RemoteButton[] = [
  { id: 'volume-up', label: '🔊+', command: RemoteCommandType.VolumeUp, order: 0 },
  { id: 'volume-down', label: '🔉−', command: RemoteCommandType.VolumeDown, order: 1 },
];

// Channel control buttons
const channelButtons: RemoteButton[] = [
  { id: 'channel-up', label: 'CH+', command: RemoteCommandType.ChannelUp, order: 0 },
  { id: 'channel-down', label: 'CH−', command: RemoteCommandType.ChannelDown, order: 1 },
];

// Menu and info buttons
const menuButtons: RemoteButton[] = [
  { id: 'menu', label: '☰', command: RemoteCommandType.Menu, order: 0 },
  { id: 'info', label: 'ⓘ', command: RemoteCommandType.Info, order: 1 },
  { id: 'settings', label: '⚙', command: RemoteCommandType.Settings, order: 2 },
];

// Number pad buttons
const numberButtons: RemoteButton[] = [
  { id: 'num-1', label: '1', command: RemoteCommandType.Num1, order: 0 },
  { id: 'num-2', label: '2', command: RemoteCommandType.Num2, order: 1 },
  { id: 'num-3', label: '3', command: RemoteCommandType.Num3, order: 2 },
  { id: 'num-4', label: '4', command: RemoteCommandType.Num4, order: 3 },
  { id: 'num-5', label: '5', command: RemoteCommandType.Num5, order: 4 },
  { id: 'num-6', label: '6', command: RemoteCommandType.Num6, order: 5 },
  { id: 'num-7', label: '7', command: RemoteCommandType.Num7, order: 6 },
  { id: 'num-8', label: '8', command: RemoteCommandType.Num8, order: 7 },
  { id: 'num-9', label: '9', command: RemoteCommandType.Num9, order: 8 },
  { id: 'num-0', label: '0', command: RemoteCommandType.Num0, order: 9 },
];

/**
 * Default remote profile with standard TV remote layout
 * Organized into logical button groups for UI rendering
 */
export const defaultRemoteProfile: RemoteProfile = {
  id: 'default',
  name: 'Standard Remote',
  buttons: [
    ...systemButtons,
    ...navButtons,
    ...playbackButtons,
    ...volumeButtons,
    ...channelButtons,
    ...menuButtons,
    ...numberButtons,
  ],
};

/**
 * Button groups for UI layout organization
 */
export const buttonGroups = {
  navigation: navButtons,
  playback: playbackButtons,
  system: systemButtons,
  volume: volumeButtons,
  channel: channelButtons,
  menu: menuButtons,
  numbers: numberButtons,
};

export default defaultRemoteProfile;
