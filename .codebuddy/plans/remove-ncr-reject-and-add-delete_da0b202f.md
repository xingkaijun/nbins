---
name: remove-ncr-reject-and-add-delete
overview: 取消 NCR 审核中的 reject 选项，改为仅允许发布；同时在 NCR 列表中增加删除入口，用现有删除接口处理无效 NCR，避免无效记录长期保留。
todos:
  - id: publish-only-contract
    content: 收紧共享契约与NCR审批路由为仅允许发布
    status: completed
  - id: ncrs-page-actions
    content: 更新Ncrs页面，移除Reject并加入删除确认
    status: completed
    dependencies:
      - publish-only-contract
  - id: ncrs-regression-tests
    content: 新增NCR路由测试覆盖发布、删除与权限
    status: completed
    dependencies:
      - publish-only-contract
---

## User Requirements

- 取消 NCR 审核阶段的 `Reject` 操作，待审核单据不再走“拒绝后保留编号”的流程。
- 对无效、误建的 NCR 增加删除能力，避免无效记录长期残留。
- 删除入口放在现有 NCR 管理页的操作区，保持当前页面结构与使用习惯。

## Product Overview

- NCR 管理页的审核动作将收敛为“发布”单一路径。
- 每条可删除的 NCR 增加明显但克制的删除按钮，并在删除后立即从当前列表消失。
- 页面视觉保持现有风格，仅精简审核操作、补充删除入口与确认提示。

## Core Features

- 待审批 NCR 仅支持 Publish，相关成功/失败提示文案同步改为发布语义。
- NCR 列表操作区新增 Delete 按钮，删除前二次确认，删除后即时更新列表。
- 状态筛选不再把 `Rejected` 作为正常流转选项；历史已存在的 `rejected` 数据保持兼容查看与删除。

## Tech Stack Selection

- Monorepo：`pnpm workspace`
- 前端：React 18 + TypeScript + Vite，位于 `packages/web`
- 后端：Hono + TypeScript，运行在 Cloudflare Workers，位于 `packages/api`
- 共享类型：`@nbins/shared`，位于 `packages/shared`

## Implementation Approach

- 基于现有 NCR 流程做最小闭环改造：继续复用 `PUT /ncrs/:id/approve` 作为发布入口，但后端改为仅允许发布，不再生成新的 `rejected` 状态。
- 复用现有删除能力：前端直接接入已存在的 `deleteNcr()` 与 `DELETE /ncrs/:id`，不新增重复接口。
- 页面层移除 `Reject` 按钮与相关筛选项，在 `Ncrs` 列表现有操作区增加带确认的删除按钮，并按现有权限规则显示。
- 为避免破坏历史数据，保留对已存在 `rejected` 记录的读取与展示兼容，不做本次数据迁移。

### Key Decisions

- **不改路由路径，只改业务约束**：保留现有审批路由，降低调用链改动范围。
- **删除替代拒绝**：无效 NCR 通过删除清理，避免继续占号并残留列表。
- **保留历史兼容**：停止“产生 rejected”，但不立即移除类型中的 `rejected`，避免旧数据读取、列表展示、导出映射异常。

### Performance &amp; Reliability

- 删除后优先在前端本地状态中移除当前项，复杂度为 O(n)，无需强制全量重载。
- 发布路径继续沿用现有单条记录读写、PDF 生成与 webhook 触发链路，不增加额外批量开销。
- 后端继续以权限校验为准，前端仅做按钮显隐，避免越权依赖前端控制。

## Implementation Notes

- 复用 `packages/web/src/api.ts` 中已存在的 `deleteNcr`，避免新增重复客户端封装。
- `packages/api/src/routes/ncrs.ts` 中审批分支需改为“仅发布”，并同步更新错误文案，避免出现 “published or rejected” 之类旧提示。
- 删除操作建议加入前端确认提示，防止误删；删除成功后同步清理本地 `items`、展开状态与草稿状态。
- 维持现有 API 路由 `console.error` 日志模式，不增加敏感数据输出，也避免前端重复弹窗刷屏。

## Architecture Design

- `packages/web/src/pages/Ncrs.tsx`：列表页操作入口、权限显隐、本地状态更新。
- `packages/web/src/api.ts`：复用现有 NCR 删除与发布请求封装。
- `packages/api/src/routes/ncrs.ts`：发布约束、删除权限与存储清理。
- `packages/shared/src/ncr.ts`：收紧审批请求契约，明确审批只允许发布。

数据流：
`Ncrs 页面操作` → `web/api.ts 请求` → `api/routes/ncrs.ts` → `R2 对象与 D1 索引/记录`

## Directory Structure

本次改动集中在现有 NCR 页面、共享契约与 NCR 路由，另补充针对 NCR 路由的回归测试。

- `packages/web/src/pages/Ncrs.tsx`  `[MODIFY]`
- **Purpose**: NCR 列表页与操作区交互。
- **Functionality**: 移除 `Reject` 按钮；为待删项增加 `Delete` 按钮与确认提示；同步调整筛选项、提示文案、按钮显隐与本地状态清理。
- **Implementation requirements**: 前端删除权限需镜像后端现有规则；删除成功后从 `items`、`reviewDrafts`、展开状态中移除对应项。

- `packages/api/src/routes/ncrs.ts`  `[MODIFY]`
- **Purpose**: NCR 发布、删除与权限控制。
- **Functionality**: 将审批接口收敛为仅发布流程，禁止新的 reject 写入；保留现有删除路由与存储清理逻辑。
- **Implementation requirements**: 待审批校验仍保持；审批失败文案改为发布语义；删除权限规则保持 `admin/manager/原作者` 不变。

- `packages/shared/src/ncr.ts`  `[MODIFY]`
- **Purpose**: NCR 共享请求/响应类型定义。
- **Functionality**: 收紧审批请求定义，表达“审批只允许发布”；状态响应继续兼容历史 `rejected` 数据。
- **Implementation requirements**: 避免一次性移除 `rejected` 响应类型导致旧数据读取异常。

- `packages/api/src/routes/ncrs.test.mjs`  `[NEW]`
- **Purpose**: NCR 路由回归测试。
- **Functionality**: 覆盖仅发布、拒绝失效、删除权限、删除成功返回等关键场景。
- **Implementation requirements**: 复用现有 `node:test` 与假数据模式，保持与 `routes/*.test.mjs` 一致。