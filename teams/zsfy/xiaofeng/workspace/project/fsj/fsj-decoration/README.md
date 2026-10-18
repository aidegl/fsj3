# fsj-decoration 门店装修器

商家后台的可视化页面装修工具：编辑小程序底部导航、首页组件区块、「我的」页面菜单和主题色，保存后直接写入明道云商家表，对 webview-spa2.0 小程序端实时生效。

## 使用方式

```
# 直接打开（无参数时显示商家选择列表）
index.html

# 按商家 mrowid 字段值定位（推荐，与小程序端分发链接一致）
index.html?mRowid=6987e26df85eb8e34416b19d

# 按商家记录 rowid 定位（商家未设置 mrowid 字段时）
index.html?rowid=f009cda3-cc49-400d-82cd-cbe79ee8892f
```

本地预览建议起一个静态服务器（避免部分浏览器对 file:// 的限制）：

```bash
cd fsj-decoration
npx serve .          # 或 python -m http.server 8080
```

## 功能

| 模块 | 说明 |
|------|------|
| 底部导航 TabBar | 增删导航项、名称/排序值/page 路由/内外链模式/图标 key |
| 首页组件区块 | 组件库添加 4 种组件（搜索框/轮播图/功能列表/内容列表），参数面板编辑，支持隐藏与顺序调整 |
| 轮播图内容 | 从内容表（shangpin）按商家搜索并勾选内容，勾选顺序即轮播顺序 |
| 内容列表分类 | category_filter 列表编辑（名称/排序/分类 rowid） |
| 我的页面菜单 | wode 菜单项增删改、页面路由 |
| 主题色 | 取色器 + 预设色板，对应 color 字段 |
| 实时预览 | 手机模拟器按真实数据渲染（banner 内容图、内容列表、功能列表），点击区块联动编辑 |
| 草稿保护 | 编辑自动存 localStorage，误关页面后可恢复；保存成功后清除 |
| 保存 | editRow 更新商家表 `dbdhl` / `wode` / `color` 三个字段，保存前弹窗确认 |

## JSON 配置格式（与 webview-spa2.0 对齐）

保存到商家表 `dbdhl` 字段的完整结构：

```json
[
  {
    "name": "首页", "sort": "0", "page": "home", "mode": "0",
    "url": {
      "home_sections": [
        { "type": "search_box",    "config": { "show_org_switch": false } },
        { "type": "banner_swiper", "config": { "items": ["内容rowid", "..."] } },
        { "type": "feature_list",  "config": { "show_feature_list": true, "columns": 4 } },
        { "type": "content_list",  "config": {
            "content_types": ["article"],
            "card_layout": "horizontal",
            "items_per_load": 10,
            "category_filter": [
              { "name": "全部", "sort": "0", "rowid": "" },
              { "name": "赏金", "sort": "1", "rowid": "984cddf9-..." }
            ]
        } }
      ]
    }
  },
  { "name": "发布", "sort": "2", "page": "publish" },
  { "name": "我的", "sort": "3", "page": "mine" }
]
```

组件类型的字段定义集中在 [js/schema.js](js/schema.js)，与 `webview-spa2.0/js/pages/home.js` 的渲染器一一对应；新增组件类型时同步维护该文件即可。

## 架构

```
index.html          主页面（三栏布局）
css/admin.css       编辑器框架样式
css/phone.css       手机预览样式（还原 spa2.0 视觉）
js/api.js           Node 代理（/mingdao）→ 明道云（商家表/内容表/功能表 读写）
js/schema.js        组件配置元数据（驱动属性面板自动生成）
js/store.js         状态管理（数据模型/草稿/dirty）
js/preview.js       手机预览渲染器
js/panel.js         属性面板（表单自动生成）
js/main.js          主入口（定位商家/三栏联动/保存）
```

数据通道与 webview-spa2.0 相同：前端 → Node 代理（`https://100000whys.cn/mingdao`）→ 明道云 HAP，appKey/sign 服务端注入。2026-09-04 从 Dify 迁移（见 api/通用API接口文档-Node版.md）。

## 相关表

| 表 | worksheetId | 用途 |
|----|-------------|------|
| 商家表（组织表） | `69f549c69f1956fc0e171aa6` | dbdhl / wode / color / mrowid 字段读写 |
| 内容表 | `shangpin`（别名） | 轮播内容选择、内容列表预览数据 |
| 功能表 | `gongnengbiao`（别名） | feature_list 预览数据 |
