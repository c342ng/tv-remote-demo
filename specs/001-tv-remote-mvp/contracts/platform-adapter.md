# API Contract: Platform Adapter Protocol (iOS Swift)

**Created**: 2025-12-02  
**Purpose**: 定义 UI 层与 Domain 层之间的统一协议契约，实现跨平台遥控抽象

---

## 1. 协议概览

所有平台适配器（AndroidTvAdapter、FireTvAdapter、WebOsAdapter、TizenAdapter、RokuAdapter）MUST 遵循 `PlatformAdapter` 协议，确保上层代码无需感知具体平台差异。

---

## 2. PlatformAdapter 协议定义

```swift
import Foundation

/// 平台适配器协议 - 所有电视平台实现的统一接口
protocol PlatformAdapter: AnyObject {
    
    /// 适配器支持的平台类型
    var platform: TVPlatform { get }
    
    /// 发现局域网内可用设备
    /// - Returns: 发现的设备列表
    /// - Throws: DiscoveryError 当网络扫描失败时
    func discover() async throws -> [TVDevice]
    
    /// 连接到指定设备并建立会话
    /// - Parameter device: 目标设备
    /// - Returns: 成功建立的连接会话
    /// - Throws: ConnectionError 当连接失败时
    func connect(_ device: TVDevice) async throws -> ConnectionSession
    
    /// 断开与设备的连接
    /// - Parameter session: 要断开的会话
    /// - Throws: DisconnectionError 当断开过程发生错误时
    func disconnect(_ session: ConnectionSession) async throws
    
    /// 发送遥控按键指令
    /// - Parameters:
    ///   - session: 当前活跃会话
    ///   - key: 规范化遥控按键
    /// - Throws: CommandError 当指令发送失败或超时时
    func sendKey(_ session: ConnectionSession, key: RemoteKey) async throws
    
    /// 查询设备当前状态
    /// - Parameter session: 当前活跃会话
    /// - Returns: 设备在线/离线/未知状态
    /// - Throws: StatusQueryError 当查询失败时
    func getStatus(_ session: ConnectionSession) async throws -> DeviceStatus
    
    /// 获取设备能力描述
    /// - Parameter device: 目标设备
    /// - Returns: 设备支持的功能集合
    func getCapabilities(_ device: TVDevice) async throws -> DeviceCapabilities
}
```

---

## 3. 错误类型定义

```swift
import Foundation

// MARK: - DiscoveryError

/// 设备发现错误
enum DiscoveryError: LocalizedError {
    case networkUnavailable
    case timeout
    case permissionDenied
    case unknown(Error)
    
    var errorDescription: String? {
        switch self {
        case .networkUnavailable:
            return "网络不可用，请检查 Wi-Fi 连接"
        case .timeout:
            return "设备扫描超时，请确保电视已开机"
        case .permissionDenied:
            return "缺少本地网络访问权限"
        case .unknown(let error):
            return "发现设备时发生未知错误: \(error.localizedDescription)"
        }
    }
}

// MARK: - ConnectionError

/// 连接错误
enum ConnectionError: LocalizedError {
    case timeout
    case refused
    case authFailed
    case networkError(Error)
    case pairingRequired
    case invalidDevice
    
    var errorDescription: String? {
        switch self {
        case .timeout:
            return "连接超时，请检查网络和电视状态"
        case .refused:
            return "连接被拒绝，请在电视上允许连接"
        case .authFailed:
            return "认证失败，请重新配对"
        case .networkError(let error):
            return "网络错误: \(error.localizedDescription)"
        case .pairingRequired:
            return "需要配对授权，请在电视上确认"
        case .invalidDevice:
            return "无效的设备信息"
        }
    }
    
    var code: String {
        switch self {
        case .timeout: return "TIMEOUT"
        case .refused: return "REFUSED"
        case .authFailed: return "AUTH_FAILED"
        case .networkError: return "NETWORK_ERROR"
        case .pairingRequired: return "PAIRING_REQUIRED"
        case .invalidDevice: return "INVALID_DEVICE"
        }
    }
}

// MARK: - CommandError

/// 指令发送错误
enum CommandError: LocalizedError {
    case timeout
    case notSupported(RemoteKey)
    case sessionInvalid
    case networkError(Error)
    
    var errorDescription: String? {
        switch self {
        case .timeout:
            return "指令发送超时"
        case .notSupported(let key):
            return "该设备不支持 \(key.displayName) 按键"
        case .sessionInvalid:
            return "会话已失效，请重新连接"
        case .networkError(let error):
            return "网络错误: \(error.localizedDescription)"
        }
    }
    
    var code: String {
        switch self {
        case .timeout: return "TIMEOUT"
        case .notSupported: return "NOT_SUPPORTED"
        case .sessionInvalid: return "SESSION_INVALID"
        case .networkError: return "NETWORK_ERROR"
        }
    }
}

// MARK: - DisconnectionError

/// 断开连接错误
enum DisconnectionError: LocalizedError {
    case alreadyDisconnected
    case networkError(Error)
    
    var errorDescription: String? {
        switch self {
        case .alreadyDisconnected:
            return "设备已断开连接"
        case .networkError(let error):
            return "断开连接时发生网络错误: \(error.localizedDescription)"
        }
    }
}

// MARK: - StatusQueryError

/// 状态查询错误
enum StatusQueryError: LocalizedError {
    case timeout
    case networkError(Error)
    
    var errorDescription: String? {
        switch self {
        case .timeout:
            return "状态查询超时"
        case .networkError(let error):
            return "查询状态时发生网络错误: \(error.localizedDescription)"
        }
    }
}
```

---

## 4. 协议行为契约

### 4.1 discover()

**前置条件**:
- 设备与电视在同一局域网内
- 已获取本地网络访问权限（iOS 14+ 需要 `NSLocalNetworkUsageDescription`）
- 目标平台设备已开启可发现模式（部分平台需手动启用）

**后置条件**:
- 返回发现的设备列表（可为空数组）
- 如网络扫描失败，抛出 `DiscoveryError`

**性能要求**:
- 扫描时间 SHOULD < 5 秒
- 支持增量发现（可选，优先级 P2）

**示例**:
```swift
let adapter = AndroidTvAdapter()
do {
    let devices = try await adapter.discover()
    print("发现 \(devices.count) 台 Android TV")
} catch let error as DiscoveryError {
    print("设备发现失败: \(error.localizedDescription)")
}
```

---

### 4.2 connect(_ device:)

**前置条件**:
- `device` 对象有效且包含必要的连接信息（IP、端口等）
- 目标设备在线且可达

**后置条件**:
- 返回已建立的 `ConnectionSession`，状态为 `.connected`
- 如连接失败，抛出 `ConnectionError`
- 如需要配对，抛出 `ConnectionError.pairingRequired`

**性能要求**:
- 连接建立时间 SHOULD < 3 秒
- 超时时间 MUST 在 5 秒内

**授权流程**:
- Android TV / Fire TV: 需用户在电视上接受 ADB 授权
- webOS / Tizen: 需用户在电视上确认连接（首次）或输入 PIN
- Roku: 无需额外授权

**示例**:
```swift
let adapter = WebOsAdapter()
do {
    let session = try await adapter.connect(device)
    print("连接成功，会话 ID: \(session.sessionId)")
} catch let error as ConnectionError {
    switch error {
    case .pairingRequired:
        // 引导用户完成配对
        showPairingFlow(for: device)
    default:
        print("连接失败: \(error.localizedDescription)")
    }
}
```

---

### 4.3 disconnect(_ session:)

**前置条件**:
- `session` 有效且状态为 `.connected` 或 `.error`

**后置条件**:
- 会话状态变更为 `.disconnected`
- 底层网络资源（WebSocket/TCP 连接）已释放

**性能要求**:
- 断开操作 SHOULD < 1 秒

**示例**:
```swift
try await adapter.disconnect(session)
print("已断开连接")
```

---

### 4.4 sendKey(_ session:key:)

**前置条件**:
- `session` 状态为 `.connected`
- `key` 为 `RemoteKey` 枚举中的有效值

**后置条件**:
- 指令已发送到目标设备（不保证电视端执行成功，取决于平台能力）
- 如发送失败，抛出 `CommandError`

**性能要求**:
- 指令发送 SHOULD < 200ms（端到端延迟，包括网络往返）
- 本地 UI 反馈 MUST < 100ms（按钮高亮/loading 等）

**幂等性**:
- 重复发送同一按键 SHOULD 产生相同效果（导航连续移动除外）

**示例**:
```swift
do {
    try await adapter.sendKey(session, key: .up)
    print("已发送 UP 指令")
} catch let error as CommandError {
    if case .notSupported(let key) = error {
        print("该设备不支持 \(key.displayName) 按键")
    }
}
```

---

### 4.5 getStatus(_ session:)

**前置条件**:
- `session` 有效

**后置条件**:
- 返回设备当前状态（`.online` / `.offline` / `.unknown`）
- 如查询失败，抛出 `StatusQueryError`

**性能要求**:
- 状态查询 SHOULD < 1 秒

**示例**:
```swift
let status = try await adapter.getStatus(session)
if status == .offline {
    print("设备已离线")
}
```

---

### 4.6 getCapabilities(_ device:)

**前置条件**:
- `device` 对象有效

**后置条件**:
- 返回设备能力描述（支持的按键集合、功能开关等）

**性能要求**:
- 能力查询 SHOULD < 500ms

**示例**:
```swift
let capabilities = try await adapter.getCapabilities(device)
if !capabilities.supportsPower {
    print("该设备不支持电源控制")
}
```

---

## 5. Mock 适配器契约

`MockAdapter` MUST 实现完整的 `PlatformAdapter` 协议，并满足以下额外契约：

```swift
/// Mock 适配器 - 用于开发和测试
final class MockAdapter: PlatformAdapter {
    
    var platform: TVPlatform = .androidTV // 默认模拟 Android TV
    
    /// 模拟配置
    struct Configuration {
        var simulateTimeout: Bool = false
        var simulateConnectionError: Bool = false
        var discoverDevicesCount: Int = 5
        var connectDelay: TimeInterval = 0.15 // 100-200ms
        var sendKeyDelay: TimeInterval = 0.075 // 50-100ms
    }
    
    var configuration = Configuration()
    
    // 从环境变量读取配置
    init() {
        if ProcessInfo.processInfo.environment["MOCK_SIMULATE_TIMEOUT"] == "1" {
            configuration.simulateTimeout = true
        }
        if let count = ProcessInfo.processInfo.environment["MOCK_DISCOVER_DEVICES_COUNT"],
           let intCount = Int(count) {
            configuration.discoverDevicesCount = intCount
        }
    }
    
    func discover() async throws -> [TVDevice] {
        if configuration.simulateTimeout {
            throw DiscoveryError.timeout
        }
        
        // 模拟延迟
        try await Task.sleep(nanoseconds: 500_000_000) // 0.5s
        
        // 返回模拟设备
        return TVPlatform.allCases.prefix(configuration.discoverDevicesCount).enumerated().map { index, platform in
            TVDevice(
                name: "Mock \(platform.displayName)",
                platform: platform,
                ipAddress: "192.168.1.\(100 + index)",
                port: platform.defaultPort,
                label: "Mock Device \(index + 1)",
                lastOnlineStatus: .online
            )
        }
    }
    
    func connect(_ device: TVDevice) async throws -> ConnectionSession {
        if configuration.simulateConnectionError {
            throw ConnectionError.refused
        }
        
        // 模拟连接延迟
        try await Task.sleep(nanoseconds: UInt64(configuration.connectDelay * 1_000_000_000))
        
        return ConnectionSession(
            device: device,
            status: .connected
        )
    }
    
    func disconnect(_ session: ConnectionSession) async throws {
        // Mock 断开连接，无实际操作
    }
    
    func sendKey(_ session: ConnectionSession, key: RemoteKey) async throws {
        // 模拟发送延迟
        try await Task.sleep(nanoseconds: UInt64(configuration.sendKeyDelay * 1_000_000_000))
        print("[MockAdapter] Sent key: \(key.rawValue) to \(session.device.name)")
    }
    
    func getStatus(_ session: ConnectionSession) async throws -> DeviceStatus {
        return .online
    }
    
    func getCapabilities(_ device: TVDevice) async throws -> DeviceCapabilities {
        return DeviceCapabilities()
    }
}
```

**环境变量配置**:
| 变量名 | 说明 |
|--------|------|
| `TV_REMOTE_USE_MOCK=1` | 启用 Mock 模式 |
| `MOCK_SIMULATE_TIMEOUT=1` | 模拟连接超时 |
| `MOCK_DISCOVER_DEVICES_COUNT=3` | 模拟发现设备数量 |

---

## 6. 配对代理协议

对于需要配对的平台（webOS、Tizen），需要实现配对代理：

```swift
/// 配对代理协议
protocol PairingDelegate: AnyObject {
    /// 电视请求显示配对提示
    func adapterDidRequestPairing(_ adapter: PlatformAdapter, device: TVDevice)
    
    /// 电视请求输入 PIN 码
    func adapter(_ adapter: PlatformAdapter, didRequestPIN device: TVDevice) async -> String?
    
    /// 配对成功
    func adapter(_ adapter: PlatformAdapter, didCompletePairing device: TVDevice, token: String)
    
    /// 配对失败
    func adapter(_ adapter: PlatformAdapter, didFailPairing device: TVDevice, error: Error)
}

/// 支持配对的适配器扩展
protocol PairableAdapter: PlatformAdapter {
    var pairingDelegate: PairingDelegate? { get set }
    
    /// 启动配对流程
    func startPairing(with device: TVDevice) async throws
    
    /// 提交 PIN 码
    func submitPIN(_ pin: String, for device: TVDevice) async throws
}
```

---

## 7. 重连支持

所有适配器应支持断线后的自动重连：

```swift
/// 重连策略
struct ReconnectionPolicy {
    let maxRetries: Int = 3
    let baseDelay: TimeInterval = 2.0 // 2s -> 4s -> 8s
    
    func delay(for attempt: Int) -> TimeInterval {
        return baseDelay * pow(2.0, Double(attempt))
    }
}

/// 可重连的适配器扩展
protocol ReconnectableAdapter: PlatformAdapter {
    var reconnectionPolicy: ReconnectionPolicy { get }
    
    /// 尝试重连
    func reconnect(_ session: ConnectionSession) async throws -> ConnectionSession
}
```

---

## 8. 协议版本与兼容性

- **当前版本**: `v2.0.0`
- **兼容性承诺**: 
  - 协议签名变更视为 MAJOR 版本升级
  - 新增可选方法视为 MINOR 版本升级
  - 错误类型新增 case 视为 MINOR 版本升级

---

## 9. 测试建议

### 单元测试
- 每个适配器 MUST 有对应的单元测试套件
- 覆盖所有协议方法的成功路径与失败路径
- 使用依赖注入模拟网络 I/O

### 集成测试
- 使用 `MockAdapter` 验证完整流程：discover → connect → sendKey → disconnect
- 验证错误处理与重连逻辑

### 契约测试
```swift
import XCTest

/// 协议一致性测试基类
class PlatformAdapterContractTests: XCTestCase {
    
    var adapter: PlatformAdapter!
    
    func testDiscoverReturnsValidDevices() async throws {
        let devices = try await adapter.discover()
        for device in devices {
            XCTAssertFalse(device.name.isEmpty)
            XCTAssertFalse(device.ipAddress.isEmpty)
            XCTAssertEqual(device.platform, adapter.platform)
        }
    }
    
    func testConnectReturnsConnectedSession() async throws {
        let device = TVDevice(name: "Test", platform: adapter.platform, ipAddress: "192.168.1.100")
        let session = try await adapter.connect(device)
        XCTAssertEqual(session.status, .connected)
        XCTAssertEqual(session.device.id, device.id)
    }
    
    func testSendKeyDoesNotThrowForSupportedKey() async throws {
        let device = TVDevice(name: "Test", platform: adapter.platform, ipAddress: "192.168.1.100")
        let session = try await adapter.connect(device)
        
        // 不应抛出异常
        try await adapter.sendKey(session, key: .ok)
    }
}
```

---

**契约版本**: 2.0.0  
**最后更新**: 2025-12-02  
**变更**: 从 TypeScript 迁移到 Swift，添加 `PairingDelegate` 和 `ReconnectableAdapter` 扩展协议
