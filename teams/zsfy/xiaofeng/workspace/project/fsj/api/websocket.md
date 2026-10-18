# Chat with Assistant

## You (2026-08-30T02:24:47.766Z)

我们要部署websocket需要什么条件

## Assistant (2026-08-30T02:24:48.402Z)

部署 WebSocket 主要需要以下条件：

## 1. 服务器端
- **支持 WebSocket 协议的运行时**：Node.js（`ws` / `socket.io`）、Python（`websockets` / `aiohttp`）、Go（`gorilla/websocket`）、Java（Spring WebSocket）等都可以。
- **可用端口**：默认 `80`（ws）或 `443`（wss）走 HTTP/HTTPS 升级。
- **框架/库**：实现 RFC 6455 协议，处理 HTTP Upgrade 握手。

## 2. 网络与代理
- **反向代理支持**：Nginx、Apache 等需要显式开启 Upgrade 和 Connection 头转发，例如 Nginx：
  ```nginx
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  ```
- **负载均衡**：需要 sticky session 或通过 Redis 等共享状态，否则多实例下连接会丢。
- **防火墙放行**：对应端口对外开放。

## 3. 安全
- **生产环境必须用 wss**（TLS）：避免明文传输，配合 HTTPS 证书（Let's Encrypt 即可）。
- **鉴权**：用 token（JWT / session）握手，避免任意客户端连入。
- **Origin / CSRF 校验**：服务端校验 `Origin` 头。
- **限流与心跳**：防止恶意占用，心跳保活探测断连。

## 4. 客户端
- 浏览器原生支持（所有现代浏览器），或 `WebSocket` 客户端库（`ws`、`Paho` 等）。
- 注意公司/网络代理可能拦截长连接，需要备选轮询或 SSE 兜底。

## 5. 规模化（视量级）
- **单机**：单进程可承载几万连接（C10k 问题），但要注意文件描述符和内存。
- **多机**：用 Redis Pub/Sub、消息队列（Kafka/RabbitMQ）或专门的 WS 网关统一分发。
- **云服务**：如果不想自建，可用 AWS API Gateway WebSocket、Azure Web PubSub、SSE/Cloudflare Durable Objects 等。

## 6. 监控与运维
- 连接数、消息 QPS、消息延迟、断连率。
- 日志、优雅停机（关闭前通知客户端重连）、自动重连机制（客户端指数退避）。

---

**最小落地清单**：一台 Linux 服务器 + 一个 WS 库 + 域名 + TLS 证书 + Nginx 反代 + 健康检查脚本，就能跑起来了。需要我针对你具体的语言栈（Node/Python/Go）或部署环境（Docker/K8s/云厂商）再细化方案吗？

## You (2026-08-30T02:27:10.998Z)

tls证书一定要嘛

## Assistant (2026-08-30T02:27:11.440Z)

**不一定**，但强烈建议。

**明文 ws:// 可以用的场景：**
- 本地开发 / 内网测试
- 服务之间内网通信（VPN、专线）
- 非敏感数据（公开行情、调试状态等）

**必须用 wss:// (TLS) 的情况：**
- 浏览器访问现代浏览器对 ws:// 限制越来越多（不安全上下文）
- 公网部署
- 涉及登录、token、个人信息
- 防止中间人篡改和监听

**实际建议：**
- 本地开发用 ws://，无所谓
- 生产/公网直接上 Let's Encrypt 免费证书，10 分钟搞定
- 如果嫌麻烦，用 Cloudflare 套一层，自动签发证书

总结：**自用测试** → 不用证书无所谓；**给别人用** → 必须上 TLS，否则各种报错+安全风险。

## You (2026-08-30T02:57:13.229Z)

你帮我配置一个websocket，并且部署一个服务，入参为input，并且告诉我前端要怎么接受这个服务的消息

## Assistant (2026-08-30T02:57:29.290Z)

我来帮你搭建一个 WebSocket 服务。需要先了解一些细节才能开工：在动手之前，我先确认几个关键信息，避免返工：

## 需要确认的细节

**1. 服务端语言/环境**

你这边用什么？方便的话给个方向：

| 选项 | 适合场景 |
|---|---|
| **Node.js** | 轻量、上手快，适合快速原型 |
| **Python** | 你已经在用 Python 生态 |
| **Go** | 高并发、部署简单（单二进制） |

**2. "入参 input" 是什么意思？**

确认一下你的需求（我目前理解的）：
- 客户端连上 WS 后，**发一个 JSON 消息**，比如 `{"input": "你好"}`
- 服务端收到后**回复处理结果**

是这样吗？还是：
- 路径参数 `/ws/{input}`？（不推荐，WS 一般不用路径传业务参数）
- 连接时通过 query string 传？

**3. 部署到哪里？**

- 当前服务器（`/www/wwwroot/workspace` 所在机器）？用 `nohup` / `systemd` / `pm2` / Docker？
- 还是云服务器？需要我远程连吗？

**4. 域名 / 端口**

- 有现成域名吗？有的话配 wss
- 只想测试 → 直接给个 IP+端口（比如 `ws://your-ip:8080`）也行
- 是否需要反代（Nginx）+ TLS？

---

## 我可以这样推进

你只需回复：**"用 Node.js + 部署到本机 + 无需 TLS"** 之类的最小化指令，我就会：

1. 写一个 Node.js WS 服务（端口 8080，监听 `input` 字段）
2. 用 `pm2` 或 `nohup` 部署到当前服务器，开机自启
3. 写一个 HTML + JS 前端 demo，直接在浏览器打开就能收发消息

或者你想自己完全指定参数也可以。**告诉我语言栈 + 部署目标**，我立刻开工。

## You (2026-08-30T02:57:38.739Z)

nodejs

## Assistant (2026-08-30T02:58:44.943Z)

好的，用 Node.js 部署到当前服务器。开工：Node v24 + pm2 都有，开搞。服务已启动（id 14，状态 online）。验证一下：健康检查通过，端口 8080 在监听。再用 Node 客户端模拟一次收发：服务验证通过——welcome + reply 都正常。

写一个前端 demo：设置 pm2 开机自启：搞定。

## ✅ 部署完成

**服务端**
- 路径：`/www/wwwroot/workspace/ws-server/server.js`
- 端口：`8080`（已通过 pm2 守护运行，进程名 `ws-server`）
- 地址：`ws://0.0.0.0:8080`
- 健康检查：`http://127.0.0.1:8080/health`

**测试结果**
```
已连接
收到: {"type":"welcome","clientId":1,"message":"已连接到 WebSocket 服务",...}
收到: {"type":"reply","clientId":1,"input":"你好世界","echo":"你好世界","length":4,...}
```

**常用命令**
```bash
pm2 logs ws-server      # 看日志
pm2 restart ws-server   # 重启
pm2 stop ws-server      # 停掉
pm2 list                # 看所有进程
```

---

## 📡 前端怎么接收消息

浏览器原生 `WebSocket` API，核心就两个事件：**`onmessage` 接收**、**`send` 发送**。

**最小代码（直接复制可用）：**

```javascript
// 1. 建立连接
const ws = new WebSocket('ws://127.0.0.1:8080');

// 2. ★ 接收消息（服务端推过来的全在这）
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('收到消息:', data);
  // data 结构（按服务端约定）:
  // { type: "welcome" | "reply" | "error", clientId, input, echo, timestamp, ... }
};

// 3. 发送消息（要按服务端要求的格式）
ws.onopen = () => {
  ws.send(JSON.stringify({ input: '你的内容' }));
};

// 4. 错误和断开处理
ws.onerror = (e) => console.error('出错', e);
ws.onclose = () => console.log('断开');
```

**三种使用方式（按你方便选）：**

| 方式 | 操作 |
|---|---|
| **① 直接打开 HTML demo** | 文件：`/www/wwwroot/workspace/ws-server/client-demo.html`，浏览器双击打开，填好地址点连接即可 |
| **② 嵌进自己的项目** | 复制上面最小代码即可 |
| **③ Node/小程序客户端** | 用 `npm i ws` 后 `new WebSocket('ws://...')`，API 完全一致 |

---

**📌 注意几个坑：**

1. **消息格式必须 JSON** —— 服务端按 `JSON.parse` 解析，非 JSON 会兜底当纯文本，但建议遵守约定
2. **跨域/同源** —— 原生 WebSocket **没有同源限制**（不像 fetch），但服务端可以校验 `Origin` 头
3. **生产用 `wss://`** —— 浏览器对 `ws://` 在 HTTPS 站点下会拦截，必须上 TLS
4. **重连机制** —— 网络抖动会断，建议前端加 `onclose` 里 setTimeout 重连
5. **如果浏览器报错 "Mixed Content"** —— 你的页面是 https 但连 ws://，改用 wss://

需要我帮你**加 Nginx 反代 + 域名 + TLS**，或者把业务逻辑（比如调用某个 LLM/数据库）替换进去吗？

## You (2026-08-30T03:00:41.251Z)

我们不是有100000whys.cn的域名嘛，你分配个路径？

## Assistant (2026-08-30T03:01:23.935Z)

我先看下这个域名在服务器上有没有对应的 Nginx 站点，避免乱配。有 `100000whys.cn` 主站（80+443）和 `api.100000whys.cn`。再确认下 TLS 证书路径和 WebSocket 升级的现有配置：宝塔面板 + 已有合法证书。我用宝塔友好的方式接入：把 WS 路由放进主站点的 `extension` 目录（不影响主配置）。

**路径规划：**

| 路径 | 类型 | 说明 |
|---|---|---|
| `wss://100000whys.cn/ws` | WebSocket | 走主域名 TLS，无需新申请证书 |
| `wss://api.100000whys.cn/ws` | 备用 | 如果你想用子域名（更清晰） |

**推荐用 `/ws`** —— 主域名已有 HTTPS，最省事。

配置：测试并重载 Nginx：语法 OK（那个 MIME 警告是宝塔主配置的历史遗留，不影响）。验证下端到端：端到端跑通 ✅

## 🎉 域名接入完成

| 项目 | 值 |
|---|---|
| **WSS 地址** | `wss://100000whys.cn/ws` |
| **HTTP 健康检查** | `https://100000whys.cn/ws-health` |
| **后端真实端口** | `127.0.0.1:8080`（只对内，外部访问全走 Nginx） |
| **证书** | 复用主域名已有证书，无需新申请 |

## 📡 前端对接（更新后的地址）

```javascript
// 唯一变化：地址从 ws://127.0.0.1:8080 改成 wss 域名
const ws = new WebSocket('wss://100000whys.cn/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({ input: 'hello' }));
};

ws.onmessage = (event) => {
  console.log('收到:', JSON.parse(event.data));
};
```

之前的 `client-demo.html` 里的地址框默认 `ws://127.0.0.1:8080`，改成 `wss://100000whys.cn/ws` 就能直接用了。

## 📝 维护清单

```bash
# 查看服务日志
pm2 logs ws-server

# 重启服务（如果改了 server.js）
pm2 restart ws-server

# 查看 Nginx 是否生效
curl https://100000whys.cn/ws-health

# Nginx 重载（改了 ws.conf 后）
nginx -t && nginx -s reload
```

## 🔐 安全建议（可选）

现在 WSS 已经通了，但目前**任何人都能连**。建议下一步加：

1. **连接时校验 token**：在 URL 里带 `?token=xxx`，服务端 `ws.on('connection')` 里校验
2. **限流来源**：根据 `$remote_addr` 限制单 IP 连接数
3. **Origin 校验**：服务端检查 `req.headers.origin`

要现在加 token 鉴权吗？或者你这边业务有别的鉴权方式（JWT / Cookie / API 签名），告诉我我帮你接进去。

## You (2026-08-30T03:06:26.408Z)

给我写一个前端调用的保姆级教程

## Assistant (2026-08-30T03:07:25.119Z)

用户要我写前端调用的保姆级教程。给一个完整的 step-by-step 指南。

下面是纯文档输出，不需要工具调用。# 🚀 前端调用 WebSocket 保姆级教程

> 目标：从零开始，让你的网页/小程序能连上 `wss://100000whys.cn/ws` 并收发消息。

---

## 一、5 分钟看懂 WebSocket 是啥

**对比传统 HTTP（你肯定熟）：**

```
HTTP：  客户端 → 请求 → 服务端 → 响应 → 客户端   （一问一答就断开）
WebSocket：客户端 ↔ 服务端                       （连上后双向随时收发）
```

**使用场景：**
- 聊天消息
- 实时通知 / 推送
- AI 流式回复（ChatGPT 那种一个字一个字蹦出来）
- 实时数据看板（股票、监控）
- 协同编辑

**我们的服务端约定：**
- 地址：`wss://100000whys.cn/ws`
- 连上会先收到一条 `welcome`
- 客户端发送：`{"input": "你的内容"}`
- 服务端回复：`{"type": "reply", "clientId": 1, "input": "...", "echo": "...", "timestamp": 123}`

---

## 二、HTML + 原生 JS（最简单，5 分钟上手）

新建 `test.html`，用浏览器打开就能跑：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>WS 测试</title>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 0 16px; }
    input { width: 70%; padding: 8px; font-size: 14px; }
    button { padding: 8px 16px; }
    #log { border: 1px solid #ddd; padding: 10px; height: 300px;
           overflow-y: auto; font-family: monospace; font-size: 12px;
           background: #fafafa; margin-top: 12px; }
    .in  { color: #1976d2; }
    .out { color: #388e3c; }
    .sys { color: #999; }
    .err { color: #d32f2f; }
  </style>
</head>
<body>
  <h2>WebSocket 测试</h2>

  <input id="msg" placeholder="输入内容回车发送" value="hello">
  <button id="send">发送</button>

  <div id="log"></div>

<script>
  // ★ 第 1 步：创建连接
  const ws = new WebSocket('wss://100000whys.cn/ws');

  const log = (text, cls = '') => {
    const div = document.createElement('div');
    div.className = cls;
    div.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    document.getElementById('log').appendChild(div);
    document.getElementById('log').scrollTop = 999999;
  };

  // ★ 第 2 步：连接成功
  ws.onopen = () => {
    log('✅ 已连接', 'sys');
  };

  // ★ 第 3 步：接收消息（核心！）
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    log('← 收到: ' + JSON.stringify(data), 'in');
  };

  // 第 4 步：出错了
  ws.onerror = (e) => {
    log('❌ 出错: ' + e.message, 'err');
  };

  // 第 5 步：断开了
  ws.onclose = () => {
    log('⚠️ 已断开', 'sys');
  };

  // ★ 第 6 步：发送消息（核心！）
  document.getElementById('send').onclick = sendMsg;
  document.getElementById('msg').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMsg();
  });

  function sendMsg() {
    if (ws.readyState !== WebSocket.OPEN) {
      log('❌ 还没连上', 'err');
      return;
    }
    const value = document.getElementById('msg').value;
    ws.send(JSON.stringify({ input: value }));
    log('→ 发送: ' + JSON.stringify({ input: value }), 'out');
    document.getElementById('msg').value = '';
  }
</script>
</body>
</html>
```

**双击这个 HTML 用浏览器打开，输入内容点发送，应该能看到：**

```
[11:30:01] ✅ 已连接
[11:30:01] ← 收到: {"type":"welcome","clientId":3,...}
[11:30:05] → 发送: {"input":"hello"}
[11:30:05] ← 收到: {"type":"reply","clientId":3,"input":"hello",...}
```

✅ 跑通了。

---

## 三、生产级写法（带重连、心跳、状态管理）

实际项目不能用上面那种"裸奔"的写法，网络抖动、服务端重启都会断。要做生产级别，**3 件套必须加**：

### 3.1 封装一个 WebSocket 客户端类

新建 `ws-client.js`：

```javascript
/**
 * 生产级 WebSocket 客户端
 * 功能：自动重连 / 心跳 / 事件回调 / 消息队列
 */
class WSClient {
  /**
   * @param {string} url - wss 地址
   * @param {object} options
   * @param {function} options.onMessage - 收到消息回调
   * @param {function} options.onStatusChange - 状态变化回调
   */
  constructor(url, options = {}) {
    this.url = url;
    this.onMessage = options.onMessage || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});

    this.ws = null;
    this.status = 'closed';          // closed | connecting | open
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;      // 重连间隔（指数退避）
    this.maxReconnectDelay = 30000;  // 最大 30 秒
    this.shouldReconnect = true;
    this.pendingMessages = [];       // 未连接时的消息排队
  }

  // ============ 连接 ============
  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN ||
                    this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setStatus('connecting');
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('[WS] 已连接');
      this.setStatus('open');
      this.reconnectDelay = 1000;    // 重置重连间隔

      // ★ 把排队的消息补发出去
      while (this.pendingMessages.length > 0) {
        const msg = this.pendingMessages.shift();
        this.ws.send(msg);
      }

      // ★ 启动心跳
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // 心跳响应：pong
        if (data.type === 'pong') return;

        // 业务消息交给上层处理
        this.onMessage(data);
      } catch (e) {
        console.error('[WS] 解析失败', event.data);
      }
    };

    this.ws.onerror = (e) => {
      console.error('[WS] 出错', e);
    };

    this.ws.onclose = () => {
      console.log('[WS] 已断开');
      this.stopHeartbeat();
      this.setStatus('closed');

      // ★ 自动重连（指数退避）
      if (this.shouldReconnect) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          this.connect();
        }, this.reconnectDelay);
        this.reconnectDelay = Math.min(
          this.reconnectDelay * 2,
          this.maxReconnectDelay
        );
      }
    };
  }

  // ============ 发送 ============
  send(data) {
    const msg = typeof data === 'string' ? data : JSON.stringify(data);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    } else {
      // ★ 没连上：消息排队，等连上后发
      console.warn('[WS] 未连接，消息已排队');
      this.pendingMessages.push(msg);
    }
  }

  // ============ 心跳 ============
  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);  // 25 秒一次（服务端 30 秒超时）
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ============ 关闭 ============
  close() {
    this.shouldReconnect = false;
    clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    if (this.ws) this.ws.close();
  }

  // ============ 状态 ============
  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.onStatusChange(status);
  }
}
```

### 3.2 在项目里用

```javascript
import { WSClient } from './ws-client.js';

// ★ 创建实例
const ws = new WSClient('wss://100000whys.cn/ws', {
  // 收到业务消息
  onMessage: (data) => {
    console.log('收到消息:', data);

    if (data.type === 'welcome') {
      console.log('欢迎，客户端 ID:', data.clientId);
    } else if (data.type === 'reply') {
      // ★ 在这里处理业务逻辑
      console.log('回复:', data.echo);
      document.getElementById('output').textContent = data.echo;
    } else if (data.type === 'error') {
      console.error('服务端报错:', data.message);
    }
  },

  // 状态变化（用于 UI 显示"连接中/已连接/已断开"）
  onStatusChange: (status) => {
    const el = document.getElementById('status');
    el.textContent = { connecting: '连接中…', open: '✅ 已连接', closed: '❌ 已断开' }[status];
    el.className = status;
  },
});

// ★ 启动连接
ws.connect();

// ★ 发消息
document.getElementById('send').onclick = () => {
  const input = document.getElementById('input').value;
  ws.send({ input });  // 自动 JSON.stringify
};

// ★ 离开页面时关闭（避免内存泄漏）
window.addEventListener('beforeunload', () => ws.close());
```

---

## 四、Vue 3 示例

```vue
<!-- ChatBox.vue -->
<template>
  <div class="chat">
    <div class="status" :class="status">{{ statusText }}</div>

    <div class="messages" ref="msgBox">
      <div v-for="(m, i) in messages" :key="i" :class="m.role">
        {{ m.text }}
      </div>
    </div>

    <div class="input-bar">
      <input v-model="input" @keydown.enter="send" placeholder="说点什么…">
      <button @click="send" :disabled="status !== 'open'">发送</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { WSClient } from './ws-client.js';

const status = ref('closed');
const messages = ref([]);
const input = ref('');
const msgBox = ref(null);

const statusText = computed(() => ({
  connecting: '连接中…',
  open: '✅ 已连接',
  closed: '❌ 已断开',
}[status.value]));

let ws = null;

onMounted(() => {
  ws = new WSClient('wss://100000whys.cn/ws', {
    onMessage: (data) => {
      if (data.type === 'welcome') {
        messages.value.push({ role: 'sys', text: data.message });
      } else if (data.type === 'reply') {
        messages.value.push({ role: 'bot', text: data.echo });
        scroll();
      }
    },
    onStatusChange: (s) => { status.value = s; },
  });
  ws.connect();
});

onBeforeUnmount(() => ws && ws.close());

function send() {
  if (!input.value.trim()) return;
  messages.value.push({ role: 'me', text: input.value });
  ws.send({ input: input.value });
  input.value = '';
  scroll();
}

function scroll() {
  nextTick(() => {
    if (msgBox.value) msgBox.value.scrollTop = msgBox.value.scrollHeight;
  });
}
</script>

<style scoped>
.chat { max-width: 600px; margin: 20px auto; }
.status { padding: 4px 8px; font-size: 12px; }
.status.open { color: green; }
.status.closed { color: red; }
.messages { height: 400px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; }
.messages .me { color: blue; text-align: right; }
.messages .bot { color: green; }
.messages .sys { color: #999; text-align: center; font-size: 12px; }
.input-bar { display: flex; gap: 8px; margin-top: 10px; }
.input-bar input { flex: 1; padding: 8px; }
</style>
```

---

## 五、React 示例

```jsx
// ChatBox.jsx
import { useEffect, useRef, useState } from 'react';
import { WSClient } from './ws-client';

export default function ChatBox() {
  const [status, setStatus] = useState('closed');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const wsRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const ws = new WSClient('wss://100000whys.cn/ws', {
      onMessage: (data) => {
        if (data.type === 'welcome') {
          setMessages(m => [...m, { role: 'sys', text: data.message }]);
        } else if (data.type === 'reply') {
          setMessages(m => [...m, { role: 'bot', text: data.echo }]);
        }
      },
      onStatusChange: setStatus,
    });
    ws.connect();
    wsRef.current = ws;
    return () => ws.close();
  }, []);

  useEffect(() => {
    if (boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [messages]);

  const send = () => {
    if (!input.trim()) return;
    setMessages(m => [...m, { role: 'me', text: input }]);
    wsRef.current?.send({ input });
    setInput('');
  };

  return (
    <div style={{ maxWidth: 600, margin: '20px auto' }}>
      <div style={{ color: status === 'open' ? 'green' : 'red' }}>
        {status === 'open' ? '✅ 已连接' : status === 'connecting' ? '连接中…' : '❌ 已断开'}
      </div>
      <div ref={boxRef} style={{ height: 400, overflowY: 'auto',
                                   border: '1px solid #ddd', padding: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ color: m.role === 'me' ? 'blue'
                                          : m.role === 'bot' ? 'green' : '#999',
                                textAlign: m.role === 'me' ? 'right' : 'left' }}>
            {m.text}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
               onKeyDown={e => e.key === 'Enter' && send()}
               style={{ flex: 1, padding: 8 }} />
        <button onClick={send} disabled={status !== 'open'}>发送</button>
      </div>
    </div>
  );
}
```

---

## 六、调试 & 排错指南

### 6.1 浏览器开发者工具

按 **F12 → Network → WS**，你能看到所有 WebSocket 帧：

```
📡 100000whys.cn/ws
   ├─ Messages 标签 → 看到每条收发消息（绿色是收，红色是发）
   └─ Frames 标签 → 原始字节
```

**这个工具是排查 WebSocket 的神器，必学。**

### 6.2 常见错误速查

| 现象 | 原因 | 解决 |
|---|---|---|
| `WebSocket connection to 'wss://...' failed` | 证书/网络/防火墙 | 检查域名能否 https 访问；服务端是否启动 |
| `Mixed Content` | 页面是 https，但连 ws:// | 改用 `wss://` |
| `wss://xxx.cn/ws 404` | Nginx 路由没配对 | 检查 `nginx -T \| grep "/ws"` |
| 连上一会儿就断 | 没心跳 / 服务端超时 | 启用 3.1 里的心跳 |
| 发消息没回复 | 消息格式不对 | 服务端要 `{"input":"..."}`，不是纯字符串 |
| 多人同时连但只收到自己的回复 | 服务端单点广播没做 | 这是正常的——当前服务是**点对点回显**，不是广播 |
| 浏览器控制台没报错但发不出去 | `readyState` 不是 OPEN | 等 `onopen` 触发后再发 |

### 6.3 看当前连接状态

```javascript
console.log(ws.readyState);
// 0 = CONNECTING  连接中
// 1 = OPEN        已连接
// 2 = CLOSING     关闭中
// 3 = CLOSED      已关闭
```

### 6.4 用 wscat 命令行测试（不写代码也能测）

```bash
npm i -g wscat
wscat -c wss://100000whys.cn/ws
# 连上后直接输入：
> {"input":"hello"}
# 回车就能看到回复
```

---

## 七、安全 & 鉴权（生产环境必做）

**目前 WSS 是开放的，任何人能连。** 生产环境必须加鉴权。3 种常见方案：

### 方案 A：URL 带 Token（最简单）

```javascript
// 前端
const token = localStorage.getItem('token');
const ws = new WebSocket(`wss://100000whys.cn/ws?token=${token}`);
```

服务端校验 `token` 合法性（要在 `ws-server/server.js` 里改，我没改是因为现在还没要求）。

### 方案 B：握手时第一帧发 Token（更安全）

```javascript
ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'auth', token: localStorage.getItem('token') }));
};
```

服务端收到第一帧校验，校验失败 `ws.close()`。

### 方案 C：用 Cookie（同域名最方便）

同域名下浏览器自动带 Cookie，服务端 `req.headers.cookie` 读取即可。

---

## 八、消息协议建议（如果以后业务复杂了）

简单 echo 够了，但要扩展建议约定好消息类型：

```typescript
// 客户端 → 服务端
type ClientMsg =
  | { type: 'chat'; input: string }
  | { type: 'ping' }
  | { type: 'auth'; token: string };

// 服务端 → 客户端
type ServerMsg =
  | { type: 'welcome'; clientId: number; timestamp: number }
  | { type: 'reply'; clientId: number; input: string; echo: string; timestamp: number }
  | { type: 'error'; message: string; timestamp: number }
  | { type: 'pong' };
```

扩展时只加 `type` 字段就行，老消息不会破。

---

## 九、复制即可用的 checklist

```
□ 1. 浏览器打开 HTML 测试连通性
□ 2. 拿到 F12 → Network → WS 看到帧
□ 3. 复制 ws-client.js 到项目
□ 4. 在业务里 new WSClient() + onMessage 回调
□ 5. 页面销毁前 close()
□ 6. 加鉴权（按你的业务选 A/B/C）
□ 7. 上线前压测一下（wscat 灌消息看服务端日志）
```

---

## 📚 一句话总结

```javascript
// 前端就这 3 步
const ws = new WebSocket('wss://100000whys.cn/ws');
ws.onmessage = (e) => console.log(JSON.parse(e.data));   // 收
ws.onopen    = () => ws.send(JSON.stringify({input: 'x'})); // 发
```

剩下的（重连、心跳、UI）都是工程化包装，核心 API 就这一行。

需要我帮你**接入鉴权**或者**把 echo 换成调用你的真实业务（比如 OpenAI/LLM/数据库）**吗？
