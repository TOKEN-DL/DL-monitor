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
  "sources": { "hackernews": true, "github": true, ... },
  "source_status": [{ "source": "twitter", "last_run_at": ..., "last_status": "ok", "last_count": 60 }],
  "vapid_configured": true,
  "smtp_configured": false
}
```

### `POST /api/run`
Body：`{ only?: string[] }`（不传则全部）
返回：`{ ok: true, results: { [source]: { ok, fetched, new, analyzed, took_ms } } }`

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