# NCR + R2 本地测试指导书

## 1. 文档适用范围

本文用于验证当前仓库中 **`NCR + R2 存储桶`** 这一轮改造的本地可用性，覆盖以下能力：

- `NCR` 页面仍为唯一入口
- 按 **项目 / 船 / 状态 / 备注关键字** 筛选
- 创建 `NCR`
- 维护 `remark`
- 上传 / 删除 `NCR` 图片附件
- 上传 / 预览 / 下载 / 删除 `NCR` 相关文件
- 生成 / 下载 `PDF`
- 审批 / 驳回
- 基于项目权限的访问控制

> 本指导书按 **当前代码实际状态** 编写，不是按最初理想方案编写。

## 2. 当前实现状态说明

### 2.1 已完成

- `NCR` 主数据存入 `R2`，路径规则为 `ncrs/{shipId}/{ncrId}.json`
- `D1` 中存在 `ncr_index` 轻量索引表，用于页面筛选
- `NCR` 页面已支持：
  - 创建
  - 筛选
  - `remark` 编辑
  - 图片附件
  - 相关文件
  - `PDF` 生成 / 下载
  - 审批 / 驳回
- 已有 `NCR` 的图片变更会同步写回 `NCR JSON`，刷新后不会丢失
- 图片上传会生成并写入 `original / medium / thumb` 三种 `WebP` 对象
- `ImageUploader` 支持点击选择、拖拽上传和剪贴板粘贴，并带本地待上传预览
- SQL Console 的全库 / 单项目导入导出已覆盖 `ncr_index` 与当前 `NCR + R2` 对象本体

### 2.2 当前已知差异 / 限制

以下几点仍需按现状验收：

- 图片多规格对象由**前端浏览器生成后上传**，不是后端实时 resize 服务
- SQL Console 在数据量较大时，导出的 JSON 体积会明显增大，导入导出耗时也会更长
- 当前没有专门的 `NCR` 自动化测试文件，主要依赖手动烟测和 `typecheck`

## 3. 前置环境

### 3.1 软件要求

- Node.js `>= 20`
- `pnpm`
- 项目依赖已安装完成

### 3.2 建议工作目录

在仓库根目录执行以下命令：

```bash
cd d:/Code/nbins
```

## 4. 本地启动步骤

### 4.1 安装依赖

```bash
pnpm install
```

### 4.2 初始化本地 D1

```bash
pnpm d1:bootstrap
```

该命令会：

- 重新生成 `packages/api/src/db/d1-bootstrap.sql`
- 初始化本地 `D1`
- 写入本地种子数据

### 4.3 启动本地 API（含 D1）

```bash
pnpm dev:api:d1
```

预期：

- API 运行在 `http://127.0.0.1:8787`
- 本地 `wrangler dev --local` 会启用本地 `D1`
- 当前 `wrangler.jsonc` 已包含 `R2` 绑定，`wrangler` 本地运行时会提供本地 `R2` 模拟环境

### 4.4 启动前端

新开一个终端窗口，执行：

```bash
pnpm dev:web
```

预期：

- 前端运行在 `http://127.0.0.1:5173`

## 5. 基础健康检查

### 5.1 类型检查

```bash
pnpm typecheck
```

预期：

- 命令退出码为 `0`

### 5.2 API 健康接口

```bash
curl http://127.0.0.1:8787/health
```

预期：

- 返回 `ok: true`

### 5.3 API 元信息

```bash
curl http://127.0.0.1:8787/api/meta
```

预期重点：

- `storageMode` 为 `d1+r2`
- 返回路由中包含：
  - `/api/media/upload`
  - `/api/ncrs`
  - `/api/ncrs/:id/files`
  - `/api/ncrs/:id/pdf`

## 6. 登录准备

### 6.1 默认测试账号

根据当前仓库 `README.md`，本地种子账号初始密码均为 `1234`。

建议至少准备以下角色做测试：

- `admin1`
- `manager1`
- `reviewer1`
- `inspector1`

### 6.2 登录前端

浏览器打开：

```text
http://127.0.0.1:5173
```

使用任一测试账号登录。

## 7. 手动测试用例

## 7.1 页面入口不变

### 步骤

1. 登录系统
2. 进入导航中的 `NCR` 页面

### 预期

- 仍然通过现有 `NCR` 页面进入，不需要跳转到其他独立系统
- 页面能正常显示项目、船、状态、备注关键字筛选区

## 7.2 列表筛选

### 步骤

1. 选择一个 `Project`
2. 切换不同 `Ship`
3. 分别选择不同 `Status`
4. 在 `Remark / Title` 输入关键字

### 预期

- 列表随条件变化刷新
- 筛选项组合使用时结果正确
- 没有权限的项目不会出现在当前用户可见结果中

## 7.3 创建 NCR

### 步骤

1. 在 `NCR` 页面选择一个具体 `Ship`
2. 点击 `+ Create NCR`
3. 填写：
   - `Title`
   - `Remark`
   - `Content`
4. 可选上传 1~2 张图片
5. 点击 `Submit NCR`

### 预期

- 页面出现新建成功的 `NCR`
- 新记录状态默认为 `pending_approval`
- 创建成功后可立即展开详情
- 若创建时带图片，图片可在详情区显示

### 补充验证

可使用 API 或 SQL Console 验证：

- `R2` 中应生成 `ncrs/{shipId}/{ncrId}.json`
- `D1.ncr_index` 中应存在对应索引记录

## 7.4 Remark 编辑

### 步骤

1. 展开某条 `NCR`
2. 修改 `Remark`
3. 点击 `Save Remark`
4. 返回列表查看摘要
5. 使用关键字再次筛选

### 预期

- 保存后详情中的 `Remark` 更新成功
- 列表摘要同步更新
- 备注关键字可以筛选到该记录

## 7.5 图片附件

### 步骤

1. 展开某条 `NCR`
2. 在 `Images` 区点击 `Add Images`
3. 上传 `jpg/png/webp`
4. 再删除其中 1 张图片
5. 刷新页面

### 预期

- 上传后图片可显示在画廊中
- 删除后图片从画廊消失
- **刷新页面后状态保持一致**（这是本轮特别要验的点）

### 额外说明

当前实现是：

- 图片对象走 `media/{shipId}/{filename}`
- `NCR JSON` 中保存 `imageAttachments`
- 页面修改图片后会调用 `PUT /api/ncrs/:id`

## 7.6 相关文件

### 测试文件建议

准备以下样例文件：

- `sample.pdf`
- `sample.xlsx`
- `sample.docx`
- `sample.zip`
- `sample.txt`

### 步骤

1. 展开某条 `NCR`
2. 在 `Related Files` 区上传上述文件中的任意 1~3 个
3. 点击 `Preview`
4. 点击 `Download`
5. 删除其中一个文件
6. 刷新页面

### 预期

- 文件上传成功后显示在列表中
- `PDF / 图片 / 文本` 等浏览器可预览类型可直接预览
- 所有文件都可下载
- 删除后列表更新
- 刷新后文件状态保持一致
- `Files` 计数与详情列表一致

## 7.7 PDF 生成与下载

### 步骤

1. 展开某条 `NCR`
2. 点击 `Generate PDF`
3. 再点击 `Download PDF`
4. 本地打开下载的 `PDF`

### 预期

- 能成功生成 `PDF`
- 页面中 `PDF` 状态从 `Not generated` 变为版本号，例如 `v1`
- 下载文件名类似 `NCR-{id}.pdf`
- `PDF` 内容应包含：
  - `NCR ID`
  - `Project ID`
  - `Ship ID`
  - `Status`
  - `Remark`
  - `Title`
  - `Content`
  - 图片数量
  - 相关文件数量

## 7.8 审批 / 驳回

### 角色要求

建议使用 `admin` 或 `manager` 账号测试。

### 步骤

1. 找到一条 `pending_approval` 的 `NCR`
2. 点击 `Approve`
3. 再创建一条新记录并测试 `Reject`

### 预期

- 审批后状态变为 `approved`
- 驳回后状态变为 `rejected`
- 审批时间、审批人信息更新
- 如果配置了 `N8N_WEBHOOK_URL`，审批通过时会异步触发 webhook

## 7.9 权限隔离

### 步骤

1. 使用 `project A` 的成员账号登录
2. 记录其可见项目 / 船范围
3. 尝试访问其他项目数据
4. 可通过直接调用 API 进一步验证

### 参考接口

```bash
curl http://127.0.0.1:8787/api/ncrs
curl http://127.0.0.1:8787/api/ncrs/<ncrId>
curl http://127.0.0.1:8787/api/ncrs/<ncrId>/files
curl http://127.0.0.1:8787/api/ncrs/<ncrId>/pdf
```

### 预期

- 仅可看到自己有权限项目下的 `NCR`
- 无权限访问应返回 `403` 或对列表直接不可见

## 8. API 烟测建议

如果你希望不经过前端做快速检查，建议至少覆盖以下接口：

- `GET /health`
- `GET /api/meta`
- `GET /api/ncrs?projectId=...`
- `POST /api/ncrs/ships/:shipId`
- `PUT /api/ncrs/:id/remark`
- `PUT /api/ncrs/:id`
- `POST /api/ncrs/:id/files`
- `GET /api/ncrs/:id/files/:fileId`
- `POST /api/ncrs/:id/pdf`
- `GET /api/ncrs/:id/pdf`
- `PUT /api/ncrs/:id/approve`

## 9. 验收通过标准

满足以下条件可视为本轮本地验收通过：

- `pnpm typecheck` 通过
- `NCR` 页面入口保持不变
- `Project / Ship / Status / Remark` 四类筛选可用
- 创建 `NCR` 后，`R2 JSON` 与 `D1 ncr_index` 同步成功
- `remark` 编辑可落库并参与筛选
- 图片上传 / 删除刷新后不丢失
- 相关文件上传 / 预览 / 下载 / 删除可用
- `PDF` 生成 / 下载可用
- 审批 / 驳回可用
- 权限隔离符合项目范围

## 10. 常见问题

### 10.1 页面创建 NCR 按钮不可点

原因通常是没有选择具体 `Ship`。

### 10.2 上传图片后刷新丢失

当前代码已经补上 `PUT /api/ncrs/:id` 同步。如果仍出现此问题，请优先检查：

- 前端是否请求成功
- API 是否写回 `R2 NCR JSON`
- 当前 `NCR` 是否确实来自有权限项目

### 10.3 相关文件能上传但预览失败

先区分是否为浏览器天然不支持预览的类型：

- 可预览：`pdf` / `image/*` / `text/*`
- 不保证预览：`docx` / `xlsx` / `zip`

### 10.4 PDF 中文显示异常

当前 `PDF` 是简化生成器，使用基础字体，非 ASCII 字符可能显示为 `?`。这属于当前实现限制，不影响接口与存储链路验收。
