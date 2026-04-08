# NBINS - 新造船检验管理系统

> **NBINS** (New Building Inspection System)

NBINS 是一个面向船舶检验机构的多人协作新造船检验管理平台，用来管理报验（inspection requests）、检验结果、整改意见和轮次历史。

## 当前状态

NBINS 当前处于 **可演示的 MVP baseline** 阶段：核心检验明细读取、结果提交、领域规则和 mock-backed API 流程已经落地；真实 D1 持久化、权限体系、导入/PDF/n8n 仍在后续阶段。

- `✅ Complete`: monorepo 基础、共享类型契约、inspection detail API、结果提交流程、核心领域规则、基础测试
- `🟡 Partial`: persistence 抽象与 repository、D1 foundation、前端工作台与 API 集成深度、backend auth / RBAC（最小登录骨架已落地）
- `❌ Not started`: 完整 JWT / session auth、import pipeline、正式 PDF、n8n automation

更细的模块状态见：[项目状态看板](./docs/status-board.md)
- 本轮 auth 增量说明见：[M15 Auth Login Increment](./docs/m15-auth-login.md)

当前仓库已经不只是“架构草图”——它已经具备一套可演示的 MVP 主线：

- 前后端共享类型契约
- 检验结果状态机与提交语义
- 详情页 / comments / round history / 提交表单
- Hono API 路由与乐观锁校验
- 可运行的 mock persistence 与基础测试

---

## 当前 MVP 已实现什么

### 后端

- `GET /api/inspections/:id`
- `PUT /api/inspections/:id/rounds/current/result`
- repository / service / persistence 分层
- in-memory mock database（用于本地演示）
- optimistic locking（`expectedVersion`）
- 领域规则测试与路由测试

### 前端

- 今日检验项目列表
- 检验项详情侧栏
- round history 展示
- comments 清单展示
- 结果提交表单与提交后本地状态刷新
- 提交前 preview（next workflow / open comments / final acceptance）

### 共享契约

- 检验结果枚举：`CX / AA / QCC / OWC / RJ`
- 工作流状态：`pending / open / closed / cancelled`
- comment 状态：`open / closed`
- inspection detail / submit request / submit response 类型

---

## 关键业务规则

NBINS 当前最核心的价值，不是 UI，而是把检验业务规则真正编码进系统。

### 检验结果语义

- `AA`（接受）
  - **不能新增 comments**
  - 如果历史仍有开放 comments，则 item 仍保持 `workflowStatus = open`
  - 此时 `resolvedResult = null`，表示“最终接受待定”
  - 只有所有 comments 关闭后，才会真正转为 `AA + closed`

- `QCC`（带意见接受）
  - 允许新增 comments
  - 不触发新的 round
  - comments 全部关闭后，可自动归并为最终 `AA`

- `OWC`（复检） / `RJ`（拒绝）
  - 允许新增 comments
  - 保持 `workflowStatus = open`
  - `waitingForNextRound = true`
  - 语义上等待船厂重新报验

- `CX`（取消）
  - 直接转为 `workflowStatus = cancelled`
  - 不新增 comments

---

## 仓库结构

```text
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── packages/
│   ├── shared/    # 前后端共享类型、常量、mock helpers
│   ├── api/       # Hono API（Cloudflare Workers-compatible）
│   └── web/       # Vite + React 检验工作台
├── n8n/           # 预留：n8n workflow 定义与备份
└── docs/          # 架构、前端、n8n、MVP 说明等文档
```

当前关键代码：

- `packages/shared/src/index.ts`
- `packages/shared/src/inspection-detail.ts`
- `packages/api/src/routes/inspections.ts`
- `packages/api/src/services/inspection-service.ts`
- `packages/api/src/repositories/inspection-repository.ts`
- `packages/api/src/domain/inspection-item-state.ts`
- `packages/api/src/domain/inspection-item-submission.ts`
- `packages/web/src/App.tsx`

---

## 快速启动

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动前端

```bash
pnpm dev:web
```

### 3. 启动 API

```bash
# 默认使用 mock storage（适合演示 / 不依赖 D1）
pnpm dev:api

# 使用本地 D1（wrangler --local + persist），并在启动前自动 bootstrap schema
# 需要保证 packages/api/wrangler.jsonc 里存在 DB 绑定
pnpm dev:api:d1
```

> 说明：当前 mock 与 D1 都走同一套 repository 逻辑，但 **mock 仍是默认 runtime driver**。
> 若 `D1_DRIVER` 未设置为 `d1`，或 Wrangler 的 `DB` binding 未正确解析，API 会自动回退到 mock。

### 4. 类型检查 / 构建

```bash
pnpm typecheck
pnpm build
```

### 5. 跑 API 测试

```bash
pnpm --filter @nbins/api test
```

---

## 演示方式

当前最适合做的是 **本地 MVP 演示**。

### 前端演示重点

建议在页面中依次演示：

1. 左侧 inspection list
2. 右侧 inspection detail
3. round history
4. comments 列表
5. result submission form

### 推荐演示场景

- 对已有开放意见的项目选择 `AA`
  - 演示：不能新增 comments
  - 演示：若历史 comments 未关闭，则不会真正 closed

- 对待处理项目提交 `QCC`
  - 演示：可新增 comments
  - 演示：不进入新 round

- 提交 `OWC` / `RJ`
  - 演示：等待下一 round

- 提交 `CX`
  - 演示：直接 cancelled

更多详细步骤见：

- [docs/mvp-status.md](./docs/mvp-status.md)

---

## API 示例

### 获取详情

```bash
curl http://127.0.0.1:8787/api/inspections/insp-002
```

### 提交带意见接受（QCC）

```bash
curl -X PUT http://127.0.0.1:8787/api/inspections/insp-001/rounds/current/result \
  -H 'Content-Type: application/json' \
  -d '{
    "result": "QCC",
    "actualDate": "2026-04-03",
    "submittedBy": "Inspector Demo",
    "inspectorDisplayName": "Inspector Demo",
    "expectedVersion": 1,
    "comments": [
      { "message": "Touch-up coating at nozzle edge" },
      { "message": "Attach holiday test report" }
    ]
  }'
```

### 演示 `AA` 禁止新增 comments

```bash
curl -X PUT http://127.0.0.1:8787/api/inspections/insp-001/rounds/current/result \
  -H 'Content-Type: application/json' \
  -d '{
    "result": "AA",
    "actualDate": "2026-04-03",
    "submittedBy": "Inspector Demo",
    "expectedVersion": 1,
    "comments": [
      { "message": "This should be rejected" }
    ]
  }'
```

---

## 当前限制

当前仓库仍处于 MVP 早期，以下能力还没有接入：

- 真实 Cloudflare D1 / Drizzle persistence
- 前端直连真实 API
- 用户认证 / RBAC
- comment close / resolve 的完整交互闭环
- PDF 正式报告生成
- n8n 自动导入 / 自动发报告

所以这版仓库的定位应明确为：

> **可运行、可演示、可继续迭代的 MVP 基线**

而不是生产环境就绪版本。

---

## 文档导航

- [架构设计规划](./docs/architecture.md)
- [MVP 当前状态与演示说明](./docs/mvp-status.md)
- [前端页面规划](./docs/frontend-plan.md)
- [前端风格对齐方案](./docs/frontend-style-alignment.md)
- [n8n 工作流设计](./docs/n8n-plan.md)

---

## 下一步建议

优先级建议如下：

1. mock persistence → Cloudflare D1 / Drizzle
2. 前端详情页接真实 API
3. comment close / resolve 接口与前端闭环
4. 用户认证与项目级权限控制
5. 导入链路与正式 PDF 报告
