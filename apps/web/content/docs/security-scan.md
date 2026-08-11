# 安全检测（SkillSpector 与 VirusTotal）

MonoSkillNavigator 对每次发布（或重审）的 Skill 快照做 **静态安全扫描**，主要包括：

1. **SkillSpector**（默认启用）：规则与静态分析，不执行包内脚本。
2. **VirusTotal**（可选）：对发布 ZIP 的 SHA-256 做 hash lookup；未命中时可按配置上传样本并轮询结果。

扫描在隔离副本上完成；SkillSpector 默认 **关闭 LLM**，仅使用规则与静态分析。

## 在详情页哪里看

进入 Skill → **审查与评估** 面板 → **安全审查**：

1. **包级摘要**（扫描成功且已写入审查记录时）  
   - **安全分**：0–100，为 **100 − 包级风险分**；分数 **越高越放心**  
   - **包级风险分**：0–100，由多条 finding 加权汇总；与「安全分」方向相反  
   - **包级风险**：低 / 中 / 高 / 严重（对应 SkillSpector 的 LOW / MEDIUM / HIGH / CRITICAL）  
   - **安装建议**：可安装（SAFE）/ 谨慎（CAUTION）/ 不建议安装（DO_NOT_INSTALL）  
   - **模式**：通常为「仅静态扫描」

2. **Finding 列表**（SkillSpector 与 VirusTotal 等）  
   每条包含：标题、**严重度徽章**（低/中/高/严重）、**置信度**（SkillSpector 规则若提供）、说明、修复建议、命中证据片段。VirusTotal 的 malicious/suspicious 按上节 **按类别合并** 展示。

3. **VirusTotal 摘要**（已配置 API 时）  
   独立卡片展示扫描器名称、状态（已完成 / 未命中历史报告 / 扫描失败）、恶意与可疑 **检出数量**、威胁结论（若有）、SHA-256 前缀与 **VirusTotal 报告链接**（若有）。

4. **VirusTotal finding**（扫描 **completed** 且存在 malicious 或 suspicious 检出时）  
   按 **风险类别** 合并展示，**不是** 每个 AV 引擎单独一条：
   - **malicious** 检出 → 一条 **高** 级 finding（会触发 **已拒绝**）
   - **suspicious** 检出 → 一条 **中** 级 finding（通常为 **需复核**）

   每条合并 finding 包含：
   - **标题**：如 `VirusTotal (malicious)` / `VirusTotal (suspicious)`
   - **说明**：列出所有检出该类的 AV 厂家名称（逗号分隔），如「AhnLab-V3, Kaspersky, … classified this package as malicious.」
   - **建议**：malicious 与 suspicious 各有一条固定修复建议（与单引擎时相同）
   - **证据区**（同一类别内汇总）：

   | 字段 | 说明 |
   | --- | --- |
   | SHA-256 | 被扫描 ZIP 的哈希，整份报告唯一 |
   | Category | 该框的类别（`malicious` 或 `suspicious`） |
   | Result | 各引擎的检出名称，逗号分隔（通常较长） |
   | Method | 各引擎的判定方式，去重后逗号分隔（常见为 `blacklist`） |
   | Engine update | 各引擎病毒库版本日期，去重后逗号分隔（不同厂家更新节奏不同，故可能出现多个日期） |
   | Report | 该文件在 VirusTotal 上的分析页链接 |

   证据区 **不再单独列出 Engine 行**（厂家名称已在说明中）。若仅有统计、无逐引擎明细，则回退为一条 **汇总** malicious/suspicious finding。

部分 **平台合规/质量** finding（如 tags、description 规范）计入审查记录，但 **不在安全区域列表展示**；它们仍可能影响发布 verdict（通常为 **需复核**）。

## Finding 严重度分级（一句话）

每条 finding 徽章为 **低 / 中 / 高 / 严重** 之一（对应 LOW / MEDIUM / HIGH / CRITICAL）。下面帮助非技术读者理解 **单条问题** 的严重程度（与上方 **包级**「低 / 中 / 高 / 严重」不是同一计数，包级看全部问题汇总）。

| 等级 | 一句话 |
| --- | --- |
| **低** | 多为规范或习惯类提示，一般 **不会** 单独导致「不能安装」，但仍建议顺手改一改。 |
| **中** | 存在 **值得人工看一眼** 的问题；SkillSpector **medium 且置信度 ≥ 90%** 会 **拒绝发布**，其余 medium 多为 **需复核**。 |
| **高** | 有较明确的 **安全或滥用风险**；SkillSpector / VirusTotal 的 high 级 finding 会 **拒绝发布**。 |
| **严重** | 属于 **最严重** 一类（如明确恶意特征、可造成严重危害），应 **停止安装** 并优先修复或下架。 |

## 包级风险分怎么理解

SkillSpector 对每条 finding 按 **严重度** 与 **置信度** 贡献分数，同一规则重复命中有递减上限；可执行脚本上的命中可能略加重权重。分数映射关系（摘要）：

| 风险分 | 包级风险 | 安装建议 |
| --- | --- | --- |
| 0–20 | 低 | 可安装（SAFE） |
| 21–50 | 中 | 谨慎（CAUTION） |
| 51–80 | 高 | 不建议安装 |
| 81–100 | 严重 | 不建议安装 |

**注意**：单条 finding 的徽章（例如「中」）表示 **该条规则** 的严重度，与包级「中」不是同一计数方式。例如一条「中」级 MP2 finding 可能只贡献较低风险分，包级仍为「低」。

## Finding 严重度与发布（verdict）

平台 **verdict** 由审查 finding 综合判定，**自动拒绝** 仅看 SkillSpector、VirusTotal 与 HaluCatch 是否 **成功完成**，以及 SkillSpector / VirusTotal 的特定安全 finding：

| 来源 | 已拒绝（rejected） | 需复核（needs-review） |
| --- | --- | --- |
| **SkillSpector**（已启用） | 扫描未完成；`high` / `critical`；或 `medium` 且置信度 **≥ 90%** | 其余 SkillSpector finding |
| **VirusTotal**（已启用） | 扫描未完成（超时等）；`high` / `critical`（如 malicious 检出） | 其余（如 suspicious 检出） |
| **HaluCatch**（已启用） | 评估未完成 | 评估成功后的 warn/fail 等（见质量文档） |
| **平台规则等** | 不自动拒绝 | 存在任意 finding 时为需复核 |
| **无任何 finding 且各启用步骤均成功** | — | **已发布（published）** |

SkillSpector 的「不建议安装」是 **包级安全建议**，与页面「已拒绝 / 需复核」徽章相关但不完全等同。

**已拒绝** 的 Skill 不会出现在 Skill 搜索与榜单；Skill **拥有者** 可在个人中心查看并进入详情页处理 finding（见 [发布流程](./publish-workflow.md)）。

## 覆盖的安全主题（示例）

静态规则覆盖多类风险，包括但不限于：

- 提示注入、系统提示泄露、数据外泄、SSRF  
- 权限提升、供应链与混淆代码、危险 API（exec/eval/subprocess 等）  
- 记忆投毒（含无意义长重复 description）、工具滥用、Agent 窥探  
- MCP 最小权限与工具投毒、反拒绝（jailbreak）表述  
- YARA 特征命中等  

说明文案在 Web 端按 **规则 ID** 展示为 **中文**；证据区仍显示包内原文片段。

## SkillSpector 不可用时

若 Python 或 SkillSpector 依赖缺失，审查记录中可能出现 **SkillSpector unavailable** 类 finding，平台会回退部分内置正则检查。恢复环境后应对该版本 **重跑审查** 以得到完整 SkillSpector 结果。

环境变量（运维参考，一般用户无需修改）：

- `SKILLSPECTOR_ENABLED=false` 可关闭 SkillSpector  
- `SKILLSPECTOR_PYTHON`、`SKILLSPECTOR_DIR`、`SKILLSPECTOR_TIMEOUT_MS` 用于指定解释器、目录与超时  
- `VIRUSTOTAL_API_KEY` 启用 VirusTotal；`VIRUSTOTAL_UPLOAD_ON_MISS` 控制未命中 hash 时是否上传样本（上传后需轮询分析，可能受 `VIRUSTOTAL_TIMEOUT_MS` 默认 90s 限制）

## 如何修复与重新发布

1. 根据 finding **建议** 修改 SKILL.md 或相关文件（删除危险指令、缩短异常重复内容、声明权限等）。  
2. 递增 **version**，重新 [发布](./publish-workflow.md)。  
3. 对比新旧版本的包级风险分、安全分与 finding 是否减少。

## 相关文档

- [Skill 格式](./skill-format.md) — 避免 frontmatter 触发误报  
- [质量审查](./halucatch-review.md) — 质量维度与安全互补
