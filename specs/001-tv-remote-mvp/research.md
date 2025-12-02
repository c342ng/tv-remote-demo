# Research: TV Remote Protocols & Abstraction Layer

## 1. Overall Goals

- 为 Android TV、Amazon Fire TV、LG webOS、Samsung Tizen、Roku 电视提供统一的网络遥控能力（不依赖红外）。  
- 在满足宪法中 UX 一致性与 <200ms 响应时间的前提下，抽象出统一的遥控指令与连接模型，底层由各平台协议适配。  
- MVP 阶段优先支持“发现 + 配对/授权 + 基础按键控制 + 多设备管理”，高级功能（应用启动、文本输入等）暂不纳入范围。

---

## 2. Cross‑Platform Abstraction Strategy

### 2.1 统一遥控指令模型

- **Decision**: 定义一套“规范化遥控指令枚举 + 能力标记”，例如 `UP/DOWN/LEFT/RIGHT/OK/BACK/HOME/VOLUME_UP/VOLUME_DOWN/MUTE/POWER`，所有平台适配器负责将这些指令映射到各自协议。  
- **Rationale**: 满足用户故事 3（跨品牌统一体验）与 FR-003/FR-008，UI 可以完全基于规范化指令渲染，底层差异由适配层处理；能力标记可以驱动“灰显/隐藏不支持的按键”。  
- **Alternatives considered**: 
  - 为每个平台单独设计一套按键集合 → UI 需要感知平台差异，破坏统一体验，被否决。  
  - 仅支持“所有平台都存在”的最小交集按键 → 无法利用部分平台的额外能力（例如某些设备的专用菜单键），扩展性差。

### 2.2 分层架构与适配器模式

- **Decision**: 采用四层结构：`DiscoveryService`（发现）→ `Auth/PairingService`（配对与认证）→ `TVSession`（会话抽象，统一连接与状态）→ `PlatformAdapter`（协议适配，负责协议细节）。  
- **Rationale**: 清晰分离通用逻辑与平台差异，符合宪法“代码复杂度”和“测试分层”要求，可对 `PlatformAdapter` 做单元测试，对 `TVSession` 做集成测试，对完整链路做 E2E。  
- **Alternatives considered**: 
  - 在 UI 直接持有各个平台的 SDK/协议实现 → 违背分层与可测试性原则，导致代码高度耦合。  
  - 使用“超大平台服务类”内部用 `if`/`switch` 分支不同平台 → 难以维护和扩展，多平台增加时复杂度快速上升。

### 2.3 能力协商与 UI 行为

- **Decision**: 每个 `PlatformAdapter` 在连接建立时返回一份 `Capabilities` 描述（是否支持电源键、音量控制、文本输入等），`TVSession` 聚合后提供给 UI；UI 按能力动态控制按钮状态。  
- **Rationale**: 对齐 FR-008（优雅处理不支持的命令）和宪法 UX 一致性原则，避免“按了没反应”的体验，同时为未来扩展（文本输入、应用控制）预留空间。  
- **Alternatives considered**: 
  - 在适配层内部直接吞掉不支持的指令并静默失败 → 用户体验差且难以调试。  
  - 为每个平台手写 UI 变种 → 破坏统一体验，维护成本高。

### 2.4 性能与可靠性策略

- **Decision**: 所有协议通信均采用异步、非阻塞 I/O；指令发送采用“发送队列 + 超时重试 + 明确错误码”，在 UI 层提供 <100ms 的本地反馈（例如按钮高亮、loading）并在 200ms 内期望收到电视端 ACK 或超时。  
- **Rationale**: 对齐宪法“Performance & Availability”和 SC-002，对网络抖动有一定容错能力，日志中可记录失败原因供调试。  
- **Alternatives considered**: 
  - 简单 fire-and-forget 模式（不跟踪 ACK、不设超时） → 难以判断失败与成功，无法满足调试和体验要求。  
  - 在 UI 阻塞等待网络返回后才更新状态 → 容易出现明显卡顿，不符合 <100ms 反馈要求。

---

## 3. Android TV & Amazon Fire TV（Android 系列）

> 这两个平台底层均基于 Android/Fire OS，具备相似的调试与远程控制能力，可共享一套协议实现与大部分适配逻辑。

### 3.1 控制协议选择

- **Decision**: MVP 阶段采用 **ADB over TCP** 作为 Android TV 与 Fire TV 的主要控制通道，通过向设备发送 `input keyevent`/`input keyevent --longpress` 等命令来实现方向键、返回、主页、音量和电源控制。  
- **Rationale**: 
  - ADB 协议公开、文档丰富，社区已有大量实践，可在 demo 场景中快速验证多平台遥控能力。  
  - 同一实现可以覆盖 Android TV 与 Fire TV，降低 MVP 成本，便于后续扩展到其它 Android‑based 设备。  
- **Alternatives considered**: 
  - 使用官方 Android TV Remote / Google TV Remote 协议（App 内部使用）→ 协议细节未正式公开，第三方实现存在兼容性与法律风险。  
  - 为每台电视安装伴生应用，通过自定义 WebSocket/gRPC 通信 → 用户门槛高（需在电视上安装 App），不符合 MVP“开箱即用”的期望。

### 3.2 设备发现与连接

- **Decision**: 
  - 首选通过 mDNS/NetBIOS/局域网扫描找到开启 ADB 的设备（常见端口 5555），并结合用户输入的 IP 地址作为补充路径。  
  - 连接时要求用户在电视端开启“ADB 调试”并接受首次连接授权。  
- **Rationale**: 
  - Android 生态下“启用 ADB 调试 + 通过局域网连接”是公开且可行的路径，适合作为 demo 的技术路线。  
  - 允许用户手动输入 IP 可避免某些网络环境下的广播/发现受限问题。  
- **Alternatives considered**: 
  - 完全依赖局域网扫描 + 端口探测 → 在复杂网络（VLAN、隔离 AP）下成功率不高。  
  - 要求用户手动配置所有设备 IP → 初次使用门槛高，不符合 UX 要求。

### 3.3 按键映射

- **Decision**: 建立规范化指令到 Android KeyEvent 的映射表，例如：
  - `UP/DOWN/LEFT/RIGHT` → `KEYCODE_DPAD_UP/DOWN/LEFT/RIGHT`  
  - `OK` → `KEYCODE_DPAD_CENTER`  
  - `BACK` → `KEYCODE_BACK`  
  - `HOME` → `KEYCODE_HOME`  
  - `VOLUME_UP/DOWN` → `KEYCODE_VOLUME_UP/DOWN`（需要 TV 端允许）  
  - `MUTE` → `KEYCODE_VOLUME_MUTE` 或通过音量状态切换实现  
  - `POWER` → 仅在设备支持相应命令时暴露该能力。  
- **Rationale**: Android KeyEvent 映射稳定且文档完备，绝大多数字段在 Android TV 与 Fire TV 上行为一致，利于单一实现复用。  
- **Alternatives considered**: 
  - 使用更底层的 input 命令或私有接口 → 增加实现复杂度且风险更高。  
  - 仅支持方向与确认键，忽略音量/电源 → 虽可简化实现，但体验弱于物理遥控器。

### 3.4 限制与风险说明（记录决策约束）

- **Decision**: 明确在文档中标记“Android/Fire TV 控制依赖用户手动开启开发者选项和 ADB 调试，该实现主要面向 demo 与开发者场景”。  
- **Rationale**: 遵守用户预期管理与合规要求，避免普通用户误解为“无配置即可控制任意 Android TV”。  
- **Alternatives considered**: 
  - 隐藏这一限制，只在 FAQ 中提到 → 容易导致用户困惑和差评。  
  - 为规避 ADB 要求而完全放弃 Android/Fire 支持 → 大幅削弱 demo 价值，与需求不符。

---

## 4. LG webOS

### 4.1 控制协议选择

- **Decision**: 使用官方的 **webOS TV WebSocket Remote API**（常见社区实现如 `lgtv2` 等）作为主要控制通道，通过 WebSocket 发送 JSON 命令实现按键控制。  
- **Rationale**: 
  - 官方协议允许第三方应用在局域网内以安全方式控制电视，包括按键、应用、音量等操作。  
  - 不需要在电视端安装额外 App，仅需一次性授权，满足 MVP“接近即用”的目标。  
- **Alternatives considered**: 
  - 使用已停止维护的 ConnectSDK 或非官方桥接服务 → 依赖额外组件，长期可维护性差。  
  - 自建伴生应用在电视端监听自定义端口 → 增加用户安装步骤，门槛过高。

### 4.2 配对与认证

- **Decision**: 采用 webOS 官方配对流程：首次连接时电视弹出配对码/确认框，用户在手机上确认；成功后保存返回的 client key，后续连接复用该 key。  
- **Rationale**: 
  - 与 LG 官方 Remote App 一致，用户认知成本低。  
  - 可以安全地限制未授权客户端访问，符合安全与隐私要求。  
- **Alternatives considered**: 
  - 每次连接都重新请求授权 → 频繁弹窗影响体验。  
  - 尝试跳过授权流程直接发送命令 → 多数设备会拒绝连接，且存在安全风险。

### 4.3 按键映射与能力

- **Decision**: 使用 WebSocket API 提供的 `button`/`command` 接口映射规范化指令，如 `UP/DOWN/LEFT/RIGHT/ENTER/BACK/HOME/VOLUME_UP/DOWN/MUTE`；通过 API 查询设备支持的其他键和值班能力，填充 `Capabilities`。  
- **Rationale**: 协议提供清晰的按键名称和事件模型，能够比较完整地覆盖传统遥控器行为；查询能力可以判断是否支持电源控制等高级功能。  
- **Alternatives considered**: 
  - 仅靠社区文档硬编码部分按键集合 → 容易在不同型号/系统版本上出现不兼容。  
  - 不做能力探测，假设全部支持 → 会在部分设备上导致“按了没反应”。

---

## 5. Samsung Tizen

### 5.1 控制协议选择

- **Decision**: 采用 **Samsung Smart TV / Tizen WebSocket Remote Control Protocol**（常用端口 8001/8002，后者为加密通道），通过 WebSocket 发送编码后的按键信息。  
- **Rationale**: 
  - 协议已被社区广泛逆向与实践，用于第三方遥控 App，支持常用按键和基本控制。  
  - 可通过带有应用名称/设备名称的 handshake 提升用户可见性，让电视端识别连接来源。  
- **Alternatives considered**: 
  - 使用旧版基于 HTTP 的控制接口（部分早期型号）→ 型号兼容性问题较多，且可能已被禁用。  
  - 构建 Tizen 本地 Companion App 并通过局域网桥接 → 提升复杂度和安装门槛。

### 5.2 按键映射与兼容性

- **Decision**: 为 Tizen 维护一份“TV Remote 核心按键 → Tizen KeyCode”映射表（如 `KEY_UP/DOWN/LEFT/RIGHT/ENTER/BACK/HOME/VOLUP/VOLDOWN/MUTE` 等），并对部分机型差异（如 `KEY_RETURN` vs `KEY_BACK`) 做容错处理。  
- **Rationale**: 不同年份/系列的 Tizen TV 在按键命名上略有差异，通过适配层集中处理可以避免 UI 感知这些差异。  
- **Alternatives considered**: 
  - 只支持一部分“最常见”的 KeyCode，不做兼容层 → 在旧机型上可能出现按键无效。  
  - 在运行时对所有可能 KeyCode 逐一探测 → 开销大且实现复杂。

---

## 6. Roku TV

### 6.1 控制协议选择

- **Decision**: 使用官方文档公开的 **Roku External Control Protocol (ECP)** 作为主要控制通道，通过 HTTP 请求（默认端口 8060）发送 `/keypress/<KEY>` 等命令。  
- **Rationale**: 
  - ECP 是官方支持、稳定且文档完善的协议，适合第三方遥控和集成。  
  - 基于简单的 HTTP，使得实现与调试非常直观，易于在移动端与后端环境中统一实现。  
- **Alternatives considered**: 
  - 使用非公开的更底层协议或 WebSocket 连接 → 缺乏文档且维护风险高。  
  - 要求用户安装 Roku 客户端 App 作为桥接 → 不必要地增加安装步骤。

### 6.2 设备发现与配对

- **Decision**: 使用 Roku ECP 定义的 SSDP/UPnP 广播机制发现设备（搜索 `roku:ecp` 服务），自动列出可用 Roku 电视，并通过 ECP 的 `/query/device-info` 接口获取设备信息与名称；ECP 默认无需额外配对，仅在同一局域网即可控制。  
- **Rationale**: 
  - 官方推荐发现方式，用户只需保证手机与电视在同一网络。  
  - 通过设备信息接口可以填充 `TVDevice` 实体中的品牌、型号等字段，提升多设备场景下的可辨识度。  
- **Alternatives considered**: 
  - 仅通过 IP 扫描猜测 Roku 设备 → 需要维护端口与特征指纹，易出错。  
  - 在应用内要求用户手动输入 IP → 用户体验差。

### 6.3 按键映射

- **Decision**: 基于 ECP 的 `/keypress` 端点，将规范化指令映射到对应的 Roku key（如 `Up/Down/Left/Right/Select/Back/Home/VolumeUp/VolumeDown/VolumeMute/PowerOff` 等），并通过 ECP 文档确认各键支持情况。  
- **Rationale**: 通过直接使用官方 key 名称可以最大化协议兼容性；对缺失 key（例如部分型号不支持电源控制）则通过 `Capabilities` 标记为不支持。  
- **Alternatives considered**: 
  - 通过 `/keydown`/`/keyup` 组合模拟长按和复杂操作 → 对 MVP 来说超出范围，增加实现复杂度。  
  - 只使用最基础的方向和确认键 → 体验不足以替代物理遥控。

---

## 7. 抽象层设计决策总结

### 7.1 实体与数据模型

- **Decision**: 按 feature spec 中的定义，持续使用 `TVDevice`、`ConnectionSession`、`RemoteProfile` 三个核心实体，并在 `TVDevice` 中增加 `platform`（AndroidTV/FireTV/webOS/Tizen/Roku）、`capabilities`、`lastSeenAt` 等字段。  
- **Rationale**: 与需求文档保持一致，方便在多设备管理与状态展示中直接复用；`platform + capabilities` 组合是协议适配和 UI 渲染的核心输入。  
- **Alternatives considered**: 
  - 为每个平台单独定义实体（如 `AndroidTvDevice`、`RokuDevice`）→ 型号/平台扩展时实体爆炸。  
  - 使用过于通用的 key‑value 结构存储平台信息 → 类型不安全且难以维护。

### 7.2 连接与会话抽象

- **Decision**: 把所有底层连接统一抽象为 `TVSession`：封装连接状态、错误码、最近心跳时间以及一个 `sendCommand(RemoteCommand)` 接口；`TVSession` 持有平台特定 `PlatformAdapter` 实例。  
- **Rationale**: 满足 FR-006 对连接状态的要求，同时便于在多设备切换时快速替换 session；也方便在日志中统一记录连接行为。  
- **Alternatives considered**: 
  - UI 直接持有 `PlatformAdapter` 并管理连接细节 → 状态分散在多处，不利于调试和扩展。  
  - 为每个平台独立定义会话对象 → 上层切换目标设备的逻辑会变复杂。

### 7.3 多设备管理与当前目标

- **Decision**: 使用一个 `DeviceManager`/`DeviceStore` 抽象维护设备列表和当前激活设备 ID，所有遥控操作必须通过当前激活 `TVSession` 发送；切换设备时仅更改当前 ID 并重建/复用对应 session。  
- **Rationale**: 符合 User Story 2 与 FR-004/FR-005，便于在 UI、日志和后台逻辑中统一理解“当前控制目标”。  
- **Alternatives considered**: 
  - 允许多个并行“激活设备”，UI 同时发送指令到多台电视 → 增加心智负担且与常规遥控使用心智不符。  
  - 在每个页面单独管理当前设备 → 状态容易不一致。

### 7.4 错误处理与可观测性

- **Decision**: 为所有 `PlatformAdapter` 统一定义错误码枚举（如 `NETWORK_UNREACHABLE`, `AUTH_FAILED`, `COMMAND_UNSUPPORTED`, `TIMEOUT` 等），在 `TVSession` 层标准化为用户可见的错误消息模板，并记录到日志中。  
- **Rationale**: 对齐 FR-010 与宪法“错误处理”和“合规检查”的要求，有利于问题定位与后续优化。  
- **Alternatives considered**: 
  - 直接将底层异常字符串呈现给用户 → 语言混杂、难以理解且可能泄露实现细节。  
  - 在适配层吞掉大部分错误 → 导致“没反应”的体验。

---

## 8. 已解决的 NEEDS CLARIFICATION（针对本研究范围）

在本 research 中，关于“各 TV 平台遥控协议与抽象层设计”以及测试/环境开关的关键不确定点已被收敛为以下决策：

1. **控制通道选择**：确定 Android/Fire 采用 ADB over TCP，LG webOS 采用官方 WebSocket API，Samsung Tizen 采用 WebSocket Remote 协议，Roku 采用 ECP。  
2. **抽象层结构**：采用 `Discovery + Auth + Session + Adapter` 四层模型，统一指令枚举与能力描述。  
3. **多设备与 UX 行为**：通过 `TVDevice`/`TVSession`/`DeviceManager` 组合实现统一的多设备管理与能力驱动的 UI。  
4. **E2E 测试工具选型**：
  - **Decision**: MVP 采用 **Detox** 作为 React Native E2E 测试框架（iOS 目标），利用其对 RN/Expo 的成熟支持和并发测试能力。  
  - **Rationale**: Detox 在 RN 社区被广泛使用，支持在 CI 中运行、可控制网络/存储 mock，便于覆盖“连接设备、发送指令、多设备切换”等关键流程。  
  - **Alternatives considered**: Maestro（脚本语法更简洁但对 RN/Expo 生态集成度略低）、Appium（通用性强但维护成本与编写成本更高）。  
5. **Mock 环境变量策略**：
  - **Decision**: 使用 Expo/React Native 环境变量 `TV_REMOTE_ENV` 控制 mock 逻辑：
    - 当 `TV_REMOTE_ENV === "mock"` 时，抽象层使用 `mocks/` 下的虚拟 `PlatformAdapter` 和发现/会话实现，只模拟成功/失败路径与状态机，不实际访问网络。
    - 其他值（包括未设置）一律视为 **生产/真机模式**，始终使用真实协议实现。  
  - **Rationale**: 满足“默认真机模式”的需求，避免在生产环境误启 mock；同时便于在本地与 CI 中通过环境变量安全切换到 mock，以支持无设备的自动化测试。  
  - **Alternatives considered**: 使用 `NODE_ENV` 或 Expo profile 名称区分 → 易与其他构建配置混淆；通过运行时 UI 开关切换 mock → 有被误触导致生产环境不连真机的风险。

在当前阶段，与“原生模块选型、具体依赖库版本、持久化实现细节”相关的细节仍可在实现时细化，但不会改变上述抽象层、测试策略与环境切换策略的总体方向。


## 9. OpenAI 研究报告

本研究文档详细比较了 Android TV、Amazon Fire TV、LG webOS、Samsung Tizen、Roku 五大智能电视平台的远程控制协议和开发支持库，为实现一个跨平台的网络遥控 MVP 提供技术参考。各平台章节涵盖当前主流设备所用的控制协议版本、技术细节差异，以及推荐的 React Native/JavaScript 三方库和示例代码。文末讨论如何通过适配器模式抽象各平台，实现统一的遥控接口。
## <a name="android-tv-平台"></a>Android TV 平台
**主流遥控协议：**Android TV 目前主要有两种网络遥控方案：一是 **ADB 调试桥**（Android Debug Bridge）协议，二是 **Android TV Remote Service** 官方协议（即 Google TV 手机遥控应用使用的协议，常称“Android TV Remote Protocol v2”）。ADB 协议需要在电视端开启开发者模式和网络调试，而官方 Remote 协议无需开发者选项，使用系统预装的 Android TV Remote Service，在局域网通过 TCP 端口 6466/6467 通信。

- **ADB 方案：**通过 ADB over TCP（典型端口 5555）连接电视，并发送键事件命令，例如 adb shell input keyevent 等。此方案适用于 Android/Fire 等所有基于 Android 的设备，但要求用户在电视上启用 USB调试并授权连接。一旦连接，应用可发送标准 Android 按键码（KEYCODE）来导航和控制音量、电源等。优点是实现简单、可发送广泛指令（包括启动应用等），但 **缺点** 是初次设置复杂、需要用户授予开发调试权限，且在某些设备上性能偏慢。另外，ADB 通信采用 RSA 密钥认证以确保连接安全，但仍需在首次连接时在电视上确认信任主控端。
- **官方 Remote 协议 (v2)：**这是 Google 提供的 Android TV 远程控制服务使用的协议，对用户透明且更高效。Android TV 设备通过 mDNS 广播 \_androidtvremote.\_tcp 服务，监听 **TCP 6467** (配对端口) 和 **6466** (遥控指令端口)。移动端应用先连接6467端口进行**配对**：电视弹出 4 位数字 PIN 码，用户在客户端输入，利用协议中的 **Jumbo** （基于 Google Polo/J-PAKE）算法校验双方 PIN，一旦验证成功双方交换证书用于加密后续通信。配对完成后客户端保存**数字证书/密钥**（例如 Node 实现中通过 getCertificate() 获取)。之后通过 6466 端口建立加密连接发送遥控指令。**技术特性：**Remote协议使用 Google ProtoBuf 定义消息格式并通过 TLS 双向认证加密传输（使用配对生成的证书）。支持**按键种类**非常全面——相当于 Android KeyEvent 的键值集合，例如导航方向键、确认 (Enter/OK)、返回、Home、音量、播放控制等。同时还能发送应用深链 URL 来启动指定应用。协议还支持**状态事件**：如电视电源状态、当前音量变化等会推送到客户端。
- **版本兼容性：**Android TV Remote Protocol v2 于 Android 8+ 广泛部署，取代了旧的 Google TV “Anymote”协议（Anymote 使用端口 9552，已弃用）。因此主流 Android TV（索尼、TCL、小米等品牌的 Android TV/Google TV 设备）均支持官方协议v2，而无需任何第三方app或ADB。但对于非常旧的设备（Android 5.0/6.0时代）可能仅能使用 ADB 或蓝牙遥控。此外，第三方定制ROM设备不预装 Remote Service 时，也只能退而求其次使用 ADB 方案。

**React Native/JS 开发支持：**

- *androidtv-remote* （npm）：基于上述官方协议的 Node.js 实现库。提供 AndroidRemote 类封装配对与通信，支持事件回调（如 on('secret') 提示输入PIN码、on('ready')表示连接就绪）和方法如 sendKey(code) 发送按键、sendAppLink(url) 打开应用等。该库纯 JS 实现，但**维护状态**较旧（最新 1.0.10 发布于 4年前），社区活跃度一般（~85 stars）。React Native 环境使用该库需要polyfill Node的 net/TLS 模块，难度较高。社区有一个衍生的 RN 移植版 **react-native-androidtv-remote**（GitHub:vricosti）将其逻辑封装为 RN 模块，通过 react-native-tcp-socket 实现底层通信。RN 版需要原生依赖（自定义 iOS TLS patch 和 Android Keystore 用于证书存储），目前为开发者预览状态（star很少）。
- *@cldmv/node-android-tv-remote* （npm）：通过 ADB 协议控制 Android TV 的库，最新版本 2.1.0（发布于 2025年11月）。它封装了 ADB连接和键码发送逻辑，使用纯 JS 的 ADB客户端实现，无需安装 adb 二进制。该库**仅限 Node.js 环境**，在 RN 中可能需要原生桥接 Socket 连接端口5555。优势是维护活跃且 API 简单，例如可调用 .sendKey(KEYCODE\_HOME) 或 .typeText("...") 等方法来控制。但由于依赖ADB，此方案在用户体验上不如官方协议顺畅。
- *其他：*GitHub 上还有 AndroidTV Remote CLI 工具和 Homebridge-AndroidTV 插件，它们背后亦使用类似技术。Home Assistant 的 Android TV 集成默认走 ADB（也可选 Tronikos 的 androidtvremote2 Python库）。对于React Native开发，若选择ADB方案，或可考虑调用安卓原生的 adb 接口（需要设备ADB授权，复杂度较高），因此更倾向使用官方协议配合现有JS库。

**示例代码：**

以下演示通过 Android TV Remote 协议发送导航和音量指令的过程（Node.js 环境下）。React Native 中实现需类似逻辑，或使用上面提到的 RN 模块：

const { AndroidRemote, RemoteKeyCode, RemoteDirection } = require('androidtv-remote');\
let remote = new AndroidRemote('192.168.1.12', {\
`    `pairing\_port: 6467, remote\_port: 6466, name: 'MyRemoteApp', cert: {} \
});\
remote.on('secret', () => {\
`    `// 在终端提示输入电视上显示的PIN码\
`    `prompt("Enter pairing code:", code => remote.sendCode(code));\
});\
remote.on('ready', () => {\
`    `console.log('配对完成，开始发送指令');\
`    `// 发送“音量静音”按键的短按操作\
`    `remote.sendKey(RemoteKeyCode.MUTE, RemoteDirection.SHORT);\
`    `// 发送导航“向上”长按开始和结束\
`    `remote.sendKey(RemoteKeyCode.DPAD\_UP, RemoteDirection.START\_LONG);\
`    `setTimeout(() => {\
`      `remote.sendKey(RemoteKeyCode.DPAD\_UP, RemoteDirection.END\_LONG);\
`    `}, 500);\
});\
await remote.start(); // 建立连接，触发上述事件流程

*代码说明*: 初始化时提供电视IP和应用名称，secret事件触发表示电视请求PIN码输入。完成配对后，通过sendKey发送按键，RemoteKeyCode 使用Android标准键码枚举（例如 DPAD\_UP对应方向上）。上例演示了静音键和模拟长按向上导航键。实际应用中，可将这些操作封装到统一的“RemoteAdapter”接口中，以平台无关的方法调用。
## <a name="amazon-fire-tv-平台"></a>Amazon Fire TV 平台
**主流遥控协议：**Amazon Fire TV 基于 Fire OS（Android 定制版），可支持ADB调试协议，同时也有自有的**Fire TV Remote**通信协议。**主流 Fire TV 设备**（如 Fire TV Stick/Cube 等）默认使用 Amazon 官方遥控App，通过本地网络配对控制。该官方协议与Android TV类似，需要初始配对 PIN 验证，但实现细节不同（Amazon称为 “Whisperplay/Whisperlink” 服务）。主要特性：

- Fire TV **本地配对**：当手机上的 Fire TV 遥控App连接同一网络中的 Fire设备时，电视会显示一个临时4位 PIN码，App需要通过协议发送此PIN进行配对。配对过程采用 **J-PAKE** 算法在双方基于PIN建立安全会话。Bitdefender安全白皮书指出，Fire TV 的 *WhisperPlay* 服务使用 J-PAKE 来生成共享密钥，从而在不泄露 PIN 的前提下完成认证。一旦配对通过，客户端获得长期授权，可以在后续会话中直接连接而无需再次输入PIN。
- **通信方式**：Fire TV 遥控协议通过局域网的**加密 WebSocket**连接传输指令。设备在启动时会打开一个随机端口来监听遥控服务（被称为 Whisperlink 服务），手机App通过发现机制找到设备IP和端口。初始握手可能通过 HTTP 请求启动WebSocket（例如 POST /whisperlink 携带特定头，建立会话），随后升级为 WebSocket 安全通道进行实时控制。**指令集**包括导航、选择、返回、主页、菜单以及播放控制，与 Fire 遥控器上的按键一致。由于 Fire TV 深度集成 Alexa 语音，有些App也支持通过网络指令触发语音输入或应用启动。
- **协议版本差异**：Fire OS 各版本对遥控协议保持兼容。2014~2016早期 Fire TV 使用的配对和通信机制类似，但随着 Alexa 语音遥控引入，可能扩展了语音指令支持。当前（Fire OS 7, 基于Android 9）依然采用 PIN+WebSocket 方案，未公开的协议细节通过逆向和社区研究掌握。需要注意 Amazon Fire TV **不支持** Android TV的Remote Service协议，因为其系统中并无 Google 提供的服务，所以必须使用 ADB 或 Amazon 自有协议。

**React Native/JS 开发支持：**

Fire TV 官方遥控协议未公开标准API，社区现有JS库非常有限：

- 许多现有实现选择 **ADB 方法** 控制 Fire TV。例如 node-android-tv-remote（ADB版）库同样适用于 Fire TV，只要用户在 Fire 设备上开启开发者模式和ADB调试。由于 Fire OS 本质为 Android，ADB方式发送按键（如 KEYCODE\_DPAD\_\*）在 Fire TV 上对应的操作与 Android TV 一致。实践表明，**Fire TV ADB** 控制的性能略逊于官方协议且需要用户设置，但在缺乏官方API时是可行方案。
- 社区有尝试逆向 Fire 协议。例如 GitHub 项目 *foxy82/pi-usb-gadget-controller* 绕过网络协议，改用Raspberry Pi伪装成USB键盘发送指令；但这不属于纯软件方案。另有开发者建议抓包分析官方 Fire TV App流量来仿真。截至目前，没有成熟的纯JS库直接实现 Fire TV WebSocket 遥控协议（J-PAKE过程较复杂）。如果必须实现，可考虑利用现有 Python 项目参考然后用 JS 重写，但工作量较大。
- 另辟途径：**Alexa APIs**。通过 Alexa 云端技能可以控制 Fire TV（例如Alexa可以打开App、播放/暂停）。然而这涉及联网和用户账户链接，不符合“无需联网”的要求，也无法在本地LAN离线使用。因此不在 MVP 范围内。

综上，开发 Fire TV 遥控 MVP 时，**推荐优先使用ADB适配**方案以减少不确定性。即在我们的adapter中对 Fire TV 设备尝试通过 ADB连接（与Android TV共用实现）。需提醒用户打开 Fire TV 的开发者调试开关，配对后保存调试授权，后续即可一键连接控制。未来如 Amazon 开放本地控制API或社区实现JS协议库，再行评估替换。

**示例代码：**

以下示例展示通过 Node.js ADB 客户端库连接 Fire TV 并发送按键（React Native 可用类似思路，通过适配器调用原生ADB模块或JS实现ADB协议）：

import { AndroidTV } from '@cldmv/node-android-tv-remote';\
// 假设 Fire TV IP 已知且开发者调试已启用\
const fireTv = new AndroidTV("192.168.0.50");\
await fireTv.connect();  // 建立ADB TCP连接，默认5555端口\
await fireTv.sendKey(19);  // 发送 DPAD\_UP (键码19) 上导航\
await fireTv.sendKey(23);  // 发送 DPAD\_CENTER (键码23) 确认/OK\
await fireTv.sendKey(3);   // 发送 HOME 键 (键码3)\
await fireTv.disconnect();

*代码说明*: 上述 node-android-tv-remote 库将常用按键枚举为常量，这里直接使用对应的键码演示。发送前需确保 Fire TV 上已授权ADB调试（首次运行时会弹出信任对话框）。适配到 React Native 时，可以在JS层封装对ADB服务的调用（若实现纯JS ADB协议）或者通过 NativeModule 利用 Android Debug Bridge库。考虑用户体验，应在UI中引导开启调试并在App内检测连接状态，提示用户完成授权。
## <a name="lg-webos-平台"></a>LG webOS 平台
**主流遥控协议：**LG webOS 电视通过**第二屏 API**提供网络遥控功能。其核心是一个 WebSocket 网关（WebOS **Connect SDK** 所利用的接口），允许移动App以**SSAP (Simple Service Access Protocol)**协议发送控制命令。典型地，LG电视在端口 3000 提供 WebSocket 服务。**初次连接**需要配对授权：电视弹出对话框询问是否允许某客户端连接（或显示 PIN 码），用户确认后电视会生成一串 **client key** 返回客户端。客户端下次连接时应携带该密钥以跳过再次授权，从而实现**免密自动重连**。

- **连接建立：**默认使用 ws://<TV\_IP>:3000 建立非加密WebSocket。新版电视（尤其 WebOS 4.x 2018年后）支持并**可能强制**使用 wss://<TV\_IP>:3001 加密连接。一般应用层SDK会自动处理：例如 ConnectSDK 会先尝试 3001 TLS，若失败再退到3000。用户需在电视设置中开启“LG Connect Apps”或“Mobile TV On”功能才能允许局域网控制。
- **SSAP协议细节：**SSAP 使用 JSON 格式消息，每条消息包含 "type":"request" 和 "uri":"ssap://service/endpoint" 等字段。LG将不同遥控功能划分在若干API服务下，例如:
- ssap://system/turnOff 发送关机指令。
- ssap://audio/getVolume 可订阅音量变化。
- ssap://media.controls/play/pause 控制媒体播放。

大部分**按键**操作（方向导航、确认、返回等）通过一个特殊的 **“pointer input”** 子协议实现。webOS会在 WebSocket 握手后提供一个用于模拟遥控器鼠标和按键的附加套接字（URI 带有 .pointer.sock）。客户端需发送诸如 type: "button", name: "HOME" 或 type: "click" 等消息来触发相应按键。社区通过逆向发现，上下左右等按键用 pointer API 来实现，“OK/Enter”等通过 keyboard API 实现。尽管LG未公开文档，但开源项目（如 openHAB、homebridge-webos-tv）已经支持完整按键映射。

- **版本差异：**webOS **3.x (2016~2017)** 及更早版本允许不加密连接，UI上每次新客户端连接弹出确认框。**webOS 4.x~6.x (2018~2021)** 增强了安全：支持客户端证书和PIN配对模式（可要求App输入 TV 显示的 PIN）。不过常规情况下仍是一次授权永久信任（凭 client key）。此外，LG在2018年起为专业集成推出了**“Network IP Control”**模式：在电视隐藏菜单下启用后，可获取一个 8位 Keycode，用于经TCP端口以特定加密协议发送指令。该模式主要面向高级家庭自动化（Crestron/Control4等）。本项目MVP优先使用标准 WebSocket 接口，不要求用户进入隐藏菜单。需要注意的是，**最新 webOS 6.x+** 设备若默认开启加密，客户端需使用 LG官方证书或特定SSL配置才可连接，开发时可借助 ConnectSDK 等库简化处理。

**React Native/JS 开发支持：**

- *lgtv2* （npm）：经典的 Node.js LG webOS 控制库，MIT协议，由 hobbyquaker 开发。它基于 WebSocket实现 SSAP，内部自动处理配对和 key 存储（默认将授权Key保存在 ~/.lgtv2/keyfile-<hostname>）。使用方式简单，传入 url: 'ws://<tv\_ip>:3000' 即可连接。提供 request(uri, payload, cb) 和 subscribe(uri, cb) 方法调用各种API。例如 lgtv.request('ssap://system/turnOff', ...) 可关机。维护情况：最近一次 1.5.x 发布在 2018年，但由于协议稳定，该库仍被广泛使用（337 stars）。在 React Native 中，可以利用 WebSocket 原生支持直接连接（3000端口默认非SSL，可直接使用），因此**可在JS层直接使用**（无需原生模块）。需注意保存 client key 的功能要在移动端实现（可将 key 保存到 AsyncStorage）。
- *lgtv-ip-control* （GitHub: WesSouza）：纯JS的 LG IP Control 库，专为 **2018+ 需要加密**的模式设计。支持隐藏菜单启用的Telnet式协议，使用8位Keycode进行AES加密通信。该库使用TCP Socket，需要 Node.js 环境，React Native需自定义模块支持。由于其用途小众（要求用户进入隐藏菜单获取密钥），不在MVP首选方案。
- *homebridge-webos-tv* / *iobroker.lgtv* 等：这些项目基于 lgtv2 或类似实现，可作为参考。尤其 homebridge 插件维护者对按键支持、开机(WoL)等实现了封装，在阅读其源码后可了解如何调用 pointer.sock 进行方向键点击。

**示例代码：**

下面演示使用 lgtv2 库订阅音量变化并调节音量的例子，以及发送导航按键的思路：

const lgtv = require("lgtv2")({ url: "ws://192.168.1.15:3000" });\
\
// 连接错误处理\
lgtv.on('error', err => console.error("Connection error:", err));\
\
// 连接成功后订阅音量变化事件\
lgtv.on('connect', () => {\
`  `console.log("LG TV connected");\
`  `lgtv.subscribe('ssap://audio/getVolume', (err, res) => {\
`    `if (err) return console.error("Subscribing volume failed:", err);\
`    `if (res.changed.includes('volume')) {\
`      `console.log("当前音量:", res.volume);\
`    `}\
`    `if (res.changed.includes('muted')) {\
`      `console.log("静音状态:", res.muted);\
`    `}\
`  `});\
\
`  `// 将音量增加一级\
`  `lgtv.request('ssap://audio/volumeUp', (err, res) => {\
`    `if (!err) console.log("Volume up command sent");\
`  `});\
\
`  `// 发送方向键“上一频道”（Channel Up相当于上方向键示例）\
`  `lgtv.request('ssap://tv/channelUp', (err, res) => {\
`    `if (!err) console.log("Channel Up (simulated Up key) sent");\
`  `});\
});

*说明*: 通过 subscribe('ssap://audio/getVolume', ...) 可以实时监听音量和静音变化。request('ssap://audio/volumeUp') 则调用提高音量的API。LG没有直接暴露“Up”等导航键的SSAP接口，但可借助类似 channelUp/channelDown 等作为上/下的功能模拟，或使用 pointer 接口实现精确导航。如果需要完整方向控制，RN 可以借助 WebSocket 在低级别发送 type: "button", name: "UP" 等消息到 .../netinput.pointer.sock（openHAB 实现表明连接成功后会提供该 socket路径）。考虑 MVP 范围，普通频道/音量/应用启动/关机等功能均可通过标准 SSAP 调用完成，复杂的键鼠操作可列为后续增强。
## <a name="samsung-tizen-平台"></a>Samsung Tizen 平台
**主流遥控协议：**Samsung 智能电视 (2016 年后搭载 Tizen OS) 提供了基于 WebSocket 和 REST 的本地控制接口，通常称为 **Samsung Smart TV WS API** 或 **Samsung ECI (Encrypted Control Interface)**。对开发者而言，核心使用方式是通过 WebSocket 连接电视的端口 8001 或 8002，并调用 /api/v2/ 下的控制服务。**主要特点：**

- **API 发现**：电视在局域网广播 SSDP 服务，可通过 HTTP 查询 http://<TV\_IP>:8001/api/v2/ 获取设备信息和能力，其中包含 tokenAuthSupport 字段指示是否需要Token认证。一般2017年及以后型号返回 "tokenAuthSupport": true，表示要求加密与token。
- **握手与配对**：首次连接时，客户端应根据设备支持情况选择：
- 若 **需要 Token**（新款，如 Q系列,N系列等）：使用 **安全WebSocket (TLS)** 连接 wss://<TV\_IP>:8002/api/v2/channels/samsung.remote.control?name=<Base64\_app\_name>。电视会弹出允许提示（有的旧型号显示 PIN码，新型号一般按“允许”即可），一旦用户同意，电视会在 WebSocket 消息中返回一个 authToken。客户端应保存该 token，并在下次连接时在 URL 中附加 &token=<token>以绕过确认。
- 若 **不需要 Token**（老款 2016款 K系列及以前）：使用明文WebSocket连接 ws://<TV\_IP>:8001/api/v2/channels/samsung.remote.control?name=<...> 即可，不涉及token。这些机型通常使用旧的鉴权方案（如早期 Orsay 系列要求预共享AES密钥），但对于 2016/Tizen初代电视，Samsung 默认内置弱加密或免密模式，允许直接发送按键。

**注意：**name参数是将应用名称Base64编码后传入，电视会将其用于识别客户端，并在授权对话中显示。例如 "U2Ftc3VuZ1JlbW90ZUFwcA==" 解码为 "SamsungRemoteApp"。首次握手成功后，电视端会分配一个客户端ID和connectTime等。

- **指令与事件**：握手完成、通道建立后，客户端通过发送 JSON 消息来发出指令。消息格式通常为：

  {\
  `  `"method":"ms.remote.control",\
  `  `"params": {\
  `    `"Cmd": "Click", "DataOfCmd": "KEY\_VOLUP", "Option": "false", "TypeOfRemote": "SendRemoteKey"\
  `  `}\
  }

  其中 DataOfCmd 指定按键命令，如 KEY\_VOLUP, KEY\_VOLDOWN, KEY\_MENU, KEY\_UP, KEY\_ENTER 等。这些键名与三星红外遥控器按键代码一致。电视接收后执行相应操作。三星电视还提供 REST 接口获取应用列表、启动应用等（如 GET http://<IP>:8001/api/v2/applications, 或通过 WebSocket 发送 "event":"ed.apps.launch" 消息）。此外，还有 /api/v2/ 下的通知通道，可订阅如播放状态、当前app信息等（Home Assistant 集成利用了此WebSocket的推送能力）。
- **版本差异**：**Tizen 2016 (含以前 Orsay)** 使用旧版加密协议（社区称之为 "v1", 需要预共享密钥或设备ID），**Tizen 2017+** 引入上述 token 机制（称为 "v2"）。对于2016“K系列”部分机型，需要使用加密的websocket类（如社区 Python实现提供 EncryptedWS 类处理AES加密）。大多数 2017 年后的机型均支持 token 认证，以后的新品也延续此方案。少数地区型号可能还需 SmartThings 云API控制，但通常电视端只要开启 “手机遥控” 设置（菜单中“允许手机/应用控制”），本地 ECP 接口即启用。

**React Native/JS 开发支持：**

- *samsung-tv-remote* （npm，maintainer: badisi）：一个支持 2016+ 三星电视的纯JS库，最新 3.0.1 版（2025年更新）。它封装了 WebSocket 握手、Token管理和按键指令发送。用法示例：

  import { Remote } from 'samsung-tv-remote';\
  const remote = new Remote({ ip: '192.168.0.60', name: 'My Remote App' });\
  remote.connect().then(token => {\
  `  `console.log("Connected, token:", token);\
  `  `remote.sendKey('KEY\_HOME');\
  });

  该库会自动根据设备是否需要token来决定 ws:// 或 wss:// 并处理 token 存储。支持 Promise 或回调方式，提供的 sendKey 方法接受三星键名字符串。由于采用纯JS实现，可直接用于 React Native（需要使用全局 WebSocket）。**维护性**：该库最近commit活跃，有可靠性修复，issues响应及时，GitHub约100+ stars。
- *samsung-tv-control* （npm，由 Toxblh）：功能全面的另一JS库。它除了遥控按键外，还支持获取/启动应用、开机(WoL)等。API设计更面向高级用例，例如 .getApps() 列出应用、.openApp(appId) 启动应用等。底层同样使用 WebSocket + REST，逻辑类似。最新版本下载量和维护也较活跃（GitHub ~195 stars）。React Native 使用时，需要注意该库用到了 Node.js Buffer 等，但可经由 polyfill 解决。社区还提供 Node-RED 节点封装基于此库，证明其实用性。
- *@ersinayaz/rn-samsung-tv-remote*：一个实验性的 React Native 模块。它尝试在 RN 中实现三星加密通信，验证可行性。这项目说明RN可通过 react-native-udp 等原生模块达成，但由于已有纯JS方案，优先采用纯JS库以减小复杂度。

**示例代码：**

以下通过 Samsung TV WS API 发送几个常用按键及启动应用的示例（基于 samsung-tv-control 库简化）：

import { Samsung } from 'samsung-tv-control';\
\
const config = {\
`  `ip: '192.168.0.60',\
`  `nameApp: 'MyRemoteApp',  // 将被Base64编码作为客户端名\
`  `port: 8002,              // 如电视不支持SSL，则改为8001\
`  `token: ''                // 初次为空，连接后自动获取\
};\
const control = new Samsung(config);\
\
// 连接电视并获取 token（如首次则电视会提示授权）\
control.isAvailable().then(() => {\
`  `control.getToken(token => {\
`    `console.log("Got token:", token);\
`    `// 保存token以便下次传入 config 使用\
`  `});\
\
`  `// 发送遥控按键示例\
`  `control.sendKey('KEY\_VOLUP', err => {\
`    `if (!err) console.log('Volume Up sent');\
`  `});\
`  `control.sendKey('KEY\_CHUP', err => {\
`    `if (!err) console.log('Channel Up sent');\
`  `});\
`  `control.sendKey('KEY\_EXIT', err => {\
`    `if (!err) console.log('Exit/Menu sent');\
`  `});\
\
`  `// 启动 YouTube 应用示例（需先通过 getApps 获取正确的appId）\
`  `control.openApp('111299001912', err => {\
`    `if (!err) console.log('YouTube Launched');\
`  `});\
}).catch(e => {\
`  `console.error("TV not available or connection failed:", e);\
});

*说明*: 首次调用 .isAvailable() 时库内部会尝试连接电视。如果 tokenAuthSupport=true 则使用 wss 并在电视授权后得到 token；库会通过 getToken 回调提供 token，开发者应将其持久化用于下次配置。sendKey 发送按键，如音量加、频道加、退出（相当于返回键）。openApp 以应用ID启动应用，这需要先调用 control.getAppsFromTV() 获取电视安装的应用列表及对应ID。React Native 中可以直接使用库的 JS 部分，依赖的 WebSocket 可用内置实现。需要注意电视在待机时无法通过网络唤醒，此时 isAvailable() 会失败；可以通过 WakeOnLan (发送电视MAC的魔术包) 实现远程开机—三星部分机型需在设置开启 “Wake on LAN” 功能方可使用。
## <a name="roku-平台"></a>Roku 平台
**主流遥控协议：**Roku 设备（包括 Roku机顶盒和 Roku TV）提供开放的 **External Control Protocol (ECP)**。ECP 是基于 **HTTP REST** 的本地网络控制接口，默认监听端口 **8060**。无需配对认证，只要开启“通过移动应用控制”功能（Roku OS 14.1+要求在设置中启用，之前版本默认即启用）。ECP 包含以下关键特性：

- **发现**：Roku 通过 SSDP 广播，服务标识为 roku:ecp。第三方应用可通过发送 SSDP M-SEARCH 报文寻找局域网中的 Roku 设备IP。收到响应后解析其中 LOCATION 字段即可得到设备控制URL（例如 http://<IP>:8060/）。
- **按键控制**：通过向 Roku 发出HTTP POST请求至特定路径来模拟遥控按键。**常用命令**包括：
- POST /keypress/<KeyName>：模拟按下一下某键。如 /keypress/home 返回主界面，/keypress/up 等导航，上下左右为 up/down/left/right，确认键是 select。
- POST /keydown/<KeyName> 与 /keyup/<KeyName>：分别模拟按下和松开，可用于长按场景。

Roku 定义了一套**键名**枚举，包括 **Home, Rev, Fwd, Play, Select (OK), Left/Right/Up/Down, Back, Info, VolumeUp/Down, Mute, Power (部分机型)** 等。例如调用:

curl -d '' "http://<roku-ip>:8060/keypress/home"

即可令 Roku 回到主界面。**注意**：Roku盒子设备通常无电源开/关按键（插电即开机待机），但Roku TV（一体电视）支持 PowerOff/PowerOn 命令（实现上 PowerOn 实际通过Wake-on-LAN）。

- **应用与媒体控制**：ECP 提供丰富的查询和操作接口，例如：
- GET /query/apps 列出已安装应用及其 app id。
- POST /launch/<appId> 打开指定应用（可加参数如 contentID 实现深链）。
- POST /search 进行全局内容搜索（Roku OS 12起取消该API）。
- GET /query/active-app 查询当前活动应用。
- Roku TV 特有 /keypress/VolumeUp 等调节音量，/keypress/ChannelUp 切换电视频道等。

ECP的设计原则是简单直观，每个命令对应一个易读的HTTP路径和方法。无状态控制，不需要持续连接。

- **反馈与事件**：ECP 本身主要是命令接口，不主动推送事件。但开发者可周期性调用 /query/ 接口获取状态。Roku在某些新版中引入WebSocket长连接推送（用于媒体播放信息更新等），但官方未广泛文档化。通常ECP足以完成大部分遥控需求。

**React Native/JS 开发支持：**

- 由于 ECP 非常简单，往往无需复杂库。任何支持 HTTP 请求的库都可调用 ECP接口。可使用浏览器 fetch/XHR 或 Node.js http 模块发送 POST 请求。React Native 可直接使用 fetch API。
- 现有封装库：*roku-client* (JavaScript) 或 *node-roku* 等npm包，将常用命令包装成方法。例如 rokuClient.launch('Netflix') 内部查找对应appId再POST launch。有的社区库也提供发现功能封装 SSDP。选择轻量库可以加快开发，但集成第三方也需注意维护情况。鉴于ECP简单可靠，可考虑直接编写一个 RokuAdapter 模块，无外部依赖地实现发现和控制。
- **维护度参考**：Roku官方文档详尽且协议多年未变。npm上一些库可能陈旧但仍可工作。若使用，一定要核对其支持的按键全集是否更新（例如 Roku新增的特定按键，如 Netflix专用键，在标准ECP中映射为普通按键码，不一定列出）。

**示例代码：**

以下示例展示如何在 React Native 中实现 Roku 发现和按键控制的核心逻辑：

// 通过SSD P发现Roku\
import dgram from 'react-native-udp';  // 需要安装udp支持的依赖\
const message = Buffer.from([\
`  `'M-SEARCH \* HTTP/1.1',\
`  `'Host: 239.255.255.250:1900',\
`  `'Man: "ssdp:discover"',\
`  `'ST: roku:ecp',\
`  `'', ''\
].join('\r\n'));\
const socket = dgram.createSocket('udp4');\
socket.bind(0);\
socket.once('listening', function() {\
`  `socket.send(message, 0, message.length, 1900, '239.255.255.250');\
});\
socket.on('message', (msg, rinfo) => {\
`  `const resp = msg.toString();\
`  `if (resp.includes('roku:ecp')) {\
`    `const location = resp.match(/LOCATION: (.\*)\r\n/i)[1];\
`    `console.log('Found Roku at', location);\
`    `// 可以发起HTTP请求控制, 例如发送Home键:\
`    `fetch(`${location}keypress/home`, { method: 'POST' });\
`  `}\
});

*说明*: 上述代码使用 UDP 发送 SSDP M-SEARCH 请求并接收响应，从中解析出 Roku ECP 服务的 LOCATION URL（形如 http://<IP>:8060/）。然后通过 fetch 向 keypress/home 发送POST实现返回主页。React Native默认不支持UDP，需要第三方库实现（如 react-native-udp）。在实际App中，可以在局域网扫描阶段运行此发现逻辑，将找到的Roku设备IP和名称列出给用户选择。后续控制直接构造 fetch('http://<IP>:8060/keypress/<KeyName>') 即可，例如导航键、音量键等都遵循统一格式。
## <a name="跨平台适配与架构建议"></a>跨平台适配与架构建议
通过上述研究，可见五大平台的底层协议各不相同，但**遥控功能上的共性**使我们可以采用适配器模式进行抽象。建议为每个平台实现一个 RemoteAdapter 类（或模块），统一暴露以下接口契约：

- connect() / disconnect(): 建立或断开与电视的会话连接（对于需要长连的协议，如 WebSocket）。例如 Android、WebOS、Samsung 需要在 UI 提示配对/授权并保持连接状态；Roku ECP则可为幂等的HTTP，可每次发送无需保持。
- sendKey(key): 发送遥控按键。其中 key 可以用通用枚举（UP, DOWN, LEFT, RIGHT, OK, BACK, HOME, VOL\_UP, VOL\_DOWN, MUTE, POWER 等）。Adapter 内部将其转换为对应平台的实现：
- Android/Fire：映射为 Android KeyEvent 或 ADB keycode（e.g. OK->KEYCODE\_DPAD\_CENTER）。
- WebOS：对于方向键，调用 pointer 接口；OK 映射为 ENTER；HOME 调用系统主页API等。或使用模拟Channel上下的替代。
- Samsung：映射为 Samsung 键名字符串（OK->KEY\_ENTER，Back->KEY\_RETURN 等）。
- Roku：映射为 ECP 路径（OK->keypress/Select，Back->keypress/Back 等）。
- launchApp(appId) / openApp(appId): 打开指定应用或输入源。各平台通过不同方式实现（Android使用深度链接或ADB shell am命令，WebOS使用 launch SSAP，Samsung/Roku用各自命令）。可在Adapter内部维护一份主流应用的ID映射表供使用（或利用平台API查询）。
- setVolume(level) / volumeUp()/Down() / toggleMute(): 音量控制。Android/Fire可以发送KEYCODE\_VOLUME\_UP等；WebOS有 audio/setVolume 接口；Samsung用KEY\_VOLUP等等；Roku有对应 ECP 命令。
- powerOff() / powerOn(): 关机/开机。关机各平台多支持（Android/Fire需要ADB命令或遥控电源键码；WebOS turnOff API；Samsung KEY\_POWER 信号；Roku TV keypress/PowerOff）。开机则较特殊：只有通过 Wake-on-LAN（WebOS/Samsung/Roku TV 支持）或CEC唤醒。如果要实现，从Adapter外部调用统一的 wakeOnLan(mac) 辅助函数，由设备MAC地址实现。

适配器模式的意义在于：上层业务逻辑（UI和数据层）只与抽象接口交互，不关心底层协议细节。在扩展新平台时，只需新增Adapter实现，不影响既有代码。根据 **RemoteProfile**（规格文档中的虚拟遥控配置）定义，我们可以为每个平台预置一套按键映射，从而在UI层做到**不同品牌统一的按键布局**。例如 “Home” 按钮在UI只出现一次，但Adapter会根据当前连接设备类型选择发送 Android 的HOME键码、WebOS的Home指令或Roku的Home命令。

在编写各 Adapter 时，应充分利用本研究收集的技术细节和示例代码。在实现过程中注意以下事项：

- **连接管理**：Samsung、LG、Android官方协议都是长连接模型，应实现心跳或自动重连机制，并在 UI 状态显示上反映连接中/已连接/断开。Roku和ADB相对无状态，但也需在请求失败时更新状态。
- **配对过程UX**：对于需要用户交互配对的平台（Android TV显示PIN、Samsung弹授权、WebOS弹授权），Adapter应提供回调或事件，让应用层触发UI提示用户操作并收集输入（如 Android PIN 输入，然后调用 adapter.submitPin(code)）。配对成功后保存令牌/密钥到本地存储，确保 **“后续会话复用已授权信息，不强制重新配对”**。
- **错误处理与日志**：统一在 Adapter 层捕获底层错误（网络超时、拒绝连接、指令未响应等），并通过事件或返回码让上层展示友好提示。同时按需求记录日志用于排查（遵循不记录敏感信息原则）。

通过上述适配层设计，我们可以满足规格要求的**多设备管理**和**跨平台统一体验**：应用可扫描网络上的设备IP（Android通过mDNS、Fire可尝试ADB广播、WebOS通过SSDP、Samsung通过SSDP、Roku通过SSDP），构建一个 TVDevice 列表。用户添加后，选择某设备则相应 Adapter 接管遥控UI交互。由于所有Adapter实现了相同接口，UI层的遥控组件可以不变地复用，实现**“不同平台切换控制目标而界面操作一致”**。
本研究提供了开发所需的底层资料和示例代码，开发团队可在离线情况下查阅本文件以完成各协议的对接工作，满足 MVP 功能需求。各平台Adapter具体实现细节和API调用可参考上文引用的官方文档和第三方库源码，在此基础上开展数据模型和合同设计、任务分解等下一步工作。

## 10. Implementation Details for React Native (Expo 54)

Based on the specific constraints of Expo SDK 54 and React Native v0.81.5, the following libraries and tools are selected for implementation.

### 10.1 Device Discovery Libraries
- **SSDP (Roku, Tizen, webOS)**: Use **`react-native-udp`**.
  - *Reason*: High-level SSDP libraries are often unmaintained. Manual implementation of `M-SEARCH` packets using UDP sockets provides the best control and compatibility with Expo Development Builds.
- **mDNS (Android/Google TV)**: Use **`react-native-zeroconf`**.
  - *Reason*: Industry standard for mDNS. Requires `@config-plugins/react-native-zeroconf` for Expo config plugin support to handle permissions.

### 10.2 Protocol Transport Libraries
- **TCP (ADB for Android/Fire TV)**: Use **`react-native-tcp-socket`**.
  - *Reason*: Required to implement the ADB handshake (CNXN -> AUTH -> OPEN) directly in JS/TS, as no maintained RN ADB library exists.
- **WebSocket (Tizen, webOS)**: Use built-in **`WebSocket`** API.
  - *Reason*: Native support in RN is sufficient.
- **HTTP (Roku)**: Use built-in **`fetch`** API.

### 10.3 Testing Tools
- **E2E Testing**: **Maestro**.
  - *Reason*: Superior compatibility with Expo Development Builds compared to Detox. YAML-based test definition simplifies maintenance.

### 10.4 State & Navigation
- **State Management**: **`zustand`**.
- **Navigation**: **`expo-router`**.
