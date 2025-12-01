# Quickstart Guide: TV Remote MVP Development

**Created**: 2025-12-01  
**Purpose**: 快速搭建本地开发环境，运行应用并在 Mock/真机模式间切换

---

## 1. 环境要求

### 必备软件
- **Node.js**: >= 16.x（推荐 18.x LTS）
- **npm** 或 **yarn**: 包管理工具
- **Expo CLI**: `npm install -g expo-cli`
- **Git**: 用于版本控制

### 可选工具
- **Xcode** (macOS): 用于 iOS 模拟器/真机调试
- **Android Studio**: 用于 Android 模拟器/真机调试
- **Expo Go App**: 移动端快速预览（iOS/Android 应用商店下载）

---

## 2. 项目初始化

### 2.1 克隆仓库并安装依赖

```bash
# 克隆项目
git clone <repository-url> tv-remote-demo
cd tv-remote-demo

# 切换到 feature 分支
git checkout 001-tv-remote-mvp

# 安装依赖
npm install
# 或
yarn install
```

### 2.2 配置环境变量

创建 `.env` 文件（根目录）：

```bash
# Mock 模式开关（1 = 启用 Mock，0 或未设置 = 真机模式）
TV_REMOTE_USE_MOCK=1

# Mock 模式配置（可选）
MOCK_SIMULATE_TIMEOUT=0           # 模拟连接超时
MOCK_DISCOVER_DEVICES_COUNT=5     # 模拟发现设备数量
```

**说明**:
- 默认情况下（`TV_REMOTE_USE_MOCK` 未设置或为 `0`），应用运行在**真机模式**，需要真实的电视设备。
- 设置 `TV_REMOTE_USE_MOCK=1` 后，应用使用 `MockAdapter`，无需实际设备即可开发和测试 UI。

---

## 3. 启动开发服务器

### 3.1 使用 Expo 启动

```bash
# 启动 Expo 开发服务器
npm start
# 或
yarn start
# 或
expo start
```

### 3.2 在模拟器/真机上运行

启动后会看到二维码和选项菜单：

- **iOS 模拟器**: 按 `i` 键（需安装 Xcode）
- **Android 模拟器**: 按 `a` 键（需安装 Android Studio）
- **真机扫码**: 使用 Expo Go App 扫描二维码

---

## 4. Mock 模式 vs 真机模式切换

### 4.1 启用 Mock 模式（开发阶段推荐）

```bash
# 修改 .env 文件
TV_REMOTE_USE_MOCK=1

# 重启开发服务器
npm start
```

**Mock 模式特性**:
- `discover()` 返回 5 台虚拟设备（Android TV、Fire TV、webOS、Tizen、Roku 各 1 台）
- `connect()` 模拟 100-200ms 延迟后成功连接
- `sendKey()` 模拟 50-100ms 延迟，无需真实电视响应
- 所有操作在内存中记录，可用于调试和测试

### 4.2 切换到真机模式

```bash
# 修改 .env 文件
TV_REMOTE_USE_MOCK=0
# 或直接删除该行

# 重启开发服务器
npm start
```

**真机模式要求**:
- 设备与电视在同一局域网内
- 不同平台需要不同的准备工作（见第 5 节）

---

## 5. 真机模式准备工作

### 5.1 Android TV / Amazon Fire TV

**前置条件**:
1. 在电视上打开"开发者选项"（通常在"关于" → 连续点击版本号 7 次）
2. 启用 **"ADB 调试"** 和 **"网络调试"**
3. 记下电视显示的 IP 地址

**连接步骤**:
1. 在应用中手动输入电视 IP 地址（或通过设备发现自动找到）
2. 首次连接时，电视会显示授权弹窗，点击"允许"
3. 连接成功后即可发送遥控指令

**注意事项**:
- ADB 调试主要用于开发/演示场景，不适合普通用户
- 部分路由器可能阻止 ADB 端口，需调整网络设置

---

### 5.2 LG webOS

**前置条件**:
1. 确保电视已连接 Wi-Fi 并获取 IP 地址
2. 在应用中输入电视 IP 地址

**连接步骤**:
1. 首次连接时，电视会显示 **6 位配对码**
2. 在应用中输入配对码并提交
3. 配对成功后，应用会保存 token，后续无需重新配对

**注意事项**:
- 配对 token 默认存储在 AsyncStorage，建议后续升级到 SecureStore

---

### 5.3 Samsung Tizen

**前置条件**:
1. 确保电视已连接 Wi-Fi 并获取 IP 地址
2. 在应用中输入电视 IP 地址

**连接步骤**:
1. 首次连接时，电视会显示 **配对 PIN 码**
2. 在应用中输入 PIN 码并提交
3. 配对成功后，应用会保存 token

**注意事项**:
- 部分旧款 Tizen 设备可能不支持网络遥控 API

---

### 5.4 Roku

**前置条件**:
1. 确保电视/设备已连接 Wi-Fi
2. 在应用中输入 Roku 设备 IP 地址

**连接步骤**:
1. 无需配对，直接通过 HTTP 发送指令
2. 连接成功后即可遥控

**注意事项**:
- Roku 协议最简单，适合作为首个真机测试平台

---

## 6. 目录结构说明

```
tv-remote-demo/
├── src/
│   ├── app/                    # UI 层
│   │   ├── screens/            # 页面组件
│   │   ├── components/         # 公共 UI 组件
│   │   └── navigation/         # 导航配置
│   ├── domain/                 # 业务逻辑层
│   │   ├── models/             # 数据模型（TVDevice、ConnectionSession 等）
│   │   ├── services/           # 业务服务（DeviceManager 等）
│   │   └── remote/             # 遥控抽象层
│   │       ├── RemoteAbstraction.ts
│   │       ├── PlatformAdapter.ts
│   │       ├── adapters/       # 各平台真机适配器
│   │       └── mocks/          # Mock 适配器
│   └── infra/                  # 基础设施层
│       ├── storage/            # AsyncStorage 封装
│       ├── config/             # 环境变量读取
│       └── logging/            # 日志工具
├── tests/                      # 测试文件
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .env                        # 环境变量配置
├── package.json
└── README.md
```

---

## 7. 常用开发命令

```bash
# 启动开发服务器
npm start

# 运行单元测试
npm test

# 运行测试覆盖率检查
npm run test:coverage

# 代码风格检查
npm run lint

# 代码格式化
npm run format

# 构建生产版本
npm run build

# 清理缓存
expo start -c
```

---

## 8. 常见问题排查

### 8.1 设备发现失败

**症状**: 应用无法找到局域网内的电视设备

**可能原因**:
- 设备与电视不在同一网络
- 路由器禁用了 mDNS/SSDP 广播
- 电视未开启网络调试功能

**解决方案**:
- 确认设备与电视连接到同一 Wi-Fi
- 尝试手动输入电视 IP 地址
- 检查路由器防火墙设置

---

### 8.2 连接超时

**症状**: 连接电视时一直显示"连接中"，最后超时失败

**可能原因**:
- 电视未开启 ADB 调试（Android TV/Fire TV）
- 配对流程未完成（webOS/Tizen）
- 网络延迟过高

**解决方案**:
- 检查电视端设置
- 确保完成配对流程
- 切换到 Mock 模式排除网络问题

---

### 8.3 Mock 模式未生效

**症状**: 明明设置了 `TV_REMOTE_USE_MOCK=1`，但应用仍尝试连接真实设备

**可能原因**:
- `.env` 文件未生效（需重启开发服务器）
- 环境变量读取逻辑有误

**解决方案**:
```bash
# 完全停止开发服务器
# 修改 .env 文件
TV_REMOTE_USE_MOCK=1

# 清除缓存并重启
expo start -c
```

---

### 8.4 指令发送无响应

**症状**: 点击遥控按钮后，UI 有反馈但电视无响应

**可能原因**:
- 设备已离线
- 该平台不支持当前按键
- 会话已过期

**解决方案**:
- 检查设备连接状态
- 查看日志中的错误信息
- 尝试断开重连

---

## 9. 下一步开发建议

### Phase 0（当前阶段）
- [ ] 完成项目初始化和基础架构搭建
- [ ] 实现 `MockAdapter` 和抽象层接口
- [ ] 搭建基础 UI（DeviceListScreen + RemoteControlScreen）

### Phase 1
- [ ] 实现 Roku 适配器（协议最简单）
- [ ] 完成设备发现与连接流程
- [ ] 实现基础遥控按键（方向、确认、返回）

### Phase 2
- [ ] 实现 Android TV / Fire TV 适配器
- [ ] 实现 webOS / Tizen 适配器
- [ ] 添加多设备管理功能

### Phase 3
- [ ] 完善错误处理与离线重连
- [ ] 添加单元测试与集成测试
- [ ] 性能优化与用户体验打磨

---

## 10. 相关资源

- [React Native 官方文档](https://reactnative.dev/)
- [Expo 官方文档](https://docs.expo.dev/)
- [Android ADB 协议](https://developer.android.com/studio/command-line/adb)
- [LG webOS TV API](https://webostv.developer.lge.com/)
- [Samsung Tizen TV API](https://developer.samsung.com/smarttv/develop/api-references.html)
- [Roku ECP 协议](https://developer.roku.com/docs/developer-program/debugging/external-control-api.md)

---

**快速开始版本**: 1.0.0  
**最后更新**: 2025-12-01

祝开发顺利！🚀
