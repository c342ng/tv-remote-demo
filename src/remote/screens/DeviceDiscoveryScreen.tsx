/**
 * DeviceDiscoveryScreen - Scan and select TV devices
 * Supports scanning, manual entry, and device connection
 *
 * Updated to use DiscoveryOrchestrator for three-phase discovery:
 * 1. Cache verification - verify previously discovered devices
 * 2. Broadcast discovery - SSDP/mDNS passive listening
 * 3. Active scanning - port scan by priority blocks
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { DeviceListItem } from './DeviceListItem';
import { TVDevice, TVPlatform } from '../domain/models';
import { DiscoveredDevice, TVSession } from '../domain/remote-interfaces';
import { getAdapter } from '../protocols/factory';
import { setSession } from '../services/session-store';
import {
  discoveryOrchestrator,
  getSupportedPlatforms,
  type DiscoveryPhase,
} from '../services/aggregated-discovery';
import { getDeviceNetworkInfo } from '../services/network-utils';

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

  // Discovery phase state
  const [discoveryPhase, setDiscoveryPhase] = useState<DiscoveryPhase>('idle');

  // Manual entry modal
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualIp, setManualIp] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<TVPlatform>(TVPlatform.Roku);

  // Network info for debugging
  const [networkIp, setNetworkIp] = useState<string | null>(null);

  // Animation for new devices
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Session ref for cleanup (only used for sessions not stored globally)
  const sessionRef = useRef<TVSession | null>(null);

  // Track seen device IDs to prevent duplicates during real-time updates
  const seenDeviceIdsRef = useRef<Set<string>>(new Set());

  // Note: We don't cleanup session on unmount because it's stored in global store
  // and will be used by RemoteControlScreen

  // Helper function to convert DiscoveredDevice to TVDevice
  const convertToTVDevice = useCallback(
    (d: DiscoveredDevice): TVDevice => ({
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
    }),
    []
  );

  // Start device discovery (multi-platform with three phases)
  const handleScan = useCallback(async () => {
    debug.log('Starting three-phase device discovery...');
    setIsScanning(true);
    setDevices([]);
    setDiscoveryPhase('idle');
    seenDeviceIdsRef.current.clear();

    // Get and display network info first
    try {
      const netInfo = await getDeviceNetworkInfo();
      if (netInfo) {
        setNetworkIp(netInfo.ipAddress);
        debug.log(
          `Phone IP: ${netInfo.ipAddress}, Subnet: ${netInfo.subnetMask}/${netInfo.cidrPrefix}`
        );
      }
    } catch (e) {
      debug.error('Failed to get network info:', e);
    }

    try {
      // Use DiscoveryOrchestrator for three-phase discovery
      const supportedPlatforms = getSupportedPlatforms();
      debug.log(`Supported platforms: ${supportedPlatforms.join(', ')}`);

      debug.log('Starting orchestrated discovery...');
      const startTime = Date.now();

      // Set up event emitter for real-time updates
      discoveryOrchestrator.setEventEmitter({
        onDeviceFound: (device: DiscoveredDevice) => {
          // Deduplicate based on device ID
          if (!seenDeviceIdsRef.current.has(device.id)) {
            seenDeviceIdsRef.current.add(device.id);
            const tvDevice = convertToTVDevice(device);
            debug.log(`[Real-time] Adding device: ${device.name} at ${device.ipAddress}`);

            // Animate new device appearance
            Animated.sequence([
              Animated.timing(fadeAnim, { toValue: 0.5, duration: 100, useNativeDriver: true }),
              Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
            ]).start();

            setDevices((prev) => [...prev, tvDevice]);
          }
        },
        onPhaseChange: (phase: DiscoveryPhase, progress?: number) => {
          debug.log(`Phase change: ${phase}${progress !== undefined ? ` (${progress}%)` : ''}`);
          setDiscoveryPhase(phase);
        },
      });

      const result = await discoveryOrchestrator.startDiscovery({
        timeoutMs: 10000,
        platforms: supportedPlatforms,
        scanConcurrency: 50,
      });

      const elapsed = Date.now() - startTime;

      debug.log(`Discovery completed in ${elapsed}ms (reported: ${result.durationMs}ms)`);
      debug.log(`Found ${result.devices.length} device(s) total`);
      debug.log(`Cached devices verified: ${result.cachedDevicesVerified}`);
      debug.log(`Blocks scanned: ${result.blocksScanned}`);

      // Log platform breakdown
      for (const [platform, platformDevices] of result.byPlatform.entries()) {
        if (platformDevices.length > 0) {
          debug.log(`  ${platform}: ${platformDevices.length} device(s)`);
        }
      }

      // Log any errors
      if (result.errors.length > 0) {
        debug.warn(`Discovery had ${result.errors.length} error(s):`);
        result.errors.forEach((e) => debug.warn(`  ${e.platform}: ${e.error.message}`));
      }

      // Final check - ensure all devices are in the list
      setDevices((prev) => {
        const existingIds = new Set(prev.map((d) => d.id));
        const newDevices = result.devices
          .filter((d) => !existingIds.has(d.id))
          .map(convertToTVDevice);

        if (newDevices.length > 0) {
          debug.log(`Adding ${newDevices.length} missed device(s)`);
          return [...prev, ...newDevices];
        }
        return prev;
      });

      // Show alert only if no devices found
      if (result.devices.length === 0) {
        debug.warn('No devices found');
        Alert.alert(
          '未发现设备',
          '请确保您的电视已开启并连接到同一 Wi-Fi 网络。\n\n支持的平台：Roku、Android TV、Fire TV\n\n提示：扫描可能需要较长时间，您也可以尝试手动添加设备。',
          [
            { text: '重试', onPress: handleScan },
            { text: '手动添加', onPress: () => setShowManualEntry(true) },
            { text: '取消', style: 'cancel' },
          ]
        );
      } else {
        debug.log(`Successfully found ${result.devices.length} device(s)`);
      }
    } catch (error) {
      debug.error('Discovery failed:', error);
      Alert.alert('扫描失败', '无法扫描网络设备，请检查网络连接。');
    } finally {
      setIsScanning(false);
      setDiscoveryPhase('complete');
      debug.log('Scan completed');
    }
  }, [convertToTVDevice, fadeAnim]);

  // Auto-scan on mount
  useEffect(() => {
    handleScan();
  }, [handleScan]);

  // Connect to a device
  const handleConnect = useCallback(
    async (device: TVDevice) => {
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

          // Stop discovery immediately on successful connection
          // This stops both broadcast discovery and active scanning
          debug.log('Stopping discovery due to successful connection');
          discoveryOrchestrator.stopDiscovery();
          setIsScanning(false);
          setDiscoveryPhase('complete');

          // Store session in global store for RemoteControlScreen
          setSession(device, session);

          // Navigate to remote control
          Alert.alert('连接成功', `已连接到 ${device.name}`, [
            {
              text: '开始控制',
              onPress: () => router.replace('/remote/control'),
            },
          ]);
        } else {
          debug.error('Connection failed: No session returned');
          // Provide more helpful error message based on platform
          let errorMessage = '无法连接到设备，请确保设备已开启。';
          if (device.platform === 'android_tv') {
            errorMessage =
              '无法连接到设备。\n\n' +
              '可能的原因：\n' +
              '• 设备未开启 ADB 网络调试\n' +
              '• 普通 Chromecast 不支持远程控制\n' +
              '• 设备防火墙阻止了连接\n\n' +
              '如需启用 ADB：设置 → 设备偏好设置 → 开发者选项 → 网络调试';
          }
          Alert.alert('连接失败', errorMessage);
        }
      } catch (error) {
        debug.error('Connection failed with error:', error);
        const errorStr = String(error);
        let errorMessage = `连接错误: ${errorStr}`;

        // Provide user-friendly error messages
        if (errorStr.includes('Connection refused')) {
          errorMessage =
            '连接被拒绝。\n\n' +
            '设备可能不支持远程控制，或 ADB 调试未启用。';
        } else if (errorStr.includes('timeout') || errorStr.includes('Timeout')) {
          errorMessage = '连接超时，请检查网络连接。';
        }

        Alert.alert('连接失败', errorMessage);
      } finally {
        setConnectingDeviceId(null);
        debug.log('Connection attempt finished');
      }
    },
    [connectingDeviceId]
  );

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
      name: `${
        selectedPlatform === TVPlatform.AndroidTV
          ? 'Android TV'
          : selectedPlatform === TVPlatform.FireTV
            ? 'Fire TV'
            : selectedPlatform
      } (${manualIp})`,
      platform: selectedPlatform,
      ipAddress: manualIp.trim(),
      // Default ports per platform
      port:
        selectedPlatform === TVPlatform.Roku
          ? 8060
          : selectedPlatform === TVPlatform.AndroidTV
            ? 5555
            : selectedPlatform === TVPlatform.FireTV
              ? 5555
              : 8080,
      capabilities: {
        powerControl: true,
        volumeControl: true,
        channelControl: false,
        voiceInput: false,
        keyboard: true,
        apps: selectedPlatform === TVPlatform.Roku,
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
  const renderDevice = useCallback(
    ({ item }: { item: TVDevice }) => (
      <DeviceListItem
        device={item}
        isConnecting={connectingDeviceId === item.id}
        isConnected={connectedDeviceId === item.id}
        onPress={handleConnect}
      />
    ),
    [connectingDeviceId, connectedDeviceId, handleConnect]
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>发现设备</Text>
        <Pressable style={styles.scanButton} onPress={handleScan} disabled={isScanning}>
          {isScanning ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.scanButtonText}>扫描</Text>
          )}
        </Pressable>
      </View>

      {/* Scanning indicator with phase display */}
      {isScanning && (
        <View style={styles.scanningContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.scanningText}>
            {discoveryPhase === 'complete' ? '扫描完成' : '正在扫描网络设备...'}
          </Text>
          {networkIp && <Text style={styles.networkIpText}>手机 IP: {networkIp}</Text>}

          {/* Stop button */}
          <Pressable
            style={styles.stopButton}
            onPress={() => {
              discoveryOrchestrator.stopDiscovery();
              setIsScanning(false);
              setDiscoveryPhase('complete');
            }}
          >
            <Text style={styles.stopButtonText}>停止扫描</Text>
          </Pressable>
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
              <MaterialIcons name="tv-off" size={64} color="#444" />
              <Text style={styles.emptyText}>未发现设备</Text>
              <Text style={styles.emptyHint}>请确保电视已开启并连接到同一 Wi-Fi</Text>
            </View>
          ) : null
        }
      />

      {/* Manual entry button */}
      <Pressable style={styles.manualButton} onPress={() => setShowManualEntry(true)}>
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
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>手动添加设备</Text>

              {/* Platform selector */}
              <Text style={styles.inputLabel}>平台</Text>
              <View style={styles.platformSelector}>
                {[TVPlatform.Roku, TVPlatform.AndroidTV, TVPlatform.FireTV].map((platform) => (
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
                      {platform === TVPlatform.AndroidTV
                        ? 'Android TV'
                        : platform === TVPlatform.FireTV
                          ? 'Fire TV'
                          : platform}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
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
  networkIpText: {
    color: '#4CAF50',
    fontSize: 12,
    marginTop: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  phaseIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
  },
  phaseDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#444',
  },
  phaseDotActive: {
    backgroundColor: '#4CAF50',
  },
  phaseConnector: {
    width: 30,
    height: 2,
    backgroundColor: '#444',
  },
  phaseLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 140,
    marginTop: 8,
  },
  phaseLabel: {
    color: '#666',
    fontSize: 11,
  },
  phaseLabelActive: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  progressContainer: {
    width: '80%',
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    marginTop: 16,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 2,
  },
  stopButton: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#333',
    borderRadius: 8,
  },
  stopButtonText: {
    color: '#888',
    fontSize: 14,
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
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
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
