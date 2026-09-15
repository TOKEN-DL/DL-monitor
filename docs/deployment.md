# 部署文档

## 1. 环境要求

| 组件 | 最低版本 |
|---|---|
| Node.js | 20+（推荐 24+ 以使用内置 `node:sqlite`） |
| 操作系统 | Windows / macOS / Linux |
| 浏览器（前端） | Chrome / Edge / Firefox / Safari 最近 2 版 |

## 2. 安装

```bash
# 1. 克隆
git clone <repo-url> && cd DL-monitor

# 2. 后端依赖
npm install

# 3. 前端依赖
npm --prefix web install

# 4. 配置
cp .env.example .env
# 编辑 .env，填 OPENROUTER_KEY 与 TWITTER_API_KEY（至少）

# 5. 构建前端（首次或更新前端后）
npm run build:web

# 6. 启动
npm start
# → http://localhost:3000
```

## 3. 环境变量

### 必填（缺一不可）

| 变量 | 说明 | 示例 |
|---|---|---|
| `OPENROUTER_KEY` | OpenRouter API key（[openrouter.ai/keys](https://openrouter.ai/keys)） | `sk-or-v1-...` |
| `TWITTER_API_KEY` | twitterapi.io key（5 个源里这一项可选，但用户强烈需要） | `new1_...` |

### 推荐

| 变量 | 默认 | 说明 |
|---|---|---|
| `OPENROUTER_CLASSIFY_MODEL` | `meta-llama/llama-3.1-8b-instruct` | 相关性分类 |
| `OPENROUTER_SUMMARIZE_MODEL` | `meta-llama/llama-3.3-70b-instruct` | 中文摘要 |
| `VAPID_SUBJECT` | `mailto:admin@example.com` | 推送联系邮箱 |
| `CRON_HACKERNEWS` | `*/10 * * * *` | HN 频率 |
| `CRON_GITHUB` | `*/30 * * * *` | GitHub 频率 |
| `CRON_TWITTER` | `*/20 * * * *` | Twitter 频率 |

### 可选（空则禁用）

| 变量 | 说明 |
|---|---|
| `SMTP_HOST/PORT/USER/PASS` | 邮件推送（如 Gmail 需应用专用密码） |
| `MAIL_FROM` / `MAIL_TO` | 邮件发件人/收件人 |
| `TWITTER_QUERIES` | 逗号分隔，如 `Claude,GPT-5,DeepSeek,Qwen`（≤5 个） |
| `GITHUB_TOKEN` | GitHub Personal Access Token，加后 search 限流 10→30 req/min |

### 数据源开关

```env
SOURCE_HACKERNEWS=1
SOURCE_GITHUB=1
SOURCE_HUGGINGFACE=1
SOURCE_ARXIV=1
SOURCE_TWITTER=1
```

设 0 = 禁用。

## 4. 运行模式

### 生产模式（推荐）

```bash
npm run build:web      # 构建前端到 web/dist
npm start              # 启动 server
```

Express 直接服务 `web/dist`（含 sw.js）。

### 开发模式

```bash
# 终端 1：后端
npm run dev            # node --watch server/index.js

# 终端 2：前端（Vite HMR）
npm run dev:web        # 自动代理 /api /ws 到 3000
# → http://localhost:5173
```

Vite dev server 会代理 API 请求到 3000，避免跨域。

### 仅重启前端（不重启 server）

```bash
npm run build:web      # 重新打包
# server 下次请求会自动 serve 新版本（静态文件无缓存）
```

## 5. 端口与防火墙

- `3000` — HTTP / WebSocket
- `5173` — Vite dev server（开发模式）
- 生产环境应仅在 localhost 监听（默认）

## 6. 数据备份

```bash
# SQLite 库
cp data/monitor.db data/monitor.db.bak

# 配置
cp .env .env.bak
```

## 7. 常见问题

### Q: 浏览器看不到新前端？
- 检查 `web/dist/index.html` 是否存在
- `curl http://localhost:3000/` 第一行应是 `<!DOCTYPE html><html lang="zh-CN" class="dark">`
- 旧前端 `public/index.html` 不再被引用

### Q: 推送收不到？
1. 检查浏览器设置：站点权限 → 通知 → 允许
2. 检查 `.env` 中 `VAPID_PUBLIC_KEY` 与 `VAPID_PRIVATE_KEY` 是否都已生成（启动会自动生成）
3. 看 `subscriptions` 表是否有你的 endpoint：`SELECT * FROM subscriptions;`

### Q: OpenRouter 报 429？
- 单源 fetch 已实现 4s 退避 3 次
- 单条 AI 分析失败不会阻塞其他条目
- 查看 `data/monitor.db` 中 `ai_cache` 表是否有命中缓存

### Q: HuggingFace 没数据？
- 国内访问受限是已知问题
- source_status 里会显示 ok count=0，**这是正常的**
- 解决：加代理或部署海外服务器

### Q: Twitter 源报 401？
- 检查 `TWITTER_API_KEY` 是否过期或余额不足
- 查看 twitterapi.io 控制台

### Q: 数据库锁了？
- `data/monitor.db` 同时出现 `monitor.db-shm` / `monitor.db-wal` 是 WAL 模式正常行为
- 多进程访问会锁，确保只跑一个 server

## 8. 升级

```bash
git pull
npm install                    # 后端
npm --prefix web install       # 前端
npm run build:web              # 重新构建
# 重启 server
```

## 9. 卸载

```bash
# 停止 server
# 删除 data/monitor.db / .env（如果有敏感 key）
# 删除整个项目目录
```

无外部服务、无云依赖、无后台进程 — 纯单机应用。