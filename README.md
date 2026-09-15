# DL-monitor · AI 热点雷达

一个给 AI 编程博主用的自动热点监控系统：

- 配置关键词（如 Claude / GPT-5 / DeepSeek）
- 后台定时抓取 HackerNews / GitHub Trending / HuggingFace / arXiv / X(Twitter)
- 用 OpenRouter 做相关性与重要性打分 + 中文摘要
- 浏览器 Web Push + WebSocket 实时推送 + 邮件聚合
- 响应式赛博朋克风 Web 页面
- 附带 Agent Skill，让其他 AI 也能调用

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置（至少填一个 OpenRouter Key 才能用 AI 分析）
cp .env.example .env
# 编辑 .env 填入 OPENROUTER_KEY（https://openrouter.ai/keys）

# 3. 启动
npm start

# 4. 打开浏览器
open http://localhost:3000
```

启动后会自动：
- 用 `node:sqlite`（Node 24 内置）创建数据库
- 生成 VAPID 密钥并保存到 `.env`
- 启动 4 个 cron 任务（每 10 / 30 / 30 / 60 分钟）
- 立即跑一次各数据源

## 配置项

详见 [.env.example](.env.example)。最关键的几个：

| 变量 | 说明 | 默认 |
|---|---|---|
| `OPENROUTER_KEY` | OpenRouter API key，必填 | - |
| `OPENROUTER_CLASSIFY_MODEL` | 相关性打分模型 | `google/gemma-3-4b-it:free` |
| `OPENROUTER_SUMMARIZE_MODEL` | 摘要生成模型 | `meta-llama/llama-3.3-70b-instruct:free` |
| `SMTP_*` / `MAIL_*` | 邮件推送（每日 9:00 / 21:00） | - |
| `SOURCE_TWITTER` | 是否启用 Twitter 源（需 RSSHub） | `0` |
| `TWITTER_QUERIES` | Twitter 搜索关键词（逗号分隔） | - |

## 项目结构

```
DL-monitor/
├── server/             # 后端
│   ├── index.js        # 入口
│   ├── config.js       # 配置
│   ├── db.js           # node:sqlite 封装
│   ├── sources/        # 5 个数据源
│   ├── ai/             # OpenRouter + 分析
│   ├── monitor/        # 调度 + 流水线
│   ├── notify/         # 推送 / 邮件 / WS
│   └── routes/         # REST API
├── public/             # 前端（赛博朋克雷达风）
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── sw.js           # Service Worker
│   └── manifest.json
├── skills/             # Agent Skill
│   └── ai-hotspot-monitor/
└── data/monitor.db     # SQLite（运行时生成）
```

## 作为 Agent Skill 使用

把 `skills/ai-hotspot-monitor/` 复制到 Claude / Cursor / 其他 AI 项目的 skills 目录：

```bash
# 在 Claude Code 项目里
cp -r DL-monitor/skills/ai-hotspot-monitor .claude/skills/
```

调用示例：

```bash
node skills/ai-hotspot-monitor/scripts/check.js
node skills/ai-hotspot-monitor/scripts/summarize.js --hours=24
node skills/ai-hotspot-monitor/scripts/summarize.js --hours=6 --source=arxiv --min_importance=0.6
```

详见 [skills/ai-hotspot-monitor/SKILL.md](skills/ai-hotspot-monitor/SKILL.md)。

## 数据源说明

- **HackerNews** — Firebase API，无需 key
- **GitHub Trending** — 抓 HTML + cheerio，无 key；可能因 GitHub 反爬偶尔失败
- **HuggingFace** — `/api/models` + `/api/papers`，无需 key
- **arXiv** — `/api/query`，须设 User-Agent，每请求间隔 ≥3s
- **X(Twitter)** — 通过 RSSHub 公共实例（`rsshub.app`），**默认关闭**；自部署 RSSHub 更稳定

## 故障排查

- **OpenRouter 报 429**：免费模型限流很紧；检查 `OPENROUTER_KEY` 是否已充值，或换付费模型
- **better-sqlite3 装不上**：本项目已改用 Node 24 内置 `node:sqlite`，无需编译
- **浏览器推不到**：检查 `Notification` 权限；VAPID 已自动生成在 `.env`

## License

MIT