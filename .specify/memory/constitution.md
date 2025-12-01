<!--
=== Sync Impact Report ===
Version change: N/A → 1.0.0 (Initial release)
Modified principles: N/A (Initial creation)
Added sections:
  - Core Principles (4 principles: Code Quality, Testing Strategy, UX Consistency, Performance & Availability)
  - Development Workflow
  - Quality Gates
  - Governance
Removed sections: N/A
Templates requiring updates:
  ✅ plan-template.md - Constitution Check section compatible
  ✅ spec-template.md - Requirements structure aligned
  ✅ tasks-template.md - Test phases aligned with Testing Strategy principle
Follow-up TODOs: None
===========================
-->

# TV Remote Demo Constitution

## Core Principles

### I. Code Quality & Style Standards (NON-NEGOTIABLE)

代码质量是项目可维护性和团队协作的基础。所有代码 MUST 遵循以下规范：

- **一致的代码风格**: MUST 使用项目配置的 linter 和 formatter（如 ESLint、Prettier）
- **命名规范**: 变量、函数、组件命名 MUST 清晰表达意图，禁止使用单字母变量（循环索引除外）
- **代码复杂度**: 单个函数 MUST NOT 超过 50 行；圈复杂度 MUST NOT 超过 10
- **注释与文档**: 公共 API 和复杂业务逻辑 MUST 有清晰的注释说明
- **代码审查**: 所有合并到主分支的代码 MUST 经过至少一人审查

**理由**: 电视遥控器应用需要长期维护，统一的代码风格降低认知负担，提高团队协作效率。

### II. Testing Strategy

测试是质量保障的核心防线。项目 MUST 建立分层测试体系：

- **单元测试覆盖率**: 核心业务逻辑 MUST 达到 80% 以上覆盖率
- **集成测试**: 设备通信、遥控指令等关键路径 MUST 有集成测试覆盖
- **端到端测试**: 核心用户场景（连接设备、发送指令、断开连接）MUST 有 E2E 测试
- **测试命名**: 测试用例 MUST 清晰描述"Given-When-Then"场景
- **测试隔离**: 测试 MUST 相互独立，不依赖执行顺序

**理由**: 遥控器应用直接影响用户操控体验，测试确保各种设备和网络环境下的可靠性。

### III. UX Consistency

用户体验一致性是产品专业度的体现。所有 UI/UX 设计 MUST 遵循：

- **交互反馈**: 所有用户操作 MUST 在 100ms 内有视觉反馈
- **状态可见性**: 设备连接状态、指令发送状态 MUST 始终清晰可见
- **错误处理**: 错误信息 MUST 使用用户友好的语言，并提供可操作的解决建议
- **无障碍设计**: 核心功能 MUST 支持屏幕阅读器和键盘导航
- **设计系统**: 颜色、字体、间距 MUST 遵循统一的设计 Token

**理由**: 电视遥控器面向普通用户，一致且直观的体验降低学习成本，提升用户满意度。

### IV. Performance & Availability

性能和可用性是遥控器应用的生命线。MUST 满足以下底线：

- **响应时间**: 遥控指令从发送到电视响应 MUST < 200ms（本地网络环境）
- **首屏加载**: 应用首屏渲染 MUST < 2 秒（4G 网络环境）
- **内存占用**: 应用运行时内存 MUST NOT 超过 100MB
- **离线容错**: 网络断开时 MUST 显示明确提示，恢复后 MUST 自动重连
- **电池优化**: 后台运行时 MUST 最小化资源消耗

**理由**: 遥控器需要即时响应，任何延迟都会严重影响用户体验；作为常驻应用，资源优化至关重要。

## Development Workflow

开发流程确保代码质量和交付效率的平衡：

- **分支策略**: 使用 Git Flow，`main` 为生产分支，`develop` 为开发分支
- **提交规范**: 提交信息 MUST 遵循 Conventional Commits 格式
- **Pull Request**: PR MUST 包含变更描述、测试说明、截图（UI 变更时）
- **持续集成**: 每次 PR MUST 通过自动化测试和 lint 检查

## Quality Gates

合并代码前 MUST 通过以下质量门禁：

1. ✅ 所有自动化测试通过
2. ✅ 代码覆盖率不低于既定阈值
3. ✅ 无 linter/formatter 警告或错误
4. ✅ 至少一人代码审查通过
5. ✅ 性能测试不低于基线指标（如适用）

## Governance

本宪法是项目开发的最高准则：

- **优先级**: 本宪法规定优先于其他开发实践和临时决策
- **修订流程**: 修订 MUST 提交 PR，说明修改理由和影响范围，经团队讨论后合并
- **版本管理**: 采用语义化版本（MAJOR.MINOR.PATCH）
  - MAJOR: 原则删除或重大定义变更
  - MINOR: 新增原则或章节
  - PATCH: 措辞澄清、错字修复
- **合规检查**: 代码审查时 MUST 验证是否符合宪法原则

**Version**: 1.0.0 | **Ratified**: 2025-12-01 | **Last Amended**: 2025-12-01
