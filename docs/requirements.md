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