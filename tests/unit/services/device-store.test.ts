/**
 * Unit tests for DeviceStore
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceStore } from '@remote/services/device-store';
import { TVDevice, TVPlatform } from '@remote/domain/models';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

describe('DeviceStore', () => {
  let store: DeviceStore;

  const createMockDevice = (id: string, name: string): TVDevice => ({
    id,
    name,
    platform: TVPlatform.Roku,
    ipAddress: '192.168.1.100',
    port: 8060,
    capabilities: {
      powerControl: true,
      volumeControl: true,
      channelControl: false,
      voiceInput: false,
      keyboard: true,
      apps: true,
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    store = new DeviceStore();
  });

  describe('getDevices', () => {
    it('should return empty array when no devices stored', async () => {
      const devices = await store.getDevices();
      expect(devices).toEqual([]);
    });

    it('should load devices from AsyncStorage', async () => {
      const mockDevices = [createMockDevice('1', 'TV 1')];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify({ devices: mockDevices, activeDeviceId: null, remoteProfileId: 'default' })
      );

      store = new DeviceStore();
      const devices = await store.getDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe('TV 1');
    });
  });

  describe('saveDevice', () => {
    it('should add a new device', async () => {
      const device = createMockDevice('1', 'Living Room TV');
      await store.saveDevice(device);

      const devices = await store.getDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe('Living Room TV');
    });

    it('should update existing device', async () => {
      const device = createMockDevice('1', 'Old Name');
      await store.saveDevice(device);

      const updatedDevice = { ...device, name: 'New Name' };
      await store.saveDevice(updatedDevice);

      const devices = await store.getDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe('New Name');
    });

    it('should throw error when max devices reached', async () => {
      // Add 10 devices
      for (let i = 0; i < 10; i++) {
        await store.saveDevice(createMockDevice(`${i}`, `TV ${i}`));
      }

      // Try to add 11th device
      await expect(store.saveDevice(createMockDevice('11', 'TV 11'))).rejects.toThrow(
        'Maximum device limit (10) reached'
      );
    });

    it('should persist to AsyncStorage', async () => {
      const device = createMockDevice('1', 'TV');
      await store.saveDevice(device);

      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('removeDevice', () => {
    it('should remove a device', async () => {
      await store.saveDevice(createMockDevice('1', 'TV 1'));
      await store.saveDevice(createMockDevice('2', 'TV 2'));

      await store.removeDevice('1');

      const devices = await store.getDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].id).toBe('2');
    });

    it('should throw error when device not found', async () => {
      await expect(store.removeDevice('nonexistent')).rejects.toThrow('Device not found');
    });

    it('should clear active device if removed', async () => {
      await store.saveDevice(createMockDevice('1', 'TV 1'));
      await store.setActiveDevice('1');
      await store.removeDevice('1');

      const activeDevice = await store.getActiveDevice();
      expect(activeDevice).toBeNull();
    });
  });

  describe('renameDevice', () => {
    it('should rename a device', async () => {
      await store.saveDevice(createMockDevice('1', 'Old Name'));
      await store.renameDevice('1', 'New Name');

      const devices = await store.getDevices();
      expect(devices[0].name).toBe('New Name');
    });

    it('should throw error when device not found', async () => {
      await expect(store.renameDevice('nonexistent', 'Name')).rejects.toThrow('Device not found');
    });

    it('should throw error when name is empty', async () => {
      await store.saveDevice(createMockDevice('1', 'TV'));
      await expect(store.renameDevice('1', '  ')).rejects.toThrow('Device name cannot be empty');
    });
  });

  describe('setActiveDevice', () => {
    it('should set active device', async () => {
      await store.saveDevice(createMockDevice('1', 'TV 1'));
      await store.setActiveDevice('1');

      const activeDevice = await store.getActiveDevice();
      expect(activeDevice?.id).toBe('1');
    });

    it('should throw error when device not found', async () => {
      await expect(store.setActiveDevice('nonexistent')).rejects.toThrow('Device not found');
    });
  });

  describe('canAddDevice', () => {
    it('should return true when under limit', async () => {
      await store.saveDevice(createMockDevice('1', 'TV'));
      expect(await store.canAddDevice()).toBe(true);
    });

    it('should return false when at limit', async () => {
      for (let i = 0; i < 10; i++) {
        await store.saveDevice(createMockDevice(`${i}`, `TV ${i}`));
      }
      expect(await store.canAddDevice()).toBe(false);
    });
  });
});
