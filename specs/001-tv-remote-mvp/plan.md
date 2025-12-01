# Implementation Plan: TV Remote MVP Multi-Platform Control

**Branch**: `001-tv-remote-mvp` | **Date**: 2025-12-01 | **Spec**: `specs/001-tv-remote-mvp/spec.md`
**Input**: Feature specification from `/specs/001-tv-remote-mvp/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

构建一个使用 **React Native v0.81.5 + Expo SDK 54 + TypeScript** 的 TV Remote MVP 应用，提供类实体遥控器的统一界面，支持 Android TV、Amazon Fire TV、LG webOS、Samsung Tizen、Roku 等平台的网络遥控控制与多设备管理。

通过为不同品牌/协议构建统一抽象层，在用户层屏蔽底层协议差异：上层只依赖统一的 `TVDevice` 和 `RemoteProfile` 接口，底层为每个平台实现各自的真机控制协议（不支持红外）。为方便开发与 CI，可在启用特定系统环境变量时切换到 mock 实现，其余情况默认走真机/生产逻辑。

## Technical Context

**Language/Version**: TypeScript, React Native v0.81.5, Expo SDK 54  
**Primary Dependencies**: React Navigation, Expo (网络/平台能力), Jest + React Native Testing Library  
**Storage**: 本地持久化使用 AsyncStorage（或 Expo SecureStore 如需更安全存储），不涉及服务端存储  
**Testing**: Jest、React Native Testing Library、轻量级端到端测试（例如 Detox 或 Expo E2E 工具）  
**Target Platform**: 移动端（iOS / Android 手机或平板）控制多品牌 TV 设备  
**Project Type**: mobile（单应用，前后端一体，所有逻辑在 RN 客户端）  
**Performance Goals**: 遥控指令端到端交互时间 < 200ms（局域网场景下），首屏加载 < 2 秒  
**Constraints**: 不依赖红外；必须在弱网/临时离线时保持可预期行为；应用运行内存 < 100MB  
**Scale/Scope**: 面向家庭/小型场景，预期设备数量 < 20 台/用户，设备类型为 5 大 TV 平台

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

基于 `TV Remote Demo Constitution` 的约束，本计划需满足：

1. **代码质量与风格**
   - 采用统一 ESLint + Prettier 配置（React Native + TS 规范）。
   - 控制组件/逻辑函数复杂度：UI 组件与业务 hooks 尽量保持单一职责，避免超长组件。

2. **测试策略**
   - 单元测试：
     - 抽象层接口与各平台适配器需要达到 ≥80% 覆盖率。
   - 集成测试：
     - 设备发现 → 连接 → 发送指令 的主路径使用 mock 协议做集成验证。
   - E2E 测试：
     - 至少 1 条"连接并控制单台电视"的 Happy Path 场景。

3. **UX 一致性**
   - 遥控 UI 在所有品牌/协议下保持统一布局与交互反馈。
   - 状态（连接中/已连接/断开/不可用）在 UI 中始终可见。

4. **性能与可用性**
   - 指令操作按钮点击后 100ms 内必须有本地 UI 反馈（loading/高亮/状态提示）。
   - 网络异常、设备离线时有明确提示，并支持自动重试或手动重连。

**Gate Result (pre-design)**: 计划阶段不触发宪法硬性冲突，后续在设计与实现中需显式保障抽象层可测试性和统一 UX。

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── navigation/          # React Navigation 配置
│   ├── screens/
│   │   ├── DeviceListScreen.tsx      # 多设备列表与管理
│   │   └── RemoteControlScreen.tsx   # 遥控器主界面
│   └── components/
│       ├── RemotePad.tsx            # 方向/OK 区域
│       ├── TransportControls.tsx    # 返回/主页等
│       ├── VolumeControls.tsx       # 音量/静音
│       └── ConnectionStatusBar.tsx  # 连接状态指示
├── domain/
│   ├── models/
│   │   ├── TVDevice.ts
│   │   ├── ConnectionSession.ts
│   │   └── RemoteProfile.ts
│   ├── services/
│   │   └── DeviceManager.ts         # 多设备管理与持久化
│   └── remote/
│       ├── RemoteAbstraction.ts     # 统一抽象层接口
│       ├── PlatformAdapter.ts       # 适配器接口 + 工厂
│       ├── adapters/
│       │   ├── AndroidTvAdapter.ts
│       │   ├── AmazonFireTvAdapter.ts
│       │   ├── LgWebOsAdapter.ts
│       │   ├── SamsungTizenAdapter.ts
│       │   └── RokuAdapter.ts
│       └── mocks/
│           └── MockAdapter.ts        # 受环境变量控制的 mock 实现
├── infra/
│   ├── storage/
│   │   └── deviceStorage.ts         # 基于 AsyncStorage 的设备持久化
│   ├── config/
│   │   └── env.ts                   # 环境变量读取（mock 开关等）
│   └── logging/
│       └── logger.ts                # 统一日志封装
└── index.tsx                        # Expo 入口

tests/
├── unit/
│   ├── remote/
│   │   ├── RemoteAbstraction.test.ts
│   │   └── PlatformAdapterFactory.test.ts
│   ├── domain/
│   │   └── DeviceManager.test.ts
│   └── app/
│       └── components/RemotePad.test.tsx
├── integration/
│   └── remote-flow.test.tsx         # 设备发现→连接→发送指令（mock 协议）
└── e2e/
    └── connect-and-control.spec.ts  # 端到端 Happy Path
```

**Structure Decision**: 单一 React Native 应用项目结构，按 `app/domain/infra` 分层：
- `domain` 层提供与具体 UI/平台无关的抽象和业务规则（设备、会话、抽象遥控接口与平台适配器）。
- `app` 层实现 UI 与导航，完全依赖 `domain` 暴露的统一接口，不感知具体平台协议。
- `infra` 层封装存储、环境变量、日志等技术细节，便于测试与替换实现。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

本计划未触发宪法约束冲突，以下为架构复杂度说明（非违规项）：

| 架构决策 | 理由 | 简化方案被否决的原因 |
|---------|------|-------------------|
| 三层架构（app/domain/infra） | 清晰分离 UI、业务逻辑与基础设施，符合单一职责原则与可测试性要求 | 单层架构会导致 UI 与协议实现耦合，难以测试与扩展 |
| 适配器模式（5 个平台适配器） | 每个平台协议差异大，统一抽象层保证 UI 无感知，便于独立测试与扩展 | 用 if/switch 分支会导致单文件过长且难以维护，违背代码复杂度原则 |
| Mock 适配器 + 环境变量控制 | 支持无真机开发与 CI/CD 自动化测试，不增加运行时复杂度 | 完全依赖真机会阻塞开发流程，不符合快速迭代要求 |

**说明**: 上述决策均为降低整体复杂度和提升可维护性的必要设计，不属于宪法违规项。
