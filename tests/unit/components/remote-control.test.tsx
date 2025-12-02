/**
 * Remote Control UI Tests
 * Tests for Tab switching, NumberPad, and RemoteTabBar components
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { RemoteTabBar, RemoteTabType } from '../../../src/remote/components/RemoteTabBar';
import { NumberPad } from '../../../src/remote/components/NumberPad';
import { RemoteCommandType, TVCapabilities } from '../../../src/remote/domain/models';

// Mock expo-router
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
  },
}));

// Mock @expo/vector-icons
jest.mock('@expo/vector-icons', () => ({
  MaterialIcons: 'MaterialIcons',
}));

describe('RemoteTabBar', () => {
  const mockOnTabChange = jest.fn();

  beforeEach(() => {
    mockOnTabChange.mockClear();
  });

  it('should render two tabs', () => {
    const { getByText } = render(
      <RemoteTabBar activeTab="direction" onTabChange={mockOnTabChange} />
    );

    expect(getByText('方向控制')).toBeTruthy();
    expect(getByText('数字键盘')).toBeTruthy();
  });

  it('should show direction tab as active by default', () => {
    const { getByLabelText } = render(
      <RemoteTabBar activeTab="direction" onTabChange={mockOnTabChange} />
    );

    const directionTab = getByLabelText('方向控制');
    expect(directionTab.props.accessibilityState.selected).toBe(true);
  });

  it('should call onTabChange when numbers tab is pressed', () => {
    const { getByText } = render(
      <RemoteTabBar activeTab="direction" onTabChange={mockOnTabChange} />
    );

    fireEvent.press(getByText('数字键盘'));
    expect(mockOnTabChange).toHaveBeenCalledWith('numbers');
  });

  it('should call onTabChange when direction tab is pressed', () => {
    const { getByText } = render(
      <RemoteTabBar activeTab="numbers" onTabChange={mockOnTabChange} />
    );

    fireEvent.press(getByText('方向控制'));
    expect(mockOnTabChange).toHaveBeenCalledWith('direction');
  });

  it('should show numbers tab as active when activeTab is numbers', () => {
    const { getByLabelText } = render(
      <RemoteTabBar activeTab="numbers" onTabChange={mockOnTabChange} />
    );

    const numbersTab = getByLabelText('数字键盘');
    expect(numbersTab.props.accessibilityState.selected).toBe(true);
  });
});

describe('NumberPad', () => {
  const mockOnCommand = jest.fn();
  const mockCapabilities: TVCapabilities = {
    powerControl: true,
    volumeControl: true,
    channelControl: true,
    voiceInput: false,
    keyboard: false,
    apps: false,
  };

  beforeEach(() => {
    mockOnCommand.mockClear();
  });

  it('should render all number buttons (0-9)', () => {
    const { getByText } = render(
      <NumberPad onCommand={mockOnCommand} capabilities={mockCapabilities} isConnected={true} />
    );

    // Check all number buttons are rendered
    for (let i = 0; i <= 9; i++) {
      expect(getByText(i.toString())).toBeTruthy();
    }
  });

  it('should render channel buttons', () => {
    const { getByText } = render(
      <NumberPad onCommand={mockOnCommand} capabilities={mockCapabilities} isConnected={true} />
    );

    expect(getByText('CH+')).toBeTruthy();
    expect(getByText('CH−')).toBeTruthy();
  });

  it('should call onCommand when number button is pressed', () => {
    const { getByText } = render(
      <NumberPad onCommand={mockOnCommand} capabilities={mockCapabilities} isConnected={true} />
    );

    fireEvent.press(getByText('5'));
    expect(mockOnCommand).toHaveBeenCalledWith(RemoteCommandType.Num5);
  });

  it('should call onCommand when channel up is pressed', () => {
    const { getByText } = render(
      <NumberPad onCommand={mockOnCommand} capabilities={mockCapabilities} isConnected={true} />
    );

    fireEvent.press(getByText('CH+'));
    expect(mockOnCommand).toHaveBeenCalledWith(RemoteCommandType.ChannelUp);
  });

  it('should call onCommand when channel down is pressed', () => {
    const { getByText } = render(
      <NumberPad onCommand={mockOnCommand} capabilities={mockCapabilities} isConnected={true} />
    );

    fireEvent.press(getByText('CH−'));
    expect(mockOnCommand).toHaveBeenCalledWith(RemoteCommandType.ChannelDown);
  });

  it('should disable buttons when not connected', () => {
    const { getByText } = render(
      <NumberPad onCommand={mockOnCommand} capabilities={mockCapabilities} isConnected={false} />
    );

    // Try pressing a button when not connected
    fireEvent.press(getByText('1'));
    // When not connected, the button is disabled and onCommand should NOT be called
    expect(mockOnCommand).not.toHaveBeenCalled();
  });
});

describe('Tab Switching Integration', () => {
  it('should maintain tab state correctly', () => {
    let activeTab: RemoteTabType = 'direction';
    const handleTabChange = (tab: RemoteTabType) => {
      activeTab = tab;
    };

    const { rerender, getByText } = render(
      <RemoteTabBar activeTab={activeTab} onTabChange={handleTabChange} />
    );

    // Switch to numbers tab
    fireEvent.press(getByText('数字键盘'));
    expect(activeTab).toBe('numbers');

    // Re-render with updated state
    rerender(<RemoteTabBar activeTab={activeTab} onTabChange={handleTabChange} />);

    // Switch back to direction tab
    fireEvent.press(getByText('方向控制'));
    expect(activeTab).toBe('direction');
  });
});
