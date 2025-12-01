# Data Model: TV Remote MVP Multi-Platform Control

**Created**: 2025-12-01  
**Phase**: 1 - Design & Contracts  
**Purpose**: 定义核心实体与关系，支撑多设备管理、连接会话与遥控抽象层

---

## 1. 核心实体概览

本应用的核心数据模型围绕三个关键实体展开：
- **TVDevice**：代表一台可被控制的电视设备
- **ConnectionSession**：代表与某台电视的一次连接会话
- **RemoteProfile**：代表统一虚拟遥控器的按键布局与映射配置

---

## 2. TVDevice（电视设备）

### 定义
`TVDevice` 是用户可管理的电视设备抽象，包含设备标识、平台类型、连接信息与用户自定义属性。

### 属性

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `string` | ✅ | 设备唯一标识符（UUID v4 或平台提供的设备 ID） |
| `name` | `string` | ✅ | 设备显示名称，用户可编辑（默认为品牌 + 型号） |
| `platform` | `TVPlatform` | ✅ | 平台类型枚举：`ANDROID_TV` / `FIRE_TV` / `WEBOS` / `TIZEN` / `ROKU` |
| `ipAddress` | `string` | ✅ | 设备 IP 地址（用于网络连接） |
| `port` | `number` | ❌ | 可选端口（如 ADB 端口 5555，webOS/Tizen WebSocket 端口等） |
| `label` | `string` | ❌ | 用户自定义标签（如"客厅电视"、"卧室电视"） |
| `lastConnectedAt` | `Date` | ❌ | 最近一次连接时间 |
| `lastOnlineStatus` | `DeviceStatus` | ❌ | 最近已知状态：`ONLINE` / `OFFLINE` / `UNKNOWN` |
| `pairingToken` | `string` | ❌ | 配对令牌（webOS/Tizen 需要，应加密存储） |
| `capabilities` | `DeviceCapabilities` | ❌ | 设备能力描述（支持的按键集合、是否支持电源控制等） |

### 枚举与接口

```typescript
export enum TVPlatform {
  ANDROID_TV = 'ANDROID_TV',
  FIRE_TV = 'FIRE_TV',
  WEBOS = 'WEBOS',
  TIZEN = 'TIZEN',
  ROKU = 'ROKU',
}

export enum DeviceStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  UNKNOWN = 'UNKNOWN',
}

export interface DeviceCapabilities {
  supportsPower: boolean;
  supportsVolumeControl: boolean;
  supportsTextInput: boolean;
  supportedKeys: RemoteKey[];
}
```

### 约束与验证
- `id` MUST 在应用内唯一（由系统生成 UUID v4 或使用平台提供的唯一标识）
- `name` MUST NOT 为空字符串
- `ipAddress` MUST 符合 IPv4 或 IPv6 格式（可使用正则或库验证）
- `platform` MUST 为 `TVPlatform` 枚举值之一

### 持久化
- 使用 AsyncStorage 存储为 JSON 数组：`AsyncStorage.setItem('tv_devices', JSON.stringify(devices))`
- 敏感字段 `pairingToken` 应使用 Expo SecureStore 单独存储（可选优化）

---

## 3. ConnectionSession（连接会话）

### 定义
`ConnectionSession` 代表应用与某台电视之间的一次活跃网络连接，包含连接状态、时间戳与错误信息。

### 属性

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sessionId` | `string` | ✅ | 会话唯一标识符（UUID v4） |
| `device` | `TVDevice` | ✅ | 关联的目标设备（引用或嵌入） |
| `status` | `ConnectionStatus` | ✅ | 连接状态枚举：`CONNECTING` / `CONNECTED` / `DISCONNECTED` / `ERROR` |
| `startedAt` | `Date` | ✅ | 会话开始时间 |
| `endedAt` | `Date` | ❌ | 会话结束时间（仅在断开时填充） |
| `errorCode` | `string` | ❌ | 错误码（如连接失败、超时、授权失败等） |
| `errorMessage` | `string` | ❌ | 用户友好的错误描述 |
| `networkInfo` | `NetworkInfo` | ❌ | 网络环境摘要（SSID、信号强度等，用于调试） |

### 枚举与接口

```typescript
export enum ConnectionStatus {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  ERROR = 'ERROR',
}

export interface NetworkInfo {
  ssid?: string;
  signalStrength?: number; // 0-100
  latency?: number; // ms
}
```

### 生命周期
1. **创建**：调用 `connect(device)` 时创建新会话，状态为 `CONNECTING`
2. **成功连接**：状态变更为 `CONNECTED`，记录 `startedAt`
3. **断开连接**：状态变更为 `DISCONNECTED`，记录 `endedAt`
4. **错误**：任何阶段失败时状态变更为 `ERROR`，填充 `errorCode` 和 `errorMessage`

### 约束与验证
- 同一时间应用 SHOULD 只维护一个 `CONNECTED` 状态的会话（单设备控制模式）
- 会话 MUST 在断开或错误时清理底层网络资源（WebSocket/TCP 连接）

---

## 4. RemoteProfile（遥控器配置）

### 定义
`RemoteProfile` 定义了虚拟遥控器的布局、按键集合以及跨平台按键映射规则，用于实现统一 UI 下的多平台适配。

### 属性

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `profileId` | `string` | ✅ | 配置 ID（如 `'default'`、`'minimal'`） |
| `displayName` | `string` | ✅ | 配置显示名称（如"标准遥控器"、"精简模式"） |
| `visibleKeys` | `RemoteKey[]` | ✅ | 在 UI 中可见的按键列表 |
| `platformMappings` | `Record<TVPlatform, KeyMapping>` | ✅ | 各平台的按键映射规则 |

### 枚举与接口

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

export interface KeyMapping {
  [key: RemoteKey]: {
    platformCode: string; // 平台特定的按键代码
    supported: boolean;    // 是否支持该按键
  };
}
```

### 示例配置

```typescript
const defaultProfile: RemoteProfile = {
  profileId: 'default',
  displayName: '标准遥控器',
  visibleKeys: [
    RemoteKey.UP, RemoteKey.DOWN, RemoteKey.LEFT, RemoteKey.RIGHT,
    RemoteKey.OK, RemoteKey.BACK, RemoteKey.HOME,
    RemoteKey.VOLUME_UP, RemoteKey.VOLUME_DOWN, RemoteKey.MUTE,
    RemoteKey.POWER,
  ],
  platformMappings: {
    ANDROID_TV: {
      [RemoteKey.UP]: { platformCode: 'KEYCODE_DPAD_UP', supported: true },
      [RemoteKey.OK]: { platformCode: 'KEYCODE_DPAD_CENTER', supported: true },
      // ...
    },
    WEBOS: {
      [RemoteKey.UP]: { platformCode: 'UP', supported: true },
      [RemoteKey.OK]: { platformCode: 'ENTER', supported: true },
      // ...
    },
    // ... 其他平台
  },
};
```

### 约束与验证
- `visibleKeys` MUST NOT 为空数组
- `platformMappings` MUST 覆盖所有 `TVPlatform` 枚举值
- 当某个平台不支持某按键时，`supported` 应为 `false`，UI 可据此灰显或隐藏按钮

---

## 5. 实体关系

```
┌─────────────┐       1      ┌────────────────────┐
│  TVDevice   │◄─────────────│ ConnectionSession  │
└─────────────┘              └────────────────────┘
      │                               │
      │ 1..n                          │
      │                               │
      ▼                               ▼
┌─────────────┐              ┌────────────────────┐
│ DeviceList  │              │  SessionManager    │
│ (UI State)  │              │  (Service Layer)   │
└─────────────┘              └────────────────────┘
                                      │
                                      │ uses
                                      ▼
                             ┌────────────────────┐
                             │  RemoteProfile     │
                             └────────────────────┘
```

- **TVDevice** 是独立实体，可被多个 `ConnectionSession` 历史记录引用
- **ConnectionSession** 在运行时由 `SessionManager` 管理，仅保留当前活跃会话
- **RemoteProfile** 是静态配置，在应用启动时加载并缓存，供所有会话共享

---

## 6. 数据流示例

### 6.1 用户添加新设备
1. 用户在 `DeviceListScreen` 点击"添加设备"
2. 应用触发设备发现（或手动输入 IP）
3. 用户选择一台设备，系统创建新 `TVDevice` 实例
4. 如需配对（webOS/Tizen），引导用户完成配对流程并保存 `pairingToken`
5. 将 `TVDevice` 添加到 `deviceStorage`，持久化到 AsyncStorage

### 6.2 用户连接并控制设备
1. 用户在列表中选择一台 `TVDevice`，点击"连接"
2. `SessionManager` 创建新 `ConnectionSession`，状态为 `CONNECTING`
3. 根据 `device.platform` 创建对应 `PlatformAdapter`，调用 `adapter.connect(device)`
4. 连接成功后，会话状态变更为 `CONNECTED`
5. 用户在 `RemoteControlScreen` 点击方向键
6. UI 调用 `sessionManager.sendKey(session, RemoteKey.UP)`
7. `SessionManager` 通过 `PlatformAdapter` 发送平台特定指令
8. 电视响应，UI 显示反馈

### 6.3 设备离线处理
1. 后台定期或在发送指令时检测设备连接状态
2. 如检测到超时或网络错误，更新 `session.status` 为 `ERROR`
3. 同时更新 `device.lastOnlineStatus` 为 `OFFLINE`
4. UI 显示"设备离线"提示，并提供"重新连接"按钮

---

## 7. 数据验证与安全性

### 验证规则
- 所有用户输入的 IP 地址 MUST 经过格式校验
- 设备名称 MUST 限制长度（例如 1-50 字符），禁止特殊字符（如换行符）
- 配对令牌 MUST 不在日志中明文输出

### 安全性
- 配对令牌建议使用 Expo SecureStore 加密存储（优先级 P2）
- 网络通信 SHOULD 使用 TLS（webOS/Tizen WebSocket 可升级到 WSS）
- 日志中禁止记录敏感信息（IP 地址脱敏，令牌完全隐藏）

---

## 8. 未来扩展考虑

- **设备分组**：支持将设备分组（如"客厅"、"卧室"），增加 `groupId` 字段
- **历史记录**：记录用户最近发送的指令，用于快捷操作或统计分析
- **云同步**：将设备列表同步到云端，支持多手机共享配置（需引入用户账号体系）
- **固件版本**：记录电视固件版本，用于兼容性诊断

---

**数据模型版本**: 1.0.0  
**下一步**: 基于此数据模型生成 API 契约（contracts/）与 Quickstart 开发指南
