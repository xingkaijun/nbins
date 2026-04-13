# 接入 Cloudflare R2 存储桶 — NCR 迁移（当前阶段）

## 背景

当前 NBINS 平台主要业务数据存储在 Cloudflare D1 (SQL) 中。结合现有业务流程与本次新增约束，**当前阶段** 的迁移目标调整为：

1. **R2 存储桶落地**：建立 `nbins-assets` 存储桶，并完成 NCR 所需的对象存储能力。
2. **NCR 迁移**：将 **NCR 完整正文与附件元数据** 迁移到 R2，以独立 JSON 文件形式按船号目录存储（`ncrs/{shipId}/{ncrId}.json`）。
3. **入口不变**：迁移后 **NCR 的业务入口仍然是 NBINS 现有 `NCR` 页面**，不新增独立系统入口。
4. **PDF 输出**：每个 NCR 需要支持在 NBINS 的 `NCR` 页面内直接生成 / 下载 PDF。
5. **相关文件管理**：每个 NCR 需要一个单独入口上传其他相关文件，并支持方便地下载与在线阅读（浏览器可预览的文件优先 inline 打开）。
6. **筛选列表**：在 `NCR` 页面中提供列表筛选，可按 **项目、船、状态、备注关键字** 查看 NCR。
7. **授权复用**：继续使用现有的认证、项目/船号权限体系。

> [!IMPORTANT]
> `Observation` / `Inspection Comments` 的图片接入 **不属于当前阶段范围**，仅作为远期功能预留，不纳入本轮实施与验收。

## 已确认事项

1. **R2 存储桶名称**：`nbins-assets`
2. **图片尺寸规格**：
   - **缩略图 (thumb)**：240×240 px, JPEG/WebP 75% 质量
   - **中图 (medium)**：800×800 px, JPEG/WebP 80% 质量
   - **原图 (original)**：保持原始尺寸，但限制最大 5MB
3. **NCR 迁移策略**：只针对新产生的数据，D1 存量历史数据不进行自动迁移。
4. **前端图片上传交互**：**当前阶段仅支持 NCR 图片附件**，支持 **拖拽、点击选择与剪贴板粘贴**。

5. **NCR 页面入口**：仍沿用 `packages/web/src/pages/Ncrs.tsx` 作为唯一用户入口。
6. **PDF 使用方式**：
   - 在 `NCR` 列表或详情中提供 **生成 PDF / 下载 PDF** 按钮；
   - 审批通过后可保留自动生成归档 PDF 的能力；
   - 用户不需要离开 `NCR` 页面即可完成 PDF 导出。
7. **NCR 相关文件范围**：除图片外，还需支持上传 PDF、Word、Excel、压缩包等其他资料文件，并提供预览 / 下载。
8. **筛选维度**：至少支持 `projectId`、`shipId`、`status`、`remark keyword` 四个维度。
9. **检索策略**：
   - **R2** 保存 NCR 完整数据与附件；
   - **D1** 保留轻量索引，用于高效筛选与列表展示；
   - 避免前端直接通过扫描 R2 大量对象来完成筛选。
10. **远期功能预留**：`Observation` / `Inspection Comments` 后续如需接入图片，优先复用本阶段沉淀的 `media` 路由与上传组件，而不是纳入当前交付范围。

## 架构设计

```mermaid
graph TB
    subgraph "前端 (Vite + React)"
        NCR_PAGE[NCR 页面<br/>Ncrs.tsx]
        FILTER_BAR[筛选栏<br/>项目 / 船 / 状态 / 备注]
        DETAIL_PANEL[NCR 详情面板<br/>正文 / 备注 / 附件 / PDF]
        IMG_UP[ImageUploader<br/>NCR 图片上传]
        FILE_UP[RelatedFileUploader<br/>相关文件上传]
        API_CLIENT[api.ts<br/>统一请求层]
    end

    subgraph "后端 (Cloudflare Worker)"
        ROUTER[Hono Router<br/>index.ts]
        AUTH[认证守卫<br/>auth.ts]
        MEDIA[media.ts<br/>图片上传 / 获取 / 删除]
        NCR_ROUTE[ncrs.ts<br/>NCR CRUD + 筛选]
        NCR_FILE[ncr-files.ts<br/>相关文件上传 / 列表 / 下载]
        NCR_PDF[ncr-pdf.ts<br/>PDF 生成 / 下载]
        INDEX_SYNC[ncr-index service<br/>同步 D1 轻量索引]
    end

    subgraph "Cloudflare R2"
        BUCKET[nbins-assets]
        IMG_DIR[media/{shipId}/{uuid}.{ext}]
        NCR_JSON[ncrs/{shipId}/{ncrId}.json]
        NCR_FILES[ncr-files/{shipId}/{ncrId}/{fileId}-{name}]
        NCR_PDFS[ncr-pdf/{shipId}/{ncrId}/latest.pdf]
    end

    subgraph "Cloudflare D1"
        INDEX_DB[ncr_index<br/>项目 / 船 / 状态 / 备注 / 时间]
        ACL_DB[users / projects / ships]
    end

    NCR_PAGE --> FILTER_BAR
    NCR_PAGE --> DETAIL_PANEL
    DETAIL_PANEL --> IMG_UP
    DETAIL_PANEL --> FILE_UP
    NCR_PAGE --> API_CLIENT
    DETAIL_PANEL --> API_CLIENT
    API_CLIENT --> ROUTER
    ROUTER --> AUTH
    AUTH --> MEDIA
    AUTH --> NCR_ROUTE
    AUTH --> NCR_FILE
    AUTH --> NCR_PDF
    NCR_ROUTE --> BUCKET
    NCR_ROUTE --> INDEX_SYNC
    NCR_FILE --> BUCKET
    NCR_FILE --> INDEX_SYNC
    NCR_PDF --> BUCKET
    NCR_PDF --> INDEX_SYNC
    INDEX_SYNC --> INDEX_DB
    AUTH --> ACL_DB
```

## R2 + D1 存储结构

### R2 对象结构

```
nbins-assets/
├── media/                               # 图库（图片附件）
│   └── {shipId}/
│       ├── {base}.webp                  # 原图（压缩后）
│       ├── {base}_thumb.webp            # 缩略图 240x240
│       └── {base}_medium.webp           # 中图 800x800

│
├── ncrs/                                # NCR 正文数据
│   └── {shipId}/
│       └── {ncrId}.json                 # 单个 NCR 的完整数据
│
├── ncr-files/                           # NCR 相关资料文件
│   └── {shipId}/
│       └── {ncrId}/
│           └── {fileId}-{filename}      # 原始文件对象
│
└── ncr-pdf/                             # NCR 导出 PDF
    └── {shipId}/
        └── {ncrId}/
            └── latest.pdf
```

### D1 轻量索引结构

> [!IMPORTANT]
> 若保留“完整 NCR 全量转 R2”的设计，为满足 **项目 / 船 / 状态 / 备注** 的高效筛选，必须保留 D1 轻量索引，而不是每次通过 `R2.list()` + 全量读取 JSON 聚合。

建议新增 / 保留索引表：`ncr_index`

字段建议：

- `id`
- `projectId`
- `shipId`
- `title`
- `status`
- `remark`
- `pdfObjectKey`
- `fileCount`
- `createdAt`
- `updatedAt`
- `authorId`
- `approvedBy`
- `approvedAt`

## NCR JSON 文件结构

```json
{
  "id": "ncr_123",
  "projectId": "project_001",
  "shipId": "ship_001",
  "title": "Paint breakdown on frame 3",
  "content": "Detailed description of the non-conformance.",
  "remark": "Waiting yard feedback",
  "authorId": "user_001",
  "status": "pending_approval",
  "approvedBy": null,
  "approvedAt": null,
  "imageAttachments": [
    "media/ship_001/9fa5.webp"
  ],
  "relatedFiles": [
    {
      "id": "file_001",
      "name": "supporting-letter.pdf",
      "objectKey": "ncr-files/ship_001/ncr_123/file_001-supporting-letter.pdf",
      "contentType": "application/pdf",
      "size": 248300,
      "uploadedBy": "user_001",
      "uploadedAt": "2026-04-13T08:10:00Z"
    }
  ],
  "pdf": {
    "objectKey": "ncr-pdf/ship_001/ncr_123/latest.pdf",
    "generatedAt": "2026-04-13T08:20:00Z",
    "version": 3
  },
  "createdAt": "2026-04-13T08:00:00Z",
  "updatedAt": "2026-04-13T08:20:00Z"
}
```

### 字段说明

- `imageAttachments`：仅用于图片回显、缩略图展示。
- `relatedFiles`：用于非图片资料，如 PDF、Word、Excel、ZIP 等。
- `remark`：用于列表展示与关键词筛选。
- `pdf`：记录当前可下载 PDF 的对象路径与版本信息。

## 关键设计决策

### 1. NCR 入口保持不变

- 用户仍从 NBINS 导航中的 `NCR` 页面进入。
- 不新增外链式附件中心或 PDF 平台。
- 所有新能力均挂载到现有 `Ncrs.tsx` 页面内：
  - 筛选栏
  - NCR 列表
  - 详情抽屉 / 卡片
  - PDF 操作区
  - 相关文件上传区

### 2. R2 保存主数据，D1 保存查询索引

- **R2**：保存 NCR 完整正文、图片引用、相关文件元数据、PDF 元数据。
- **D1**：保存用于页面列表和筛选的轻量字段。
- 每次创建 / 更新 / 审批 / 更新备注 / 上传或删除相关文件后，同步刷新 `ncr_index`。

### 3. PDF 导出要从页面直接可达

- 每个 NCR 卡片或详情面板提供：
  - `Generate PDF`
  - `Download PDF`
- 若已有现成 PDF，则优先直接下载。
- 若尚未生成，则调用后端生成并写入 `R2`，完成后返回下载链接。
- 审批通过时，仍可继续复用现有 `n8n` webhook 做自动归档 / 邮件推送。

### 4. NCR 相关文件与图片分开管理

- 图片继续走 `media/`，以便复用现有图库能力。
- 其他资料文件统一走 `ncr-files/`，避免与图片处理链耦合。
- 下载时根据 `Content-Type` 和 `Content-Disposition` 策略：
  - 浏览器支持预览的文件（如 PDF / 图片 / 文本）优先 `inline`
  - 其余文件默认 `attachment`

### 5. 列表筛选优先按业务场景设计

页面筛选至少包含：

- **项目**：Project
- **船**：Ship
- **状态**：`draft` / `pending_approval` / `approved` / `rejected`
- **备注关键字**：对 `remark` 与必要时的 `title/content` 做模糊匹配

## 实施计划

### 组件一：Wrangler 配置 + 环境类型

#### [MODIFY] [wrangler.jsonc](file:///d:/Code/nbins/packages/api/wrangler.jsonc)
- 新增 `r2_buckets` 配置绑定 `BUCKET`

#### [MODIFY] [env.ts](file:///d:/Code/nbins/packages/api/src/env.ts)
- `Bindings` 接口增加 `BUCKET?: R2Bucket`

---

### 组件二：NCR 图片处理中间层 (API)

#### [ADJUSTED] [ImageUploader.tsx](file:///d:/Code/nbins/packages/web/src/components/ImageUploader.tsx) + [media.ts](file:///d:/Code/nbins/packages/api/src/routes/media.ts)

- 当前实际落地为 **前端 Canvas 压缩 / 变体生成 + 后端按 variant 转存到 R2**
- 输出三个规格：`original`、`medium`(800px)、`thumb`(240px)
- 当前不依赖独立的后端 `image-processor.ts`；如后续接入 Cloudflare Image Resizing，再单独增强

#### [NEW] [media.ts](file:///d:/Code/nbins/packages/api/src/routes/media.ts)
- `POST /api/media/upload` — 图片上传，支持 `baseId + variant` 写入三种对象
- `GET /api/media/:shipId/:filename` — 图片读取
- `DELETE /api/media/:shipId/:filename` — 图片删除，并联动清理 `medium / thumb`
- `GET /api/media/:shipId` — 列出某船图片，仅返回原图对象 key
- 所有路由走 `requireAuth()` + 项目权限校验


---

### 组件三：NCR 迁移到 R2 + D1 索引

#### [MODIFY] [ncrs.ts](file:///d:/Code/nbins/packages/api/src/routes/ncrs.ts)
- 将 **NCR 完整读写** 切换为 R2 JSON 文件
- 保留 / 新增 D1 `ncr_index` 作为筛选索引
- 新增列表接口：`GET /api/ncrs?projectId=&shipId=&status=&keyword=`
- `GET /api/ncrs/:id` — 读取单个 NCR 完整详情（来自 R2）
- `POST /api/ncrs/ships/:shipId` — 创建 NCR，写入 `ncrs/{shipId}/{id}.json`
- `PUT /api/ncrs/:id` — 更新正文 / 状态 / 备注 / 图片引用
- `PUT /api/ncrs/:id/remark` — 独立更新备注，便于列表快速维护
- `PUT /api/ncrs/:id/approve` — 审批后刷新 JSON 与索引
- 用户 / 项目权限校验逻辑保持不变（仍查 D1 的 `ships`、`users`、`projects`）
- Webhook 触发逻辑保持不变，但从 R2 NCR 对象读取最新数据作为 PDF 来源

#### [MODIFY] [d1-bootstrap.sql](file:///d:/Code/nbins/packages/api/src/db/d1-bootstrap.sql)
- 不再将 `ncrs` 作为主数据表使用
- 新增 `ncr_index` 轻量索引表
- 若需平滑过渡，可暂时保留原 `ncrs` 表作为回退方案，但标记为废弃

#### [MODIFY] [schema.ts](file:///d:/Code/nbins/packages/api/src/db/schema.ts)
- 增加 `ncr_index` 的 schema 定义
- 保持和 `d1-bootstrap.sql` 一致

---

### 组件四：NCR 相关文件上传 / 下载

#### [NEW] [ncr-files.ts](file:///d:/Code/nbins/packages/api/src/routes/ncr-files.ts)
- `POST /api/ncrs/:id/files` — 上传单个相关文件到 `ncr-files/{shipId}/{ncrId}/`
- `GET /api/ncrs/:id/files` — 列出某个 NCR 的相关文件
- `GET /api/ncrs/:id/files/:fileId` — 下载 / 在线预览文件
- `DELETE /api/ncrs/:id/files/:fileId` — 删除文件并同步更新 NCR JSON
- 自动写入 `relatedFiles[]` 元数据并更新 `ncr_index.fileCount`
- 允许类型：`pdf/doc/docx/xls/xlsx/zip/jpg/png/webp/txt`（可配置）
- 默认限制单文件大小，例如 `20MB`

#### [NEW] [RelatedFileUploader.tsx](file:///d:/Code/nbins/packages/web/src/components/RelatedFileUploader.tsx)
- 支持点击上传 / 拖拽上传
- 展示文件名、大小、上传时间、上传人
- 对可预览文件提供 `Preview`
- 对所有文件提供 `Download`
- 对有权限用户提供 `Delete`

---

### 组件五：NCR PDF 生成与下载

#### [NEW] [ncr-pdf.ts](file:///d:/Code/nbins/packages/api/src/routes/ncr-pdf.ts)
- `POST /api/ncrs/:id/pdf` — 按需生成 PDF，并保存到 `ncr-pdf/{shipId}/{ncrId}/latest.pdf`
- `GET /api/ncrs/:id/pdf` — 下载当前最新 PDF
- 若 PDF 已存在且 NCR 未更新，可直接返回现有对象
- 若 NCR 已更新，则重新生成并覆盖 / 递增版本
- 若继续复用 `n8n`，则本路由可作为统一触发入口

#### [MODIFY] [Ncrs.tsx](file:///d:/Code/nbins/packages/web/src/pages/Ncrs.tsx)
- 每个 NCR 增加 `Generate PDF` / `Download PDF` 操作
- PDF 操作入口保留在现有 `NCR` 页面内
- 对审批通过后的记录可显示“已归档 PDF”状态

---

### 组件六：前端统一图片上传组件

#### [NEW] [ImageUploader.tsx](file:///d:/Code/nbins/packages/web/src/components/ImageUploader.tsx)
- 支持拖拽、点击选择、剪贴板粘贴
- 前端 Canvas 压缩（target ≤ 2MB, WebP 格式）
- 生成 `thumb`（240px）和 `medium`（800px）预览
- 上传进度条
- 已上传图片网格预览 + 删除按钮
- Props: `shipId`, `existingImages`, `onImagesChange`

#### [NEW] [ImageGallery.tsx](file:///d:/Code/nbins/packages/web/src/components/ImageGallery.tsx)
- 轻量级图片画廊组件，用于只读展示
- 点击放大模态框
- Props: `images`, `thumbSuffix?`

---

### 组件七：前端 API 客户端扩展

#### [MODIFY] [api.ts](file:///d:/Code/nbins/packages/web/src/api.ts)
- 新增 `fetchNcrList(filters)` — 基于 D1 索引筛选 NCR 列表
- 新增 `fetchNcrById(id)` — 获取单个 NCR 详情
- 新增 `updateNcrRemark(id, remark)`
- 新增 `generateNcrPdf(id)` / `downloadNcrPdf(id)`
- 新增 `uploadNcrFile(id, file)` / `listNcrFiles(id)` / `deleteNcrFile(id, fileId)`
- 保留 `uploadMedia(shipId, file, variant)` / `listMedia(shipId)` / `deleteMedia(shipId, filename)`

---

### 组件八：前端页面集成

#### [MODIFY] [Ncrs.tsx](file:///d:/Code/nbins/packages/web/src/pages/Ncrs.tsx)
- **保留为 NCR 唯一入口页面**
- 顶部增加筛选栏：
  - Project
  - Ship
  - Status
  - Remark keyword
- 列表区显示：
  - 标题
  - 状态
  - 备注摘要
  - 创建时间 / 更新时间
  - PDF 状态
  - 附件数量
- 点击某条 NCR 后打开详情面板 / 扩展卡片，展示：
  - 正文
  - 备注编辑
  - 图片附件
  - 相关文件区
  - PDF 操作区
- 每条 NCR 提供独立“上传相关文件”入口，避免用户先进入其他模块

---

### 组件九：Shared 类型更新

#### [MODIFY] [ncr.ts](file:///d:/Code/nbins/packages/shared/src/ncr.ts)
- `NcrItemResponse` 新增：
  - `remark?: string`
  - `imageAttachments?: string[]`
  - `relatedFiles?: NcrRelatedFile[]`
  - `pdf?: { objectKey: string; generatedAt: string; version: number } | null`
- 新增 `NcrRelatedFile` 类型
- 若需兼容旧字段，可在过渡期保留 `attachments`，但新代码应逐步切换到 `imageAttachments` + `relatedFiles`

#### [MODIFY] [index.ts](file:///d:/Code/nbins/packages/shared/src/index.ts)
- 重新导出 `NCR` 相关新增类型

---

### 远期功能（本期不实施）

#### [FUTURE] [Observations.tsx](file:///d:/Code/nbins/packages/web/src/pages/Observations.tsx)
- 后续如需为 `Observation` 增加图片，可复用 `ImageUploader` 与 `media` 路由
- 默认应保持“无图零成本”，仅在需要时显示附件入口

#### [FUTURE] [Dashboard.tsx](file:///d:/Code/nbins/packages/web/src/pages/Dashboard.tsx)
- 后续如需为 `Inspection Comments` 增加图片，可在 comment 详情或卡片中挂接可选上传入口
- 避免影响当前 comment 文本主流程与列表性能

## 实施顺序

```
Phase 1: 基础设施 (30 min)
  ├── wrangler.jsonc + env.ts 增加 R2 绑定
  ├── media.ts 路由（NCR 图片上传 / 获取 / 列表 / 删除）
  └── 本地测试 R2 基础读写

Phase 2: NCR 主数据迁移 (60 min)
  ├── ncrs.ts 切换到 R2 JSON 读写
  ├── 建立 D1 ncr_index 轻量索引
  ├── 实现 project / ship / status / remark 筛选接口
  └── 本地验证 NCR CRUD + 列表检索

Phase 3: 相关文件 + PDF (60 min)
  ├── ncr-files.ts 文件上传 / 下载 / 删除
  ├── ncr-pdf.ts 生成 / 下载 PDF
  ├── R2 中写入 relatedFiles 与 pdf 元数据
  └── 验证浏览器预览与下载行为

Phase 4: 前端 NCR 页面增强 (75 min)
  ├── Ncrs.tsx 增加筛选栏
  ├── NCR 详情面板 / 扩展卡片
  ├── ImageUploader / RelatedFileUploader 组件接入
  ├── Generate PDF / Download PDF 按钮
  └── 备注编辑与附件区联动

Phase 5: 验证 & 部署 (20 min)
  ├── TypeScript 编译检查
  ├── 权限与筛选联调
  ├── PDF 与文件下载测试
  └── wrangler deploy
```

> [!NOTE]
> `Observation` / `Inspection Comments` 图片接入不在以上阶段内，待 `NCR + R2` 稳定后再单独立项。

## 验证计划

### 自动化检验
- `npx tsc --noEmit` 通过编译
- `pnpm run dev` 前后端联调

### 手动验证
1. **入口不变**：用户仍从 NBINS 的 `NCR` 页面进入全部 NCR 功能。
2. **列表筛选**：按 `项目 / 船 / 状态 / 备注关键字` 过滤，结果正确且性能可接受。
3. **NCR 创建流程**：创建 NCR → 写入 R2 JSON → D1 `ncr_index` 同步生成。
4. **备注维护**：更新备注后，列表摘要与筛选结果立即可见。
5. **相关文件流程**：进入某条 NCR → 上传 PDF / Excel / ZIP 等文件 → 可预览 / 下载 / 删除。
6. **图片附件流程**：上传 NCR 图片 → 验证 `thumb` / `medium` / `original` 回显。
7. **PDF 输出流程**：在 `NCR` 页面点击生成 / 下载 PDF → 成功生成并可再次下载。
8. **审批联动**：审批通过后 PDF 可自动归档，且页面显示归档状态。
9. **权限隔离**：非项目成员无法访问其他项目的 NCR、PDF、相关文件与图片。
