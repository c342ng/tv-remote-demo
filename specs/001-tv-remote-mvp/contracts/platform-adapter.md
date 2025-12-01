# API Contract: Platform Adapter Interface

**Created**: 2025-12-01  
**Purpose**: 定义 UI 层与 Domain 层之间的统一接口契约，实现跨平台遥控抽象

---

## 1. 接口概览

所有平台适配器（AndroidTvAdapter、AmazonFireTvAdapter、LgWebOsAdapter、SamsungTizenAdapter、RokuAdapter）MUST 实现 `IPlatformAdapter` 接口，确保上层代码无需感知具体平台差异。

---

## 2. IPlatformAdapter 接口定义

```typescript
import { TVDevice, ConnectionSession, DeviceStatus, RemoteKey } from '../models';

export interface IPlatformAdapter {
  /**
   * 发现局域网内可用设备
   * @returns Promise<TVDevice[]> 发现的设备列表
   * @throws {DiscoveryError} 当网络扫描失败时抛出
   */
  discover(): Promise<TVDevice[]>;

  /**
   * 连接到指定设备并建立会话
   * @param device 目标设备
   * @returns Promise<ConnectionSession> 成功建立的连接会话
   * @throws {ConnectionError} 当连接失败（超时/拒绝/授权失败）时抛出
   */
  connect(device: TVDevice): Promise<ConnectionSession>;

  /**
   * 断开与设备的连接
   * @param session 要断开的会话
   * @returns Promise<void>
   * @throws {DisconnectionError} 当断开过程发生错误时抛出
   */
  disconnect(session: ConnectionSession): Promise<void>;

  /**
   * 发送遥控按键指令
   * @param session 当前活跃会话
   * @param key 规范化遥控按键枚举
   * @returns Promise<void>
   * @throws {CommandError} 当指令发送失败或超时时抛出
   */
  sendKey(session: ConnectionSession, key: RemoteKey): Promise<void>;

  /**
   * 查询设备当前状态
   * @param session 当前活跃会话
   * @returns Promise<DeviceStatus> 设备在线/离线/未知状态
   * @throws {StatusQueryError} 当查询失败时抛出
   */
  getStatus(session: ConnectionSession): Promise<DeviceStatus>;

  /**
   * 获取设备能力描述
   * @param device 目标设备
   * @returns Promise<DeviceCapabilities> 设备支持的功能集合
   */
  getCapabilities(device: TVDevice): Promise<DeviceCapabilities>;
}
```

---

## 3. 核心类型定义

### 3.1 RemoteKey 枚举

```typescript
export enum RemoteKey {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  OK = 'OK',
  BACK = 'BACK',
  HOME = 'HOME',
  VOLUME_UP = 'VOLUME_UP',
  VOLUME_DOWN = 'VOLUME_DOWN',
  MUTE = 'MUTE',
  POWER = 'POWER',
}
```

### 3.2 DeviceCapabilities 接口

```typescript
export interface DeviceCapabilities {
  supportsPower: boolean;
  supportsVolumeControl: boolean;
  supportsTextInput: boolean;
  supportedKeys: RemoteKey[];
}
```

### 3.3 错误类型

```typescript
export class DiscoveryError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'DiscoveryError';
  }
}

export class ConnectionError extends Error {
  constructor(
    message: string,
    public code: 'TIMEOUT' | 'REFUSED' | 'AUTH_FAILED' | 'NETWORK_ERROR',
    public cause?: Error
  ) {
    super(message);
    this.name = 'ConnectionError';
  }
}

export class CommandError extends Error {
  constructor(
    message: string,
    public code: 'TIMEOUT' | 'NOT_SUPPORTED' | 'SESSION_INVALID',
    public cause?: Error
  ) {
    super(message);
    this.name = 'CommandError';
  }
}

export class DisconnectionError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'DisconnectionError';
  }
}

export class StatusQueryError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'StatusQueryError';
  }
}
```

---

## 4. 接口行为契约

### 4.1 discover()

**前置条件**:
- 设备与电视在同一局域网内
- 目标平台设备已开启可发现模式（部分平台需手动启用）

**后置条件**:
- 返回发现的设备列表（可为空数组）
- 如网络扫描失败，抛出 `DiscoveryError`

**性能要求**:
- 扫描时间 SHOULD < 5 秒
- 支持增量发现（可选，优先级 P2）

**示例**:
```typescript
const adapter = new AndroidTvAdapter();
try {
  const devices = await adapter.discover();
  console.log(`发现 ${devices.length} 台 Android TV`);
} catch (error) {
  if (error instanceof DiscoveryError) {
    console.error('设备发现失败:', error.message);
  }
}
```

---

### 4.2 connect(device)

**前置条件**:
- `device` 对象有效且包含必要的连接信息（IP、端口等）
- 目标设备在线且可达

**后置条件**:
- 返回已建立的 `ConnectionSession`，状态为 `CONNECTED`
- 如连接失败（超时/拒绝/授权失败），抛出 `ConnectionError`

**性能要求**:
- 连接建立时间 SHOULD < 3 秒
- 超时时间 MUST 在 5 秒内（可配置）

**授权流程**:
- Android TV / Fire TV: 需用户在电视上接受 ADB 授权
- webOS / Tizen: 需用户输入电视显示的配对码
- Roku: 无需额外授权

**示例**:
```typescript
const device: TVDevice = { /* ... */ };
try {
  const session = await adapter.connect(device);
  console.log('连接成功，会话 ID:', session.sessionId);
} catch (error) {
  if (error instanceof ConnectionError) {
    console.error('连接失败:', error.message, '错误码:', error.code);
  }
}
```

---

### 4.3 disconnect(session)

**前置条件**:
- `session` 有效且状态为 `CONNECTED` 或 `ERROR`

**后置条件**:
- 会话状态变更为 `DISCONNECTED`
- 底层网络资源（WebSocket/TCP 连接）已释放

**性能要求**:
- 断开操作 SHOULD < 1 秒

**示例**:
```typescript
await adapter.disconnect(session);
console.log('已断开连接');
```

---

### 4.4 sendKey(session, key)

**前置条件**:
- `session` 状态为 `CONNECTED`
- `key` 为 `RemoteKey` 枚举中的有效值

**后置条件**:
- 指令已发送到目标设备（不保证电视端执行成功，取决于平台能力）
- 如发送失败（超时/会话无效/不支持该按键），抛出 `CommandError`

**性能要求**:
- 指令发送 SHOULD < 200ms（端到端延迟，包括网络往返）
- 本地 UI 反馈 MUST < 100ms（按钮高亮/loading 等）

**幂等性**:
- 重复发送同一按键 SHOULD 产生相同效果（导航连续移动除外）

**示例**:
```typescript
try {
  await adapter.sendKey(session, RemoteKey.UP);
  console.log('已发送 UP 指令');
} catch (error) {
  if (error instanceof CommandError && error.code === 'NOT_SUPPORTED') {
    console.warn('该设备不支持 UP 按键');
  }
}
```

---

### 4.5 getStatus(session)

**前置条件**:
- `session` 有效

**后置条件**:
- 返回设备当前状态（`ONLINE` / `OFFLINE` / `UNKNOWN`）
- 如查询失败，抛出 `StatusQueryError`

**性能要求**:
- 状态查询 SHOULD < 1 秒

**示例**:
```typescript
const status = await adapter.getStatus(session);
if (status === DeviceStatus.OFFLINE) {
  console.warn('设备已离线');
}
```

---

### 4.6 getCapabilities(device)

**前置条件**:
- `device` 对象有效

**后置条件**:
- 返回设备能力描述（支持的按键集合、功能开关等）

**性能要求**:
- 能力查询 SHOULD < 500ms

**示例**:
```typescript
const capabilities = await adapter.getCapabilities(device);
if (!capabilities.supportsPower) {
  console.log('该设备不支持电源控制');
}
```

---

## 5. Mock 适配器契约

`MockAdapter` MUST 实现完整的 `IPlatformAdapter` 接口，并满足以下额外契约：

- `discover()` 返回预定义的虚拟设备列表（包含 5 大平台各 1 台）
- `connect(device)` 模拟 100-200ms 延迟后返回成功会话
- `sendKey(session, key)` 模拟 50-100ms 延迟后成功返回
- 所有错误场景可通过环境变量或内部配置触发（如 `MOCK_SIMULATE_CONNECTION_ERROR=1`）

**示例环境变量**:
```
TV_REMOTE_USE_MOCK=1          # 启用 Mock 模式
MOCK_SIMULATE_TIMEOUT=1       # 模拟连接超时
MOCK_DISCOVER_DEVICES_COUNT=3 # 模拟发现 3 台设备
```

---

## 6. 接口版本与兼容性

- **当前版本**: `v1.0.0`
- **兼容性承诺**: 
  - 接口签名变更视为 MAJOR 版本升级
  - 新增可选方法视为 MINOR 版本升级
  - 错误类型新增字段视为 PATCH 版本升级

---

## 7. 测试建议

### 单元测试
- 每个适配器 MUST 有对应的单元测试套件
- 覆盖所有接口方法的成功路径与失败路径
- 使用 Jest mock 模拟网络 I/O

### 集成测试
- 使用 `MockAdapter` 验证完整流程：discover → connect → sendKey → disconnect
- 验证错误处理与超时重试逻辑

### 契约测试
- 使用统一的契约测试套件验证所有适配器实现一致性
- 确保所有适配器在相同输入下产生相同结构的输出

---

**契约版本**: 1.0.0  
**下一步**: 基于此契约实现各平台适配器与 Mock 实现
