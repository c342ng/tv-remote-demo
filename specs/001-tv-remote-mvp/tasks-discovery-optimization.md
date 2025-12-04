# Tasks: 设备发现与扫描优化

**Input**: Design documents from `/specs/001-tv-remote-mvp/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `tasks.md` (Phase 3 US1 已完成)
**Related Requirements**: FR-001 (设备发现), SC-001 (3分钟内完成首次连接), SC-002 (<200ms 响应)

**Background**: 当前设备发现逻辑存在以下问题：
1. 大网段（/8-/15）扫描覆盖不足，仅扫描相邻 5 个 /24 块
2. 存在硬编码的 Fallback 网段列表
3. 无并发控制，可能淹没网络
4. 广播发现与主动扫描未优化协调
5. 无设备缓存机制，每次重新发现耗时较长

**Goal**: 重构设备发现逻辑，提升发现效率、可靠性与资源利用率。

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件、无直接依赖）
- **[Story]**: 该任务所属用户故事（US1 / Cross-cutting）
- 描述中必须包含明确文件路径

---

## Phase 8: Discovery Optimization (US1 增强)

**Purpose**: 优化设备发现机制，提升发现速度与准确性，支持更大网段，消除硬编码。

**⚠️ CRITICAL**: 本优化需保持向后兼容，已发现设备不应丢失。

### 8.1 基础架构重构

- [X] T055 [P] [US1] 新增发现设备缓存服务
  - **文件**: `src/remote/services/discovery-cache.ts` (新建)
  - **描述**: 实现已发现设备的持久化缓存，支持快速验证已知设备
  - **实现要点**:
    1. 定义 `CachedDevice` 接口，扩展 `DiscoveredDevice` 增加 `lastSeen`, `lastVerified`, `discoveryMethod` 字段
    2. 使用 AsyncStorage 持久化缓存，键名 `@tv_remote/discovery_cache`
    3. 提供 `getCachedDevices()`, `updateCache(device)`, `removeFromCache(deviceId)`, `clearCache()` API
    4. 缓存过期策略：设备 7 天未验证成功则标记为 `stale`，30 天未见则自动清理
  - **验收标准**:
    - 缓存数据在应用重启后可恢复
    - 日志中显示 `[DiscoveryCache] Loaded N cached devices`

- [X] T056 [P] [US1] 重构网络工具函数，移除硬编码
  - **文件**: `src/remote/services/network-utils.ts`
  - **描述**: 重构子网扫描逻辑，移除所有硬编码网段，基于实际网络配置动态计算
  - **实现要点**:
    1. 删除 `FALLBACK_SUBNET_PREFIXES` 常量
    2. 重构 `generateSubnetPrefixes()` 函数，移除 `/8-/15` 的 hack 逻辑（仅扫描 ±2 块）
    3. 新增 `generateScanBlocks()` 函数，实现基于 CIDR 的分块策略：
       - CIDR >= 24: 返回单个 /24 块
       - CIDR < 24: 按 /24 分块，返回 `{prefix, priority}[]`，当前手机 IP 所在块 priority=1，网关所在块 priority=2，其余按距离递增
    4. 新增 `getGatewaySubnetPrefix()` 函数，提取网关 IP 所在 /24 块
    5. 重构 `getSubnetsToScan()` 仅返回实际子网掩码范围内的块，不再包含 Fallback
  - **验收标准**:
    - 无 Fallback 硬编码网段
    - `/16` 网段正确返回 256 个 /24 块，按优先级排序
    - 单元测试覆盖 `/24`, `/23`, `/22`, `/20`, `/16`, `/8` 等场景

- [X] T057 [P] [US1] 新增并发控制与节流工具
  - **文件**: `src/remote/utils/concurrency.ts` (新建)
  - **描述**: 实现通用的并发限制与节流工具，供扫描逻辑使用
  - **实现要点**:
    1. 实现 `PromisePool` 类，支持设置最大并发数（默认 50）
    2. 提供 `runWithConcurrency<T>(tasks: (() => Promise<T>)[], maxConcurrent: number): Promise<T[]>` 函数
    3. 支持任务优先级（可选），高优先级任务优先执行
    4. 支持取消机制，返回 `{ results, cancel }` 对象
  - **验收标准**:
    - 并发数不超过设定值
    - 取消后未执行的任务不再执行
    - 单元测试验证并发控制正确性

---

### 8.2 发现策略重构

- [X] T058 [US1] 实现广播发现与主动扫描并行机制
  - **文件**: `src/remote/services/aggregated-discovery.ts`
  - **依赖**: T055, T056, T057
  - **描述**: 重构发现流程，实现广播发现与主动扫描的并行协调
  - **实现要点**:
    1. 新增 `DiscoveryOrchestrator` 类，协调多种发现方式
    2. 实现三阶段发现流程：
       - **Phase 1 - 缓存验证**: 并行验证所有缓存设备的可达性（HTTP/TCP 探测）
       - **Phase 2 - 持续广播**: 启动 SSDP/mDNS 广播监听，每 2 秒发送一次 M-SEARCH/mDNS 查询
       - **Phase 3 - 主动扫描**: 按优先级顺序扫描 /24 块
    3. 广播发现 (Phase 2) 持续运行直到 `stopDiscovery()` 被调用
    4. 主动扫描 (Phase 3) 在缓存验证完成后开始，可被新发现中断
    5. 任何方式发现设备后立即触发 `onDeviceFound` 回调（去重）
  - **验收标准**:
    - 缓存设备优先验证，验证结果在 1-2 秒内返回
    - 广播发现持续进行，间隔 2 秒
    - 主动扫描按块优先级执行
    - 日志中清晰区分各阶段：`[Discovery] Phase 1: Verifying N cached devices...`

- [X] T059 [US1] 重构协议适配器的扫描逻辑
  - **文件**: `src/remote/protocols/roku-adapter.ts`, `src/remote/protocols/android-tv-adapter.ts`, `src/remote/protocols/fire-tv-adapter.ts`
  - **依赖**: T056, T057
  - **描述**: 统一各协议适配器的端口扫描逻辑，使用共享的并发控制与分块策略
  - **实现要点**:
    1. 移除各适配器中独立的 `discoverViaSubnetScan` / `discoverViaPortScan` 实现
    2. 提取公共扫描逻辑到 `src/remote/services/port-scanner.ts` (新建)：
       - `scanSubnetForPort(prefix: string, port: number, timeout: number, concurrency: number): Promise<string[]>`
       - `scanBlocksForPort(blocks: ScanBlock[], port: number, ...): AsyncGenerator<string>`
    3. 各适配器的 `discover()` 方法改为调用 `DiscoveryOrchestrator`
    4. 保留适配器的 `probeDevice(ip)` 方法，用于验证特定 IP 是否为目标平台设备
  - **验收标准**:
    - 无重复的扫描逻辑
    - 并发数统一控制在 50
    - 扫描可被取消

---

### 8.3 实时去重与 UI 集成

- [X] T060 [US1] 实现发现结果实时去重与合并
  - **文件**: `src/remote/services/aggregated-discovery.ts`
  - **依赖**: T058
  - **描述**: 确保任何发现方式、任何协议找到的设备能立即去重并通知 UI
  - **实现要点**:
    1. 使用 `Map<string, DiscoveredDevice>` 作为去重容器，key 为 `${ipAddress}-${platform}`
    2. 新增 `DiscoveryEventEmitter` 接口：
       - `onDeviceFound(device: DiscoveredDevice): void`
       - `onDeviceLost(deviceId: string): void`
       - `onPhaseChange(phase: 'cache-verify' | 'broadcast' | 'scan', progress?: number): void`
    3. 当设备通过任意方式被发现时，立即检查去重容器：
       - 如为新设备，加入容器并触发 `onDeviceFound`
       - 如为已存在设备，更新 `lastSeen` 时间戳，不重复触发
    4. 广播发现与扫描结果统一通过同一个 `onDeviceFound` 回调
  - **验收标准**:
    - 同一设备不会在列表中重复出现
    - 设备发现后 <100ms 内触发 UI 更新
    - 日志中显示去重情况：`[Discovery] Device already known: <device-name> (via broadcast)`

- [X] T061 [US1] 更新设备发现界面以支持新发现流程
  - **文件**: `src/remote/screens/DeviceDiscoveryScreen.tsx`
  - **依赖**: T060
  - **描述**: 更新设备发现界面，展示发现阶段与进度
  - **实现要点**:
    1. 显示当前发现阶段指示器（验证缓存 / 广播中 / 扫描中）
    2. 对于主动扫描阶段，显示扫描进度（已扫描块数 / 总块数）
    3. 设备列表实时更新，新发现设备使用动画进入
    4. 缓存验证通过的设备标记为"已知设备"（可选择性高亮）
    5. 支持手动停止扫描，保留已发现设备
  - **验收标准**:
    - 阶段指示器正确切换
    - 大网段（/16）扫描时显示进度
    - 设备发现后立即显示在列表中

---

### 8.4 测试与验证

- [X] T062 [P] [US1] 网络工具函数单元测试
  - **文件**: `tests/unit/services/network-utils.test.ts` (新建或更新)
  - **依赖**: T056
  - **描述**: 为重构后的网络工具函数编写全面的单元测试
  - **验收标准**:
    - 测试 `generateScanBlocks()` 在 /24, /23, /20, /16, /8 场景下的输出
    - 测试优先级排序正确性（手机 IP 块 > 网关块 > 其他）
    - 测试边界条件（空网关、无效 IP 等）

- [X] T063 [P] [US1] 并发控制工具单元测试
  - **文件**: `tests/unit/utils/concurrency.test.ts` (新建)
  - **依赖**: T057
  - **描述**: 为并发控制工具编写单元测试
  - **验收标准**:
    - 测试并发数限制正确
    - 测试取消机制
    - 测试优先级调度（如已实现）

- [X] T064 [P] [US1] 发现缓存服务单元测试
  - **文件**: `tests/unit/services/discovery-cache.test.ts` (新建)
  - **依赖**: T055
  - **描述**: 为发现缓存服务编写单元测试
  - **验收标准**:
    - 测试缓存读写与持久化
    - 测试过期清理逻辑
    - 测试缓存更新合并

- [X] T065 [US1] 发现流程集成测试
  - **文件**: `tests/integration/discovery-optimization.test.ts` (新建)
  - **依赖**: T058, T059, T060
  - **描述**: 为优化后的发现流程编写集成测试
  - **验收标准**:
    - 测试三阶段流程正确执行
    - 测试去重逻辑（模拟多协议同时发现同一设备）
    - 测试取消与停止机制
    - 测试大网段（/16）分块扫描

---

## Dependencies & Execution Order

### 任务依赖关系

```
T055 (缓存服务) ─────┐
T056 (网络工具重构) ─┼─→ T058 (发现协调器) ─→ T060 (去重合并) ─→ T061 (UI 更新)
T057 (并发控制) ────┘         │
                              ↓
                         T059 (适配器重构)

T062, T063, T064 可与主流程并行
T065 依赖 T058-T060 完成
```

### 并行机会

- **可并行**: T055, T056, T057 无互相依赖，可同时开发
- **可并行**: T062, T063, T064 可与对应实现任务同步进行（TDD）
- **串行**: T058 → T059 → T060 → T061 需按顺序

### 风险与注意事项

1. **向后兼容**: 确保重构不影响已保存设备的数据格式，需迁移逻辑
2. **性能测试**: 大网段（/8, /16）扫描需在真实网络环境下验证耗时与资源占用
3. **网络权限**: iOS 可能对 UDP 广播有限制，需验证 SSDP/mDNS 在各 iOS 版本的行为
4. **电量消耗**: 持续广播需评估对电池的影响，可能需要在后台时降低频率

---

## Acceptance Criteria Summary

| 功能点 | 验收标准 | 实现状态 |
|--------|----------|----------|
| 广播与扫描并行 | 广播每 2 秒一次，扫描同时进行 | ✅ 已实现 |
| 广播与扫描同步结束 | 主动扫描结束后，广播发现也同步停止 | ✅ 已实现 |
| UI 状态同步 | 发现进行中 UI 显示 loading，发现结束后 loading 停止 | ✅ 已实现 |
| 仅扫描实际子网 | 无 Fallback 硬编码网段 | ✅ 已实现 |
| 分块扫描策略 | 手机 IP 块优先，网关块次之，其余按距离 | ✅ 已实现 |
| 并发控制 | 最大并发数 50 | ✅ 已实现 |
| 缓存优先验证 | 发起发现时先验证缓存设备 | ✅ 已实现 |
| 实时去重显示 | 发现即显示，无重复 | ✅ 已实现 |

### 关键行为说明

**广播与扫描的协调机制**:
1. `DiscoveryOrchestrator.startDiscovery()` 启动三阶段发现流程
2. Phase 2 (广播发现) 通过 `setInterval` 每 2 秒发送一次广播查询
3. Phase 3 (主动扫描) 与 Phase 2 并行执行
4. 在 `startDiscovery()` 的 `finally` 块中：
   - 清除广播定时器 (`clearInterval(_broadcastIntervalId)`)
   - 设置 `_isRunning = false`
   - 设置阶段为 `'complete'`
5. UI 层 (`DeviceDiscoveryScreen`) 的 `isScanning` 状态在 `startDiscovery()` Promise resolve 后设为 `false`

**用户视觉体验**:
- 扫描进行中：显示 loading 指示器 + 阶段文字
- 扫描结束后：loading 停止，用户可查看结果或重新扫描
- 设备发现后实时添加到列表，无需等待全部扫描完成

---

## Changelog

- **2025-12-04**: 更新验收标准表格，增加实现状态列；新增"广播与扫描同步结束"和"UI 状态同步"验收标准；添加关键行为说明章节
- **2025-12-02**: 初始创建，定义 11 个任务（T055-T065）
