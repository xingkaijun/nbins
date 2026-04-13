---
name: discipline-主数据化改造
overview: 将硬编码的专业列表改为数据库中的可维护主数据，支持项目按专业选择、用户从受限专业中选择，并在管理后台新增 discipline 管理页。
todos:
  - id: explore-discipline-scope
    content: 使用 [subagent:code-explorer] 复核专业常量引用与 Admin 实际入口
    status: pending
  - id: add-discipline-master
    content: 新增 disciplines 表、迁移脚本与 /api/disciplines 路由
    status: pending
    dependencies:
      - explore-discipline-scope
  - id: align-shared-and-validation
    content: 放宽 shared Discipline 类型并补齐后端专业校验与兼容映射
    status: pending
    dependencies:
      - add-discipline-master
  - id: wire-web-api
    content: 扩展 web API 与基础类型，统一拉取数据库专业主数据
    status: pending
    dependencies:
      - add-discipline-master
  - id: renovate-admin
    content: 改造 Admin.tsx 新增 Discipline 标签并替换项目用户专业选项
    status: pending
    dependencies:
      - align-shared-and-validation
      - wire-web-api
  - id: update-operational-pages
    content: 改造 Observations 与 Import 使用项目限定的数据库专业
    status: pending
    dependencies:
      - wire-web-api
  - id: finalize-migration-checks
    content: 补充 D1 初始化说明并执行类型检查与回归验证
    status: pending
    dependencies:
      - renovate-admin
      - update-operational-pages
---

## 用户需求

将目前写死在代码中的专业名称改为可维护的专业主数据。专业项如 `MACH`、`HULL`、`PAINT`、`CCS`、`CHS` 等不再依赖固定常量，而由后台统一维护。

## 产品概览

系统新增一套“专业字典”管理能力。管理员可在后台查看、新增、编辑专业；新建或编辑项目时，从专业列表中勾选本项目适用的专业；新建或编辑用户时，只能从允许范围内选择专业。界面上表现为 Admin 页面新增一个专业管理标签页，项目、用户、观察、导入等表单里的专业下拉改为数据库驱动。

## 核心功能

- 专业主数据的列表、创建、编辑、启停管理
- 项目表单按专业字典勾选项目适用专业
- 用户表单按限定专业选择用户负责专业
- 观察、导入、检验编辑等专业选择改为数据库选项
- 保持现有项目与用户表中的专业数组结构，仅把“可选项来源”切换为数据库

## Tech Stack Selection

- Monorepo：`pnpm workspace`
- 共享类型：`packages/shared`
- 前端：React + TypeScript
- 后端：Hono on Cloudflare Workers
- 数据库：Cloudflare D1 / SQLite

## Implementation Approach

### 总体策略

在现有 `users.disciplines`、`projects.disciplines` 继续保存“专业 code 数组”的前提下，新增独立 `disciplines` 主数据表作为唯一可配置来源。这样能避免大规模重构现有业务表，同时把项目、用户、观察、导入、检验编辑等入口统一切到数据库选项。

### 关键决策

1. **新增 `disciplines` 表，不改现有 JSON 字段结构**

- 已验证 `projects` 与 `users` 当前都把专业存为 JSON 字符串数组，改为关联表会扩大改动面。
- 保留现存结构，只在写入时校验 code 是否来自主数据表，能最小化 blast radius。

2. **不对 `inspection_items.discipline` / `observations.discipline` 加数据库外键**

- 这些业务表已存在历史数据，且当前就是普通文本列。
- 若直接加外键，线上兼容和历史脏数据处理风险更高。
- 采用“API 入参校验 + 主数据启停控制”更稳。

3. **将 shared 层 `Discipline` 从固定联合改为兼容动态值**

- 当前 `packages/shared/src/index.ts` 的 `Discipline = (typeof DISCIPLINES)[number]` 会阻止新增数据库专业。
- 应保留现有默认列表作为初始预置/兼容常量，但不再把它当唯一类型来源。

4. **复用已有 `observation_types` 路由模式**

- 已验证 `packages/api/src/routes/observation-types.ts` 是现成的主数据 CRUD 参考。
- `disciplines` 路由可沿用同样的 GET/POST/PUT 风格，并增加 `isActive` 管理。

### 性能与可靠性

- `disciplines` 规模很小，查询复杂度基本为 `O(n)`，适合在页面初始化时一次加载并复用。
- 前端应在 Admin、Observations、Import 等页面按页面级一次拉取，避免重复请求。
- 后端校验优先批量读取专业表并用 `Set` 校验，避免逐项查询造成多次 D1 往返。
- 为兼容历史值，复用 `route-helpers.ts` 里的兼容思路，例如保留旧值映射处理，不做破坏式清洗。

## Implementation Notes

- 当前真正接入路由的是 `packages/web/src/pages/Admin.tsx`，不是未接线的 `pages/admin/AdminPage.tsx`；应优先改实际入口，避免无效重构。
- `packages/api/src/index.ts` 当前 `/api/meta` 仍从 `@nbins/shared` 暴露硬编码专业列表，改造后应改为数据库结果或移除该静态依赖。
- 本仓库当前没有完整 migration 体系；线上应提供单独 SQL 脚本，如 `packages/api/scripts/add-disciplines-table.sql`，并更新本地 bootstrap 流程。
- 优先采用“停用”而非硬删除专业，避免项目、用户、历史观察/检验记录出现悬挂 code。
- 保持向后兼容：项目和用户里已保存的专业 code 不应因本次改造被强制重写。

## Architecture Design

### 后端结构

- `schema.ts` 新增 `disciplines` 表定义
- 新增 `routes/disciplines.ts` 提供专业主数据 CRUD
- `users.ts`、`projects.ts`、`observations.ts`、`inspections.ts` 在写入前统一做专业有效性校验
- `route-helpers.ts` 收口专业数组解析与兼容映射逻辑

### 前端结构

- `api.ts` 新增 discipline 接口与类型
- `pages/Admin.tsx` 新增 Discipline 标签页，并把项目/用户/观察/检验相关表单选项统一替换为数据库数据
- `pages/Observations.tsx`、`pages/Import.tsx` 改为数据库专业下拉，并继续受项目已选专业限制

## Directory Structure

整体上新增一条“discipline 主数据”链路，尽量复用现有 `observation_types` 模式，并保留项目/用户的 JSON 专业数组结构。

```text
d:/Code/nbins/
├── packages/
│   ├── shared/
│   │   └── src/
│   │       └── index.ts                         # [MODIFY] 将 Discipline 从固定联合类型调整为兼容动态专业；保留默认专业列表作为初始预置/兼容常量。
│   ├── api/
│   │   ├── scripts/
│   │   │   ├── add-disciplines-table.sql        # [NEW] 线上 D1 迁移脚本。创建 disciplines 表并插入当前默认专业数据，支持远程单独执行。
│   │   │   └── bootstrap-local-d1.mjs          # [MODIFY] 本地 D1 bootstrap 后补执行专业初始化脚本，保证开发库可直接使用专业主数据。
│   │   └── src/
│   │       ├── db/
│   │       │   ├── schema.ts                    # [MODIFY] 新增 disciplines 表 schema，字段建议与 observation_types 风格一致。
│   │       │   └── d1-bootstrap.sql             # [MODIFY] 刷新 bootstrap 产物，确保全新数据库包含 disciplines 表。
│   │       ├── persistence/
│   │       │   └── records.ts                   # [MODIFY] 增加 DisciplineRecord，并同步动态专业后的相关类型约束。
│   │       ├── routes/
│   │       │   ├── disciplines.ts               # [NEW] 专业主数据 GET/POST/PUT 路由，支持列表、创建、编辑、启停。
│   │       │   ├── route-helpers.ts             # [MODIFY] 收口专业数组解析、规范化、兼容映射与共享校验工具。
│   │       │   ├── users.ts                     # [MODIFY] 新建/编辑用户时校验 disciplines 来自主数据，并保持 accessibleProjectIds 同步逻辑不变。
│   │       │   ├── projects.ts                  # [MODIFY] 新建/编辑项目时校验 disciplines 为合法专业 code。
│   │       │   ├── observations.ts              # [MODIFY] 新建、编辑、批量导入 observation 时校验专业，并约束在项目专业范围内。
│   │       │   └── inspections.ts               # [MODIFY] 批量导入/后台编辑 inspection item 时校验专业来源，避免写入非法 code。
│   │       └── index.ts                         # [MODIFY] 注册 /api/disciplines 路由，并清理 /api/meta 对硬编码专业列表的依赖。
│   └── web/
│       └── src/
│           ├── api.ts                           # [MODIFY] 新增 DisciplineRecord 类型与 fetch/create/update discipline API。
│           ├── pages/
│           │   ├── Admin.tsx                    # [MODIFY] 实际管理入口；新增 Discipline 标签页，并替换项目/用户/观察/检验相关专业选项来源。
│           │   ├── Observations.tsx             # [MODIFY] 专业筛选、创建、编辑、导入改为数据库选项，并继续受当前项目专业限制。
│           │   └── Import.tsx                   # [MODIFY] 导入页专业下拉改为数据库选项，且仅显示当前项目允许的专业。
│           └── auth.ts                          # [AFFECTED] 共享类型变更后需确认登录态 user.disciplines 的类型仍与前端会话兼容。
```

## Key Code Structures

建议新增一个与 `observation_types` 对齐的专业主数据记录结构：

```ts
export interface DisciplineRecord {
  id: string;
  code: string;
  label: string;
  sortOrder: number;
  isActive: 0 | 1;
  createdAt: string;
  updatedAt: string;
}
```

## Agent Extensions

### SubAgent

- **code-explorer**
- Purpose: 复核 discipline 硬编码分布、确认实际 Admin 入口与受影响调用链
- Expected outcome: 输出精确的改动范围，避免误改未接线路径如未使用的 `pages/admin/AdminPage.tsx`