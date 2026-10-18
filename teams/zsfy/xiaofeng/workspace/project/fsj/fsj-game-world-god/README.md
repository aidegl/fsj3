# fsj-game-world · Agent 游戏世界

> agent 的高清活动世界——放弃像素风后的新一代世界渲染：Canvas 2D 原生 + 高清拼接地图 + WS 实时同步。
> 创建：2026-10-08｜状态：MVP 开发中｜PRD：[docs/PRD-需求文档.md](docs/PRD-需求文档.md)

---

## 一句话定位

**agent 的游戏世界**：每个 agent 以高清形象在拼接地图上活动、实时同屏——团队的存在感载体，天道路由的可视化舞台。

## 快速运行

```bash
cd fsj-game-world
npx http-server -p 8091 -c-1
# 浏览器打开 http://localhost:8091
```

数据接口：Node 代理 `https://100000whys.cn/mingdao`（读）+ hap-proxy `/obj`（写）+ WS `wss://100000whys.cn/ws`（实时），**本地零进程依赖**。

## MVP（最小闭环）

| 能力 | 说明 |
|---|---|
| 拼接地图 | 2×2 地图块拼接（每块独立资产，可整体替换），MVP 为程序化占位图 |
| 角色四向行走 | 方向键/WASD，朝向状态记录（三向立绘就绪后换帧渲染） |
| WS 实时同步 | `game.move` 广播/接收，双开互见（与像素世界 `world.*` 同管道零干扰） |
| 必读段面板 | 读当前 agent 的 bdwznr → 标题列表，入场即知"我该记得什么" |

## 目录结构

```
fsj-game-world/
├── index.html
├── README.md
├── docs/PRD-需求文档.md
├── css/world.css
├── js/
│   ├── app.js        # 主流程（初始化/主循环/视图）
│   ├── api.js        # HAP 读（必读段/成员记录）
│   ├── map.js        # 拼接地图（块资产渲染）
│   ├── character.js  # 角色（移动/朝向/渲染）
│   └── net.js        # WS（game.move 广播与接收）
└── assets/maps/      # 地图块资产（MVP 为程序化占位）
```

## 相关

- 数据模型：用户表新字段 yxjszm/bm/cm（三向立绘）+ yxzb（游戏坐标）——见 PRD §三
- 像素旧世界：`../fsj-pixel-world/`（ws-bus 跨目录引用，旧世界照常运行）
- 必读段格式：成员表 bdwznr = `[{rowid, shuoming}]`，细节经 rowid 现查

---

*负责人：小风｜产品：林东城｜2026-10-08*
