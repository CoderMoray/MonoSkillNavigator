# Phase 2 功能评估与社区协作规则

## 功能性评估

Phase 2 使用 `tests/*.json` 作为轻量任务集格式：

```json
{
  "name": "basic-task",
  "input": "User request",
  "expectedOutput": ["summary", "suggestions"],
  "forbiddenBehaviors": ["network access", "reading private files"],
  "successCriteria": ["The answer is concise and follows the template"]
}
```

当前评估器是 `static-taskset`，用于检查任务集完整性、验收标准和安全边界是否在 Skill 文档中可追踪。后续接入 HaluCatch 时，保持相同输出结构：`status`、`score`、`tasksTotal`、`tasksPassed`、`taskResults`、`findings`。

## Contributor

Contributor 用于标注多人协作关系：

- `owner`：Skill 所有者，默认来自 `author`。
- `maintainer`：版本维护者。
- `reviewer`：审查者。
- `contributor`：一般贡献者。

同一名字重复添加时更新角色，不创建重复记录。

## Issue

Issue 类型：

- `bug`
- `security`
- `compatibility`
- `feature`
- `docs`

状态：

- `open`
- `triaged`
- `closed`

Phase 2 只支持创建和查询，状态流转留到后续管理后台实现。

## Rating

用户评分为 1 到 5 分，可附带版本和评论。平台保存平均分和评分数，榜单展示时不把用户评分和审查分混成同一个分数。

## 榜单

榜单排序口径：

- `downloads`：下载总量。
- `rating`：平均用户评分，评分数作为次级排序。
- `quality`：最新版本质量分。
- `security`：最新版本安全分。
- `functional`：最新版本功能性分。
- `recent`：最近更新时间。
