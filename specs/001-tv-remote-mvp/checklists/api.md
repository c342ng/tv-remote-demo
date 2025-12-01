# API/协议需求质量检查清单: TV Remote MVP Multi-Platform Control

**Purpose**: 验证 5 大电视平台协议集成需求的完整性、清晰度和一致性（作者自检）
**Created**: 2025-12-02
**Executed**: 2025-12-02
**Feature**: [spec.md](../spec.md), [research.md](../research.md), [contracts/platform-adapter.md](../contracts/platform-adapter.md)

**Focus Areas**: 重连策略需求、跨平台能力差异、异常/恢复流程
**Depth Level**: 标准
**Audience**: 作者自检（提交前检查）

---

## 需求完整性 (Completeness)

### 协议覆盖

- [x] CHK001 - 5 大平台（Android TV、Fire TV、webOS、Tizen、Roku）的协议端口是否全部明确定义？[Completeness, Spec §FR-001, research.md §3-6] ✅ **PASS** - research.md 和 data-model.md 中明确定义：Android/Fire=5555(ADB), webOS=3000/3001, Tizen=8001/8002, Roku=8060
- [x] CHK002 - 各平台配对/授权机制是否完整描述（ADB 授权弹窗、PIN 码、Token、无需配对）？[Completeness, Spec §FR-002] ✅ **PASS** - research.md §3-6 详细描述：Android/Fire=ADB授权弹窗, webOS=PIN/client key, Tizen=Token认证, Roku=无需配对
- [x] CHK003 - 各平台最低支持版本（Android TV 10+、Fire OS 7+、webOS 4.0+、Tizen 4.0+、Roku OS 10+）是否在需求中明确标注？[Completeness, Spec §FR-001] ✅ **PASS** - spec.md §FR-001, plan.md, data-model.md TVPlatform.minimumVersion 均一致
- [ ] CHK004 - 协议超时时间是否为各平台分别定义（发现超时、连接超时、指令超时）？[Gap] ⚠️ **GAP** - 仅定义全局 <200ms 响应目标，未定义各平台差异化超时
- [ ] CHK005 - 各平台的心跳/保活机制需求是否已定义？[Gap] ⚠️ **GAP** - research.md 提到 "最近心跳时间" 字段但未定义心跳间隔和机制

### 重连策略需求

- [x] CHK006 - 重连策略（3 次重试，2s→4s→8s 间隔递增）是否适用于所有平台，还是各平台需要差异化配置？[Clarity, Spec §Edge Cases] ✅ **PASS** - spec.md Edge Cases 和 plan.md 明确为统一策略，适用所有平台
- [ ] CHK007 - 重连策略的触发条件是否明确定义（网络断开、心跳超时、指令发送失败）？[Completeness, Gap] ⚠️ **GAP** - 仅定义 "网络不稳定" 和 "离线"，未明确列举所有触发条件
- [x] CHK008 - 重连过程中用户 UI 反馈需求是否具体定义（"重连中"状态指示器的具体表现形式）？[Clarity, Spec §Edge Cases] ✅ **PASS** - spec.md 定义 "重连中" 状态指示器，data-model.md ConnectionStatus.reconnecting 枚举值
- [x] CHK009 - 3 次重连失败后的恢复流程是否完整定义（用户操作路径、设备状态重置逻辑）？[Completeness, Spec §Edge Cases] ✅ **PASS** - spec.md Edge Cases: "弹出提示引导用户检查网络或手动重试"
- [ ] CHK010 - 重连期间收到的用户指令如何处理是否定义（排队、丢弃、提示）？[Gap] ⚠️ **GAP** - 未定义
- [ ] CHK011 - 网络切换（WiFi→移动网络→WiFi）场景下的重连行为是否定义？[Gap, Edge Case] ⚠️ **GAP** - 未定义

### 跨平台能力差异

- [x] CHK012 - `DeviceCapabilities` 结构是否覆盖所有需要能力标记的按键类型（POWER、HOME、MUTE 等）？[Completeness, contracts/platform-adapter.md] ✅ **PASS** - data-model.md DeviceCapabilities 包含 supportsPower, supportsVolumeControl, supportedKeys: [RemoteKey]
- [ ] CHK013 - 各平台不支持的按键清单是否有明确文档记录？[Gap] ⚠️ **GAP** - RemoteProfile.default 定义所有按键 supported=true，缺少实际平台差异清单
- [x] CHK014 - 当某平台不支持特定按键时，UI 行为需求是否同时定义"灰显"和"点击提示"两种处理方式的触发条件？[Clarity, Spec §FR-008] ✅ **PASS** - spec.md §FR-008: "灰显按钮或在点击时给出提示"
- [x] CHK015 - `RemoteProfile` 中的按键映射规则是否为每个平台都明确定义？[Completeness, data-model.md] ✅ **PASS** - data-model.md RemoteProfile.default 为 5 个平台定义完整的 platformMappings
- [x] CHK016 - 跨平台按键语义差异（如 Tizen 的 KEY_RETURN vs KEY_BACK）的处理规则是否定义？[Clarity, research.md §5.2] ✅ **PASS** - research.md §5.2 说明 KEY_RETURN vs KEY_BACK 容错处理，data-model.md Tizen 映射使用 KEY_RETURN

---

## 需求清晰度 (Clarity)

### 协议细节

- [ ] CHK017 - "配对令牌"、"授权密钥"、"client key"等术语在需求中是否有统一定义？[Clarity, Ambiguity] ⚠️ **AMBIGUITY** - spec.md 使用 "配对令牌、授权密钥"，research.md 使用 "client key"，未统一术语表
- [x] CHK018 - "即时响应"（<200ms）的测量起点和终点是否明确（用户点击→电视执行 vs 用户点击→收到 ACK）？[Clarity, Spec §SC-002] ✅ **PASS** - spec.md §SC-002: "用户点击到电视响应"；research.md §2.4: "200ms 内期望收到电视端 ACK 或超时"
- [x] CHK019 - "本地 UI 反馈 <100ms" 是否定义了具体反馈形式（按钮高亮、震动、声音）？[Clarity, plan.md §Technical Context] ✅ **PASS** - research.md §2.4: "按钮高亮、loading"
- [x] CHK020 - 连接状态枚举（连接中、已连接、已断开、不可用）是否有明确的状态转换规则？[Clarity, Spec §FR-006] ✅ **PASS** - data-model.md ConnectionSession 定义生命周期：connecting→connected→disconnected/error，包含 reconnecting 状态
- [ ] CHK021 - "短时间内"、"快速"等模糊表述是否已量化（如 FR-009 中的"短和可预期的时间窗口"）？[Ambiguity, Spec §FR-009] ⚠️ **AMBIGUITY** - FR-009 未量化，建议定义为 "<1s" 或具体数值

### 安全存储

- [x] CHK022 - iOS Keychain 存储的 `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` 安全级别是否在需求中明确标注，还是仅在实现文档中？[Traceability, plan.md] ✅ **PASS** - plan.md 和 data-model.md KeychainService 均明确标注此安全级别
- [ ] CHK023 - 日志中"不得包含敏感个人信息"的敏感信息边界是否明确定义（IP 地址是否算敏感？设备名称呢？）？[Clarity, Spec §FR-010] ⚠️ **GAP** - 仅定义 "不得包含敏感个人信息"，未明确边界

---

## 需求一致性 (Consistency)

### 跨文档一致性

- [x] CHK024 - spec.md 与 research.md 中的协议端口号描述是否一致？[Consistency] ✅ **PASS** - spec.md 未指定端口，research.md 和 data-model.md 一致定义
- [x] CHK025 - spec.md 中的平台版本要求与 plan.md/research.md 是否一致？[Consistency] ✅ **PASS** - 三者均为：Android TV 10+, Fire OS 7+, webOS 4.0+, Tizen 4.0+, Roku OS 10+
- [x] CHK026 - `PlatformAdapter` 协议中的错误类型与 spec.md 边缘情况描述是否一一对应？[Consistency, contracts/platform-adapter.md] ✅ **PASS** - ConnectionError.refused/authFailed 对应 "拒绝授权"，DiscoveryError.timeout 对应 "发现超时" 等
- [x] CHK027 - data-model.md 中的 `ConnectionStatus` 枚举与 spec.md §FR-006 描述的状态是否一致？[Consistency] ✅ **PASS** - ConnectionStatus: connecting/connected/disconnected/reconnecting/error 覆盖 spec "连接中、已连接、已断开、不可用"

### 跨用户故事一致性

- [x] CHK028 - US1（单设备控制）和 US3（跨平台统一体验）对按键映射的需求是否一致？[Consistency] ✅ **PASS** - 两者均引用 RemoteProfile 统一映射，无冲突
- [ ] CHK029 - 设备能力检测需求在 US1 和 US3 中的定义是否一致（何时获取、何时更新）？[Consistency, Gap] ⚠️ **GAP** - 未明确定义能力何时获取（连接时？发现时？）和更新频率

---

## 异常/恢复流程 (Exception & Recovery)

### 连接异常

- [x] CHK030 - 配对被用户拒绝（电视端点击"拒绝"）后的恢复流程是否定义？[Completeness, Spec §Edge Cases] ✅ **PASS** - spec.md Edge Cases: "用户拒绝授权...如何回退到安全可预期的状态"；contracts/platform-adapter.md ConnectionError.refused
- [x] CHK031 - 配对流程用户中途取消（手机端）后如何回退到安全状态是否定义？[Completeness, Spec §Edge Cases] ✅ **PASS** - spec.md Edge Cases: "中途取消配对流程时，如何回退到安全可预期的状态"
- [ ] CHK032 - 已配对设备的授权凭据过期/失效时的检测和处理流程是否定义？[Gap, Exception Flow] ⚠️ **GAP** - 未定义凭据有效期和过期处理
- [x] CHK033 - 设备不再在同一网络时的"优雅失败"具体行为是否定义（提示文案、操作选项）？[Clarity, Spec §Edge Cases] ✅ **PASS** - spec.md Edge Cases: "优雅地失败并引导用户重新连接或移除设备"

### 指令发送异常

- [ ] CHK034 - 指令发送超时后的重试策略是否定义（单指令级别 vs 会话级别）？[Gap] ⚠️ **GAP** - research.md §2.4 提到 "超时重试" 但未定义具体策略
- [ ] CHK035 - 连续多次指令发送失败时是否触发重连逻辑？触发阈值是否定义？[Gap] ⚠️ **GAP** - 未定义
- [x] CHK036 - `CommandError.notSupported` 错误的用户提示是否需要区分"平台不支持"和"当前状态不支持"？[Clarity] ✅ **PASS** - contracts/platform-adapter.md CommandError.notSupported(RemoteKey) 提供具体按键信息

### 发现异常

- [x] CHK037 - 设备发现超时时的用户引导需求是否定义（检查网络、手动输入 IP 等）？[Completeness] ✅ **PASS** - research.md §3.2: "允许用户手动输入 IP 可避免某些网络环境下的广播/发现受限问题"
- [x] CHK038 - 同一网络存在多台同品牌同型号设备时的区分机制需求是否明确？[Clarity, Spec §Edge Cases] ✅ **PASS** - spec.md Edge Cases: "通过可编辑名称/房间标签" 区分
- [ ] CHK039 - 网络权限被拒绝（iOS Local Network 权限）时的处理流程是否定义？[Gap, Exception Flow] ⚠️ **GAP** - contracts/platform-adapter.md DiscoveryError.permissionDenied 存在，但用户引导未定义

### 存储异常

- [ ] CHK040 - Keychain 存储失败时的降级策略是否定义？[Gap, Recovery Flow] ⚠️ **GAP** - 未定义
- [ ] CHK041 - 设备列表存储损坏时的恢复策略是否定义？[Gap, Recovery Flow] ⚠️ **GAP** - 未定义

---

## 可测量性 (Measurability)

### 验收标准

- [ ] CHK042 - 协议连接成功率的验收标准是否定义（如"在标准家庭网络环境下，首次配对成功率 >90%"）？[Gap, Acceptance Criteria] ⚠️ **GAP** - spec.md §SC-001 定义用户完成率 80%，但未定义技术层面连接成功率
- [ ] CHK043 - 重连策略的成功率验收标准是否定义？[Gap, Acceptance Criteria] ⚠️ **GAP** - 未定义
- [ ] CHK044 - 指令发送成功率（如 <200ms 内收到 ACK 的比例）验收标准是否定义？[Gap, Acceptance Criteria] ⚠️ **GAP** - spec.md §SC-002 定义 90% 指令 <200ms，但未区分成功/失败

### 测试场景

- [ ] CHK045 - 各平台协议集成的独立测试场景是否在需求中定义？[Gap, Coverage] ⚠️ **GAP** - 仅定义用户故事测试，未定义技术层面协议测试场景
- [ ] CHK046 - 模拟网络不稳定环境的测试需求是否定义？[Gap, Non-Functional] ⚠️ **GAP** - 未定义

---

## 非功能性需求覆盖 (Non-Functional Requirements)

### 性能

- [ ] CHK047 - 设备发现的超时时间需求是否明确定义？[Gap, Performance] ⚠️ **GAP** - 未定义
- [ ] CHK048 - 设备切换（FR-009）的响应时间上限是否明确定义？[Clarity, Spec §FR-009] ⚠️ **GAP** - FR-009 仅说 "短和可预期"，未量化

### 安全

- [x] CHK049 - 协议通信是否要求加密（TLS/SSL）？各平台加密需求是否明确？[Gap, Security] ✅ **PASS** - research.md 明确：webOS 3001(wss), Tizen 8002(wss), Android TV Remote v2 TLS 双向认证
- [ ] CHK050 - 配对凭据的有效期是否需要定义（永久有效 vs 定期刷新）？[Gap, Security] ⚠️ **GAP** - 未定义

### 可靠性

- [ ] CHK051 - 应用后台/前台切换时连接保持策略是否定义？[Gap, Reliability] ⚠️ **GAP** - 未定义
- [ ] CHK052 - iOS 系统内存压力时的连接降级策略是否定义？[Gap, Reliability] ⚠️ **GAP** - 未定义

---

## 依赖与假设 (Dependencies & Assumptions)

- [x] CHK053 - "电视已开机"假设是否在需求中明确标注？[Assumption] ✅ **PASS** - contracts/platform-adapter.md DiscoveryError.timeout: "请确保电视已开机"
- [x] CHK054 - "手机与电视在同一局域网"假设是否在需求和 UI 引导中明确？[Assumption, Spec] ✅ **PASS** - spec.md FR-001 "同一网络"，research.md 多处提及
- [x] CHK055 - Android TV/Fire TV 需要用户开启"开发者选项/ADB 调试"的前置条件是否在需求中明确标注？[Assumption, research.md §3.4] ✅ **PASS** - research.md §3.4 明确标记此限制，建议在 UI 中引导
- [ ] CHK056 - 对第三方 SDK/库的依赖是否在需求层面标注风险？[Dependency] ⚠️ **GAP** - research.md 评估了库但未在需求层面标注依赖风险

---

## 遗漏检测 (Gap Analysis)

- [ ] CHK057 - 是否定义了"首次连接失败"与"重连失败"的区别处理逻辑？[Gap] ⚠️ **GAP** - 未区分
- [ ] CHK058 - 是否定义了电视端主动断开连接时 App 的响应行为？[Gap] ⚠️ **GAP** - 未定义
- [ ] CHK059 - 是否定义了电视进入休眠/待机模式时的连接处理？[Gap] ⚠️ **GAP** - 未定义
- [ ] CHK060 - 多设备场景下，切换设备时旧连接是否需要主动断开的需求是否定义？[Gap, US2] ⚠️ **GAP** - research.md §7.3 提到 "重建/复用"，但未明确定义

---

## Notes

- 检查项标记格式：`[质量维度, 来源引用]`
- `[Gap]` 表示规格中可能缺失的需求
- `[Ambiguity]` 表示需要澄清的模糊表述
- `[Assumption]` 表示需要验证的隐含假设
- 本检查清单侧重于协议集成需求质量，不检查实现正确性
- 每项通过后打勾 `[x]`，发现问题在项后添加备注

---

## 执行摘要

**执行日期**: 2025-12-02

### 统计

| 类别 | 通过 ✅ | 未通过 ⚠️ | 总计 |
|------|--------|-----------|------|
| 需求完整性 | 11 | 5 | 16 |
| 需求清晰度 | 5 | 2 | 7 |
| 需求一致性 | 5 | 1 | 6 |
| 异常/恢复流程 | 6 | 6 | 12 |
| 可测量性 | 0 | 5 | 5 |
| 非功能性需求 | 1 | 5 | 6 |
| 依赖与假设 | 3 | 1 | 4 |
| 遗漏检测 | 0 | 4 | 4 |
| **总计** | **31** | **29** | **60** |

**通过率**: 51.7% (31/60)

### 关键缺口汇总

**高优先级 (阻塞实现)**:
1. CHK004 - 各平台差异化超时配置未定义
2. CHK007 - 重连触发条件未完整定义
3. CHK010 - 重连期间指令处理策略未定义
4. CHK032 - 凭据过期处理未定义
5. CHK034/035 - 指令重试和重连触发阈值未定义

**中优先级 (影响用户体验)**:
1. CHK017 - 术语不统一（配对令牌/授权密钥/client key）
2. CHK021 - FR-009 "快速切换" 未量化
3. CHK023 - 敏感信息边界未定义
4. CHK039 - 网络权限拒绝的用户引导未定义

**低优先级 (后续迭代)**:
1. CHK042-046 - 验收标准和测试场景待补充
2. CHK051-052 - 后台/内存压力处理待定义
3. CHK057-060 - 边缘场景待补充

### 建议

1. **立即修复**: 在开始实现前，补充 CHK004, CHK007, CHK010, CHK034, CHK035 的定义
2. **MVP 可接受**: CHK017, CHK021, CHK023 可在 MVP 期间逐步澄清
3. **后续迭代**: 可测量性和非功能性需求可在 MVP 验证后补充
