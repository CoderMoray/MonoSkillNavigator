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
npm install
npm run review:demo
npm run dev:api
```

另开终端注册并登录用户，复制返回的 token：

```bash
curl -X POST http://127.0.0.1:3000/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"alice\",\"password\":\"password123\"}"
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

PostgreSQL schema 会在首次访问时自动初始化。启用 MinIO 后，发布 Skill 时会把 Skill zip artifact 写入 MinIO，注册表元数据中保留 artifact descriptor；下载和 Worker 重审会优先从 MinIO 读取 zip 并解包成 snapshot 做审查。
用户数据会跟随 `REGISTRY_STORE` 选择存储后端：本地模式写入 `.data/users.json`，PostgreSQL 模式写入 `auth_state` 表。

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
- `GET /skills/:name`
- `POST /skills/:name/contributors`
- `POST /skills/:name/issues`
- `GET /skills/:name/issues`
- `POST /skills/:name/ratings`
- `GET /skills/:name/versions/:version`
- `GET /skills/:name/versions/:version/download`，返回 `application/zip`

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
