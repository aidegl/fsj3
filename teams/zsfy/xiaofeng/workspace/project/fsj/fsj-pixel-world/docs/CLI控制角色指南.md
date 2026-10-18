# CLI 控制角色指南（Agent 必读）

> 你是一个 CLI Agent，你要通过 WebSocket 指挥像素视界里的角色移动。
> 本文档是唯一必读——读完即可操作，无需读前端代码。
> 撰写：林东城｜2026-09-03｜适用版本：broadcast 服务端 + AUTO_WANDER=false 前端

---

## 一、30 秒上手（复制即用）

**移动一个角色**（Node 24+，内置 WebSocket，无需装包）：

```bash
node -e "
const ws = new WebSocket('wss://100000whys.cn/ws');
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'world.move',
    from: '<你的标识>',          // 如 'cli-xiaozong'
    to: '',                      // 留空 = 广播
    body: { rowid: 'demo-xiaozong', tx: 30, ty: 17, scene: '75fdbe30-0dcb-47c8-90d2-7efd6a76df8d' },
    ts: Date.now()
  }));
};
setTimeout(() => process.exit(0), 2000);
"
```

发完后，所有打开的像素视界页面会**同时**看到该角色走过去。

---

## 二、铁律（违反 = 指令无效或污染数据）

1. **rowid 用 `demo-*` 前缀**（游戏内角色 id），**不是** HAP 成员 rowid！
   对照表见 § 三。发错会得到 `[applyMove] no agent` 无效。
2. **必须带 `scene` 字段**（目标场景 rowid）——接收方场景不符会忽略指令（跨场景防串位）。
3. **目标格必须是可走格**（不能是墙/碰撞格）。发之前最好校验（见 § 五）。
4. **角色不会自己动**（自动巡游已停用）——世界的移动只有两个来源：用户操作、CLI 指令。**你发的每一条指令都会被所有页面看到，并且到达后自动存入 HAP（成为权威位置）**。谨慎指挥。
5. **你（CLI）不是"扮演者"**：不发 presence 心跳就不会触发互踢、不抢扮演权。你是"上帝视角指挥官"，页面上的玩家才是扮演者。若玩家正扮演该角色，你的指令同样生效（会被执行）。

---

## 三、角色 rowid 对照表（游戏内 ↔ HAP）

| 角色 | 游戏 rowid（发指令用） | HAP 成员 rowid（读写 HAP 用） |
|------|----------------------|------------------------------|
| 林东城 | `demo-dongcheng` | `2ab12bea-8db1-4b78-a955-3505d547fba7` |
| 小粽 | `demo-xiaozong` | `1024efc4-27fd-4522-bf3c-e4ebc998393c` |
| 小风 | `demo-xiaofeng` | `a8515e76-7b02-4baf-bedd-3ff011b1a9e5` |
| 阿说 | `demo-ashuo` | `ceaa79bf-f4d8-45ae-8e1e-a1c9a3ac1b7d` |
| 梦瑶 | `demo-mengyao` | `5b21306f-3be6-49fa-a6f6-2be311203c02` |
| 小云 | `demo-xiaoyun` | `22ff1c1c-f1d0-4275-980b-803835504a90` |

场景 rowid：**天孚宫** = `75fdbe30-0dcb-47c8-90d2-7efd6a76df8d`｜土局1层 = `3a52a722` 开头（rowid 见 assets/places.json）

---

## 四、查当前全员位置（HAP 权威数据）

```bash
node -e "
(async () => {
  const team = {
    '2ab12bea-8db1-4b78-a955-3505d547fba7': '东城/demo-dongcheng',
    '1024efc4-27fd-4522-bf3c-e4ebc998393c': '小粽/demo-xiaozong',
    'a8515e76-7b02-4baf-bedd-3ff011b1a9e5': '小风/demo-xiaofeng',
    'ceaa79bf-f4d8-45ae-8e1e-a1c9a3ac1b7d': '阿说/demo-ashuo',
    '5b21306f-3be6-49fa-a6f6-2be311203c02': '梦瑶/demo-mengyao',
    '22ff1c1c-f1d0-4275-980b-803835504a90': '小云/demo-xiaoyun',
  };
  for (const [rid, name] of Object.entries(team)) {
    const res = await fetch('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appKey: 'c156d7e78368cbc1',
        sign: 'NmM2NGE0ZTNlN2Y3NjU3ODY5MzMzOTk1NzBjMmMwMzNkNmE5NDU2MWZiYTg4ZWViNDk3MGE3MzU5MjcwNDU2MQ==',
        worksheetId: '69b0077358322d512e60bad0', rowId: rid, controls: ['didian', 'xszb']
      })
    });
    const j = await res.json();
    const d = (j.data && j.data.data) || j.data;
    let scene = '';
    try { const a = typeof d.didian === 'string' ? JSON.parse(d.didian) : d.didian; scene = (a && a[0] && a[0].sid || '').slice(0, 8); } catch (e) {}
    console.log(name, '| 场景:', scene || '(空)', '| 坐标:', d.xszb || '(空)');
  }
})();
"
```

---

## 五、进阶：移动前校验碰撞格（推荐）

场景碰撞数据在本地 `fsj-pixel-world/assets/scenes/tianfugong.json`：

```js
const sc = JSON.parse(require('fs').readFileSync('assets/scenes/tianfugong.json', 'utf8'));
const walkable = (x, y) => sc.layers.collision[y] && !sc.layers.collision[y][x];
walkable(30, 17);  // true = 可走，false = 墙
```

撞墙的指令会被前端拒绝（控制台打印 `blocked by wall`），不产生移动也不写 HAP。

---

## 六、语义速查

| 你想做什么 | 怎么做 |
|-----------|--------|
| 让角色走到某格 | `world.move`，body 带 `rowid/tx/ty/scene` |
| 查全员位置 | § 四的脚本（读 HAP） |
| 让角色集合到某格 | 逐个发 `world.move`（每条一个角色） |
| 让角色跨场景 | **做不到**——当前只支持同场景移动（跨场景是 M2） |
| 和其他 Agent 聊天 | 走 HAP 通道（hap-cli），不要占用 world.* |
| 广播世界公告 | `world.chat`，body 带 `{huiche, rowid, fasongzhe, neirong}`（慎用） |

## 七、已知边界（2026-09-03）

- **同场景移动**：BFS 寻路，撞墙/出界会被拒绝，角色原地不动
- **目标格被占**：允许重叠（多个角色可站同一格）
- **移动即存档**：`ws-bus` 来源的移动到达后自动写 HAP（didian + xszb），下次进世界就在那
- **扮演者优先**：若某角色正被玩家页面扮演（presence 心跳），你的指令仍生效，但该角色下个心跳（≤8 秒）会把位置校正回玩家实际位置——**指挥正在被扮演的角色前，先想清楚**
- **服务端容量**：纯广播架构，数百人内无压力（详见 `api/ws-server容量规划与演进路线.md`）

---

## 八、冒烟测试（接手后先跑这个）

```bash
node -e "const ws=new WebSocket('wss://100000whys.cn/ws');ws.onopen=()=>ws.send(JSON.stringify({type:'world.move',from:'cli-smoke',to:'',body:{rowid:'demo-xiaozong',tx:30,ty:17,scene:'75fdbe30-0dcb-47c8-90d2-7efd6a76df8d'},ts:Date.now()}));setTimeout(()=>process.exit(0),2000)"
```

观察任一像素视界页面：小粽应走到 (30,17)。控制台应有 `[applyMove] ✅ walkTo rowid=demo-xiaozong (30,17) src=ws-bus`。

---

*相关：[ws-bus.js](../js/services/ws-bus.js)（信封约定源码）｜[../../api/ws-server容量规划与演进路线.md](../../api/ws-server容量规划与演进路线.md)｜[跨cli聊天.md](../../../.claude/skills/fsj-skills-open/跨cli聊天.md)*
