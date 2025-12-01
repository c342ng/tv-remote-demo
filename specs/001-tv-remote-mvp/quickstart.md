# Quickstart Guide: TV Remote MVP Development (iOS)

**Created**: 2025-12-02  
**Purpose**: 快速搭建 iOS 原生开发环境，运行应用并在 Mock/真机模式间切换

---

## 1. 环境要求

### 必备软件
- **macOS**: 13.0 (Ventura) 或更高版本
- **Xcode**: 15.0+ (包含 iOS 17 SDK)
- **Swift**: 5.9+
- **Git**: 用于版本控制
- **CocoaPods** 或 **Swift Package Manager**: 依赖管理

### 硬件要求
- **iPhone 真机** (iOS 15+): 用于真机调试
- **Apple Developer Account**: 用于真机部署

---

## 2. 项目初始化

### 2.1 克隆仓库并安装依赖

```bash
# 克隆项目
git clone <repository-url> tv-remote-demo
cd tv-remote-demo

# 切换到 feature 分支
git checkout 001-tv-remote-mvp

# 如果使用 CocoaPods
cd TVRemote
pod install

# 打开工作区
open TVRemote.xcworkspace
```

### 2.2 配置 Scheme 环境变量

在 Xcode 中配置 Mock 模式：

1. 选择 `Product` → `Scheme` → `Edit Scheme...`
2. 选择 `Run` → `Arguments` → `Environment Variables`
3. 添加以下变量：

| 变量名 | 值 | 说明 |
|--------|------|------|
| `TV_REMOTE_USE_MOCK` | `1` | 启用 Mock 模式 |
| `MOCK_SIMULATE_TIMEOUT` | `0` | 模拟连接超时 |
| `MOCK_DISCOVER_DEVICES_COUNT` | `5` | 模拟发现设备数量 |

**说明**:
- `TV_REMOTE_USE_MOCK=1`: 应用使用 `MockAdapter`，无需实际设备即可开发和测试 UI
- `TV_REMOTE_USE_MOCK=0` 或未设置: 应用运行在**真机模式**，需要真实的电视设备

---

## 3. 运行应用

### 3.1 在模拟器上运行

1. 在 Xcode 中选择目标设备（如 `iPhone 15 Pro`）
2. 点击 `Run` 按钮（或按 `⌘R`）
3. 等待编译完成，模拟器将自动启动应用

### 3.2 在真机上运行

1. 使用 USB 连接 iPhone 到 Mac
2. 在 Xcode 中选择你的 iPhone 作为目标设备
3. 首次运行需要在 `Signing & Capabilities` 中配置开发团队
4. 点击 `Run` 按钮

---

## 4. Mock 模式 vs 真机模式切换

### 4.1 启用 Mock 模式（开发阶段推荐）

在 Scheme 环境变量中设置：
```
TV_REMOTE_USE_MOCK=1
```

**Mock 模式特性**:
- `discover()` 返回 5 台虚拟设备（Android TV、Fire TV、webOS、Tizen、Roku 各 1 台）
- `connect()` 模拟 100-200ms 延迟后成功连接
- `sendKey()` 模拟 50-100ms 延迟，无需真实电视响应
- 所有操作在内存中记录，可用于调试和测试

### 4.2 代码中切换模式

```swift
// AppConfiguration.swift
enum Environment {
    static var useMockAdapter: Bool {
        ProcessInfo.processInfo.environment["TV_REMOTE_USE_MOCK"] == "1"
    }
}

// AdapterFactory.swift
func createAdapter(for platform: TVPlatform) -> PlatformAdapter {
    if Environment.useMockAdapter {
        return MockAdapter()
    }
    switch platform {
    case .androidTV: return AndroidTvAdapter()
    case .fireTV: return FireTvAdapter()
    case .webOS: return WebOsAdapter()
    case .tizen: return TizenAdapter()
    case .roku: return RokuAdapter()
    }
}
```

---

## 5. 真机模式准备工作

### 5.1 Android TV / Amazon Fire TV

**前置条件**:
1. 在电视上打开"开发者选项"（通常在"关于" → 连续点击版本号 7 次）
2. 启用 **"ADB 调试"** 和 **"网络调试"**
3. 记下电视显示的 IP 地址

**连接步骤**:
1. 在应用中手动输入电视 IP 地址（或通过设备发现自动找到）
2. 首次连接时，电视会显示授权弹窗，点击"允许"
3. 连接成功后即可发送遥控指令

**注意事项**:
- ADB 调试主要用于开发/演示场景，不适合普通用户
- 部分路由器可能阻止 ADB 端口（5555），需调整网络设置

---

### 5.2 LG webOS

**前置条件**:
1. 确保电视已连接 Wi-Fi 并获取 IP 地址
2. 在电视设置中启用"移动设备连接"

**连接步骤**:
1. 在应用中输入电视 IP 地址或通过 mDNS 自动发现
2. 首次连接时，电视会显示 **允许连接的提示框**
3. 用户在电视上点击"允许"后，应用会保存 client key
4. 后续连接自动复用 token，无需重新授权

**注意事项**:
- webOS 4.0+ 支持加密 WebSocket (WSS, 端口 3001)
- Client key 将安全存储在 iOS Keychain

---

### 5.3 Samsung Tizen

**前置条件**:
1. 确保电视已连接 Wi-Fi 并获取 IP 地址
2. 在电视设置中启用"外部设备管理器" → "允许网络遥控"

**连接步骤**:
1. 在应用中输入电视 IP 地址
2. 首次连接时，电视会显示 **允许连接的弹窗**
3. 确认后，应用会保存 authorization token
4. Token 将安全存储在 iOS Keychain

**注意事项**:
- Tizen 4.0+ 需要使用 WSS (端口 8002) 加密连接
- 部分旧款设备可能不支持 Token 认证

---

### 5.4 Roku

**前置条件**:
1. 确保电视/设备已连接 Wi-Fi
2. Roku 默认开启 ECP 协议

**连接步骤**:
1. 在应用中输入 Roku 设备 IP 地址或通过 SSDP 自动发现
2. 无需配对，直接通过 HTTP 发送指令
3. 连接成功后即可遥控

**注意事项**:
- Roku 协议最简单，适合作为首个真机测试平台
- 使用 HTTP 端口 8060

---

## 6. 目录结构说明

```
TVRemote/
├── App/                        # App 入口
│   ├── TVRemoteApp.swift
│   └── AppDelegate.swift
├── Presentation/               # UI 层
│   ├── Screens/                # 页面组件
│   │   ├── DeviceListScreen.swift
│   │   ├── DeviceDiscoveryScreen.swift
│   │   ├── PairingScreen.swift
│   │   └── RemoteControlScreen.swift
│   ├── Components/             # 公共 UI 组件
│   │   ├── RemoteButton.swift
│   │   ├── ConnectionStatusBadge.swift
│   │   └── DeviceCard.swift
│   └── ViewModels/             # 视图模型
│       ├── DeviceListViewModel.swift
│       └── RemoteControlViewModel.swift
├── Domain/                     # 业务逻辑层
│   ├── Models/                 # 数据模型
│   │   ├── TVDevice.swift
│   │   ├── ConnectionSession.swift
│   │   ├── RemoteProfile.swift
│   │   └── RemoteKey.swift
│   ├── Services/               # 业务服务
│   │   ├── DeviceManager.swift
│   │   ├── SessionManager.swift
│   │   └── ReconnectionService.swift
│   └── Protocols/              # 协议定义
│       └── PlatformAdapter.swift
├── Infrastructure/             # 基础设施层
│   ├── Adapters/               # 平台适配器
│   │   ├── AndroidTvAdapter.swift
│   │   ├── FireTvAdapter.swift
│   │   ├── WebOsAdapter.swift
│   │   ├── TizenAdapter.swift
│   │   ├── RokuAdapter.swift
│   │   └── MockAdapter.swift
│   ├── Networking/             # 网络通信
│   │   ├── WebSocketClient.swift
│   │   ├── TCPClient.swift
│   │   └── HTTPClient.swift
│   ├── Storage/                # 存储封装
│   │   ├── KeychainService.swift
│   │   └── DeviceStorage.swift
│   └── Discovery/              # 设备发现
│       ├── NetworkScanner.swift
│       └── MDNSDiscovery.swift
└── Resources/
    ├── Assets.xcassets
    └── Localizable.strings
```

---

## 7. 常用开发命令

```bash
# 构建项目（命令行）
xcodebuild -workspace TVRemote.xcworkspace -scheme TVRemote -sdk iphonesimulator build

# 运行单元测试
xcodebuild test -workspace TVRemote.xcworkspace -scheme TVRemote -destination 'platform=iOS Simulator,name=iPhone 15 Pro'

# 运行测试覆盖率
xcodebuild test -workspace TVRemote.xcworkspace -scheme TVRemote -enableCodeCoverage YES

# SwiftLint 代码检查
swiftlint lint

# SwiftFormat 代码格式化
swiftformat TVRemote/
```

---

## 8. iOS Keychain 安全存储

### 8.1 KeychainService 封装

```swift
import Security

final class KeychainService {
    static let shared = KeychainService()
    
    func save(token: String, for deviceId: String) throws {
        let data = token.data(using: .utf8)!
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: deviceId,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        
        SecItemDelete(query as CFDictionary) // 删除旧条目
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.saveFailed(status)
        }
    }
    
    func retrieveToken(for deviceId: String) throws -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: deviceId,
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
    
    func deleteToken(for deviceId: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: deviceId
        ]
        SecItemDelete(query as CFDictionary)
    }
}

enum KeychainError: Error {
    case saveFailed(OSStatus)
    case retrieveFailed(OSStatus)
}
```

---

## 9. 重连策略实现

### 9.1 ReconnectionService

```swift
import Foundation

actor ReconnectionService {
    private let maxRetries = 3
    private let baseDelay: TimeInterval = 2.0 // 2s -> 4s -> 8s
    
    func reconnect(to device: TVDevice, using adapter: PlatformAdapter) async throws -> ConnectionSession {
        var lastError: Error?
        
        for attempt in 0..<maxRetries {
            let delay = baseDelay * pow(2.0, Double(attempt))
            
            // 通知 UI 显示"重连中"状态
            NotificationCenter.default.post(
                name: .reconnectionAttempt,
                object: nil,
                userInfo: ["attempt": attempt + 1, "maxRetries": maxRetries]
            )
            
            do {
                if attempt > 0 {
                    try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                }
                return try await adapter.connect(device)
            } catch {
                lastError = error
                continue
            }
        }
        
        // 3次失败，通知用户手动重试
        throw ReconnectionError.maxRetriesExceeded(lastError)
    }
}

enum ReconnectionError: Error {
    case maxRetriesExceeded(Error?)
}

extension Notification.Name {
    static let reconnectionAttempt = Notification.Name("reconnectionAttempt")
}
```

---

## 10. 常见问题排查

### 10.1 设备发现失败

**症状**: 应用无法找到局域网内的电视设备

**可能原因**:
- 设备与电视不在同一网络
- 路由器禁用了 mDNS/SSDP 广播
- 电视未开启网络调试功能

**解决方案**:
- 确认设备与电视连接到同一 Wi-Fi
- 尝试手动输入电视 IP 地址
- 检查路由器防火墙设置

---

### 10.2 连接超时

**症状**: 连接电视时一直显示"连接中"，最后超时失败

**可能原因**:
- 电视未开启 ADB 调试（Android TV/Fire TV）
- 配对流程未完成（webOS/Tizen）
- 网络延迟过高

**解决方案**:
- 检查电视端设置
- 确保完成配对流程
- 切换到 Mock 模式排除网络问题

---

### 10.3 Keychain 存储失败

**症状**: 保存配对 Token 时报错

**可能原因**:
- 模拟器 Keychain 访问受限
- Keychain 访问权限配置错误

**解决方案**:
- 在真机上测试 Keychain 功能
- 检查 `Keychain Sharing` 和 `Entitlements` 配置

---

## 11. 下一步开发建议

### Phase 1（当前阶段）
- [ ] 完成项目初始化和基础架构搭建
- [ ] 实现 `MockAdapter` 和抽象层协议
- [ ] 搭建基础 UI（DeviceListScreen + RemoteControlScreen）
- [ ] 实现 iOS Keychain 安全存储封装

### Phase 2
- [ ] 实现 Roku 适配器（协议最简单）
- [ ] 完成设备发现与连接流程
- [ ] 实现基础遥控按键（方向、确认、返回）

### Phase 3
- [ ] 实现 Android TV / Fire TV 适配器
- [ ] 实现 webOS / Tizen 适配器
- [ ] 添加多设备管理功能
- [ ] 实现重连策略

### Phase 4
- [ ] 完善错误处理与离线重连
- [ ] 添加单元测试与集成测试（80%+ 覆盖率）
- [ ] 性能优化与用户体验打磨

---

## 12. 相关资源

- [Apple Developer Documentation - Network Framework](https://developer.apple.com/documentation/network)
- [Apple Developer Documentation - Keychain Services](https://developer.apple.com/documentation/security/keychain_services)
- [Swift Async/Await](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)
- [Android ADB 协议](https://developer.android.com/studio/command-line/adb)
- [LG webOS TV API](https://webostv.developer.lge.com/)
- [Samsung Tizen TV API](https://developer.samsung.com/smarttv/develop/api-references.html)
- [Roku ECP 协议](https://developer.roku.com/docs/developer-program/debugging/external-control-api.md)

---

**快速开始版本**: 2.0.0  
**最后更新**: 2025-12-02  
**变更**: 从 React Native/Expo 迁移到 iOS 原生 (Swift)，整合 iOS Keychain 安全存储

祝开发顺利！🚀
