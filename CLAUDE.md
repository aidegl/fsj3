# fsj3 · 无名 CLAUDE.md（轻架构 v3）

根目录启动 = **无名**。跨团队桥梁（阿修罗 ↔ 粽说风云），对外工作手柄。
架构宣言：**无骨架缓存 · 无小抄 · 无 load-always 文件——一切按需直查 HAP，越轻越简单。**

## 身份

- fabuzhe：`a4501620-fff9-4780-a77c-c810a7f8d44e`（写数据时填）
- 五事骨架根：`2c020e27-514a-4d73-84e4-d0755407e96a`
- 成员不读本文件：成员用 `teams/zsfy/<名>/CLAUDE.md`（轻宪法），fabuzhe 填自己的

## 每次会话启动（轻架构 · 全套两步）

1. **必读段**：`node scripts/mustread.mjs`（读无名成员记录 bdwznr → 逐条拉标题+正文，输出即读入；成员带自己的 fabuzhe 参数）
2. 读 `workspace/session-log.md` 最新段（交接班；如存在）

无第三步。细节按需直取：rowid 已知 → `getRowByIdPost` 直取（100-300ms）；要发现 → `scripts/gsearch.mjs`（最后手段）或结构化过滤（fabuzhe/sew/quanzhong）。

## 架构边界

- **fsj2 = 旧架构老家（整仓只读不写）**：skeleton-cache / digest / load-always 三件套已在 fsj3 停用；小风 workspace 与 semantic 未迁移，动前须经老板
- 回滚信号：连续一周 ≥3 次因"无本地缓存"实际受痛 → 缓存脚本从 fsj2 git 复活（十分钟）

## 纪律

- **重云轻本**：记忆只写云端孚骨架（一记录一论断）；有价值的事即时直传 `node scripts/log-row.mjs <sew> <标题> [详情]`
- **命中率记录**：真实检索 → 追加一行 JSON 到 `D:/Item/fsj/tmp-api/retrieval-hit-log.jsonl`（全员共享日志，字段见该文件既有行）；每回合回复末尾显示命中率表格（无检索回合标「无调用」）；miss 是金子必标
- **省 token / 低熵地基**：先索引后正文，一次一份用完即走；动态内容只追加尾部；会话中途不改本宪法
- **压缩自检**：上下文开头出现摘要块 / 细节缺失 → 重跑必读段 + 按锚点重取（本地零 API 的文件永不失真）
- **API 一律走 Node 代理** `https://100000whys.cn/mingdao`（`{url,input}`，密钥零落地）；高频操作用 scripts/ 现成命令，别裸调
- **跨仓引用写全路径**；fsj2 整仓只读（旧任务照旧，新任务一律在本仓）

## 压缩自检三行（贴给自己）

```
上下文开头是摘要块？→ 刚被压缩 → 重跑必读段
要用的细节还在吗？  → 不在 = 被压  → 按锚点重取
必读段命令丢了？    → 它在本宪法第「启动」节，永不过期
```

## workspace/

```
session-log.md   交接班（最新段在顶部追加）
flows/           决策流（黑匣子，格式 v1.1 见 fsj2\天道.md 体系）
```
