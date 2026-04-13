# User Title Feature

## 功能说明
在用户管理中添加了Title（职位/头衔）字段，用于记录用户的职位信息。

## 数据库变更
- 在 `users` 表中添加了 `title` 字段（TEXT类型，可为空）

## API变更
- `POST /api/users` - 创建用户时可以传入 `title` 字段
- `PUT /api/users/:id` - 更新用户时可以传入 `title` 字段
- `GET /api/users` 和 `GET /api/users/:id` - 返回数据中包含 `title` 字段

## 前端变更
- Admin Console的Users页面：
  - 在表格中添加了"Title"列，显示在Role和Disciplines之间
  - 在Edit User窗口中添加了Title输入框，位于Role字段下方
  - 支持创建和编辑用户时设置Title

## 数据库迁移
已创建迁移脚本：
- `packages/api/scripts/add-title-column.sql` - SQL迁移文件
- `packages/api/scripts/migrate-add-title.mjs` - Node.js迁移脚本

执行迁移：
```bash
cd packages/api
npx wrangler d1 execute DB --local --file=scripts/add-title-column.sql
```

## 测试步骤
1. 启动服务：`pnpm dev:api` 和 `pnpm dev:web`
2. 访问 http://localhost:5173/admin
3. 点击Users标签
4. 点击任意用户的Edit按钮
5. 在Title字段中输入职位信息（如"Senior Inspector"）
6. 点击Save
7. 确认Users列表中显示了Title信息

## 文件变更列表
- `packages/api/src/db/d1-bootstrap.sql` - 添加title列定义
- `packages/api/src/db/schema.ts` - 添加title字段到schema
- `packages/api/src/persistence/records.ts` - 添加title到UserRecord接口
- `packages/api/src/routes/users.ts` - 更新用户创建和更新接口
- `packages/web/src/api.ts` - 更新前端UserRecord接口和API函数
- `packages/web/src/pages/Admin.tsx` - 添加Title列和输入框
- `packages/api/scripts/add-title-column.sql` - 数据库迁移SQL
- `packages/api/scripts/migrate-add-title.mjs` - 数据库迁移脚本
