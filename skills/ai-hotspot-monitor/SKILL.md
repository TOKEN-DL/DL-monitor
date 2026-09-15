---
name: ai-hotspot-monitor
description: 触发 DL-monitor 系统的 AI 热点监控、获取最新热点、或生成指定时间段的热点摘要。用于「最新 AI 动态」「今天有什么值得关注的」「检查热点监控」等场景。
when_to_use: |
  用户询问最新 AI / 大模型 / 编程工具的热点；
  用户希望让助手主动监控并汇报热点；
  用户希望总结过去 N 小时的热点；
  任何需要让另一个 AI 调用本监控系统获取结构化热点数据的场景。
inputs:
  - action: "check" | "summarize"
  - hours: 整数，仅 summarize 使用（默认 24，范围 1-168）
  - source: 可选，按来源过滤（hackernews / github / huggingface / arxiv / twitter）
  - min_importance: 可选，0-1，过滤低重要性条目（默认 0）
outputs: JSON，结构见下方 Examples
scripts:
  check: scripts/check.js
  summarize: scripts/summarize.js
requirements:
  - DL-monitor 服务必须运行（默认 http://localhost:3000），可通过环境变量 DL_MONITOR_URL 覆盖
---

# ai-hotspot-monitor

> 把 DL-monitor 暴露为可被其他 AI 调用的技能。

## 使用方式

```bash
# 触发一次抓取 + 分析，返回新增热点
node scripts/check.js

# 总结过去 N 小时热点
node scripts/summarize.js --hours=24
node scripts/summarize.js --hours=6 --source=arxiv
node scripts/summarize.js --hours=24 --min_importance=0.6
```

## Returns

### check.js
```json
{
  "ok": true,
  "ts": 1700000000000,
  "results": {
    "hackernews": { "ok": true, "fetched": 50, "new": 4, "analyzed": 4, "took_ms": 3520 },
    "github":     { "ok": true, "fetched": 25, "new": 25, "analyzed": 0, "took_ms": 8211 },
    "huggingface":{ "ok": true, "fetched": 60, "new": 30, "analyzed": 0, "took_ms": 1099 },
    "arxiv":      { "ok": true, "fetched": 30, "new": 30, "analyzed": 0, "took_ms": 609 }
  },
  "new_hotspots": [
    {
      "id": 123,
      "source": "hackernews",
      "url": "https://...",
      "title": "...",
      "summary": "AI 生成的中文摘要",
      "score": 0.85,
      "importance": 0.92,
      "matched_keywords": ["Claude"]
    }
  ]
}
```

### summarize.js
```json
{
  "ok": true,
  "hours": 24,
  "count": 142,
  "items": [
    { "id": 123, "source": "...", "title": "...", "summary": "...", "importance": 0.92, "url": "...", "matched_keywords": [...] }
  ]
}
```

## 在 Claude / 其他 AI 中调用

当作为 Skill 集成时，建议在 SKILL 描述里加入：

> Use this skill whenever the user asks about "最新的 AI 热点", "今天有什么值得关注的", "检查监控"，
> or wants a structured digest of recent AI news / models / tools / papers.

助手侧只需调用 `node scripts/check.js` 或 `node scripts/summarize.js --hours=N` 并把 stdout 当作 JSON 解析即可。

## Configuration

环境变量：
- `DL_MONITOR_URL`：监控服务地址，默认 `http://localhost:3000`
- `DL_MONITOR_TIMEOUT`：HTTP 超时毫秒，默认 60000

## Notes

- 监控服务需要在运行（`npm start`）。
- 检查类操作会真实触发数据源抓取（可能耗时 5-15 秒）。
- 摘要类操作只是数据库查询，毫秒级返回。