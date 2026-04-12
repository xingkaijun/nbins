# SQL Console 操作手册

## 目录
1. [概述](#概述)
2. [访问方式](#访问方式)
3. [身份验证](#身份验证)
4. [功能说明](#功能说明)
5. [SQL 查询操作](#sql-查询操作)
6. [数据库管理](#数据库管理)
7. [项目数据管理](#项目数据管理)
8. [常用查询示例](#常用查询示例)
9. [注意事项](#注意事项)

---

## 概述

SQL Console 是 NBINS 系统的数据库管理工具，提供直接执行 SQL 查询、导入导出数据库、管理项目数据等功能。

**主要功能：**
- 执行任意 SQL 查询（SELECT、INSERT、UPDATE、DELETE 等）
- 导出/导入完整数据库
- 导出/导入单个项目数据
- 删除项目及其关联数据
- 快速访问常用数据表

---

## 访问方式

### 方式一：从管理员页面进入
1. 登录系统后，进入管理员页面（`/admin`）
2. 点击页面上的 **"SQL Console"** 按钮

### 方式二：直接访问
直接访问 URL：`/admin/sql`

---

## 身份验证

### 首次访问
1. 系统会显示登录界面，要求输入控制台口令
2. 输入环境变量 `SQL_CONSOLE_SECRET` 的值
3. 点击 **"验证并进入"** 或按 Enter 键

### 口令验证
- 口令会保存在浏览器的 sessionStorage 中
- 关闭浏览器标签页后需要重新输入
- 如果口令错误，系统会提示："口令错误，请确认你输入的是 SQL_CONSOLE_SECRET 的值"

### 退出登录
点击右上角的 **"Log out"** 按钮，清除已保存的口令

---

## 功能说明

SQL Console 界面分为两个主要区域：

### 左侧区域：SQL 查询编辑器
- SQL 语句输入框（支持多行）
- 执行按钮
- 查询结果显示区

### 右侧区域：数据管理面板
- 数据库导入/导出
- 项目数据管理
- 常用表快速访问

---

## SQL 查询操作

### 执行查询

1. **输入 SQL 语句**
   - 在文本框中输入 SQL 语句
   - 支持多行输入
   - 默认示例：`SELECT * FROM users LIMIT 10;`

2. **执行方式**
   - 点击 **"Execute ▶"** 按钮
   - 或使用快捷键：`Ctrl + Enter`（Mac 用 `Cmd + Enter`）

3. **查看结果**
   - SELECT 查询：显示表格形式的结果，包含行数统计
   - INSERT/UPDATE/DELETE：显示影响的行数、执行时间、最后插入的行 ID

### 查询结果说明

#### SELECT 查询结果
```
┌─────────────────────────────────────┐
│ RESULT                    10 rows   │
├─────────────────────────────────────┤
│ id │ username │ email │ role       │
├────┼──────────┼───────┼────────────┤
│ 1  │ admin    │ ...   │ admin      │
│ 2  │ user1    │ ...   │ inspector  │
└─────────────────────────────────────┘
```

#### 修改操作结果
```
✓ Changes: 1, Duration: 5ms, Last Row ID: 123
```

### 错误处理
- 如果 SQL 语句有错误，会在结果区域上方显示红色错误提示
- 点击错误提示右侧的 **✕** 可以关闭提示

---

## 数据库管理

### 导出完整数据库

1. 在右侧面板找到 **"DATABASE"** 区域
2. 点击 **"Export"** 按钮
3. 系统会自动下载 JSON 文件，文件名格式：`nbins-db-YYYY-MM-DD.json`
4. 下载完成后会显示文件大小提示

**导出内容：**
- 所有数据表的完整数据
- 包括：users、projects、ships、inspections、observations、ncrs 等

### 导入完整数据库

⚠️ **警告：此操作会清空并覆盖整个数据库！**

1. 点击 **"Import"** 按钮
2. 选择之前导出的 JSON 文件
3. 系统会弹出确认对话框：**"⚠️ 警告：这将清空并覆盖整个数据库。确认继续？"**
4. 点击 **"确定"** 开始导入
5. 导入成功后显示提示：**"数据库导入成功！"**

**使用场景：**
- 数据库迁移
- 灾难恢复
- 测试环境数据重置

---

## 项目数据管理

### 选择项目
在 **"PROJECT DATA"** 区域的下拉菜单中选择要操作的项目

显示格式：`项目代号 — 项目名称`
例如：`PRJ001 — 某某船舶项目`

### 导出项目数据

1. 在下拉菜单中选择目标项目
2. 点击 **"Export"** 按钮
3. 系统会下载 JSON 文件，文件名格式：`nbins-project-{项目代号}-YYYY-MM-DD.json`

**导出内容：**
- 项目基本信息
- 项目关联的所有船舶
- 所有检验记录
- 所有意见（observations）
- 所有 NCR 记录
- 项目成员信息

### 导入项目数据

⚠️ **警告：此操作会覆盖同名项目的所有数据！**

1. 点击 **"Import"** 按钮
2. 选择之前导出的项目 JSON 文件
3. 系统会识别项目代号并弹出确认对话框：**"⚠️ 警告：这将覆盖项目 [XXX] 的所有数据。确认继续？"**
4. 点击 **"确定"** 开始导入
5. 导入成功后显示提示：**"项目 [XXX] 导入成功！"**

**使用场景：**
- 项目数据备份与恢复
- 跨环境项目迁移
- 项目数据共享

### 删除项目

⚠️ **危险操作：此操作不可恢复！**

1. 在下拉菜单中选择要删除的项目
2. 点击红色的 **"Delete Project"** 按钮
3. 系统会弹出输入框：**"删除项目 XXX 及其全部关联数据（船舶、检验、意见等）。请输入项目代号以确认："**
4. 输入项目代号（必须完全匹配）
5. 点击 **"确定"** 执行删除
6. 删除成功后显示提示：**"项目 XXX 已删除"**

**删除范围：**
- 项目基本信息
- 所有关联船舶
- 所有检验记录和检验项
- 所有意见（observations）
- 所有 NCR 记录
- 所有评论
- 项目成员关系

---

## 常用查询示例

### 快速访问数据表
右侧面板底部的 **"TABLES"** 区域列出了所有常用数据表，点击表名会自动填充查询语句：

```sql
SELECT * FROM "表名" LIMIT 20;
```

**可用数据表：**
- `users` - 用户表
- `projects` - 项目表
- `ships` - 船舶表
- `inspection_items` - 检验项表
- `inspection_rounds` - 检验轮次表
- `comments` - 评论表
- `ncrs` - NCR 记录表
- `observations` - 意见表
- `observation_types` - 意见类型表
- `project_members` - 项目成员表

### 用户管理查询

```sql
-- 查看所有用户
SELECT * FROM users;

-- 查看管理员用户
SELECT * FROM users WHERE role = 'admin';

-- 查看特定用户的详细信息
SELECT * FROM users WHERE username = 'admin';

-- 统计用户数量
SELECT role, COUNT(*) as count FROM users GROUP BY role;
```

### 项目相关查询

```sql
-- 查看所有项目
SELECT * FROM projects;

-- 查看项目及其船舶数量
SELECT p.code, p.name, COUNT(s.id) as ship_count
FROM projects p
LEFT JOIN ships s ON p.id = s.projectId
GROUP BY p.id;

-- 查看项目的专业类别配置
SELECT code, name, disciplines FROM projects;
```

### 船舶相关查询

```sql
-- 查看所有船舶
SELECT * FROM ships;

-- 查看特定项目的船舶
SELECT * FROM ships WHERE projectId = 'project-id-here';

-- 查看船舶及其意见数量
SELECT s.hullNumber, s.name, COUNT(o.id) as observation_count
FROM ships s
LEFT JOIN observations o ON s.id = o.shipId
GROUP BY s.id;
```

### 意见（Observations）查询

```sql
-- 查看所有意见
SELECT * FROM observations ORDER BY createdAt DESC LIMIT 50;

-- 查看特定船舶的意见
SELECT * FROM observations WHERE shipId = 'ship-id-here';

-- 按状态统计意见
SELECT status, COUNT(*) as count FROM observations GROUP BY status;

-- 查看特定专业的意见
SELECT * FROM observations WHERE discipline = 'Electrical';

-- 查看开放状态的意见
SELECT * FROM observations WHERE status = 'Open';

-- 查看意见详情（包含船舶和项目信息）
SELECT 
  o.serialNo,
  o.type,
  o.discipline,
  o.location,
  o.content,
  o.status,
  s.hullNumber,
  s.name as shipName,
  p.code as projectCode
FROM observations o
JOIN ships s ON o.shipId = s.id
JOIN projects p ON s.projectId = p.id
ORDER BY o.createdAt DESC
LIMIT 50;
```

### NCR 相关查询

```sql
-- 查看所有 NCR
SELECT * FROM ncrs ORDER BY createdAt DESC;

-- 按状态统计 NCR
SELECT status, COUNT(*) as count FROM ncrs GROUP BY status;

-- 查看特定船舶的 NCR
SELECT * FROM ncrs WHERE shipId = 'ship-id-here';
```

### 检验相关查询

```sql
-- 查看检验轮次
SELECT * FROM inspection_rounds;

-- 查看检验项
SELECT * FROM inspection_items;

-- 查看特定检验的所有检验项
SELECT * FROM inspection_items WHERE roundId = 'round-id-here';

-- 统计检验项状态
SELECT status, COUNT(*) as count FROM inspection_items GROUP BY status;
```

### 数据统计查询

```sql
-- 系统概览统计
SELECT 
  (SELECT COUNT(*) FROM users) as total_users,
  (SELECT COUNT(*) FROM projects) as total_projects,
  (SELECT COUNT(*) FROM ships) as total_ships,
  (SELECT COUNT(*) FROM observations) as total_observations,
  (SELECT COUNT(*) FROM ncrs) as total_ncrs;

-- 项目活跃度统计
SELECT 
  p.code,
  p.name,
  COUNT(DISTINCT s.id) as ships,
  COUNT(DISTINCT o.id) as observations,
  COUNT(DISTINCT n.id) as ncrs
FROM projects p
LEFT JOIN ships s ON p.id = s.projectId
LEFT JOIN observations o ON s.id = o.shipId
LEFT JOIN ncrs n ON s.id = n.shipId
GROUP BY p.id;
```

### 数据修改示例

```sql
-- 更新意见状态
UPDATE observations SET status = 'Closed' WHERE id = 'observation-id-here';

-- 批量更新意见状态
UPDATE observations SET status = 'Closed' WHERE shipId = 'ship-id-here' AND status = 'Open';

-- 删除特定记录（谨慎使用）
DELETE FROM comments WHERE id = 'comment-id-here';

-- 更新用户角色
UPDATE users SET role = 'admin' WHERE username = 'someuser';
```

---

## 注意事项

### 安全性
1. **保护口令**：SQL_CONSOLE_SECRET 是系统的最高权限凭证，请妥善保管
2. **谨慎操作**：SQL Console 可以执行任意 SQL 语句，包括删除数据
3. **定期备份**：在执行重要操作前，建议先导出数据库备份

### 数据操作
1. **使用事务**：对于批量修改操作，建议使用事务确保数据一致性
2. **测试查询**：在生产环境执行修改操作前，先用 SELECT 验证条件
3. **限制结果**：查询大表时使用 LIMIT 限制返回行数，避免浏览器卡顿

### 导入导出
1. **文件格式**：导入文件必须是通过系统导出的 JSON 格式
2. **数据完整性**：导入前确认文件完整，避免数据损坏
3. **环境隔离**：不要将生产环境数据导入测试环境，反之亦然

### 性能优化
1. **索引使用**：查询时尽量使用索引字段（如 id、projectId、shipId）
2. **避免全表扫描**：大表查询时添加 WHERE 条件
3. **分页查询**：使用 LIMIT 和 OFFSET 进行分页

### 常见问题

**Q: 忘记了 SQL_CONSOLE_SECRET 怎么办？**
A: 联系系统管理员或查看服务器环境变量配置

**Q: 导入数据库失败怎么办？**
A: 检查 JSON 文件格式是否正确，确认文件没有损坏

**Q: 如何恢复误删除的数据？**
A: 如果有备份，使用导入功能恢复；否则数据无法恢复

**Q: 查询结果显示不全怎么办？**
A: 表格列宽有限制，鼠标悬停可查看完整内容；或导出数据后在外部工具查看

**Q: 可以执行多条 SQL 语句吗？**
A: 目前每次只能执行一条语句，多条语句需要分别执行

---

## 技术说明

### 数据库类型
- 使用 Cloudflare D1（基于 SQLite）
- 支持标准 SQL 语法

### API 端点
- 执行 SQL：`POST /api/sql/execute`
- 导出数据库：`GET /api/sql/export-db`
- 导入数据库：`POST /api/sql/import-db`
- 导出项目：`GET /api/sql/export-project/:projectId`
- 导入项目：`POST /api/sql/import-project`
- 删除项目：`DELETE /api/sql/delete-project/:projectId`

### 权限验证
所有 API 请求都需要在 Header 中携带：
```
X-SQL-Secret: {SQL_CONSOLE_SECRET}
```

---

## 更新日志

### v1.0.0
- 初始版本
- 支持 SQL 查询执行
- 支持数据库导入导出
- 支持项目数据管理
- 支持项目删除功能

---

**文档版本**：v1.0.0  
**最后更新**：2026-04-12  
**维护者**：NBINS 开发团队
