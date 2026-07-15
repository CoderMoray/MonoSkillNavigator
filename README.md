# Skill 管理平台

可信 Skill 注册、审查、评分和分发平台。一期优先交付 API、CLI、Worker、规则文档和静态审查引擎。

## 当前能力

- 读取本地 Skill 目录或 zip 包并生成内容快照。
- 校验 `SKILL.md` frontmatter 和目录结构。
- 执行合规性、泄露风险、隐私风险、安全风险和轻量功能性评分。
- 基于 `tests/*.json` 运行功能性任务集评估，并保留 HaluCatch 适配入口。
- 登录后发布 Skill 到本地注册表，上传内容会绑定发布用户。
- 搜索、查看、下载 zip 包和安装 Skill。
- contributor、issue、rating、榜单等社区协作能力，支持多个 contributor 共同维护同一个 Skill。
- 用户注册、登录、登出、当前用户查询和密码修改。
- Worker 支持重跑注册表审查。
- 可选 PostgreSQL 注册表存储和 MinIO Skill artifact 对象存储。

## 快速开始

```bash
npm install              # 安装依赖（首次）
cp .env.example .env     # 配置环境变量
npm run dev              # 同时启动 API（3000）+ Web（3001），前后端均热重载
npm run setup            # 注册测试用户 + 发布 Demo Skill
```

然后打开 `http://127.0.0.1:3001`，用 `alice / password123` 登录。

## 数据库

项目强制使用 PostgreSQL，表结构通过 Drizzle ORM 管理。

```bash
# 本机启动（需先安装 PostgreSQL 并创建 skill_platform 库）
createdb skill_platform

# 或用 Docker
docker compose up -d

# 首次启动 API 会自动执行迁移建表
npm run dev:api

# 手动跑迁移
npx drizzle-kit generate   # 改 schema 后生成 SQL
npx drizzle-kit migrate    # 执行迁移
```

**表定义**：`packages/storage/src/schema/*.ts`（TypeScript，Drizzle 语法）  
**迁移 SQL**：`packages/storage/drizzle/*.sql`（自动生成，需提交 Git）  
**迁移追踪**：`_migrations` 表，已执行的迁移不会重复跑

15 张关系表：`skills`、`skill_versions`、`skill_version_tags`、`skill_version_files`、`skill_version_manifest_properties`、`skill_reviews`、`skill_review_findings`、`skill_evaluations`、`skill_evaluation_tasks`、`skill_evaluation_report_findings`、`skill_evaluation_task_findings`、`skill_contributors`、`skill_issues`、`skill_ratings`、`platform_users`、`auth_sessions`。

`skills.slug` 是稳定唯一标识，`skills.name` 是展示名称。

## 测试

```bash
npm run test           # 8 个 API 烟雾测试（注册/登录/发布/搜索/详情/排行/下载）
npm run test:watch     # watch 模式，改代码自动重跑
```

## 目录

- `docs/architecture.md`：架构设计。
- `docs/rules/skill-spec.md`：Skill 包规范。
- `docs/rules/review-rubric.md`：审查与评分规则。
- `packages/skill-spec`：Skill 解析、校验、快照、安装。
- `packages/evaluator`：功能性任务集评估与 HaluCatch 适配入口。
- `packages/review-engine`：审查规则引擎。
- `packages/storage`：注册表存储（PostgreSQL + Drizzle ORM），支持 MinIO artifact。
- `apps/api`：HTTP API。
- `apps/cli`：命令行工具。
- `apps/worker`：审查 Worker。
- `apps/web`：Web 可视化界面，展示 Skill 广场、详情、审查报告、功能评估、社区信息和榜单。

## API

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/change-password`
- `GET /skills?query=demo`
- `POST /skills/publish`，需要 `Authorization: Bearer <token>`，请求体可传 `archiveBase64`
- `POST /reviews/run`
- `POST /evaluations/run`
- `POST /reviews/rebuild`
- `GET /leaderboard?sort=functional`
- `GET /skills/:slug`
- `POST /skills/:slug/contributors`
- `POST /skills/:slug/issues`
- `GET /skills/:slug/issues`
- `POST /skills/:slug/ratings`
- `GET /skills/:slug/versions/:version`
- `GET /skills/:slug/versions/:version/download`，返回 `application/zip`

## 协作开发

```bash
# 避免不同系统/不同 npm 版本导致的文件权限污染 Git diff
git config core.fileMode false
```

提交规范：一个 commit 做一件事，message 清晰即可。

Maintainers: [@chrismoray](https://github.com/chrismoray) [@JShiu0915](https://github.com/JShiu0915)

## 后续方向

- 将 Worker 替换为 Redis/BullMQ 队列消费者。
- 接入 HaluCatch/AgentHallu 类功能性评估。
- 增加 Web 管理台、MCP Server、CI/CD 插件和多源同步。
