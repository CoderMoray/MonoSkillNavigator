# Skill 管理平台

## 项目概述

这是一个 TypeScript npm workspaces monorepo，用于发布、审查、评估、分发和管理 Agent Skill。

- Skill 包以 `SKILL.md` 为入口，可从文件夹或 `.zip` 读取。
- `slug` 是 Skill 不可变的唯一标识，用于数据库主键、API/CLI 参数、URL 和 MinIO 对象路径。
- `name` 是可变的展示名称；不要将其作为查找键、外键或路由参数。
- 审查覆盖合规、泄露、隐私、安全和轻量功能性评估；平台不会执行 Skill 内的脚本。

## 仓库结构

```text
apps/
  api/       Fastify HTTP API
  cli/       Commander CLI
  worker/    批量重审/评估 Worker
  web/       Next.js Web UI（端口 3001）
packages/
  skill-spec/     SKILL.md 解析、校验、快照与 ZIP
  review-engine/  静态风险审查与评分
  evaluator/      tests/*.json 功能性评估
  storage/        File/PostgreSQL 注册表、认证与 MinIO artifact
docs/
  rules/          Skill 规范与审查规则
examples/
  demo-skill/     可用于本地验证的 Skill
```

## 关键架构约定

- 所有包均使用 ESM、严格 TypeScript；共享包通过 `@skill-platform/*` 路径别名导入。
- API 是应用和 Web 的唯一数据入口；Web 不直接访问 PostgreSQL 或 MinIO。
- PostgreSQL 使用关系表存储 Skill、版本、审查、评估、贡献者、Issue、评分、用户和会话。
- `registry_skills` 与 `auth_state` JSONB 表仅是历史迁移备份；新代码不得再读写它们。
- 数据库迁移由 `packages/storage` 中的 schema 初始化逻辑管理，并记录到 `platform_schema_migrations`。
- 发布与下载 artifact 使用 ZIP；开启 MinIO 时，artifact descriptor 存在 PostgreSQL，包文件存在 MinIO。
- API 合同或存储类型变更时，同步检查 `apps/api`、`apps/cli`、`apps/web/lib/types.ts` 和 `apps/web/lib/api.ts`。

## 常用命令

```bash
# 安装与基础校验
npm install
npm run typecheck
npm run review:demo

# 基础设施（PostgreSQL + MinIO）
npm run infra:up
npm run infra:down

# 本地服务（分别在独立终端运行）
npm run dev:api
npm run dev:web
npm run dev:worker

# Web 生产构建
npm run build:web

# CLI 示例
npm run skill -- review examples/demo-skill
npm run skill -- publish examples/demo-skill --token <token>
npm run skill -- search demo
npm run skill -- info demo-skill
npm run skill -- install demo-skill installed/demo-skill
```

`apps/api` 的 `dev` 脚本使用一次性 `tsx`，不是 watch 模式。修改 API 或共享后端包后，必须重启 `npm run dev:api`；存储 schema 修改后尤其如此。

## 配置与本地运行

1. 从 `.env.example` 创建 `.env`。
2. 使用 PostgreSQL 时设置 `REGISTRY_STORE=postgres` 和 `DATABASE_URL`。
3. 启用对象存储时设置 `MINIO_ENABLED=true`；本地默认端口为 MinIO `9000/9001`、PostgreSQL 宿主机 `15432`。
4. Web 通过 `NEXT_PUBLIC_API_URL` 访问 API，默认 `http://127.0.0.1:3000`。

## 开发与验证要求

- 修改 `SKILL.md` 规范时，同时更新 `docs/rules/skill-spec.md`、示例包和必要的审查逻辑。
- 新发布的 Skill 必须提供显式 `slug`；旧 kebab-case `name` 仅作为兼容回退。
- 新建或修改数据库字段时，提供可重复执行、事务安全的迁移，并验证现有 PostgreSQL 数据。
- 修改 API 路由、响应或标识语义后，更新 CLI、Web 路由和 README。
- 完成 TypeScript 改动后至少运行 `npm run typecheck`；修改 Web 后再运行 `npm run build:web`。
- 不要提交 `.env`、凭证、token、数据库备份或 MinIO 导出文件。
