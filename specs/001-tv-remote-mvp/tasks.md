# Tasks: TV Remote MVP Multi-Platform Control

**Input**: Design documents from `/specs/001-tv-remote-mvp/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: 根据 Constitution 的测试策略要求，本任务列表包含必要的测试任务（单元测试 ≥80%、集成测试、E2E）。

**Organization**: 任务按用户故事组织，支持独立实现和测试。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: 可并行执行（不同文件，无依赖）
- **[Story]**: 所属用户故事（US1/US2/US3）
- 描述中包含确切文件路径

## Path Conventions

基于 plan.md 的项目结构：
- **应用层**: `src/app/` (screens, components, navigation)
- **领域层**: `src/domain/` (models, services, remote adapters)
- **基础设施层**: `src/infra/` (storage, config, logging)
- **测试**: `tests/` (unit, integration, e2e)

---

## Phase 1: Setup (项目初始化)

**Purpose**: 创建 Expo + React Native 项目结构，配置开发工具链

- [ ] T001 使用 Expo CLI 初始化 React Native 项目（SDK 54，TypeScript 模板）
- [ ] T002 [P] 配置 ESLint + Prettier（React Native + TypeScript 规则）在 `.eslintrc.js` 和 `.prettierrc`
- [ ] T003 [P] 配置 Jest 测试框架和 React Native Testing Library 在 `jest.config.js`
- [ ] T004 [P] 创建 `src/` 目录结构：`app/`、`domain/`、`infra/` 三层架构
- [ ] T005 [P] 安装核心依赖：React Navigation、AsyncStorage、react-native-tcp-socket
- [ ] T006 配置 TypeScript 路径别名 `@app/`、`@domain/`、`@infra/` 在 `tsconfig.json`

**Checkpoint**: 项目可运行 `npm start`，ESLint/Prettier/Jest 配置生效

---

## Phase 2: Foundational (基础架构)

**Purpose**: 核心基础设施，所有用户故事的前置依赖

**⚠️ CRITICAL**: 此阶段必须完成后才能开始任何用户故事

### 数据模型

- [ ] T007 [P] 创建 TVDevice 类型定义和枚举（TVPlatform, DeviceStatus）在 `src/domain/models/TVDevice.ts`
- [ ] T008 [P] 创建 ConnectionSession 类型定义和枚举（ConnectionStatus）在 `src/domain/models/ConnectionSession.ts`
- [ ] T009 [P] 创建 RemoteProfile 和 RemoteKey 枚举在 `src/domain/models/RemoteProfile.ts`
- [ ] T010 [P] 创建 DeviceCapabilities 接口在 `src/domain/models/DeviceCapabilities.ts`
- [ ] T011 创建 models 索引导出 `src/domain/models/index.ts`

### 抽象层接口

- [ ] T012 定义 IPlatformAdapter 接口在 `src/domain/remote/IPlatformAdapter.ts`
- [ ] T013 [P] 创建错误类型（DiscoveryError, ConnectionError, CommandError 等）在 `src/domain/remote/errors.ts`
- [ ] T014 实现 AdapterFactory 工厂（含环境变量判断）在 `src/domain/remote/AdapterFactory.ts`

### 基础设施

- [ ] T015 [P] 实现环境变量读取（TV_REMOTE_USE_MOCK 开关）在 `src/infra/config/env.ts`
- [ ] T016 [P] 实现统一日志封装（不记录敏感信息）在 `src/infra/logging/logger.ts`
- [ ] T017 [P] 实现设备持久化存储（AsyncStorage 封装）在 `src/infra/storage/deviceStorage.ts`

### Mock 适配器

- [ ] T018 实现 MockAdapter（模拟 5 大平台设备发现、连接、指令发送）在 `src/domain/remote/mocks/MockAdapter.ts`
- [ ] T019 为 MockAdapter 添加单元测试在 `tests/unit/remote/MockAdapter.test.ts`

### 单元测试（Foundational）

- [ ] T020 [P] 为 AdapterFactory 添加单元测试（Mock/Production 切换逻辑）在 `tests/unit/remote/AdapterFactory.test.ts`
- [ ] T021 [P] 为 deviceStorage 添加单元测试在 `tests/unit/infra/deviceStorage.test.ts`
- [ ] T022 [P] 为 env 配置添加单元测试在 `tests/unit/infra/env.test.ts`

**Checkpoint**: Foundation ready - 抽象层接口定义完成，MockAdapter 可用，用户故事可以开始

---

## Phase 3: User Story 1 - 连接并控制单台电视 (Priority: P1) 🎯 MVP

**Goal**: 用户可以发现、连接一台电视，并使用虚拟遥控器界面控制它

**Independent Test**: 使用 MockAdapter 完成设备发现 → 连接 → 发送方向/确认/返回/音量指令的完整流程

### Tests for User Story 1

- [ ] T023 [P] [US1] 集成测试：设备发现→连接→发送指令流程在 `tests/integration/remote-flow.test.tsx`
- [ ] T024 [P] [US1] 组件测试：RemotePad 方向键交互在 `tests/unit/app/components/RemotePad.test.tsx`
- [ ] T025 [P] [US1] 组件测试：VolumeControls 音量控制在 `tests/unit/app/components/VolumeControls.test.tsx`

### Implementation for User Story 1

#### 领域服务

- [ ] T026 [US1] 实现 SessionManager 服务（连接、断开、状态管理）在 `src/domain/services/SessionManager.ts`
- [ ] T027 [US1] 为 SessionManager 添加单元测试在 `tests/unit/domain/SessionManager.test.ts`

#### UI 组件

- [ ] T028 [P] [US1] 实现 RemotePad 组件（方向键 + OK 键）在 `src/app/components/RemotePad.tsx`
- [ ] T029 [P] [US1] 实现 TransportControls 组件（返回、主页）在 `src/app/components/TransportControls.tsx`
- [ ] T030 [P] [US1] 实现 VolumeControls 组件（音量+/-、静音）在 `src/app/components/VolumeControls.tsx`
- [ ] T031 [P] [US1] 实现 ConnectionStatusBar 组件（连接状态指示）在 `src/app/components/ConnectionStatusBar.tsx`
- [ ] T032 [P] [US1] 实现 PowerButton 组件（电源键，按能力显示/隐藏）在 `src/app/components/PowerButton.tsx`

#### 页面与导航

- [ ] T033 [US1] 实现 DeviceDiscoveryScreen 页面（设备发现与选择）在 `src/app/screens/DeviceDiscoveryScreen.tsx`
- [ ] T034 [US1] 实现 RemoteControlScreen 页面（遥控器主界面，组合所有控制组件）在 `src/app/screens/RemoteControlScreen.tsx`
- [ ] T035 [US1] 配置 React Navigation 导航栈在 `src/app/navigation/AppNavigator.tsx`
- [ ] T036 [US1] 更新 App 入口文件整合导航在 `src/index.tsx`

#### 交互与状态

- [ ] T037 [US1] 实现 useRemoteControl hook（封装指令发送、状态订阅）在 `src/app/hooks/useRemoteControl.ts`
- [ ] T038 [US1] 实现 useDeviceDiscovery hook（封装设备发现逻辑）在 `src/app/hooks/useDeviceDiscovery.ts`
- [ ] T039 [US1] 添加按钮点击反馈（100ms 内视觉反馈：高亮/loading）在所有控制组件中

#### 错误处理

- [ ] T040 [US1] 实现连接错误提示 UI（超时、授权失败等）在 `src/app/components/ErrorToast.tsx`
- [ ] T041 [US1] 实现指令发送失败重试逻辑在 `src/domain/services/SessionManager.ts`

**Checkpoint**: User Story 1 完成 - 可使用 MockAdapter 演示完整的发现→连接→遥控流程

---

## Phase 4: User Story 2 - 管理多台电视设备 (Priority: P2)

**Goal**: 用户可以添加、重命名、切换和删除多台电视设备

**Independent Test**: 在设备列表中添加 2 台以上设备，验证切换、重命名、删除功能

### Tests for User Story 2

- [ ] T042 [P] [US2] 单元测试：DeviceManager 设备增删改查在 `tests/unit/domain/DeviceManager.test.ts`
- [ ] T043 [P] [US2] 组件测试：DeviceListItem 交互（选择/长按菜单）在 `tests/unit/app/components/DeviceListItem.test.tsx`

### Implementation for User Story 2

#### 领域服务

- [ ] T044 [US2] 实现 DeviceManager 服务（设备列表增删改查、持久化）在 `src/domain/services/DeviceManager.ts`
- [ ] T045 [US2] 扩展 deviceStorage 支持设备列表 CRUD 操作在 `src/infra/storage/deviceStorage.ts`

#### UI 组件

- [ ] T046 [P] [US2] 实现 DeviceListItem 组件（设备卡片，显示名称/状态/平台图标）在 `src/app/components/DeviceListItem.tsx`
- [ ] T047 [P] [US2] 实现 DeviceActionMenu 组件（长按菜单：重命名/删除）在 `src/app/components/DeviceActionMenu.tsx`
- [ ] T048 [P] [US2] 实现 RenameDeviceModal 组件（重命名弹窗）在 `src/app/components/RenameDeviceModal.tsx`
- [ ] T049 [P] [US2] 实现 AddDeviceButton 组件（添加新设备入口）在 `src/app/components/AddDeviceButton.tsx`

#### 页面

- [ ] T050 [US2] 实现 DeviceListScreen 页面（多设备列表与管理）在 `src/app/screens/DeviceListScreen.tsx`
- [ ] T051 [US2] 更新导航配置：DeviceListScreen 作为首页在 `src/app/navigation/AppNavigator.tsx`

#### 交互与状态

- [ ] T052 [US2] 实现 useDeviceManager hook（封装设备管理操作）在 `src/app/hooks/useDeviceManager.ts`
- [ ] T053 [US2] 实现设备切换逻辑（从遥控界面快速切换）在 `src/app/screens/RemoteControlScreen.tsx`
- [ ] T054 [US2] 添加删除确认对话框防止误操作在 `src/app/components/ConfirmDeleteModal.tsx`

**Checkpoint**: User Story 2 完成 - 可管理多台设备，切换控制目标

---

## Phase 5: User Story 3 - 跨品牌平台统一操作体验 (Priority: P3)

**Goal**: 不同平台电视使用统一的遥控界面，按键映射由抽象层处理

**Independent Test**: 在 Android TV 和 Tizen 设备间切换，验证 UI 布局一致，操作体验相同

### Tests for User Story 3

- [ ] T055 [P] [US3] 单元测试：RemoteProfile 按键映射逻辑在 `tests/unit/domain/RemoteProfile.test.ts`
- [ ] T056 [P] [US3] 单元测试：各平台适配器按键映射在 `tests/unit/remote/adapters/KeyMapping.test.ts`

### Implementation for User Story 3

#### 平台适配器（真机协议实现）

- [ ] T057 [P] [US3] 实现 RokuAdapter（ECP HTTP 协议）在 `src/domain/remote/adapters/RokuAdapter.ts`
- [ ] T058 [P] [US3] 实现 AndroidTvAdapter（ADB over TCP 协议）在 `src/domain/remote/adapters/AndroidTvAdapter.ts`
- [ ] T059 [P] [US3] 实现 AmazonFireTvAdapter（复用 ADB，调整按键映射）在 `src/domain/remote/adapters/AmazonFireTvAdapter.ts`
- [ ] T060 [P] [US3] 实现 LgWebOsAdapter（WebSocket + Luna Bus）在 `src/domain/remote/adapters/LgWebOsAdapter.ts`
- [ ] T061 [P] [US3] 实现 SamsungTizenAdapter（WebSocket + JSON-RPC）在 `src/domain/remote/adapters/SamsungTizenAdapter.ts`

#### 按键映射与能力协商

- [ ] T062 [US3] 实现默认 RemoteProfile 配置（标准按键集合）在 `src/domain/remote/profiles/defaultProfile.ts`
- [ ] T063 [US3] 实现按键能力协商逻辑（根据 DeviceCapabilities 灰显/隐藏按钮）在 `src/app/components/RemotePad.tsx`
- [ ] T064 [US3] 实现不支持按键的友好提示（Toast 或禁用状态）在 `src/app/components/UnsupportedKeyToast.tsx`

#### 适配器单元测试

- [ ] T065 [P] [US3] RokuAdapter 单元测试在 `tests/unit/remote/adapters/RokuAdapter.test.ts`
- [ ] T066 [P] [US3] AndroidTvAdapter 单元测试在 `tests/unit/remote/adapters/AndroidTvAdapter.test.ts`
- [ ] T067 [P] [US3] LgWebOsAdapter 单元测试在 `tests/unit/remote/adapters/LgWebOsAdapter.test.ts`
- [ ] T068 [P] [US3] SamsungTizenAdapter 单元测试在 `tests/unit/remote/adapters/SamsungTizenAdapter.test.ts`

#### 配对流程（平台特定）

- [ ] T069 [US3] 实现 webOS/Tizen 配对码输入界面在 `src/app/screens/PairingScreen.tsx`
- [ ] T070 [US3] 实现配对 token 安全存储（SecureStore）在 `src/infra/storage/tokenStorage.ts`

**Checkpoint**: User Story 3 完成 - 5 大平台适配器就绪，统一 UI 下可控制不同品牌电视

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 跨故事的优化、文档和质量保证

### E2E 测试

- [ ] T071 实现 E2E 测试：连接并控制单台电视 Happy Path 在 `tests/e2e/connect-and-control.spec.ts`
- [ ] T072 配置 E2E 测试环境（Detox 或 Expo E2E）在 `detox.config.js` 或 `e2e/config.ts`

### 文档与开发体验

- [ ] T073 [P] 创建 README.md（项目介绍、快速开始、架构说明）
- [ ] T074 [P] 创建 CONTRIBUTING.md（开发规范、提交指南）
- [ ] T075 验证 quickstart.md 中的所有步骤可执行

### 性能与体验优化

- [ ] T076 [P] 添加按钮点击触觉反馈（Haptic Feedback）在所有控制组件
- [ ] T077 [P] 优化设备发现 loading 状态展示在 `src/app/screens/DeviceDiscoveryScreen.tsx`
- [ ] T078 实现离线重连逻辑（网络恢复后自动重连）在 `src/domain/services/SessionManager.ts`
- [ ] T079 添加应用图标和启动画面配置在 `app.json`

### 代码质量

- [ ] T080 运行 ESLint 修复所有 warning/error
- [ ] T081 运行测试覆盖率检查，确保核心模块 ≥80%
- [ ] T082 Code review 清理：移除 console.log，优化注释

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    │
    ▼
Phase 2 (Foundational) ─── BLOCKS ALL USER STORIES
    │
    ├──────────────┬──────────────┐
    ▼              ▼              ▼
Phase 3 (US1)  Phase 4 (US2)  Phase 5 (US3)
    │              │              │
    └──────────────┴──────────────┘
                   │
                   ▼
            Phase 6 (Polish)
```

### User Story Dependencies

| User Story | 前置依赖 | 与其他故事的关系 |
|------------|---------|-----------------|
| **US1 (P1)** | Phase 2 完成 | 无依赖，可独立实现 |
| **US2 (P2)** | Phase 2 完成 | 可与 US1 并行，共享 DeviceManager |
| **US3 (P3)** | Phase 2 完成 | 可与 US1/US2 并行，扩展适配器实现 |

### Within Each User Story

1. Tests (如包含) MUST 先编写并确认失败
2. Models/Types → Services → Hooks → Components → Screens
3. 核心功能 → 错误处理 → 优化
4. 故事完成后进入下一优先级

### Parallel Opportunities per Phase

**Phase 1 (Setup)**:
```
T002 (ESLint) ─┬─ T003 (Jest) ─┬─ T004 (目录结构) ─┬─ T005 (依赖)
               │               │                   │
               └───────────────┴───────────────────┘ → T006 (路径别名)
```

**Phase 2 (Foundational)**:
```
T007 (TVDevice) ─┬─ T008 (Session) ─┬─ T009 (RemoteProfile) ─┬─ T010 (Capabilities)
                 │                   │                        │
                 └───────────────────┴────────────────────────┘ → T011 (index)
                                                                      │
T012 (IPlatformAdapter) ──────────────────────────────────────────────┤
                                                                      │
T015 (env) ─┬─ T016 (logger) ─┬─ T017 (storage) ─────────────────────┤
            │                  │                                      │
            └──────────────────┘                                      │
                                                                      ▼
                                                           T014 (AdapterFactory) → T018 (MockAdapter)
```

**Phase 3 (US1) - 核心组件可并行**:
```
T028 (RemotePad) ─┬─ T029 (TransportControls) ─┬─ T030 (VolumeControls) ─┬─ T031 (StatusBar) ─┬─ T032 (PowerButton)
                  │                             │                         │                    │
                  └─────────────────────────────┴─────────────────────────┴────────────────────┘
                                                            │
                                                            ▼
                                                    T034 (RemoteControlScreen)
```

**Phase 5 (US3) - 适配器可并行**:
```
T057 (Roku) ─┬─ T058 (AndroidTV) ─┬─ T059 (FireTV) ─┬─ T060 (webOS) ─┬─ T061 (Tizen)
             │                     │                 │                │
             └─────────────────────┴─────────────────┴────────────────┘
```

---

## Implementation Strategy

### MVP First (仅 User Story 1)

1. ✅ Phase 1: Setup（项目初始化）
2. ✅ Phase 2: Foundational（基础架构 + MockAdapter）
3. ✅ Phase 3: User Story 1（发现 + 连接 + 遥控）
4. **STOP**: 使用 MockAdapter 演示完整流程
5. 可交付 MVP Demo

### Incremental Delivery

| 交付版本 | 包含故事 | 可验证功能 |
|---------|---------|-----------|
| **v0.1 (MVP)** | US1 | 发现→连接→遥控 1 台电视（Mock） |
| **v0.2** | US1 + US2 | 多设备管理 |
| **v0.3** | US1 + US2 + US3 | 5 大平台真机支持 |
| **v1.0** | 全部 + Polish | 生产就绪 |

### Parallel Team Strategy

| 开发者 | 负责 Phase | 估时 |
|-------|-----------|------|
| **Dev A** | Phase 1 + 2 → US1 | 3-4 天 |
| **Dev B** | Phase 2 完成后 → US2 | 2 天 |
| **Dev C** | Phase 2 完成后 → US3 (Roku + Android) | 3 天 |
| **Dev D** | Phase 2 完成后 → US3 (webOS + Tizen) | 3 天 |

---

## Task Summary

| Phase | 任务数 | 可并行任务 | 阻塞说明 |
|-------|-------|-----------|---------|
| Phase 1 (Setup) | 6 | 4 | 无阻塞 |
| Phase 2 (Foundational) | 16 | 11 | 阻塞所有 US |
| Phase 3 (US1) | 19 | 10 | 依赖 Phase 2 |
| Phase 4 (US2) | 13 | 6 | 依赖 Phase 2 |
| Phase 5 (US3) | 16 | 10 | 依赖 Phase 2 |
| Phase 6 (Polish) | 12 | 5 | 依赖所有 US |
| **Total** | **82** | **46** | - |

---

## Notes

- `[P]` 标记 = 不同文件，可并行执行
- `[US1/US2/US3]` 标记 = 所属用户故事，便于追踪
- 每个 User Story 可独立完成和测试
- 测试先写，确认失败后再实现
- 每完成一个任务或逻辑组提交 commit
- 任何 Checkpoint 可停止验证
- 避免：模糊任务、同文件冲突、破坏故事独立性的跨故事依赖
