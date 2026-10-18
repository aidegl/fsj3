# 并入 SPA2.0 技术路线 · fsj-tuijian

> 版本 v1.0 · 2026-09-19 · 无名（与老板对齐后成文）
> 状态：技术路线已定，待实施
> 姊妹篇：[缓存策略.md](./缓存策略.md)（§4.1 实例池 / §5 嵌套架构 / §6 缓存堆积——本文不重复其结论，只引用）

---

## 1. 一页看懂（TL;DR）

| 问题 | 结论 |
|------|------|
| 入口形态 | 商家 JSON 首页「功能模块」点击 → 现有 `switchToWebview` → `#page-webview` iframe 加载 tuijian（交互/顶栏返回/登录态 hash 传递全部复用现成机制） |
| 算 iframe 吗 | 算。链路 = 小程序 web-view → SPA2.0 文档 → iframe（tuijian），三层 |
| 三层嵌套最大隐患 | **不是缓存**（缓存按 URL 内核只存一份），是**内存叠加**——视频流解码是大头，iOS 超限闪退 |
| 能否提前加载 | 能，且只做「**代码预热**」（空闲期 fetch 落 HTTP 缓存，不建 iframe 不执行）；**不做** iframe 预热（媒体页内存常驻风险） |
| webview 缓存会弄挂小程序吗 | 不会。小程序 storage（10MB）与 webview HTTP 缓存（内核配额几百 MB + LRU 自动清理）是**两套隔离体系**，缓存满 = 自动淘汰重下，无崩溃通路 |
| 需要新写的代码 | SPA 端约 40 行（预热 + 离开卸载）；tuijian 端沿用缓存策略 §4.1 实例池排期 |

---

## 2. 背景与决策史

| 日期 | 事件 |
|------|------|
| 2026-09-18 | 缓存策略 v1.0 定稿（老板拍板方向），§5.4 给出两种安全形态：平级页面 / 独立入口，**否决**塞进 SPA iframe 页 |
| 2026-09-19 | 老板明确入口形态：SPA2.0 底部菜单由商家 JSON 定义、首页功能模块跳转进入 tuijian——即走现有 `switchToWebview` iframe 机制 |
| 2026-09-19 | 本文：在「业务必须功能模块入口」前提下，用三件套保险把 iframe 形态的隐患压到可接受（对应缓存策略 §5.4 第 3 条兜底：离开页面时卸载 iframe） |

### 2.1 被否决的备选路线（留档，防止走回头路）

| 路线 | 否决原因 |
|------|----------|
| TabBar 平级挂外链（mode:"1"） | 本质同样走 `#page-webview` iframe（三层嵌套）——昨天已探讨的「页面嵌套缓存加载问题」；且视频流页内存风险更常态化（tab 常驻入口） |
| 平级 page 容器（无 iframe，`#page-tuijian` 动态加载） | 内存最优，但需改 `switchPage` 核心加懒加载机制 + 二级页顶栏返回要新做；当前入口诉求是「功能模块跳转」，不值得先动框架。**保留为 Stage 3 演进方向** |
| 小程序原生新增 tab 页 + web-view 直载 | 要发小程序审核，周期长；且 tabBar 页全原生改造，收益不成比例 |
| iframe 预热（提前赋 src） | 点击更快一点，但 JS 堆 + 媒体提前吃内存且**常驻**——视频流页 iOS 风险加剧，明确不做 |

---

## 3. 现状链路（实查 app.js / home.js，2026-09-19）

```
商家 JSON（shangjia / home_sections 配置）
 └→ SPA2.0 首页 feature_list 渲染宫格（js/pages/home.js renderFeatureList）
     └→ 功能模块点击（_bindFeatureClick）
         └→ App.switchToWebview(url, 'home')        ← 二级入口，顶栏带返回
             └→ #page-webview 页面激活
                 └→ <iframe id="webview-iframe" src="https://100000whys.cn/tuijian/">
```

登录态传递：`refreshIframeHash` 把 `fsj_openid / fsj_user / fsj_shangjia / fsj_balance` 写进 iframe URL hash（同域不触发重载，只触发 hashchange）。

**已确认的现状缺陷**：切走 webview 页 / 返回首页时，`iframe.src` **不清**——tuijian（含视频解码器）在不可见的 iframe 里继续存活耗内存。这是三件套之一要修的。

### 3.1 并入代价核查矩阵（实查数据）

| 检查项 | 结果 | 依据 |
|--------|------|------|
| Tailwind CDN 重复拉取 | **不存在**（README §3.1 写了 Tailwind，实际实现零使用——README 待订正） | grep tailwind 全项目 0 命中 |
| Font Awesome 重复 | **同版本同 CDN**（4.7.0 jsdelivr），内核缓存同一份 | 两边 index.html 实查 |
| CSS 类名冲突 | 10 个关键类名（card-\* / action-bar / author-bar / text-content / svg-stage / tuijian-page / flying-heart）在 SPA 四个 css 里 **0 命中** | grep 实查 |
| rem 适配打架 | **无**——SPA2.0 全程 px、零 rem 消费、无 fontSize 设置；tuijian 的 setRem（html font-size = 视口宽/7.5）并入后只被 tuijian 样式消费，无害 | grep 实查 |
| tuijian 代码体积 | 纯运行代码 **~66KB**（5 组件 + 页面 + mock；PNG 截图 3.3M 不算） | du/ls 实查 |

---

## 4. 嵌套 iframe：真假隐患清单

### 4.1 假隐患（不用担心）

**「每嵌一层缓存多存一份」——不成立。**
HTTP 磁盘缓存归 WebView 内核管，按 URL 为 key 全内核一份：小程序 web-view 里加载过的 `100000whys.cn/xxx.js`，iframe 里再加载同 URL 直接命中同一份。跨域名才分条目，但仍在同一个内核缓存池。**套娃不放大缓存，只放大内存**（缓存策略 §5.2）。

**「webview 缓存满会弄挂小程序」——不存在此通路。**

| 体系 | 配额 | 满了的行为 |
|------|------|-----------|
| 小程序原生 storage（wx.setStorage） | 每小程序 10MB | 超限报错——但与 webview 缓存**互不相通** |
| webview HTTP 磁盘缓存（代码/媒体） | iOS WKWebView / 安卓 XWEB 内核动态配额（几百 MB 级，随磁盘空间浮动） | **LRU 自动淘汰**最久未用条目 → 重下，无报错、无崩溃、不影响小程序任何功能 |

结论：磁盘缓存内核自动管（越攒命中越高 = 越刷越快）；唯一要主动管的是**内存**（缓存策略 §6）。

### 4.2 真隐患（三件套要压的）

| # | 隐患 | 量级 | 压制手段 |
|---|------|------|----------|
| 1 | 内存三层叠加：各层独立 JS 堆 + DOM + 视频解码器（几十 MB/路） | iOS WKWebView 超限 = 系统杀整个小程序（闪退） | ③ 视频实例池 2 个封顶 + ② 离开即卸载 |
| 2 | 切走不销毁（现状缺陷）：不可见 iframe 里视频继续解码 | 内存常驻、发热 | ② 离开即卸载 iframe |
| 3 | postMessage 跨层通信协议维护（登录态 hash / 支付通知） | 小 | 复用现有通道，不新增协议 |

---

## 5. 预加载设计：代码预热（核心新增）

### 5.1 时间线

```
小程序打开
 └→ webview 加载 SPA2.0（首屏照常，零干扰、零增量）
     └→ 首屏渲染完成 + 网络空闲
         └→ requestIdleCallback（兜底 setTimeout 3s）
             └→ 后台 fetch tuijian 骨架三件（index.html / index.js / 各 css）
                 → 只落 HTTP 磁盘缓存，不建 iframe、不执行、不占内存 ← 用户无感
                 
用户点功能模块
  └→ switchToWebview → iframe 加载 → 全部命中缓存（毫秒级）
      └→ tuijian 启动 → init → 秒开 ✅

用户切走
  └→ SPA 端 iframe.src = 'about:blank' → tuijian 端 destroy 释放全部视频/内存
二次进入
  └→ 代码缓存命中 + feed 内存缓存已清（重新拉）→ 仍远快于冷启动
```

### 5.2 设计要点

1. **预热时机**：首屏渲染完成后才启动（`requestIdleCallback`，XWEB 不支持则 `setTimeout 3000`）——首屏零抢带宽，与缓存策略 §4.1「预载闸门」同思想
2. **预热范围**：只 fetch 骨架（HTML+JS+CSS，~66KB ≈ 一张缩略图）；**不预拉媒体**（视频/封面归 §4.1/§4.2 的实例池与图片预载管，进 iframe 后按需）
3. **不做 iframe 预热**：提前赋 src 会让 JS 堆与媒体提前常驻——媒体页明确禁止（§2.1 备选路线否决记录）
4. **版本号配套**：预热落缓存要能被命中，依赖缓存策略 §4.3（deploy 注入 release 号替换 `?v=Date.now()`）——否则每次进页 HTML 禁缓存导致预热白做。**两项必须同批上线**

---

## 6. 三件套保险（实施清单）

| # | 改动 | 落点 | 工作量 |
|---|------|------|--------|
| ① | **离开即卸载 iframe**：`switchPage` 切离 `page-webview` / 返回 home 时 `iframe.src = 'about:blank'`（重新进入时 switchToWebview 会重新赋值） | SPA `js/app.js` | ~5 行 |
| ② | **代码预热**：首屏空闲期 prefetch tuijian 骨架（§5） | SPA `js/app.js` init 完成后 | ~35 行 |
| ③ | **视频实例池 + 双缓冲**：2 个 `<video>` 封顶、离屏释放、预载闸门 | tuijian `VideoPlayer` / `TuijianCard` / `pages/tuijian/index.js` | 缓存策略 §4.1 既有排期，独立迭代 |

依赖关系：② 依赖 §4.3 版本号改造（同批）；③ 与 ①② 解耦可并行。

### 6.1 实施顺序

```
Step 1  缓存策略 §4.3 版本号改造（deploy 注入 release 号）      ← 预热的前置
Step 2  ① 离开即卸载 iframe（最小改动，对 hezi 页也是普遍收益）
Step 3  ② 代码预热上线
Step 4  ③ 视频实例池（tuijian 端独立迭代，缓存策略排期）
Step 5  双端真机验收（§7 清单）
```

### 6.2 不做清单

| 项 | 理由 |
|----|------|
| iframe 预热 | 媒体页内存常驻风险（§2.1） |
| 媒体存宝塔 | 动态海量数据，容量养不起（老板拍板，缓存策略 §4.6） |
| Service Worker | iOS 支持安卓 XWEB 不稳，双端行为不可控（缓存策略 §4.6） |
| SPA 平级 page 懒加载改造 | 当前入口形态不需要；保留为 Stage 3 演进方向 |

---

## 7. 双端验收清单

- [ ] 首屏：SPA 打开速度与并入前无感知差异（预热零抢带宽）
- [ ] 预热生效：首次点功能模块进 tuijian，骨架加载走缓存（DevTools_NETWORK 看 disk cache）
- [ ] 切走即释放：从 tuijian 返回首页后，iframe 置空，iOS 内存回落（Instruments / XWEB 内存面板）
- [ ] iPhone 真机：功能模块进入 tuijian → 竖滑 20+ 条 → 双击飞心 → 返回 → 再进入，全程无闪退
- [ ] 安卓真机（XWEB）：同上
- [ ] 弱网：预热完成前进功能模块，骨架兜底（封面 + spinner）不白屏
- [ ] 登录态：refreshIframeHash 传参正常（进入 tuijian 后身份正确）
- [ ] 缓存堆积：连续多日使用，小程序无异常（内核 LRU 自动代谢）

---

## 8. Stage 3 演进预留（不实施，只留路）

- **平级 page 容器形态**：若未来重媒体页增多 / iframe 内存瓶颈实证出现，按 §2.1 备选路线改造（`#page-tuijian` 动态 import + switchPage 懒加载分支），本文档 §3.1 核查矩阵的结论全部可复用（类名/rem/依赖零冲突已验证）
- **tuijian 独立站过渡**：`100000whys.cn/tuijian/` 独立部署与 svg 卡片能力保留，作为 iOS 验收期的对照环境与回滚余地

---

*本文档为并入路线基线；实施过程中若与缓存策略 v1.0 冲突，以老板拍板为准并回写两份文档。*
