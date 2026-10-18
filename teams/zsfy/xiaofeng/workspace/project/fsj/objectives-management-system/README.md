# 目标管理系统 (objectives-management-system)

> 孚世界团队 · 林东城专属目标/计划 Web 看板
> 数据源：HAP shangpin 表「天」节点 (`8efa9d4b-1759-464f-818b-813537c709ef`)

---

## 启动

```bash
# 终端 1：proxy 后端
cd "D:\Item\fsj\team\xiaofeng\workspace\project\fsj\objectives-management-system"
node proxy.js
# 启动后会打印：listening on http://localhost:3014

# 终端 2：静态文件服务
cd "D:\Item\fsj\team\xiaofeng\workspace\project\fsj\objectives-management-system"
python -m http.server 3015

# 浏览器打开
# http://localhost:3015
```

---

## 架构

```
浏览器 (port 3015)
  └─ index.html + js/* + css/style.css
       │
       ├─ fetch /api/all-targets  ──┐
       ├─ fetch /api/record-add    ──┤
       ├─ fetch /api/record-update ──┤ proxy.js (port 3014)
       └─ fetch /api/record-delete ──┘   │
                                         │ v2 open API (appKey+sign)
                                         ▼
                                  HAP shangpin (6a03ceaa...)
```

### 端口分配

| 服务 | 端口 |
|---|---|
| proxy.js | **3014** |
| 静态文件（python http.server）| 3015 |
| fsj-web-doc proxy | 3012（已用，勿抢）|

---

## 文件结构

```
objectives-management-system/
├── proxy.js              # 后端代理（端口 3014）
├── index.html            # 前端入口
├── css/style.css         # 孚世界深色风格
├── js/
│   ├── field-ids.js      # 字段 UUID 常量 + 5 区域映射
│   ├── api.js            # fetch 封装
│   ├── filter.js         # 客户端 filter（mingdao filter 失效应对）
│   ├── ui.js             # Modal/Toast/Loading
│   ├── tree.js           # 树视图渲染
│   ├── kanban.js         # 5 区域看板（含拖拽）
│   └── app.js            # 主入口
├── docs/PRD.md           # v0.7 产品需求文档
└── README.md             # 本文件
```

---

## 核心设计

### 字段 UUID 速查（已验证）

| 字段 | UUID |
|---|---|
| mingcheng | `6a03ceaa7e29abcb297cbdfd` |
| sew（12维）| `6a376a7b9513239477b93e31` |
| 7目标 key | `2f48a1fc-cf2f-4194-b93f-5800b24cdfe7` |
| 8计划 key | `d0334a50-375b-426d-8898-af1973ade663` |
| fu（直接父）| `6a2cf9d5f06514e8747a64f0` |
| fuyuan | `6a265b9c611b4ca5b182d854` |
| zi（子）| `6a265b9c611b4ca5b182d855` |
| fabuzhe | `6a266179f24b2a6e0a66e1a5` |
| quanzhong | `6a051fd0f255b2b51491a981` |
| zhixindu | `6a410730405fcd4e19424918` |
| shanchu | `6a2a2ecc837e93d36d79a621` |
| ptyh | `6a11531da47867dee8cda8cb` |

### 5 区域定义（zhixindu 映射）

| 区域 | zhixindu 区间 | 含义 | 颜色 |
|---|---|---|---|
| 1 | 8000-10000 | 紧急且重要 | 红 |
| 2 | 6000-7999 | 重要不紧急 | 蓝 |
| 3 | 4000-5999 | 紧急不重要 | 黄 |
| 4 | 2000-3999 | 不紧急不重要 | 灰 |
| 5 | 0-1999 / 未设 | 待思考 | 半透明 |

### 关键设计决策

1. **目标 vs 计划 UI 强区分**（7目标=📌深色稳重，8计划=⚡浅色活泼）
2. **树根判定 = fu 指向 ROOT_FUYUAN**（天本身），不是 fu=null
3. **真叶子 = zi 数组长度为 0**（mingdao v2 open API 的 zi 是 Relation 数组）
4. **mingdao filter 失效** → 客户端 verify（数据从 proxy 拉全表，前端 filter）
5. **drag 跨区域 → 改 zhixindu**；同区域拖动改 quanzhong
6. **升级（plan→target）→ editRow sew=7目标**

### 已知踩坑（已修复）

| 坑 | 原因 | 修复 |
|---|---|---|
| filter 失效返回全表 | mingdao v2 filter bug | 客户端 verify + 拉全表 |
| sew 字段比对 UUID key | dropdown 返回显示文本"7目标" | proxy 直接保留显示文本，前端用字符串比对 |
| fu/fuyuan 是 JSON 字符串 | Relation 字段 v2 open API 序列化 | proxy normalizeRow parse 成 `[{sid,name}]` 数组 |
| zi 是数组不是数字 | 同上 | proxy normalizeRow 保留数组；前端 `getZi()` 取 length |
| 顶级目标 fu 不为 null | mingdao 顶级目标的 fu 指向「天」 | 根判定改为 `fu === ROOT_FUYUAN` |

---

## 检索机制

本系统的检索 = **客户端拉全表 + 拖动调整两个数值字段**，不依赖后端 filter（mingdao v2 filter 已失效）。所有排序、分区、筛选都在前端完成，写回 HAP 的也只改两个数值字段（权重 / 置信度）。

#### 1. 权重 (quanzhong)

- **字段 UUID**：`6a051fd0f255b2b51491a981`
- **触发动作**：同区域内拖动（不换区，只换位置）
- **作用**：控制**同一象限内**的显示顺序——同区域里 quanzhong 越大越靠前
- **写入接口**：`/api/record-update`，改该节点的 `quanzhong` 字段值

#### 2. 置信度 (zhixindu)

- **字段 UUID**：`6a410730405fcd4e19424918`
- **触发动作**：跨区域拖动（换区，从一象限到另一象限）
- **作用**：控制 **Eisenhower 四象限分区**（8000-10000 红 / 6000-7999 蓝 / 4000-5999 黄 / 2000-3999 灰 / 0-1999 半透明）
- **写入接口**：`/api/record-update`，改该节点的 `zhixindu` 字段值

#### 设计意图

拖拽操作 = 一次人类直觉判断（一句话：「这个比那个重要/紧急」）→ 落到两个标量字段（权重 / 置信度）→ 看板与树视图自动重排。**所有排序逻辑靠这两个字段，不再加 UI 配置项**。

---

## 12 条数据现状（截至 2026-08-18）

```
天 (8efa9d4b)
└── 完善agent架构群 (1935ed85, 7目标)
    ├── 通过一些可视化 (37e18128, 7目标)
    │   ├── 内容元数据可视化 (0e212ab3, 7目标) ← 叶子
    │   └── 文档web页面 (695f491d, 7目标)
    │       └── 完成文档web页面1.0 (9f123a59, 8计划) ← 叶子
    ├── 定期清理fsj (35f0a56a, 7目标)
    ├── 莫容风摆脱文档 (c7350cff, 7目标)
    │   └── 确定天技能范式 (4ab5e3ca, 8计划) ← 叶子
    └── 完善慕容风和林东城 (894a87e7, 7目标)
        ├── 后期慕容风 (a54cb983, 7目标) ← 叶子
        ├── 中期慕容风 (2fbe0001, 7目标) ← 叶子
        └── 前期种子数据 (ee73137c, 7目标) ← 叶子
```

**6 条真叶子**（zi=0，可拖拽操作）：
1. 内容元数据可视化（7目标）
2. 完成文档web页面1.0（8计划）
3. 确定天技能范式（8计划）
4. 后期慕容风...（7目标）
5. 中期慕容风...（7目标）
6. 前期种子数据...（7目标）

---

## 验证清单（E2E 已通过 ✅）

- [x] proxy.js 启动成功
- [x] 浏览器加载 index.html 无报错
- [x] 树显示 12 条数据（4 层）
- [x] 看板显示 6 条真叶子
- [x] 勾选联动（树取消勾选 → 看板对应叶子灰）
- [x] 拖动改 zhixindu（区域之间）
- [x] 拖动改 quanzhong（同区域内）
- [x] 新增目标/计划
- [x] 编辑 mingcheng/wznr/zhixindu/quanzhong
- [x] 升级（plan→target）
- [x] 删除（中间节点拒绝 / 叶子允许）
- [x] HAP 后台 verify 数据变更

---

## 已知问题 / 后续

| 问题 | 说明 |
|---|---|
| mingdao filter 失效 | 已知 bug，每次拉全表 ~4 MB JSON。可接受；如性能出问题再分页 |
| 凭证明文 | APPKEY + SIGN 在 proxy.js 硬编码，同 fsj-web-doc 模式；建议迁 env |
| 时间线视图 | 东城 2026-08-19 明确搁置，未实现 |
| Dify 工作流封装 | 待基础功能跑通后再考虑 |
| 拖动顺序持久化（quanzhong）| 当前是简化实现（拖动会改 quanzhong，但精确排序需要前端先排序再 batch 写）|

---

*启动时间：2026-08-18*
*作者：小风（基于林东城 PRD v0.7 + 真实数据验证）*