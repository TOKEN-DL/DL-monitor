# DL-monitor 文档索引

| 文档 | 内容 |
|---|---|
| [requirements.md](requirements.md) | 用户原始需求、决策日志、约束 |
| [architecture.md](architecture.md) | 系统架构、模块边界、数据流 |
| [data-sources.md](data-sources.md) | 5 数据源的 API 集成与去重策略 |
| [api-reference.md](api-reference.md) | HTTP / WebSocket 接口契约 |
| [deployment.md](deployment.md) | 安装、配置、运维、故障恢复 |
| [audit.md](audit.md) | 第三方 API/库的 MCP 审计报告与修复记录 |

## 项目一句话

DL-monitor 是一台 **AI 编程博主专用的热点雷达**：让用户配置关键词，自动从 HackerNews / X(Twitter) / GitHub / HuggingFace / arXiv 五路抓取信号，用 OpenRouter 做中文摘要与重要性打分，Web Push + 邮件把高分热点第一时间推给博主本人。

## 快速跳转

- 想跑起来？→ [deployment.md](deployment.md)
- 想加一个数据源？→ [data-sources.md](data-sources.md)
- 想扩展 API？→ [api-reference.md](api-reference.md)
- 想了解为什么这么设计？→ [architecture.md](architecture.md)

## 技术栈快照

| 层 | 选型 | 版本 |
|---|---|---|
| 运行时 | Node.js + ES Modules | 24+ |
| HTTP | express | ^4.21 |
| WebSocket | ws | ^8.18 |
| 数据库 | node:sqlite (内置) | Node 24 |
| 调度 | node-cron | ^3 |
| HTTP 抓取 | 原生 fetch | — |
| HTML 解析 | cheerio | ^1 |
| AI | OpenRouter | REST |
| 邮件 | nodemailer | ^6 |
| 浏览器推送 | web-push (VAPID) | ^3 |
| 前端 | React + Vite + Tailwind + Framer Motion | 18 / 5 / 3 / 11 |
| UI 组件 | Aceternity UI（精选 5 个） | — |