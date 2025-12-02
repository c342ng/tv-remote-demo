/**
 * DeviceDiscoveryScreen - Scan and select TV devices
 * Supports scanning, manual entry, and device connection
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import { DeviceListItem } from './DeviceListItem';
import {
  TVDevice,
  TVPlatform,
  ConnectionStatus,
} from '../domain/models';
import { DiscoveredDevice, TVSession } from '../domain/remote-interfaces';
import { getAdapter } from '../protocols/factory';

/**
 * DeviceDiscoveryScreen component
 */
export const DeviceDiscoveryScreen: React.FC = () => {
  // Discovery state
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<TVDevice[]>([]);
  const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(null);
  const [connectedDeviceId, setConnectedDeviceId] = useState<string | null>(null);
  
  // Manual entry modal
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualIp, setManualIp] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<TVPlatform>(TVPlatform.Roku);

  // Session ref for cleanup
  const sessionRef = useRef<TVSession | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.disconnect();
      }
    };
  }, []);

  // Start device discovery
  const handleScan = useCallback(async () => {
    setIsScanning(true);
    setDevices([]);

    try {
      // Get Roku adapter and scan
      const rokuAdapter = getAdapter(TVPlatform.Roku);
      const discoveredDevices = await rokuAdapter.discover();

      // Convert discovered devices to TVDevice
      const tvDevices: TVDevice[] = discoveredDevices.map((d) => ({
        id: d.id,
        name: d.name,
        platform: d.platform,
        ipAddress: d.ipAddress,
        port: d.port,
        modelName: undefined,
        capabilities: {
          powerControl: true,
          volumeControl: true,
          channelControl: false,
          voiceInput: false,
          keyboard: true,
          apps: true,
        },
      }));

      setDevices(tvDevices);

      if (tvDevices.length === 0) {
        Alert.alert(
          '未发现设备',
          '请确保您的电视已开启并连接到同一 Wi-Fi 网络。',
          [
            { text: '重试', onPress: handleScan },
            { text: '手动添加', onPress: () => setShowManualEntry(true) },
            { text: '取消', style: 'cancel' },
          ]
        );
      }
    } catch (error) {
      console.error('Discovery failed:', error);
      Alert.alert('扫描失败', '无法扫描网络设备，请检查网络连接。');
    } finally {
      setIsScanning(false);
    }
  }, []);

  // Auto-scan on mount
  useEffect(() => {
    handleScan();
  }, [handleScan]);

  // Connect to a device
  const handleConnect = useCallback(async (device: TVDevice) => {
    if (connectingDeviceId) return;

    setConnectingDeviceId(device.id);

    try {
      const adapter = getAdapter(device.platform);
      const session = await adapter.connect(device);

      if (session) {
        sessionRef.current = session;
        setConnectedDeviceId(device.id);

        // Store session and navigate to remote control
        // TODO: Save to context/store for RemoteControlScreen access
        Alert.alert(
          '连接成功',
          `已连接到 ${device.name}`,
          [
            {
              text: '开始控制',
              onPress: () => router.replace('/remote/control'),
            },
          ]
        );
      } else {
        Alert.alert('连接失败', '无法连接到设备，请确保设备已开启。');
      }
    } catch (error) {
      console.error('Connection failed:', error);
      Alert.alert('连接失败', `连接错误: ${error}`);
    } finally {
      setConnectingDeviceId(null);
    }
  }, [connectingDeviceId]);

  // Manual entry submit
  const handleManualAdd = useCallback(async () => {
    if (!manualIp.trim()) {
      Alert.alert('错误', '请输入 IP 地址');
      return;
    }

    // Validate IP format
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(manualIp.trim())) {
      Alert.alert('错误', '请输入有效的 IP 地址');
      return;
    }

    const manualDevice: TVDevice = {
      id: `manual-${manualIp}-${Date.now()}`,
      name: `${selectedPlatform} (${manualIp})`,
      platform: selectedPlatform,
      ipAddress: manualIp.trim(),
      port: selectedPlatform === TVPlatform.Roku ? 8060 : 8080,
      capabilities: {
        powerControl: true,
        volumeControl: true,
        channelControl: false,
        voiceInput: false,
        keyboard: true,
        apps: false,
      },
    };

    setDevices((prev) => [...prev, manualDevice]);
    setShowManualEntry(false);
    setManualIp('');

    // Attempt to connect
    handleConnect(manualDevice);
  }, [manualIp, selectedPlatform, handleConnect]);

  // Render device item
  const renderDevice = useCallback(({ item }: { item: TVDevice }) => (
    <DeviceListItem
      device={item}
      isConnecting={connectingDeviceId === item.id}
      isConnected={connectedDeviceId === item.id}
      onPress={handleConnect}
    />
  ), [connectingDeviceId, connectedDeviceId, handleConnect]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>发现设备</Text>
        <Pressable
          style={styles.scanButton}
          onPress={handleScan}
          disabled={isScanning}
        >
          {isScanning ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.scanButtonText}>扫描</Text>
          )}
        </Pressable>
      </View>

      {/* Scanning indicator */}
      {isScanning && (
        <View style={styles.scanningContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.scanningText}>正在扫描网络...</Text>
        </View>
      )}

      {/* Device list */}
      <FlatList
        data={devices}
        renderItem={renderDevice}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !isScanning ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>未发现设备</Text>
              <Text style={styles.emptyHint}>
                请确保电视已开启并连接到同一 Wi-Fi
              </Text>
            </View>
          ) : null
        }
      />

      {/* Manual entry button */}
      <Pressable
        style={styles.manualButton}
        onPress={() => setShowManualEntry(true)}
      >
        <Text style={styles.manualButtonText}>手动添加设备</Text>
      </Pressable>

      {/* Manual entry modal */}
      <Modal
        visible={showManualEntry}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowManualEntry(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>手动添加设备</Text>

            {/* Platform selector */}
            <Text style={styles.inputLabel}>平台</Text>
            <View style={styles.platformSelector}>
              {[TVPlatform.Roku].map((platform) => (
                <Pressable
                  key={platform}
                  style={[
                    styles.platformOption,
                    selectedPlatform === platform && styles.platformOptionSelected,
                  ]}
                  onPress={() => setSelectedPlatform(platform)}
                >
                  <Text
                    style={[
                      styles.platformOptionText,
                      selectedPlatform === platform && styles.platformOptionTextSelected,
                    ]}
                  >
                    {platform}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* IP input */}
            <Text style={styles.inputLabel}>IP 地址</Text>
            <TextInput
              style={styles.input}
              value={manualIp}
              onChangeText={setManualIp}
              placeholder="192.168.1.100"
              placeholderTextColor="#666"
              keyboardType="numeric"
              autoCapitalize="none"
              autoCorrect={false}
            />

            {/* Buttons */}
            <View style={styles.modalButtons}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => setShowManualEntry(false)}
              >
                <Text style={styles.cancelButtonText}>取消</Text>
              </Pressable>
              <Pressable style={styles.addButton} onPress={handleManualAdd}>
                <Text style={styles.addButtonText}>添加</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
  },
  scanButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  scanButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  scanningContainer: {
    padding: 40,
    alignItems: 'center',
  },
  scanningText: {
    color: '#888',
    fontSize: 14,
    marginTop: 12,
  },
  listContent: {
    paddingVertical: 12,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    color: '#888',
    fontSize: 16,
  },
  emptyHint: {
    color: '#666',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  manualButton: {
    margin: 16,
    padding: 16,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
    borderStyle: 'dashed',
  },
  manualButtonText: {
    color: '#888',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1e1e1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 24,
    textAlign: 'center',
  },
  inputLabel: {
    color: '#888',
    fontSize: 13,
    marginBottom: 8,
  },
  platformSelector: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  platformOption: {
    flex: 1,
    padding: 12,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    marginRight: 8,
    alignItems: 'center',
  },
  platformOptionSelected: {
    backgroundColor: '#4CAF50',
  },
  platformOptionText: {
    color: '#888',
    fontSize: 14,
  },
  platformOptionTextSelected: {
    color: '#ffffff',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#2a2a2a',
    color: '#ffffff',
    fontSize: 16,
    padding: 14,
    borderRadius: 8,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    backgroundColor: '#333',
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '600',
  },
  addButton: {
    flex: 1,
    padding: 16,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default DeviceDiscoveryScreen;
