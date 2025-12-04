# Feature Specification: TV Remote MVP Multi-Platform Control

**Feature Branch**: `001-tv-remote-mvp`  
**Created**: 2025-12-01  
**Status**: Draft  
**Input**: User description: "构建一个TV remote的mvp 应用；带一个类电视遥控器界面；支持 Android TV、Amazon Fire TV、LG webOS、Samsung Tizen、Roku 电视的连接和控制；支持多设备管理；不需要支持红外线控制。"

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.
  
  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - 连接并控制单台电视 (Priority: P1)

作为一名用户，我可以在手机上打开 TV Remote 应用，选择一台附近支持的电视（Android TV / Amazon Fire TV / LG webOS / Samsung Tizen / Roku），完成首次连接并使用类电视遥控器界面（方向键、确认、返回、主页、音量、静音等）控制该电视。

**Why this priority**: 这是应用的核心价值主张，MVP 至少要支持一台电视的基本连接与遥控，否则产品不具备任何实际使用价值。

**Independent Test**: 在一台受支持系统的电视上完成设备发现 → 配对/授权 → 打开遥控界面 → 成功执行方向、确认、返回、音量等基础指令，全流程不依赖多设备管理或高级功能。

**Acceptance Scenarios**:

1. **Given** 用户首次打开应用且在同一网络内有一台支持的电视，**When** 用户选择该设备并按照指引完成配对，**Then** 用户可以看到与传统遥控器类似的界面并成功发送基础控制指令（方向、确认、返回、音量）。
2. **Given** 用户已完成对某台电视的配对，**When** 用户再次打开应用，**Then** 应用自动显示该电视为当前连接目标，并在用户点击任意控制按钮时立即在电视上生效。

---

### User Story 2 - 管理多台电视设备 (Priority: P2)

作为一名拥有多台智能电视的用户，我可以在应用中方便地添加、重命名、切换和删除多台电视设备，并快速选择当前要控制的电视。

**Why this priority**: 多设备管理提高了家庭和办公场景下的实用性，是区别于单一遥控器的重要能力，但在单设备控制可用后可以作为第二优先级增量交付。

**Independent Test**: 即使只实现设备列表和设备切换（在至少两台电视上完成连接），不依赖其他高级功能，也可以单独交付为一版可用的多设备管理增强功能。

**Acceptance Scenarios**:

1. **Given** 用户已成功连接至少两台不同品牌/系统的电视，**When** 用户打开设备管理界面，**Then** 用户可以看到已命名的设备列表，并通过点击切换当前控制目标。
2. **Given** 用户已在列表中保存多台电视，**When** 用户长按某条设备记录选择重命名或删除，**Then** 列表会立即更新，并且不会影响其他设备的连接与控制。

---

### User Story 3 - 跨品牌平台的统一操作体验 (Priority: P3)

作为一名非专业用户，我不需要理解不同电视系统（Android TV、Amazon Fire TV、LG webOS、Samsung Tizen、Roku）的差异，只要在应用中看到统一的遥控界面，就能用相同的按钮布局完成常见操作。

**Why this priority**: 统一的 UX 减少学习成本，提升产品的整体感，是在基础功能和多设备管理之后对体验的升级；可以独立通过统一 UI 与映射层的设计交付。

**Independent Test**: 在至少两种不同系统的电视上使用同一遥控界面完成“导航菜单并选择一个应用”的任务，用户无需切换不同布局或重新学习操作。

**Acceptance Scenarios**:

1. **Given** 用户分别连接了一台 Android TV 和一台 Samsung Tizen 电视，**When** 用户在两台电视之间切换控制目标，**Then** 遥控界面按钮布局保持一致，只是内部映射到各自平台对应指令。 
2. **Given** 用户在任一受支持平台上打开导航菜单，**When** 用户使用方向键和确认键完成应用选择，**Then** 用户主观感受操作路径在不同平台上是一致的（按钮位置、文字标签、反馈形式相似）。

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

- 当用户所在网络中存在多台同品牌同型号电视时，如何在设备发现列表中清晰区分（如通过可编辑名称 / 房间标签）。
- 当电视暂时离线或网络不稳定时，应用采用自动重连策略：后台静默重试最多3次（间隔递增：2s → 4s → 8s），期间显示"重连中"状态指示器；3次失败后弹出提示引导用户检查网络或手动重试。
- 当用户尝试控制不再在同一网络内的设备时，如何优雅地失败并引导用户重新连接或移除设备。
- 当平台不支持某些按键（例如部分设备没有“主页”或“设置”快捷键）时，如何在 UI 上做禁用或隐藏处理，避免产生误导。
- 用户拒绝授权或中途取消配对流程时，如何回退到安全可预期的状态。

## Clarifications

### Session 2025-12-02

- Q: 移动端应用平台支持范围？ → A: 仅 iOS 平台
- Q: 各电视平台 SDK/协议版本要求？ → A: 仅支持各平台当前主流版本 (Android TV 10+, webOS 4.0+, Tizen 4.0+, Roku OS 10+, Fire OS 7+)
- Q: 网络断开时的重连策略？ → A: 自动重连，后台静默重试最多3次（间隔递增），失败后提示用户
- Q: 设备认证凭据的本地存储方式？ → A: iOS Keychain（系统级安全存储，硬件加密）
- Q: 最大可管理设备数量限制？ → A: 最多10台设备
 - Q: 默认网络环境与拓扑假设？ → A: 仅支持同一局域网/子网内的家庭/小型办公室 Wi‑Fi 网络，不考虑跨子网/VLAN/VPN/公网远程控制

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-000**: System MUST be developed as a native iOS application, targeting iPhone devices. Android platform is explicitly out of scope for MVP.

- **FR-001**: System MUST allow users to discover and list nearby supported TVs (Android TV, Amazon Fire TV, LG webOS, Samsung Tizen, Roku) on the same network或平台允许的发现机制。
  - Minimum supported versions: Android TV 10+, Fire OS 7+, LG webOS 4.0+, Samsung Tizen 4.0+, Roku OS 10+.
  - **FR-001.1 设备发现流程规范**:
    - 系统采用三阶段发现机制：**缓存验证 → 广播发现 → 主动扫描**
    - **Phase 1 - 缓存验证**: 启动发现时，首先并行验证所有已缓存设备的可达性
    - **Phase 2 - 广播发现**: 启动 SSDP/mDNS 广播监听，每 **2 秒**发送一次 M-SEARCH/mDNS 查询
    - **Phase 3 - 主动扫描**: 缓存验证完成后，按优先级顺序扫描网络子网块
    - **广播与扫描协调**: 广播发现 (Phase 2) 与主动扫描 (Phase 3) **并行执行**；当主动扫描结束后，广播发现也同步停止
  - **FR-001.2 UI 状态同步规范**:
    - 在发现过程中（Phase 1-3 任一阶段进行中），UI 应显示 loading 状态
    - 当所有协议的主动扫描结束且广播发现停止后，UI 的 loading 状态应同步结束
    - 用户视觉感观应与实际发现状态保持一致：扫描中 = loading，扫描结束 = loading 结束
  - **FR-001.3 实时反馈规范**:
    - 任何发现方式（缓存验证、广播、扫描）找到设备后，应立即（<100ms）在设备列表中显示
    - 同一设备通过不同方式被发现时，应进行去重处理，不重复显示
  - **FR-001.4 连接时停止发现规范**:
    - 当用户选择任一有效设备并成功建立连接后，系统 MUST 立即停止所有发现活动（包括广播发现和主动扫描）
    - 跳转到遥控器界面前，确保后台无残留的网络扫描任务，以节省网络资源和电量
- **FR-002**: System MUST allow users to complete initial pairing/authorization with a selected TV,并在后续会话中复用已授权的连接信息（不强制重新配对）。认证凭据（如配对令牌、授权密钥）MUST 存储在 iOS Keychain 中以确保安全性。
- **FR-003**: Users MUST be able to control a connected TV via a virtual remote UI including navigation (up/down/left/right), select/OK, back, home, volume up/down, mute, and power (where supported by platform).
- **FR-004**: System MUST support managing multiple TVs (maximum 10 devices), including adding, renaming, selecting active device, and removing devices from the saved list。当达到10台上限时，用户需先删除现有设备才能添加新设备。
- **FR-005**: System MUST persist device list and user-defined labels（如客厅电视、卧室电视），在应用重启后仍能恢复。
- **FR-006**: System MUST provide clear connection status indicators（连接中、已连接、已断开、不可用）并在状态变化时更新 UI。
- **FR-007**: System MUST explicitly NOT require or depend on infrared (IR) hardware; all control MUST be via network-based protocols supported by target platforms。
- **FR-008**: System MUST handle unsupported commands per platform gracefully（例如灰显按钮或在点击时给出提示），避免产生“按了没反应”的体验。
- **FR-009**: System MUST allow users to quickly switch the active TV from within the remote UI or device management view, with the switch taking effect within a short and predictable time窗口。
- **FR-010**: System MUST log key user actions and error events（例如连接失败、指令发送失败）以便后续问题排查和体验优化，但日志内容不得包含敏感个人信息。

### Key Entities *(include if feature involves data)*

- **TVDevice**: 代表一台可被控制的电视设备，包含属性：名称（可编辑）、品牌/平台类型（Android TV / Amazon Fire TV / LG webOS / Samsung Tizen / Roku）、唯一标识符（由平台提供）、最近在线状态、最近连接时间、用户自定义标签等。
- **ConnectionSession**: 代表一次 TV Remote 与电视之间的连接会话，包含属性：目标 TVDevice、连接状态、开始时间、结束时间、错误码/错误原因（如有）、当前网络信息概要。
- **RemoteProfile**: 代表一套虚拟遥控器布局与按键映射配置，包含属性：显示名称、可见按键集合、每个按键在不同平台上的指令映射规则，用于实现跨品牌统一界面下的底层差异适配。

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: 首次安装并打开应用的新用户中，至少 80% 能在 3 分钟内完成与一台电视的首次连接并成功发送至少一条控制指令。
- **SC-002**: 在典型家庭网络环境下，90% 的遥控指令从用户点击到电视响应的时间主观感受为“即时”或小于 200ms（通过可观测的 UI 反馈与用户访谈验证）。
- **SC-003**: 在用户可访问多台电视的场景下，至少 80% 的受访用户认为在设备之间切换控制目标“容易理解且操作简单”（通过可用性测试问卷评估）。
- **SC-004**: 在 MVP 上线后三个月内，与“遥控响应慢/不生效”、“找不到电视设备”相关的支持反馈比例控制在整体反馈的 30% 以下，并通过版本迭代持续下降。
