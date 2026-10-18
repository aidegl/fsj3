# 给宝塔服务器 Agent 的任务：ws-server 加 broadcast 分支

> 委托人：林东城（fsj 项目主会话 Claude，d:\Item\fsj）
> 执行人：宝塔服务器上的 Agent（就是 8-30 帮忙部署 ws-server 的那位）
> 日期：2026-09-02
> 优先级：高（孚世界像素游戏的实时移动/聊天都卡在这一步）

---

## 一、来龙去脉（3 分钟读完）

1. **8-30**，你帮忙部署了 `ws-server`（`/www/wwwroot/workspace/ws-server/server.js`，pm2 守护，Nginx 反代 `wss://100000whys.cn/ws`）。当时做的是 **echo 服务**：客户端发 `{input: "..."}`，服务端回 `{type:"reply", echo:...}`，**只回给发送者自己**。这一点当时的保姆级教程里也写了："当前服务是点对点回显，不是广播"。

2. **9-01**，fsj-pixel-world（像素视界游戏）的前端写好了基于 WS 的广播能力（`js/services/ws-bus.js`）：
   - 信封格式：`{ type, from, to, body, ts }`
   - `type: "world.move"` → 让某个角色走到指定格子
   - `type: "world.chat"` → 聊天消息广播
   - 前端假设后端是"**纯广播管道**：收到 JSON 原样转发给所有连接"——但服务端实际是 echo，**两端从没对齐过**。

3. **今天（9-02）实测确认**：从本地 Node 客户端发 `world.move`，服务端返回 `{"type":"error","message":"缺少 input 字段"}`——服务端只认 `input` 字段，其他字段全部丢弃，永远不会到达其他客户端。**游戏前端的广播代码全部就绪，就差服务端这一个分支。**

## 二、任务

给 `ws-server` 加一个 **broadcast 分支**：

- 消息 `type` 以 `world.` 开头（如 `world.move` / `world.chat`）→ **原样转发给所有连接**（含发送者，前端会自己过滤回声）
- 其余消息 → **保持原有 echo 逻辑不动**（别破坏已有教程和 client-demo.html）

## 三、操作步骤

1. **先读** `/www/wwwroot/workspace/ws-server/server.js`，找到处理客户端消息的 `ws.on('message', ...)`（或等价位置），确认：
   - JSON 解析在哪个变量（下文假设叫 `msg`）
   - `WebSocket.Server` 实例叫什么（下文假设叫 `wss`；如果是别的名字，替换）
2. 在消息处理逻辑**最前面**（echo 判断之前）插入：

```js
// ===== broadcast 分支（2026-09-02 新增）=====
// world.* 类型消息 → 信封标准化后转发给所有连接（含发送者，前端自行过滤回声）
// 其余消息 → 继续走原有 echo 逻辑，不受影响
if (msg && typeof msg.type === 'string' && msg.type.startsWith('world.')) {
  const envelope = JSON.stringify({
    type: msg.type,
    from: msg.from || 'unknown',
    to: msg.to || '',
    body: msg.body || {},
    ts: msg.ts || Date.now()
  });
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(envelope);
    }
  });
  return; // 不走 echo
}
// ===== broadcast 分支结束 =====
```

   ⚠️ 变量名对齐：`msg` / `wss` 若与实际代码不符，按实际改；`data` 参数名同理。
   ⚠️ 如果 server.js 是先判断 `!msg.input` 再报错的结构，**broadcast 分支必须放在那个判断之前**（因为 world.* 消息没有 input 字段，会被误拦）。

3. 重启并确认无报错：

```bash
pm2 restart ws-server
pm2 logs ws-server --lines 20
```

## 四、验收标准（做完必须自测）

**双连接广播互通测试**：

终端 1（监听方，先开）：
```bash
node -e "const ws=new WebSocket('wss://100000whys.cn/ws');ws.onmessage=e=>console.log('<<',e.data);setTimeout(()=>process.exit(0),15000)"
```

终端 2（发送方，10 秒内执行）：
```bash
node -e "const ws=new WebSocket('wss://100000whys.cn/ws');ws.onopen=()=>ws.send(JSON.stringify({type:'world.move',from:'test-a',to:'',body:{rowid:'demo-xiaozong',tx:6,ty:18},ts:Date.now()}));setTimeout(()=>process.exit(0),3000)"
```

✅ **通过标准**：终端 1 在 15 秒内打印出 `<< {"type":"world.move","from":"test-a",...}`。
✅ **回归标准**：老用法不受影响——发 `{"input":"hi"}` 仍收到 `{"type":"reply","echo":"hi",...}`。

## 五、完成后请汇报

1. server.js 改动的前后 diff（或贴出插入位置的上下文 10 行）
2. 验收两项测试的实际输出
3. `pm2 ls` 里 ws-server 的状态

## 六、背景资料（想深入了解再看）

- 前端信封约定：`fsj-pixel-world/js/services/ws-bus.js`（本地路径，仅供参考）
- 游戏侧监听：`world.move` → `applyMove(body)`；`world.chat` → `onRemoteChat(body)`
- 部署历史对话存档：`fsj/api/websocket.md`（本地）

---

*此文档由林东城主会话生成，用户负责传达到服务器。改完验收通过后，孚世界的"CLI 发 WS → 前端角色实时移动"链路即通。*
