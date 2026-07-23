# Skill 审查 Rubric

## 输出分数

审查报告包含三个独立维度，不计算综合分：

- `qualityScore`：平台规则对 Skill 包格式、frontmatter、标识、许可、说明、测试与示例的综合质量评分；合规问题和质量问题都计入此分。
- `securityScore`：SkillSpector 静态扫描的整包安全分，覆盖危险行为、权限、供应链、prompt injection、隐私、泄露与数据外传。SkillSpector 风险分为 `riskScore` 时，安全分为 `100 - riskScore`。
- `reliabilityScore`：HaluCatch（或 taskset 回退）的评估分，与 `evaluation.score` 一致，不叠加平台静态加减分。

## 严重级别

- `critical`：疑似恶意、明确外传敏感信息、破坏性命令、反向 shell、隐藏持久化。
- `high`：过宽权限、危险脚本、未声明联网、读取凭证、删除文件。
- `medium`：缺少版本、描述不清、外部 URL 未解释、测试不足、脚本风险需人工复核。
- `low`：文档风格、标签缺失、示例不足、非阻断性改进建议。

发布判定：

- 存在 `critical` 或 `high`：`rejected`。
- 存在 `medium`：`needs-review`。
- 只有 `low` 或无问题：`published`。

## 质量审查（合规 + 质量）

检查项：

- `SKILL.md` 是否存在且包含合法 frontmatter。
- `slug` 是否符合 kebab-case，且与目录意图一致。
- `version`、`license` 等平台必需字段是否完整。
- `description` 是否同时说明 “做什么” 和 “何时使用”。
- 是否提供 tags 以提升发现性。
- `SKILL.md` 是否过长、难以维护。
- 正文是否足以清楚说明工作流、预期输出和限制。
- 是否提供 `tests/`、`examples/` 和验收语言等可审查证据。

## 安全审查（SkillSpector）

安全分默认由 SkillSpector 的无 LLM 静态扫描生成，风险分汇总了所有 finding，不再将隐私或泄露问题重复计入独立分数。重点覆盖：

- 删除或破坏性命令：`rm -rf`、`del /s /q`、`Remove-Item -Recurse -Force`。
- 权限提升：`sudo`、`Set-ExecutionPolicy Bypass`。
- 持久化：计划任务、启动项、shell profile 注入、git hook 注入。
- 混淆：base64 大块代码、eval、Function 构造、压缩混淆 JS。
- 供应链、远程下载、prompt injection、数据泄露与 SSRF。
- 敏感文件、环境变量、凭证和 Agent 生态信息的访问或外传。

若 SkillSpector 被显式禁用或运行不可用，平台会保留内置静态规则作为降级路径，并将安全、隐私和泄露 finding 一并计算为安全分；该结果应在恢复 SkillSpector 后通过重审替换。

## 可靠性评分

默认通过 HaluCatch 对发布快照执行五维静态可靠性评分：

- 地基与数据管线：脚本固化、输入验证、依赖和路径可移植性。
- 代码风险：常见错误处理、硬编码、超时和危险模式。
- 规则与方法论：步骤、边界、输出与自洽性。
- 解读护栏：验证、错误回退、确认与输出确定性。
- 复杂度与可维护性：文档/脚本复杂度、引用链和指令密度。

HaluCatch 结果会映射到统一的 `taskResults` 结构，并只参与 `reliabilityScore`。
这项检查是静态的，不执行 Skill 脚本；未来引入需要实际运行 Agent
的动态评估时，应补充 trace、任务通过率、幻觉归因和 judge 解释。
