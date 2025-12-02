/**
 * DeviceManagementScreen - Device management interface
 * Displays device list with add, rename, delete, and switch capabilities
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { DeviceManagementItem } from '../components/DeviceManagementItem';
import { deviceStore, SavedDevice } from '../services/device-store';
import { sessionManager } from '../services/session-manager';
import { TVDevice } from '../domain/models';

/** Debug logger */
const DEBUG_TAG = '[DeviceManagement]';
const debug = {
  log: (...args: unknown[]) => console.log(DEBUG_TAG, ...args),
  warn: (...args: unknown[]) => console.warn(DEBUG_TAG, ...args),
  error: (...args: unknown[]) => console.error(DEBUG_TAG, ...args),
};

/**
 * DeviceManagementScreen component
 */
export const DeviceManagementScreen: React.FC = () => {
  const [devices, setDevices] = useState<SavedDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);

  // Load devices on mount
  useEffect(() => {
    loadDevices();
  }, []);

  // Load devices from store
  const loadDevices = useCallback(async () => {
    try {
      setIsLoading(true);
      await deviceStore.load();
      const allDevices = await deviceStore.getAllDevices();
      const activeId = await deviceStore.getActiveDeviceId();
      
      // Sort: favorites first, then by last connected
      const sorted = [...allDevices].sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return new Date(b.lastConnected).getTime() - new Date(a.lastConnected).getTime();
      });
      
      setDevices(sorted);
      setActiveDeviceId(activeId);
      debug.log(`Loaded ${sorted.length} devices, active: ${activeId}`);
    } catch (error) {
      debug.error('Failed to load devices:', error);
      Alert.alert('加载失败', '无法加载设备列表');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle device selection - switch to device
  const handleSelectDevice = useCallback(async (device: SavedDevice) => {
    if (device.id === activeDeviceId && sessionManager.isConnectedTo(device.id)) {
      // Already connected to this device, go to remote control
      debug.log('Already connected to device, navigating to control');
      router.push('/remote/control');
      return;
    }

    try {
      setIsSwitching(true);
      debug.log(`Switching to device: ${device.name}`);

      // Convert SavedDevice to TVDevice
      const tvDevice: TVDevice = {
        id: device.id,
        name: device.customName || device.name,
        platform: device.platform,
        ipAddress: device.ipAddress,
        port: device.port,
        metadata: device.metadata,
      };

      // Switch session to new device
      const success = await sessionManager.switchToDevice(tvDevice);
      
      if (success) {
        // Update active device in store
        await deviceStore.setActiveDevice(device.id);
        setActiveDeviceId(device.id);
        debug.log('Successfully switched to device');
        
        // Navigate to remote control
        router.push('/remote/control');
      } else {
        Alert.alert('连接失败', '无法连接到所选设备，请稍后重试');
      }
    } catch (error) {
      debug.error('Failed to switch device:', error);
      Alert.alert('切换失败', '无法切换到所选设备');
    } finally {
      setIsSwitching(false);
    }
  }, [activeDeviceId]);

  // Handle device rename
  const handleRenameDevice = useCallback(async (deviceId: string, newName: string) => {
    try {
      debug.log(`Renaming device ${deviceId} to "${newName}"`);
      await deviceStore.renameDevice(deviceId, newName);
      await loadDevices();
    } catch (error) {
      debug.error('Failed to rename device:', error);
      Alert.alert('重命名失败', '无法重命名设备');
    }
  }, [loadDevices]);

  // Handle device delete
  const handleDeleteDevice = useCallback(async (deviceId: string) => {
    try {
      debug.log(`Deleting device ${deviceId}`);
      
      // If deleting active device, disconnect first
      if (deviceId === activeDeviceId) {
        await sessionManager.disconnect();
      }
      
      await deviceStore.removeDevice(deviceId);
      await loadDevices();
    } catch (error) {
      debug.error('Failed to delete device:', error);
      Alert.alert('删除失败', '无法删除设备');
    }
  }, [activeDeviceId, loadDevices]);

  // Handle favorite toggle
  const handleToggleFavorite = useCallback(async (deviceId: string) => {
    try {
      debug.log(`Toggling favorite for device ${deviceId}`);
      await deviceStore.toggleFavorite(deviceId);
      await loadDevices();
    } catch (error) {
      debug.error('Failed to toggle favorite:', error);
    }
  }, [loadDevices]);

  // Handle add device button - navigate to discovery
  const handleAddDevice = useCallback(() => {
    router.push('/remote/discovery');
  }, []);

  // Handle back button
  const handleBack = useCallback(() => {
    router.back();
  }, []);

  // Render device item
  const renderDevice = useCallback(({ item, index }: { item: SavedDevice; index: number }) => (
    <DeviceManagementItem
      device={item}
      isActive={item.id === activeDeviceId}
      onSelect={handleSelectDevice}
      onRename={handleRenameDevice}
      onDelete={handleDeleteDevice}
      onToggleFavorite={handleToggleFavorite}
      testID={`device-item-${index}`}
    />
  ), [activeDeviceId, handleSelectDevice, handleRenameDevice, handleDeleteDevice, handleToggleFavorite]);

  // Render empty state
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📺</Text>
      <Text style={styles.emptyTitle}>暂无设备</Text>
      <Text style={styles.emptyDescription}>点击下方按钮发现并添加电视设备</Text>
    </View>
  );

  // Render loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>加载设备列表...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>设备管理</Text>
        <View style={styles.headerRight}>
          <Text style={styles.deviceCount}>{devices.length}/10</Text>
        </View>
      </View>

      {/* Switching overlay */}
      {isSwitching && (
        <View style={styles.switchingOverlay}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.switchingText}>正在切换设备...</Text>
        </View>
      )}

      {/* Device list */}
      <FlatList
        data={devices}
        renderItem={renderDevice}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
        testID="device-list"
      />

      {/* Add device button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.addButton, devices.length >= 10 && styles.addButtonDisabled]}
          onPress={handleAddDevice}
          disabled={devices.length >= 10}
          testID="add-device-button"
        >
          <Text style={styles.addButtonIcon}>+</Text>
          <Text style={styles.addButtonText}>
            {devices.length >= 10 ? '已达设备上限' : '添加设备'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  backButton: {
    padding: 8,
  },
  backIcon: {
    fontSize: 24,
    color: '#007AFF',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerRight: {
    width: 50,
    alignItems: 'flex-end',
  },
  deviceCount: {
    fontSize: 14,
    color: '#888',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#888',
  },
  switchingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  switchingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#FFFFFF',
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#121212',
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
  },
  addButtonDisabled: {
    backgroundColor: '#333',
  },
  addButtonIcon: {
    fontSize: 24,
    color: '#FFFFFF',
    marginRight: 8,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default DeviceManagementScreen;
