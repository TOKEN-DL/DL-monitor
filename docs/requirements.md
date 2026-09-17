# DL-monitor 需求文档

## 1. 用户画像

**身份**：AI 编程博主
**痛点**：手动刷 HackerNews / Twitter / GitHub Trending 找热点效率低，常常错过第一时间分享机会
**核心诉求**：让"信号到嘴边"的速度大于"打开网页、搜索、判断、复制"的速度

> "我急切地想要发现热点，想要第一时间给大家分享有价值的内容。"

## 2. 功能需求

### 2.1 必须 (Must)

| 编号 | 描述 |
|---|---|
| F1 | 用户手动输入"关键词"列表（如 `Claude`、`GPT-5`、`DeepSeek`），系统据此判断相关性 |
| F2 | 系统定期从多个公开数据源自动抓取内容（用户无需手动触发） |
| F3 | 用户可在统一界面查看所有热点，按重要性/来源/关键词过滤 |
| F4 | 高分热点通过浏览器 Web Push 实时通知 |
| F5 | 前端响应式设计，手机/平板/桌面都能用 |
| F6 | 整体封装为 Agent Skill，可被其他 AI 调用（输入关键词，输出热点 JSON） |
| F7 | 至少接入 5 个数据源以避免单点失败 |
| F8 | AI 摘要用中文，简洁（30-80 字），让博主一眼看出价值 |

### 2.2 应该 (Should)

| 编号 | 描述 |
|---|---|
| S1 | 邮件聚合推送（每日 Top 10）——SMTP 占位即可，留给用户自配 |
| S2 | 关键词分级（模型 / 工具 / 论文 / 新闻），方便博主分类订阅 |
| S3 | 通知阈值可调（按关键词设置相关性阈值） |
| S4 | 单热点 24h 内不重复通知 |
| S5 | OpenRouter 调用失败重试 + 指数退避，避免 429 拖垮流程 |

### 2.3 可以 (Could)

| 编号 | 描述 |
|---|---|
| C1 | 移动端 PWA（添加到桌面） |
| C2 | 推文点赞/转发数显示 |
| C3 | 关键词命中颜色高亮 |

### 2.4 不做 (Won't)

| 编号 | 描述 |
|---|---|
| W1 | 用户账号系统（单机部署，自己用） |
| W2 | 多租户 / 鉴权 |
| W3 | 移动 App |

## 3. 决策日志

### D1：数据源选择

**候选**：HackerNews / X(Twitter) / GitHub Trending / HuggingFace / arXiv / Reddit / Product Hunt / RSSHub
**最终**：HackerNews + X(Twitter) + GitHub Trending + HuggingFace + arXiv
**理由**：
- HN / GitHub / arXiv：技术 AI 圈权威信号源，免费公开 API
- HuggingFace：模型首发第一现场
- X(Twitter)：AI 圈 KOL 实时讨论，爆点源头
**放弃**：Reddit（社区质量参差）、Product Hunt（中文圈相关性低）、RSSHub（公共实例不稳定）

### D2：Twitter API

**候选**：官方 Twitter API v2 / Nitter 抓取 / twitterapi.io
**最终**：twitterapi.io
**理由**：
- 官方 v2 申请门槛高、付费
- Nitter 实例经常失效
- twitterapi.io 新用户 $0.1 免费额度、按调用计费、第三方代理稳

### D3：技术栈

**最终**：Node.js 24 全栈 + 原生 HTML/CSS/JS（第一版）/ React + Vite（第二版迁移）
**理由**：
- Node 单语言，全栈一致
- SQLite 嵌入式数据库，零运维
- 前端追求简洁高效，无需 SSR

### D4：数据库

**候选**：better-sqlite3 / sqlite3 / lowdb / node:sqlite（Node 24 内置）
**最终**：node:sqlite (DatabaseSync)
**理由**：
- better-sqlite3 在 Windows + Node 24 经常需要 VS Build Tools
- Node 24 内置 `node:sqlite` 同步 API 与 better-sqlite3 几乎兼容
- 零依赖编译

### D5：OpenRouter 模型

**最终**：
- 分类：`meta-llama/llama-3.1-8b-instruct`（小、快、便宜）
- 摘要：`meta-llama/llama-3.3-70b-instruct`（大、中文友好、质量高）
**尝试过的失败**：`google/gemma-3-4b-it:free`（404 unavailable for free）、`meta-llama/llama-3.3-70b-instruct:free`（同上）
**策略**：24h 缓存避免重复调用 + 4s 退避应对 429

### D6：前端 UI 库

**第一版**：纯 HTML+CSS+JS，赛博朋克雷达风
**第二版（用户反馈"界面过于死板"后）**：迁移到 React + Vite + Aceternity UI
**理由**：用户作为 AI 编程博主追求"炫酷高效、充满科技感"，原静态前端无法满足

### D7：通知通道优先级

1. WebSocket（实时，浏览器在线时即时）
2. Web Push（浏览器后台/锁屏时仍能通知）
3. 邮件聚合（每日 9 点 / 21 点 Top 10 留底）

### D8：Twitter 质量过滤（三层防线）

**问题**：twitterapi.io 默认返回 Top/Latest 推文含大量不知名博主的回复/转发，浏览量低、信号弱。

**方案**：
- **L1 源端硬过滤**（fetch 阶段）：粉丝 ≥ 5000、浏览量 ≥ 2000、过滤回复/转发、近 6h 时间窗
- **L2 白名单**：`twitter_whitelist` 表，AI 公司官号、知名 KOL（@karpathy、@sama 等）跳过粉丝阈值
- **L3 AI 加权**：`analyze.js` 在 userMsg 注入 verified / followers / views 信号，AI 评估时加权 0.1-0.2；白名单命中时 importance 基础 +0.1

**失败兜底**：白名单命中后仍受时间窗约束；过滤后空集合不阻塞其它源

### D9：信息源扩展（B站 + Google News RSS）

**问题**：5 个源中 Twitter 占绝对多数，缺少中文视频与全球新闻覆盖。

**最终方案**：新增 B站（关键词搜索）+ Google News RSS 两个源
- **B站**：搜索 API `api.bilibili.com/x/web-interface/search/all/v2`，可选 SESSDATA 提高限额；过滤：播放 ≥ 2000 + UP主粉丝 ≥ 5000 + 6h 窗
- **Google News**：RSS 端点免费无 key；仅时间窗过滤（无浏览量字段）；用 `<source>` 字段标记原始媒体
- 老源（HN/GitHub/HF/arXiv）也接入质量过滤（HN: score+descendants、GitHub: stars、HF: downloads、arXiv: 仅时间窗）
- arXiv/HF 因低频默认时间窗 168h（7天），与 6h 用户的字面要求冲突但实际需要

**理由**：
- AI 圈最丰富的中文视频内容在 B站（教程/解读/直播录像）
- Google News 是全球新闻最权威的聚合（自带去重+权威度）
- 全部走同一套 `BaseSource` 接口，AI 分析、通知、邮件复用

**放弃**：
- Reddit（噪音过大，即使过滤也不及 Google News 权威）
- TheRundown/Ben's Bites（RSS 内容与 Google News 重叠度高）

### D10：国内源 + 账号识别机制（Round 2）

**问题**：
- Round 1 后信息源仍以海外为主（Twitter + Google + HN/GitHub/HF/arXiv + B站）
- 用户希望直接查询特定博主的信息（@karpathy 这种），而不是泛关键词搜索
- 国内源（知乎/微博）官方 API 对未登录用户强反爬，几乎无免 KEY 可达路径

**方案**：
1. **知乎热搜词源** (`zhihu-trends.js`)：使用公开接口 `/api/v4/search/top_search` 拉热搜词列表（无 KEY、国内可达）
   - 每条只有关键词，无文章详情链接
   - 作为"今日热议信号"：用户关键词命中热搜词时 AI importance 加 0.1-0.2
   - 默认开启（`SOURCE_ZHIHU_TRENDS=1`）
2. **微博热搜源** (`weibo-trends.js`)：占位实现
   - 已知 m.weibo.cn API 432 风控；web 端 302→404；RSSHub 公共实例在本网络不可达
   - 当用户配置 `WEIBO_TRENDS_RSSHUB_URL` 时自动启用（用户自部署 RSSHub 实例）
   - 默认禁用（`SOURCE_WEIBO_TRENDS=0`）
3. **B站源升级**：在 `bilibili.js` 单次请求同时返回视频 + UP主（`search_type=video` & `search_type=user` 各一次）
   - 视频走原有 `filterBilibili`（播放 + 粉丝 + 6h）
   - UP主仅粉丝阈值（无时间窗/播放量）
4. **账号识别机制**（仅 B站）：
   - 语法：关键词以 `@` 开头（如 `@karpathy`、`@机器之心`）
   - 解析：`server/sources/account-resolver.js` → `parseAccountKeyword` 检测 `@` 前缀
   - 执行：复用 `BaseSource` 接口创建 `account:bilibili:{handle}` 虚拟源
   - 频率：`CRON_ACCOUNT_RESOLVE=7 * * * *`（每小时第 7 分钟）
   - UI：HotspotCard 渲染**博主卡片**布局（头像 + 名称 + 签名 + 粉丝 + UP 主页链接）

**理由**：
- 在"免 KEY"硬约束下，B站是国内唯一稳定可达的开放 API
- 账号识别走同一 `BaseSource` 复用全链路（filter/pipeline/notify/WS/Push）
- 知乎/微博热搜词作为"轻量信号源"，承认信息有限但保留扩展点

**放弃**：
- 知乎热榜详情（需 zse-ck 反爬算法，403）
- 微博热搜详情（m.weibo.cn 432、web 302、第三方 API 在本网络不可达）
- 知乎用户主页抓取（zse-ck 反爬）
- 微博用户主页抓取（m.weibo.cn 302）

### D11：信息源管理（DB 驱动统一管理内置 + 用户源）

**问题**：
- 内置源开关散落在 `.env`，需要重启服务才能生效
- 用户想添加自定义信息源（如机器之心、36氪、InfoQ）但系统硬编码不支持
- 关闭源后，存量热点仍出现在列表中

**方案**：
- 新建 `sources` 表统一管理所有源（内置 + 用户）
- `kind='builtin'`：仅可切换 enabled（用户 UI 开关 = 修改 DB 的 enabled 字段）
- `kind='user'`：可增删改切；删除时同时清除其历史热点
- 添加新源时立即抓一次测试（`test_fetch=true`），返回 `test_ok / test_count / test_error`
- 关闭源后：`/api/hotspots` 用 `enabledSet()` 过滤，**数据保留在 DB**（重新开启会恢复）
- 通用爬虫策略：RSS 自动发现 → 降级 HTML 标题抓取（`<article>` / `<h2>`/`<h3>` / `<li><a>`）
- 用户源共享 cron：`CRON_USER_SOURCES=13,43 * * * *`（默认每小时第 13 / 43 分钟，避开整点）
- API 增删改后立即 `initSources() + stopScheduler() + startScheduler()` 重启调度

**理由**：
- 统一表结构避免内置/用户两套机制并存
- `enabled` 在 DB 而不是 .env，UI 修改即时生效；.env 仅作为初次 seed 的默认值
- 关闭后保留数据避免误删，重启用能恢复（用户友好）
- RSS-first 覆盖 80%+ 站点，HTML 降级保证剩下也能用
- 测试抓取让用户在添加时就知道是否可用（避免 silent failure）

**放弃**：
- 通用 HTML 渲染（cheerio + jsdom 等重依赖）— SSR 缺失的站点（36kr 等）即便渲染也拿不到数据
- 全文抓取 + 正则提取正文 — 风险高（破坏页面结构），HTML 标题已能满足"信号到嘴边"的核心诉求

## 4. 性能与可用性指标

| 指标 | 目标 |
|---|---|
| 5 源完整抓取 + AI 分析 | < 5 分钟（含 41 条新 Twitter AI 分析，实测 3.5 分钟） |
| WebSocket 推送延迟 | < 1 秒 |
| 浏览器首屏加载 | < 1 秒（gzip 后 110KB） |
| OpenRouter 429 时 | 自动退避，不阻塞其它源 |
| 数据库 | 支持 10 万条热点无压力 |

## 5. 验收标准

1. ✅ 启动后 5 分钟内 Dashboard 出现首批 Twitter 热点（实测 ~41 条/次）
2. ✅ 添加 `Claude` 关键词后 20 分钟内有相关推文进入
3. ✅ 浏览器 Push 通知在 imp ≥ 0.8 时触发
4. ✅ 移动端（< 768px）布局自动折叠为单列
5. ✅ Agent Skill 调用返回标准化 JSON
6. ✅ 任意单源失败不阻塞其它源
7. ✅ 旧前端可直接访问，新前端通过 Vite dist 提供