# DL-monitor

[English](README.md) | **中文**

> AI 编程博主专用的热点雷达 — 配置关键词，多源自动抓取，AI 打分与中文摘要，
> Web Push + WebSocket + 邮件三重通道实时推到博主嘴边。

[快速开始](#快速开始) · [数据源](#数据源) · [前端能力](#前端能力) · [Agent Skill](#作为-agent-skill-使用) · [文档](#文档)

---

## 为什么是 DL-monitor

做 AI 编程方向的博主,手动刷 HackerNews / X(Twitter) / GitHub Trending / B站找选题,既慢又漏。
DL-monitor 用 cron 把这些信号聚到一个 dashboard,OpenRouter 做相关性与重要性打分,中文摘要
一眼看出价值,重要热点 Web Push 弹通知 + WebSocket 实时插卡片 + 邮件聚合兜底。

> **适用对象**: 单机部署、个人使用、不需要账号系统、不需要鉴权。设计决策见 [`docs/requirements.md`](docs/requirements.md)。

---

## 特性

- **14 个内置数据源** — HackerNews / GitHub Trending / HuggingFace / arXiv / X(Twitter) /
  B站(视频 + UP主) / Google News / 知乎热搜 / 微博热搜(需自部署 RSSHub),均实现统一
  `BaseSource` 接口,失败互不影响。
- **AI 中文摘要 + 重要性打分** — OpenRouter 两阶段流水线: 8B 模型分类筛 0.4,70B 模型生成
  30-80 字中文摘要;24h 缓存避免重复调用,429 指数退避。
- **三层质量过滤** — 源端硬阈值(粉丝/播放/stars) + KOL 白名单(twitter) + AI 加权
  (verified / followers / views),过滤噪音保留信号。
- **三重推送通道** — WebSocket 实时插流 / Web Push 浏览器后台弹通知(VAPID 自动生成) /
  邮件每日 9 点 / 21 点聚合(可关)。
- **前端全功能 dashboard** — 信息源筛选、排序(最新/原文时间/AI 重要度/热度爆发率 vph)、
  时间窗口、重要性区间、关键词命中、一键标签(仅 KOL / 仅爆款)、视图预设(localStorage
  + URL 同步)、Toast 推送历史抽屉。
- **DB 驱动信息源管理** — `sources` 表统一管理内置源开关与用户自加源,UI 增删改切立即
  重启 scheduler,关闭后数据保留(重启用)恢复)。
- **账号识别语法** — 关键词前缀 `@` (如 `@karpathy`、`@机器之心`) 自动走 B站 UP主
  查询路径,渲染为博主卡片(头像 / 签名 / 粉丝)。
- **3-tier retention** — Hot → Archived → Deleted,按 views 与时间窗分级,默认 7 天窗口
  + 10万 views 归档阈值,每天凌晨 03:37 跑。
- **Agent Skill 一等公民** — 自带 [`skills/ai-hotspot-monitor/`](skills/ai-hotspot-monitor/),其他 AI 可直接调用抓取 /
  摘要 / 取热点 JSON。

---

## 快速开始

### 1. 环境要求

| 组件 | 最低版本 | 说明 |
|---|---|---|
| Node.js | 24+ | 用内置 `node:sqlite`,免编译 |
| 操作系统 | Windows / macOS / Linux | 全栈 Node,无外部依赖 |
| 浏览器 | Chrome / Edge / Firefox / Safari 最近 2 版 | Web Push 需支持 Push API |

### 2. 安装与启动

```bash
# 1. 克隆并装依赖
git clone <repo-url> && cd DL-monitor
npm install
npm --prefix web install

# 2. 配置(至少填 OPENROUTER_KEY 与 TWITTER_API_KEY)
cp .env.example .env
# 编辑 .env,填 OPENROUTER_KEY(https://openrouter.ai/keys)

# 3. 构建前端(首次或前端变更后)
npm run build:web

# 4. 启动
npm start
# → http://localhost:3000
```

启动后会自动:

1. 用 `node:sqlite` (Node 24 内置)创建 `data/monitor.db`
2. 生成 VAPID 密钥并保存到 `.env`
3. 启动 8 个 cron 任务(HN / GitHub / HF / arXiv / Twitter / B站 / Google / 知乎热搜 等)
4. 立即跑一次各数据源

### 3. 开发模式(HMR)

```bash
# 终端 1
npm run dev                  # node --watch server/index.js

# 终端 2
npm --prefix web run dev     # Vite dev server,自动代理 /api 与 /ws 到 3000
# → http://localhost:5173
```

只重启前端:`npm run build:web`,server 下次请求自动 serve 新版。

---

## 配置

完整配置见 [`.env.example`](.env.example)。**关键变量**:

### 必填

| 变量 | 说明 |
|---|---|
| `OPENROUTER_KEY` | OpenRouter API key,无此 key AI 打分 / 摘要全部失败 |
| `TWITTER_API_KEY` | twitterapi.io key,新用户 $0.1 免费额度 |

### 推荐

| 变量 | 默认 | 说明 |
|---|---|---|
| `OPENROUTER_CLASSIFY_MODEL` | `meta-llama/llama-3.1-8b-instruct` | 相关性分类,小模型快 |
| `OPENROUTER_SUMMARIZE_MODEL` | `meta-llama/llama-3.3-70b-instruct` | 中文摘要,质量稳 |
| `GITHUB_TOKEN` | (空) | 加后 GitHub search 限流 10 → 30 req/min |
| `BILIBILI_SESSDATA` | (空) | 加后 B站搜索限额 100 → 1000+ / 天 |
| `TWITTER_QUERIES` | `Claude,GPT-5,DeepSeek,Qwen` | 监控的搜索关键词,逗号分隔,最多 5 个 |

### 数据源开关

```env
SOURCE_HACKERNEWS=1
SOURCE_GITHUB=1
SOURCE_HUGGINGFACE=1
SOURCE_ARXIV=1
SOURCE_TWITTER=0           # 默认关闭,twitterapi.io 余额有限
SOURCE_BILIBILI=1
SOURCE_GOOGLE=1
SOURCE_ZHIHU_TRENDS=1      # 公开 API 免 KEY,默认开
SOURCE_WEIBO_TRENDS=0      # 需自部署 RSSHub 实例,默认关
```

> 所有 `SOURCE_*` 与 cron 频率可在 UI 中通过 SourcePanel 直接调整,DB 驱动,即时生效,
> 无需重启服务。

---

## 数据源

每个源实现统一 `BaseSource` 接口 `fetch() → [{title, url, content, source, source_id, published_at, meta}]`,
失败被 try/catch 隔离,单源异常不阻塞其他源。

| 数据源 | 端点 | KEY | 阈值过滤 |
|---|---|---|---|
| **HackerNews** | Firebase REST API | ❌ | `HN_MIN_SCORE` ≥ 50 + `HN_MIN_DESCENDANTS` ≥ 20 |
| **GitHub Trending** | Search API | 可选 token | `GITHUB_MIN_STARS` ≥ 200 + 时间窗 |
| **HuggingFace** | `/api/models` + `/api/papers` | ❌ | `HF_MIN_DOWNLOADS` ≥ 1000 + 时间窗(默认 168h) |
| **arXiv** | `export.arxiv.org/api/query` | ❌(需 UA) | 仅时间窗(默认 168h) |
| **X(Twitter)** | twitterapi.io advanced_search | ✅ | 粉丝 ≥ 5000 + 浏览 ≥ 2000 + 白名单豁免 + L3 AI 加权 |
| **B站** | `api.bilibili.com/.../search/all/v2` | 可选 SESSDATA | 视频播放 ≥ 2000 + UP主粉丝 ≥ 5000 + 6h 窗 |
| **Google News** | RSS | ❌ | 仅时间窗(默认 6h) |
| **知乎热搜词** | `/api/v4/search/top_search` | ❌ | 无文章详情,作为"今日热议信号",命中关键词时 AI importance +0.1~0.2 |
| **微博热搜** | RSSHub `/weibo/search/hot` | 需 RSSHub | 同上信号逻辑 |
| **账号识别**(B站 UP主) | B站 user search | 可选 SESSDATA | 关键词前缀 `@` 自动启用,UP主粉丝 ≥ 5000 |
| **用户自加源** | RSS / HTML 标题抓取 | — | RSS 自动发现,降级 `<article>` / `<h2>` / `<li><a>` |

> [!NOTE]
> **HuggingFace 国内常失败**,已实现优雅降级(`count=0` 不报错);Twitter 余额耗尽时
> 服务整体仍可工作,其他源不受影响。
> **zhihu-trends 偶发 403** — 服务自动重试,不影响其他源。

详见 [`docs/data-sources.md`](docs/data-sources.md)。

---

## 前端能力

### 三栏布局(Aceternity UI 风格)

```
┌─Header(WS / Push / AI 状态指示)─┬─KeywordPanel(关键词增删 / 阈值)─┐
│                                  ├─SourcePanel(信息源管理 + 心跳)   │
│                                  ├─WhitelistPanel(Twitter KOL 白名单)│
│                                  └─ToastStack(实时推送 + 📜历史抽屉)  │
└─HotspotStream(两行工具栏 + 卡片列表) ──────────────────────────────┘
```

### 工具栏两行布局

**第一行**: 信息源筛选 — 多选 chip,实时显示每个源 (通过 `count-by-source` API)。

**第二行**(从左到右):
1. 排序方式: 最新抓取 / 原文时间 / AI 重要度 / 热度爆发率(vph = views / hours_since_published)
2. 时间窗口: 1h / 6h / 24h / 3d / 7d / 全部
3. 重要性区间(双滑块,0-1)
4. 关键词命中(多选 chip)
5. 一键标签: 仅 KOL / 仅爆款
6. 视图预设: 保存当前视图(localStorage) / 一键应用 / 删除
7. 重置

### Toast 推送历史(`📜` 抽屉)

实时推送的 Toast 默认 8 秒消失,`📜` 历史按钮汇总所有推送条目:

- localStorage 持久化(`dl-monitor.toastHistory`),上限 200 条 FIFO
- 每条支持未读 / 已读切换、未读高亮
- 全部标记已读、清空、单条删除
- 抽屉用 Framer Motion `AnimatePresence` 进出,移动端自适应

### 视图预设(localStorage + URL 同步)

当前 filter / 排序 / 时间窗 / 重要性区间 / 关键词命中一键打包成 base64 写进 URL hash,
分享即同步视图。预设命名后存 localStorage(`dl-monitor.viewPresets`),可一键调用。

### z-index stacking 修复

使用 framer-motion `mode="popLayout"` 时多层 stacking context 会让下拉菜单被
下方卡片覆盖。已修复: 工具栏 `z-50`,列表容器 `z-0`,卡片 `z-0`,下拉面板 `z-50`。

---

## 作为 Agent Skill 使用

把 `skills/ai-hotspot-monitor/` 复制到其他 AI 项目的 skills 目录:

```bash
# Claude Code 项目
cp -r DL-monitor/skills/ai-hotspot-monitor .claude/skills/
```

调用示例(其他 AI 可直接执行):

```bash
node skills/ai-hotspot-monitor/scripts/check.js
node skills/ai-hotspot-monitor/scripts/summarize.js --hours=24
node skills/ai-hotspot-monitor/scripts/summarize.js --hours=6 --source=arxiv --min_importance=0.6
```

返回标准化 JSON,字段契约见 [`docs/api-reference.md`](docs/api-reference.md) 第 5 节。
Skill 自身文档见 [`skills/ai-hotspot-monitor/SKILL.md`](skills/ai-hotspot-monitor/SKILL.md)。

---

## 项目结构

```
DL-monitor/
├── server/                  # 后端(Node 24 + Express + ws + node:sqlite)
│   ├── index.js             # 入口(Express + WS + scheduler)
│   ├── config.js            # 读 .env,集中所有可配置项
│   ├── db.js                # node:sqlite 封装,prepared statements
│   ├── sources/             # 14 个数据源 + base.js + quality.js + account-resolver
│   │   ├── base.js          # defineSource / safeFetchJSON 公共工具
│   │   ├── hackernews.js
│   │   ├── github.js
│   │   ├── huggingface.js
│   │   ├── arxiv.js
│   │   ├── twitter.js
│   │   ├── bilibili.js      # 视频 + UP主
│   │   ├── google.js
│   │   ├── zhihu-trends.js
│   │   ├── weibo-trends.js  # 需 RSSHub
│   │   ├── account-resolver.js
│   │   ├── user-source.js   # 用户自加源(RSS/HTML 降级)
│   │   └── quality.js       # 通用质量过滤
│   ├── ai/
│   │   ├── openrouter.js    # fetch 封装,3 次重试,429 退避
│   │   └── analyze.js       # classify + summarize 两阶段
│   ├── monitor/
│   │   ├── scheduler.js     # node-cron,按源独立调度
│   │   ├── pipeline.js      # 抓取 → 去重 → AI → 通知
│   │   └── retention.js     # 3-tier retention
│   ├── notify/
│   │   ├── socket.js        # WS 广播
│   │   ├── push.js          # web-push(VAPID)
│   │   └── email.js         # nodemailer(每日 9 / 21 点聚合)
│   └── routes/
│       ├── api.js           # /api/keywords /api/hotspots /api/status /api/run /api/sources
│       └── push.js          # /api/push/vapid /api/push/subscribe
├── web/                     # 前端(React 18 + Vite + Tailwind + Framer Motion)
│   ├── src/
│   │   ├── App.jsx          # 三栏布局 + WS 接收
│   │   ├── lib/             # api / utils / ws
│   │   ├── hooks/           # useHotspots / useViewPresets / useToastHistory / ...
│   │   └── components/      # Header / SourcePanel / HotspotStream / ToastStack / ui/...
│   ├── vite.config.js       # build + 复制 sw.js/manifest.json 到 dist
│   └── tailwind.config.js   # aurora / border-beam / shimmer 动画
├── skills/
│   └── ai-hotspot-monitor/  # Agent Skill(自包含,可被其他 AI 调用)
├── docs/                    # 设计 / API / 运维文档
│   ├── README.md
│   ├── requirements.md      # 用户原始需求 + 决策日志
│   ├── architecture.md      # 系统架构 + 数据流 + Schema
│   ├── data-sources.md      # 数据源集成细节 + 新增 checklist
│   ├── api-reference.md     # HTTP / WS 接口契约
│   ├── deployment.md        # 安装 + 配置 + 故障排查
│   └── audit.md             # 第三方 API / 库审计
├── data/                    # 运行时生成
│   └── monitor.db           # SQLite(node:sqlite 内置,WAL 模式)
├── .env.example             # 配置模板
├── package.json             # 后端依赖 + 脚本
└── README.md                # 你正在读(中文版,英文版见 README.md)
```

---

## 故障排查

| 症状 | 排查 |
|---|---|
| 浏览器打不开 `localhost:3000` | `npm start` 是否还在(30 分钟后台超时会被杀);`Get-NetTCPConnection -LocalPort 3000` 看监听 |
| Console 报白屏 / TypeError | 检查 SourcePanel / HotspotStream 是否漏解构 hooks 新增的 `refresh / error` |
| 下拉菜单被卡片遮挡 | 工具栏 `z-50` + 列表 `z-0` + 卡片 `z-0` + 下拉 `z-50`(`framer-motion mode=popLayout` 副作用) |
| 看不到新前端 | 检查 `web/dist/index.html`;旧版无 curl 头是 `<!DOCTYPE html><html lang="zh-CN" class="dark">` |
| Push 收不到 | 检查浏览器通知权限;`SELECT * FROM subscriptions;` 确认 endpoint;VAPID key 是否在 `.env` |
| OpenRouter 429 | 已自动 4s 退避 3 次,单条 AI 失败不阻塞其他条目;免费模型限流紧可换付费 |
| Twitter 报 402 | twitterapi.io 余额耗尽;服务整体仍工作,其他源不受影响 |
| HuggingFace 无数据 | 国内访问受限是已知问题,`source_status` 显示 `ok count=0` 是正常的 |
| 数据库锁了 | `monitor.db-shm / -wal` 是 WAL 模式正常行为;确保只跑一个 server 进程 |
| arXiv 报 429 | 需设 User-Agent(已在源码);429 自动 4s 退避,最多 3 次 |

---

## 文档

按用途选:

- **想跑起来 / 部署 / 排错** → [`docs/deployment.md`](docs/deployment.md)
- **想了解为什么这么设计** → [`docs/architecture.md`](docs/architecture.md) + [`docs/requirements.md`](docs/requirements.md)(含 11 条决策日志)
- **想加一个数据源** → [`docs/data-sources.md`](docs/data-sources.md)(新增 checklist)
- **想扩展 HTTP / WS API** → [`docs/api-reference.md`](docs/api-reference.md)
- **想知道第三方依赖的审计记录** → [`docs/audit.md`](docs/audit.md)

---

## 设计取舍

> [!IMPORTANT]
> 本项目刻意不做:W1 用户账号系统 / W2 多租户鉴权 / W3 移动 App。理由: 单机部署、
> 个人使用、不追求商业化。决策历史见 [`docs/requirements.md`](docs/requirements.md) 第 3 节。

- **为什么 fnv1a 而非 sha1?** — 8 字符足够区分热点(碰撞概率 < 10⁻⁸ / 10 万条),Node 原生快。
- **为什么 classify + summarize 两阶段?** — 8B 分类决定要不要花钱,省钱。
- **为什么 GitHub 用 Search API 而非 trending 页?** — github.com/trending 是 React SPA,HTML 无数据。
- **为什么前端走 Vite 构建?** — Framer Motion + JSX 必须打包;gzip 后约 119 KB。
- **API 无鉴权** — 仅适合单机部署,生产应加防火墙或反向代理鉴权层。