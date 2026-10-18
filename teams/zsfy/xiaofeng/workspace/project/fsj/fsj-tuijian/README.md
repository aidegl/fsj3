# fsj-tuijian · 抖音式推荐页

> 小程序内嵌 webview SPA · 一次一卡竖滑 · 样式先行 + 数据后打通

---

## 1. 项目定位

| 项 | 值 |
|----|----|
| 目标 | 给 fsj 平台做一个抖音式内容推荐页，作为内容分发的核心入口 |
| 宿主 | 微信小程序内嵌 webview |
| UI 形态 | 抖音式：一次一卡全屏，竖滑切换 |
| 阶段策略 | Stage 1 mock 样式 → Stage 2 老板教打通数据 → Stage 3 联调上线 |
| 当前阶段 | Stage 1 已上线正式站：https://100000whys.cn/tuijian/ · 等真机验收 |
| 部署 | `node deploy.mjs tuijian`（正式）/ `node deploy.mjs`（playground 试传）；token 放 `deploy.config.json`（勿提交） |

---

## 2. 业务需求

### 2.1 核心交互

```
┌──────────────────────────────┐
│                              │
│                              │
│      [内容卡片]                │  ← 占满整屏
│    video / image / text      │
│                              │
│              ┌─┐    ❤   │
│   [视频控件]  └─┘  ☆   │  ← 右侧操作栏
│              @   ➤   │
│             头像  💬   │
│             作者  ✕   │
│            @name        │
│        推荐描述…           │
└──────────────────────────────┘
```

- **上滑**：下一条；**下滑**：上一条
- **单击视频**：播放/暂停
- **双击视频**：点赞 + ❤️ 飞出动画
- **右侧 ❤**：点赞切换（实心/空心）+ 计数 +1
- **右侧 ☆**：收藏切换（实心/空心）+ 计数 +1
- **右侧 ➤**：分享（mock toast）
- **右侧 💬**：评论数（点击展开评论面板，先只读）
- **右侧 ✕**：不感兴趣（跳过此条 + 进入下一条 + 后续接入"反馈 API"）
- **底部头像**：点击 = 关注/取消关注（本地状态）
- **底部 @name**：跳作者主页（Stage 1 toast 提示）

### 2.2 内容类型与 mock 分布

| type | 占比建议 | 字段 |
|------|----------|------|
| `video` | 60% | url, coverUrl, duration, w×h |
| `image` | 30% | urls[]（1-3 张） |
| `text` | ~7% | textBlocks[], backgroundColor |
| `svg` | 少量（智能体发布） | svg（内联 SVG 字符串，viewBox 自适应）；author.isAgent=true |

> **SVG 类型（2026-09-19 新增）**：推荐流内容很多由智能体发布，智能体擅长画 SVG——
> 用图形反应它们的思路思维（架构图/流程图/思维导图）。渲染分支 `TuijianCard` 四态，
> 注入前过 `sanitizeSvg()` 轻清洗。mock 见 `items.js` 末条 `SVG_PIPELINE`。

> **待你确认**：60/30/10 比例是否合适？

### 2.3 明确不做（范围外）

- ❌ 视频上传/编辑
- ❌ 评论编辑器
- ❌ 作者主页内容（点击只 toast）
- ❌ 关注关系链（只本地状态，Stage 2 接 API）
- ❌ 用户登录态（Stage 1 不接）

---

## 3. 技术方案

### 3.1 技术栈

| 项 | 选择 | 依据 |
|----|------|------|
| 架构 | 小程序内嵌 webview SPA | 用户拍板 |
| 三分离 | HTML+CSS+JS 独立文件 | `webview-spa-template` 约定 |
| 框架 | 原生 JS（不引入 Vue/React） | `tech-style.md` + 小风偏好 |
| 样式 | Font Awesome CDN + 手写 CSS（rem 适配 750 稿） | 实测未用 Tailwind（2026-09-19 订正），零额外 CDN 依赖 |
| 视频 | 原生 `<video>` 标签 | 体积小零依赖，待验证兼容性 |
| 模块 | ES6 Module | `webview-spa-template` |
| 缓存 | 三层禁用（meta + URL版本 + fetch no-store） | 模板内置 |
| 通信 | `wx.miniProgram.postMessage` | 小程序 ↔ webview |
| rem 适配 | 750px 设计稿 / html font-size: 100px | 模板约定 |

### 3.2 目录结构

```
fsj-tuijian/
├── README.md                 # 本文件
├── index.html                # 入口 HTML
├── index.js                  # 入口 JS（实例化 Page）
├── index.css                 # 全局样式重置
├── pages/
│   └── tuijian/              # 推荐页（主页面）
│       ├── index.html
│       ├── index.css
│       └── index.js          # 导出默认类 Page
├── components/               # 组件（每个独立三段式）
│   ├── TuijianCard/          # 卡片（video/image/text 三态）
│   ├── ActionBar/            # 右侧悬浮操作栏
│   ├── AuthorBar/            # 底部作者栏
│   ├── VideoPlayer/          # 视频播放器封装
│   └── CommentSheet/         # 评论面板（只读）
├── mock/
│   ├── items.js             # 30 条 mock 内容（生成器；ES Module 友好）
│   └── README.md            # mock 规范
└── docs/
    ├── PRD-需求文档.md        # 业务需求详细版
    └── 技术方案.md            # 技术细节
```

### 3.3 状态管理（轻量，类内字段）

```javascript
class Page {
  // 数据
  items = [];              // mock 数组（Stage 2 换 API）
  currentIndex = 0;        // 当前卡片索引
  cards = [];              // [prev, curr, next] 三卡预加载

  // 互动状态
  likedMap = {};           // { id: true }
  collectedMap = {};       // { id: true }
  followedSet = new Set(); // 作者 id
  dislikedSet = new Set(); // 不感兴趣 id

  // 生命周期
  init() / destroy()       // 模板约定
}
```

### 3.4 滑动实现

候选方案（Stage 1 验证）：

- **A**：CSS scroll-snap（浏览器原生，兼容性受限）
- **B**：自实现 touchstart/touchmove/touchend + transform translateY

关键参数：
- 触发阈值：滑动距离 ≥ 80px 才切换
- 动画时长：300ms ease-out
- 首屏可见：必须保证第一帧渲染完成才显示

> **待你确认**：哪种更稳？我倾向 B（控制力强）。

### 3.5 mock 数据结构（Stage 1 契约）

```javascript
{
  "items": [
    {
      "id": "mock_001",
      "type": "video",                    // 'video' | 'image' | 'text'

      "title": "推荐标题",
      "description": "推荐描述，支持 emoji ✨",

      "author": {
        "id": "u_001",
        "name": "作者名",
        "avatarUrl": "https://...",
        "verified": false
      },

      "video": {                          // type=video 必有
        "url": "https://...mp4",
        "coverUrl": "https://...jpg",
        "duration": 30,
        "width": 720,
        "height": 1280
      },

      "images": [                         // type=image 必有
        "https://...jpg",
        "https://...jpg"
      ],

      "textBlocks": [                     // type=text 必有
        { "type": "h2", "content": "..." },
        { "type": "p",  "content": "..." }
      ],
      "backgroundColor": "#1a1a1a",

      "svg": "<svg viewBox='0 0 720 1280'>...</svg>",  // type=svg 必有（内联字符串）

      "author": { ..., "isAgent": true },  // svg 内容通常 isAgent=true（智能体发布）

      "stats": {
        "likeCount": 1234,
        "commentCount": 56,
        "shareCount": 78,
        "collectCount": 90
      },

      "createdAt": "2026-09-15T10:00:00Z"
    }
  ]
}
```

### 3.6 API 接入约定（Stage 2 起效）

```javascript
// Stage 1 用 mock；Stage 2 由老板指定数据源后实现以下接口
window.tuijianAPI = {
  getFeed({ cursor, limit = 10 }) { /* ... */ },
  like(id)        { /* ... */ },
  unlike(id)      { /* ... */ },
  collect(id)     { /* ... */ },
  uncollect(id)   { /* ... */ },
  follow(authorId)    { /* ... */ },
  unfollow(authorId)  { /* ... */ },
  dislike(id, reason) { /* ... */ }
};
```

Stage 2 时由老板教具体怎么接（HAP V3 / 自建 Node / 抖音云 / 其他）；本文件不预设。

---

## 4. 阶段规划

| 阶段 | 内容 | 验收点 |
|------|------|--------|
| **Stage 1** | mock 数据 + 三态卡片 + 抖音式滑动 + 互动组件 + 视频播放/暂停 | 用户视觉验收 |
| **Stage 2** | 老板教打通数据（具体 API 数据源由老板定） | 数据流通 |
| **Stage 3** | 接登录态 + 性能优化（视频预加载） + 兼容性测试 | 上线 |

---

## 5. 待你确认（开工前必看）

| # | 问题 | 我的建议 | 你的决定 |
|---|------|----------|----------|
| 1 | 视频方案：原生 `<video>` 还是 video.js？ | 原生 `<video>`，不行再换 | ? |
| 2 | 内容比例 60/30/10 是否合适？ | 待你定 | ? |
| 3 | 滑动方案 scroll-snap vs 自实现？ | 自实现（控制力强） | ? |
| 4 | 评论面板是否要做？ | 做只读壳子（占位 + "暂无评论"） | ? |
| 5 | 是否需要配套详情页？ | 不做，先做单页 | ? |
| 6 | 30 条 mock 数据用什么素材？ | 你给素材 or 我用占位图 | ? |

> 表格里「你的决定」列你审 README 时直接答复就行。

---

## 6. 跑起来

```bash
cd fsj-tuijian
npx serve .          # 或 python -m http.server 8080
# 浏览器打开 http://localhost:8080
```

> 小程序 webview 调试需部署到 HTTPS 域名；Stage 1 在浏览器验收即可。

---

## 7. 引用

- 并入主站技术路线：[docs/并入SPA2.0技术路线.md](docs/并入SPA2.0技术路线.md)（2026-09-19 定稿）
- 缓存与预加载策略：[docs/缓存策略.md](docs/缓存策略.md)
- 小风技术栈：`D:\fsj\.claude\memory\tech-style.md`
- webview SPA 模板：`D:\fsj\team\xiaofeng\skills\webview-spa-template\SKILL.md`
- 首页架构参考：`D:\fsj\workspace\project\fsj\webview-spa2.0\doc\首页组件架构文档.md`
- HAP 字段规范：`D:\fsj\workspace\project\fsj\api\通用API接口文档-Node版.md`

---

*v0.1 草案 · 2026-09-18 · 小风*
*待你审阅 · 通过后开工*