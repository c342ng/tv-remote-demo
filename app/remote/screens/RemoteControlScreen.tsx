/**
 * RemoteControlScreen - Main remote control interface
 * Renders button groups and handles command dispatch
 */
import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { RemoteButton } from '../components/RemoteButton';
import { ConnectionStatusBar } from '../components/ConnectionStatusBar';
import { buttonGroups } from '../domain/default-profile';
import {
  RemoteCommandType,
  ConnectionStatus,
  TVDevice,
  TVPlatform,
} from '../domain/models';
import { TVSession } from '../domain/remote-interfaces';
import { getAdapter } from '../protocols/factory';

/**
 * RemoteControlScreen component
 */
export const RemoteControlScreen: React.FC = () => {
  // Connection state
  const [device, setDevice] = useState<TVDevice | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.Disconnected);
  const [session, setSession] = useState<TVSession | null>(null);

  // Handle status bar press - navigate to device discovery
  const handleStatusBarPress = useCallback(() => {
    router.push('/remote/discovery');
  }, []);

  // Handle disconnect
  const handleDisconnect = useCallback(async () => {
    if (session) {
      await session.disconnect();
      setSession(null);
      setDevice(null);
      setStatus(ConnectionStatus.Disconnected);
    }
  }, [session]);

  // Handle command press
  const handleCommand = useCallback(async (command: RemoteCommandType) => {
    if (!session) {
      Alert.alert('未连接', '请先连接电视设备');
      return;
    }

    try {
      const result = await session.sendCommand(command);
      if (!result.success) {
        console.warn('Command failed:', result.error);
      }
    } catch (error) {
      console.error('Failed to send command:', error);
    }
  }, [session]);

  // Check for stored device connection on mount
  useEffect(() => {
    // TODO: Load stored device from AsyncStorage and auto-reconnect
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {/* Connection status bar */}
      <ConnectionStatusBar
        device={device}
        status={status}
        onPress={handleStatusBarPress}
        onDisconnect={handleDisconnect}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* System buttons row */}
        <View style={styles.buttonRow}>
          {buttonGroups.system.map((button) => (
            <RemoteButton
              key={button.id}
              button={button}
              onPress={handleCommand}
              disabled={status !== ConnectionStatus.Connected}
              size="medium"
              shape="circle"
            />
          ))}
        </View>

        {/* Navigation D-pad */}
        <View style={styles.dpadContainer}>
          {/* Up */}
          <View style={styles.dpadRow}>
            <RemoteButton
              button={buttonGroups.navigation.find(b => b.command === RemoteCommandType.Up)!}
              onPress={handleCommand}
              disabled={status !== ConnectionStatus.Connected}
              size="large"
              shape="circle"
            />
          </View>
          
          {/* Left - Select - Right */}
          <View style={styles.dpadRow}>
            <RemoteButton
              button={buttonGroups.navigation.find(b => b.command === RemoteCommandType.Left)!}
              onPress={handleCommand}
              disabled={status !== ConnectionStatus.Connected}
              size="large"
              shape="circle"
            />
            <RemoteButton
              button={buttonGroups.navigation.find(b => b.command === RemoteCommandType.Select)!}
              onPress={handleCommand}
              disabled={status !== ConnectionStatus.Connected}
              size="large"
              shape="circle"
              style={styles.selectButton}
            />
            <RemoteButton
              button={buttonGroups.navigation.find(b => b.command === RemoteCommandType.Right)!}
              onPress={handleCommand}
              disabled={status !== ConnectionStatus.Connected}
              size="large"
              shape="circle"
            />
          </View>
          
          {/* Down */}
          <View style={styles.dpadRow}>
            <RemoteButton
              button={buttonGroups.navigation.find(b => b.command === RemoteCommandType.Down)!}
              onPress={handleCommand}
              disabled={status !== ConnectionStatus.Connected}
              size="large"
              shape="circle"
            />
          </View>
        </View>

        {/* Volume and channel controls */}
        <View style={styles.sideControlsContainer}>
          {/* Volume */}
          <View style={styles.sideControlColumn}>
            {buttonGroups.volume.map((button) => (
              <RemoteButton
                key={button.id}
                button={button}
                onPress={handleCommand}
                disabled={status !== ConnectionStatus.Connected}
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
                disabled={status !== ConnectionStatus.Connected}
                size="medium"
                shape="rounded"
              />
            ))}
          </View>
        </View>

        {/* Playback controls */}
        <View style={styles.buttonRow}>
          {buttonGroups.playback.map((button) => (
            <RemoteButton
              key={button.id}
              button={button}
              onPress={handleCommand}
              disabled={status !== ConnectionStatus.Connected}
              size="medium"
              shape="rounded"
            />
          ))}
        </View>

        {/* Menu buttons */}
        <View style={styles.buttonRow}>
          {buttonGroups.menu.map((button) => (
            <RemoteButton
              key={button.id}
              button={button}
              onPress={handleCommand}
              disabled={status !== ConnectionStatus.Connected}
              size="medium"
              shape="rounded"
            />
          ))}
        </View>

        {/* Number pad */}
        <View style={styles.numpadContainer}>
          {/* Row 1: 1-2-3 */}
          <View style={styles.numpadRow}>
            {buttonGroups.numbers.slice(0, 3).map((button) => (
              <RemoteButton
                key={button.id}
                button={button}
                onPress={handleCommand}
                disabled={status !== ConnectionStatus.Connected}
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
                disabled={status !== ConnectionStatus.Connected}
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
                disabled={status !== ConnectionStatus.Connected}
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
              disabled={status !== ConnectionStatus.Connected}
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
