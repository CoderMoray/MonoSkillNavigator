# 开发路线图

## 基础设施

| 组件 | 当前 | 目标 |
|------|:---:|:---:|
| 数据库 | PostgreSQL 16（Docker） | 维持，生产可换云数据库 |
| 对象存储 | MinIO（Docker） | 未来切阿里云 OSS（改一行 `endPoint`） |
| 注册表 | 本地 JSON / PostgreSQL | 维持两套，JSON 供本地开发 |

---

## Phase 1：Web 交互完善

状态：已有基础页面（广场、详情、发布、登录注册）

**目标**：用户通过浏览器完成所有常见操作，无需命令行。

- [ ] 完善 Skill 发布流程（上传 zip + 实时审查反馈）
- [ ] Skill 详情页展示审查报告、评分、版本历史
- [ ] 搜索支持多维度筛选（评分、发布时间、审查状态）
- [ ] 排行榜交互（切换排序维度、分页）
- [ ] 用户中心（我的 Skill、我的评分、token 管理）
- [ ] Issue 和 Contributor 的可视化管理
- [ ] 主题切换器 UI（Light / Dark / System 手动切换按钮，CSS 已有，缺组件）
- [ ] 响应式适配移动端

---

## Phase 2：MCP Server - AI 交互

格式：JSON-RPC over stdio，AI Agent 直接调用标准 MCP 协议。

### 2.1 只读能力（优先）

- [ ] `skill_search` — 按关键词搜索 Skill
- [ ] `skill_info` — 获取 Skill 详情、版本、审查报告
- [ ] `skill_leaderboard` — 排行榜查询
- [ ] `skill_download` — 下载 Skill zip 包

### 2.2 写入能力（后续）

- [ ] `skill_publish` — 上传并发布 Skill
- [ ] `skill_review` — 获取审查结果
- [ ] `skill_rate` — 评分
- [ ] `skill_issue` — 提交 Issue

AI 可通过 MCP 协议让 Agent 自主发现、评估和安装 Skill，无需人工介入。

---

## Phase 3：CLI 工具（高端用户）

- [ ] 本地 Skill 目录/zip 的校验、打包
- [ ] 一键发布到注册表
- [ ] 批量搜索、下载、安装
- [ ] 审查报告本地预览
- [ ] CI/CD 集成（GitHub Actions 等）

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
│        /skills  /auth  /reviews          │
└────────────┬────────────┬────────────────┘
             │            │
    ┌────────▼──┐   ┌────▼──────────┐
    │PostgreSQL │   │  MinIO → OSS  │
    │(元数据)    │   │  (zip 包)     │
    └───────────┘   └───────────────┘
```
