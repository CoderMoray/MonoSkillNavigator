# 路线图

**更新日期**：2026-08-07（待办清单扩充）

本文档跟踪 Skill 管理平台的阶段目标与完成情况。详细架构见 [architecture.md](./architecture.md)，进度见 [progress-summary.md](./progress-summary.md)。

---

## 阶段总览


| 阶段        | 主题                          | 状态     |
| --------- | --------------------------- | ------ |
| Phase 0   | 核心规范与静态审查                   | ✅ 完成   |
| Phase 1   | API / CLI / 注册表             | ✅ 完成   |
| Phase 1.5 | Web UI + PostgreSQL + MinIO | ✅ 完成   |
| Phase 2   | 外部扫描集成与安全增强                 | 🔄 进行中 |
| Phase 3   | 社区、治理与规模化                   | 📋 规划中 |


---

## Phase 0：核心规范与静态审查 ✅

- [x] SKILL.md 规范（`docs/rules/skill-spec.md`）
- [x] skill-spec 包：解析、校验、快照、ZIP
- [x] review-engine：平台静态规则、verdict、findings
- [x] evaluator：tests/*.json 功能性评估
- [x] Demo Skill（`examples/demo-skill/`）

---

## Phase 1：API / CLI / 注册表 ✅

- [x] Fastify API（发布、搜索、详情、下载）
- [x] Commander CLI（基础能力）
- [ ] **完善 Skill 管理平台 CLI**（命令覆盖、错误提示、与 Web 能力对齐）
- [x] Worker 批量重审
- [x] 用户注册/登录/Session
- [x] Contributor、Issue、Rating
- [x] 三维度评分结构（quality / security / reliability）
- [x] slug 不可变标识语义

---

## Phase 1.5：Web UI + 持久化 ✅

- [x] Next.js Web（端口 3001）
- [x] PostgreSQL 强制存储（Drizzle ORM + 迁移）
- [x] MinIO artifact（可选）
- [x] 首页搜索、Skill 详情、发布页
- [x] 创作者主页、榜单、审查列表
- [x] 站内文档
- [x] Skill 级 / 版本级 unpublish
- [x] 回收站（软删除 + 定时 purge）
- [x] 书签
- [x] 发布 metadata 合并与 loose frontmatter（Web 自动补全 description 等）
- [ ] 更新网页Docs
- [ ] **版本可见性与下载策略**
  - 未通过审查的新版本：公开搜索不可见；创作者个人中心可见
  - 默认下载指向「最新通过审查」的版本，而非最新上传版本
- [ ] **Skill 详情页操作区调整**
  - 右侧去掉独立下载按钮；改为「发布新版本 / 删除 / 下架」
  - 版本列表：Release 标签对齐；Download 按钮对齐；「下架」置于左侧
  - 下载旁增加「复制 prompt」按钮（参考产品示例）
- [ ] **VirusTotal Report 展示简化**
  - 顶部统计并展示参与扫描的总厂家数量
  - 描述中列出各 AV 厂家名称；同一风险等级合并到同一展示框
- [ ] **审查列表导出**
  - 支持全选（含尚未分页加载的条目）
  - 导出前二次确认：展示选中数量，确认 / 取消
  - 明确导出形态：本地下载 vs 邮件发送（需产品确认后实现）
- [ ] **回收站 UX**
  - 「立即删除」二次确认由弹窗改为居中 Toast
- [ ] **站内文档**
  - 「HaluCatch 审查」更名为「质量审查」

---

## Phase 2：外部扫描集成与安全增强 🔄

### 2.1 安全扫描 ✅（静态 AV 已完成）

- [x] SkillSpector Python 集成（并行扫描、findings 解析、summary 持久化）
- [x] **VirusTotal 静态 AV 扫描**
  - [x] SHA256 hash lookup
  - [x] 可选 upload-on-miss + poll + file re-fetch
  - [x] per-engine malicious/suspicious findings
  - [x] `threat_verdict` 解析与 Web 展示
  - [x] 与 SkillSpector 并行，不阻塞审查流水线
- [ ] CI 发布烟雾测试 + VT 超时策略
- [ ] **VirusTotal API 逐步 timeout + retry**
  - 梳理 hash lookup / upload / poll / re-fetch 各步骤
  - 每步独立 timeout（约十几秒），超时 retry 一次
  - 仍失败则记录原因并写入 review summary
- [ ] **审查拒绝规则（文档 + 实现）**
  - SkillSpector：`high` 一律拒绝；`medium` 且置信度 > 90% 拒绝
  - VirusTotal：`high`（malicious）一律拒绝
  - 同步更新 `docs/rules/` 与 Web 站内文档

### 2.2 可靠性评估 ✅

- [x] HaluCatch 五维静态评估
- [x] HaluCatch report JSON 持久化
- [x] Web HaluCatch 雷达图与详情页
- [x] tests/*.json 回退路径

### 2.3 评分与裁决 🔄

- [x] Verdict 基于 findings severity
- [x] finding confidence 字段

### 2.4 合规与许可证 🔄

- [x] license-compliance 单元测试

---

## Phase 3：社区、治理与规模化 📋

### 3.1 认证与授权

- [ ] **账号权限隔离**：管理者 vs 普通用户（RBAC 首期）
- [ ] **账号与邮箱绑定**（注册、找回、通知基线）
- [ ] JWT / OAuth 登录

### 3.1.1 Contributor 与邮件（当前迭代）

- [ ] Contributor 模型精简：**仅保留 owner 与 contributor**（移除其他角色）
- [ ] 邀请 contributor 发送邮件；**被邀请人接受后**才生效
- [ ] 填写 contributor 时：**用户名实时检索下拉**，可点选正确账号
- [ ] **阿里云邮箱**接入：本地/测试环境验证发信
- [ ] **发布成功通知**：向发布者发送确认邮件

### 3.2 分发与集成

- [ ] PyPI注册

---

## 基础设施清单


| 组件     | 选型                 | 状态   |
| ------ | ------------------ | ---- |
| 语言     | TypeScript (ESM)   | ✅    |
| API    | Fastify            | ✅    |
| Web    | Next.js            | ✅    |
| CLI    | Commander          | ✅    |
| 数据库    | PostgreSQL         | ✅ 强制 |
| ORM    | Drizzle            | ✅    |
| 对象存储   | MinIO              | ✅ 可选 |
| 迁移     | drizzle-kit + 自动执行 | ✅    |
| 安全扫描   | SkillSpector       | ✅ 可选 |
| 恶意软件扫描 | VirusTotal（静态 AV）  | ✅ 可选 |
| 可靠性    | HaluCatch          | ✅ 可选 |


---

## 待办工作（当前迭代）

按优先级与依赖关系排列，详细说明见上文各 Phase 小节。

### P0 — 阻塞 / 稳定性

- [ ] **API 启动失败排查**：`Failed running 'src/server.ts'. Waiting for file changes before restarting...`，定位根因并修复

### P1 — 审查与安全

- [ ] VirusTotal API 分步 timeout + retry
- [ ] SkillSpector / VirusTotal 拒绝规则（实现 + 文档）
- [ ] 未过审版本可见性 & 默认下载最新过审版本

### P2 — Web UX

- [ ] 更新网页Docs
- [ ] Skill 详情操作区（发布新版本 / 删除 / 下架 / 复制 prompt）
- [ ] 版本列表布局对齐（Release 标签、Download、下架位置）
- [ ] VirusTotal Report 简化（厂家总数、按等级分框、厂家名称）
- [ ] 审查列表全选导出 + 二次确认 + 确认导出交付方式
- [ ] 回收站立即删除 → 居中 Toast
- [ ] 文档「HaluCatch 审查」→「质量审查」

### P3 — CLI & 账号

- [ ] 完善 Skill 管理平台 CLI
- [ ] 管理者 / 普通用户权限隔离
- [ ] 账号邮箱绑定
- [ ] Contributor 邀请邮件 + 接受后生效 + 用户名下拉检索
- [ ] 阿里云邮箱 + 发布成功通知

---

## 下一步建议（优先级）

1. **P0**：修复 API `server.ts` 启动报错
2. **P1**：VT timeout/retry、审查拒绝规则、版本可见性策略
3. **P2**：Skill 详情与 VT Report UI、审查列表导出
4. **P3**：CLI 完善、RBAC、邮箱与 Contributor 邀请流

---

## 参考

- [architecture.md](./architecture.md) — 架构与数据流
- [progress-summary.md](./progress-summary.md) — 详细进度
- [AGENTS.md](../AGENTS.md) — 开发约定
- [docs/rules/](./rules/) — Skill 规范与审查规则

