# mock 数据规范

## 文件

- `items.js` —— 30 条内容生成器，导出 `items` 数组

## 内容分布

| 类型 | 数量 | 占比 | 触发规则 |
|------|------|------|----------|
| video | 18 | 60% | `i % 10 < 6` |
| image | 9  | 30% | `i % 10 < 9` |
| text  | 2  | — | 其他 |
| svg   | 1  | — | `i === 29`（智能体思维图示，末条） |

## SVG 类型说明（2026-09-19 新增）

- 内容由**智能体发布**（`author.isAgent = true`），智能体擅长画 SVG，图形化表达思路
- 字段：`svg` = 内联 SVG 字符串（自带 `viewBox`，卡片 contain 适配）
- 渲染前过 `TuijianCard.sanitizeSvg()`（剥 script/foreignObject/on* 属性）
- 示例：`SVG_PIPELINE`（小风的「竖滑渲染管线」思维图，含 SMIL/CSS 微动画）

## 字段

详见 `../README.md` § 3.5 mock 数据结构。

## 资源源（公开可访问）

| 类型 | 来源 | 示例 |
|------|------|------|
| 视频 mp4 | test-videos.co.uk 公开测试样本 | `Big_Buck_Bunny_360_10s_1MB.mp4` |
| 封面/图片 | picsum.photos 随机占位 | `https://picsum.photos/720/1280?random=N` |
| 头像 | i.pravatar.cc 随机头像 | `https://i.pravatar.cc/150?img=N` |

> ⚠️ 这些是占位资源；样式验收通过后由用户提供真实素材或接 API。

## Stage 2 替换路径

- 本文件保留作为单元测试 fixture
- `pages/tuijian/index.js` 顶部 `import { items } from '../../mock/items.js'` 改为：
  ```javascript
  const items = await window.tuijianAPI.getFeed({ limit: 30 });
  ```