/**
 * RemoteTabBar - Tab switching component for remote control
 * Allows switching between direction control and number pad areas
 */
import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

/** Tab types for the remote control */
export type RemoteTabType = 'direction' | 'numbers';

/** Props for RemoteTabBar component */
export interface RemoteTabBarProps {
  /** Currently active tab */
  activeTab: RemoteTabType;
  /** Callback when tab is changed */
  onTabChange: (tab: RemoteTabType) => void;
}

/** Tab configuration */
interface TabConfig {
  id: RemoteTabType;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}

const TABS: TabConfig[] = [
  { id: 'direction', label: '方向控制', icon: 'gamepad' },
  { id: 'numbers', label: '数字键盘', icon: 'dialpad' },
];

/**
 * RemoteTabBar component
 * Provides tab switching between direction control and number pad
 */
export const RemoteTabBar: React.FC<RemoteTabBarProps> = ({ activeTab, onTabChange }) => {
  return (
    <View style={styles.container}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, isActive && styles.activeTab]}
            onPress={() => onTabChange(tab.id)}
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: isActive }}
          >
            <MaterialIcons
              name={tab.icon}
              size={20}
              color={isActive ? '#fff' : '#888'}
              style={styles.tabIcon}
            />
            <Text style={[styles.tabText, isActive && styles.activeTabText]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 16,
    marginVertical: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#3a3a3a',
  },
  tabIcon: {
    marginRight: 6,
  },
  tabText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#fff',
  },
});

export default RemoteTabBar;
