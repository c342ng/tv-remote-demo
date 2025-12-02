/**
 * RemoteButton - Universal remote control button component
 * Provides haptic feedback and visual press states with <100ms response
 * Supports capability-driven visibility and disabled states
 */
import React, { useCallback, useMemo, useRef } from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  GestureResponderEvent,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { RemoteButton as RemoteButtonType, RemoteCommandType, TVCapabilities } from '../domain/models';
import { 
  RemoteButtonWithRules, 
  isButtonVisible, 
  isButtonDisabled 
} from '../domain/default-profile';

export interface RemoteButtonProps {
  /** Button configuration (can be basic or with rules) */
  button: RemoteButtonType | RemoteButtonWithRules;
  /** Callback when button is pressed */
  onPress: (command: RemoteCommandType) => void;
  /** Optional custom style */
  style?: ViewStyle;
  /** Optional custom text style */
  textStyle?: TextStyle;
  /** Whether the button is disabled (overrides capability-based disabled state) */
  disabled?: boolean;
  /** Button size variant */
  size?: 'small' | 'medium' | 'large';
  /** Button shape variant */
  shape?: 'circle' | 'rounded' | 'square';
  /** Current device capabilities for capability-driven visibility/disabled */
  capabilities?: TVCapabilities | null;
  /** Whether the device is connected (affects disabled state) */
  isConnected?: boolean;
}

// Size configurations
const SIZE_CONFIG = {
  small: { width: 48, height: 48, fontSize: 16 },
  medium: { width: 64, height: 64, fontSize: 20 },
  large: { width: 80, height: 80, fontSize: 24 },
};

// Shape configurations
const SHAPE_CONFIG = {
  circle: (size: number) => size / 2,
  rounded: () => 12,
  square: () => 4,
};

/**
 * Check if button has visibility rules
 */
function hasVisibilityRules(button: RemoteButtonType | RemoteButtonWithRules): button is RemoteButtonWithRules {
  return 'visibilityRule' in button;
}

/**
 * RemoteButton component with haptic feedback
 * Supports capability-driven visibility and disabled states
 */
export const RemoteButton: React.FC<RemoteButtonProps> = ({
  button,
  onPress,
  style,
  textStyle,
  disabled = false,
  size = 'medium',
  shape = 'rounded',
  capabilities = null,
  isConnected = true,
}) => {
  const pressStartTime = useRef<number>(0);

  // Determine visibility based on capabilities
  const isVisible = useMemo(() => {
    if (!hasVisibilityRules(button)) {
      return true;
    }
    return isButtonVisible(button, capabilities);
  }, [button, capabilities]);

  // Determine disabled state based on capabilities and connection
  const isDisabledByCapability = useMemo(() => {
    if (!hasVisibilityRules(button)) {
      return false;
    }
    return isButtonDisabled(button, capabilities, isConnected);
  }, [button, capabilities, isConnected]);

  // Final disabled state combines explicit disabled prop and capability-based state
  const finalDisabled = disabled || isDisabledByCapability;

  // Don't render if not visible
  if (!isVisible) {
    return null;
  }

  // Track press start for response time measurement
  const handlePressIn = useCallback((event: GestureResponderEvent) => {
    pressStartTime.current = Date.now();
    
    // Immediate haptic feedback on press start
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  // Handle button press with response time tracking
  const handlePress = useCallback(() => {
    const responseTime = Date.now() - pressStartTime.current;
    
    // Log warning if response exceeds 100ms target
    if (__DEV__ && responseTime > 100) {
      console.warn(`RemoteButton response time: ${responseTime}ms (target: <100ms)`);
    }

    // Execute command callback
    onPress(button.command);

    // Confirmation haptic feedback
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, [button.command, onPress]);

  // Long press handler for repeatable buttons (volume, channel)
  const handleLongPress = useCallback(() => {
    const repeatableCommands = [
      RemoteCommandType.VolumeUp,
      RemoteCommandType.VolumeDown,
      RemoteCommandType.ChannelUp,
      RemoteCommandType.ChannelDown,
      RemoteCommandType.Up,
      RemoteCommandType.Down,
      RemoteCommandType.Left,
      RemoteCommandType.Right,
    ];

    if (repeatableCommands.includes(button.command)) {
      // Stronger haptic for long press
      if (Platform.OS === 'ios') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
      onPress(button.command);
    }
  }, [button.command, onPress]);

  const sizeConfig = SIZE_CONFIG[size];
  const borderRadius = SHAPE_CONFIG[shape](sizeConfig.width);

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onLongPress={handleLongPress}
      delayLongPress={300}
      disabled={finalDisabled}
      style={({ pressed }) => [
        styles.button,
        {
          width: sizeConfig.width,
          height: sizeConfig.height,
          borderRadius,
          opacity: finalDisabled ? 0.4 : 1,
          transform: [{ scale: pressed ? 0.95 : 1 }],
          backgroundColor: pressed ? '#4a4a4a' : '#2a2a2a',
        },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={button.label}
      accessibilityState={{ disabled: finalDisabled }}
    >
      <Text
        style={[
          styles.buttonText,
          { fontSize: sizeConfig.fontSize },
          textStyle,
        ]}
      >
        {button.label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#444',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default RemoteButton;
