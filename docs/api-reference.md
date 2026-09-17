# API 参考

所有路径前缀 `/api`，WebSocket 路径 `/ws`，均为 JSON 协议。

## 1. 关键词

### `GET /api/keywords`
返回：`{ items: Keyword[] }`

```json
{
  "id": 4,
  "text": "Claude",
  "category": "model",
  "enabled": 1,
  "notify_threshold": 0.6,
  "created_at": 1789466906672
}
```

> **关键词前缀约定**：以 `@` 开头的关键词（如 `@karpathy`）会自动走**账号识别路径**——后台按 `CRON_ACCOUNT_RESOLVE` 频率调用 B站 UP主查询，渲染为博主卡片。当前仅支持 B站（`account:bilibili:*`）。

### `POST /api/keywords`
Body：`{ text: string, category?: 'model'|'tool'|'paper'|'news'|'general' }`
返回：新建的 Keyword

### `DELETE /api/keywords/:id`
返回：`{ ok: true }`

### `PATCH /api/keywords/:id`
Body：`{ enabled?: boolean, notify_threshold?: number }`

## 2. 热点

### `GET /api/hotspots`
Query：
- `source` — `hackernews|github|huggingface|arxiv|twitter`
- `keyword` — 命中关键词名（精确匹配 `matched_keywords` JSON）
- `limit` — 默认 100

返回：`{ items: Hotspot[] }`

```json
{
  "id": 1538,
  "source": "twitter",
  "source_id": "2099909611335860421",
  "url": "https://x.com/.../status/...",
  "title": "...",
  "content": "...",
  "meta": { "handle": "...", "likes": 42, ... },
  "published_at": 1789466900000,
  "fetched_at": 1789466906672,
  "content_hash": "a3b1c4d2",
  "ai_score": 0.85,
  "ai_importance": 0.9,
  "ai_summary": "中文摘要...",
  "matched_keywords": ["Claude", "DeepSeek"],
  "notified_at": 1789466910000
}
```

## 3. 数据源

### `GET /api/status`
返回：
```json
{
  "now": 1789493527786,
  "openrouter": { "enabled": true, "classify_model": "...", "summarize_model": "..." },
  "sources": { "hackernews": true, "github": true, "twitter": true, "bilibili": true, "google": true, "zhihu-trends": true, "weibo-trends": false, ... },
  "source_status": [{ "source": "twitter", "last_run_at": ..., "last_status": "ok", "last_count": 60 }],
  "whitelist_count": 10,
  "vapid_configured": true,
  "smtp_configured": false
}
```

### `POST /api/run`
Body：`{ only?: string[] }`（不传则全部）
返回：`{ ok: true, results: { [source]: { ok, fetched, new, analyzed, took_ms } } }`

### Twitter KOL 白名单

白名单作者跳过粉丝/浏览阈值检查（仍受时间窗限制），适合 AI 公司官号、知名 KOL。

#### `GET /api/twitter-whitelist`
返回：`{ items: Whitelist[] }`
```json
{
  "id": 1,
  "handle": "karpathy",
  "type": "person",
  "note": "AI 教育",
  "created_at": 1789466906672
}
```

#### `POST /api/twitter-whitelist`
Body：`{ handle: string, type?: 'person'|'company', note?: string }`
返回：新建的 Whitelist（409 表示 handle 已存在）

#### `DELETE /api/twitter-whitelist/:id`
返回：`{ ok: true }`

## 3.5 信息源管理（DB 驱动统一管理内置 + 用户源）

所有信息源（内置 + 用户新增）都存在 `sources` 表中，由 `/api/sources` 统一管理。
内置源（kind='builtin'）仅可切换 `enabled`；用户源（kind='user'）可增删改切。

#### `GET /api/sources`
返回：`{ items: Source[] }`
```json
{
  "id": 5,
  "name": "user:infoq",
  "label": "InfoQ",
  "kind": "user",
  "enabled": 1,
  "config": "{\"url\":\"https://www.infoq.cn/\"}",
  "last_run_at": 1789523600000,
  "last_status": "ok",
  "last_count": 12
}
```

#### `POST /api/sources`
Body：`{ name, label, url, enabled=true, test_fetch=true }`
- `name` 会被规范化为 `user:<sanitized>` 前缀
- 不能使用内置源名（hackernews/twitter/...）
- `test_fetch=true` 时：先插入，再测试抓取，返回字段包含 `test_ok / test_count / test_error`
- 添加成功后自动重启 scheduler（启用情况下）

返回：完整 Source 行 + 测试结果

#### `PATCH /api/sources/:name`
Body：`{ enabled?: boolean, label?: string }`
- 切换后自动重启 scheduler

#### `DELETE /api/sources/:name`
- 仅 `kind='user'` 的源可删除（内置源返回 400）
- 删除时同时清除该源的所有热点

## 4. Web Push

### `GET /api/push/vapid`
返回：`{ publicKey: string, configured: boolean }`

### `POST /api/push/subscribe`
Body：浏览器原生 `PushSubscription` JSON
返回：`{ ok: true }`

## 5. Agent Skill

被 `skills/ai-hotspot-monitor/scripts/` 调用：

- `POST /api/run` — 触发全源抓取 + AI 分析
- `GET /api/hotspots?limit=N` — 取最近热点
- `GET /api/status` — 取系统状态

返回字段标准化为 Agent 可消费的 JSON。

## 6. WebSocket 协议

**连接**：`ws://host/ws`（同源自动）

**服务端推送消息**：

```json
{ "type": "hotspot", "data": { /* Hotspot 字段同 REST，但 importance/summary 替代 ai_* */ } }
```

```json
{ "type": "source_run", "data": { "source": "twitter", "took_ms": 232906 } }
```

**客户端不需要发消息**（只读订阅）。
**重连**：客户端在 `onclose` 后 3 秒重连。