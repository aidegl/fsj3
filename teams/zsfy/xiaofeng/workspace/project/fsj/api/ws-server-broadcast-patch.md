# ws-server 广播补丁（echo → echo + broadcast）

> 目标：让 `wss://100000whys.cn/ws` 支持 `world.*` 类型消息广播给所有连接，
> 其余消息仍走原 echo 逻辑（不破坏已有教程/客户端）。
> 验证过的事实：服务端当前只认 `input` 字段，其他字段丢弃，只回显给发送者自己。

## 服务器信息

| 项 | 值 |
|---|---|
| 文件 | `/www/wwwroot/workspace/ws-server/server.js` |
| 进程 | pm2 `ws-server`（端口 8080，Nginx 反代 `/ws`） |
| 重启 | `pm2 restart ws-server` |

## 改法（在 `ws.on('message', ...)` 处理函数**最前面**插入）

```js
// ===== broadcast 分支（新增）=====
// world.* 类型消息 → 原样转发给所有连接（含发送者，前端自行过滤回声）
// 其余消息 → 走原有 echo 逻辑，不受影响
let msg = {};
try { msg = JSON.parse(data.toString()); } catch (e) { /* 交给原有逻辑报错 */ }
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

注意：
- `wss` 是你 server.js 里 `WebSocket.Server` 的实例变量名，如果叫别的（如 `wsserver`）请对应替换
- `data` 是 message 回调的原始参数名，如叫 `raw`/`message` 请对应替换
- 信封格式与前端 [ws-bus.js](../fsj-pixel-world/js/services/ws-bus.js) 的约定完全一致：`{ type, from, to, body, ts }`

## 重启

```bash
pm2 restart ws-server
pm2 logs ws-server --lines 20   # 确认无报错
```

## 验证（两步）

**第 1 步：本机开两个终端，验证广播互通**

终端 1（收听方）：
```bash
node -e "const ws=new WebSocket('wss://100000whys.cn/ws');ws.onmessage=e=>console.log('<<',e.data);setTimeout(()=>process.exit(0),15000)"
```

终端 2（发送方，10 秒内执行）：
```bash
node -e "const ws=new WebSocket('wss://100000whys.cn/ws');ws.onopen=()=>ws.send(JSON.stringify({type:'world.move',from:'test-a',to:'',body:{rowid:'demo-xiaozong',tx:6,ty:18},ts:Date.now()}));setTimeout(()=>process.exit(0),3000)"
```

**预期**：终端 1 打印出 `<< {"type":"world.move",...}` —— 广播通了。

**第 2 步：游戏内验证**

1. 浏览器开 `http://localhost:8088/?page=world`（demo 需已启动：`npx http-server -p 8088 -c-1`）
2. 重复终端 2 的发送命令
3. **预期**：3 秒内小粽（demo-xiaozong）走到 (6,18)，控制台打印 `[applyMove] ✅ walkTo rowid=demo-xiaozong (6,18) src=ws-bus`

## 常见问题

| 现象 | 原因 |
|---|---|
| 重启后 echo 正常但 world.move 还是不广播 | 分支没插对位置（必须在 echo 判断**之前**） |
| `wss is not defined` | 变量名不对，看 server.js 里 Server 实例叫什么 |
| 前端收到但不走 | 前端过滤了 `to !== rowid` 的私信——确认 `to` 留空（广播） |

---
*撰写：林东城（主会话）｜2026-09-02｜基于实测 + ws-bus.js 信封约定*
