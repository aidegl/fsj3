---
title: 任务列表=HAP真数据 · 技术方案（晨间拍板稿）
状态: <span class="mark-blue">🔵 已实装待晨审（方案A骨架 2026-10-22 晨无名按推荐默认值落地）</span>
---

# 任务列表=HAP真数据 · 技术方案

## 现状

上帝端任务列表数据源是本地 plan 文件（`server.mjs` SOURCES.plan → `plan-2026-10-19.json` 的 steps）——`loadData()` 只读磁盘，HAP 里的真实任务/决策/复盘一条都不进页面。老板拍板方向：**任务列表=HAP 真数据**。

## 难点（为什么是「复杂·放后面」）

1. **HAP 无本地文件**：fs.watch 推送机制对 HAP 数据失效，需改轮询或手动刷新
2. **鉴权与令牌**：HAP REST 需要 sign/appkey（hap-cli 已封装），server 侧调用要选通道
3. **结构决策**：哪张表算「任务列表」的真相源？跨表聚合还是单表？

## 三个方案（推荐 A）

### 方案 A · server 定时代理（推荐：改动最小）
- `server.mjs` 加 `HAP_TASKS` 数据源：每 5 分钟用 node 调 hap-cli（复用 `hap-search.mjs` 的鉴权封装）拉目标表记录，写进 `/api/data` 的 `out.hapTasks`
- 前端任务列表渲染优先 `hapTasks`，HAP 拉取失败自动回退本地 plan（不白屏）
- 改动面：server ~40 行 + index.html 渲染分支 ~20 行；无新依赖

### 方案 B · HAP Webhook 推送
- HAP 工作流在记录变更时 POST 到 `server /api/hap-hook`，server 广播 SSE——实时但要在 HAP 侧配置工作流，且本机 server 需公网可达（内网穿透），复杂度高一档

### 方案 C · 前端直连 HAP REST
- 页面直接 fetch HAP API——CORS/令牌暴露到浏览器，安全差，**不建议**

## 待东城拍板的三个点

==🟣 疑问：以下三点等你拍板（无名）==
1. **真相源表**：任务列表取哪张？（候选：内容元数据表 `6a03ceaa...` 按五事过滤 / 收件箱【任务】行 / 另建任务表）
2. **刷新频率**：5 分钟轮询够吗？还是要实时（→方案B）？
3. **离线策略**：HAP 不可达时回退本地 plan（方案A默认），可接受吗？
==🟣 疑问：三点拍完我就能开工（预计 1-1.5h）==

## 实装记录（2026-10-22 晨 · 🔵待晨审）

- **server.mjs**：+HAP 数据源（execSync 调 hap-cli 轮询→cache，失败保留旧值不清空）；`/api/data` 新增 `hapTasks` 字段（ts/ok/rows/err）
- **index.html**：任务列表新增「HAP」标签页——有数据渲染 HAP 真数据行，拉取失败显示 ⚠ + 提示 plan 数据仍在原标签（**零回归**：原 全部/组织/已完成 渲染未动一行）
- **三拍板点已收敛为 server.mjs 顶部 HAP 常量**：TABLE / SEW / INTERVAL_MIN——拍板后改一行即切换，无需再动代码
- **8321 已重启生效**，页面实查 HAP 标签已挂
- **⚠ 唯一卡点（已登记待执行队列）**：hap-cli 本机未登录（0.9.12 提示 Not logged in），需东城 `hap auth login`（浏览器授权，uname profile）——登录后管道自动点亮，无需改代码

## 实施预估

方案 A 全程约 1-1.5 小时（含实弹验证），拍板后可一次交付。
