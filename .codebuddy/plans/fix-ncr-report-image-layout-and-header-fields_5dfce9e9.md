---
name: fix-ncr-report-image-layout-and-header-fields
overview: 核查并修复 NCR report 导出中的图片展示与头部字段显示问题：确认当前图片来源与尺寸逻辑，改为裁切填充图框，并修复 project name / reference no. 显示不完整或缺失的情况。
todos:
  - id: fix-ncr-header-text
    content: 调整 packages/web/src/utils/ncr-export.ts 头部与元信息文字自适应显示
    status: completed
  - id: implement-image-cover-crop
    content: 实现 packages/web/src/utils/ncr-export.ts 图片居中裁切填充导出
    status: completed
    dependencies:
      - fix-ncr-header-text
  - id: preserve-export-flow
    content: 保持 Ncrs.tsx 现有下载入口并校验附件分页与字段回退
    status: completed
    dependencies:
      - implement-image-cover-crop
  - id: verify-ncr-report-layout
    content: 回归验证长项目名、长编号与不同纵横比图片导出效果
    status: completed
    dependencies:
      - preserve-export-flow
---

## User Requirements

### Product Overview

优化现有 NCR report 导出效果，保证报表中的项目信息、参考编号和附件图片展示稳定、完整、可读。报表整体结构保持不变，重点修正文字显示不全与图片变形问题。

### Core Features

- 修复 `project name` 与 `reference no.` 在报表中的显示不完整、缺失或被挤压的问题，确保长内容也能稳定可见。
- 调整附件图片在固定图框中的适配方式，改为按图框比例居中裁切填充，不再拉伸压缩导致变形。
- 保持 NCR report 当前首页加图片附件页的输出方式不变，仅优化排版和图片呈现效果。
- 保持图片清晰度与报表可读性，避免因适配逻辑调整导致图片模糊、留白过多或布局错乱。

### User Requirements

- 当前 NCR report 中的图片尺寸与来源需要按现有导出链路核实并在实现中保持一致性。
- 用户明确要求图片展示从“压缩适应图框”改为“裁切适应图框”。
- `project name` 和 `reference no.` 需要在现有版式中完整显示，必要时允许缩小字号、换行或重新分配可用空间，但不改变字段含义。

## Tech Stack Selection

- 前端 NCR 报表导出入口：`packages/web/src/pages/Ncrs.tsx`
- 当前导出实现：`packages/web/src/utils/ncr-export.ts`
- 图片下载链路：`downloadMedia()` 调用 `/api/media/:shipId/:filename`
- NCR 展示数据补全来源：`packages/api/src/services/ncr-storage.ts`
- 图片上传与变体生成：`packages/web/src/components/ImageUploader.tsx`

## Implementation Approach

本次优先修改前端 NCR 导出实现，不改后端 PDF 路由。已确认当前用户点击下载时走的是 `Ncrs.tsx -> exportNcrToPdf()`，因此应直接在 `ncr-export.ts` 修正文字布局和图片绘制逻辑，最小化影响范围。

图片部分采用“先按目标长宽比做居中裁切，再写入 PDF 固定图框”的方案，而不是直接把原图强制拉伸到目标宽高。由于 `jsPDF.addImage()` 目前在该实现中是固定宽高绘制，导致纵横比被破坏，最稳妥的做法是在浏览器端先把下载后的图片绘制到临时 canvas，再输出为裁切后的数据写入 PDF。这样可复用现有 `downloadMedia()` 与 base64 转换逻辑，不引入新的后端依赖。

文字部分新增受限宽度绘制辅助逻辑，对 `projectName`、`formattedSerial` 等字段执行测宽、缩放、换行或右对齐布局，保证长文本不会超出卡片和页眉区域。复杂度方面，图片处理为 O(n) 张图逐张下载与裁切，文本适配为 O(1) 局部计算；主要瓶颈在图片下载与 canvas 转换，保持逐页或逐张处理可避免一次性占用过多内存。

当前已验证的现状：

- 附件页单图外框约为 `88mm × 75mm`，实际图片绘制区域约为 `86mm × 73mm`
- 当前导出下载的是 `imageAttachments` 对应的 `original` 变体
- 该 `original` 并非未经处理的原始上传文件，而是上传时生成的 WebP 变体，最长边约 1600px，质量约 0.82
- 现有实现直接固定宽高绘制图片，因此会产生拉伸变形

## Implementation Notes

- 保持 `packages/web/src/pages/Ncrs.tsx` 的现有下载入口不变，避免影响审批、列表和下载按钮逻辑。
- 不修改 `packages/api/src/routes/ncr-pdf.ts`，因为当前用户实际使用的是前端导出链路，后端官方 PDF 路由不属于本次主修复路径。
- 对 `projectName`、`reference no.` 增加安全回退：优先使用已水合字段，缺失时再退回其他已有标识，避免空白。
- 调整卡片高度或文本行高时，只影响 NCR 导出页面内部排版，不改业务字段、不改数据结构。
- 图片裁切应保持居中 cover 语义，避免出现再次压缩拉伸、边缘黑边或过度留白。

## Architecture Design

当前导出链路：

- `packages/web/src/pages/Ncrs.tsx` 触发下载
- `packages/web/src/utils/ncr-export.ts` 生成 PDF
- `downloadMedia()` 拉取图片附件
- 图片经前端处理后写入 PDF 页面

本次修改集中在导出层：

- 文字布局辅助：负责页眉、参考编号、项目信息的受限宽度绘制
- 图片裁切辅助：负责将附件图按图框比例居中裁切后再写入 PDF
- 现有分页、标题、附件页结构继续复用

## Directory Structure

## Directory Structure Summary

本次实现聚焦 NCR 报表导出文件，避免扩大到上传链路或后端 PDF 路由，保证改动集中、回归成本低。

d:/Code/nbins/

- `packages/web/src/utils/ncr-export.ts`  [MODIFY] NCR 报表前端导出实现。修复 `project name` 与 `reference no.` 的受限宽度显示问题；为附件页新增按图框比例居中裁切的图片绘制逻辑；保持现有首页、附件页和分页结构不变；复用现有图片下载与 base64 转换流程，避免影响其他模块。