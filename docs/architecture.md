# NBINS - 新造船检验管理系统 架构设计 v4

> **项目名称**：NBINS（New Building Inspection System）
> **项目路径**：`d:\Code\nbins`
> **创建日期**：2026-04-02
> **状态**：架构设计 v4（复检流程重设计）

---

## 1. 系统概述

NBINS 是一个面向船舶检验机构的多人协作新造船检验管理平台。约 30 名检验员按 7 个专业分工，对约 10 个项目、每项目 10 条船、每船约 1000 项检验进行日常管理。

### 核心工作流

```mermaid
flowchart LR
    A1["📋 前端手动录入<br/>(复制粘贴)"] --> B["📡 NBINS API<br/>(Cloudflare Workers)"]
    A2["📧 船厂邮件"] -.->|"n8n 工作流<br/>(远期)"| B
    B --> C[("🗄️ Cloudflare D1<br/>SQLite")]
    C --> D["🖥️ 检验员前端<br/>(Vercel)"]
    D -->|"填写结果/意见"| B
    D -->|"生成 PDF"| E["📄 PDF 报告"]
    E --> F1["💾 手动下载<br/>+ 手动邮件发送"]
    E -.->|"n8n 工作流<br/>(远期)"| F2["📤 自动邮件<br/>+ OneDrive"]
    C --> G["📊 报表统计"]
```

> [!NOTE]
> 实线为 MVP 阶段（手动操作），虚线为远期 n8n 自动化集成。

### 日常使用流程

```mermaid
sequenceDiagram
    participant 船厂 as 船厂
    participant n8n as n8n (VPS)
    participant API as NBINS API
    participant DB as D1 数据库
    participant 检验员 as 检验员 (Web)

    船厂->>n8n: 发送报验单邮件
    n8n->>API: POST /webhook/inspections（批量导入）
    API->>DB: 写入检验项目（status=pending）

    Note over 检验员: 早会分配今日检验任务（线下）

    检验员->>API: 登录系统
    检验员->>API: 查看今日待检验项目
    API->>DB: 查询 planned_date = today
    DB-->>检验员: 返回检验项目列表

    检验员->>API: 提交检验结果 + 意见
    API->>DB: 更新 result, 新增 comment

    检验员->>API: 生成 PDF 报告
    API-->>检验员: 返回 PDF 下载

    检验员->>API: 触发报告发送
    API->>n8n: Webhook 触发发送工作流
    n8n->>船厂: 邮件发送 PDF 报告
    n8n->>n8n: 归档 PDF 到指定目录
```

---

## 2. 需求确认总结

| 维度 | 确认内容 |
|------|---------|
| **报验单字段** | 船号、检验项目名称、专业、日期、船厂质检员、是否复检 |
| **专业分类（7个）** | 船体(HULL)、舾装(OUTFIT)、轮机(ENGINE)、货物(CARGO)、电气(ELEC)、涂装(PAINT)、货围(CTNMT) |
| **检验结果（5种）** | CX(取消)、AA(接受)、QCC(带意见接受)、OWC(复检)、RJ(拒绝) |
| **意见状态** | 开放(open) / 关闭(closed)，一个检验项可有多条意见 |
| **流程** | 前一天/当天船厂提交报验 → 早会分配（线下）→ 当日检验 → 填写结果和意见 |
| **数据规模** | ~10 项目 × 10 船 × 1,000 项 = ~100,000 检验项 |
| **用户规模** | ~30 名检验员 |
| **角色** | 超级管理员(admin)、项目经理(manager)、检验员(inspector) |
| **权限** | 所有项目可查看；编辑需有对应专业权限；无审核流程 |
| **检验分配** | 早会线下分配，不在系统中追踪；检验员主动编辑自己负责的项目 |
| **质检员** | 报验单中的质检员是**船厂方**的质检人员 |
| **并发策略** | 乐观锁 + 专业权限约束；自动导入(n8n)的基础数据检验员不可编辑，手动导入的数据管理员/经理可编辑 |
| **认证** | 用户名 + 密码 |
| **部署** | 前端 Vercel，API + DB 在 Cloudflare，n8n 在 VPS |
| **移动端** | 远期规划，当前仅 PC Web |
| **PDF** | 自行设计模板，包含项目名、船号、检验项目、日期、检验员、结果、意见、签名栏 |
| **附件** | 暂不支持图片上传 |

---

## 3. 技术架构

### 3.1 技术栈

| 层级 | 选型 | 理由 |
|------|------|------|
| **代码语言** | TypeScript (全栈) | 前后端统一，类型安全，共享类型定义 |
| **前端框架** | React 18 + Vite | 轻量快速，生态丰富 |
| **UI 组件库** | Ant Design 5 | 表格/表单功能强大，中文友好 |
| **前端部署** | Vercel | 用户指定，免费额度充足 |
| **API 框架** | Hono (TypeScript) | 专为 Cloudflare Workers 设计，类 Express |
| **API 部署** | Cloudflare Workers | 边缘计算，与 D1 原生绑定 |
| **数据库** | Cloudflare D1 (SQLite) | 用户指定，Serverless，免运维 |
| **ORM** | Drizzle ORM | 类型安全，原生支持 D1 |
| **认证** | JWT (jose 库) | 无状态，适合 serverless |
| **PDF 生成** | jsPDF (前端) | 浏览器端生成，无需服务器 |
| **状态管理** | Zustand | 轻量级 React 状态管理 |
| **n8n 集成** | REST API + Webhook | 通过 API 端点交互 |

### 3.2 架构图

```mermaid
graph TB
    subgraph "Vercel"
        FE["React SPA<br/>Ant Design<br/>jsPDF"]
    end

    subgraph "Cloudflare"
        API["Hono API<br/>(Workers)"]
        DB[("D1 Database<br/>(SQLite)")]
        API <--> DB
    end

    subgraph "VPS (Docker)"
        N8N["n8n"]
    end

    FE <-->|"REST API + JWT"| API
    N8N -->|"Webhook / REST"| API
    API -->|"触发工作流"| N8N
```

---

## 4. 数据模型

### 4.1 ER 图

```mermaid
erDiagram
    PROJECT ||--o{ SHIP : "contains"
    PROJECT ||--o{ PROJECT_MEMBER : "members"
    USER ||--o{ PROJECT_MEMBER : "joins"
    SHIP ||--o{ INSPECTION_ITEM : "has"
    SHIP ||--o{ OBSERVATION : "observations"
    INSPECTION_ITEM ||--o{ INSPECTION_ROUND : "rounds"
    INSPECTION_ITEM ||--o{ COMMENT : "comments"
    USER ||--o{ INSPECTION_ROUND : "inspects"
    USER ||--o{ COMMENT : "authors"
    USER ||--o{ OBSERVATION : "records"

    PROJECT {
        text id PK "UUID"
        text name "项目名称"
        text code "项目编号"
        text status "active / archived"
        text recipients "固定收件人邮箱(JSON数组)"
        text created_at
        text updated_at
    }

    SHIP {
        text id PK "UUID"
        text project_id FK
        text hull_number "船号"
        text ship_type "船型"
        text status "building / delivered"
        text created_at
    }

    USER {
        text id PK "UUID"
        text username "用户名"
        text display_name "显示名称"
        text password_hash "密码哈希"
        text role "admin / manager / inspector"
        text disciplines "专业(JSON数组)"
        integer is_active "1=活跃 0=停用"
        text created_at
    }

    PROJECT_MEMBER {
        text id PK "UUID"
        text project_id FK
        text user_id FK
        text disciplines "该项目中负责的专业(JSON数组)"
        text joined_at
    }

    INSPECTION_ITEM {
        text id PK "UUID"
        text ship_id FK
        text item_name "检验项目名称(原始标题)"
        text item_name_normalized "标准化名称(用于复检匹配)"
        text discipline "专业分类"
        text status "pending/open/closed/cancelled"
        text latest_result "最新轮次结果(冗余)"
        integer current_round "当前轮次号(从1开始)"
        integer open_comments_count "开放意见数(冗余计数)"
        integer version "乐观锁版本号"
        text source "n8n/manual(首次导入来源)"
        text created_at
        text updated_at
    }

    INSPECTION_ROUND {
        text id PK "UUID"
        text inspection_item_id FK
        integer round_number "轮次号 1=首检 2+=复检"
        text raw_item_name "报验单原始标题(含2nd/3rd等)"
        text planned_date "计划检验日期"
        text actual_date "实际检验日期"
        text yard_qc "船厂质检员姓名"
        text result "CX/AA/QCC/OWC/RJ/null"
        text inspected_by FK "执行检验的检验员ID"
        text source "n8n/manual"
        text created_at
        text updated_at
    }

    COMMENT {
        text id PK "UUID"
        text inspection_item_id FK
        text created_in_round_id FK "在哪一轮提出"
        text closed_in_round_id FK "在哪一轮关闭(nullable)"
        text author_id FK "提出人"
        text content "意见内容"
        text status "open / closed"
        text closed_by FK "关闭人(nullable)"
        text closed_at "关闭时间"
        text created_at
        text updated_at
    }

    IMPORT_LOG {
        text id PK "UUID"
        text email_subject "邮件主题"
        text email_date "邮件日期"
        integer total_items "总条数"
        integer imported_new "新建条数"
        integer imported_reinspection "识别为复检条数"
        integer skipped "跳过重复"
        integer errors "错误数"
        text error_details "JSON错误详情"
        text status "success/partial/failed"
        text resolved_by FK "处理人(admin)"
        text resolved_at "处理时间"
        text created_at
    }
    OBSERVATION {
        text id PK "UUID"
        text ship_id FK
        text type "patrol / sea_trial"
        text discipline "专业分类"
        text author_id FK "记录人(检验员)"
        text date "观察日期"
        text content "意见内容"
        text status "open / closed"
        text closed_by FK "关闭人(nullable)"
        text closed_at "关闭时间"
        text created_at
        text updated_at
    }
```

> [!NOTE]
> - **冗余字段说明**：`INSPECTION_ITEM` 上的 `latest_result`、`open_comments_count` 是冗余字段，用于列表页快速查询和排序。由业务逻辑在提交结果/关闭意见时同步更新。
> - **OBSERVATION 表**：用于巡检和试航中的非检验意见记录。通过 `type` 字段区分巡检(`patrol`)和试航(`sea_trial`)，共用一张表以简化查询和筛选。与检验意见（COMMENT）完全独立。

### 4.2 检验结果状态码

| 代码 | 英文 | 中文 | 说明 | 后续动作 |
|------|------|------|------|----------|
| `null` | — | 未检验 | 尚未填写结果 | — |
| `CX` | Cancel | 取消 | 当天检验取消 | 船厂准备好后重新报验 |
| `AA` | Accepted | 接受 | 检验通过 | 无开放意见则直接关闭 |
| `QCC` | QC Check | 带意见接受 | 通过但有意见需整改 | 意见逐步关闭，**无需新 Round**，全部关闭后自动 AA |
| `OWC` | Open With Comments | 复检 | 有开放意见，需重新检验 | 船厂整改后重新报验，**触发新 Round** |
| `RJ` | Rejected | 拒绝 | 检验不通过 | 船厂整改后重新报验，**触发新 Round** |

### 4.3 状态流转

#### 检验项目状态 (`INSPECTION_ITEM.status`)

```mermaid
stateDiagram-v2
    [*] --> pending: 首次报验 Round 1

    pending --> closed: 结果 AA 且无开放意见
    pending --> open: 结果 QCC/OWC/RJ 有意见
    pending --> cancelled: 结果 CX 当天取消

    open --> closed: 所有意见关闭 自动转 AA
    open --> pending: 船厂再次报验 新Round 仅OWC/RJ

    cancelled --> pending: 船厂重新报验 新Round

    note right of pending : 待检验
    note right of open : 有开放意见
    note right of closed : 终态 AA
    note right of cancelled : 当天取消
```

#### 提交检验结果时的业务逻辑

```text
检验员提交 Round N 的结果时：
├── result = AA（接受）
│   ├── 无开放意见 → item.status = closed
│   └── 有历史开放意见 → item.status = open（等待意见逐步关闭）
├── result = QCC（带意见接受）
│   ├── 检验员可同时附加新意见
│   └── item.status = open（等待意见逐步关闭，无需新 Round）
│       → 所有意见关闭后 → 自动 latest_result = AA, status = closed
├── result = OWC（复检）
│   ├── 检验员可同时附加新意见
│   └── item.status = open（等待船厂重新报验，触发新 Round）
├── result = RJ（拒绝）
│   ├── 检验员可同时附加新意见
│   └── item.status = open（等待船厂重新报验，触发新 Round）
└── result = CX（取消）
    └── item.status = cancelled（船厂准备好后可重新报验）
```

#### 意见状态 (`COMMENT.status`)

```mermaid
stateDiagram-v2
    [*] --> open: 检验员在某轮次中提出意见
    open --> closed: 检验员确认关闭 记录closed_in_round
```

> [!IMPORTANT]
> **自动 AA 规则**：当某个 INSPECTION_ITEM 的所有 COMMENT 状态均为 `closed`（即 `open_comments_count = 0`）时，系统自动将 `latest_result` 更新为 `AA`，`status` 更新为 `closed`。此规则在每次关闭意见时触发检查。

### 4.4 数据条目关系说明

> [!NOTE]
> - **检验项目**（INSPECTION_ITEM）是生命周期实体，代表一个具体的检验任务，从首次报验到最终接受贯穿始终。
> - **检验轮次**（INSPECTION_ROUND）记录每次报验/复检的具体信息（日期、质检员、结果、检验员）。一个检验项目可有 1~N 个轮次。
> - **检验意见**（COMMENT）挂在检验项目下，跨轮次持续追踪。每条意见记录在哪一轮提出、在哪一轮关闭。

### 4.5 复检匹配逻辑

导入（手动/n8n）时，需要判断新记录是"全新检验项"还是"对已有项目的复检"：

#### 标题标准化规则

船厂在复检报验单中通常会在标题后附加轮次标记（如 `2nd`、`3rd`），但存在不一致的情况。**标准化处理步骤**：

```text
1. 去除尾部轮次标记：移除末尾的 "2nd", "3rd", "4th", ... 及前导空格/连字符
   例: "Hull Block #3 Welding 2nd" → "Hull Block #3 Welding"
   例: "Hull Block #3 Welding - 3rd" → "Hull Block #3 Welding"
2. 统一大小写：转为小写
3. 压缩空格：连续空格合并为单个
4. 去除首尾空格
```

标准化后的结果存入 `item_name_normalized` 字段。

#### 匹配流程

```text
导入一条检验记录时：
1. 标准化 item_name → normalized_name
2. 在同一 ship_id + discipline 下查找 item_name_normalized = normalized_name 的 ITEM
3. 未找到 → 新建 INSPECTION_ITEM + Round 1
4. 找到且 status 为 open/cancelled：
   → 创建新 INSPECTION_ROUND (round_number = current_round + 1)
   → item.current_round += 1, item.status = pending
   → 导入日志标记为「复检匹配」
5. 找到且 status 为 closed：
   → 已经最终接受的项目又报验，标记为「需人工确认」，写入 IMPORT_LOG.error_details
6. 找到但标题不完全匹配（仅标准化后一致）：
   → 正常处理，但在导入日志中记录原始标题差异供人工核查
```

### 4.6 权限模型 (RBAC)

| 角色 | 查看所有项目 | 编辑检验结果 | 管理意见 | 管理用户 | 管理项目 |
|------|:-----------:|:-----------:|:-------:|:-------:|:-------:|
| **admin** | ✅ | ✅ 所有专业 | ✅ | ✅ | ✅ |
| **manager** | ✅ | ✅ 所有专业 | ✅ | ❌ | ✅ |
| **inspector** | ✅ 查看 | ✅ 仅自己专业 | ✅ 仅自己专业 | ❌ | ❌ |

**编辑权限规则**：
1. 检验员只能编辑**自己专业范围内**的检验项
2. 导入的基础数据（item_name, discipline 等）检验员不可修改，仅 admin 可修改
3. 检验员可编辑的字段：当前轮次的 `result`、`actual_date`，以及新增/管理 `COMMENT`
4. 提交结果时自动记录当前轮次的 `inspected_by` 为当前用户

### 4.7 并发控制：乐观锁

```sql
-- 提交检验结果时（操作 INSPECTION_ITEM + 当前 ROUND）
-- Step 1: 乐观锁检查并更新 ITEM 状态
UPDATE inspection_items
SET latest_result = ?, status = ?,
    open_comments_count = ?,
    version = version + 1, updated_at = ?
WHERE id = ? AND version = ?
-- affected_rows = 0 → 版本冲突，提示用户刷新后重试

-- Step 2: 更新当前 ROUND 的结果
UPDATE inspection_rounds
SET result = ?, actual_date = ?, inspected_by = ?, updated_at = ?
WHERE id = ? AND inspection_item_id = ?
```

---

## 5. API 设计

### 5.1 认证

| 端点 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/auth/login` | POST | 登录，返回 JWT | 公开 |
| `/api/auth/me` | GET | 当前用户信息 | 已登录 |
| `/api/auth/change-password` | POST | 修改密码 | 已登录 |

### 5.2 项目与船舶

| 端点 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/projects` | GET | 项目列表 | 已登录 |
| `/api/projects/:id` | GET | 项目详情 | 已登录 |
| `/api/projects` | POST | 创建项目 | admin/manager |
| `/api/projects/:id` | PUT | 编辑项目 | admin/manager |
| `/api/projects/:id/members` | GET/POST/DELETE | 成员管理 | admin/manager |
| `/api/ships` | GET | 船舶列表（按项目筛选） | 已登录 |
| `/api/ships/:id` | GET | 船舶详情 | 已登录 |

### 5.3 检验项目与轮次

| 端点 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/inspections` | GET | 检验项目列表（多维筛选） | 已登录 |
| `/api/inspections/:id` | GET | 检验项详情（含所有轮次 + 意见列表） | 已登录 |
| `/api/inspections/:id/rounds` | GET | 获取检验项的所有轮次历史 | 已登录 |
| `/api/inspections/:id/rounds/current/result` | PUT | 提交当前轮次的检验结果（乐观锁） | 对应专业 |
| `/api/inspections/:id/comments` | GET | 获取检验项的所有意见 | 已登录 |
| `/api/inspections/:id/comments` | POST | 添加意见（关联当前轮次） | 对应专业 |
| `/api/comments/:id` | PUT | 编辑意见 | 作者本人 |
| `/api/comments/:id/close` | PUT | 关闭意见（触发自动 AA 检查） | 对应专业 |

### 5.4 手动导入（含复检匹配）

| 端点 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/inspections/batch` | POST | 批量导入检验项目（自动复检匹配） | admin/manager |
| `/api/inspections` | POST | 单条新增检验项目 | admin/manager |
| `/api/inspections/:id` | PUT | 编辑检验项基础信息 | admin/manager |
| `/api/inspections/:id` | DELETE | 删除检验项 | admin |

> [!NOTE]
> 批量导入 (`/api/inspections/batch`) 会自动执行复检匹配逻辑（参见 4.5 节），返回结果中包含每条记录的处理方式（新建/复检匹配/需人工确认），并写入 `IMPORT_LOG`。

### 5.5 巡检与试航意见

| 端点 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/ships/:shipId/observations` | GET | 获取某船的意见列表（支持筛选） | 已登录 |
| `/api/ships/:shipId/observations` | POST | 新增巡检/试航意见 | 对应专业 |
| `/api/observations/:id` | GET | 意见详情 | 已登录 |
| `/api/observations/:id` | PUT | 编辑意见 | 作者本人 |
| `/api/observations/:id/close` | PUT | 关闭意见 | 对应专业 |

**筛选参数** (`GET /api/ships/:shipId/observations`)：

| 参数 | 说明 | 示例 |
|------|------|------|
| `type` | 意见类型 | `patrol` / `sea_trial` |
| `discipline` | 专业 | `HULL` / `ENGINE` / ... |
| `status` | 状态 | `open` / `closed` |
| `author_id` | 记录人 | UUID |
| `date_from` / `date_to` | 日期范围 | `2026-04-01` |

### 5.6 报表

| 端点 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/reports/pass-rate` | GET | 通过率统计 | 已登录 |
| `/api/reports/comments-list` | GET | 检验意见清单（COMMENT） | 已登录 |
| `/api/reports/observations-list` | GET | 巡检/试航意见清单（OBSERVATION） | 已登录 |
| `/api/reports/open-items` | GET | 所有未关闭意见汇总（COMMENT + OBSERVATION） | 已登录 |
| `/api/reports/daily-summary` | GET | 每日检验汇总 | 已登录 |
| `/api/reports/progress` | GET | 检验进度（远期） | 已登录 |

> [!NOTE]
> `/api/reports/observations-list` 和 `/api/reports/open-items` 支持与 5.5 节相同的筛选参数，可按专业、类型、检验员等维度拉取意见总表。

### 5.7 Webhook（n8n 集成，远期）

| 端点 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/webhook/inspections` | POST | 批量导入检验项目 | API Key |
| `/api/webhook/send-report` | POST | 触发报告发送 | API Key |

### 5.8 导入日志（管理员异常处理）

| 端点 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/import-logs` | GET | 导入日志列表 | admin |
| `/api/import-logs/:id` | GET | 日志详情（含错误明细） | admin |
| `/api/import-logs/:id/resolve` | PUT | 标记已处理 | admin |
| `/api/import-logs/:id/retry` | POST | 重试导入失败的条目 | admin |

### 5.9 用户管理

| 端点 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/users` | GET | 用户列表 | admin |
| `/api/users` | POST | 创建用户 | admin |
| `/api/users/:id` | PUT | 编辑用户 | admin |
| `/api/users/:id` | DELETE | 停用用户 | admin |

---

## 6. 项目目录结构

```
d:\Code\nbins\
├── docs/                          # 📚 项目文档
│   ├── architecture.md            # 架构设计文档
│   ├── data-model.md              # 数据模型文档
│   ├── api-reference.md           # API 接口文档
│   ├── frontend-plan.md           # 前端设计文档
│   ├── n8n-plan.md                # n8n 工作流设计文档
│   ├── deployment.md              # 部署指南
│   └── handover/                  # AI Agent 交接文档
│       ├── CONTEXT.md             # 项目上下文概述
│       ├── CONVENTIONS.md         # 编码约定和规范
│       └── CHANGELOG.md           # 变更日志
│
├── packages/                      # Monorepo 结构
│   ├── shared/                    # 前后端共享
│   │   ├── src/
│   │   │   ├── types.ts           # 数据模型 TypeScript 类型
│   │   │   ├── constants.ts       # 枚举/常量
│   │   │   └── validators.ts      # Zod schema
│   │   └── package.json
│   │
│   ├── api/                       # Cloudflare Workers API
│   │   ├── src/
│   │   │   ├── index.ts           # Hono 入口
│   │   │   ├── routes/            # 路由模块
│   │   │   ├── middleware/        # 认证 + 权限中间件
│   │   │   ├── db/                # Drizzle schema + 迁移
│   │   │   └── services/          # 业务逻辑
│   │   ├── wrangler.toml
│   │   └── package.json
│   │
│   └── web/                       # React 前端
│       ├── src/
│       │   ├── components/        # 通用组件
│       │   ├── pages/             # 页面组件
│       │   ├── hooks/             # 自定义 Hooks
│       │   ├── services/          # API 调用
│       │   ├── store/             # Zustand 状态
│       │   └── utils/
│       ├── vercel.json
│       └── package.json
│
├── n8n/                           # n8n 工作流备份
│   ├── import-inspections.json
│   └── send-report.json
│
├── package.json                   # Monorepo 根
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

---

## 7. 开发阶段

> [!IMPORTANT]
> MVP 阶段优先实现手动操作功能，n8n 自动化工作流作为远期增强。

| 阶段 | 内容 | 交付物 |
|------|------|--------|
| **Phase 0** | ✅ 需求确认 + 架构设计 | 本文档 + 前端规划 + n8n 规划 |
| **Phase 1** | 项目骨架搭建 | Monorepo、D1 建表、Hono API 骨架、React 脚手架 |
| **Phase 2** | 认证系统 + 用户管理 | 登录、JWT、用户 CRUD、RBAC 中间件 |
| **Phase 3** | 核心业务 - 检验管理 + 手动导入 | 项目/船舶 CRUD、**手动批量导入检验项**、结果填写（乐观锁）、意见开闭 |
| **Phase 3.5** | 巡检与试航意见模块 | OBSERVATION CRUD、按船/专业/类型筛选、意见开闭 |
| **Phase 4** | PDF 报告生成 + 手动发送 | 报告模板、jsPDF 生成、下载/预览、**手动邮件发送引导** |
| **Phase 5** | 报表与统计 | 通过率、检验意见清单、巡检/试航意见清单、未关闭意见汇总、多维筛选、导出 |
| **Phase 6** | 部署上线 + 文档完善 | Vercel/Workers 部署、交接文档 |
| **Phase 7** *(远期)* | n8n 集成 - 数据自动导入 | Webhook 端点、n8n 报验单解析工作流 |
| **Phase 8** *(远期)* | n8n 集成 - 报告自动分发 | 邮件发送工作流、OneDrive 归档 |

---

## 8. 文档系统（AI Agent 交接）

`docs/handover/` 目录为 AI Agent 跨工具交接设计：

| 文件 | 用途 | 更新频率 |
|------|------|---------|
| `CONTEXT.md` | 项目背景、技术栈、部署方式、核心概念 | 架构变更时 |
| `CONVENTIONS.md` | 编码规范、命名约定、文件组织 | 初始化后少量更新 |
| `CHANGELOG.md` | 每次重要变更记录，含原因和影响 | 每次开发后 |

---

## 下一步

1. 请审阅本文档及同时生成的 **前端规划** 和 **n8n 工作流规划**
2. 确认无误后批准，我将开始 Phase 1 执行
