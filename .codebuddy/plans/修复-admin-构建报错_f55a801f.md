---
name: 修复-admin-构建报错
overview: 修复 `Admin.tsx` 仍传递已废弃的 `isReinspection` 字段导致的 TypeScript 构建失败，并同步管理页表单字段到 `startAtRound`。
todos:
  - id: scan-legacy-field
    content: 使用 [subagent:code-explorer] 复核 isReinspection 残留引用
    status: completed
  - id: align-admin-form
    content: 修改 Admin.tsx 默认值与表单字段为 startAtRound
    status: completed
    dependencies:
      - scan-legacy-field
  - id: align-admin-submit
    content: 调整 Admin.tsx 提交 payload 为数值型 startAtRound
    status: completed
    dependencies:
      - align-admin-form
  - id: cross-check-import
    content: 对齐 Import.tsx 的轮次语义与文案
    status: completed
    dependencies:
      - align-admin-submit
  - id: verify-web-build
    content: 执行 web typecheck 与 build 验证修复结果
    status: completed
    dependencies:
      - cross-check-import
---

## 用户需求

修复前端构建失败：`packages/web/src/pages/Admin.tsx` 仍在向 `batchImportInspections()` 传递已废弃的 `isReinspection` 字段，而当前接口只接受 `startAtRound`。

## 产品概览

管理员在 Admin 页面新增 inspection 时，表单应与当前导入逻辑保持一致：不再使用“是否复检”的布尔选项，而改为选择“从第几轮开始”。界面表现为原来的 `Is Reinspection` 下拉替换成更明确、低干扰的轮次选择，如 `1 / 2 / 3` 或 `R1 / R2 / R3`。

## 核心功能

- Admin 新建 inspection 表单改为使用 `startAtRound`
- 默认值、提交参数、表单字段名称保持一致
- 与 `Import.tsx` 的轮次语义统一，避免前后不一致
- 清理 Admin 页面残留的 `isReinspection` 旧引用
- 重新通过 web 端 TypeScript 构建校验

## Tech Stack Selection

- 前端：React 18 + TypeScript
- 构建：Vite + `tsc -p tsconfig.app.json`
- 共享接口来源：`packages/web/src/api.ts`

## Implementation Approach

采用最小改动修复方案：仅调整 `Admin.tsx` 中 inspection 新建表单的数据模型、提交 payload 和展示文案，使其与 `api.ts` 当前接口定义及 `Import.tsx` 已落地的 `startAtRound` 语义完全对齐。这样可直接消除 TS2353 构建错误，并避免再次引入字段漂移。

关键决策：

1. 不回退 `api.ts` 到 `isReinspection`，因为 `Import.tsx` 已完成到 `startAtRound` 的迁移，接口方向已明确。
2. 不新增兼容层，直接在 Admin 页面收敛到现行字段，减少维护成本和二义性。
3. 表单内部可继续以字符串保存选择值，但提交时统一 `Number()` 转为数值，保证接口类型正确。

性能与可靠性：

- 仅影响本地表单状态和一次提交 payload，时间复杂度 `O(1)`。
- 主要风险是页面内仍有遗漏的旧字段引用；通过针对 `isReinspection` 的全文件扫描和 web build 校验控制回归。

## Implementation Notes

- 已验证构建失败根因是 `Admin.tsx` 第 390 行仍发送 `isReinspection`，Node 的 `[DEP0169]` 只是警告，不是阻塞原因。
- `openNew()` 初始表单值、`saveNewInspection()` 请求体、inspection 表单渲染三处需同步修改，避免只改一处导致运行时不一致。
- 直接参考 `Import.tsx` 当前对 `startAtRound` 的取值范围处理，优先限制在 1~3，避免后端收到非法轮次。
- 保持改动半径最小，不触碰后端、构建配置与无关页面。

## Architecture Design

本次为现有前端单页中的局部一致性修复：

- `Admin.tsx`：唯一实际修改点，负责新建 inspection 的默认值、表单控件、提交映射
- `api.ts`：作为现行接口契约基准，保持不变，仅作为校验参照
- `Import.tsx`：作为现有同类交互参考，复用其轮次语义

## Directory Structure

本次修复应集中在现有 web 端文件，避免扩大改动范围。

```text
d:/Code/nbins/
└── packages/
    └── web/
        ├── src/
        │   ├── pages/
        │   │   └── Admin.tsx   # [MODIFY] 将 inspection 新建表单从 isReinspection 切换到 startAtRound；同步默认值、下拉项、提交参数与文案。
        │   ├── api.ts          # [AFFECTED] 现有 batchImportInspections 接口契约基准；需按此确认 Admin 提交结构，不建议改动。
        │   └── pages/
        │       └── Import.tsx  # [AFFECTED] 现有 startAtRound 参考实现；用于对齐 Admin 的轮次范围与展示语义。
        └── package.json        # [AFFECTED] 现有 build/typecheck 脚本入口；修复后用其验证构建通过。
```

## Agent Extensions

### SubAgent

- **code-explorer**
- Purpose: 复核 `Admin.tsx` 及 web 端是否仍存在 `isReinspection` 旧引用，确认修改面仅限必要位置
- Expected outcome: 输出残留引用清单与最终零遗漏确认，降低再次构建失败风险