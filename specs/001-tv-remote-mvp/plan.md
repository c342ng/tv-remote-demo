# Implementation Plan: TV Remote MVP Multi-Platform Control

**Branch**: `001-tv-remote-mvp` | **Date**: 2025-12-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-tv-remote-mvp/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

构建一个 iOS 原生电视遥控应用，支持 Android TV、Amazon Fire TV、LG webOS、Samsung Tizen、Roku 五大平台的网络发现、配对授权和遥控控制。通过统一的适配器抽象层实现跨平台一致的遥控体验，支持多设备管理（最多10台），使用 iOS Keychain 安全存储认证凭据。

## Technical Context

**Language/Version**: Swift 5.9+  
**Primary Dependencies**: UIKit/SwiftUI, Network.framework, WebSocket (URLSessionWebSocketTask), Keychain Services  
**Storage**: iOS Keychain（认证凭据）+ UserDefaults/CoreData（设备列表）  
**Testing**: XCTest, Quick/Nimble（可选）  
**Target Platform**: iOS 15+（iPhone）  
**Project Type**: mobile - iOS 原生应用  
**Performance Goals**: 遥控指令端到端响应 <200ms，本地 UI 反馈 <100ms  
**Constraints**: <100MB 内存，自动重连（3次，间隔递增 2s→4s→8s），最多管理10台设备  
**Scale/Scope**: 单用户本地应用，5大电视平台，~15个核心界面

**Supported TV Platform Versions**:
- Android TV 10+
- Amazon Fire OS 7+
- LG webOS 4.0+
- Samsung Tizen 4.0+
- Roku OS 10+

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Phase 0 Check ✅

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Code Quality & Style** | ✅ PASS | 将使用 SwiftLint 和 SwiftFormat 确保代码一致性 |
| **II. Testing Strategy** | ✅ PASS | 核心适配器层采用协议抽象，便于 Mock 测试；将达到 80%+ 单元测试覆盖率 |
| **III. UX Consistency** | ✅ PASS | 统一遥控器 UI，按能力动态禁用不支持的按键，<100ms 交互反馈 |
| **IV. Performance & Availability** | ✅ PASS | 遥控指令 <200ms，自动重连策略，内存 <100MB |
| **Development Workflow** | ✅ PASS | 使用 Git Flow，Conventional Commits |
| **Quality Gates** | ✅ PASS | PR 需通过自动化测试、代码审查、Lint 检查 |

### Post-Phase 1 Check ✅

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Code Quality & Style** | ✅ PASS | 适配器模式分离平台差异，单一职责清晰 |
| **II. Testing Strategy** | ✅ PASS | `PlatformAdapter` 协议支持 Mock 替换，分层测试可行 |
| **III. UX Consistency** | ✅ PASS | `RemoteProfile` 提供统一按键布局，`DeviceCapabilities` 驱动 UI 状态 |
| **IV. Performance & Availability** | ✅ PASS | 异步非阻塞 I/O，指令队列+超时重试机制 |

## Project Structure

### Documentation (this feature)

```text
specs/001-tv-remote-mvp/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output - 协议研究与决策
├── data-model.md        # Phase 1 output - 数据模型定义
├── quickstart.md        # Phase 1 output - 开发环境搭建指南
├── contracts/           # Phase 1 output - API 契约定义
│   └── platform-adapter.md
├── checklists/
│   └── requirements.md  # 需求检查清单
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
TVRemote/
├── App/
│   ├── TVRemoteApp.swift          # App 入口
│   └── AppDelegate.swift          # 生命周期管理
├── Presentation/                   # UI 层
│   ├── Screens/
│   │   ├── DeviceListScreen.swift      # 设备列表
│   │   ├── DeviceDiscoveryScreen.swift # 设备发现
│   │   ├── PairingScreen.swift         # 配对流程
│   │   └── RemoteControlScreen.swift   # 遥控器界面
│   ├── Components/
│   │   ├── RemoteButton.swift          # 遥控按钮组件
│   │   ├── ConnectionStatusBadge.swift # 连接状态指示器
│   │   └── DeviceCard.swift            # 设备卡片
│   └── ViewModels/
│       ├── DeviceListViewModel.swift
│       └── RemoteControlViewModel.swift
├── Domain/                         # 业务逻辑层
│   ├── Models/
│   │   ├── TVDevice.swift
│   │   ├── ConnectionSession.swift
│   │   ├── RemoteProfile.swift
│   │   └── RemoteKey.swift
│   ├── Services/
│   │   ├── DeviceManager.swift         # 设备管理服务
│   │   ├── SessionManager.swift        # 会话管理服务
│   │   └── ReconnectionService.swift   # 重连服务（3次递增重试）
│   └── Protocols/
│       └── PlatformAdapter.swift       # 平台适配器协议
├── Infrastructure/                 # 基础设施层
│   ├── Adapters/                   # 平台适配器实现
│   │   ├── AndroidTvAdapter.swift      # ADB over TCP
│   │   ├── FireTvAdapter.swift         # ADB over TCP（共享 Android 实现）
│   │   ├── WebOsAdapter.swift          # WebSocket SSAP
│   │   ├── TizenAdapter.swift          # WebSocket Remote
│   │   ├── RokuAdapter.swift           # HTTP ECP
│   │   └── MockAdapter.swift           # Mock 适配器（开发/测试）
│   ├── Networking/
│   │   ├── WebSocketClient.swift
│   │   ├── TCPClient.swift             # ADB 通信
│   │   └── HTTPClient.swift            # Roku ECP
│   ├── Storage/
│   │   ├── KeychainService.swift       # iOS Keychain 封装
│   │   └── DeviceStorage.swift         # 设备列表持久化
│   └── Discovery/
│       ├── NetworkScanner.swift        # 网络扫描
│       └── MDNSDiscovery.swift         # mDNS/Bonjour 发现
└── Resources/
    ├── Assets.xcassets
    └── Localizable.strings

TVRemoteTests/
├── Unit/
│   ├── Adapters/
│   │   ├── AndroidTvAdapterTests.swift
│   │   ├── WebOsAdapterTests.swift
│   │   └── ...
│   ├── Services/
│   │   ├── DeviceManagerTests.swift
│   │   └── ReconnectionServiceTests.swift
│   └── Models/
│       └── TVDeviceTests.swift
├── Integration/
│   ├── SessionFlowTests.swift
│   └── ReconnectionFlowTests.swift
└── Mocks/
    ├── MockPlatformAdapter.swift
    └── MockNetworkClient.swift

TVRemoteUITests/
└── RemoteControlUITests.swift
```

**Structure Decision**: 采用 iOS 原生应用结构，分层架构（Presentation → Domain → Infrastructure）。使用协议抽象 `PlatformAdapter` 接口，各平台适配器独立实现。认证凭据使用 iOS Keychain 安全存储，设备列表使用 UserDefaults 或 CoreData 持久化。

## Complexity Tracking

> **无宪法违规需要记录**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | - | - |

## Key Design Decisions (from research.md)

### 协议选择

| 平台 | 协议 | 端口 | 配对方式 |
|------|------|------|---------|
| Android TV | ADB over TCP | 5555 | ADB 授权弹窗 |
| Amazon Fire TV | ADB over TCP | 5555 | ADB 授权弹窗 |
| LG webOS | WebSocket SSAP | 3000/3001 | PIN 码配对 |
| Samsung Tizen | WebSocket Remote | 8001/8002 | Token 授权 |
| Roku | HTTP ECP | 8060 | 无需配对 |

### 重连策略

- 后台静默重试最多 **3 次**
- 间隔递增：**2s → 4s → 8s**
- 期间显示"重连中"状态指示器
- 3 次失败后弹出提示引导用户检查网络或手动重试

### 安全存储

- 配对令牌、授权密钥存储在 **iOS Keychain**
- 使用 `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` 安全级别
- 日志中禁止记录敏感信息

## Phase Artifacts

| Phase | Artifact | Status |
|-------|----------|--------|
| Phase 0 | [research.md](./research.md) | ✅ Complete |
| Phase 1 | [data-model.md](./data-model.md) | 🔄 Needs Update (iOS Swift) |
| Phase 1 | [contracts/platform-adapter.md](./contracts/platform-adapter.md) | 🔄 Needs Update (iOS Swift) |
| Phase 1 | [quickstart.md](./quickstart.md) | 🔄 Needs Update (iOS) |
| Phase 2 | tasks.md | ⏳ Pending |

---

**Plan Version**: 1.1.0  
**Last Updated**: 2025-12-02  
**Changes**: 更新为 iOS 原生应用架构，整合 iOS Keychain 安全存储，添加重连策略细节，明确各平台最低版本要求
