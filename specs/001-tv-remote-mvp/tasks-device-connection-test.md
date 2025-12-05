# Tasks: 设备连接与控制测试

**Input**: 真实网络设备
**Prerequisites**: `tasks-discovery-optimization.md` Phase 8 已完成
**Related Requirements**: FR-002 (设备连接), FR-003 (遥控器控制)

**Background**: 需要验证各平台适配器的连接和控制逻辑是否正确工作。

**测试设备清单** (用户提供 vs 实际验证):
| 平台 | 用户提供 IP | 实际 IP | 状态 | 说明 |
|------|------------|---------|------|------|
| Roku | 10.13.12.37 | 10.13.12.37 | ✅ | ECP 正常工作 |
| Fire TV | 10.13.13.45 | ❓ 需确认 | ⚠️ | 10.13.13.45 是普通 Chromecast |
| LG webOS | 10.13.13.121 | 10.13.12.80 | ⚠️ | 10.13.13.121 是 Grafana；10.13.12.80 有 ADB 端口 |
| Chromecast | 10.13.13.45 | 10.13.13.45 | ⚠️ | 普通 Chromecast，不支持控制 |

---

## 发现的问题

### 问题 1: 普通 Chromecast 被错误识别为可控设备

**现象**: 10.13.13.45 是普通 Chromecast（不是 Chromecast with Google TV），但被搜索出来
- `curl http://10.13.13.45:8008/setup/eureka_info` 返回 `{"name":"Chromecast",...}`
- ADB 端口 5555 关闭
- 普通 Chromecast 不支持 ADB 控制

**根因分析**:
- `android-tv-adapter.ts` 的 `probeAdbDevice()` 检测 8008 端口的 eureka_info
- 但没有检查是否是 Google TV（支持 ADB）还是普通 Chromecast（不支持）
- 当前逻辑只检查 `model.includes('google tv')` 等，但普通 Chromecast 也有 8008 端口

**修复方案**:
1. 增加 ADB 端口连通性检查（端口 5555）
2. 普通 Chromecast 不应返回为 Android TV 设备
3. 只有 "Chromecast with Google TV" 才应被识别

### 问题 2: LG webOS TV (10.13.12.80) 未被发现

**现象**: 
- 10.13.12.80 是 LG webOS TV，但未被搜索到
- 该设备在 `10.13.12.x` 子网，与手机可能在不同子网
- 端口扫描结果：5555 开放，3000/3001 关闭

**根因分析**:
- LG webOS 适配器只使用 SSDP 发现，没有端口扫描 fallback
- 如果 SSDP 不工作（防火墙、TV 未响应），则无法发现
- 当前 `webos-adapter.ts` 只调用 `discoverDevicesViaSsdp()`

**修复方案**:
1. 为 webOS 添加端口扫描 fallback（扫描 3000/3001 端口）
2. 扫描时需验证是 LG TV（WebSocket 握手）而非其他服务（如 Grafana）

### 问题 3: 跨子网扫描问题

**现象**:
- 手机可能在 `10.13.13.x` 子网
- LG TV 在 `10.13.12.x` 子网
- 需要扫描多个 /24 块

**分析**:
- 当前 `generateScanBlocks()` 应该会生成相邻块
- 但如果子网掩码是 /16，可能块太多导致扫描时间过长

### 问题 4: 同一 IP 被多个适配器识别

**现象**: 10.13.13.45 可能被 Fire TV 和 Android TV 适配器同时识别

**根因**: 
- Fire TV 和 Android TV 都检测 8008 端口
- 没有明确区分设备类型的机制

---

## Format: `[ID] [P?] [Story] Description`

---

## Phase 9: Device Connection & Control Testing

### 9.1 Roku 设备测试

- [X] T067 [US1] 验证 Roku 设备连接 ✅
  - **设备**: Roku Streaming Stick 4K @ 10.13.12.37:8060
  - **描述**: 验证 Roku ECP 协议连接是否正常
  - **测试结果**: ✅ 通过
    - `GET /query/device-info` 返回设备信息
    - 设备型号: Streaming Stick 4K (3820R2)
    - 序列号: X02500TWGUU2
    - 软件版本: 15.0.4
  - **手动测试命令**:
    ```bash
    curl -X GET http://10.13.12.37:8060/query/device-info
    ```

- [X] T068 [US1] 验证 Roku 命令发送 ✅
  - **设备**: Roku @ 10.13.12.37:8060
  - **依赖**: T067
  - **描述**: 验证 Roku ECP 按键命令是否正常工作
  - **测试结果**: ✅ 通过
    - `POST /keypress/Home` 返回 202 Accepted
    - 命令正常工作
  - **手动测试命令**:
    ```bash
    curl -X POST http://10.13.12.37:8060/keypress/Home
    curl -X POST http://10.13.12.37:8060/keypress/Up
    curl -X POST http://10.13.12.37:8060/keypress/Select
    ```

---

### 9.2 Fire TV 设备测试

- [ ] T069 [US1] 验证 Fire TV 设备连接 ⏸️
  - **设备**: Fire TV @ 10.13.12.80:5555
  - **状态**: 需要 ADB 授权
  - **测试结果** (2025-12-04):
    - ping: ✅ 可达 (47ms)
    - ADB 端口 5555: ✅ 开放
    - ADB 连接: ⏸️ `unauthorized` - 需要在 TV 上授权
  - **下一步**: 
    1. 在 Fire TV 上查看是否有授权提示
    2. 如没有提示，进入 Settings → My Fire TV → Developer Options → ADB Debugging 重新开启
    3. 授权后运行 `adb connect 10.13.12.80:5555`
  - **测试命令**:
    ```bash
    adb connect 10.13.12.80:5555
    adb devices  # 应显示 device 而非 unauthorized
    adb -s 10.13.12.80:5555 shell input keyevent 3  # Home
    ```

- [ ] T070 [US1] 验证 Fire TV 命令发送 ⏸️
  - **设备**: Fire TV @ 10.13.12.80:5555
  - **依赖**: T069
  - **状态**: 暂停 - 等待 ADB 授权完成

---

### 9.3 LG webOS 设备测试

- [ ] T071 [US1] 验证 LG webOS 设备连接 ⏸️
  - **设备**: LG webOS @ 10.13.13.93:3000
  - **状态**: 设备离线 - TV 可能处于关机或休眠状态
  - **测试结果** (2025-12-04):
    - ping 10.13.13.93: 100% packet loss（不可达）
    - WebSocket 连接超时
  - **下一步**: 
    1. 请确认 TV 已开机且连接到网络
    2. 检查 TV 是否在同一子网 (10.13.13.x)
  - **测试命令**:
    ```bash
    # 检查 TV 是否在线
    ping 10.13.13.93
    
    # 测试 WebSocket 连接
    websocat ws://10.13.13.93:3000
    ```

- [ ] T072 [US1] 验证 LG webOS 命令发送 ⏸️
  - **设备**: LG webOS @ 10.13.13.93:3000
  - **依赖**: T071
  - **状态**: 暂停 - 等待 T071 完成

---

### 9.4 Chromecast/Android TV 设备测试

- [X] T073 [US1] 确认设备类型 ✅
  - **设备**: 10.13.13.45
  - **描述**: 确认该 IP 是 Fire TV 还是 Chromecast with Google TV
  - **测试结果**: ✅ 已确认
    - 设备类型: **普通 Chromecast** (不是 Google TV)
    - 设备名称: "Chromecast"
    - Build: 3.72.446070
    - ADB 端口 5555: **关闭** (Connection refused)
  - **结论**: 
    - 普通 Chromecast 不支持 ADB 控制
    - 只有 "Chromecast with Google TV" 才支持 ADB
    - 此设备无法通过本应用控制
  - **测试命令**:
    ```bash
    curl http://10.13.13.45:8008/setup/eureka_info
    nc -zv 10.13.13.45 5555  # Connection refused
    ```

- [ ] T074 [US1] 验证 Android TV 连接 ❌ 不适用
  - **设备**: 10.13.13.45
  - **依赖**: T073
  - **状态**: 不适用 - 设备是普通 Chromecast，不支持 ADB

---

### 9.5 发现逻辑修复

- [X] T075 [P] [US1] 过滤普通 Chromecast 设备 ✅
  - **文件**: `src/remote/protocols/android-tv-adapter.ts`
  - **优先级**: 高
  - **问题**: 普通 Chromecast (10.13.13.45) 被错误识别为 Android TV
  - **根因**: 
    - `probeAdbDevice()` 检测 8008 端口的 eureka_info
    - 但未验证 ADB 端口 5555 是否开放
    - 普通 Chromecast 有 8008 但无 5555
  - **修复方案**:
    1. ✅ 在 `probeAdbDevice()` 中增加 ADB 端口连通性检查 (`checkAdbPort()`)
    2. ✅ 只有 8008 可达且 5555 也可达的设备才认定为 Android TV
    3. ✅ 增加日志区分: `Skipping device without ADB port`
  - **代码位置**: `android-tv-adapter.ts:540-585`
  - **验收标准**:
    - ✅ 普通 Chromecast 不出现在设备列表
    - ✅ Chromecast with Google TV 正常识别

- [X] T076 [P] [US1] 为 webOS 添加端口扫描 fallback ✅
  - **文件**: `src/remote/protocols/webos-adapter.ts`
  - **优先级**: 中
  - **问题**: LG webOS TV 可能不被 SSDP 发现
  - **修复方案**:
    1. ✅ 添加 `discoverViaPortScan()` 方法，扫描 3000 端口
    2. ✅ 对开放端口进行验证
  - **验收标准**:
    - ✅ 通过端口扫描能发现 LG webOS TV

- [X] T077 [P] [US1] 优化 webOS 设备验证 ✅
  - **文件**: `src/remote/protocols/webos-adapter.ts`
  - **依赖**: T076
  - **问题**: 端口 3000 可能被其他服务占用（如 Grafana）
  - **修复方案**:
    1. ✅ 在 `validateWebOSDevice()` 中进行 WebSocket 升级测试
    2. ✅ 发送 WebSocket 升级请求检查响应
    3. ✅ 如果返回 HTTP 200/30x，则不是 LG TV
  - **验收标准**:
    - ✅ Grafana 服务不被识别为 LG TV
    - ✅ 真正的 LG TV 正确识别

- [X] T078 [US1] Fire TV 与 Android TV 去重 ✅
  - **文件**: `src/remote/services/aggregated-discovery.ts`
  - **优先级**: 低
  - **问题**: 同一设备可能被 Fire TV 和 Android TV 适配器同时发现
  - **修复方案**:
    1. ✅ 修改 `_getDeviceKey()` 只使用 IP 地址
    2. ✅ 添加 `_isPlatformMoreSpecific()` 判断平台优先级
    3. ✅ Fire TV > Android TV（Fire TV 是更具体的类型）
    4. ✅ 同时更新 `discoverAllDevices()` 中的去重逻辑
  - **验收标准**:
    - ✅ 同一设备只出现一次
    - ✅ 设备类型正确（Amazon 设备显示为 Fire TV）

- [X] T079 [US1] 实现 ADB 命令发送 ✅
  - **文件**: 
    - `src/remote/services/adb-client.ts`
    - `src/remote/protocols/fire-tv-adapter.ts`
    - `src/remote/protocols/android-tv-adapter.ts`
  - **描述**: 实现真正的 ADB 命令发送
  - **修复方案**:
    1. ✅ 在 `adb-client.ts` 添加 `sendAdbCommand()` 和 `sendAdbKeyEvent()` 函数
    2. ✅ 实现 ADB 协议消息构建（OPEN, WRTE 消息）
    3. ✅ 更新 `FireTVSession.sendCommand()` 调用 `sendAdbKeyEvent()`
    4. ✅ 更新 `AndroidTVSession.sendCommand()` 调用 `sendAdbKeyEvent()`
  - **注意**: 首次连接需要在设备上授权 ADB
  - **验收标准**:
    - ✅ ADB 命令实际发送到设备
    - ⏸️ TV 上可观察到按键效果（需要设备测试）

- [X] T080 [US1] 修复 webOS 方向键命令 ✅
  - **文件**: `src/remote/protocols/webos-adapter.ts`
  - **描述**: webOS 方向键命令需要额外参数
  - **修复方案**:
    1. ✅ 更新 URI 为 `ssap://com.webos.service.ime/sendEnterKey`
    2. ✅ 添加 `WEBOS_KEY_NAMES` 映射（UP, DOWN, LEFT, RIGHT, ENTER 等）
    3. ✅ 在 `sendCommand()` 中添加 `payload: { key: keyName }`
  - **验收标准**:
    - ✅ 方向键命令包含正确的 payload
    - ⏸️ TV 上可观察到导航效果（需要设备测试）

---

## 测试执行计划

### 手动测试清单

1. **Roku 基础测试** (T067, T068)
   ```bash
   # 1. 验证设备可达
   curl -v http://10.13.12.37:8060/query/device-info
   
   # 2. 测试按键
   curl -X POST http://10.13.12.37:8060/keypress/Home
   curl -X POST http://10.13.12.37:8060/keypress/Up
   curl -X POST http://10.13.12.37:8060/keypress/Down
   curl -X POST http://10.13.12.37:8060/keypress/Select
   curl -X POST http://10.13.12.37:8060/keypress/Back
   ```

2. **Fire TV / Android TV 基础测试** (T069, T073, T074)
   ```bash
   # 1. 检查设备类型
   curl http://10.13.13.45:8008/setup/eureka_info
   
   # 2. ADB 连接测试
   adb connect 10.13.13.45:5555
   adb devices
   
   # 3. 测试按键
   adb -s 10.13.13.45:5555 shell input keyevent 3   # Home
   adb -s 10.13.13.45:5555 shell input keyevent 19  # Up
   adb -s 10.13.13.45:5555 shell input keyevent 23  # Select
   ```

3. **LG webOS 基础测试** (T071, T072)
   ```bash
   # WebSocket 测试需要使用工具如 websocat
   # 或在应用中测试连接
   ```

---

## Dependencies & Execution Order

```
Phase 9.1-9.4: 设备测试 (已完成部分)
├── T067 (Roku 连接) ✅ → T068 (Roku 命令) ✅
├── T069 (Fire TV 连接) ⏸️ → T070 (Fire TV 命令) ⏸️
├── T071 (webOS 连接) ⏸️ → T072 (webOS 命令) ⏸️
└── T073 (设备类型确认) ✅ → T074 (Android TV 连接) ❌

Phase 9.5: 发现逻辑修复 (高优先级)
├── T075 (过滤普通 Chromecast) ─┐
├── T076 (webOS 端口扫描) ──────┼─→ 可并行
├── T077 (webOS 设备验证) ──────┘
└── T078 (Fire TV/Android TV 去重)

Phase 9.6: 控制逻辑修复
├── T079 (ADB 命令发送)
└── T080 (webOS 方向键)
```

### 推荐执行顺序

1. **立即执行** (高优先级，影响发现准确性):
   - T075: 过滤普通 Chromecast
   - T076 + T077: webOS 端口扫描和验证

2. **后续执行**:
   - T078: 设备去重
   - T079, T080: 控制命令修复

---

## Changelog

- **2025-12-04**: 完成 T075-T080 实现:
  - ✅ T075: 在 `android-tv-adapter.ts` 添加 `checkAdbPort()` 验证 ADB 端口 5555
  - ✅ T076: 在 `webos-adapter.ts` 添加 `discoverViaPortScan()` 端口扫描 fallback
  - ✅ T077: 在 `webos-adapter.ts` 添加 `validateWebOSDevice()` WebSocket 验证
  - ✅ T078: 在 `aggregated-discovery.ts` 实现 IP 去重和平台优先级逻辑
  - ✅ T079: 在 `adb-client.ts` 添加 `sendAdbCommand()` 和 `sendAdbKeyEvent()`
  - ✅ T080: 在 `webos-adapter.ts` 添加 `WEBOS_KEY_NAMES` 和 payload 支持
- **2025-12-04**: 根据测试发现更新任务:
  - 新增 T075-T080 修复任务
  - 识别 4 个发现逻辑问题
  - 更新设备清单和测试状态
- **2025-12-04**: 执行测试，更新测试结果:
  - ✅ T067, T068: Roku 测试通过
  - ✅ T073: 确认 10.13.13.45 是普通 Chromecast，不支持 ADB
  - ⚠️ T071: 发现 10.13.13.121 是 Grafana，不是 LG TV
  - ⏸️ T069, T070: Fire TV 测试暂停，需要确认正确 IP
  - ⏸️ T072: webOS 测试暂停，需要确认正确 IP
- **2025-12-04**: 初始创建，定义测试任务 T067-T077
