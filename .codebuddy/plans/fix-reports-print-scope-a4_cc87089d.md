---
name: fix-reports-print-scope-a4
overview: 修复 `Reports` 页打印范围错误的问题，确保点击打印时仅输出报表主体，并稳定按 A4 纵向分页，不再把外层后台导航与壳子一起打印。
todos:
  - id: audit-print-chain
    content: 用 [subagent:code-explorer] 复核 Reports 与全局打印链路
    status: completed
  - id: refactor-report-print
    content: 重构 Reports.tsx 打印状态与 afterprint 清理
    status: completed
    dependencies:
      - audit-print-chain
  - id: scope-report-print-css
    content: 修改 styles.css 仅输出报表主体并固定 A4 分页
    status: completed
    dependencies:
      - refactor-report-print
  - id: verify-print-behavior
    content: 用 [skill:playwright-cli] 验证按钮打印与 Ctrl+P
    status: completed
    dependencies:
      - scope-report-print-css
---

## User Requirements

- 修复 `Reports` 页面打印异常：点击 `PRINT / PDF` 时，只打印报表主体，不打印顶部导航、底部状态栏、筛选区等后台网页壳层。
- 打印结果需按 **A4 纵向**输出，保留现有报表页的分页结构、页眉页脚和主体排版。
- 打印行为要稳定：即使独立窗口被拦截，或用户直接使用浏览器打印，也不能退化为打印整页后台。

## Product Overview

- `Reports` 页面应具备独立报表打印能力，打印预览中只出现居中的 A4 报表页。
- 视觉上应移除应用导航与外围背景干扰，让打印结果看起来像正式报表，而不是网页截图。

## Core Features

- 报表主体打印范围隔离
- A4 纸张尺寸与分页控制
- 打印前后状态切换与清理
- 按钮打印与浏览器打印一致性

## Tech Stack Selection

- 前端沿用现有 **React + TypeScript** 页面组件结构。
- 路由与页面承载沿用 `react-router` 当前布局方式：`Layout.tsx` 中 `.shell` 直接包裹 `TopBar`、路由页面内容和底部状态栏。
- 打印能力基于现有 `packages/web/src/styles.css` 的全局 `@media print` 规则扩展，不新增独立打印框架。
- 报表主体继续使用 `packages/web/src/pages/Reports.tsx` 中现有 A4 页结构与 `break-after-page` 规则。

## Implementation Approach

- 放弃当前 **依赖 `window.open` 的打印主路径**，改为在当前页面内进行“受控打印”：由 `Reports.tsx` 在打印前给 `body` 或报表根节点打上专用标记，再调用 `window.print()`，打印完成后通过 `afterprint` 和兜底清理移除标记。
- 这样可直接利用 `Layout.tsx` 里 `.shell` 的已知层级关系，在 `styles.css` 中精确隐藏 `TopBar`、底部状态栏以及 `Reports` 内的非报表控件，仅保留 `#a4-pages-container`。
- 该方案避免弹窗拦截、避免复制 DOM 到新窗口造成样式丢失，也让“点按钮打印”和“浏览器直接打印”共享同一套打印隔离逻辑。

## Implementation Notes

- 复用现有 `.no-print`、`.print-only`、`.break-after-page` 约定，避免引入第二套并行打印机制。
- 不再使用“失败后回退整页 `window.print()`”的策略；当前问题正是由该退化路径导致。
- 打印态标记必须在 **打印完成、取消打印、组件卸载** 三种场景都能清理，防止后续页面残留打印样式。
- 打印样式必须限定在 `Reports` 作用域内，不能影响其他页面未来可能存在的打印能力。
- 性能为 O(1) 级别的样式切换与浏览器打印调用，不增加数据请求、图表重算或 DOM 深拷贝成本。

## Architecture Design

- 结构依赖已确认：
- `packages/web/src/components/Layout.tsx`：`.shell` 下直接渲染 `TopBar`、`Outlet`、底部状态栏
- `packages/web/src/components/TopBar.tsx`：当前被错误打印出来的顶部导航来源
- `packages/web/src/pages/Reports.tsx`：打印按钮、报表容器 `#a4-pages-container`、页级 A4 结构
- `packages/web/src/styles.css`：现有全局打印规则入口
- 建议链路：
- 用户点击打印
- `Reports.tsx` 激活报表打印标记
- `styles.css` 在打印媒体下只显示报表主体
- 浏览器按 A4 分页输出
- `afterprint` 清理打印标记

## Directory Structure

## Directory Structure Summary

本次实现应控制在前端报表页与全局打印样式两处，基于现有布局层级完成最小范围修复。

```text
packages/web/src/pages/Reports.tsx
  # [MODIFY] 报表页打印控制入口。
  # Purpose: 管理打印触发、打印作用域标记、打印后清理。
  # Functionality: 移除 popup 依赖；为页面根节点和报表容器建立稳定打印范围；保证按钮打印与页面打印一致。
  # Implementation requirements: 使用 afterprint/卸载清理；避免 fallback 为整页打印；保持现有报表内容与分页结构不变。

packages/web/src/styles.css
  # [MODIFY] 全局但受 Reports 作用域约束的打印样式。
  # Purpose: 在打印媒体下隐藏应用壳层，仅保留报表主体。
  # Functionality: 隐藏 TopBar、底部状态栏、筛选工具栏和非报表节点；固定 A4 纵向尺寸、边距和分页规则。
  # Implementation requirements: 仅在 Reports 打印标记存在时生效；不得破坏其他页面屏幕样式或未来打印行为。
```

## Agent Extensions

### SubAgent

- **code-explorer**
- Purpose: 复核 `Reports.tsx`、`Layout.tsx`、`TopBar.tsx`、`styles.css` 的打印链路和选择器影响面
- Expected outcome: 确认最小修改点与稳定的打印隔离范围

### Skill

- **playwright-cli**
- Purpose: 浏览器回归验证打印行为、打印态页面结构与 A4 输出效果
- Expected outcome: 确认点击 `PRINT / PDF` 与浏览器打印都只输出报表主体