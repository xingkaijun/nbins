# NBINS - 新造船检验管理系统 架构设计 v6

> **项目名称**：NBINS（New Building Inspection System）
> **项目路径**：`d:\Code\nbins`
> **创建日期**：2026-04-02
> **状态**：架构设计 v6（关键冲突已收口）

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
    D -->|"请求生成正式 PDF"| B
    B --> E["📄 正式 PDF 报告"]
    E --> F1["💾 下载 / 手动发送"]
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
    API->>DB: 写入检验项目（workflow_status=pending）

    Note over 检验员: 早会分配今日检验任务（线下）

    检验员->>API: 登录系统
    检验员->>API: 查看今日待检验项目
    API->>DB: 查询 planned_date = today
    DB-->>检验员: 返回检验项目列表

    检验员->>API: 提交检验结果 + 意见
    API->>DB: 更新 result, 新增 comment

    检验员->>API: 请求生成正式 PDF 报告
    API-->>检验员: 返回正式 PDF 下载/预览

    检验员->>API: 触发报告发送（远期）
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
| **角色** | 超级管理员(admin)、项目经理(manager)、外部人员(reviewer)、检验员(inspector) |
| **权限** | 所有项目按“允许项目”范围授权；manager 仅可编辑主管项目的数据；reviewer 仅可读取允许项目的数据；inspector 的查看/编辑也限定在允许项目范围内 |
| **检验分配** | 早会线下分配，不在系统中追踪；系统仅保存项目级授权范围，manager/reviewer/inspector 只能访问被分配的项目 |
| **质检员** | 报验单中的质检员是**船厂方**的质检人员 |
| **并发策略** | 乐观锁 + 专业权限约束；自动导入(n8n)的基础数据检验员不可编辑，手动导入的数据仅 admin/manager（限主管项目）可编辑 |
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
| **PDF 生成** | API 侧统一生成 | 下载、发送、归档使用同一正式版本，避免前端环境差异 |
| **状态管理** | Zustand | 轻量级 React 状态管理 |
| **n8n 集成** | REST API + Webhook | 通过 API 端点交互 |

### 3.2 架构图

```mermaid
graph TB
    subgraph "Vercel"
        FE["React SPA<br/>Ant Design"]
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
    USER ||--o{ AUDIT_LOG : "performs"

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
        text role "admin / manager / reviewer / inspector"
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
        text workflow_status "pending/open/closed/cancelled"
        text last_round_result "最近轮次真实结果(冗余)"
        text resolved_result "当前归档结论(冗余, 如自动转AA)"
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
        text notes "检验员备注(自由文本,nullable)"
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
        text type "patrol/sea_trial/dock_trial/other"
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

    COMMENT_TEMPLATE {
        text id PK "UUID"
        text discipline "适用专业(nullable=通用)"
        text title "模板标题"
        text content "模板内容"
        integer usage_count "使用次数"
        text created_by FK "创建人"
        text created_at
        text updated_at
    }

    AUDIT_LOG {
        text id PK "UUID"
        text user_id FK "操作人"
        text entity_type "实体类型(inspection_item/comment/observation/user/...)"
        text entity_id "实体ID"
        text action "操作(create/update/delete/close/submit_result)"
        text changes "变更内容(JSON: old_value/new_value)"
        text ip_address "IP地址(nullable)"
        text created_at
    }
```

> [!NOTE]
> - **冗余字段说明**：`INSPECTION_ITEM` 上的 `last_round_result`、`resolved_result`、`open_comments_count` 是冗余字段，用于列表页快速查询和排序。由统一业务服务层在结果提交、意见新增/关闭、复检导入时同步更新。
> - **OBSERVATION 表**：用于巡检、试航、系泊试验等非检验意见记录。`type` 为可扩展枚举（`patrol`/`sea_trial`/`dock_trial`/`other`），共用一张表以简化查询。与检验意见（COMMENT）完全独立。
> - **COMMENT_TEMPLATE 表**：常用意见模板库，检验员可从模板快速选取并微调，提升录入效率。
> - **AUDIT_LOG 表**：审计日志，记录所有关键操作（提交结果、关闭意见、删除等），MVP 阶段仅写入不展示，供日后合规审查。

### 4.2 D1 容量规划

> [!WARNING]
> Cloudflare D1 免费版限制：**5GB 存储 / 5M 行读取/天**。当前预估数据量：
> - INSPECTION_ITEM: ~100,000 行
> - INSPECTION_ROUND: ~150,000 行（含复检）
> - COMMENT: ~200,000 行
> - OBSERVATION: ~50,000 行
> - AUDIT_LOG: 增长最快，预估 ~500,000 行/年
>
> **建议措施**：
> 1. AUDIT_LOG 设置 TTL（保留最近 1 年，超期可导出归档后清理）
> 2. 已 `closed` 超过 6 个月的项目标记为 `archived`，列表查询默认排除
> 3. 定期监控 D1 用量，接近限制时评估升级付费版

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

#### 检验项目状态 (`INSPECTION_ITEM.workflow_status`)

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
│   ├── 硬约束：AA 不能产生新的开放意见，且提交后系统中不能存在未关闭意见
│   ├── 无开放意见 → item.workflow_status = closed, resolved_result = AA
│   └── 若仍有历史开放意见 → 不得直接视为最终接受；item.workflow_status = open，resolved_result 保持待定，直到全部意见关闭后才自动转 AA
├── result = QCC（带意见接受）
│   ├── 检验员可同时附加新意见
│   └── item.workflow_status = open（等待意见逐步关闭，无需新 Round）
│       → 所有意见关闭后 → 自动 resolved_result = AA, workflow_status = closed
├── result = OWC（复检）
│   ├── 检验员可同时附加新意见
│   └── item.workflow_status = open（等待船厂重新报验，触发新 Round）
├── result = RJ（拒绝）
│   ├── 检验员可同时附加新意见
│   └── item.workflow_status = open（等待船厂重新报验，触发新 Round）
└── result = CX（取消）
    └── item.workflow_status = cancelled（船厂准备好后可重新报验）
```

#### 意见状态 (`COMMENT.status`)

```mermaid
stateDiagram-v2
    [*] --> open: 检验员在某轮次中提出意见
    open --> closed: 检验员确认关闭 记录closed_in_round
```

> [!IMPORTANT]
> **自动 AA 规则**：当某个 INSPECTION_ITEM 的所有 COMMENT 状态均为 `closed`（即 `open_comments_count = 0`）时，系统自动将 `resolved_result` 更新为 `AA`，`workflow_status` 更新为 `closed`；`last_round_result` 保留最近轮次真实提交结果。此规则在每次关闭意见时由统一业务服务层触发检查。

> **AA 约束**：`AA` 代表该检验项在当前时点不存在开放意见。因此接口层、服务层和前端提交校验都应禁止“AA + 新增开放意见”的组合；若历史上仍有未关闭意见，也不得把该条目直接结算为 `resolved_result = AA`。

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
4. 找到且 workflow_status 为 open/cancelled：
   → 创建新 INSPECTION_ROUND (round_number = current_round + 1)
   → item.current_round += 1, item.workflow_status = pending
   → 导入日志标记为「复检匹配」
5. 找到且 status 为 closed：
   → 已经最终接受的项目又报验，标记为「需人工确认」，写入 IMPORT_LOG.error_details
6. 找到但标题不完全匹配（仅标准化后一致）：
   → 正常处理，但在导入日志中记录原始标题差异供人工核查
```

### 4.6 权限模型 (RBAC)

| 角色 | 查看允许项目 | 编辑项目数据 | 管理意见 | 管理用户 | 管理项目 |
|------|:-----------:|:-----------:|:-------:|:-------:|:-------:|
| **admin** | ✅ 所有项目 | ✅ 所有项目 | ✅ | ✅ | ✅ |
| **manager** | ✅ 允许项目 | ✅ 主管项目 | ✅ 主管项目 | ❌ | ❌ |
| **reviewer** | ✅ 允许项目 | ❌ | ❌ | ❌ | ❌ |
| **inspector** | ✅ 允许项目 | ✅ 允许项目，且仅限自己专业 | ✅ 允许项目，且仅限自己专业 | ❌ | ❌ |

**编辑权限规则**：
1. manager 只能编辑自己主管项目的数据，不能越权修改其他项目
2. reviewer 只读，不允许新增、修改或关闭任何业务数据
3. inspector 只能编辑**允许项目且自己专业范围内**的检验项
4. 导入的基础数据（item_name, discipline 等）检验员不可修改，仅 admin 可修改
5. 可编辑的字段：当前轮次的 `result`、`actual_date`，以及新增/管理 `COMMENT`
6. 提交结果时自动记录当前轮次的 `inspected_by` 为当前用户

### 4.7 并发控制：乐观锁

```sql
-- 提交检验结果时（操作 INSPECTION_ITEM + 当前 ROUND）
-- Step 1: 乐观锁检查并更新 ITEM 状态
UPDATE inspection_items
SET last_round_result = ?, workflow_status = ?, resolved_result = ?,
    open_comments_count = ?,
    version = version + 1, updated_at = ?
WHERE id = ? AND version = ?
-- affected_rows = 0 → 版本冲突，提示用户刷新后重试

-- 所有影响聚合状态的写操作（结果提交、意见新增/关闭、复检导入）
-- 必须统一经过同一业务服务层/事务逻辑，重算 open_comments_count / workflow_status / resolved_result / version

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
| `/api/auth/login` | POST | 登录，返回 JWT（access + refresh） | 公开 |
| `/api/auth/refresh` | POST | 用 refresh token 换取新 access token | 公开 |
| `/api/auth/me` | GET | 当前用户信息 | 已登录 |
| `/api/auth/change-password` | POST | 修改密码 | 已登录 |

> [!NOTE]
> **JWT 双 Token 机制**：
> - `access_token`：短过期（2 小时），仅存前端内存，用于 API 请求认证
> - `refresh_token`：长过期（7 天），通过 HttpOnly Secure Cookie 保存，仅用于换取新 access_token
> - 前端 axios 拦截器在 access_token 过期时自动调用 `/api/auth/refresh` 静默续期
> - 用户停用、重置密码、管理员强制失效会话时，应统一撤销对应 refresh token

### 5.2 项目与船舶

| 端点 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/projects` | GET | 项目列表 | 已登录（仅返回允许项目） |
| `/api/projects/:id` | GET | 项目详情 | 已登录（仅限允许项目） |
| `/api/projects` | POST | 创建项目 | admin |
| `/api/projects/:id` | PUT | 编辑项目 | admin/manager（仅限主管项目） |
| `/api/projects/:id/members` | GET/POST/DELETE | 成员管理 | admin/manager（仅限主管项目） |
| `/api/ships` | GET | 船舶列表（按项目筛选） | 已登录（仅限允许项目） |
| `/api/ships/:id` | GET | 船舶详情 | 已登录（仅限允许项目） |

### 5.3 检验项目与轮次

| 端点 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/inspections` | GET | 检验项目列表（多维筛选） | 已登录（仅限允许项目） |
| `/api/inspections/:id` | GET | 检验项详情（含所有轮次 + 意见列表） | 已登录（仅限允许项目） |
| `/api/inspections/:id/rounds` | GET | 获取检验项的所有轮次历史 | 已登录（仅限允许项目） |
| `/api/inspections/:id/rounds/current/result` | PUT | 提交当前轮次的检验结果（乐观锁） | 对应专业，且仅限允许项目 |
| `/api/inspections/batch-result` | PUT | **批量提交**多个检验项的当前轮次结果 | 对应专业，且仅限允许项目 |
| `/api/inspections/:id/comments` | GET | 获取检验项的所有意见 | 已登录（仅限允许项目） |
| `/api/inspections/:id/comments` | POST | 添加意见（关联当前轮次） | 对应专业，且仅限允许项目 |
| `/api/comments/:id` | PUT | 编辑意见 | 同项目同专业检验员 / manager（主管项目）/ admin |
| `/api/comments/:id/close` | PUT | 关闭意见（触发自动 AA 检查） | 同项目同专业检验员 / manager（主管项目）/ admin |
| `/api/comment-templates` | GET | 获取意见模板列表（按专业筛选） | 已登录（仅限允许项目相关专业） |
| `/api/comment-templates` | POST | 创建意见模板 | 已登录 |
| `/api/comment-templates/:id` | PUT/DELETE | 编辑/删除意见模板 | 作者本人/admin |

> [!NOTE]
> **批量提交** (`PUT /api/inspections/batch-result`)：接收数组，每项包含 `inspection_id`、`result`、`actual_date`、`notes`、`comments[]`。逐项执行乐观锁校验，返回每项的成功/失败状态。用于「快速填写模式」。

### 5.4 手动导入（含复检匹配）

| 端点 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/inspections/batch` | POST | 批量导入检验项目（自动复检匹配） | admin/manager（仅限主管项目） |
| `/api/inspections` | POST | 单条新增检验项目 | admin/manager（仅限主管项目） |
| `/api/inspections/:id` | PUT | 编辑检验项基础信息 | admin/manager（仅限主管项目） |
| `/api/inspections/:id` | DELETE | 删除检验项 | admin |

> [!NOTE]
> 批量导入 (`/api/inspections/batch`) 会自动执行复检匹配逻辑（参见 4.5 节），返回结果中包含每条记录的处理方式（新建/复检匹配/需人工确认），并写入 `IMPORT_LOG`。

### 5.5 巡检与试航意见

| 端点 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/ships/:shipId/observations` | GET | 获取某船的意见列表（支持筛选） | 已登录（仅限允许项目） |
| `/api/ships/:shipId/observations` | POST | 新增巡检/试航意见 | 对应专业，且仅限允许项目 |
| `/api/observations/:id` | GET | 意见详情 | 已登录（仅限允许项目） |
| `/api/observations/:id` | PUT | 编辑意见 | 作者本人，且仅限允许项目 |
| `/api/observations/:id/close` | PUT | 关闭意见 | 对应专业，且仅限允许项目 |

**筛选参数** (`GET /api/ships/:shipId/observations`)：

| 参数 | 说明 | 示例 |
|------|------|------|
| `type` | 意见类型 | `patrol` / `sea_trial` |
| `discipline` | 专业 | `HULL` / `ENGINE` / ... |
| `status` | 状态 | `open` / `closed` |
| `author_id` | 记录人 | UUID |
| `date_from` / `date_to` | 日期范围 | `2026-04-01` |

### 5.6 报表与导出

| 端点 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/reports/pass-rate` | GET | 通过率统计 | 已登录（admin 可看全局；其他角色自动按 allowed projects / role scope / discipline scope 过滤） |
| `/api/reports/comments-list` | GET | 检验意见清单（COMMENT） | 已登录（admin 可看全局；其他角色自动按 allowed projects / role scope / discipline scope 过滤） |
| `/api/reports/observations-list` | GET | 巡检/试航意见清单（OBSERVATION） | 已登录（admin 可看全局；其他角色自动按 allowed projects / role scope / discipline scope 过滤） |
| `/api/reports/open-items` | GET | 所有未关闭意见汇总（COMMENT + OBSERVATION） | 已登录（admin 可看全局；其他角色自动按 allowed projects / role scope / discipline scope 过滤） |
| `/api/reports/daily-summary` | GET | 每日检验汇总 | 已登录（admin 可看全局；其他角色自动按 allowed projects / role scope / discipline scope 过滤） |
| `/api/reports/today-checklist` | GET | 今日待检清单（按检验员/船舶） | 已登录（admin 可看全局；其他角色自动按 allowed projects / role scope / discipline scope 过滤） |
| `/api/reports/progress` | GET | 检验进度（远期） | 已登录（admin 可看全局；其他角色自动按 allowed projects / role scope / discipline scope 过滤） |
| `/api/exports/comments` | GET | 导出意见清单（Excel/CSV） | 已登录（admin 可看全局；其他角色自动按 allowed projects / role scope / discipline scope 过滤） |
| `/api/exports/observations` | GET | 导出巡检/试航清单（Excel/CSV） | 已登录（admin 可看全局；其他角色自动按 allowed projects / role scope / discipline scope 过滤） |
| `/api/exports/inspections` | GET | 导出检验数据（Excel/CSV） | admin（全局）/ manager（仅限主管项目） |
| `/api/exports/full-backup` | GET | 全量数据导出（JSON） | admin |

> [!NOTE]
> - 所有报表端点支持多维筛选（项目/船舶/专业/日期/检验员）
> - 所有查询/报表/导出接口默认按权限范围过滤；仅 `admin` 可查看全局数据
> - `/api/reports/today-checklist` 可生成 PDF 格式的今日待检清单，检验员打印后带到船上
> - 导出端点返回文件流，前端直接触发下载

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
| `/api/users/:id/reset-password` | POST | 管理员重置用户密码 | admin |

### 5.10 审计日志

| 端点 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/audit-logs` | GET | 审计日志列表（支持按用户/实体/操作/日期筛选） | admin |

> [!NOTE]
> 审计日志仅在 admin 后台可见，MVP 阶段不做前端展示页面，但所有关键操作都写入 `AUDIT_LOG` 表。

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

## 0. 当前实现状态（2026-04-03）

当前仓库已从纯设计阶段推进到 **可演示 MVP 基线**。

已落地：

- `packages/shared`：共享枚举、inspection detail 契约、mock data helpers
- `packages/api`：Hono API、inspection repository/service/persistence 分层、结果提交与 optimistic locking
- `packages/web`：检验列表、详情区、round history、comments、结果提交演示
- `AA / QCC / OWC / RJ / CX` 的关键业务语义已在前后端同步体现
- `pnpm typecheck`、`pnpm build`、`pnpm --filter @nbins/api test` 已通过

尚未落地：

- D1 / Drizzle 真持久化
- 前端直连真实 API
- comment close / resolve 完整闭环
- 登录认证与 RBAC
- 正式 PDF / n8n 自动导入发送

> 也就是说，当前代码库适合做“业务主线演示”和“下一阶段工程扩展”，还不是生产环境完成版。

---

## 7. 开发阶段

> [!IMPORTANT]
> MVP 阶段优先实现手动操作功能，n8n 自动化工作流作为远期增强。

| 阶段 | 内容 | 交付物 |
|------|------|--------|
| **Phase 0** | ✅ 需求确认 + 架构设计 | 本文档 + 前端规划 + n8n 规划 |
| **Phase 1** | 项目骨架搭建 | Monorepo、D1 建表（含 AUDIT_LOG）、Hono API 骨架、React 脚手架 |
| **Phase 2** | 认证系统 + 用户管理 | 登录、JWT 双 Token、静默刷新、用户 CRUD、**密码重置**、RBAC 中间件 |
| **Phase 3** | 核心业务 - 检验管理 + 手动导入 | 项目/船舶 CRUD、**手动批量导入**、单条/批量结果填写（乐观锁）、意见开闭、**意见模板** |
| **Phase 3.5** | 巡检与试航意见模块 | OBSERVATION CRUD、可扩展 type、按船/专业/类型筛选、意见开闭 |
| **Phase 4** | PDF 报告生成 + 手动发送 | 报告模板、API 统一生成正式 PDF、下载/预览、**今日待检清单 PDF**、手动邮件引导 |
| **Phase 5** | 报表与数据导出 | 通过率、意见清单、巡检/试航清单、未关闭汇总、多维筛选、**Excel/CSV 导出**、**全量备份** |
| **Phase 6** | 部署上线 + 文档完善 | Vercel/Workers 部署、交接文档、**D1 容量监控** |
| **Phase 7** *(远期)* | n8n 集成 - 数据自动导入 | Webhook 端点、n8n 报验单解析工作流 |
| **Phase 8** *(远期)* | n8n 集成 - 报告自动分发 | 邮件发送工作流、OneDrive 归档、**批量报告邮件** |

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
