# MindViz — Agent 知识图谱可视化

黑色背景的力导向知识图谱，可视化 HAP（明道云）「商品/shangpin」表（12 维记忆池）中全体 Agent 的知识记忆。

- **节点大小** = 权重（`quanzhong`，越大越重）
- **节点亮度** = 置信度（`zhixindu`，越亮越可信）
- **节点颜色** = 12 维（`sew`，1技能~12复盘 各有基色，亮度由置信度调制）
- **连线** = `fu` 父子边（实线弧）+ `yynr` 引用边（黄色虚线，可关）

## 快速开始

```bash
# 1. 启动本地服务（双击或命令行）
start.bat          # python -m http.server 8765 + 自动开浏览器

# 2. 浏览器打开
http://localhost:8765/

# 3. 首次使用点「同步数据」→ 全量拉取（约 8 秒 / 4500+ 条）
#    之后每次点只拉增量（按 utime 倒序，遇到上次游标即停，秒级）
```

> 必须走 http 服务打开（ES 模块 + IndexedDB 都不允许 file:// 直开）。
> 数据缓存在浏览器 IndexedDB，下次打开秒载全图，再点同步只取增量。

## 数据与同步机制

| 项 | 说明 |
|---|---|
| 数据源 | 明道云 v2 open API `worksheet/getFilterRows`，直连（CORS 已验证放行） |
| 工作表 | `6a03ceaa7e29abcb297cbdfc`（shangpin 12 维记忆池） |
| 分页 | 每页 100 条，4 并发，失败重试 3 次 |
| 增量 | `sortId=utime` 倒序翻页，遇到 `utime <= 上次游标` 停止；逻辑删除（shanchu=1）也会随 utime 更新被捕获 |
| 缓存 | IndexedDB 库 `kg-cache`：records（键=rowid）+ meta（lastSyncTime 游标） |
| 跳转 | 详情面板右上「在 HAP 中打开」直达该行记录 |

## 权重 / 置信度的字段优先 + 兜底

`quanzhong` / `zhixindu` 字段现阶段全池为空（字段说明.md：逐步启用）。页面采用**字段优先，结构兜底**，字段将来有真实值时自动覆盖，无需改代码：

| 度量 | 字段有值时 | 兜底公式（现役） |
|---|---|---|
| 权重 | `quanzhong` | `rel*3 + rich`：rel = 子数 + 被引用数×2；rich = 有名称 + 正文长度分档 + 关键词数 |
| 置信度 | `zhixindu`（0~1） | `shangjia1`(1=验证 0.60 / 0=推理 0.38) + 关键词数×0.02，封顶 0.72 |

详情面板会标注每项度量的来源（「字段」/「兜底」）。

## 交互

| 操作 | 效果 |
|---|---|
| 滚轮 / 双指 | 以光标为中心缩放 |
| 拖空白 / 拖节点 | 平移画布 / 拖动单个节点 |
| hover | tooltip + 该节点及邻居高亮（其余变暗） |
| 单击节点 | 右侧详情面板：正文、关键词、父/子/引用/被引用列表（点击可跳转定位）、HAP 原始行链接 |
| 搜索框 | 名称/正文模糊匹配（300ms 防抖） |
| 左侧维度/AGENT 图例 | 点击色块开关该维度/发布者 |
| 过滤开关 | 含推理模式（默认含）、含已删除（默认不含）、含非知识类型（默认不含） |
| 创建时间范围 | 按 `ctime` 过滤 |
| 布局 | 力导向 / 层级树（按 fu 父子的放射树）切换 |

全图缩小时只有最大的约 33 个节点显示名称（星图式标注）；放大到节点屏幕半径 > 7px 后按阈值显示，上限 220 个防糊屏。

## 目录结构

```
knowledge-graph/
├─ index.html          # 页面骨架（顶栏/侧栏/画布/详情面板/状态栏）
├─ index.css           # 黑色主题样式
├─ js/
│  ├─ config.js        # API 凭据、12 维基色、视觉参数
│  ├─ api.js           # v2 open API 拉取（全量/增量/ping）
│  ├─ cache.js         # IndexedDB 读写
│  ├─ data.js          # 筛选 → 建图 → 权重/置信度/颜色映射
│  ├─ graph.js         # Canvas 力导向引擎（网格斥力/辉光精灵/视口剔除）
│  ├─ ui.js            # 图例/统计/tooltip/详情面板渲染
│  └─ main.js          # 入口：同步→缓存→筛选→渲染→交互
├─ test/
│  ├─ node-test.mjs    # Node 集成测试（API/解析/筛选/建图/度量）
│  ├─ helper.mjs       # 测试辅助（内存版 cache 桩）
│  ├─ browser-selftest.mjs  # 浏览器端 E2E 自检
│  ├─ cdp-debug.mjs    # headless Edge + CDP 抓自检结果
│  └─ cdp-perf.mjs     # CDP 实测全量同步耗时/帧率
├─ start.bat           # 一键启动
└─ package.json        # {"type":"module"}
```

## 测试

```bash
node test/node-test.mjs                        # 集成测试（走真实 API）
node test/cdp-debug.mjs                        # 浏览器 E2E（headless Edge）
node test/cdp-debug.mjs "http://localhost:8765/?selftest=1&net=1"   # 含网络自检
node test/cdp-perf.mjs                         # 同步性能实测
```

浏览器自检也可手动访问 `http://localhost:8765/?selftest=1`（加 `&net=1` 含网络步骤），结果直接打在页面顶部。

实测基线（2026-08，4565 条池）：全量同步 8.0s → 3969 节点 / 3875 边；空闲 60fps；模拟运行 avg 16.7ms/帧。

## 已知边界

- 凭据（appKey/sign）明文写在 `config.js`，仅限本地/内网使用；公开部署需改为后端代理。
- `quanzhong`/`zhixindu` 全池为空，当前大小/亮度全部来自兜底公式；字段启用后自动切换。
- 增量同步不识别「物理删除」（HAP 回收站清空），偶尔可在控制台跑 `clearAll()` 后全量重建。
