# Contributing to MonoSkillNavigator

欢迎贡献！MonoSkillNavigator 是一个 AI Agent Skill 的注册、审查和分发平台。

## 项目结构

```
MonoSkillNavigator/
├── apps/
│   ├── api/          # Fastify HTTP API 服务
│   ├── cli/          # Commander CLI 工具
│   ├── web/          # Next.js 前端
│   └── worker/       # 审查 Worker
├── packages/
│   ├── skill-spec/   # Skill 包解析与校验
│   ├── evaluator/    # 功能性评估
│   ├── review-engine/# 审查规则引擎
│   └── storage/      # 存储抽象层
└── docs/             # 文档
```

## 快速开始

```bash
# 安装依赖
npm install

# 启动基础设施（PostgreSQL + MinIO）
docker compose up -d

# 启动 API 服务
npm run api

# 启动 Web 前端
npm run web
```

## 提交规范

- 使用清晰的 commit message
- 一个 commit 做一件事
- 提交前请确保代码通过 lint 检查

## 联系方式

- Maintainers: [@chrismoray](https://github.com/chrismoray) [@JShiu0915](https://github.com/JShiu0915)
