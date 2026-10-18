# fsj-web-doc — 项目 README（必读）

> 孚世界文档站：`build.py` 生成 `index.html`（静态骨架+兜底快照）+ `server/proxy.js`（HAP 实时数据代理）。
> **本项目的内容真身在 HAP 文档树，本地代码只是视图/兜底。**
> 创建：2026-08-22（小风）｜检查工具：`python _check_tree.py`

---

## ⚠️ 三条铁律（东城 2026-08-22 定，违反 = 返工）

1. **所有内容节点挂 `数据库`（b3960cf0）下面**——不建独立页面、不挂文档根
2. **只有两级目录**：一级目录（大主题）→ 二级目录（内容页）。
   **正文整体写在二级目录的 wznr 里**（`##` 小标题写在 md 里），**不拆第三层小节节点**
3. **不管关键词**：建数据时 `guanjianci` 一律留空，关键词由专门流程另行处理
   （2026-08-22 误建的 183 条关键词已物理删除，教训见下）

> 注：`fsj-skills-open/文档页面开发.md` 写的是「页面挂文档根 / 叶子挂≥3关键词 / 单叶≤2000字」，
> 与上面口径不一致时**以本文（东城口径）为准**。

## 一、HAP 树结构（实际现状）

```
fsj-web-doc 文档根 (d6ce7eb6)
└── 数据库 b3960cf0                                    ← 页面（sew=1技能·范式层）
    ├── 内容元数据 / 电商业务表 / 组织与用户 / 地址表      ← 一级目录 → 表级二级目录（老树）
    ├── 12维度                                          ← 一级目录
    │   └── 1维技能 ~ 12维复盘                          ← 二级目录×12，wznr=完整md（含##小节）
    ├── 架构                                            ← 一级目录
    │   └── 总览/世界观/道天地将法/数据架构/检索机制/积分系统 ← 二级目录×6，wznr=完整md
    ├── webview2.0                                      ← 一级目录
    │   └── 概述与架构/技术栈详解/商家端指南/落地项目       ← 二级目录×4
    ├── 社区                                            ← 一级目录
    │   └── 总览/帖子系统/悬赏接单/成员管理/互动系统/排行榜/我的空间/Agent行为/商家配置 ← ×9
    └── 组织                                            ← 一级目录
        └── Agent团队/技能清单/产品路线/建设计划/知识库归档  ← ×5
```

rowid 映射：`doc_tree_ids.json`（`dims_dir`/`dims_leaves` = 12维度；`pages.*` = 架构/webview2.0/社区/组织）。

## 二、写入规范

| 项 | 规则 |
|---|---|
| 层级 | `数据库 → 一级目录 → 二级目录`，到此为止（**无第三层**） |
| 正文 | 二级目录的 `wznr` 存**完整 md**（`#`/`##` 小标题写在 md 里） |
| sew / leixing / fabuzhe | `9信息` / `知识` / 小风 `a8515e76-…`（根=3项目，数据库页面=1技能·范式层） |
| fu / zi | 建子写 fu；建完把父的 zi 显式收敛为子 rowid 列表（保持顺序） |
| guanjianci | **留空**（铁律 3） |
| 更新 | 改内容 = editRow 那条二级目录的 wznr，**永远不删了重建** |
| 中文编码 | Windows 下 curl 传中文必须 `--data-binary "@utf8文件"`；Python urllib utf-8 编码直发无碍 |

## 三、写入流程

```
1. 找挂点   一级目录 fu=数据库 b3960cf0；二级目录 fu=一级目录
2. addRow   mingcheng + sew=9信息 + leixing=知识 + fabuzhe=小风 + fu + wznr=完整md（不挂guanjianci）
3. 收敛 zi  父节点 zi = 全部子 rowid（逗号分隔，按顺序）
4. 验证     python _check_tree.py；curl http://localhost:3012/api/doctree/<一级目录名>
```

API：`POST https://api.mingdao.com/v2/open/worksheet/{addRow|editRow|getRowByIdPost}`，
凭证/请求体见 `fsj-skills-open/fsj-open-api.md`（appKey+sign 在请求体）。

## 四、服务链路（谁在拉什么）

```
index.html（build.py 生成，内嵌兜底快照）
 ├─ js/hap-client.js → proxy(3012)
 │    ├─ /api/dimensions        12维（数据库→12维度→12二级目录，拼装，缓存10min）
 │    ├─ /api/doctree/:一级目录名 → {name, overview, leaves:[{name,wznr}]}（缓存，重启失效）
 │    └─ /api/source            当前数据来源 hap|fallback
 ├─ js/dimensions.js  渲染 12 维页面
 └─ js/doc-loader.js  路由→[一级目录,二级目录] 拉取替换正文；失败保持静态兜底
```

**改内容后的生效路径**：editRow wznr → **重启 proxy.js**（doctree 无 TTL）→ 刷新页面。

## 五、本地工具链

| 文件 | 作用 | 注意 |
|------|------|------|
| `build.py` | 重新生成 index.html（**内容已降级为兜底快照**） | 改骨架/样式才动它 |
| `server/proxy.js` | 3012 代理：dimensions + doctree + source | **改后必须重启**，Node 不热重载 |
| `js/doc-loader.js` / `js/dimensions.js` / `js/hap-client.js` | 动态加载层 | 代理没开显示静态兜底 |
| `fetch_data.py` | 从 HAP 拉表结构 → hap_data.json | 字段变了才跑 |
| `_rebuild_tree_v4.py` | **现行建树脚本**（两级结构、无关键词、幂等） | 内容源读 build.py，落树后以 HAP 为准 |
| `_check_tree.py` | HAP 文档树体检 | 每次动树后跑 |
| `_archive/` | 已废弃版本 | 勿改（密钥已泄露，建议换） |

## 六、返工教训（2026-08-22，四次返工换来的）

1. v0：12维度建了独立页面+五行分组层 → 删。**照样板挂，不自创层级**
2. v1：6 章节整段塞一条 wznr → 删了重建（这个后来口径又变回，见 v4）
3. v2：章节拆成第三层节点 → 删。**正文整体进 wznr，小标题写在 md 里**
4. v3：架构/社区等建在文档根下 → 删。**一切挂数据库 b3960cf0 下**
5. 关键词：机械挂词（节点名/拼音/fsj_web_doc）183 条全是垃圾 → 物理删除。**建数据不碰 guanjianci**

每次返工根因都一样：**没先看清样板结构就动手**。动树前先跑 `_check_tree.py`。

---

*每次会话进本项目：先读本文档，动 HAP 数据前先跑 `python _check_tree.py` 看现状。*
