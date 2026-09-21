# DL-monitor

**English** | [中文](README.zh-CN.md)

> A hotspot radar for AI-programming content creators — configure keywords,
> pull signals from 14 sources, AI relevance scoring and Chinese summary,
> three-channel push (Web Push + WebSocket + email digest) to your desk.

[Quick Start](#quick-start) · [Data Sources](#data-sources) · [Frontend Features](#frontend-features) · [Agent Skill](#use-as-an-agent-skill) · [Documentation](#documentation)

---

## Why DL-monitor

AI-programming creators spend hours each week scanning HackerNews, X(Twitter), GitHub Trending
and B站 for story ideas — slow, and easy to miss the first wave.
DL-monitor funnels those signals into one dashboard via cron jobs. OpenRouter scores relevance
and importance, then produces a 30–80 character Chinese summary so you can read the value
in a glance. High-importance hits trigger Web Push notifications, WebSocket card inserts, and
a daily email digest as a safety net.

> **Target use case**: single-machine deploy, personal use, no account system, no auth.
> Design rationale lives in [`docs/requirements.md`](docs/requirements.md).

---

## Features

- **14 built-in data sources** — HackerNews / GitHub Trending / HuggingFace / arXiv /
  X(Twitter) / B站 (videos + UP-hosts) / Google News / Zhihu trends / Weibo trends (self-hosted RSSHub),
  all implement a unified `BaseSource` interface; failures are isolated.
- **AI Chinese summary + importance scoring** — OpenRouter two-stage pipeline:
  an 8B model classifies (threshold 0.4) before a 70B model generates a 30–80 character Chinese summary;
  24h cache avoids repeated calls; 429 → exponential backoff.
- **Three-layer quality filtering** — Source-side hard thresholds (followers / plays / stars)
  + KOL whitelist (Twitter) + AI weighting (verified / followers / views) to keep signal and drop noise.
- **Triple push channels** — WebSocket realtime card insert / Web Push notifications when the
  browser is in background (VAPID auto-generated) / email aggregation at 9 AM and 9 PM (toggleable).
- **Full-featured frontend dashboard** — Source filtering, sorting (latest / published time /
  AI importance / virality vph), time window, importance range, keyword hit, one-click labels
  (KOL-only / burst-only), view presets (localStorage + URL sync), Toast push history drawer.
- **DB-driven source management** — A single `sources` table unifies built-in toggles and
  user-added sources; the UI add / delete / edit / toggle path restarts the scheduler on the
  spot. Disabled sources keep their data (so re-enabling restores history).
- **Account recognition syntax** — Keywords prefixed with `@` (e.g. `@karpathy`, `@机器之心`)
  automatically route through B站 UP-host queries and render as creator cards (avatar / bio / follower count).
- **3-tier retention** — Hot → Archived → Deleted, partitioned by view count and time window.
  Defaults: 7-day window + 100k views archive threshold, runs at 03:37 daily.
- **Agent Skill first-class** — Ships [`skills/ai-hotspot-monitor/`](skills/ai-hotspot-monitor/);
  other AIs can call fetch / summarize / list endpoints directly.

---

## Quick Start

### 1. Requirements

| Component | Minimum | Notes |
|---|---|---|
| Node.js | 24+ | Uses the built-in `node:sqlite`, no native compile |
| OS | Windows / macOS / Linux | All Node, no external service |
| Browser | Chrome / Edge / Firefox / Safari, latest 2 | Web Push requires the Push API |

### 2. Install and start

```bash
# 1. Clone and install dependencies
git clone <repo-url> && cd DL-monitor
npm install
npm --prefix web install

# 2. Configure (at minimum fill OPENROUTER_KEY and TWITTER_API_KEY)
cp .env.example .env
# Edit .env, set OPENROUTER_KEY (https://openrouter.ai/keys)

# 3. Build the frontend (first time or after frontend changes)
npm run build:web

# 4. Start
npm start
# → http://localhost:3000
```

On startup, DL-monitor will automatically:

1. Create `data/monitor.db` via the built-in `node:sqlite`
2. Generate VAPID keys and persist them to `.env`
3. Start 8 cron jobs (HN / GitHub / HF / arXiv / Twitter / B站 / Google / Zhihu trends, etc.)
4. Run each data source once immediately

### 3. Development mode

```bash
# Terminal 1
npm run dev                  # node --watch server/index.js

# Terminal 2
npm --prefix web run dev     # Vite dev server, proxies /api and /ws to 3000
# → http://localhost:5173
```

To rebuild only the frontend: `npm run build:web`. The server serves the new bundle on the next request (no cache).

---

## Configuration

Full configuration reference lives in [`.env.example`](.env.example). **Key variables**:

### Required

| Variable | Description |
|---|---|
| `OPENROUTER_KEY` | OpenRouter API key. Without it, AI scoring / summarization fails entirely |
| `TWITTER_API_KEY` | twitterapi.io key. New accounts get $0.1 free credit |

### Recommended

| Variable | Default | Description |
|---|---|---|
| `OPENROUTER_CLASSIFY_MODEL` | `meta-llama/llama-3.1-8b-instruct` | Relevance classification, small and fast |
| `OPENROUTER_SUMMARIZE_MODEL` | `meta-llama/llama-3.3-70b-instruct` | Chinese summary, quality + speed |
| `GITHUB_TOKEN` | (empty) | Bumps GitHub search rate limit 10 → 30 req/min |
| `BILIBILI_SESSDATA` | (empty) | Raises B站 search limit 100 → 1000+ / day |
| `TWITTER_QUERIES` | `Claude,GPT-5,DeepSeek,Qwen` | Monitored search terms, comma-separated, max 5 |

### Source toggles

```env
SOURCE_HACKERNEWS=1
SOURCE_GITHUB=1
SOURCE_HUGGINGFACE=1
SOURCE_ARXIV=1
SOURCE_TWITTER=0           # Off by default, twitterapi.io balance is limited
SOURCE_BILIBILI=1
SOURCE_GOOGLE=1
SOURCE_ZHIHU_TRENDS=1      # Public API, no KEY required, on by default
SOURCE_WEIBO_TRENDS=0      # Needs self-hosted RSSHub, off by default
```

> All `SOURCE_*` and cron schedules can be adjusted in the UI via the SourcePanel — DB-driven
> and applied instantly, no service restart needed.

---

## Data Sources

Each source implements a unified `BaseSource` interface `fetch() → [{title, url, content, source, source_id, published_at, meta}]`.
Failures are isolated by try/catch; one source throwing never blocks the others.

| Source | Endpoint | KEY | Threshold filter |
|---|---|---|---|
| **HackerNews** | Firebase REST API | ❌ | `HN_MIN_SCORE` ≥ 50 + `HN_MIN_DESCENDANTS` ≥ 20 |
| **GitHub Trending** | Search API | optional token | `GITHUB_MIN_STARS` ≥ 200 + time window |
| **HuggingFace** | `/api/models` + `/api/papers` | ❌ | `HF_MIN_DOWNLOADS` ≥ 1000 + time window (default 168h) |
| **arXiv** | `export.arxiv.org/api/query` | ❌ (needs UA) | Time window only (default 168h) |
| **X(Twitter)** | twitterapi.io advanced_search | ✅ | followers ≥ 5000 + views ≥ 2000 + whitelist bypass + L3 AI weighting |
| **B站** | `api.bilibili.com/.../search/all/v2` | optional SESSDATA | video plays ≥ 2000 + UP-host followers ≥ 5000 + 6h window |
| **Google News** | RSS | ❌ | Time window only (default 6h) |
| **Zhihu trends** | `/api/v4/search/top_search` | ❌ | No article detail — used as a "trending signal"; matching keywords bump AI importance +0.1~0.2 |
| **Weibo trends** | RSSHub `/weibo/search/hot` | requires RSSHub | Same signal logic as Zhihu |
| **Account recognition** (B站 UP-host) | B站 user search | optional SESSDATA | Triggered automatically when a keyword starts with `@`, UP-host followers ≥ 5000 |
| **User-added source** | RSS / HTML title scrape | — | Auto-detect RSS, fallback `<article>` / `<h2>` / `<li><a>` |

> [!NOTE]
> **HuggingFace often fails in mainland China** — graceful degradation is implemented (`count=0`
> does not error). When the Twitter balance is exhausted the service still works normally —
> other sources are unaffected.
> **zhihu-trends occasionally returns 403** — automatic retry, other sources unaffected.

See [`docs/data-sources.md`](docs/data-sources.md) for full integration notes.

---

## Frontend Features

### Three-column layout (Aceternity UI)

```
┌─Header (WS / Push / AI status)──┬─KeywordPanel (keyword CRUD / thresholds)─┐
│                                  ├─SourcePanel (source management + heartbeat)│
│                                  ├─WhitelistPanel (Twitter KOL whitelist)     │
│                                  └─ToastStack (realtime push + 📜 history)    │
└─HotspotStream (two-row toolbar + card list) ──────────────────────────────┘
```

### Two-row toolbar

**Row 1**: Source filter — multi-select chips, live count per source via the `count-by-source` API.

**Row 2** (left to right):
1. Sort: latest fetched / original published / AI importance / virality rate (`vph = views / hours_since_published`)
2. Time window: 1h / 6h / 24h / 3d / 7d / all
3. Importance range (dual-handle slider, 0–1)
4. Keyword hit (multi-select chips)
5. One-click labels: KOL only / burst only
6. View presets: persist the current view (localStorage) / apply one-tap / delete
7. Reset

### Toast push history (`📜` drawer)

Realtime Toast notifications fade after 8 seconds by default. The `📜` history button
aggregates every push entry:

- Persisted in localStorage (`dl-monitor.toastHistory`), cap 200 FIFO
- Each entry supports unread / read toggle, unread highlight
- "Mark all read", "Clear all", per-entry delete
- Drawer enter / leave via Framer Motion `AnimatePresence`, mobile-friendly

### View presets (localStorage + URL sync)

The current filter / sort / time window / importance range / keyword hit can be packed into
base64 in the URL hash with one click — share the URL to share the view. Named presets
persist in localStorage (`dl-monitor.viewPresets`) for one-tap recall.

### z-index stacking fix

When `framer-motion`'s `mode="popLayout"` introduces multiple stacking contexts, dropdown
panels end up covered by cards below. Fixed by: toolbar `z-50`, list container `z-0`,
cards `z-0`, dropdown panels `z-50`.

---

## Use as an Agent Skill

Copy `skills/ai-hotspot-monitor/` into another AI project's skills directory:

```bash
# In a Claude Code project
cp -r DL-monitor/skills/ai-hotspot-monitor .claude/skills/
```

Other AIs can then execute directly:

```bash
node skills/ai-hotspot-monitor/scripts/check.js
node skills/ai-hotspot-monitor/scripts/summarize.js --hours=24
node skills/ai-hotspot-monitor/scripts/summarize.js --hours=6 --source=arxiv --min_importance=0.6
```

Responses are standardized JSON. Field contract lives in
[`docs/api-reference.md`](docs/api-reference.md) §5.
The Skill's own docs live in [`skills/ai-hotspot-monitor/SKILL.md`](skills/ai-hotspot-monitor/SKILL.md).

---

## Project Structure

```
DL-monitor/
├── server/                  # Backend (Node 24 + Express + ws + node:sqlite)
│   ├── index.js             # Entry point (Express + WS + scheduler)
│   ├── config.js            # Reads .env, centralizes all configurable items
│   ├── db.js                # node:sqlite wrapper, prepared statements
│   ├── sources/             # 14 data sources + base.js + quality.js + account-resolver
│   │   ├── base.js          # defineSource / safeFetchJSON shared utilities
│   │   ├── hackernews.js
│   │   ├── github.js
│   │   ├── huggingface.js
│   │   ├── arxiv.js
│   │   ├── twitter.js
│   │   ├── bilibili.js      # Videos + UP-hosts
│   │   ├── google.js
│   │   ├── zhihu-trends.js
│   │   ├── weibo-trends.js  # Requires RSSHub
│   │   ├── account-resolver.js
│   │   ├── user-source.js   # User-added sources (RSS / HTML fallback)
│   │   └── quality.js       # Shared quality filtering
│   ├── ai/
│   │   ├── openrouter.js    # fetch wrapper, 3 retries, 429 backoff
│   │   └── analyze.js       # classify + summarize two stages
│   ├── monitor/
│   │   ├── scheduler.js     # node-cron, per-source scheduling
│   │   ├── pipeline.js      # fetch → dedup → AI → notify
│   │   └── retention.js     # 3-tier retention
│   ├── notify/
│   │   ├── socket.js        # WS broadcast
│   │   ├── push.js          # web-push (VAPID)
│   │   └── email.js         # nodemailer (daily 9 AM / 9 PM digest)
│   └── routes/
│       ├── api.js           # /api/keywords /api/hotspots /api/status /api/run /api/sources
│       └── push.js          # /api/push/vapid /api/push/subscribe
├── web/                     # Frontend (React 18 + Vite + Tailwind + Framer Motion)
│   ├── src/
│   │   ├── App.jsx          # Three-column layout + WS receiver
│   │   ├── lib/             # api / utils / ws
│   │   ├── hooks/           # useHotspots / useViewPresets / useToastHistory / ...
│   │   └── components/      # Header / SourcePanel / HotspotStream / ToastStack / ui/...
│   ├── vite.config.js       # Build + copy sw.js / manifest.json into dist
│   └── tailwind.config.js   # aurora / border-beam / shimmer animations
├── skills/
│   └── ai-hotspot-monitor/  # Agent Skill (self-contained, callable by other AIs)
├── docs/                    # Design / API / Operations docs
│   ├── README.md
│   ├── requirements.md      # Original requirements + decision log
│   ├── architecture.md      # System architecture + data flow + schema
│   ├── data-sources.md      # Source integration details + add-source checklist
│   ├── api-reference.md     # HTTP / WS contract
│   ├── deployment.md        # Install + config + troubleshooting
│   └── audit.md             # Third-party API / library audit
├── data/                    # Runtime generated
│   └── monitor.db           # SQLite (built-in node:sqlite, WAL mode)
├── .env.example             # Configuration template
├── package.json             # Backend dependencies + scripts
└── README.md                # You are here
```

---

## Troubleshooting

| Symptom | What to check |
|---|---|
| Browser cannot reach `localhost:3000` | Is `npm start` still running? (Background tasks die at 30-minute timeout.) Verify with `Get-NetTCPConnection -LocalPort 3000` |
| White screen / TypeError in console | Check whether SourcePanel / HotspotStream missed destructuring the new `refresh / error` from `useHotspots` |
| Dropdown covered by cards | Toolbar `z-50` + list `z-0` + cards `z-0` + dropdowns `z-50` (framer-motion `mode="popLayout"` side effect) |
| Cannot see new frontend | Check `web/dist/index.html` exists; the first line should be `<!DOCTYPE html><html lang="zh-CN" class="dark">` |
| No push notifications | Check browser notification permission; `SELECT * FROM subscriptions;` to verify the endpoint; ensure VAPID keys exist in `.env` |
| OpenRouter 429 | Auto 4s backoff, 3 retries; single AI failure does not block other items; free models are tight, switch to paid if needed |
| Twitter 402 | twitterapi.io balance exhausted; the service still works, other sources are unaffected |
| HuggingFace empty | Mainland-China access is restricted by design — `source_status` showing `ok count=0` is normal |
| Database locked | `monitor.db-shm / -wal` files are normal in WAL mode; ensure only one server process is running |
| arXiv 429 | Requires User-Agent header (already set in code); auto 4s backoff, max 3 retries |

---

## Documentation

Pick by intent:

- **Run / deploy / troubleshoot** → [`docs/deployment.md`](docs/deployment.md)
- **Why this design** → [`docs/architecture.md`](docs/architecture.md) + [`docs/requirements.md`](docs/requirements.md) (11-entry decision log)
- **Add a data source** → [`docs/data-sources.md`](docs/data-sources.md) (add-source checklist)
- **Extend HTTP / WS API** → [`docs/api-reference.md`](docs/api-reference.md)
- **Third-party dependency audit** → [`docs/audit.md`](docs/audit.md)

---

## Design Tradeoffs

> [!IMPORTANT]
> Deliberately **not** in scope: W1 user accounts / W2 multi-tenant auth / W3 mobile app.
> Rationale: single-machine deployment, personal use, not pursuing commercialization.
> Decision history: [`docs/requirements.md`](docs/requirements.md) §3.

- **Why fnv1a instead of sha1?** — 8 characters are enough to disambiguate hotspots
  (collision probability < 10⁻⁸ over 100k entries); Node-native and fast.
- **Why classify + summarize in two stages?** — The 8B classifier decides whether to spend
  tokens on the 70B summarizer — saves money.
- **Why GitHub Search API instead of the trending page?** — `github.com/trending` is a React SPA
  with no data in the initial HTML.
- **Why Vite for the frontend?** — Framer Motion + JSX requires a bundler; gzipped output is
  around 119 KB.
- **No API auth** — Only safe for single-machine deploy. Add a firewall or reverse-proxy auth
  layer in production.