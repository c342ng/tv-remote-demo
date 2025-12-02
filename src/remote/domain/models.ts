/**
 * Core domain models for TV Remote MVP
 */

/** Supported TV platforms */
export enum TVPlatform {
  AndroidTV = 'android_tv',
  FireTV = 'fire_tv',
  WebOS = 'lg_webos',
  Tizen = 'samsung_tizen',
  Roku = 'roku',
}

/** Connection status */
export enum ConnectionStatus {
  Idle = 'idle',
  Discovering = 'discovering',
  Connecting = 'connecting',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
  Disconnected = 'disconnected',
  Unavailable = 'unavailable',
}

/** Standard remote command types */
export enum RemoteCommandType {
  Up = 'UP',
  Down = 'DOWN',
  Left = 'LEFT',
  Right = 'RIGHT',
  Select = 'OK',
  Back = 'BACK',
  Home = 'HOME',
  VolumeUp = 'VOLUME_UP',
  VolumeDown = 'VOLUME_DOWN',
  Mute = 'MUTE',
  Power = 'POWER',
  Play = 'PLAY',
  Pause = 'PAUSE',
  Rewind = 'REV',
  FastForward = 'FWD',
  // Number keys
  Num0 = 'NUM_0',
  Num1 = 'NUM_1',
  Num2 = 'NUM_2',
  Num3 = 'NUM_3',
  Num4 = 'NUM_4',
  Num5 = 'NUM_5',
  Num6 = 'NUM_6',
  Num7 = 'NUM_7',
  Num8 = 'NUM_8',
  Num9 = 'NUM_9',
  // Additional controls
  Menu = 'MENU',
  Info = 'INFO',
  Settings = 'SETTINGS',
  ChannelUp = 'CHANNEL_UP',
  ChannelDown = 'CHANNEL_DOWN',
}

/** Error codes for session and command operations */
export enum SessionErrorCode {
  NetworkUnreachable = 'NETWORK_UNREACHABLE',
  AuthFailed = 'AUTH_FAILED',
  CommandUnsupported = 'COMMAND_UNSUPPORTED',
  Timeout = 'TIMEOUT',
  Unknown = 'UNKNOWN',
}

/** Capabilities supported by a TV device */
export interface TVCapabilities {
  powerControl: boolean;
  volumeControl: boolean;
  channelControl: boolean;
  voiceInput: boolean;
  keyboard: boolean;
  apps: boolean;
  /** Raw platform-specific capability data for debugging */
  raw?: Record<string, unknown>;
}

/** Represents a TV device that can be controlled */
export interface TVDevice {
  id: string;
  name: string;
  platform: TVPlatform;
  ipAddress: string;
  port: number;
  modelName?: string;
  capabilities: TVCapabilities;
  labels?: string[];
  lastSeenAt?: string;
  lastConnectedAt?: string;
  isFavorite?: boolean;
}

/** Session error with code and message */
export interface SessionError {
  code: SessionErrorCode;
  message: string;
  at: string;
}

/** Connection session state */
export interface ConnectionSession {
  id: string;
  deviceId: string;
  status: ConnectionStatus;
  startedAt: string;
  endedAt: string | null;
  lastHeartbeatAt: string | null;
  lastError: SessionError | null;
}

/** A button definition in the remote profile */
export interface RemoteButton {
  id: string;
  label: string;
  command: RemoteCommandType;
  order?: number;
  iconName?: string;
  /** Capability key required; null means always visible */
  requiresCapability?: keyof TVCapabilities | null;
}

/** Remote control layout profile */
export interface RemoteProfile {
  id: string;
  name: string;
  displayName?: string;
  buttons: RemoteButton[];
}

/** Application-level device manager state */
export interface DeviceManagerState {
  devices: TVDevice[];
  activeDeviceId: string | null;
  remoteProfileId: string;
}

/** Log event for observability */
export interface LogEvent {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  type: 'connection' | 'command' | 'discovery' | 'system';
  deviceId: string | null;
  sessionId: string | null;
  payload: Record<string, unknown>;
}
