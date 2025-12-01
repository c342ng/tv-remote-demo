# Tasks: TV Remote MVP Multi-Platform Control

**Input**: Design documents from `/specs/001-tv-remote-mvp/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md structure (iOS native app):
- **App**: `TVRemote/App/`
- **Presentation**: `TVRemote/Presentation/`
- **Domain**: `TVRemote/Domain/`
- **Infrastructure**: `TVRemote/Infrastructure/`
- **Tests**: `TVRemoteTests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and iOS project structure

- [ ] T001 Create iOS Xcode project with SwiftUI + UIKit hybrid structure in TVRemote/
- [ ] T002 Initialize Swift Package Manager dependencies (or CocoaPods) for networking and testing
- [ ] T003 [P] Configure SwiftLint and SwiftFormat for code style enforcement
- [ ] T004 [P] Setup project folder structure per plan.md (App/, Presentation/, Domain/, Infrastructure/)
- [ ] T005 [P] Configure Xcode schemes for Debug/Release and Mock/Real modes
- [ ] T006 [P] Add environment variable configuration for TV_REMOTE_USE_MOCK in TVRemote/App/AppConfiguration.swift

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Domain Models

- [ ] T007 [P] Create RemoteKey enum in TVRemote/Domain/Models/RemoteKey.swift
- [ ] T008 [P] Create TVPlatform enum in TVRemote/Domain/Models/TVPlatform.swift
- [ ] T009 [P] Create DeviceStatus enum in TVRemote/Domain/Models/DeviceStatus.swift
- [ ] T010 [P] Create DeviceCapabilities struct in TVRemote/Domain/Models/DeviceCapabilities.swift
- [ ] T011 Create TVDevice struct in TVRemote/Domain/Models/TVDevice.swift (depends on T008, T009, T010)
- [ ] T012 [P] Create ConnectionStatus enum in TVRemote/Domain/Models/ConnectionStatus.swift
- [ ] T013 [P] Create NetworkInfo struct in TVRemote/Domain/Models/NetworkInfo.swift
- [ ] T014 Create ConnectionSession struct in TVRemote/Domain/Models/ConnectionSession.swift (depends on T011, T012, T013)
- [ ] T015 Create RemoteProfile struct and KeyMapping in TVRemote/Domain/Models/RemoteProfile.swift (depends on T007, T008)

### Protocol Definitions

- [ ] T016 Create PlatformAdapter protocol in TVRemote/Domain/Protocols/PlatformAdapter.swift
- [ ] T017 [P] Create error types (DiscoveryError, ConnectionError, CommandError, etc.) in TVRemote/Domain/Protocols/AdapterErrors.swift
- [ ] T018 Create PairingDelegate protocol in TVRemote/Domain/Protocols/PairingDelegate.swift

### Infrastructure - Storage

- [ ] T019 Implement KeychainService for secure token storage in TVRemote/Infrastructure/Storage/KeychainService.swift
- [ ] T020 Implement DeviceStorage for device list persistence in TVRemote/Infrastructure/Storage/DeviceStorage.swift (depends on T011)

### Infrastructure - Networking Base

- [ ] T021 [P] Create HTTPClient base class in TVRemote/Infrastructure/Networking/HTTPClient.swift
- [ ] T022 [P] Create WebSocketClient base class in TVRemote/Infrastructure/Networking/WebSocketClient.swift
- [ ] T023 [P] Create TCPClient base class for ADB in TVRemote/Infrastructure/Networking/TCPClient.swift

### Mock Adapter (for development)

- [ ] T024 Implement MockAdapter with configurable behavior in TVRemote/Infrastructure/Adapters/MockAdapter.swift (depends on T016)

### Core Services

- [ ] T025 Create AdapterFactory for platform adapter instantiation in TVRemote/Domain/Services/AdapterFactory.swift (depends on T024)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - 连接并控制单台电视 (Priority: P1) 🎯 MVP

**Goal**: 用户可以发现、连接并控制一台电视（任一平台）

**Independent Test**: 在一台受支持系统的电视上完成设备发现 → 配对/授权 → 打开遥控界面 → 成功执行方向、确认、返回、音量等基础指令

### Infrastructure for User Story 1

- [ ] T026 [P] [US1] Implement NetworkScanner for device discovery in TVRemote/Infrastructure/Discovery/NetworkScanner.swift
- [ ] T027 [P] [US1] Implement MDNSDiscovery (Bonjour) in TVRemote/Infrastructure/Discovery/MDNSDiscovery.swift
- [ ] T028 [US1] Implement RokuAdapter (HTTP ECP - simplest protocol) in TVRemote/Infrastructure/Adapters/RokuAdapter.swift (depends on T016, T021)

### Domain Services for User Story 1

- [ ] T029 [US1] Implement SessionManager for connection lifecycle in TVRemote/Domain/Services/SessionManager.swift (depends on T014, T016)
- [ ] T030 [US1] Implement ReconnectionService with 3-retry policy (2s→4s→8s) in TVRemote/Domain/Services/ReconnectionService.swift (depends on T029)

### Presentation - ViewModels for User Story 1

- [ ] T031 [US1] Create RemoteControlViewModel in TVRemote/Presentation/ViewModels/RemoteControlViewModel.swift (depends on T029)

### Presentation - UI Components for User Story 1

- [ ] T032 [P] [US1] Create RemoteButton component in TVRemote/Presentation/Components/RemoteButton.swift
- [ ] T033 [P] [US1] Create ConnectionStatusBadge component in TVRemote/Presentation/Components/ConnectionStatusBadge.swift
- [ ] T034 [P] [US1] Create DeviceCard component in TVRemote/Presentation/Components/DeviceCard.swift

### Presentation - Screens for User Story 1

- [ ] T035 [US1] Create DeviceDiscoveryScreen in TVRemote/Presentation/Screens/DeviceDiscoveryScreen.swift (depends on T027, T034)
- [ ] T036 [US1] Create PairingScreen for authorization flow in TVRemote/Presentation/Screens/PairingScreen.swift (depends on T018)
- [ ] T037 [US1] Create RemoteControlScreen with virtual remote UI in TVRemote/Presentation/Screens/RemoteControlScreen.swift (depends on T031, T032, T033)

### App Entry for User Story 1

- [ ] T038 [US1] Configure TVRemoteApp.swift with navigation flow in TVRemote/App/TVRemoteApp.swift (depends on T035, T037)

### Logging for User Story 1

- [ ] T039 [US1] Implement logging infrastructure for user actions and errors in TVRemote/Infrastructure/Logging/Logger.swift

**Checkpoint**: User Story 1 complete - single device discovery, connection, and control works independently

---

## Phase 4: User Story 2 - 管理多台电视设备 (Priority: P2)

**Goal**: 用户可以添加、重命名、切换和删除多台电视设备（最多10台）

**Independent Test**: 在至少两台电视上完成连接，用户可以在设备列表中切换控制目标

### Domain Services for User Story 2

- [ ] T040 [US2] Implement DeviceManager for multi-device CRUD in TVRemote/Domain/Services/DeviceManager.swift (depends on T011, T020)

### Presentation - ViewModels for User Story 2

- [ ] T041 [US2] Create DeviceListViewModel in TVRemote/Presentation/ViewModels/DeviceListViewModel.swift (depends on T040)

### Presentation - Screens for User Story 2

- [ ] T042 [US2] Create DeviceListScreen with add/rename/delete in TVRemote/Presentation/Screens/DeviceListScreen.swift (depends on T041, T034)
- [ ] T043 [US2] Add device switcher to RemoteControlScreen in TVRemote/Presentation/Screens/RemoteControlScreen.swift (depends on T041)

### Validation for User Story 2

- [ ] T044 [US2] Implement 10-device limit validation in DeviceManager in TVRemote/Domain/Services/DeviceManager.swift
- [ ] T045 [US2] Add device name validation (1-50 chars, no empty) in TVRemote/Domain/Models/TVDevice.swift

**Checkpoint**: User Story 2 complete - multi-device management works independently

---

## Phase 5: User Story 3 - 跨品牌平台的统一操作体验 (Priority: P3)

**Goal**: 用户无需理解不同电视系统的差异，统一的遥控界面适配所有平台

**Independent Test**: 在两种不同系统的电视上使用同一遥控界面完成导航和选择操作

### Platform Adapters for User Story 3

- [ ] T046 [P] [US3] Implement AndroidTvAdapter (ADB over TCP) in TVRemote/Infrastructure/Adapters/AndroidTvAdapter.swift (depends on T023)
- [ ] T047 [P] [US3] Implement FireTvAdapter (extends AndroidTvAdapter) in TVRemote/Infrastructure/Adapters/FireTvAdapter.swift (depends on T046)
- [ ] T048 [P] [US3] Implement WebOsAdapter (WebSocket SSAP) in TVRemote/Infrastructure/Adapters/WebOsAdapter.swift (depends on T022)
- [ ] T049 [P] [US3] Implement TizenAdapter (WebSocket Remote) in TVRemote/Infrastructure/Adapters/TizenAdapter.swift (depends on T022)

### Remote Profile for User Story 3

- [ ] T050 [US3] Implement default RemoteProfile with all platform mappings in TVRemote/Domain/Models/RemoteProfile.swift
- [ ] T051 [US3] Update AdapterFactory to instantiate all platform adapters in TVRemote/Domain/Services/AdapterFactory.swift

### UI Capability Handling for User Story 3

- [ ] T052 [US3] Implement capability-based button state (enabled/disabled) in RemoteControlScreen in TVRemote/Presentation/Screens/RemoteControlScreen.swift
- [ ] T053 [US3] Add unsupported command feedback (toast/alert) in TVRemote/Presentation/Components/UnsupportedCommandAlert.swift

**Checkpoint**: User Story 3 complete - unified UX across all 5 TV platforms

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

### Error Handling & Edge Cases

- [ ] T054 [P] Implement graceful offline handling in SessionManager
- [ ] T055 [P] Add network change detection and auto-reconnect trigger
- [ ] T056 [P] Implement authorization rejection handling in PairingScreen

### Performance & UX

- [ ] T057 [P] Add haptic feedback to RemoteButton component
- [ ] T058 [P] Optimize button response time to <100ms local feedback
- [ ] T059 [P] Add loading states and progress indicators

### Documentation & Validation

- [ ] T060 Run quickstart.md validation - verify all setup steps work
- [ ] T061 Update README.md with build and run instructions
- [ ] T062 Add inline code documentation (Swift DocC comments)

### Security

- [ ] T063 Audit Keychain usage - ensure no sensitive data in logs
- [ ] T064 Validate IP address input to prevent injection

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - User stories can proceed sequentially in priority order (P1 → P2 → P3)
  - Or in parallel if team capacity allows (after Phase 2)
- **Polish (Phase 6)**: Depends on at least US1 completion, ideally all stories

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Builds on US1 screens but independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Adds platform adapters, integrates with US1/US2

### Within Each User Story

- Infrastructure before Services
- Services before ViewModels
- ViewModels before Screens
- Components can be built in parallel with ViewModels
- Story complete before moving to next priority

### Parallel Opportunities Per Phase

**Phase 1 (Setup)**:
```
T001 → T002 → [T003, T004, T005, T006] (parallel)
```

**Phase 2 (Foundational)**:
```
[T007, T008, T009, T010, T012, T013] (parallel models)
     ↓
[T011, T014, T015] (composite models)
     ↓
[T016, T017, T018] (parallel protocols)
     ↓
[T019, T020] (parallel storage)
     ↓
[T021, T022, T023] (parallel networking)
     ↓
T024 (MockAdapter)
     ↓
T025 (AdapterFactory)
```

**Phase 3 (US1)**:
```
[T026, T027] (parallel discovery)
     ↓
T028 (RokuAdapter)
     ↓
T029 → T030 (SessionManager → ReconnectionService)
     ↓
T031 (RemoteControlViewModel)
     ↓
[T032, T033, T034] (parallel components)
     ↓
[T035, T036, T037] (parallel screens - different files)
     ↓
T038 (App entry)
     ↓
T039 (Logging)
```

**Phase 4 (US2)**:
```
T040 (DeviceManager)
     ↓
T041 (DeviceListViewModel)
     ↓
[T042, T043] (parallel screens)
     ↓
[T044, T045] (parallel validations)
```

**Phase 5 (US3)**:
```
[T046, T048, T049] (parallel adapters - different files)
     ↓
T047 (FireTvAdapter - extends AndroidTvAdapter)
     ↓
[T050, T051] (RemoteProfile, AdapterFactory)
     ↓
[T052, T053] (UI capability handling)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test single device control on Roku (simplest)
5. Deploy TestFlight build if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test single device → Deploy (MVP!)
3. Add User Story 2 → Test multi-device → Deploy
4. Add User Story 3 → Test cross-platform → Deploy (Full feature)
5. Polish phase → Final refinements

### Task Count Summary

| Phase | Task Count | Parallel Opportunities |
|-------|------------|------------------------|
| Phase 1: Setup | 6 | 4 parallel |
| Phase 2: Foundational | 19 | 13 parallel |
| Phase 3: US1 | 14 | 8 parallel |
| Phase 4: US2 | 6 | 4 parallel |
| Phase 5: US3 | 8 | 6 parallel |
| Phase 6: Polish | 11 | 9 parallel |
| **Total** | **64** | **44 parallel** |

---

## Notes

- [P] tasks = different files, no dependencies within the phase
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- RokuAdapter (T028) is implemented first as it uses the simplest HTTP protocol for quick validation
