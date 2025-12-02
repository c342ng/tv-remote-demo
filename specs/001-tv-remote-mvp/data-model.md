# Data Model: TV Remote MVP

## Core Entities

### TVDevice
- **id**: string — 唯一标识（组合 IP/平台/协议标识或平台返回的 deviceId）。
- **name**: string — 显示名称（用户可编辑）。
- **platform**: enum — `"android_tv" | "fire_tv" | "lg_webos" | "samsung_tizen" | "roku"`。
- **host**: string — 设备 IP 或 hostname。
- **port**: number | null — 主要控制端口（例如 Android ADB 5555、Tizen 8001/8002 等）。
- **capabilities**: TVCapabilities — 当前设备支持的能力集合。
- **labels**: string[] — 用户自定义标签，例如“客厅”“卧室”。
- **lastSeenAt**: ISO datetime | null — 最近一次在线心跳时间。
- **lastConnectedAt**: ISO datetime | null — 最近一次成功建立会话时间。
- **isFavorite**: boolean — 是否标记为常用设备。

### TVCapabilities
- **supportsPower**: boolean
- **supportsVolume**: boolean
- **supportsMute**: boolean
- **supportsNavigation**: boolean
- **supportsHome**: boolean
- **raw**: Record<string, unknown> — 各平台原生能力描述快照（调试用）。

### ConnectionSession
- **id**: string — 会话 ID。
- **deviceId**: string — 关联的 `TVDevice.id`。
- **status**: enum — `"connecting" | "connected" | "reconnecting" | "disconnected" | "unavailable"`。
- **startedAt**: ISO datetime
- **endedAt**: ISO datetime | null
- **lastHeartbeatAt**: ISO datetime | null
- **networkInfo**: {
  - **ssid**: string | null
  - **localIp**: string | null
  - **rssi**: number | null
  }
- **lastError**: SessionError | null

### SessionError
- **code**: enum — `"NETWORK_UNREACHABLE" | "AUTH_FAILED" | "COMMAND_UNSUPPORTED" | "TIMEOUT" | "UNKNOWN"`。
- **message**: string — 面向开发/日志的错误描述。
- **at**: ISO datetime

### RemoteProfile
- **id**: string — 例如 `"default"`。
- **displayName**: string — 例如“标准遥控布局”。
- **buttons**: RemoteButton[] — 按钮定义列表。

### RemoteButton
- **id**: string — 唯一标识，如 `"up"`, `"ok"`, `"back"`。
- **label**: string — UI 文本标签。
- **iconName**: string — 图标名称（与设计系统对齐）。
- **command**: RemoteCommandType — 规范化命令。
- **visibilityRule**: {
  - **requiresCapability**: keyof TVCapabilities | null
  }

### RemoteCommandType (enum)
- `"UP" | "DOWN" | "LEFT" | "RIGHT" | "OK" | "BACK" | "HOME" | "VOLUME_UP" | "VOLUME_DOWN" | "MUTE" | "POWER"`

### DeviceManagerState
- **devices**: TVDevice[]
- **activeDeviceId**: string | null
- **remoteProfileId**: string — 当前使用的 `RemoteProfile`。

### LogEvent
- **id**: string
- **timestamp**: ISO datetime
- **level**: enum — `"info" | "warn" | "error"`。
- **type**: enum — `"connection" | "command" | "discovery" | "system"`。
- **deviceId**: string | null
- **sessionId**: string | null
- **payload**: Record<string, unknown> — 不含敏感个人信息。

## Relationships

- 一个 `DeviceManagerState` 维护多个 `TVDevice`，始终只有一个 `activeDeviceId`（或 null）。
- 每个 `ConnectionSession` 绑定到一个 `TVDevice`，一个设备在同一时间一般只有一个活跃会话。
- `RemoteProfile` 与设备平台解耦，通过 `RemoteCommandType` + `TVCapabilities` 决定 UI 按钮的可见性与可用性。
- `LogEvent` 可关联到特定的 `deviceId` 与 `sessionId`，用于审计和问题排查。
