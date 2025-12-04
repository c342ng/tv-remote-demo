/**
 * DeviceListItem - Single device item in discovery list
 * Shows device info and connection status
 */
import React from 'react';
import { Pressable, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { TVDevice, TVPlatform } from '../domain/models';

export interface DeviceListItemProps {
  /** Device to display */
  device: TVDevice;
  /** Whether this device is currently connecting */
  isConnecting?: boolean;
  /** Whether this device is currently connected */
  isConnected?: boolean;
  /** Callback when device is pressed */
  onPress: (device: TVDevice) => void;
}

// Platform icon mapping
const PLATFORM_ICONS: Record<TVPlatform, keyof typeof MaterialIcons.glyphMap> = {
  [TVPlatform.Roku]: 'tv',
  [TVPlatform.AndroidTV]: 'android',
  [TVPlatform.FireTV]: 'whatshot',
  [TVPlatform.WebOS]: 'web',
  [TVPlatform.Tizen]: 'stars',
};

// Platform display names
const PLATFORM_NAMES: Record<TVPlatform, string> = {
  [TVPlatform.Roku]: 'Roku',
  [TVPlatform.AndroidTV]: 'Android TV',
  [TVPlatform.FireTV]: 'Fire TV',
  [TVPlatform.WebOS]: 'LG webOS',
  [TVPlatform.Tizen]: 'Samsung Tizen',
};

/**
 * DeviceListItem component
 */
export const DeviceListItem: React.FC<DeviceListItemProps> = ({
  device,
  isConnecting = false,
  isConnected = false,
  onPress,
}) => {
  const platformIcon = PLATFORM_ICONS[device.platform];
  const platformName = PLATFORM_NAMES[device.platform];

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
        isConnected && styles.connected,
      ]}
      onPress={() => onPress(device)}
      disabled={isConnecting}
    >
      {/* Platform icon */}
      <View style={[styles.iconContainer, isConnected && styles.iconContainerConnected]}>
        <MaterialIcons 
          name={platformIcon} 
          size={24} 
          color={isConnected ? '#fff' : '#aaa'} 
        />
      </View>

      {/* Device info */}
      <View style={styles.infoContainer}>
        <Text style={[styles.deviceName, isConnected && styles.textConnected]} numberOfLines={1}>
          {device.name}
        </Text>
        <Text style={[styles.deviceDetails, isConnected && styles.textConnectedDim]} numberOfLines={1}>
          {platformName} • {device.ipAddress}
        </Text>
        {device.modelName && (
          <Text style={[styles.modelName, isConnected && styles.textConnectedDim]} numberOfLines={1}>
            {device.modelName}
          </Text>
        )}
      </View>

      {/* Status indicator */}
      <View style={styles.statusContainer}>
        {isConnecting ? (
          <ActivityIndicator size="small" color="#FFC107" />
        ) : isConnected ? (
          <View style={styles.connectedBadge}>
            <Text style={styles.connectedText}>已连接</Text>
          </View>
        ) : (
          <MaterialIcons name="chevron-right" size={24} color="#666" />
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
    borderRadius: 16,
    padding: 20,
    marginVertical: 8,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#333',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  pressed: {
    backgroundColor: '#2a2a2a',
    transform: [{ scale: 0.98 }],
  },
  connected: {
    borderColor: '#4CAF50',
    backgroundColor: '#1a2a1a',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconContainerConnected: {
    backgroundColor: '#4CAF50',
  },
  infoContainer: {
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
  modelName: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  textConnected: {
    color: '#fff',
  },
  textConnectedDim: {
    color: 'rgba(255,255,255,0.7)',
  },
  statusContainer: {
    marginLeft: 12,
    alignItems: 'flex-end',
  },
  connectedBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  connectedText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  connectHint: {
    color: '#666',
    fontSize: 11,
  },
});

export default DeviceListItem;
