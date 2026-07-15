# Skill 审查 Rubric

## 输出分数

审查报告包含四个主分：

- `qualityScore`：格式、结构、描述质量、可维护性。
- `securityScore`：危险命令、联网、持久化、供应链、prompt injection。
- `privacyScore`：敏感文件、环境变量、凭证、日志和数据外传。
- `functionalScore`：是否有任务集、示例、可复现说明和初步功能证据。

`overallScore` 使用加权平均：

```text
overallScore = quality * 0.30 + security * 0.35 + privacy * 0.25 + functional * 0.10
```

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
- `name` 是否清晰表达 Skill 的展示名称。
- `description` 是否同时说明 “做什么” 和 “何时使用”。
- `version`、`license`、`tags`、`supportedAgents` 是否完整。
- 引用文件是否存在，目录是否清晰。
- 正文是否包含试图覆盖系统指令、隐藏行为或规避审查的内容。

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

## 功能性评分

一期只做轻量静态功能性评分：

- 是否存在 `tests/` 或 examples。
- 是否描述了输入、输出和验收标准。
- 是否提供可复现任务。
- 是否有禁止行为或边界条件。

后续接入 HaluCatch/AgentHallu 类评估时，报告需要包含 trace、任务通过率、幻觉归因和 judge 解释。
