import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import RemoteControlScreen from '../../../src/remote/screens/RemoteControlScreen';
import { ConnectionStatus } from '../../../src/remote/domain/models';

// Mock dependencies
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
  },
}));

jest.mock('@expo/vector-icons', () => ({
  MaterialIcons: 'MaterialIcons',
}));

// Mock session store
const mockUseSession = jest.fn();
jest.mock('../../../src/remote/services/session-store', () => ({
  useSession: () => mockUseSession(),
  clearSession: jest.fn(),
}));

// Mock device store
jest.mock('../../../src/remote/services/device-store', () => ({
  deviceStore: {
    load: jest.fn(),
    getAllDevices: jest.fn().mockResolvedValue([]),
  },
}));

// Mock components to simplify test
jest.mock('../../../src/remote/components/ConnectionStatusBar', () => ({
  ConnectionStatusBar: () => {
    const { Text } = require('react-native');
    return <Text>ConnectionStatusBar</Text>;
  },
}));
jest.mock('../../../src/remote/components/RemoteTabBar', () => ({
  RemoteTabBar: () => {
    const { Text } = require('react-native');
    return <Text>RemoteTabBar</Text>;
  },
}));
jest.mock('../../../src/remote/components/RemoteButton', () => ({
  RemoteButton: () => {
    const { Text } = require('react-native');
    return <Text>RemoteButton</Text>;
  },
}));
jest.mock('../../../src/remote/components/NumberPad', () => ({
  NumberPad: () => {
    const { Text } = require('react-native');
    return <Text>NumberPad</Text>;
  },
}));

describe('RemoteControlScreen', () => {
  beforeEach(() => {
    mockUseSession.mockReset();
  });

  it('should render empty state when not connected', () => {
    mockUseSession.mockReturnValue({
      device: null,
      session: null,
      status: ConnectionStatus.Disconnected,
    });

    const { getByText, queryByText } = render(<RemoteControlScreen />);

    expect(getByText('未连接设备')).toBeTruthy();
    expect(getByText('去连接')).toBeTruthy();
    expect(queryByText('RemoteTabBar')).toBeNull();
  });

  it('should render remote controls when connected', () => {
    mockUseSession.mockReturnValue({
      device: { id: '1', name: 'Test TV', platform: 'roku' },
      session: { sessionId: '123' },
      status: ConnectionStatus.Connected,
    });

    const { getByText, queryByText } = render(<RemoteControlScreen />);

    expect(queryByText('未连接设备')).toBeNull();
    expect(getByText('RemoteTabBar')).toBeTruthy();
  });
});
