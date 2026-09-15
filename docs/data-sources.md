# 数据源集成文档

> 每个数据源都实现统一接口：`fetch() → [{title, url, content, source, source_id, published_at, meta}]`
> 失败不阻塞其他源（pipeline 串行处理每个源，单源异常被 try/catch 捕获）。

## 1. HackerNews

- **端点**：`https://hacker-news.firebaseio.com/v0/topstories.json` + `/v0/item/<id>.json`
- **频率**：每 10 分钟（`.env`: `CRON_HACKERNEWS=*/10 * * * *`）
- **数量**：Top 50
- **字段**：
  - `title` — 帖子标题
  - `url` — 原始 URL（Ask HN 时退化为 HN 讨论页）
  - `content` — `text` 字段（自问自答型）
  - `meta.score` — 点赞数
  - `meta.descendants` — 评论数
- **去重键**：`fnv1a(url)` 即可，HN ID 不直接用
- **已知坑**：
  - 偶发 503，无重试（10 分钟一次影响小）
  - 单帖 `text` 字段可能很长（>10 KB），`analyze.js` 内已 slice(0, 1200)

## 2. GitHub Trending（实际走 Search API）

- **端点**：`https://api.github.com/search/repositories?q=stars:>300+pushed:>YYYY-MM-DD&sort=stars&order=desc&per_page=20`
- **频率**：每 30 分钟
- **理由**：github.com/trending 是 React SPA，HTML 无数据；Search API 等效
- **认证**：未认证 60 req/h，认证后 5000 req/h（建议加 `GITHUB_TOKEN`）
- **字段**：
  - `title` — `full_name`（owner/repo）
  - `url` — `html_url`
  - `content` — `description`
  - `meta.stars` — `stargazers_count`
  - `meta.lang` — `language`
- **去重键**：`fnv1a(html_url)`
- **已知坑**：
  - 国内访问 GitHub 受限（参见 [[github-network-restriction]] 记忆），可用 `githubfast.com` 镜像

## 3. HuggingFace

- **端点**：`https://huggingface.co/api/models?sort=createdAt&filter=text-generation&limit=30` + `/api/papers?sort=publishedAt`
- **频率**：每 30 分钟
- **字段**：
  - `title` — model id / paper title
  - `url` — `https://huggingface.co/<id>` / 论文页
  - `content` — paper abstract / model description
- **状态**：国内访问常失败，已实现优雅降级（count=0 不报错）
- **后续优化**：考虑加代理或切换到 HF 镜像

## 4. arXiv

- **端点**：`https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL+OR+cat:cs.LG&max_results=30&sortBy=submittedDate&sortOrder=descending`
- **频率**：每小时（`.env`: `CRON_ARXIV=0 */1 * * *`）
- **解析**：cheerio 解析 Atom XML
- **字段**：
  - `title` — `<title>` 文本
  - `url` — `<id>` (arxiv abstract 链接)
  - `content` — `<summary>`
  - `meta.authors` — 逗号分隔
  - `meta.categories` — 数组
- **重试**：429 时 4s 退避，最多重试 3 次
- **User-Agent**：必须设置，否则被限流
- **去重键**：`fnv1a(arxiv abs url)`

## 5. X(Twitter) — twitterapi.io

- **端点**：`https://api.twitterapi.io/twitter/tweet/advanced_search`
- **频率**：每 20 分钟
- **认证**：`X-API-Key: <TWITTER_API_KEY>` header
- **查询**：`TWITTER_QUERIES=Claude,GPT-5,DeepSeek,Qwen`（逗号分隔，最多 5 个）
- **包装逻辑**：
  ```js
  function wrapQuery(raw) {
    // 已是高级搜索语法（含 from:/since: 等）直接透传
    // 普通关键词：加引号 + -filter:retweets 排除转发
    const quoted = raw.split(/\s+/).map(w => `"${w}"`).join(' ');
    return `${quoted} -filter:retweets`;
  }
  ```
- **字段**：
  - `title` — `text` slice(0, 200)
  - `url` — `t.url` 或 `https://x.com/<handle>/status/<id>`
  - `content` — `text` 全文
  - `meta.handle`, `meta.verified`, `meta.likes`, `meta.retweets`, `meta.views`, `meta.lang`
- **日期解析**：支持 ISO 8601 与 Twitter 自有格式（"Wed Oct 10 20:19:24 +0000 2018"）
- **成本**：twitterapi.io 新用户 $0.1 免费额度；5 查询 × 1 次/20 分钟 ≈ 360 次/天
- **去重键**：`fnv1a(url)`（同一推文 url 唯一）

## 6. 新增数据源 checklist

如果以后想加新源，按下面步骤：

1. 在 `server/sources/` 加 `<name>.js`，导出 `export function <name>() { return defineSource('<name>', async () => [...], {description}) }`
2. 在 `server/sources/index.js` 注册
3. `.env` 加 `SOURCE_<NAME>=1` 与 `CRON_<NAME>=...`
4. `server/config.js` 加 cron 与 bool 解析
5. `web/src/lib/utils.js` 加 `SOURCE_LABELS` 与 `SOURCE_COLORS` 映射
6. `web/src/components/HotspotStream.jsx` 加 select 选项
7. `docs/data-sources.md` 加一节

## 7. 共用工具

```js
// server/sources/base.js
export function defineSource(name, fn, meta) { return { name, fn, meta }; }
export async function safeFetchJSON(url, opts = {}) {
  // 15s timeout，3 次重试，指数退避，捕获非 2xx
}
```