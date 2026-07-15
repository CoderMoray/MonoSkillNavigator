# Skill 包规范

## 目录结构

每个 Skill 是一个目录，必须包含 `SKILL.md`：

```text
skill-name/
  SKILL.md
  references/
  examples/
  scripts/
  assets/
  tests/
```

可选目录说明：

- `references/`：按需加载的长文档、规范、背景资料。
- `examples/`：示例输入、示例输出、使用案例。
- `scripts/`：Skill 指令中可能调用的辅助脚本。发布时会被重点审查。
- `assets/`：模板、图片、字体等静态资源。
- `tests/`：功能性评估任务和期望行为。

## SKILL.md frontmatter

`SKILL.md` 必须以 YAML frontmatter 开头：

```yaml
---
name: skill-name
description: What the skill does and when to use it.
version: 0.1.0
author: example-user
license: MIT
tags:
  - productivity
supportedAgents:
  - cursor
allowed-tools:
  - Read
disallowed-tools:
  - Shell
---
```

必填字段：

- `name`：小写字母、数字、短横线，最长 64 字符。
- `description`：说明能力和触发场景，最长 1024 字符。

建议字段：

- `version`：语义化版本。CLI 发布时也可通过参数覆盖。
- `author`：作者或组织标识。
- `license`：许可证。
- `tags`：分类标签。
- `supportedAgents`：兼容的 Agent 平台。
- `allowed-tools`：Skill 激活时预授权工具，必须最小权限。
- `disallowed-tools`：Skill 激活时禁止工具。

## 文件限制

- 单个文本文件建议小于 256 KB。
- `SKILL.md` 建议少于 500 行。
- 不允许路径逃逸，例如 `../secret`。
- 不允许 symlink、隐藏二进制、可疑压缩包绕过审查。
- 外部 URL、动态下载、遥测、上传逻辑必须在描述中明确说明。

## 权限模型

平台将权限解析为以下风险能力：

- `network`：联网、下载、上传、webhook、遥测。
- `filesystem-read`：读取用户文件、项目文件、敏感目录。
- `filesystem-write`：写入、删除、覆盖、批量修改。
- `code-execution`：Shell、Python、Node、PowerShell、脚本执行。
- `credential-access`：环境变量、token、密钥文件、浏览器凭证。

Skill 可以请求这些能力，但必须与 `description` 和正文目的一致。能力越高，审查阈值越严格。

## 版本规则

- 同一个 `name` + `version` 一经发布不可变。
- 每个版本保存内容 hash，用于安装前校验。
- `latest` 指向最新发布版本，后续可增加 `stable`、`deprecated`、`yanked` 标签。
