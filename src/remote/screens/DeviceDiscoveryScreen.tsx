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
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
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
import { setSession } from '../services/session-store';

/** Debug logger for discovery screen */
const DEBUG_TAG = '[DeviceDiscovery]';
const debug = {
  log: (...args: unknown[]) => console.log(DEBUG_TAG, ...args),
  warn: (...args: unknown[]) => console.warn(DEBUG_TAG, ...args),
  error: (...args: unknown[]) => console.error(DEBUG_TAG, ...args),
};

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

  // Session ref for cleanup (only used for sessions not stored globally)
  const sessionRef = useRef<TVSession | null>(null);

  // Note: We don't cleanup session on unmount because it's stored in global store
  // and will be used by RemoteControlScreen

  // Start device discovery
  const handleScan = useCallback(async () => {
    debug.log('Starting device scan...');
    setIsScanning(true);
    setDevices([]);

    try {
      // Get Roku adapter and scan
      debug.log('Getting Roku adapter...');
      const rokuAdapter = getAdapter(TVPlatform.Roku);
      
      debug.log('Starting discovery...');
      const startTime = Date.now();
      const discoveredDevices = await rokuAdapter.discover();
      const elapsed = Date.now() - startTime;
      
      debug.log(`Discovery completed in ${elapsed}ms`);
      debug.log(`Found ${discoveredDevices.length} device(s)`);

      // Convert discovered devices to TVDevice
      const tvDevices: TVDevice[] = discoveredDevices.map((d) => {
        debug.log(`Processing device: ${d.name} (${d.id}) at ${d.ipAddress}:${d.port}`);
        return {
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
        };
      });

      setDevices(tvDevices);

      if (tvDevices.length === 0) {
        debug.warn('No devices found');
        Alert.alert(
          '未发现设备',
          '请确保您的电视已开启并连接到同一 Wi-Fi 网络。\n\n提示：扫描可能需要较长时间，您也可以尝试手动添加设备。',
          [
            { text: '重试', onPress: handleScan },
            { text: '手动添加', onPress: () => setShowManualEntry(true) },
            { text: '取消', style: 'cancel' },
          ]
        );
      } else {
        debug.log(`Successfully found ${tvDevices.length} device(s)`);
      }
    } catch (error) {
      debug.error('Discovery failed:', error);
      Alert.alert('扫描失败', '无法扫描网络设备，请检查网络连接。');
    } finally {
      setIsScanning(false);
      debug.log('Scan completed');
    }
  }, []);

  // Auto-scan on mount
  useEffect(() => {
    handleScan();
  }, [handleScan]);

  // Connect to a device
  const handleConnect = useCallback(async (device: TVDevice) => {
    if (connectingDeviceId) {
      debug.warn('Already connecting to a device, ignoring...');
      return;
    }

    debug.log(`Connecting to device: ${device.name} (${device.id})`);
    debug.log(`  IP: ${device.ipAddress}:${device.port}`);
    debug.log(`  Platform: ${device.platform}`);
    
    setConnectingDeviceId(device.id);

    try {
      debug.log('Getting adapter...');
      const adapter = getAdapter(device.platform);
      
      debug.log('Initiating connection...');
      const startTime = Date.now();
      const session = await adapter.connect(device);
      const elapsed = Date.now() - startTime;
      
      debug.log(`Connection attempt completed in ${elapsed}ms`);

      if (session) {
        debug.log(`Connected successfully! Session ID: ${session.sessionId}`);
        sessionRef.current = session;
        setConnectedDeviceId(device.id);

        // Store session in global store for RemoteControlScreen
        setSession(device, session);

        // Navigate to remote control
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
        debug.error('Connection failed: No session returned');
        Alert.alert('连接失败', '无法连接到设备，请确保设备已开启。');
      }
    } catch (error) {
      debug.error('Connection failed with error:', error);
      Alert.alert('连接失败', `连接错误: ${error}`);
    } finally {
      setConnectingDeviceId(null);
      debug.log('Connection attempt finished');
    }
  }, [connectingDeviceId]);

  // Manual entry submit
  const handleManualAdd = useCallback(async () => {
    debug.log('Manual add triggered');
    
    if (!manualIp.trim()) {
      debug.warn('Empty IP address');
      Alert.alert('错误', '请输入 IP 地址');
      return;
    }

    // Validate IP format
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(manualIp.trim())) {
      debug.warn(`Invalid IP format: ${manualIp}`);
      Alert.alert('错误', '请输入有效的 IP 地址');
      return;
    }

    debug.log(`Adding manual device: ${selectedPlatform} at ${manualIp}`);
    
    // Dismiss keyboard before proceeding
    Keyboard.dismiss();

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

    debug.log(`Created device: ${manualDevice.id}`);
    setDevices((prev) => [...prev, manualDevice]);
    setShowManualEntry(false);
    setManualIp('');

    // Attempt to connect
    debug.log('Attempting to connect to manual device...');
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
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable 
            style={styles.modalBackdrop} 
            onPress={() => {
              Keyboard.dismiss();
              setShowManualEntry(false);
            }}
          />
          <View style={styles.modalContent}>
            <ScrollView 
              bounces={false}
              keyboardShouldPersistTaps="handled"
            >
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
                returnKeyType="done"
                onSubmitEditing={handleManualAdd}
              />

              {/* Buttons */}
              <View style={styles.modalButtons}>
                <Pressable
                  style={styles.cancelButton}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowManualEntry(false);
                  }}
                >
                  <Text style={styles.cancelButtonText}>取消</Text>
                </Pressable>
                <Pressable style={styles.addButton} onPress={handleManualAdd}>
                  <Text style={styles.addButtonText}>添加</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
  modalBackdrop: {
    flex: 1,
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
