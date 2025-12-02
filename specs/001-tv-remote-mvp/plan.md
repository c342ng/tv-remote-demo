# Implementation Plan: TV Remote MVP Multi-Platform Control

**Branch**: `001-tv-remote-mvp` | **Date**: 2025-12-02 | **Spec**: `specs/001-tv-remote-mvp/spec.md`
**Input**: Feature specification from `/specs/001-tv-remote-mvp/spec.md`

**Note**: This plan is maintained by the `/speckit.plan` workflow. Do not hand-edit structural sections without updating the corresponding templates.

## Summary

构建一个基于 **React Native 0.81.5 + Expo SDK 54 + TypeScript** 的 iOS TV Remote MVP 应用，通过**统一的协议抽象层**适配 Android TV、Amazon Fire TV、LG webOS、Samsung Tizen、Roku 的网络控制协议，在移动端提供统一的虚拟遥控器界面与多设备管理能力，并通过环境变量控制 mock/真机模式，默认运行在真机/生产模式。

## Technical Context

**Language/Version**: TypeScript (ESNext) on React Native 0.81.5 / Expo SDK 54  
**Primary Dependencies**: React Native, Expo, React Navigation (NEEDS CLARIFICATION: exact navigator lib), 底层设备控制 SDK/协议库（按平台决定，需在 research.md 中列出）  
**Storage**: AsyncStorage（设备列表与标签）、iOS Keychain（配对令牌与敏感凭据）  
**Testing**: Jest + React Native Testing Library（单元/组件），E2E 测试工具 NEEDS CLARIFICATION（Detox 或 Maestro 等）  
**Target Platform**: iOS（iPhone）+ React Native/Expo 运行环境；受控设备为 Android TV 10+、Fire OS 7+、LG webOS 4.0+、Samsung Tizen 4.0+、Roku OS 10+  
**Project Type**: mobile 应用 + 多平台设备控制 SDK 抽象层  
**Performance Goals**: 遥控指令端到端响应时间 < 200ms（典型家庭网络），UI 交互反馈 < 100ms（符合宪法 UX 要求）  
**Constraints**: 不使用红外线，仅基于网络协议；指令发送链路需尽量无阻塞；内存占用 < 100MB；Mock 模式 MUST 仅在显式环境变量开启时生效  
**Scale/Scope**: 单用户最多 10 台电视设备；首期目标为家庭/小型办公场景，单实例并发控制设备数量有限（1 个会话激活 + 后台多台已配对设备）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Code Quality & Style**: 
  - 计划采用 TypeScript 严格类型 + ESLint + Prettier，满足统一风格与命名规范要求。
  - 限制单函数长度与复杂度将在实现阶段通过 lint 规则与代码评审控制。
- **Testing Strategy**:
  - 核心业务（设备抽象层、协议映射、多设备管理）计划覆盖 ≥80% 单元测试，集成测试覆盖设备发现/连接/指令发送主路径。
  - E2E 测试工具尚未最终选型（NEEDS CLARIFICATION），但会至少覆盖：首次连接、发送指令、多设备切换 3 个关键场景。
- **UX Consistency**:
  - 采用统一遥控布局 + 状态指示（连接中/已连接/断开），按需禁用/隐藏不支持的按键，满足“统一 UX”与状态可见性要求。
  - 交互反馈与错误提示将遵循“100ms 内有反馈”“友好文案+可操作建议”的宪法要求。
- **Performance & Availability**:
  - Summary/Requirements 中已将 <200ms 响应与自动重连策略固化为功能与成功指标；实现将避免轮询阻塞与过度重连以控制资源消耗。

当前 GATE 评估：

- ✅ 宪法层面的目标与本 feature 设计一致，无明显冲突。
- ⚠️ 需要在 research.md 中完成以下补充后再次复核：
  - E2E 测试工具与策略选型（Detox/Maestro/其他）。
  - 各电视平台具体 SDK/协议与 React Native/Expo 的集成方式及其测试策略。
  - Mock 环境变量命名及启用策略，确保不会误伤生产/真机模式。

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
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
app/                         # Expo Router / React Navigation 入口（NEEDS CLARIFICATION: 路由方案）
  remote/                    # 本 feature 主模块
    screens/                 # 遥控主界面、多设备管理等屏幕
    components/              # 遥控按钮、状态指示、设备列表等 UI 组件
    services/                # 设备发现、连接管理、指令发送等应用服务
    domain/                  # 抽象层：统一的 TVDevice、RemoteProfile、Command 等领域模型
    protocols/               # 各品牌/平台具体协议适配实现（AndroidTV, FireTV, WebOS, Tizen, Roku）
    mocks/                   # 专用于 mock 环境的协议/设备实现（仅在特定 env 变量下启用）

tests/
  unit/                      # 领域模型、抽象层、协议适配器单元测试
  integration/               # 抽象层 + 真机/SDK（可通过模拟层）集成测试
  e2e/                       # 端到端 UI 流程测试（NEEDS CLARIFICATION: 具体框架）
```

**Structure Decision**: 采用“单 React Native 应用 + feature 模块化”结构，在 `app/remote` 下封装 TV Remote 相关 UI、领域模型、协议适配与服务逻辑，测试按 unit/integration/e2e 分层，以便清晰对应宪法中的 Testing Strategy 要求。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
