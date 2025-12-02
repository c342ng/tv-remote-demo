/**
 * ConnectionStatusBar - Shows current device connection status
 * Displays device info, connection state, and provides quick actions
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { ConnectionStatus, TVDevice } from '../domain/models';

export interface ConnectionStatusBarProps {
  /** Currently connected device (if any) */
  device: TVDevice | null;
  /** Current connection status */
  status: ConnectionStatus;
  /** Callback when status bar is pressed */
  onPress?: () => void;
  /** Callback for disconnect action */
  onDisconnect?: () => void;
}

// Status color mapping
const STATUS_COLORS: Record<ConnectionStatus, string> = {
  [ConnectionStatus.Connected]: '#4CAF50',
  [ConnectionStatus.Connecting]: '#FFC107',
  [ConnectionStatus.Disconnected]: '#9E9E9E',
  [ConnectionStatus.Unavailable]: '#F44336',
  [ConnectionStatus.Reconnecting]: '#FF9800',
  [ConnectionStatus.Idle]: '#9E9E9E',
  [ConnectionStatus.Discovering]: '#2196F3',
};

// Status label mapping
const STATUS_LABELS: Record<ConnectionStatus, string> = {
  [ConnectionStatus.Connected]: '已连接',
  [ConnectionStatus.Connecting]: '连接中...',
  [ConnectionStatus.Disconnected]: '未连接',
  [ConnectionStatus.Unavailable]: '连接错误',
  [ConnectionStatus.Reconnecting]: '重新连接中...',
  [ConnectionStatus.Idle]: '空闲',
  [ConnectionStatus.Discovering]: '搜索中...',
};

/**
 * ConnectionStatusBar component
 */
export const ConnectionStatusBar: React.FC<ConnectionStatusBarProps> = ({
  device,
  status,
  onPress,
  onDisconnect,
}) => {
  const statusColor = STATUS_COLORS[status];
  const statusLabel = STATUS_LABELS[status];
  const isConnecting = status === ConnectionStatus.Connecting || 
                       status === ConnectionStatus.Reconnecting;

  return (
    <Pressable
      style={styles.container}
      onPress={onPress}
      disabled={!onPress}
    >
      {/* Status indicator */}
      <View style={styles.statusSection}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        {isConnecting && (
          <ActivityIndicator
            size="small"
            color={statusColor}
            style={styles.spinner}
          />
        )}
      </View>

      {/* Device info */}
      <View style={styles.infoSection}>
        {device ? (
          <>
            <Text style={styles.deviceName} numberOfLines={1}>
              {device.name}
            </Text>
            <Text style={styles.deviceDetails} numberOfLines={1}>
              {device.platform} • {device.ipAddress}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.deviceName}>未连接设备</Text>
            <Text style={styles.deviceDetails}>点击选择电视</Text>
          </>
        )}
      </View>

      {/* Status label */}
      <View style={styles.statusLabelSection}>
        <Text style={[styles.statusLabel, { color: statusColor }]}>
          {statusLabel}
        </Text>
        
        {/* Disconnect button (only when connected) */}
        {status === ConnectionStatus.Connected && onDisconnect && (
          <Pressable
            style={styles.disconnectButton}
            onPress={onDisconnect}
            hitSlop={8}
          >
            <Text style={styles.disconnectText}>断开</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  statusSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  spinner: {
    marginLeft: 8,
  },
  infoSection: {
    flex: 1,
  },
  deviceName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  deviceDetails: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  statusLabelSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  disconnectButton: {
    marginLeft: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#333',
    borderRadius: 4,
  },
  disconnectText: {
    color: '#F44336',
    fontSize: 12,
    fontWeight: '500',
  },
});

export default ConnectionStatusBar;
