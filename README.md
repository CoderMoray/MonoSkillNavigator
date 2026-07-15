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
npm install              # 安装依赖（首次需要）
npm run dev:api          # 终端1：启动 API（端口 3000）
npm run dev:web          # 终端2：启动 Web 前端（端口 3001）
npm run setup            # 终端3：注册测试用户 + 发布 Demo Skill
```

然后打开 `http://127.0.0.1:3001`，用 `alice / password123` 登录。

Web 支持热更新；API 使用一次性 `tsx` 进程，修改 API 或共享后端包后需要重启 `npm run dev:api`。

## 测试

```bash
npm run test           # 运行 8 个 API 烟雾测试（注册/登录/发布/搜索/详情/排行/下载）
npm run test:watch     # watch 模式，改代码自动重跑
```

发布、下载和安装：

```bash
set SKILL_AUTH_TOKEN=<token>
npm run skill -- publish examples/demo-skill
npm run skill -- publish examples/demo-skill.zip
npm run skill -- search demo
npm run skill -- top --sort functional
npm run skill -- info demo-skill
npm run skill -- download demo-skill demo-skill.zip
npm run skill -- rate demo-skill --user alice --score 5 --comment "Useful and safe"
npm run skill -- issue demo-skill --title "Add more examples" --type docs --created-by alice
npm run skill -- contributor demo-skill --person bob --role reviewer
npm run skill -- install demo-skill installed/demo-skill
```

启动 Web 可视化：

```bash
npm run dev:api
npm run dev:web
```

Web 默认运行在 `http://127.0.0.1:3001`，并读取 `NEXT_PUBLIC_API_URL`，默认 API 为 `http://127.0.0.1:3000`。
用户管理入口位于 `/login`、`/register` 和 `/account`，登录 token 会保存在浏览器 localStorage 中。

## PostgreSQL + MinIO

本地启动基础设施：

```bash
npm run infra:up
```

复制环境变量示例：

```bash
cp .env.example .env
```

将 `.env` 中的配置切换为：

```bash
REGISTRY_STORE=postgres
POSTGRES_PORT=15432
DATABASE_URL=postgres://skill_platform:skill_platform@127.0.0.1:15432/skill_platform
MINIO_ENABLED=true
MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=skill_platform
MINIO_SECRET_KEY=skill_platform_secret
MINIO_BUCKET=skill-artifacts
```

然后重新启动 API/Worker：

```bash
npm run dev:api
npm run dev:worker
```

PostgreSQL schema 会在首次访问时自动初始化。Skill 注册表已拆分为 `skills`、`skill_versions`、`skill_version_files`、`skill_reviews`、`skill_review_findings`、`skill_evaluations`、`skill_contributors`、`skill_issues` 和 `skill_ratings` 等关系表；用户认证拆分为 `platform_users` 与 `auth_sessions`。这使 Skill、版本、审查评分、贡献者、Issue、评分、用户和会话都可以直接通过 SQL 查询与建立索引。

已有的 `registry_skills.document` 和 `auth_state.document` JSONB 数据会在首次使用新版存储层时自动迁移一次，迁移状态记录在 `platform_schema_migrations`。旧 JSONB 表会保留为只读迁移备份，新代码不会再读取或写入它们。启用 MinIO 后，发布 Skill 时会把 Skill zip artifact 写入 MinIO；下载和 Worker 重审会优先从 MinIO 读取 zip 并解包成 snapshot 做审查。

`skills.slug` 是 Skill 的稳定唯一标识，`skills.name` 是展示名称。可直接查询最近发布的版本及审查分数：

```sql
select s.slug, s.name, v.version, v.status, r.overall_score, v.downloads
from skills s
join skill_versions v on v.skill_slug = s.slug and v.version = s.latest_version
join skill_reviews r on r.skill_slug = v.skill_slug and r.version = v.version
order by s.updated_at desc;
```

PostgreSQL 容器内部仍使用 `5432`，宿主机默认映射到 `15432`，用于避开本机 PostgreSQL 或 Windows 保留端口冲突。如需修改，调整 `.env` 中的 `POSTGRES_PORT` 和 `DATABASE_URL`。

MinIO 控制台默认地址：`http://127.0.0.1:9001`。

## 目录

- `docs/architecture.md`：架构设计。
- `docs/rules/skill-spec.md`：Skill 包规范。
- `docs/rules/review-rubric.md`：审查与评分规则。
- `packages/skill-spec`：Skill 解析、校验、快照、安装。
- `packages/evaluator`：功能性任务集评估与 HaluCatch 适配入口。
- `packages/review-engine`：审查规则引擎。
- `packages/storage`：注册表存储，支持本地 JSON、PostgreSQL 和 MinIO artifact。
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
