# Tasks: TV Remote MVP Multi-Platform Control

**Input**: Design documents from `/specs/001-tv-remote-mvp/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`

**Tests**: 测试是推荐但可选的；本任务列表会为关键路径加入基础测试任务，后续可按宪法要求补齐覆盖率。

**Organization**: 任务按阶段与用户故事分组，每个用户故事可独立实现与测试。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件、无直接依赖）
- **[Story]**: 该任务所属用户故事（US1 / US2 / US3）
- 描述中必须包含明确文件路径

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 项目初始化与基本工具链，保证 React Native + Expo + TS 工程可运行。

- [X] T001 初始化 React Native + Expo 应用工程骨架（如果尚未存在）
- [X] T002 [P] 配置 TypeScript、ESLint、Prettier 基础规则于 `package.json` / `.eslintrc.*` / `.prettierrc` 等
- [X] T003 [P] 在 `app/remote/` 下创建基础目录结构：`screens/`, `components/`, `services/`, `domain/`, `protocols/`, `mocks/`
- [ ] T004 在 `tests/` 下创建测试目录结构：`unit/`, `integration/`, `e2e/`
- [ ] T005 在项目 README 或 `specs/001-tv-remote-mvp/quickstart.md` 中补充 `TV_REMOTE_ENV=mock` 启动示例命令

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 建立所有用户故事共享的抽象层、配置与状态管理；完成后才开始各用户故事实现。

**⚠️ CRITICAL**: 本阶段未完成前，不应开始任何 US1/US2/US3 的具体 UI/协议实现。

- [X] T006 定义领域模型与类型：在 `app/remote/domain/models.ts` 中实现 `TVDevice`, `TVCapabilities`, `ConnectionSession`, `RemoteProfile`, `RemoteButton`, `RemoteCommandType` 等
- [X] T007 [P] 定义遥控指令与能力抽象接口：在 `app/remote/domain/remote-interfaces.ts` 中声明 `PlatformAdapter`, `TVSession`, `DiscoveryService`, `DeviceManager` 等 TypeScript 接口
- [ ] T008 [P] 实现基础设备状态存储：在 `app/remote/services/device-store.ts` 中实现 `DeviceManager` 的默认实现（内存状态 + AsyncStorage 持久化）
- [X] T009 [P] 实现环境变量开关逻辑：在 `app/remote/services/env.ts` 中封装 `isMockEnv()`，基于 `TV_REMOTE_ENV === "mock"`
- [X] T010 定义协议适配工厂：在 `app/remote/protocols/factory.ts` 中实现按平台与 env 返回 real 或 mock `PlatformAdapter`
- [ ] T011 建立基础日志服务：在 `app/remote/services/logger.ts` 中实现记录 `LogEvent` 的简单接口（当前可先输出到控制台，保留后续接入远端/本地文件扩展点）
- [ ] T012 配置 Jest + React Native Testing Library：在 `jest.config.*` 与 `tests/unit/` 下添加基础配置和示例测试，确认能运行 TypeScript 测试

**Checkpoint**: 抽象层接口与基础服务已就绪，可开始各用户故事的具体实现。

---

## Phase 3: User Story 1 - 连接并控制单台电视 (Priority: P1) 🎯 MVP

**Goal**: 用户可在同一局域网内发现一台受支持电视，完成配对/授权，并通过统一遥控界面发送基础控制指令。

**Independent Test**: 在任一受支持系统电视上完成：发现 → 配对/授权 → 打开遥控界面 → 成功执行方向、确认、返回、音量等基础指令，全流程不依赖多设备管理（US2）或统一多平台 UX（US3）。

### Tests for User Story 1

- [ ] T013 [P] [US1] 在 `tests/unit/domain/remote-session.test.ts` 中为 `TVSession` 核心状态机与命令发送行为编写单元测试（含成功与失败路径）
- [ ] T014 [P] [US1] 在 `tests/integration/us1_single_device_flow.test.ts` 中编写集成测试（可使用 mock 适配器）验证：发现 → 连接 → 发送基础指令 流程

### Implementation for User Story 1 - 抽象层与协议集成

- [ ] T015 [P] [US1] 在 `app/remote/protocols/base-adapter.ts` 中实现通用 `PlatformAdapter` 抽象类（含能力声明与错误码规范）
- [ ] T016 [P] [US1] 在 `app/remote/protocols/android-fire-adapter.ts` 中实现 Android TV / Fire TV 适配器骨架（预留 ADB over TCP 连接与 keyevent 映射）
- [ ] T017 [P] [US1] 在 `app/remote/protocols/webos-adapter.ts` 中实现 LG webOS WebSocket 协议适配器骨架
- [ ] T018 [P] [US1] 在 `app/remote/protocols/tizen-adapter.ts` 中实现 Samsung Tizen WebSocket 遥控适配器骨架
- [X] T019 [P] [US1] 在 `app/remote/protocols/roku-adapter.ts` 中实现 Roku ECP HTTP 控制适配器骨架
- [ ] T020 [US1] 在 `app/remote/services/session-manager.ts` 中实现基于 `TVSession` 抽象的连接管理（含自动重连策略：2s → 4s → 8s，最多 3 次）

### Implementation for User Story 1 - 设备发现与连接

- [ ] T021 [P] [US1] 在 `app/remote/services/discovery-service.ts` 中实现通用发现接口与平台/协议特定发现策略占位（目前可先基于 IP + 端口测试实现，后续接入 mDNS/SSDP）
- [X] T022 [US1] 在 `app/remote/screens/DeviceDiscoveryScreen.tsx` 中实现设备发现与首次连接引导界面（展示同一子网内发现的设备列表）
- [X] T023 [US1] 在 `app/remote/components/DeviceListItem.tsx` 中实现单个设备行组件（名称、平台、状态指示）

### Implementation for User Story 1 - 遥控 UI 与交互

- [X] T024 [P] [US1] 在 `app/remote/domain/default-profile.ts` 中定义默认 `RemoteProfile` 与标准按钮集合（方向、OK、返回、主页、音量、静音、电源）
- [X] T025 [P] [US1] 在 `app/remote/components/RemoteButton.tsx` 中实现通用遥控按钮组件（支持禁用态与按下反馈 <100ms）
- [X] T026 [US1] 在 `app/remote/screens/RemoteControlScreen.tsx` 中实现单台电视的虚拟遥控器界面：根据 `RemoteProfile` 渲染按钮，并通过当前 `TVSession` 发送命令
- [X] T027 [US1] 在 `app/remote/components/ConnectionStatusBar.tsx` 中实现连接状态指示器（连接中/已连接/重连中/已断开/不可用）
- [ ] T028 [US1] 在 `app/remote/services/command-dispatcher.ts` 中实现规范化命令到 `PlatformAdapter` 的映射与错误处理（含不支持命令时的提示/禁用逻辑）

**Checkpoint**: 完成上述任务后，用户在真机环境下应可完成“发现单台电视 → 配对/授权 → 通过统一遥控界面发送基础按键”的完整流程。

---

## Phase 4: User Story 2 - 管理多台电视设备 (Priority: P2)

**Goal**: 用户可以添加、重命名、切换和删除多台电视设备，并快速选择当前要控制的电视，上限 10 台。

**Independent Test**: 在至少两台不同品牌/系统电视完成连接后，仅依赖现有 US1 能力，通过设备管理界面实现设备列表展示与当前控制目标切换，不依赖统一 UX 增强（US3）。

### Tests for User Story 2

- [ ] T029 [P] [US2] 在 `tests/unit/services/device-store.test.ts` 中为 `DeviceManager` 的多设备增删改查与激活设备切换编写单元测试
- [ ] T030 [P] [US2] 在 `tests/integration/us2_multi_device_switch.test.ts` 中编写集成测试，验证：添加两台设备 → 切换当前控制目标 → US1 遥控界面针对不同设备发送命令

### Implementation for User Story 2 - 多设备数据与逻辑

- [ ] T031 [P] [US2] 扩展 `app/remote/services/device-store.ts`：支持持久化最多 10 台设备列表与用户自定义标签，并在达到上限时阻止新增
- [ ] T032 [US2] 在 `app/remote/services/device-store.ts` 中实现设备重命名与删除 API，确保不会影响其他设备的会话与存储
- [ ] T033 [US2] 在 `app/remote/services/session-manager.ts` 中支持根据 `activeDeviceId` 快速切换当前 `TVSession`（必要时重建或复用会话）

### Implementation for User Story 2 - UI 与交互

- [ ] T034 [P] [US2] 在 `app/remote/screens/DeviceManagementScreen.tsx` 中实现设备管理界面（设备列表、添加、重命名、删除）
- [ ] T035 [P] [US2] 在 `app/remote/components/DeviceManagementItem.tsx` 中实现支持长按触发重命名/删除动作的列表项组件
- [ ] T036 [US2] 在 `app/remote/screens/RemoteControlScreen.tsx` 中集成快速切换当前设备的入口（例如顶部设备选择器），调用 `DeviceManager` 切换 `activeDeviceId`

**Checkpoint**: 完成后，可在多台真实或 mock 设备之间切换控制目标，多设备管理与单设备控制可独立演示与交付。

---

## Phase 5: User Story 3 - 跨品牌平台的统一操作体验 (Priority: P3)

**Goal**: 用户在不同品牌/平台电视之间切换时，看到的是统一的遥控界面布局和文案，底层命令映射由抽象层自动处理。

**Independent Test**: 在至少两种不同系统（如 Android TV 与 Samsung Tizen）上使用同一遥控界面完成“导航菜单并选择一个应用”，用户无需学习不同布局或文案。

### Tests for User Story 3

- [ ] T037 [P] [US3] 在 `tests/unit/domain/remote-profile.test.ts` 中测试 `RemoteProfile` 与 `TVCapabilities` 的交互：在不同平台能力下按钮可见性与可用性是否符合预期
- [ ] T038 [P] [US3] 在 `tests/integration/us3_cross_platform_ui.test.ts` 中编写集成测试：模拟 Android TV 与 Tizen 设备，验证在切换设备时 UI 布局不变但底层命令映射不同

### Implementation for User Story 3 - 统一布局与能力驱动 UI

- [ ] T039 [P] [US3] 扩展 `app/remote/domain/default-profile.ts`：为每个 `RemoteButton` 增加基于 `TVCapabilities` 的 `visibilityRule` 与禁用规则
- [ ] T040 [P] [US3] 在 `app/remote/components/RemoteButton.tsx` 中实现根据 `visibilityRule` 与当前设备 `TVCapabilities` 动态隐藏/禁用按钮的逻辑
- [ ] T041 [US3] 在 `app/remote/screens/RemoteControlScreen.tsx` 中将平台差异全部下沉到抽象层与 `TVCapabilities`，保证布局与交互模式在不同设备间保持一致
- [ ] T042 [US3] 在 `app/remote/protocols/*-adapter.ts` 中补全各平台的能力探测逻辑（填充 `TVCapabilities`），并确保对不支持命令返回 `COMMAND_UNSUPPORTED` 错误码

**Checkpoint**: 完成后，在多平台设备间切换时，用户看到的遥控 UI 布局一致，只是底层协议与能力细节被自动处理。

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 跨用户故事的打磨与增强，包括健壮性、性能、文档与安全。

- [ ] T043 [P] 完善 `specs/001-tv-remote-mvp/quickstart.md`，加入多设备与多平台实测说明
- [ ] T044 [P] 在 `tests/unit/` 和 `tests/integration/` 中补充更多错误场景与边界条件测试（如设备离线、网络切换）
- [ ] T045 对 `app/remote/services/session-manager.ts` 与各 `protocols/*-adapter.ts` 进行性能与资源占用优化（如连接复用、避免过度重连）
- [ ] T046 对日志内容进行审查，确保不记录敏感个人信息，仅保留必要的调试字段
- [ ] T047 在 `app/remote/` 模块中进行必要的代码整理与小范围重构，保持函数长度与复杂度在宪法要求范围内
- [ ] T048 运行一次完整的 E2E 测试（Detox）并根据结果调整任务优先级与后续迭代计划

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1: Setup** → 无依赖，可立即开始。
- **Phase 2: Foundational** → 依赖 Phase 1，完成后才可开启任何用户故事实现。
- **Phase 3 (US1)** → 依赖 Phase 2；为 MVP 核心路径，建议优先完成。
- **Phase 4 (US2)** → 依赖 Phase 2，可在 US1 进行中并行推进部分后端逻辑，但需以 US1 抽象层为基准。
- **Phase 5 (US3)** → 依赖 Phase 2 与 US1 的抽象层与 UI 基础，可与 US2 并行。
- **Phase 6: Polish** → 依赖所有目标用户故事完成后进行。

### Parallel Opportunities

- 标记为 [P] 的任务可在不同文件、无直接依赖的前提下并行执行。
- Phase 1 与 Phase 2 内部，工具配置、目录创建、接口与实现类的编写可由不同开发者并行完成。
- 完成 Phase 2 后：
  - 一部分人专注 US1 协议适配与会话管理（T015–T028）。
  - 另一部分人并行推进 US2 的多设备存储与 UI（T029–T036）。
  - 第三部分人可在 US1 基础上推进 US3 的统一布局与能力驱动 UI（T037–T042）。

### MVP Scope

- 建议的 MVP 范围：**仅完成 US1（Phase 3）** + 必要的 Setup/Foundational：
  - 可在单设备场景下完成“发现 → 连接 → 遥控”完整链路。
  - 后续迭代再增量交付 US2（多设备管理）与 US3（统一多平台 UX）。
