/**
 * RemoteControlScreen - Main remote control interface
 * Renders button groups and handles command dispatch
 * UI layout is unified across platforms, with capability-driven button visibility/disabled states
 */
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { RemoteButton } from '../components/RemoteButton';
import { ConnectionStatusBar } from '../components/ConnectionStatusBar';
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
      {/* Connection status bar with device switcher */}
      <ConnectionStatusBar
        device={device}
        status={status}
        onPress={handleStatusBarPress}
        onDisconnect={handleDisconnect}
        onDeviceSwitch={handleDeviceSwitch}
        savedDeviceCount={savedDeviceCount}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* System buttons row - capability-driven visibility */}
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
            />
          ))}
        </View>

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
              button={buttonGroups.navigation.find((b) => b.command === RemoteCommandType.Left)!}
              onPress={handleCommand}
              capabilities={capabilities}
              isConnected={isConnected}
              size="large"
              shape="circle"
            />
            <RemoteButton
              button={buttonGroups.navigation.find((b) => b.command === RemoteCommandType.Select)!}
              onPress={handleCommand}
              capabilities={capabilities}
              isConnected={isConnected}
              size="large"
              shape="circle"
              style={styles.selectButton}
            />
            <RemoteButton
              button={buttonGroups.navigation.find((b) => b.command === RemoteCommandType.Right)!}
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
              button={buttonGroups.navigation.find((b) => b.command === RemoteCommandType.Down)!}
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

        {/* Number pad - always visible */}
        <View style={styles.numpadContainer}>
          {/* Row 1: 1-2-3 */}
          <View style={styles.numpadRow}>
            {buttonGroups.numbers.slice(0, 3).map((button) => (
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
          {/* Row 2: 4-5-6 */}
          <View style={styles.numpadRow}>
            {buttonGroups.numbers.slice(3, 6).map((button) => (
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
          {/* Row 3: 7-8-9 */}
          <View style={styles.numpadRow}>
            {buttonGroups.numbers.slice(6, 9).map((button) => (
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
          {/* Row 4: 0 (centered) */}
          <View style={styles.numpadRow}>
            <RemoteButton
              button={buttonGroups.numbers[9]}
              onPress={handleCommand}
              capabilities={capabilities}
              isConnected={isConnected}
              size="medium"
              shape="rounded"
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginVertical: 8,
  },
  dpadContainer: {
    marginVertical: 24,
    alignItems: 'center',
  },
  dpadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  selectButton: {
    backgroundColor: '#3a3a3a',
  },
  sideControlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginVertical: 16,
  },
  sideControlColumn: {
    alignItems: 'center',
    gap: 12,
  },
  numpadContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  numpadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginVertical: 6,
  },
});

export default RemoteControlScreen;
