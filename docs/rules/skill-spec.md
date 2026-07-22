# Skill 包规范（ClawHub 格式参考）

本平台的 Skill 包结构参考 [ClawHub Skill format](https://github.com/openclaw/clawhub/blob/main/docs/skill-format.md) 的通用约定。平台保留自己的 `slug`、`categories`、`allowed-tools` 等字段，**不要求** ClawHub/OpenClaw 专有的 `metadata.openclaw` runtime 声明。

## 目录结构

每个 Skill 是一个目录，必须包含以下入口文件之一：

- `SKILL.md`（推荐）
- `skill.md`
- `skills.md`（legacy）

```text
skill-name/
  SKILL.md
  references/
  examples/
  scripts/
  assets/
  tests/
  .clawhubignore   # 可选，发布忽略规则（legacy: .clawdhubignore）
  .gitignore       # 可选
```

## SKILL.md frontmatter

入口文件必须以 YAML frontmatter 开头：

```yaml
---
slug: demo-plugin
name: Demo Plugin
description: Short summary of what this skill does and when to use it.
version: 1.0.0
categories:
  - Developer Tools
release-tags:
  - latest
author: example-user
license: MIT-0
tags:
  - productivity
supportedAgents:
  - cursor
allowed-tools:
  - Read
---
```

### 必填字段

| 字段 | 规则 |
| --- | --- |
| `name` | 展示名称，1–128 字符。Portable Agent Skills 建议使用 1–64 位小写字母、数字、短横线。 |
| `description` | Skill 摘要，1–1024 字符。 |
| `version` | SemVer，例如 `1.0.0`。 |

### 平台字段

| 字段 | 规则 |
| --- | --- |
| `slug` | 不可变唯一标识；npm-safe 小写，支持 `@scope/skill-name`；无 slug 时可从符合规则的 `name` 推导。 |
| `categories` | Web 发布必填，至少 1 项。 |
| `release-tags` | 版本别名，例如 `latest`；首个版本必须包含 `latest`。 |
| `topics`, `author`, `license`, `tags`, `supportedAgents` | 可选。 |
| `allowed-tools`, `disallowed-tools` | 可选，平台权限模型使用。 |

Frontmatter 中的其他未知字段会通过 `.passthrough()` 保留，但平台不会校验 OpenClaw 专有 runtime 块。

## Slug 规则

- 无 scope：`demo-plugin`（小写、数字、短横线，最长 64）
- 有 scope：`@example.tools/demo-plugin`

## 版本与标签

- 同一 `slug@version` 不可变。
- 每次发布创建新版本（SemVer）。
- `latest` 等 tag 指向特定版本。

## 文件限制

- 单文件文本审查上限：1 MB。
- 整包上限：50 MB。
- 不允许路径逃逸（`../`）。
- 隐藏路径（除 `.gitignore` / `.clawhubignore`）与 `.clawhub/` CLI 元数据会被跳过。

## 权限模型

平台将 `allowed-tools` / `disallowed-tools` 解析为风险能力，并结合静态内容扫描做审查。能力越高，审查阈值越严格。

## 发布路径差异

| 路径 | 校验 |
| --- | --- |
| Web 发布（带 metadata） | `skillPublishMetadataSchema` + zip 包结构 |
| CLI / API zip-only | frontmatter + 包结构；version 必须在 manifest 中为 SemVer |
