# 开发路线图

本文档汇总平台后续改进方向。与 `AGENTS.md`（开发约定）、`README.md`（快速上手）分工如下：


| 文档                         | 职责                                 |
| -------------------------- | ---------------------------------- |
| `README.md`                | 安装、启动、常用命令、贡献入口                    |
| `AGENTS.md`                | Monorepo 结构、架构约定、修改检查清单            |
| `docs/roadmap.md`          | 功能规划、阶段目标、已知隐患（本文档）                |
| `docs/rules/skill-spec.md` | Skill 包格式规范（参考 ClawHub / SkillHub） |


---

## 基础设施


| 组件            | 当前                                           | 目标                                   |
| ------------- | -------------------------------------------- | ------------------------------------ |
| 数据库           | PostgreSQL 16（Docker）                        | 维持；生产可换云数据库                          |
| 对象存储          | MinIO（Docker）                                | 未来切阿里云 OSS                           |
| 注册表           | 本地 JSON / PostgreSQL                         | 维持两套，JSON 供本地开发                      |
| ORM / 迁移      | 手写 SQL 嵌在 `packages/storage`                 | 引入 Drizzle ORM，拆分 schema + 自动生成迁移    |
| PostgreSQL 脚本 | 无独立关联/种子脚本                                   | 补充 schema 迁移脚本、关联数据脚本、可重复初始化         |
| 测试            | Vitest（`skill-spec.test.ts`、`smoke.test.ts`） | 扩展 lint/test 流水线；核心流程 + 错误分支 + PG 专项 |
| 前端结构          | 单文件大页面（如详情页）                                 | 按功能拆组件，提升可维护性                        |
| 文档            | `README` 与 `AGENTS.md` 有重叠                   | 整合分工：README 面向用户，AGENTS 面向 Agent/贡献者 |


---



## 近期已完成

- [x] Skill 格式规范初版（ClawHub 参考：`SKILL.md` / `skill.md` / `skills.md`，scoped slug）
- [x] Web 发布：zip 拖拽上传、frontmatter 自动填表、preview API
- [x] Web 发布：先上传 zip 再展示 metadata 表单
- [x] Web 详情：Skill 版本 zip 下载
- [x] Web/API：Skill 下架（unpublish）与永久删除（delete）
- [x] 下架 Skill 对非 owner 隐藏（广场/搜索/下载）
- [x] 详情页 Issue / Rating / Contributor modal 入口（API 已接通）
- [x] `tests/skill-spec.test.ts`：slug、入口文件、frontmatter、zip 解析
- [x] 基础 CLI（review / publish / search / install / download）

---



## Phase 1：规范、发布与 Web 体验

**目标**：用户通过浏览器完成常见操作，发布路径清晰、格式统一。

### 1.1 Skill 格式规范

- [x] 确定入口文件与 frontmatter 必填项（参考 ClawHub / SkillHub）
- [ ] 与 ClawHub CLI / SkillHub 差异文档化（平台字段、审查字段、runtime 块）
- [ ] Skill 详情页：安装 prompt（供 AI Agent 阅读的 install / usage 块）
- [ ] 支持「未发布 / draft」版本状态（发布前仅 owner 可见，不进入广场）



### 1.2 Web 发布流程

- [x] 拖拽上传 zip
- [x] 上传后解析 frontmatter 并填表
- [ ] 文件夹直接上传（`webkitdirectory` / File System Access，不必先打 zip）
- [ ] 上传进度条（大文件 / 慢网络）
- [ ] 发布历史（当前用户近期发布、失败原因、重试入口）
- [ ] 发布页实时审查反馈（上传后展示 compliance / security findings 摘要）



### 1.3 版本与生命周期

- [x] Skill 级下架与删除
- [ ] 单版本删除（yank / 删版，保留 audit 记录）
- [ ] 历史版本展示增强（semver 排序、tag 指向、changelog 对比）
- [ ] 发布策略：`rejected` 版本阻断同 semver 再发布
- [ ] 发布新版本自动重新上架



### 1.4 详情页与社区操作

- [x] Issue / Rating / Contributor API 与详情页 modal 入口
- [x] 强化登录门禁：**所有会修改状态的操作**均需登录（发布、评分、Issue、Contributor、下架、删除等统一策略）
- [ ] Contributor / Issue / Rating 独立管理页或侧栏入口（列表、筛选、状态变更）
- [ ] 质量报告外链：审查/评估结果提供可分享链接或跳转 HaluCatch / 外部报告页
- [x] Skill 详情页展示审查报告、评分、版本历史（基础能力已有，待增强交互）



### 1.5 展示与搜索

- [ ] Skill 产物 / 效果展示 Tab（可选上传 demo 截图、示例输出；不影响发布，有则展示）
- [ ] 搜索：名称 / slug 精确匹配 + tag 过滤 + 切词 / 语义匹配（向量或全文索引）
- [ ] 搜索支持多维度筛选（评分、发布时间、审查状态）
- [ ] 排行榜：移除或替换「综合分」；按 functional / compliance / 单项维度排序
- [ ] 排行榜交互（切换排序维度、分页）
- [ ] Keynote / 设计稿（`.docx`）中的前端视觉修改落地



### 1.6 前端工程化

- [ ] 主题切换器 UI（Light / Dark / System，CSS 已有，缺组件）
- [ ] 响应式移动端适配
- [ ] Welcome 开场动画（Arc 浏览器风格，低优先级）
- [ ] 用户中心（我的 Skill、我的评分、token 管理）

---



## Phase 2：审查、评估与质量报告

**目标**：静态合规 + 外部质量评估分层清晰，结果可解释、可对比。

审查分两段：

1. **平台静态检查**（合规、格式、隐私、安全）— 本地 `review-engine` + 可选外部扫描
2. **HaluCatch 质量检查**（功能性 / 幻觉类）— 当前发布同步执行静态五维检查，后续迁入异步 Worker



### 2.1 审查流水线

- [ ] 整合静态检查入口：安全审查、格式校验、隐私合规统一报告
- [ ] VirusTotal 或 Skill Vetter 类工具：对 Skill 包做额外静态 / 恶意特征扫描
- [ ] Worker 改造为队列式异步审查（发布后后台重审、状态流转：pending → reviewing → published / needs-review / rejected）
- [ ] 完善用户创建引导（首次发布 checklist、常见 finding 说明、修复建议链接）



### 2.2 HaluCatch 接入

- [x] 调用内置 HaluCatch Python 静态扫描器，对发布快照执行五维可靠性检查（不执行 Skill 脚本）
- [x] `packages/evaluator` 的 `halucatch-adapter` 从占位实现为真实调用，并写入统一评估报告
- [ ] 评估输出与 `docs/rules/review-rubric.md` 对齐（trace、通过率、judge 解释）



### 2.3 质量可视化

- [ ] 审查 / 评估维度雷达图：**当前 Skill vs 平台均值**（compliance、security、privacy、functional 等）
- [ ] 详情页与审查中心统一展示组件

---



## Phase 3：Creator / Profile 与发布策略

**目标**：支持用户主页、组织与可信标识。

- [ ] 补充 creator / profile 后端模型（用户主页、公开链接）
- [ ] 组织（org）与成员关系
- [ ] 认证标识（verified publisher、org badge）
- [ ] Admin 角色：override rejected、强制 yank、恢复下架
- [ ] 加强发布策略：rejected 版本阻断发布、admin override、版本 yanking（与 1.3 联动）

---



## Phase 4：MCP Server — AI 交互

格式：JSON-RPC over stdio，AI Agent 直接调用标准 MCP 协议。

### 4.1 只读能力（优先）

- [ ] `skill_search` — 关键词 / tag / slug 搜索
- [ ] `skill_info` — 详情、版本、审查报告
- [ ] `skill_leaderboard` — 排行榜
- [ ] `skill_download` — 下载 zip



### 4.2 写入能力（后续）

- [ ] `skill_publish` — 上传并发布 Skill
- [ ] `skill_review` — 获取审查结果
- [ ] `skill_rate` — 评分
- [ ] `skill_issue` — 提交 Issue

AI 可通过 MCP 协议让 Agent 自主发现、评估和安装 Skill，无需人工介入。

> **隐患**：尚不清楚 AI Agent 如何管理本地 Skill 开发目录（Cursor rules / `.cursor/skills` vs 平台 install 路径）。需在 MCP `skill_install` 设计前明确约定。

---



## Phase 5：CLI 与 CI

- [x] 基础 CLI（review / publish / search / install / download）
- [ ] 本地 Skill 目录/zip 的校验、打包增强
- [ ] 审查报告本地预览
- [ ] CI/CD 集成（GitHub Actions：publish on tag、review on PR）
- [ ] 与 ClawHub CLI 能力对齐说明

---



## Phase 6：测试与质量保障

- [x] Vitest 基础：`skill-spec.test.ts`
- [x] 冒烟：`smoke.test.ts`
- [ ] 梳理并文档化现有 tests 覆盖范围
- [ ] CI 接入 `npm run typecheck` + Vitest + lint
- [ ] 核心流程测试（注册→登录→发布→搜索→下载→审查）
- [ ] 错误分支：重复注册、过期 token、不存在 slug、未登录 mutating 操作
- [ ] PostgreSQL 专项：大量数据搜索、并发发布、下架/删除级联

---



## 架构

```
┌──────────────────────────────────────────┐
│                  用户                     │
│   Web UI ──── MCP Agent ──── CLI         │
└─────────────┬───────────┬────────────────┘
              │           │
       HTTP   │    JSON-RPC (stdio)
              ▼           ▼
┌──────────────────────────────────────────┐
│              API (Fastify)               │
│   /skills  /auth  /reviews  /publish     │
└────────────┬────────────┬────────────────┘
             │            │
    ┌────────▼──┐   ┌────▼──────────┐     ┌─────────────┐
    │PostgreSQL │   │ MinIO → OSS   │     │   Worker    │
    │ (元数据)   │   │  (zip 包)     │     │ 异步审查队列 │
    └───────────┘   └───────────────┘     └──────┬──────┘
                                                  │
                                    review-engine │ HaluCatch / VT
```

