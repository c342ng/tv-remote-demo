# Data Model: TV Remote MVP Multi-Platform Control (iOS Swift)

**Created**: 2025-12-02  
**Phase**: 1 - Design & Contracts  
**Purpose**: 定义核心实体与关系，支撑多设备管理（最多10台）、连接会话与遥控抽象层，使用 iOS Keychain 安全存储

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
| `id` | `UUID` | ✅ | 设备唯一标识符（UUID v4 或平台提供的设备 ID） |
| `name` | `String` | ✅ | 设备显示名称，用户可编辑（默认为品牌 + 型号） |
| `platform` | `TVPlatform` | ✅ | 平台类型枚举 |
| `ipAddress` | `String` | ✅ | 设备 IP 地址（用于网络连接） |
| `port` | `Int?` | ❌ | 可选端口（如 ADB 端口 5555，webOS/Tizen WebSocket 端口等） |
| `label` | `String?` | ❌ | 用户自定义标签（如"客厅电视"、"卧室电视"） |
| `lastConnectedAt` | `Date?` | ❌ | 最近一次连接时间 |
| `lastOnlineStatus` | `DeviceStatus` | ❌ | 最近已知状态 |
| `capabilities` | `DeviceCapabilities?` | ❌ | 设备能力描述（支持的按键集合、是否支持电源控制等） |

### Swift 定义

```swift
import Foundation

// MARK: - TVDevice

struct TVDevice: Identifiable, Codable, Equatable {
    let id: UUID
    var name: String
    let platform: TVPlatform
    let ipAddress: String
    var port: Int?
    var label: String?
    var lastConnectedAt: Date?
    var lastOnlineStatus: DeviceStatus
    var capabilities: DeviceCapabilities?
    
    init(
        id: UUID = UUID(),
        name: String,
        platform: TVPlatform,
        ipAddress: String,
        port: Int? = nil,
        label: String? = nil,
        lastConnectedAt: Date? = nil,
        lastOnlineStatus: DeviceStatus = .unknown,
        capabilities: DeviceCapabilities? = nil
    ) {
        self.id = id
        self.name = name
        self.platform = platform
        self.ipAddress = ipAddress
        self.port = port
        self.label = label
        self.lastConnectedAt = lastConnectedAt
        self.lastOnlineStatus = lastOnlineStatus
        self.capabilities = capabilities
    }
}

// MARK: - TVPlatform

enum TVPlatform: String, Codable, CaseIterable {
    case androidTV = "ANDROID_TV"
    case fireTV = "FIRE_TV"
    case webOS = "WEBOS"
    case tizen = "TIZEN"
    case roku = "ROKU"
    
    var displayName: String {
        switch self {
        case .androidTV: return "Android TV"
        case .fireTV: return "Amazon Fire TV"
        case .webOS: return "LG webOS"
        case .tizen: return "Samsung Tizen"
        case .roku: return "Roku"
        }
    }
    
    /// 最低支持版本
    var minimumVersion: String {
        switch self {
        case .androidTV: return "10+"
        case .fireTV: return "Fire OS 7+"
        case .webOS: return "4.0+"
        case .tizen: return "4.0+"
        case .roku: return "Roku OS 10+"
        }
    }
    
    /// 默认端口
    var defaultPort: Int {
        switch self {
        case .androidTV, .fireTV: return 5555 // ADB
        case .webOS: return 3000 // WebSocket (3001 for WSS)
        case .tizen: return 8001 // WebSocket (8002 for WSS)
        case .roku: return 8060 // HTTP ECP
        }
    }
}

// MARK: - DeviceStatus

enum DeviceStatus: String, Codable {
    case online = "ONLINE"
    case offline = "OFFLINE"
    case unknown = "UNKNOWN"
}

// MARK: - DeviceCapabilities

struct DeviceCapabilities: Codable, Equatable {
    var supportsPower: Bool
    var supportsVolumeControl: Bool
    var supportsTextInput: Bool
    var supportedKeys: [RemoteKey]
    
    init(
        supportsPower: Bool = true,
        supportsVolumeControl: Bool = true,
        supportsTextInput: Bool = false,
        supportedKeys: [RemoteKey] = RemoteKey.allCases
    ) {
        self.supportsPower = supportsPower
        self.supportsVolumeControl = supportsVolumeControl
        self.supportsTextInput = supportsTextInput
        self.supportedKeys = supportedKeys
    }
}
```

### 约束与验证
- `id` MUST 在应用内唯一（由系统生成 UUID v4）
- `name` MUST NOT 为空字符串，长度限制 1-50 字符
- `ipAddress` MUST 符合 IPv4 或 IPv6 格式
- `platform` MUST 为 `TVPlatform` 枚举值之一
- **最多管理 10 台设备**（达到上限时需先删除现有设备）

### 持久化
- 设备列表使用 `UserDefaults` 或 `CoreData` 存储
- **配对令牌（pairingToken）单独存储在 iOS Keychain**，不包含在 `TVDevice` 结构中

---

## 3. ConnectionSession（连接会话）

### 定义
`ConnectionSession` 代表应用与某台电视之间的一次活跃网络连接，包含连接状态、时间戳与错误信息。

### 属性

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sessionId` | `UUID` | ✅ | 会话唯一标识符 |
| `device` | `TVDevice` | ✅ | 关联的目标设备 |
| `status` | `ConnectionStatus` | ✅ | 连接状态枚举 |
| `startedAt` | `Date` | ✅ | 会话开始时间 |
| `endedAt` | `Date?` | ❌ | 会话结束时间（仅在断开时填充） |
| `errorCode` | `String?` | ❌ | 错误码 |
| `errorMessage` | `String?` | ❌ | 用户友好的错误描述 |
| `networkInfo` | `NetworkInfo?` | ❌ | 网络环境摘要（用于调试） |

### Swift 定义

```swift
import Foundation

// MARK: - ConnectionSession

struct ConnectionSession: Identifiable, Equatable {
    let sessionId: UUID
    let device: TVDevice
    var status: ConnectionStatus
    let startedAt: Date
    var endedAt: Date?
    var errorCode: String?
    var errorMessage: String?
    var networkInfo: NetworkInfo?
    
    var id: UUID { sessionId }
    
    init(
        sessionId: UUID = UUID(),
        device: TVDevice,
        status: ConnectionStatus = .connecting,
        startedAt: Date = Date(),
        endedAt: Date? = nil,
        errorCode: String? = nil,
        errorMessage: String? = nil,
        networkInfo: NetworkInfo? = nil
    ) {
        self.sessionId = sessionId
        self.device = device
        self.status = status
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.errorCode = errorCode
        self.errorMessage = errorMessage
        self.networkInfo = networkInfo
    }
    
    /// 标记为已连接
    mutating func markConnected() {
        status = .connected
    }
    
    /// 标记为已断开
    mutating func markDisconnected() {
        status = .disconnected
        endedAt = Date()
    }
    
    /// 标记为错误
    mutating func markError(code: String, message: String) {
        status = .error
        errorCode = code
        errorMessage = message
        endedAt = Date()
    }
}

// MARK: - ConnectionStatus

enum ConnectionStatus: String, Codable {
    case connecting = "CONNECTING"
    case connected = "CONNECTED"
    case disconnected = "DISCONNECTED"
    case reconnecting = "RECONNECTING"
    case error = "ERROR"
    
    var displayName: String {
        switch self {
        case .connecting: return "连接中..."
        case .connected: return "已连接"
        case .disconnected: return "已断开"
        case .reconnecting: return "重连中..."
        case .error: return "连接错误"
        }
    }
}

// MARK: - NetworkInfo

struct NetworkInfo: Codable, Equatable {
    var ssid: String?
    var signalStrength: Int? // 0-100
    var latency: Int? // ms
}
```

### 生命周期
1. **创建**：调用 `connect(device)` 时创建新会话，状态为 `connecting`
2. **成功连接**：状态变更为 `connected`
3. **断开连接**：状态变更为 `disconnected`，记录 `endedAt`
4. **重连中**：状态变更为 `reconnecting`（最多 3 次，间隔 2s→4s→8s）
5. **错误**：任何阶段失败时状态变更为 `error`，填充 `errorCode` 和 `errorMessage`

### 约束与验证
- 同一时间应用 SHOULD 只维护一个 `connected` 状态的会话（单设备控制模式）
- 会话 MUST 在断开或错误时清理底层网络资源

---

## 4. RemoteProfile（遥控器配置）

### 定义
`RemoteProfile` 定义了虚拟遥控器的布局、按键集合以及跨平台按键映射规则。

### Swift 定义

```swift
import Foundation

// MARK: - RemoteKey

enum RemoteKey: String, Codable, CaseIterable {
    case up = "UP"
    case down = "DOWN"
    case left = "LEFT"
    case right = "RIGHT"
    case ok = "OK"
    case back = "BACK"
    case home = "HOME"
    case volumeUp = "VOLUME_UP"
    case volumeDown = "VOLUME_DOWN"
    case mute = "MUTE"
    case power = "POWER"
    
    var displayName: String {
        switch self {
        case .up: return "▲"
        case .down: return "▼"
        case .left: return "◀"
        case .right: return "▶"
        case .ok: return "OK"
        case .back: return "返回"
        case .home: return "主页"
        case .volumeUp: return "音量+"
        case .volumeDown: return "音量-"
        case .mute: return "静音"
        case .power: return "电源"
        }
    }
}

// MARK: - KeyMapping

struct KeyMapping: Codable {
    let platformCode: String
    let supported: Bool
    
    init(platformCode: String, supported: Bool = true) {
        self.platformCode = platformCode
        self.supported = supported
    }
}

// MARK: - RemoteProfile

struct RemoteProfile: Identifiable, Codable {
    let profileId: String
    let displayName: String
    let visibleKeys: [RemoteKey]
    let platformMappings: [TVPlatform: [RemoteKey: KeyMapping]]
    
    var id: String { profileId }
    
    /// 获取指定平台和按键的映射
    func mapping(for key: RemoteKey, platform: TVPlatform) -> KeyMapping? {
        platformMappings[platform]?[key]
    }
    
    /// 检查指定平台是否支持某按键
    func isSupported(key: RemoteKey, platform: TVPlatform) -> Bool {
        mapping(for: key, platform: platform)?.supported ?? false
    }
}

// MARK: - Default Profile

extension RemoteProfile {
    static let `default` = RemoteProfile(
        profileId: "default",
        displayName: "标准遥控器",
        visibleKeys: RemoteKey.allCases,
        platformMappings: [
            .androidTV: [
                .up: KeyMapping(platformCode: "KEYCODE_DPAD_UP"),
                .down: KeyMapping(platformCode: "KEYCODE_DPAD_DOWN"),
                .left: KeyMapping(platformCode: "KEYCODE_DPAD_LEFT"),
                .right: KeyMapping(platformCode: "KEYCODE_DPAD_RIGHT"),
                .ok: KeyMapping(platformCode: "KEYCODE_DPAD_CENTER"),
                .back: KeyMapping(platformCode: "KEYCODE_BACK"),
                .home: KeyMapping(platformCode: "KEYCODE_HOME"),
                .volumeUp: KeyMapping(platformCode: "KEYCODE_VOLUME_UP"),
                .volumeDown: KeyMapping(platformCode: "KEYCODE_VOLUME_DOWN"),
                .mute: KeyMapping(platformCode: "KEYCODE_VOLUME_MUTE"),
                .power: KeyMapping(platformCode: "KEYCODE_POWER", supported: true)
            ],
            .fireTV: [
                .up: KeyMapping(platformCode: "KEYCODE_DPAD_UP"),
                .down: KeyMapping(platformCode: "KEYCODE_DPAD_DOWN"),
                .left: KeyMapping(platformCode: "KEYCODE_DPAD_LEFT"),
                .right: KeyMapping(platformCode: "KEYCODE_DPAD_RIGHT"),
                .ok: KeyMapping(platformCode: "KEYCODE_DPAD_CENTER"),
                .back: KeyMapping(platformCode: "KEYCODE_BACK"),
                .home: KeyMapping(platformCode: "KEYCODE_HOME"),
                .volumeUp: KeyMapping(platformCode: "KEYCODE_VOLUME_UP"),
                .volumeDown: KeyMapping(platformCode: "KEYCODE_VOLUME_DOWN"),
                .mute: KeyMapping(platformCode: "KEYCODE_VOLUME_MUTE"),
                .power: KeyMapping(platformCode: "KEYCODE_POWER", supported: true)
            ],
            .webOS: [
                .up: KeyMapping(platformCode: "UP"),
                .down: KeyMapping(platformCode: "DOWN"),
                .left: KeyMapping(platformCode: "LEFT"),
                .right: KeyMapping(platformCode: "RIGHT"),
                .ok: KeyMapping(platformCode: "ENTER"),
                .back: KeyMapping(platformCode: "BACK"),
                .home: KeyMapping(platformCode: "HOME"),
                .volumeUp: KeyMapping(platformCode: "VOLUME_UP"),
                .volumeDown: KeyMapping(platformCode: "VOLUME_DOWN"),
                .mute: KeyMapping(platformCode: "MUTE"),
                .power: KeyMapping(platformCode: "POWER", supported: true)
            ],
            .tizen: [
                .up: KeyMapping(platformCode: "KEY_UP"),
                .down: KeyMapping(platformCode: "KEY_DOWN"),
                .left: KeyMapping(platformCode: "KEY_LEFT"),
                .right: KeyMapping(platformCode: "KEY_RIGHT"),
                .ok: KeyMapping(platformCode: "KEY_ENTER"),
                .back: KeyMapping(platformCode: "KEY_RETURN"),
                .home: KeyMapping(platformCode: "KEY_HOME"),
                .volumeUp: KeyMapping(platformCode: "KEY_VOLUP"),
                .volumeDown: KeyMapping(platformCode: "KEY_VOLDOWN"),
                .mute: KeyMapping(platformCode: "KEY_MUTE"),
                .power: KeyMapping(platformCode: "KEY_POWER", supported: true)
            ],
            .roku: [
                .up: KeyMapping(platformCode: "Up"),
                .down: KeyMapping(platformCode: "Down"),
                .left: KeyMapping(platformCode: "Left"),
                .right: KeyMapping(platformCode: "Right"),
                .ok: KeyMapping(platformCode: "Select"),
                .back: KeyMapping(platformCode: "Back"),
                .home: KeyMapping(platformCode: "Home"),
                .volumeUp: KeyMapping(platformCode: "VolumeUp"),
                .volumeDown: KeyMapping(platformCode: "VolumeDown"),
                .mute: KeyMapping(platformCode: "VolumeMute"),
                .power: KeyMapping(platformCode: "PowerOff", supported: true)
            ]
        ]
    )
}
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
      │ 1..10                         │
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
- **最多管理 10 台设备**

---

## 6. 安全存储（iOS Keychain）

### 6.1 认证凭据存储

配对令牌（如 webOS client key、Tizen authorization token）MUST 存储在 iOS Keychain：

```swift
import Security

final class KeychainService {
    static let shared = KeychainService()
    private let service = "com.tvremote.credentials"
    
    /// 保存配对令牌
    func saveToken(_ token: String, for deviceId: UUID) throws {
        let key = "pairing_token_\(deviceId.uuidString)"
        guard let data = token.data(using: .utf8) else {
            throw KeychainError.encodingFailed
        }
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        
        // 先删除旧条目
        SecItemDelete(query as CFDictionary)
        
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.saveFailed(status)
        }
    }
    
    /// 获取配对令牌
    func retrieveToken(for deviceId: UUID) -> String? {
        let key = "pairing_token_\(deviceId.uuidString)"
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var dataTypeRef: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &dataTypeRef)
        
        guard status == errSecSuccess,
              let data = dataTypeRef as? Data,
              let token = String(data: data, encoding: .utf8) else {
            return nil
        }
        return token
    }
    
    /// 删除配对令牌
    func deleteToken(for deviceId: UUID) {
        let key = "pairing_token_\(deviceId.uuidString)"
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        
        SecItemDelete(query as CFDictionary)
    }
}

enum KeychainError: Error {
    case encodingFailed
    case saveFailed(OSStatus)
    case retrieveFailed(OSStatus)
}
```

### 6.2 安全属性

- 使用 `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` 确保：
  - 仅在设备解锁时可访问
  - 不会同步到其他设备或 iCloud
- 日志中禁止记录 Token 内容

---

## 7. 数据验证

### 验证规则

```swift
extension TVDevice {
    enum ValidationError: LocalizedError {
        case emptyName
        case nameTooLong
        case invalidIPAddress
        
        var errorDescription: String? {
            switch self {
            case .emptyName: return "设备名称不能为空"
            case .nameTooLong: return "设备名称不能超过50个字符"
            case .invalidIPAddress: return "IP 地址格式无效"
            }
        }
    }
    
    func validate() throws {
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else {
            throw ValidationError.emptyName
        }
        guard name.count <= 50 else {
            throw ValidationError.nameTooLong
        }
        guard isValidIPAddress(ipAddress) else {
            throw ValidationError.invalidIPAddress
        }
    }
    
    private func isValidIPAddress(_ ip: String) -> Bool {
        // IPv4
        let ipv4Pattern = #"^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$"#
        if ip.range(of: ipv4Pattern, options: .regularExpression) != nil {
            return true
        }
        // IPv6 简化检查
        if ip.contains(":") && ip.split(separator: ":").count >= 2 {
            return true
        }
        return false
    }
}
```

---

## 8. 未来扩展考虑

- **设备分组**：支持将设备分组（如"客厅"、"卧室"），增加 `groupId` 字段
- **历史记录**：记录用户最近发送的指令，用于快捷操作或统计分析
- **云同步**：将设备列表同步到云端，支持多手机共享配置（需引入用户账号体系）
- **固件版本**：记录电视固件版本，用于兼容性诊断
- **超过10台设备**：未来版本可考虑提升上限或引入分页

---

**数据模型版本**: 2.0.0  
**最后更新**: 2025-12-02  
**变更**: 从 TypeScript 迁移到 Swift，整合 iOS Keychain 安全存储，添加设备数量上限（10台）
