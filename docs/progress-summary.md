# Skill 管理平台阶段进度总结

更新日期：2026-07-13

## 当前完成情况

项目已完成从核心后端能力到 Web 可视化的初版闭环，当前具备 Skill 的创建规范、审查、评分、上传、下载、分发、版本管理、用户管理和基础社区协作能力。

### 1. 核心架构

- 已搭建 TypeScript monorepo，包含 `apps/api`、`apps/cli`、`apps/worker`、`apps/web` 和多个共享包。
- 后端 API 使用 Fastify，CLI 使用 Commander，Web 使用 Next.js App Router。
- 共享包包括 Skill 解析规范、审查引擎、功能评估、存储层等。

### 2. Skill 生命周期

- 支持读取 Skill 文件夹或 zip 包，并生成统一的 `SkillSnapshot`。
- 支持发布、搜索、详情查看、版本查看、下载和安装。
- 当前上传支持文件夹或 `.zip` 包；下载统一返回 `.zip` 包。
- 发布后会自动执行静态审查和功能性评估。

### 3. 审查与评分

- 已实现格式合规、泄露风险、隐私风险、安全风险和功能性评分。
- 支持基于 `tests/*.json` 的功能性任务集评估。
- Web 中已提供审查中心、详情页审查报告、评分条和风险 finding 展示。

### 4. 用户与权限

- 已支持用户注册、登录、登出、当前用户查询和修改密码。
- 密码使用 `scrypt` 哈希，登录使用 session token。
- `publish` 已强制登录。
- 新发布的 Skill 会绑定当前用户为 owner。
- 已支持为 Skill 添加多个 contributor，共同维护同一个 Skill。

### 5. 存储能力

- 默认支持本地 JSON 存储。
- 已接入 PostgreSQL 作为注册表和用户数据存储。
- 已接入 MinIO 作为 Skill artifact 对象存储。
- MinIO 当前保存 zip artifact，同时保留旧 JSON artifact 的读取兼容。

### 6. Web 可视化

- Web 已参考 ClawHub 风格调整为 marketplace 形态。
- 已实现顶部导航、Skills 市场、Creators 页面、Creator Profile 页面、个人 Profile 页面、榜单和审查中心。
- 用户菜单已支持个人资料、修改密码、添加 Skill、登出和主题切换。
- 已支持系统主题、浅色主题、深色主题三种页面主题。
- 添加 Skill 页面支持上传 zip 包并展示发布后的审查结果。

### 7. CLI 能力

- 支持本地 review、evaluate、publish、search、top、info、download、install、rate、issue、contributor 等命令。
- `publish` 支持目录或 zip 包。
- `download` 可下载 zip 包。
- `install` 会下载 zip 并解包安装。
- CLI 支持通过 `--token` 或 `SKILL_AUTH_TOKEN` 进行登录态发布和 contributor 操作。

## 已验证内容

目前已多次通过以下验证：

- `npm run typecheck`
- `npm run build:web`
- Auth API 冒烟测试
- zip publish / download API 冒烟测试
- CLI zip review 冒烟测试

## 当前限制与风险

- Web 端当前只支持上传 `.zip` 包；文件夹发布目前通过 CLI 完成。
- Creator 数据目前由 Skill contributor 聚合得到，还没有独立的 creator/profile 后端表。
- Issue、rating、contributor 等协作能力已有 API 和展示，但还可以继续补充更完整的 Web 表单操作。
- 审查引擎目前以静态规则为主，后续可接入更真实的 HaluCatch 或外部评估服务。
- 发布后状态会被记录，但是否阻断 rejected / needs-review 版本还可以继续做策略细化。

## 下一步建议

1. 完善 Web 端发布流程，支持拖拽上传、发布历史和上传进度。
2. 补充 creator/profile 后端模型，支持用户主页、组织、认证标识和公开链接。
3. 增加 Web 端 contributor、issue、rating 操作入口。
4. 加强发布策略，例如 rejected 版本阻断发布、admin override、版本 yanking。
5. 将 Worker 改造成队列式异步审查，支持发布后后台重审和状态流转。
