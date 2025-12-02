# Quickstart: TV Remote MVP (React Native + Expo)

## 1. 环境准备

- Node.js LTS (v20+)
- npm 或 yarn
- Expo CLI (SDK 54)
- iOS 模拟器或真机（推荐真机测试电视控制）

## 2. 快速开始

```bash
# 安装依赖
cd tv-remote-demo
npm install --legacy-peer-deps

# 启动开发服务器（真机模式）
npm start

# 或者启动 Mock 模式（仅测试用）
TV_REMOTE_ENV=mock npm start
```

## 3. 运行模式

### 真机/生产模式（默认）
- 不设置 `TV_REMOTE_ENV` 或设置为除 `"mock"` 以外的任意值。
- 使用各平台真实协议（ECP 等），需要在对应电视上完成必要的调试/授权设置。

### Mock 模式（仅测试用）
- 在启动命令前设置环境变量：

  ```bash
  TV_REMOTE_ENV=mock expo start
  ```

- 抽象层自动切换到 `mocks/` 下的实现：
  - 模拟设备列表和连接状态
  - 模拟指令发送成功/失败
  - 不会访问真实网络或电视设备

## 4. 核心目录结构

```
app/remote/
├── components/     # 遥控按钮、状态栏等 UI 组件
├── domain/         # 抽象层实体与接口（TVDevice, TVSession, RemoteProfile 等）
├── protocols/      # 平台协议适配器（Roku ECP 等）
├── screens/        # 遥控主界面、设备发现界面
├── services/       # 环境检测、设备存储等服务
└── mocks/          # 仅在 TV_REMOTE_ENV=mock 时启用的 mock 实现
```

## 5. Roku 真机控制

### 前提条件
1. 确保 iOS 手机和 Roku 电视在**同一 Wi-Fi 网络**。
2. Roku 默认启用 ECP (端口 8060)，无需额外设置。

### 使用步骤
1. 启动应用后进入设备发现界面。
2. 应用会扫描局域网内的 Roku 设备。
3. 选择发现到的 Roku 设备进行连接。
4. 连接成功后进入遥控界面，测试按键：
   - 方向键（上/下/左/右）
   - 确认/选择（OK）
   - 返回、主页
   - 音量控制
   - 播放控制

### 手动添加设备
如果自动发现未找到设备，可以手动添加：
1. 在发现界面点击"手动添加设备"。
2. 选择平台（Roku）。
3. 输入电视的 IP 地址（可在 Roku 设置 > 网络中查看）。
4. 点击添加并连接。

## 6. 基本用户流程

1. 确保手机与目标电视在同一局域网。
2. iOS 上安装并启动 TV Remote 应用。
3. 首次进入设备发现界面：
   - 自动扫描或手动添加设备。
   - 选择设备完成连接。
4. 进入虚拟遥控器界面，测试各种按键控制。

## 7. 测试与验证

```bash
# 类型检查
npx tsc --noEmit

# 单元测试
npm test

# ESLint 检查
npm run lint
```

## 8. 故障排除

### 找不到设备
- 确认手机和电视在同一 Wi-Fi 网络。
- 检查电视的 IP 地址并尝试手动添加。
- 确保没有防火墙阻止端口 8060。

### 连接失败
- 重启电视和应用后重试。
- 确认电视已开启且未休眠。

### 按键无响应
- 检查连接状态是否为"已连接"。
- 尝试断开重连。
