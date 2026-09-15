# DL-monitor 架构文档

## 1. 系统总览

```
┌──────────────────────────────────────────────────────────────────┐
│                       DL-monitor (Node 24)                       │
│                                                                  │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐     │
│  │   HN   │  │ GitHub │  │  HF    │  │ arXiv  │  │  X    │     │
│  └────┬───┘  └────┬───┘  └────┬───┘  └────┬───┘  └────┬───┘     │
│       ↓           ↓           ↓           ↓           ↓          │
│  ┌─────────── fetch + normalize ───────────┐                    │
│  │                 ↓                       │                    │
│  │           dedup (sha-like hash)          │                    │
│  │                 ↓                       │                    │
│  │     OpenRouter classify (8b)            │                    │
│  │                 ↓ (score ≥ 0.4)         │                    │
│  │     OpenRouter summarize (70b)          │                    │
│  │                 ↓                       │                    │
│  │            SQLite persist               │                    │
│  │                 ↓                       │                    │
│  │   ┌─WS broadcast─┬─Web Push──┬─SMTP──┐  │                    │
│  │   │ (实时)         │ (后台)    │ (聚合) │  │                    │
│  └───┴───────────────┴───────────┴───────┴──┘                    │
└──────────────────────────────────────────────────────────────────┘
                                  ↕ HTTP / WebSocket
┌──────────────────────────────────────────────────────────────────┐
│  Browser (React 18 + Vite + Aceternity UI + Tailwind)            │
│  ┌─Header─┬─KeywordPanel─┬─HotspotStream─┬─SourcePanel─┐        │
│  │WS/PUSH │  MovingBorder │  CardHover +  │  推送按钮   │        │
│  │ /AI    │  关键词管理   │  TextGenerate  │  配置/心跳  │        │
│  └────────┴──────────────┴────────────────┴─────────────┘        │
└──────────────────────────────────────────────────────────────────┘
```

## 2. 模块边界

```
server/
├── index.js              # 入口：Express + ws + scheduler 启动
├── config.js             # 读 .env，集中所有可配置项
├── db.js                 # node:sqlite，schema + prepared statements
├── sources/
│   ├── base.js           # defineSource / safeFetchJSON 公共工具
│   ├── hackernews.js     # Firebase REST API
│   ├── github.js         # GitHub Search API（替代 React SPA 抓取）
│   ├── huggingface.js    # /api/models + /api/papers
│   ├── arxiv.js          # export.arxiv.org/api/query
│   ├── twitter.js        # twitterapi.io /twitter/tweet/advanced_search
│   └── index.js          # 注册所有 source
├── ai/
│   ├── openrouter.js     # fetch 封装，3 次重试，429 退避
│   └── analyze.js        # classify + summarize 两阶段
├── monitor/
│   ├── scheduler.js      # node-cron，按源独立调度
│   └── pipeline.js       # 抓取 → 去重 → AI → 通知
├── notify/
│   ├── socket.js         # ws 广播
│   ├── push.js           # web-push（VAPID）
│   └── email.js          # nodemailer（每日聚合，留 hook）
├── routes/
│   ├── api.js            # /api/keywords /api/hotspots /api/status /api/run
│   └── push.js           # /api/push/vapid /api/push/subscribe
└── ...
```

```
web/
├── index.html            # Vite 入口
├── vite.config.js        # build + 复制 sw.js/manifest.json 到 dist
├── tailwind.config.js    # aurora / border-beam / shimmer 动画
└── src/
    ├── main.jsx
    ├── App.jsx           # 三栏布局 + 状态机
    ├── lib/
    │   ├── utils.js      # cn() / timeAgo() / SOURCE_LABELS
    │   ├── api.js        # fetch 封装（按域分组）
    │   └── ws.js         # useWebSocket hook
    ├── hooks/
    │   ├── useKeywords.js
    │   ├── useHotspots.js
    │   └── useStatus.js
    └── components/
        ├── ui/           # 5 个 Aceternity 组件
        │   ├── background-gradient.jsx
        │   ├── aurora-background.jsx
        │   ├── card-hover-effect.jsx
        │   ├── moving-border.jsx
        │   └── text-generate-effect.jsx
        ├── Header.jsx
        ├── KeywordPanel.jsx
        ├── HotspotCard.jsx
        ├── HotspotStream.jsx
        ├── SourcePanel.jsx
        └── ToastStack.jsx
```

## 3. 数据流（单条热点完整生命周期）

```
1. cron 触发  →  scheduler.run(sourceName)
2. source.fetch()           # 返回 [{title, url, content, source, source_id, published_at, meta}]
3. for each item:
   a. hash = fnv1a(item.url)
   b. db.findByHash(hash)   # 已存在 → 跳过
   c. db.insert(item)       # 新条目入 hotspots 表
   d. ai.analyze(item)      # {score, importance, summary, matched_keywords}
   e. db.updateAI(id, ai)   # 写回
   f. if importance >= threshold:
        - ws.broadcast({type:'hotspot', data: item+ai})
        - if importance >= 0.8: webPush.sendAll(item)
        - markNotified(id)
4. source_status update
```

## 4. 数据库 Schema

```sql
-- 关键词表
keywords (
    id PK, text UNIQUE, category DEFAULT 'general',
    enabled DEFAULT 1, notify_threshold DEFAULT 0.6,
    created_at INTEGER
)

-- 热点表（核心）
hotspots (
    id PK, source, source_id, url, title, content,
    meta JSON, published_at, fetched_at,
    content_hash UNIQUE,        -- fnv1a(url) 8 位 hex
    ai_score REAL,              -- 0-1 相关性
    ai_importance REAL,         -- 0-1 重要性
    ai_summary TEXT,            -- 中文 30-80 字
    matched_keywords JSON,      -- 命中的关键词数组
    notified_at INTEGER
)
INDEX idx_hotspots_fetched (fetched_at DESC)
INDEX idx_hotspots_score   (ai_importance DESC)
INDEX idx_hotspots_source  (source)

-- 浏览器 Push 订阅
subscriptions (id PK, endpoint UNIQUE, p256dh, auth, created_at)

-- 数据源心跳（监控调度健康）
source_status (source PK, last_run_at, last_status, last_error, last_count)

-- AI 结果缓存（24h TTL，避免重复调用）
ai_cache (content_hash PK, score, importance, summary, matched_keywords, created_at)
```

## 5. 关键设计决策

### 5.1 为什么用 fnv1a 而非 sha1？

- 8 字符足够区分热点（碰撞概率 < 10⁻⁸ 对 10 万条）
- fnv1a 是 O(n) 无依赖；Node 内置 crypto 也能跑，但 fnv1a 更快

### 5.2 为什么 classify + summarize 两阶段？

- 分类只需 8B 模型，毫秒级，决定要不要花钱生成摘要
- 仅 `score ≥ 0.4` 才调 70B 摘要模型，省钱
- 同条目 24h 内命中缓存跳过

### 5.3 为什么 GitHub 用 Search API 而非抓 trending？

- github.com/trending 是 React SPA，HTML 不含数据
- Search API：`/search/repositories?q=stars:>300+pushed:>YYYY-MM-DD&sort=stars`
- 免费 token 5000 req/h，足够

### 5.4 为什么前端走 Vite 构建而非 CDN ESM？

- Aceternity UI 用 Framer Motion + JSX，必须打包
- Vite 输出 110KB gzip，比 CDN 加载多个 ESM 还小
- 自定义 closeBundle 钩子复制 Service Worker

### 5.5 为什么 WS 用 framer-motion 而非 CSS keyframes？

- 入场/退场需要 React 状态感知（如新条目 isNew）
- 复杂过渡（layout / AnimatePresence）CSS 写不出
- 但全包大小仅 ~30KB gzipped，可接受

## 6. 失败模式与降级

| 失败 | 影响 | 降级策略 |
|---|---|---|
| OpenRouter 429 | 摘要缺失 | 4s 退避重试 3 次；最终 score=0 importance=0，仍入库 |
| 单源 HTTP 失败 | 该源无新数据 | scheduler 记入 source_status，其他源不受影响 |
| HuggingFace 国内不可达 | 该源始终空 | 已实现优雅降级，状态标 ok count=0 |
| Twitter API key 失效 | 401 | source fetch 返回空，日志 warn，其他源继续 |
| VAPID 未生成 | 无法 Push | 自动 generate + 持久化 .env |
| WS 客户端断线 | 无法实时 | 客户端 3s 自动重连 |

## 7. 安全

- `.env` 不入库（`.gitignore`）
- VAPID 私钥不入日志
- HTTP API 仅监听 localhost（生产应加防火墙）
- API 无鉴权 → 仅适合单机部署（用户已确认 W2 不做）

## 8. 未来扩展点

- [ ] 每日邮件聚合任务（cron 9:00 / 21:00 触发）
- [ ] 关键词正则匹配支持
- [ ] 移动端 PWA 完整化（offline-first）
- [ ] SQLite → Postgres 升级路径
- [ ] 多用户支持（加 JWT）