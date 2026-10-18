# fsj-dongchengliaoai-website · 粽说风云官网

> 「东城聊AI」商家宇宙的自定义 storefront——自媒体粉丝的资源整合入口：课程（学浪）、介绍、资源与社群、AI 理念。
> 创建：2026-10-08｜状态：PRD 定稿中｜PRD：[docs/PRD-需求文档.md](docs/PRD-需求文档.md)

## 一句话定位

**「东城聊AI」商家宇宙的自定义 storefront**：粉丝从这里认识林东城、学课程、进社群、看 AI 理念——所有内容长在 fsj 内容元数据表里，官网是它的定制皮。

## 快速运行

```bash
cd fsj-dongchengliaoai-website
npx http-server -p 8094 -c-1
# 手机同 WiFi 访问 http://<电脑IP>:8094
```

数据接口：Node 代理 `https://100000whys.cn/mingdao`（匿名读公开内容），**本地零进程依赖**。

## 四大板块

| 板块 | 交付方式 |
|---|---|
| 课程 | 卡片展示 → 点击**外跳学浪** |
| 我的介绍 | 东城 IP 页（静态 + AI 高清形象） |
| 资源与社区 | 社群二维码导流 + 资源清单 |
| AI 理念 | 社区页面：理念帖流（读内容元数据 文章类） |

## 目录结构

```
fsj-dongchengliaoai-website/
├── README.md
├── docs/PRD-需求文档.md
├── index.html          # 首页（SPA）
├── css/                # 样式
└── js/
    ├── app.js          # 主流程
    ├── api.js          # HAP 读
    └── pages/          # 四大板块页面
```

## 相关

- 商家概念：webview-spa2.0/doc/商家组织架构设计文档.md
- 内容元数据机制：webview-spa2.0/doc/内容元数据使用指南.md
- 素材风格：高清 AI 生成（MiniMax image-01 已验证），非像素风

---

*负责人：小风｜产品：林东城｜IP：东城聊AI｜2026-10-08*
