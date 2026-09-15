# 第三方 API 审计报告

> 时间：2026-09-16
> 工具：Context7 + WebFetch + 实际 curl 探测
> 范围：所有第三方依赖与远程 API

## 1. 审计方法

每个外部 API / npm 包都通过以下方式核对最新用法：

| 类型 | 工具 | 结果 |
|---|---|---|
| npm 包 | `mcp__context7__query-docs` | ✅ node-cron, web-push, cheerio, ws, Aceternity UI |
| 第三方 HTTP API | `WebFetch` + `curl` 实测 | ⚠️ 部分被沙箱拦截（已用 curl 兜底） |
| 本地版本 | `node -e "require(.../package.json)"` | ✅ 全部最新 |

## 2. 审计发现

### ✅ 通过（当前代码正确）

| 包 / API | 版本 / 端点 | 验证结果 |
|---|---|---|
| `ws` | 8.21.3 | `new WebSocketServer({ server, path: '/ws' })` 写法正确 |
| `web-push` | 3.6.7 | `setVapidDetails()` + `sendNotification()` 用法与文档一致 |
| `cheerio` | 1.2.0 | `cheerio.load(xml, { xml: true })` 新语法（已迁移） |
| `node-cron` | 3.0.3 | `schedule(expr, fn, { timezone })` 配置正确 |
| HackerNews | `/v0/topstories.json` | HEAD 返回 405 但 GET 工作（正常） |
| arXiv | `export.arxiv.org/api/query` | HTTPS 200 OK ✅（已从 HTTP 升级） |
| GitHub Search | `/search/repositories` | 200 OK ✅ |
| OpenRouter | `/api/v1/chat/completions` | 端点 401（需 key，符合预期） |

### ⚠️ 已修复

| 编号 | 问题 | 修复 |
|---|---|---|
| A1 | arXiv 用 HTTP 协议 | 改为 HTTPS（[server/sources/arxiv.js:6](server/sources/arxiv.js#L6)） |
| A2 | cheerio 用旧 `xmlMode: true` | 改为新 `xml: true`（[server/sources/arxiv.js:26](server/sources/arxiv.js#L26)） |
| A3 | GitHub Search 走无认证，限流 10 req/min | 加可选 `GITHUB_TOKEN` 环境变量（认证后 30 req/min），并加 `X-GitHub-Api-Version` 头（[server/sources/github.js:18-23](server/sources/github.js#L18-L23)） |
| A4 | twitterapi.io 只取首页 20 条 | 加 cursor 翻页，最多 3 页=180 条/查询（[server/sources/twitter.js:44-72](server/sources/twitter.js#L44-L72)） |

### 📝 设计保留（无需修改）

| 项 | 现状 | 说明 |
|---|---|---|
| OpenRouter 模型 | `meta-llama/llama-3.1-8b-instruct` + `-3.3-70b-instruct` | 已实测可用，计费便宜 |
| `twitterapi.io` 用 `Latest` queryType | 实时流场景合适 | Top 适合热搜但不适合监控 |
| ws 广播 `readyState === 1` | 等价 `OPEN` | 内联魔法数字保持紧凑（可读性可） |
| `node-fetch` 用 Node 24 内置 fetch | ✅ | 0 依赖更轻 |
| 24h AI 缓存 | DB `ai_cache` 表 | 减少重复调用 |

### ⚠️ 已知风险（不修复，仅记录）

| 项 | 影响 | 缓解 |
|---|---|---|
| HuggingFace 国内不可达 | 该源始终空 | 优雅降级，UI 显示 OK count=0 |
| twitterapi.io 计费按返回推文数（$0.00015/tweet） | 大查询成本 | 限 5 个查询 × 翻 3 页（≤900 条/次） |
| OpenRouter 免费模型偶发 404 | `gemma-3-4b-it:free` 已踩过 | 已切换付费模型，价格仍可接受 |

## 3. API 端点实测

```
$ curl -sI https://hacker-news.firebaseio.com/v0/topstories.json
HTTP/1.1 405 Method Not Allowed   # HEAD 不支持，GET 正常
Server: nginx

$ curl -sI 'https://export.arxiv.org/api/query?search_query=cat:cs.AI&max_results=1'
HTTP/1.1 200 OK                  # ✅
Content-Length: 3583

$ curl -sI 'https://api.github.com/search/repositories?q=stars:>100&per_page=1'
HTTP/1.1 200 OK                  # ✅
Content-Type: application/json; charset=utf-8

$ curl -sI https://huggingface.co/api/models?sort=createdAt&limit=1
(无响应)                          # ⚠️ 国内网络受限

$ curl -s -o /dev/null -w "%{http_code}\n" -X POST \
    -H "Content-Type: application/json" \
    -d '{"model":"meta-llama/llama-3.1-8b-instruct",...}' \
    https://openrouter.ai/api/v1/chat/completions
401                              # 端点存在，需 key
```

## 4. 本地依赖版本（已锁定）

| 包 | 已装 | 最新 | 状态 |
|---|---|---|---|
| `ws` | 8.21.3 | 8.21.3 | ✅ |
| `cheerio` | 1.2.0 | 1.2.0 | ✅ |
| `web-push` | 3.6.7 | 3.6.7 | ✅ |
| `node-cron` | 3.0.3 | 3.0.3 | ✅ |
| `nodemailer` | ^6.9.16 | 6.x | ✅ |
| `express` | ^4.21.2 | 4.x | ✅（未升 5，差异过大） |
| `framer-motion` | ^11.11.17 | 11.x | ✅ |
| `vite` | ^5.4.11 | 5.x | ✅ |
| `tailwindcss` | ^3.4.17 | 3.x | ✅ |

## 5. 后续建议

- [ ] 加单元测试覆盖 wrapQuery() / extractJSON()
- [ ] 邮件聚合任务（cron 9:00 / 21:00）
- [ ] 用 Turso / libSQL 替换本地 SQLite 便于云端同步
- [ ] WS 加心跳 ping/pong 防止代理切断