/**
 * Device Store - DeviceManager implementation
 * Provides in-memory state with AsyncStorage persistence
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TVDevice, DeviceManagerState } from '../domain/models';
import { DeviceManager } from '../domain/remote-interfaces';

const STORAGE_KEY = '@tv_remote/devices';
const MAX_DEVICES = 10;
const DEFAULT_PROFILE_ID = 'default';

/**
 * Default device manager state
 */
const createDefaultState = (): DeviceManagerState => ({
  devices: [],
  activeDeviceId: null,
  remoteProfileId: DEFAULT_PROFILE_ID,
});

/**
 * DeviceStore - Implementation of DeviceManager interface
 * Manages device list with AsyncStorage persistence
 */
class DeviceStore implements DeviceManager {
  private state: DeviceManagerState = createDefaultState();
  private initialized = false;

  /**
   * Initialize store by loading from AsyncStorage
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as DeviceManagerState;
        this.state = {
          ...createDefaultState(),
          ...parsed,
        };
      }
      this.initialized = true;
    } catch (error) {
      console.error('[DeviceStore] Failed to load from storage:', error);
      this.state = createDefaultState();
      this.initialized = true;
    }
  }

  /**
   * Load store from AsyncStorage (alias for initialize)
   */
  async load(): Promise<void> {
    return this.initialize();
  }

  /**
   * Persist current state to AsyncStorage
   */
  private async persist(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.error('[DeviceStore] Failed to persist state:', error);
    }
  }

  /**
   * Get all saved devices
   */
  async getDevices(): Promise<TVDevice[]> {
    await this.initialize();
    return [...this.state.devices];
  }

  /**
   * Get the currently active device
   */
  async getActiveDevice(): Promise<TVDevice | null> {
    await this.initialize();
    if (!this.state.activeDeviceId) return null;
    return this.state.devices.find((d) => d.id === this.state.activeDeviceId) || null;
  }

  /**
   * Get all devices (alias for getDevices)
   */
  async getAllDevices(): Promise<TVDevice[]> {
    return this.getDevices();
  }

  /**
   * Get active device ID
   */
  async getActiveDeviceId(): Promise<string | null> {
    await this.initialize();
    return this.state.activeDeviceId;
  }

  /**
   * Set active device by ID
   */
  async setActiveDevice(deviceId: string): Promise<void> {
    await this.initialize();
    const device = this.state.devices.find((d) => d.id === deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }
    this.state.activeDeviceId = deviceId;
    await this.persist();
  }

  /**
   * Add or update a device
   * @throws Error if max devices limit reached when adding new device
   */
  async saveDevice(device: TVDevice): Promise<void> {
    await this.initialize();

    const existingIndex = this.state.devices.findIndex((d) => d.id === device.id);

    if (existingIndex >= 0) {
      // Update existing device
      this.state.devices[existingIndex] = {
        ...this.state.devices[existingIndex],
        ...device,
        lastConnectedAt: new Date().toISOString(),
      };
    } else {
      // Add new device
      if (this.state.devices.length >= MAX_DEVICES) {
        throw new Error(`Maximum device limit (${MAX_DEVICES}) reached`);
      }
      this.state.devices.push({
        ...device,
        lastSeenAt: new Date().toISOString(),
      });
    }

    await this.persist();
  }

  /**
   * Remove a device by ID
   */
  async removeDevice(deviceId: string): Promise<void> {
    await this.initialize();

    const index = this.state.devices.findIndex((d) => d.id === deviceId);
    if (index < 0) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    this.state.devices.splice(index, 1);

    // Clear active device if removed
    if (this.state.activeDeviceId === deviceId) {
      this.state.activeDeviceId = this.state.devices.length > 0 ? this.state.devices[0].id : null;
    }

    await this.persist();
  }

  /**
   * Rename a device
   */
  async renameDevice(deviceId: string, newName: string): Promise<void> {
    await this.initialize();

    const device = this.state.devices.find((d) => d.id === deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    if (!newName.trim()) {
      throw new Error('Device name cannot be empty');
    }

    device.name = newName.trim();
    await this.persist();
  }

  /**
   * Toggle device favorite status
   */
  async toggleFavorite(deviceId: string): Promise<void> {
    await this.initialize();

    const device = this.state.devices.find((d) => d.id === deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    device.isFavorite = !device.isFavorite;
    await this.persist();
  }

  /**
   * Get device count
   */
  async getDeviceCount(): Promise<number> {
    await this.initialize();
    return this.state.devices.length;
  }

  /**
   * Check if can add more devices
   */
  async canAddDevice(): Promise<boolean> {
    await this.initialize();
    return this.state.devices.length < MAX_DEVICES;
  }

  /**
   * Clear all devices (for testing/reset)
   */
  async clearAll(): Promise<void> {
    this.state = createDefaultState();
    await this.persist();
  }
}

// Export singleton instance
export const deviceStore = new DeviceStore();

// Export class for testing
export { DeviceStore };
