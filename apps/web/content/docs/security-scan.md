# 安全检测（SkillSpector）

MonoSkillNavigator 使用内置的 **SkillSpector** 对每次发布（或重审）的 Skill 快照做 **静态安全扫描**。平台 **不执行** Skill 内的脚本；扫描在隔离副本上完成，默认 **关闭 LLM**，仅使用规则与静态分析。

## 在详情页哪里看

进入 Skill → **审查与评估** 面板 → **安全审查**：

1. **包级摘要**（扫描成功且已写入审查记录时）  
   - **风险分**：0–100，由多条 finding 加权汇总  
   - **包级风险**：低 / 中 / 高 / 严重（对应 SkillSpector 的 LOW / MEDIUM / HIGH / CRITICAL）  
   - **安装建议**：可安装（SAFE）/ 谨慎（CAUTION）/ 不建议安装（DO_NOT_INSTALL）  
   - **模式**：通常为「仅静态扫描」

2. **Finding 列表**  
   每条包含：类别标题（中文）、**严重度徽章**（低/中/高/严重）、**置信度**（若规则提供）、说明、修复建议、命中证据片段。

部分 **平台合规/质量** finding（如 tags、description 规范）计入审查记录，但 **不在安全区域列表展示**；它们仍可能影响发布 verdict。

## 包级风险分怎么理解

SkillSpector 对每条 finding 按 **严重度** 与 **置信度** 贡献分数，同一规则重复命中有递减上限；可执行脚本上的命中可能略加重权重。分数映射关系（摘要）：

| 风险分 | 包级风险 | 安装建议 |
| --- | --- | --- |
| 0–20 | 低 | 可安装（SAFE） |
| 21–50 | 中 | 谨慎（CAUTION） |
| 51–80 | 高 | 不建议安装 |
| 81–100 | 严重 | 不建议安装 |

**注意**：单条 finding 的徽章（例如「中」）表示 **该条规则** 的严重度，与包级「中」不是同一计数方式。例如一条「中」级 MP2 finding 可能只贡献较低风险分，包级仍为「低」。

## Finding 严重度与发布

平台 **verdict** 看 **全部** 审查 finding（含合规项）的最高严重度：

| Finding 严重度 | 对 verdict 的影响 |
| --- | --- |
| critical / high | 通常为 **已拒绝** |
| medium | 通常为 **需复核** |
| low | 一般不单独阻断 |

SkillSpector 的「不建议安装」是 **安全建议**，与页面「已拒绝」徽章可能同时出现，也可能在合规通过时仅作提示。

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

## 如何修复与重新发布

1. 根据 finding **建议** 修改 SKILL.md 或相关文件（删除危险指令、缩短异常重复内容、声明权限等）。  
2. 递增 **version**，重新 [发布](./publish-workflow.md)。  
3. 对比新旧版本的包级风险与 finding 是否减少。

## 相关文档

- [Skill 格式](./skill-format.md) — 避免 frontmatter 触发误报  
- [HaluCatch 审查](./halucatch-review.md) — 质量维度与安全互补
