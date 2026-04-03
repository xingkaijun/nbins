# NBINS - 新造船检验管理系统

> **NBINS** (New Building Inspection System)

这是一个专为船舶检验机构打造的多人协作新造船检验管理平台。NBINS 提供了一个集中的工作区，用于管理新造船过程中的报验（Inspection Requests）、检验结果和整改意见。

## ✨ 主要特性

- 📥 **MVP 手动导入，后续支持自动化**：MVP 阶段先支持从 Excel 报验单复制粘贴批量导入；后续再通过 n8n 自动解析船厂邮件中的报验单。
- 👥 **专业分工与权限控制**：基于角色的访问控制（RBAC）。支持按专业（如船体、轮机、电气等）划分检验员职责，检验员可专注于自身专业的检验任务。
- 📊 **检验流程跟踪**：完整记录检验状态流转（待检验 -> 接受/带意见接受/复检/拒绝/取消）。
- 💬 **意见追踪管理**：对每项检验的支持多条意见（Comments）录入，追踪意见的开启与整改关闭状态。
- 🔒 **防覆盖与协作**：内置乐观锁机制，支持多名检验员同时在线操作而不会产生数据覆盖冲突。
- 📑 **正式 PDF 报告与后续自动归档**：系统由 API 统一生成正式 PDF 报告，MVP 支持下载/手动发送；后续再通过 n8n 自动发送并归档到 OneDrive。
- 📈 **数据可视化统计**：直观的仪表盘和报表中心，轻松洞察检验通过率、项目进度以及每日工作汇总。

## 🛠 技术栈

项目采用全栈 TypeScript 构建，基于 Serverless 架构，确保持续的高可用与低运维成本：

### 核心架构

- **前端 (Web)**: React 18, Vite, Ant Design 5, Zustand (部署在 Vercel)
- **后端 (API)**: Hono + PDF 生成服务 (部署在 Cloudflare Workers)
- **数据库**: Cloudflare D1 (Serverless SQLite), Drizzle ORM
- **工作流集成**: n8n (部署在 VPS Docker)

## 📂 仓库结构

此项目采用 Monorepo 体系结构进行组织，包含以下主要模块：

```text
├── packages/
│   ├── shared/    # 前后端共享的数据模型、Type定义、常量和 Zod 校验逻辑
│   ├── api/       # Hono API 后端应用，直接与 Cloudflare D1 通信
│   └── web/       # React 前端应用程序
├── n8n/           # n8n 工作流定义与配置备份
└── docs/          # 系统详细的设计文档和产品规划
```

## 📚 项目文档

更多关于设计原理、数据建模、页面草图和工作流机制的信息，请仔细阅读 `docs/` 目录下的文档（这对于其他接手工作的 AI Agent 尤为重要）：

- [架构设计规划 (architecture.md)](./docs/architecture.md)
- [前端页面规划 (frontend-plan.md)](./docs/frontend-plan.md)
- [前端风格对齐执行方案 (frontend-style-alignment.md)](./docs/frontend-style-alignment.md)
- [n8n 工作流设计 (n8n-plan.md)](./docs/n8n-plan.md)

---

*这是一个由 AI 辅助设计与开发的现代化系统*
