# NBINS 前端风格对齐执行方案（对齐 D1）

> 目标：`NBINS` 的前端界面在视觉风格、配色、文字语气、布局结构、交互反馈上，尽可能与 `D:\code\d1` 保持同源体验。要求不是“参考”，而是“复制级对齐”，只在业务信息结构上做必要替换。

## 1. 结论

`D1` 的前端风格可以拆成两套但同属一个品牌系：

- 主业务端：浅色、高留白、`slate + teal` 主导、超粗大写标题、圆角大容器、轻玻璃态顶栏。
- 管理/运维端：深色、`bg/bg-panel + magenta primary`、左右分栏、表浏览器/SQL/工具台风格。

`NBINS` 应采用同样的双轨体系：

- 日常检验业务页面复制 `D1 App.tsx` 的浅色工作台风格。
- `admin/ops` 数据库运维台复制 `D1 worker/src/admin.html` 的深色后台风格。

这意味着 `NBINS` 不是重新设计一套审美，而是建立“业务端像 D1 主站，运维端像 D1 admin.html”的映射。

## 2. 视觉母版来源

本方案基于以下实际文件抽取规则：

- `D:\code\d1\App.tsx`
- `D:\code\d1\components\CommandBar.tsx`
- `D:\code\d1\components\Dashboard.tsx`
- `D:\code\d1\worker\src\admin.html`

## 3. 必须复制的风格特征

### 3.1 业务端主风格

- 页面背景固定为接近 `#F8FAFC` 的浅灰蓝背景，不使用纯白满屏。
- 主文字基色固定为 `slate-900 / slate-800 / slate-500 / slate-400` 体系。
- 主强调色固定为 `teal`，用于激活态、主链接、选中导航、选中图标、选择高亮。
- 容器采用大圆角，典型值为 `rounded-2xl` 到 `rounded-[2rem]`。
- 主内容区采用“外部浅背景 + 内部白色大面板”的双层结构。
- 顶栏使用 `bg-white/80` 或 `bg-white/90` + `backdrop-blur` + `border-slate-200/60`。
- 阴影轻，不做重渐变；主要是 `shadow-sm / shadow-lg / shadow-2xl shadow-slate-200/40`。
- 所有导航、按钮、标签强调“胶囊感”，大量使用 `rounded-full`。
- 标题和功能标签大量使用全大写英文风格或“中文 + 英文系统名”双层结构。

### 3.2 字体与文字语气

- 字体不追求花哨，沿用系统无衬线即可，但必须依靠权重和字距形成风格。
- 页面主标题使用极重字重，接近 `font-[1000]`。
- 次级说明大量使用超小字号 + 全大写 + 高 tracking。
- 主导航、按钮、状态标签统一用 `uppercase tracking-wider` 风格。
- 文案语气偏“操作系统”和“工作台”，不是营销文案，也不是政府系统文案。
- 页面标题建议采用 `中文业务名 + 英文系统副标题` 组合。

### 3.3 结构语言

- 采用“固定顶栏 + 可滚动主工作区 + 轻页脚”结构。
- 主导航用横向 pill tabs，不改成左侧厚重菜单。
- 数据页用“大面板承载具体模块”的组织方式，不使用一屏多卡片拼贴。
- 卡片可以用，但只用于统计摘要、状态块、次级信息，不许把整页切成 dashboard card mosaic。

### 3.4 运维端风格

- `admin/ops` 必须单独采用深色运维风格。
- 背景色采用 `#1e1e2d`，面板背景采用 `#27293d`。
- 文本采用浅灰 `#e0e0e0`，辅助文字 `#9e9ea7`。
- 主强调色采用 `#e14eca`，hover 采用 `#c43eb0`。
- 左侧为表/功能导航，右侧为内容区，表格与工具栏保持 dense layout。
- 表格、输入框、编辑弹窗全部延续 `admin.html` 的高对比深色面板风格。

## 4. NBINS 页面映射规则

### 4.1 需要对齐到 D1 主业务端的页面

- `/`
- `/projects`
- `/projects/:projectId`
- `/projects/:projectId/ships/:shipId`
- `/projects/:projectId/ships/:shipId/observations`
- `/inspections/:id`
- `/reports`
- `/import`
- `/admin/users`
- `/admin/projects`
- `/admin/import-logs`
- `/admin/comment-templates`

这些页面都应统一采用：

- 同样的浅色底
- 同样的玻璃态顶栏
- 同样的 pill 导航
- 同样的白色主面板
- 同样的重标题与小号副标题

### 4.2 需要对齐到 D1 运维端的页面

- `/admin/ops`

该页面不应沿用业务端浅色风格，而应单独复制 `admin.html` 的深色控制台体验。

## 5. 配色执行规范

### 5.1 业务端基础色

建议在 `NBINS` 中固化为设计 token：

```css
:root {
  --nb-bg: #F8FAFC;
  --nb-bg-elevated: rgba(255, 255, 255, 0.82);
  --nb-panel: #FFFFFF;
  --nb-text: #0F172A;
  --nb-text-strong: #1E293B;
  --nb-text-muted: #64748B;
  --nb-text-faint: #94A3B8;
  --nb-border: rgba(148, 163, 184, 0.28);
  --nb-accent: #0D9488;
  --nb-accent-soft: #CCFBF1;
  --nb-accent-strong: #0F766E;
}
```

### 5.2 运维端基础色

```css
:root {
  --ops-bg: #1e1e2d;
  --ops-panel: #27293d;
  --ops-text: #e0e0e0;
  --ops-text-muted: #9e9ea7;
  --ops-border: #3b3d54;
  --ops-primary: #e14eca;
  --ops-primary-hover: #c43eb0;
  --ops-danger: #ff4d4f;
}
```

### 5.3 状态色原则

- 业务状态色允许保留业务语义差异，但必须压在 D1 的整体色域内。
- 不允许引入高饱和紫色主题、霓虹蓝主题或大量彩色渐变。
- 检验结果颜色要统一成“数据标签”而不是“装饰品牌色”。

建议映射：

- `AA`: emerald
- `QCC`: amber
- `OWC`: orange
- `RJ`: rose/red
- `CX`/待处理: slate

## 6. 组件级复制要求

### 6.1 顶栏

复制 `D1 App.tsx` 的以下结构：

- 左侧品牌区：主标题 + 英文副标题
- 中部横向导航 pill tabs
- 右侧当前项目/当前船舶选择器

`NBINS` 中建议对应为：

- 主标题：`NEW BUILDING INSPECTION`
- 强调词：`SYSTEM`
- 副标题：`Project Inspection Workspace`

### 6.2 导航按钮

统一样式：

- 高度较矮，圆角全胶囊
- 小字号大写
- 未激活为 `text-slate-400`
- 激活为 `bg-white text-teal-700 shadow-sm ring-1 ring-slate-200/60`

### 6.3 主面板

- 页面主工作区必须包在单一白色大面板内。
- 面板圆角接近 `2rem`。
- 内部模块可以再分区，但不要再套厚重卡片。

### 6.4 统计卡

统计卡可以参考 `D1 Dashboard.tsx`：

- 白底
- 轻边框
- 左侧图标块
- 上方小号 uppercase label
- 下方大号数字

但在 `NBINS` 中数量要克制，优先显示：

- 今日待检
- 今日已完成
- 开放意见
- 待复检
- 项目进度

### 6.5 表格

- 外层应嵌在白色面板中，不额外再叠复杂色块。
- 列头使用小字号 uppercase tracking。
- hover 只做轻微背景变化。
- 筛选栏和操作栏保持扁平，不堆叠重按钮。

### 6.6 表单与弹窗

- Modal 和 Drawer 使用白底、轻边框、柔和阴影。
- 表单标题采用 D1 式小副标题 + 重主标题。
- 操作按钮优先“黑底主按钮 + 白底次按钮”或“teal 激活按钮”。

### 6.7 命令式输入

`NBINS` 的快速操作区可以借用 `CommandBar.tsx` 的表达：

- 单行输入
- 强操作感
- 用于筛选、批量填写、批量操作

但文案要替换成检验业务语境，不照搬 drawing/review 术语。

## 7. 文案对齐规则

### 7.1 标题风格

统一采用：

- 中文功能名作为用户理解入口
- 英文副标题作为系统识别层

示例：

- `项目列表` / `Project Registry`
- `检验工作台` / `Inspection Workspace`
- `意见追踪` / `Comment Tracker`
- `数据库运维台` / `Operations Console`

### 7.2 组件文本规则

- 按钮文案短、硬、直接
- 少用长句
- 多用名词和动作词
- 避免“请先选择后再进行下一步操作”这种国产后台腔

优先使用：

- `Create Project`
- `Run Backup`
- `Export Package`
- `Batch Submit`
- `Open Comments`

### 7.3 中英文混排规则

- 页面允许中文主内容，但结构性标签应适度保留英文副标签
- 不要整页全英文，也不要完全丢掉 D1 的国际化工作台气质

## 8. 动效与反馈

必须保留 D1 的轻动效基调：

- 导航 tab hover 微变色
- 按钮 active 轻微缩放
- 卡片 hover 轻微抬升
- 进度条、状态条使用平滑 transition
- 面板切换保持简短淡入，不使用夸张动画

原则：

- 快
- 轻
- 不炫技
- 强调操作反馈

## 9. 页面实施顺序

### Phase A：建立风格基座

- 建立全局 token
- 建立页面框架 `AppShell`
- 建立顶栏 `TopBar`
- 建立导航 `PillNav`
- 建立主面板 `WorkspacePanel`
- 建立页面标题组件 `PageHeading`

### Phase B：迁移核心业务页

- 仪表盘
- 项目列表
- 项目详情
- 检验项目列表
- 检验详情

这些页面优先做到“第一眼就是 D1 同体系”。

### Phase C：迁移管理页

- 用户管理
- 项目管理
- 导入日志
- 意见模板管理

管理页仍使用浅色业务风格，不切深色。

### Phase D：单独实现运维台

- `admin/ops`
- 深色侧栏
- 表浏览器
- SQL 控制台
- 备份恢复
- 项目打包
- 白名单命令执行

## 10. 技术实施建议

### 10.1 如果 NBINS 使用 Tailwind

- 直接抽取 `d1` 的常用类风格，沉淀成组件和 token
- 避免在页面里重复拼大量色值
- 把 `teal/slate/white/glass` 组合封装为通用模式

### 10.2 如果 NBINS 使用 Ant Design

- 不允许直接使用默认 Ant Design 视觉
- 必须覆盖以下 token：
  - `colorPrimary`
  - `colorBgLayout`
  - `colorBgContainer`
  - `borderRadius`
  - `fontWeightStrong`
  - `colorText`
  - `colorTextSecondary`
- 再在页面层补齐 D1 式顶栏、胶囊导航和大圆角容器

### 10.3 如果 NBINS 新建前端

建议直接以以下结构搭建：

- `app-shell/`
- `components/system/`
- `components/data/`
- `components/ops/`
- `theme/tokens.ts`
- `theme/antd-theme.ts` 或 `theme.css`

## 11. 禁止事项

以下做法视为不符合“复制级对齐”：

- 使用默认 Ant Design 蓝白后台风格
- 顶栏改成传统左侧菜单 + 面包屑
- 把首页做成彩色统计卡宫格
- 使用深紫色、亮蓝色、赛博风渐变作为主风格
- 大量使用细碎卡片和边框分割页面
- 标题字重不够，缺少 uppercase/track 的 D1 气质
- 运维台继续沿用业务端浅色风格

## 12. 验收标准

### 12.1 视觉验收

- 截图放在一起时，`NBINS` 和 `D1` 必须明显属于同一套产品家族
- 不看 logo，只看顶栏、留白、按钮、颜色，也能判断是同团队产品

### 12.2 组件验收

- 顶栏、导航、主容器、统计卡、按钮、表格头部必须一眼可对应到 `D1`
- `admin/ops` 必须一眼可对应到 `D1` 的 `admin.html`

### 12.3 文案验收

- 页面标题、标签、按钮语气统一
- 中英文混排节奏一致
- 没有“另一个系统”的语言习惯混入

### 12.4 偏差容忍

允许变化：

- 业务字段内容
- 表格列结构
- 页面功能区域数量
- 检验结果状态标签内容

不允许变化：

- 主色关系
- 顶栏结构
- 字重和字距逻辑
- 主面板组织方式
- 运维台深色控制台风格

## 13. 建议的下一步

按执行效率，建议下一步直接做三件事：

1. 先在 `NBINS` 文档里确认本方案为视觉基线。
2. 从 `D1` 抽一份 `theme tokens + shell layout + nav + panel` 组件清单。
3. 所有 `NBINS` 页面先套壳再填业务，不允许页面各自单独长样子。
