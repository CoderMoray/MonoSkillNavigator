# 平台集成指南（外部平台嵌入 SkillNavigator）

> 面向把 SkillNavigator 集成到现有平台（作为子页面）的外部平台开发团队。
> 状态：设计定稿 · 2026-08-19

## 1. 两种部署模式

| 模式 | 页面入口 | API 地址 | 适用 |
|---|---|---|---|
| 独立部署 | `https://skillnav.example.com/` | `https://api.skillnav.example.com` | 平台自身独立运营 |
| 嵌入部署 | `https://<host>/{brand}/` | `https://<host>/{brand}/api` | 作为某个已有平台的子页面 |

`{brand}` 由仓库根 `brand.yaml` 的 `brand` 字段定义，当前为 `MonoSkillNavigator`。

## 2. 嵌入部署架构

```
用户浏览器
  ├─ https://aaa.bbb.com/MonoSkillNavigator/        → Next.js Web（basePath="/MonoSkillNavigator"）
  └─ https://aaa.bbb.com/MonoSkillNavigator/api/*   → Nginx → 127.0.0.1:3000/*（剥前缀后转发 Fastify）
```

### 2.1 Web：Next.js 函数式 basePath

`apps/web/next.config.ts` 按 hostname 返回 basePath，一份构建同时支持两种模式：

```ts
const nextConfig: NextConfig = {
  basePath: ({ hostname }) =>
    hostname === "aaa.bbb.com" ? "/MonoSkillNavigator" : "",
};
```

- 组件内 `<Link href="/skills">`、`next/image`、`next/link` 会自动带上 basePath，**业务代码无需改动**。
- 硬编码绝对路径（如 `<img src="/xxx.png">`、字符串 URL）必须改用相对路径或组件 API，否则不会自动带前缀。

### 2.2 API：Nginx 反向代理剥前缀（推荐，应用代码零改动）

Fastify 所有路由注册在**根路径**（`/auth/*`、`/skills/*`、`/reviews/*`、`/leaderboard`、`/users/*`、`/health`）。嵌入部署时外部请求带前缀，由反向代理剥掉：

```nginx
location /MonoSkillNavigator/api/ {
    proxy_pass http://127.0.0.1:3000/;   # 末尾 / 表示把 /MonoSkillNavigator/api/xxx → /xxx
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    client_max_body_size 50m;             # 发布上传 zip 用，按需调整
}
```

> **为什么用代理剥前缀而不是改 Fastify？**
> 改 Fastify 需要把 `apps/api/src/server.ts` 的路由改成插件注册并加 prefix，且会连带影响 CORS、健康检查地址、CLI 默认值，成本高。代理方案对应用代码零侵入，独立/嵌入两套部署共用同一份代码。

**若选择改 Fastify 而非代理**（例如没有独立代理层）：

- 需要把 `apps/api/src/server.ts` 的路由注册改为插件形式：
  `app.register(apiPlugin, { prefix: process.env.API_BASE_PATH ?? "" })`。
- 同步影响：CORS 配置、`/health` 探测地址、CLI 的 registry 值、Nginx 不再需要 rewrite。
- **此改动会改变 API 合同（所有 URL 带前缀）**，已集成的外部方需感知。

## 3. 外部平台集成 Checklist

对嵌入方（如 aaa.bbb.com 团队）：

- [ ] 确认反向代理：`/{brand}/api/*` 转发到 SkillNavigator API 并剥前缀
- [ ] 确认 Web basePath：`basePath` 指向 `/{brand}`
- [ ] 确认 CORS：`apps/api` 目前 `origin: true`（允许所有来源），生产建议收紧为 `aaa.bbb.com`
- [ ] 发布上传体量：Nginx `client_max_body_size` 与服务端 body limit 匹配（发布 zip 可能较大）
- [ ] 用 `curl {registry}/health` 验证连通性
- [ ] 用 CLI 验证：`skillnav config add embed --registry https://aaa.bbb.com/{brand}/api && skillnav config test embed`

## 4. CLI 侧连接方式（两种模式同一机制）

CLI 永远只连 **API base URL（registry）**，不感知模式，差异仅是 URL 是否带前缀：

```bash
# 独立平台
skillnav config add prod --registry https://api.skillnav.example.com

# 嵌入平台
skillnav config add corp --registry https://aaa.bbb.com/MonoSkillNavigator/api

skillnav config use prod   # 切换默认平台
skillnav publish ./demo    # 发布到当前默认平台
```

> **重要**：CLI 内部 URL 拼接必须使用**字符串拼接**（`f"{registry}/skills/publish"`），不要用 `urljoin`/`new URL()`——后者会丢弃路径前缀，导致带前缀的嵌入 API 请求 404。

## 5. 品牌联动

- `{brand}` 同时驱动：页面 URL 前缀（Web basePath）、API 前缀（代理 location）、CLI 文档示例、邮件署名。
- **品牌变更流程**：改 `brand.yaml` → 同步改 Web basePath 与 Nginx location → 通知所有已配置 profile 的 CLI 用户更新 registry。

## 6. 相关文档

- [CLI 设计文档](./cli-design.md) — 命令集、退出码、输出约定
- `brand.yaml` — 品牌名唯一事实来源
- [架构总览](./architecture.md) — 系统架构
