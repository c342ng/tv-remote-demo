/**
 * Integration tests for US2: Multi-device switching
 * T030: Validates add devices → switch target → send commands flow
 */
import {
  ConnectionStatus,
  RemoteCommandType,
  TVDevice,
  TVPlatform,
} from '@remote/domain/models';
import { DeviceStore } from '@remote/services/device-store';
import { MockPlatformAdapter, MockTVSession } from '@remote/mocks/mock-adapter';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

describe('US2: Multi-device Switch Integration', () => {
  const createDevice = (id: string, name: string, platform: TVPlatform = TVPlatform.Roku): TVDevice => ({
    id,
    name,
    platform,
    ipAddress: `192.168.1.${100 + parseInt(id)}`,
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

  describe('Add and Switch Devices', () => {
    let deviceStore: DeviceStore;

    beforeEach(() => {
      deviceStore = new DeviceStore();
    });

    it('should add multiple devices and switch between them', async () => {
      // Add two devices
      const device1 = createDevice('1', 'Living Room TV');
      const device2 = createDevice('2', 'Bedroom TV');

      await deviceStore.saveDevice(device1);
      await deviceStore.saveDevice(device2);

      const devices = await deviceStore.getDevices();
      expect(devices).toHaveLength(2);

      // Set first device as active
      await deviceStore.setActiveDevice('1');
      let active = await deviceStore.getActiveDevice();
      expect(active?.name).toBe('Living Room TV');

      // Switch to second device
      await deviceStore.setActiveDevice('2');
      active = await deviceStore.getActiveDevice();
      expect(active?.name).toBe('Bedroom TV');
    });

    it('should handle device rename without affecting other devices', async () => {
      const device1 = createDevice('1', 'TV 1');
      const device2 = createDevice('2', 'TV 2');

      await deviceStore.saveDevice(device1);
      await deviceStore.saveDevice(device2);

      await deviceStore.renameDevice('1', 'Living Room');

      const devices = await deviceStore.getDevices();
      expect(devices.find((d) => d.id === '1')?.name).toBe('Living Room');
      expect(devices.find((d) => d.id === '2')?.name).toBe('TV 2');
    });

    it('should remove device and update active if necessary', async () => {
      const device1 = createDevice('1', 'TV 1');
      const device2 = createDevice('2', 'TV 2');

      await deviceStore.saveDevice(device1);
      await deviceStore.saveDevice(device2);
      await deviceStore.setActiveDevice('1');

      // Remove active device
      await deviceStore.removeDevice('1');

      const devices = await deviceStore.getDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].id).toBe('2');

      // Active should fallback to remaining device
      const active = await deviceStore.getActiveDevice();
      expect(active?.id).toBe('2');
    });
  });

  describe('Send Commands to Different Devices', () => {
    it('should send commands to correct device after switch', async () => {
      // Setup adapters for two different devices
      const device1 = createDevice('1', 'Roku Living Room');
      const device2 = createDevice('2', 'Roku Bedroom');

      const adapter1 = new MockPlatformAdapter(TVPlatform.Roku);
      const adapter2 = new MockPlatformAdapter(TVPlatform.Roku);

      // Connect to first device
      const session1 = (await adapter1.connect(device1)) as MockTVSession;
      expect(session1).not.toBeNull();
      expect(adapter1.getStatus()).toBe(ConnectionStatus.Connected);

      // Send command to first device
      await session1.sendCommand(RemoteCommandType.Up);
      await session1.sendCommand(RemoteCommandType.Select);

      // Connect to second device (simulating switch)
      const session2 = (await adapter2.connect(device2)) as MockTVSession;
      expect(session2).not.toBeNull();

      // Send command to second device
      await session2.sendCommand(RemoteCommandType.Down);
      await session2.sendCommand(RemoteCommandType.Back);

      // Verify command logs are separate
      expect(session1.getCommandLog().map((c) => c.command)).toEqual([
        RemoteCommandType.Up,
        RemoteCommandType.Select,
      ]);
      expect(session2.getCommandLog().map((c) => c.command)).toEqual([
        RemoteCommandType.Down,
        RemoteCommandType.Back,
      ]);
    });

    it('should maintain session state when switching back', async () => {
      const device = createDevice('1', 'Test TV');
      const adapter = new MockPlatformAdapter(TVPlatform.Roku);

      // First connection
      const session = (await adapter.connect(device)) as MockTVSession;
      await session.sendCommand(RemoteCommandType.Up);

      // Simulate disconnect
      await session.disconnect();
      expect(session.getStatus()).toBe(ConnectionStatus.Disconnected);

      // Reconnect (new session)
      const newSession = (await adapter.connect(device)) as MockTVSession;
      expect(newSession).not.toBeNull();
      expect(adapter.getStatus()).toBe(ConnectionStatus.Connected);

      // Command should work on new session
      const result = await newSession.sendCommand(RemoteCommandType.Select);
      expect(result.success).toBe(true);
    });
  });

  describe('Cross-Platform Device Management', () => {
    let deviceStore: DeviceStore;

    beforeEach(() => {
      deviceStore = new DeviceStore();
    });

    it('should manage devices of different platforms', async () => {
      const rokuDevice = createDevice('1', 'Roku TV', TVPlatform.Roku);
      const androidDevice = createDevice('2', 'Android TV', TVPlatform.AndroidTV);
      const fireTvDevice = createDevice('3', 'Fire TV', TVPlatform.FireTV);

      await deviceStore.saveDevice(rokuDevice);
      await deviceStore.saveDevice(androidDevice);
      await deviceStore.saveDevice(fireTvDevice);

      const devices = await deviceStore.getDevices();
      expect(devices).toHaveLength(3);

      // Verify platform diversity
      const platforms = devices.map((d) => d.platform);
      expect(platforms).toContain(TVPlatform.Roku);
      expect(platforms).toContain(TVPlatform.AndroidTV);
      expect(platforms).toContain(TVPlatform.FireTV);
    });

    it('should switch between different platform devices', async () => {
      const roku = createDevice('1', 'Roku', TVPlatform.Roku);
      const android = createDevice('2', 'Android', TVPlatform.AndroidTV);

      await deviceStore.saveDevice(roku);
      await deviceStore.saveDevice(android);

      await deviceStore.setActiveDevice('1');
      let active = await deviceStore.getActiveDevice();
      expect(active?.platform).toBe(TVPlatform.Roku);

      await deviceStore.setActiveDevice('2');
      active = await deviceStore.getActiveDevice();
      expect(active?.platform).toBe(TVPlatform.AndroidTV);
    });
  });

  describe('Device Limit Enforcement', () => {
    let deviceStore: DeviceStore;

    beforeEach(() => {
      deviceStore = new DeviceStore();
    });

    it('should enforce 10 device limit', async () => {
      // Add 10 devices
      for (let i = 1; i <= 10; i++) {
        await deviceStore.saveDevice(createDevice(`${i}`, `TV ${i}`));
      }

      expect(await deviceStore.getDeviceCount()).toBe(10);
      expect(await deviceStore.canAddDevice()).toBe(false);

      // Try to add 11th device
      await expect(
        deviceStore.saveDevice(createDevice('11', 'TV 11'))
      ).rejects.toThrow('Maximum device limit');
    });

    it('should allow adding after removing a device', async () => {
      // Add 10 devices
      for (let i = 1; i <= 10; i++) {
        await deviceStore.saveDevice(createDevice(`${i}`, `TV ${i}`));
      }

      // Remove one
      await deviceStore.removeDevice('5');
      expect(await deviceStore.canAddDevice()).toBe(true);

      // Now we can add
      await deviceStore.saveDevice(createDevice('11', 'New TV'));
      expect(await deviceStore.getDeviceCount()).toBe(10);
    });
  });
});
