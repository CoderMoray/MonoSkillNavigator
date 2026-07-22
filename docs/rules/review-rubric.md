# Skill 审查 Rubric

## 输出分数

审查报告包含五个独立维度，不计算综合分：

- `complianceScore`：Skill 包格式、frontmatter、标识和平台必需字段。
- `securityScore`：危险命令、联网、持久化、供应链、prompt injection。
- `privacyScore`：敏感文件、环境变量、凭证、日志和数据外传。
- `qualityScore`：说明清晰度、标签、文档结构和可维护性；不包含 HaluCatch 分数。
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

## 合规性审查

检查项：

- `SKILL.md` 是否存在且包含合法 frontmatter。
- `slug` 是否符合 kebab-case，且与目录意图一致。
- `version`、`license` 等平台必需字段是否完整。
- 正文是否包含试图覆盖系统指令、隐藏行为或规避审查的内容。

## 质量评分

检查项：

- `description` 是否同时说明 “做什么” 和 “何时使用”。
- 是否提供 tags 以提升发现性。
- `SKILL.md` 是否过长、难以维护。
- 正文是否足以清楚说明工作流、预期输出和限制。
- 是否提供 `tests/`、`examples/` 和验收语言等可审查证据。

## 泄露风险审查

高风险模式：

- 外部上传：`curl -X POST`、`fetch(..., { method: "POST" })`、webhook。
- 动态下载与执行：`curl | bash`、`Invoke-WebRequest | iex`、`wget ... | sh`。
- 反向连接：`nc -e`、`bash -i`、socket shell。
- 遥测和未声明网络请求。

## 隐私合规审查

高风险模式：

- 读取 `.env`、SSH key、云厂商凭证、浏览器 cookie、token 文件。
- 扫描 home 目录、桌面、下载目录或整个磁盘。
- 将环境变量、命令输出、文件内容写入外部服务。
- 日志中保存明文 token、邮箱、手机号、身份证、密钥。

## 安全审查

高风险模式：

- 删除或破坏性命令：`rm -rf`、`del /s /q`、`Remove-Item -Recurse -Force`。
- 权限提升：`sudo`、`Set-ExecutionPolicy Bypass`。
- 持久化：计划任务、启动项、shell profile 注入、git hook 注入。
- 混淆：base64 大块代码、eval、Function 构造、压缩混淆 JS。
- 二进制或压缩包中隐藏脚本。

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
