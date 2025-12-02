/**
 * DeviceManagementItem - Device list item with long-press actions
 * Supports rename, delete, and active selection
 */
import React, { useCallback, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  Pressable,
  Animated,
} from 'react-native';
import { SavedDevice } from '../services/device-store';
import { getPlatformName, getPlatformIcon } from '../utils/platform-utils';

/** Props for DeviceManagementItem */
export interface DeviceManagementItemProps {
  /** The saved device to display */
  device: SavedDevice;
  /** Whether this device is currently active */
  isActive: boolean;
  /** Callback when device is selected */
  onSelect: (device: SavedDevice) => void;
  /** Callback when device is renamed */
  onRename: (deviceId: string, newName: string) => void;
  /** Callback when device is deleted */
  onDelete: (deviceId: string) => void;
  /** Callback when favorite is toggled */
  onToggleFavorite?: (deviceId: string) => void;
  /** Test ID for testing */
  testID?: string;
}

/**
 * DeviceManagementItem component
 */
export const DeviceManagementItem: React.FC<DeviceManagementItemProps> = ({
  device,
  isActive,
  onSelect,
  onRename,
  onDelete,
  onToggleFavorite,
  testID,
}) => {
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [newName, setNewName] = useState(device.customName || device.name);
  const [showActions, setShowActions] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Handle tap to select
  const handlePress = useCallback(() => {
    onSelect(device);
  }, [device, onSelect]);

  // Handle long press to show actions
  const handleLongPress = useCallback(() => {
    // Animate scale down then up
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    setShowActions(true);
  }, [scaleAnim]);

  // Handle rename action
  const handleRenamePress = useCallback(() => {
    setShowActions(false);
    setNewName(device.customName || device.name);
    setShowRenameModal(true);
  }, [device]);

  // Handle rename confirm
  const handleRenameConfirm = useCallback(() => {
    const trimmedName = newName.trim();
    if (trimmedName && trimmedName !== device.customName) {
      onRename(device.id, trimmedName);
    }
    setShowRenameModal(false);
  }, [newName, device, onRename]);

  // Handle delete action
  const handleDeletePress = useCallback(() => {
    setShowActions(false);
    Alert.alert('删除设备', `确定要删除 "${device.customName || device.name}" 吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => onDelete(device.id),
      },
    ]);
  }, [device, onDelete]);

  // Handle favorite toggle
  const handleFavoritePress = useCallback(() => {
    setShowActions(false);
    onToggleFavorite?.(device.id);
  }, [device.id, onToggleFavorite]);

  const displayName = device.customName || device.name;
  const lastConnectedDate = new Date(device.lastConnected);
  const lastConnectedText = lastConnectedDate.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      <Animated.View style={[styles.container, { transform: [{ scale: scaleAnim }] }]}>
        <TouchableOpacity
          style={[styles.item, isActive && styles.itemActive]}
          onPress={handlePress}
          onLongPress={handleLongPress}
          delayLongPress={500}
          activeOpacity={0.7}
          testID={testID}
          accessibilityLabel={`${displayName}, ${getPlatformName(device.platform)}`}
          accessibilityHint="点击选择此设备，长按显示更多操作"
          accessibilityRole="button"
        >
          {/* Platform icon */}
          <View style={styles.iconContainer}>
            <Text style={styles.platformIcon}>{getPlatformIcon(device.platform)}</Text>
            {device.isFavorite && <Text style={styles.favoriteIcon}>⭐</Text>}
          </View>

          {/* Device info */}
          <View style={styles.infoContainer}>
            <Text
              style={[styles.deviceName, isActive && styles.deviceNameActive]}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            <Text style={styles.platformName}>{getPlatformName(device.platform)}</Text>
            <Text style={styles.lastConnected}>上次连接: {lastConnectedText}</Text>
          </View>

          {/* Active indicator */}
          {isActive && (
            <View style={styles.activeIndicator}>
              <Text style={styles.activeText}>当前</Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* Actions modal */}
      <Modal
        visible={showActions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowActions(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowActions(false)}>
          <View style={styles.actionsContainer}>
            <Text style={styles.actionsTitle}>{displayName}</Text>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleRenamePress}
              testID={`${testID}-rename`}
            >
              <Text style={styles.actionIcon}>✏️</Text>
              <Text style={styles.actionText}>重命名</Text>
            </TouchableOpacity>

            {onToggleFavorite && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleFavoritePress}
                testID={`${testID}-favorite`}
              >
                <Text style={styles.actionIcon}>{device.isFavorite ? '☆' : '⭐'}</Text>
                <Text style={styles.actionText}>{device.isFavorite ? '取消收藏' : '收藏'}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={handleDeletePress}
              testID={`${testID}-delete`}
            >
              <Text style={styles.actionIcon}>🗑️</Text>
              <Text style={[styles.actionText, styles.deleteText]}>删除</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowActions(false)}>
              <Text style={styles.cancelText}>取消</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Rename modal */}
      <Modal
        visible={showRenameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRenameModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowRenameModal(false)}>
          <View style={styles.renameContainer}>
            <Text style={styles.renameTitle}>重命名设备</Text>
            <TextInput
              style={styles.renameInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="输入新名称"
              autoFocus
              maxLength={50}
              testID={`${testID}-rename-input`}
            />
            <View style={styles.renameButtons}>
              <TouchableOpacity
                style={styles.renameCancelButton}
                onPress={() => setShowRenameModal(false)}
              >
                <Text style={styles.renameCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.renameConfirmButton}
                onPress={handleRenameConfirm}
                testID={`${testID}-rename-confirm`}
              >
                <Text style={styles.renameConfirmText}>确定</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  itemActive: {
    borderColor: '#007AFF',
    backgroundColor: '#1A2A3A',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  platformIcon: {
    fontSize: 24,
  },
  favoriteIcon: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    fontSize: 12,
  },
  infoContainer: {
    flex: 1,
    marginLeft: 12,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  deviceNameActive: {
    color: '#007AFF',
  },
  platformName: {
    fontSize: 13,
    color: '#888',
    marginBottom: 2,
  },
  lastConnected: {
    fontSize: 11,
    color: '#666',
  },
  activeIndicator: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activeText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionsContainer: {
    backgroundColor: '#2A2A2A',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxWidth: 300,
  },
  actionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#333',
    borderRadius: 10,
    marginBottom: 8,
  },
  actionIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  actionText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  deleteButton: {
    backgroundColor: '#3A2020',
  },
  deleteText: {
    color: '#FF4444',
  },
  cancelButton: {
    paddingVertical: 14,
    marginTop: 8,
  },
  cancelText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  renameContainer: {
    backgroundColor: '#2A2A2A',
    borderRadius: 16,
    padding: 20,
    width: '85%',
    maxWidth: 340,
  },
  renameTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  renameInput: {
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#444',
  },
  renameButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  renameCancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  renameCancelText: {
    fontSize: 16,
    color: '#888',
  },
  renameConfirmButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  renameConfirmText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

export default DeviceManagementItem;
