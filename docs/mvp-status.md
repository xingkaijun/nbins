# NBINS MVP 状态与演示说明

> 更新时间：2026-04-03
> 状态：**可演示 MVP 基线**

本文档用于回答两个问题：

1. 当前仓库到底已经做到了什么？
2. 如果要给别人演示，应该怎么讲、怎么点？

---

## 1. 当前完成情况

### 1.1 Monorepo 基础

仓库已经建立 `pnpm workspace`：

- `packages/shared`
- `packages/api`
- `packages/web`

并已通过：

- `pnpm typecheck`
- `pnpm build`
- `pnpm --filter @nbins/api test`

### 1.2 共享类型契约

已定义：

- `InspectionItemDetailResponse`
- `InspectionRoundHistoryEntry`
- `InspectionItemComment`
- `SubmitInspectionResultRequest`
- `SubmitInspectionResultResponse`

以及核心枚举：

- 检验结果：`CX / AA / QCC / OWC / RJ`
- 工作流状态：`pending / open / closed / cancelled`
- comment 状态：`open / closed`

### 1.3 后端已实现

后端已提供：

- `GET /api/inspections/:id`
- `PUT /api/inspections/:id/rounds/current/result`

当前是：

- Hono API
- repository / service / persistence 分层
- in-memory mock database
- optimistic locking（`expectedVersion`）

### 1.4 前端已实现

前端当前包含：

- inspection list
- inspection detail panel
- round history timeline
- comments list
- result submission form
- preview 区块

目前前端主要使用 shared mock data 做演示，不是完全依赖真实 API。

---

## 2. 已落地的业务规则

### 2.1 AA

`AA` 是最严格的规则：

- 不允许新增 comments
- 如果历史仍有开放 comments：
  - `workflowStatus` 维持 `open`
  - `resolvedResult = null`
  - 只能表示“待最终接受”
- 只有所有 comments 关闭后，item 才真正进入：
  - `resolvedResult = AA`
  - `workflowStatus = closed`

### 2.2 QCC

- 允许新增 comments
- 不触发新 round
- comments 关闭完后，可以自动归并为最终 `AA`

### 2.3 OWC / RJ

- 允许新增 comments
- 提交后 item 维持 `open`
- `waitingForNextRound = true`
- 语义上等待船厂重新报验

### 2.4 CX

- 直接进入 `cancelled`
- 不新增 comments

---

## 3. 演示建议

## 3.1 启动方式

```bash
pnpm install
pnpm dev:web
pnpm dev:api
```

### 3.2 推荐演示顺序

建议按下面的顺序点：

1. `insp-002`
   - 有开放 comments
   - 适合演示 `AA` 虽可选择，但不会直接最终关闭

2. `insp-003`
   - 有多轮次历史
   - 适合演示 round history

3. `insp-005`
   - 当前为 `RJ`
   - 适合演示等待复检

4. `insp-004`
   - 已经是 `AA + closed`
   - 适合作为成功闭环的对照项

### 3.3 推荐现场话术

可以按下面的逻辑讲：

> 左边是检验项目列表，右边是该项目的详情、轮次历史、意见列表和检验结论提交区。  
> 这版 MVP 的重点不是做完全部系统，而是把最关键的检验业务规则用代码跑通。  
> 比如 AA 不能新增意见；如果历史意见还没有全部关闭，即使选了 AA，也不会真正 closed。  
> QCC 可以带意见但不触发新 round；OWC 和 RJ 会等待下一轮报验；CX 则直接取消。  
> 所以前后端现在已经具备一条可演示、可继续往真实数据库推进的业务主线。

---

## 4. API 演示

### 4.1 获取 inspection detail

```bash
curl http://127.0.0.1:8787/api/inspections/insp-002
```

### 4.2 提交 QCC

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

### 4.3 提交非法 AA（带新 comments）

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

这个请求应该返回错误，用来证明后端规则已生效。

---

## 5. 当前缺口

下面这些还没有完成：

- Cloudflare D1 / Drizzle 真持久化
- 前端改为读取真实 API
- comment close / resolve 流程
- 登录 / JWT / RBAC
- import workflow 与正式 PDF 报告

所以这版仓库应该定义为：

> **有主线、有规则、有演示价值的 MVP baseline**

而不是生产版。

---

## 6. 下一步建议

推荐下一阶段优先级：

1. mock persistence → D1 / Drizzle
2. web detail / submit flow 接真实 API
3. comments 关闭与自动转 AA 闭环
4. 用户与项目授权
5. 导入 / PDF / n8n 自动化
