/**
 * RemoteControlScreen - Main remote control interface
 * Renders button groups and handles command dispatch
 * UI layout is unified across platforms, with capability-driven button visibility/disabled states
 */
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { RemoteButton } from '../components/RemoteButton';
import { ConnectionStatusBar } from '../components/ConnectionStatusBar';
import { RemoteTabBar, RemoteTabType } from '../components/RemoteTabBar';
import { NumberPad } from '../components/NumberPad';
import { buttonGroups } from '../domain/default-profile';
import { RemoteCommandType, ConnectionStatus, TVCapabilities } from '../domain/models';
import { useSession, clearSession } from '../services/session-store';
import { deviceStore } from '../services/device-store';

/** Debug logger */
const DEBUG_TAG = '[RemoteControl]';
const debug = {
  log: (...args: unknown[]) => console.log(DEBUG_TAG, ...args),
  warn: (...args: unknown[]) => console.warn(DEBUG_TAG, ...args),
  error: (...args: unknown[]) => console.error(DEBUG_TAG, ...args),
};

/**
 * RemoteControlScreen component
 * Uses unified layout across all platforms
 * Button visibility/disabled state is driven by device capabilities
 */
export const RemoteControlScreen: React.FC = () => {
  // Get session state from global store
  const { device, session, status } = useSession();
  const [savedDeviceCount, setSavedDeviceCount] = useState(0);
  const [activeTab, setActiveTab] = useState<RemoteTabType>('direction');

  debug.log('Rendering RemoteControlScreen');
  debug.log(`  Device: ${device?.name ?? 'none'}`);
  debug.log(`  Session: ${session?.sessionId ?? 'none'}`);
  debug.log(`  Status: ${status}`);

  // Get device capabilities (unified across platforms)
  const capabilities: TVCapabilities | null = useMemo(() => {
    return device?.capabilities ?? null;
  }, [device]);

  // Connection state for buttons
  const isConnected = status === ConnectionStatus.Connected;

  // Load saved device count on mount and when device changes
  useEffect(() => {
    const loadDeviceCount = async () => {
      try {
        await deviceStore.load();
        const devices = await deviceStore.getAllDevices();
        setSavedDeviceCount(devices.length);
      } catch (error) {
        debug.warn('Failed to load device count:', error);
      }
    };
    loadDeviceCount();
  }, [device]);

  // Handle status bar press - navigate to device discovery
  const handleStatusBarPress = useCallback(() => {
    router.push('/remote/discovery');
  }, []);

  // Handle device switch - navigate to device management
  const handleDeviceSwitch = useCallback(() => {
    router.push('/remote/devices');
  }, []);

  // Handle disconnect
  const handleDisconnect = useCallback(async () => {
    debug.log('Disconnecting...');
    await clearSession();
  }, []);

  // Handle navigate to device discovery
  const handleNavigateToDiscovery = useCallback(() => {
    debug.log('Navigating to device discovery...');
    router.push('/remote/discovery');
  }, []);

  // Handle tab change
  const handleTabChange = useCallback((tab: RemoteTabType) => {
    debug.log(`Switching to tab: ${tab}`);
    setActiveTab(tab);
  }, []);

  // Handle command press
  const handleCommand = useCallback(
    async (command: RemoteCommandType) => {
      if (!session) {
        debug.warn('No session, cannot send command');
        Alert.alert('未连接', '请先连接电视设备');
        return;
      }

      try {
        debug.log(`Sending command: ${command}`);
        const result = await session.sendCommand(command);
        if (!result.success) {
          debug.warn('Command failed:', result.error);
        } else {
          debug.log(`Command ${command} sent successfully`);
        }
      } catch (error) {
        debug.error('Failed to send command:', error);
      }
    },
    [session]
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Custom header with title and discovery icon */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>遥控器</Text>
        <TouchableOpacity
          style={styles.discoveryButton}
          onPress={handleNavigateToDiscovery}
          accessibilityLabel="发现设备"
          accessibilityHint="点击进入设备发现页面"
        >
          <MaterialIcons name="cast" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Connection status bar with device switcher */}
      <ConnectionStatusBar
        device={device}
        status={status}
        onPress={handleStatusBarPress}
        onDisconnect={handleDisconnect}
        onDeviceSwitch={handleDeviceSwitch}
        savedDeviceCount={savedDeviceCount}
      />

      {/* Tab bar for switching between direction controls and number pad */}
      <RemoteTabBar activeTab={activeTab} onTabChange={handleTabChange} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* System buttons row - always visible at top */}
        <View style={styles.buttonRow}>
          {buttonGroups.system.map((button) => (
            <RemoteButton
              key={button.id}
              button={button}
              onPress={handleCommand}
              capabilities={capabilities}
              isConnected={isConnected}
              size="medium"
              shape="circle"
              style={
                button.command === RemoteCommandType.Power
                  ? { backgroundColor: '#e74c3c' } // Red for power
                  : undefined
              }
            />
          ))}
        </View>

        {/* Direction Controls Tab */}
        {activeTab === 'direction' && (
          <>
            {/* Navigation D-pad - always visible (core functionality) */}
            <View style={styles.dpadContainer}>
              {/* Up */}
              <View style={styles.dpadRow}>
                <RemoteButton
                  button={buttonGroups.navigation.find((b) => b.command === RemoteCommandType.Up)!}
                  onPress={handleCommand}
                  capabilities={capabilities}
                  isConnected={isConnected}
                  size="large"
                  shape="circle"
                />
              </View>

              {/* Left - Select - Right */}
              <View style={styles.dpadRow}>
                <RemoteButton
                  button={
                    buttonGroups.navigation.find((b) => b.command === RemoteCommandType.Left)!
                  }
                  onPress={handleCommand}
                  capabilities={capabilities}
                  isConnected={isConnected}
                  size="large"
                  shape="circle"
                />
                <RemoteButton
                  button={
                    buttonGroups.navigation.find((b) => b.command === RemoteCommandType.Select)!
                  }
                  onPress={handleCommand}
                  capabilities={capabilities}
                  isConnected={isConnected}
                  size="large"
                  shape="circle"
                  style={[styles.selectButton, { backgroundColor: '#2196F3' }]}
                />
                <RemoteButton
                  button={
                    buttonGroups.navigation.find((b) => b.command === RemoteCommandType.Right)!
                  }
                  onPress={handleCommand}
                  capabilities={capabilities}
                  isConnected={isConnected}
                  size="large"
                  shape="circle"
                />
              </View>

              {/* Down */}
              <View style={styles.dpadRow}>
                <RemoteButton
                  button={
                    buttonGroups.navigation.find((b) => b.command === RemoteCommandType.Down)!
                  }
                  onPress={handleCommand}
                  capabilities={capabilities}
                  isConnected={isConnected}
                  size="large"
                  shape="circle"
                />
              </View>
            </View>

            {/* Volume and channel controls - capability-driven visibility */}
            <View style={styles.sideControlsContainer}>
              {/* Volume */}
              <View style={styles.sideControlColumn}>
                {buttonGroups.volume.map((button) => (
                  <RemoteButton
                    key={button.id}
                    button={button}
                    onPress={handleCommand}
                    capabilities={capabilities}
                    isConnected={isConnected}
                    size="medium"
                    shape="rounded"
                  />
                ))}
              </View>

              {/* Channel */}
              <View style={styles.sideControlColumn}>
                {buttonGroups.channel.map((button) => (
                  <RemoteButton
                    key={button.id}
                    button={button}
                    onPress={handleCommand}
                    capabilities={capabilities}
                    isConnected={isConnected}
                    size="medium"
                    shape="rounded"
                  />
                ))}
              </View>
            </View>

            {/* Playback controls - always visible */}
            <View style={styles.buttonRow}>
              {buttonGroups.playback.map((button) => (
                <RemoteButton
                  key={button.id}
                  button={button}
                  onPress={handleCommand}
                  capabilities={capabilities}
                  isConnected={isConnected}
                  size="medium"
                  shape="rounded"
                />
              ))}
            </View>

            {/* Menu buttons - always visible */}
            <View style={styles.buttonRow}>
              {buttonGroups.menu.map((button) => (
                <RemoteButton
                  key={button.id}
                  button={button}
                  onPress={handleCommand}
                  capabilities={capabilities}
                  isConnected={isConnected}
                  size="medium"
                  shape="rounded"
                />
              ))}
            </View>
          </>
        )}

        {/* Number Pad Tab */}
        {activeTab === 'numbers' && (
          <NumberPad
            onCommand={handleCommand}
            capabilities={capabilities}
            isConnected={isConnected}
          />
        )}
      </ScrollView>
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
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  discoveryButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginVertical: 6,
  },
  dpadContainer: {
    marginVertical: 12,
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 100,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  dpadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginVertical: 4,
  },
  selectButton: {
    backgroundColor: '#3a3a3a',
  },
  sideControlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 24,
    marginVertical: 12,
  },
  sideControlColumn: {
    alignItems: 'center',
    gap: 8,
  },
  numpadContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  numpadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginVertical: 4,
  },
});

export default RemoteControlScreen;
