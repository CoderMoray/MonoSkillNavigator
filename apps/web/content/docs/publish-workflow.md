# 发布流程

发布将 Skill 包注册到平台，并自动触发 **格式校验、SkillSpector 安全扫描、HaluCatch 质量评估**（以及平台合规/质量 finding）。完成后可在 Skill 详情页查看结果。

## 前置条件

1. 已注册账号并 **登录** Web。
2. 本地 Skill 符合 [Skill 格式](./skill-format.md)（含合法 `SKILL.md` frontmatter）。
3. 服务端已配置 `DATABASE_URL`；HaluCatch / SkillSpector 依赖 Python 环境（未配置时部分能力会降级，见对应文档）。

## Web 发布步骤

1. 打开 **发布 Skill** 页面（`/skills/publish`）。
2. **上传包**：
   - 选择 **ZIP**，或
   - 选择 **文件夹**（浏览器会打包为 ZIP），或
   - 拖拽到上传区。
3. 填写 **元数据**：
   - 展示名称、slug（新 Skill）、摘要、分类（1–3 个）、版本号、release-tags、变更说明等。
   - 若从已有 Skill 发 **新版本**，可通过 URL 参数 `?skill=<slug>` 进入，slug 通常不可改。
4. **预览**（若提供）：确认 frontmatter 与平台字段一致。
5. **提交发布**：平台上传 ZIP、写入注册表并运行审查流水线。
6. 跳转到 **Creator 主页** 或 Skill 详情，查看发布结果提示。

## 发布后会得到什么

每个版本会保存：

| 内容 | 说明 |
| --- | --- |
| 快照与文件列表 | 用于详情页展示与 hash 校验 |
| ZIP 制品 | 供下载与 MinIO（若启用）存储 |
| 审查记录 | finding 列表、verdict、SkillSpector 包级风险摘要（若扫描成功） |
| 评估记录 | HaluCatch 五维结果与 Markdown 报告（若评估成功） |

## 版本状态（verdict）

详情页上的状态徽章来自审查 **verdict**，与 SkillSpector「安装建议」不是同一套按钮，但通常相关：

| 状态 | 含义（简化） |
| --- | --- |
| **已发布（published）** | 无 critical/high finding，且无 medium 阻断项 |
| **需复核（needs-review）** | 存在 medium 级 finding，建议人工确认后再推广 |
| **已拒绝（rejected）** | 存在 critical 或 high 级 finding |

平台还会在发布前做 **包格式校验**；格式错误可能无法完成发布。

## 下架与重新上架

Skill **所有者** 可在详情页：

- **下架（unpublish）**：Skill 不再对公开列表展示，历史版本与审查数据仍保留。
- **重新上架（republish）**：恢复公开可见。

发 **新版本** 仍走发布流程，版本号必须递增。

## CLI 发布（可选）

已登录用户可在本地使用 CLI（需配置 API 与 token）：

```bash
npm run skill -- publish ./my-skill --token <token>
```

CLI 与 Web 共用同一 API 与审查逻辑；Web 发布额外校验分类等表单字段。

## 发布失败常见原因

- **slug 冲突或版本已存在**：更换 slug 或提高 version。
- **frontmatter 缺字段或 SemVer 不合法**：对照 [Skill 格式](./skill-format.md) 修改。
- **审查 rejected**：打开详情 →「审查与评估」，处理 SkillSpector 或合规 finding 后发新版本。
- **HaluCatch / SkillSpector 不可用**：联系管理员检查 Python 与 `packages` 内 vendored 组件；平台可能写入「不可用」类 finding 或回退评估方式。

## 相关文档

- [安全检测](./security-scan.md)
- [HaluCatch 审查](./halucatch-review.md)
