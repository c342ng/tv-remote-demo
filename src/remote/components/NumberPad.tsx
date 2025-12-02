/**
 * NumberPad - Number keypad component for remote control
 * Displays 0-9 number buttons in a phone-style 3x4 grid layout
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { RemoteButton } from './RemoteButton';
import { buttonGroups } from '../domain/default-profile';
import { RemoteCommandType, TVCapabilities } from '../domain/models';

/** Props for NumberPad component */
export interface NumberPadProps {
  /** Callback when a number button is pressed */
  onCommand: (command: RemoteCommandType) => void;
  /** Device capabilities for button visibility/disabled states */
  capabilities: TVCapabilities | null;
  /** Whether the device is connected */
  isConnected: boolean;
}

/**
 * NumberPad component
 * Renders a 3x4 grid of number buttons (1-9, 0)
 * Plus channel up/down buttons for quick channel input
 */
export const NumberPad: React.FC<NumberPadProps> = ({ onCommand, capabilities, isConnected }) => {
  const numbers = buttonGroups.numbers;

  return (
    <View style={styles.container}>
      {/* Row 1: 1-2-3 */}
      <View style={styles.row}>
        {numbers.slice(0, 3).map((button) => (
          <RemoteButton
            key={button.id}
            button={button}
            onPress={onCommand}
            capabilities={capabilities}
            isConnected={isConnected}
            size="large"
            shape="rounded"
          />
        ))}
      </View>

      {/* Row 2: 4-5-6 */}
      <View style={styles.row}>
        {numbers.slice(3, 6).map((button) => (
          <RemoteButton
            key={button.id}
            button={button}
            onPress={onCommand}
            capabilities={capabilities}
            isConnected={isConnected}
            size="large"
            shape="rounded"
          />
        ))}
      </View>

      {/* Row 3: 7-8-9 */}
      <View style={styles.row}>
        {numbers.slice(6, 9).map((button) => (
          <RemoteButton
            key={button.id}
            button={button}
            onPress={onCommand}
            capabilities={capabilities}
            isConnected={isConnected}
            size="large"
            shape="rounded"
          />
        ))}
      </View>

      {/* Row 4: Channel Down - 0 - Channel Up */}
      <View style={styles.row}>
        <RemoteButton
          button={buttonGroups.channel[1]} // Channel Down
          onPress={onCommand}
          capabilities={capabilities}
          isConnected={isConnected}
          size="large"
          shape="rounded"
        />
        <RemoteButton
          button={numbers[9]} // 0
          onPress={onCommand}
          capabilities={capabilities}
          isConnected={isConnected}
          size="large"
          shape="rounded"
        />
        <RemoteButton
          button={buttonGroups.channel[0]} // Channel Up
          onPress={onCommand}
          capabilities={capabilities}
          isConnected={isConnected}
          size="large"
          shape="rounded"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginVertical: 8,
  },
});

export default NumberPad;
