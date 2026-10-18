# 给宝塔服务器 Agent 的任务：部署 hap-proxy（HAP CRUD 代理常驻）

> 委托人：林东城（fsj 项目主会话，本地 Windows）
> 执行人：宝塔服务器上的 Agent
> 日期：2026-09-03
> 优先级：中（本地 proxy 进程随会话死亡，需要常驻化）

---

## 一、来龙去脉（2 分钟）

1. `objectives-management-system`（目标管理前端，跑在开发者本地 `127.0.0.1:3000`）的所有 HAP 数据请求，走一个本地 Node 代理 `proxy.js`（端口 3014）：浏览器 → 3014 → `api.mingdao.com`（v2 open API，appKey+sign）。本地起进程是为了绕浏览器 CORS + 藏凭证。
2. 问题：它一直是**前台临时进程**，会话结束/电脑重启就死，前端频繁 `ERR_CONNECTION_REFUSED`。
3. 目标：把它**常驻到你的服务器**（pm2 守护 + Nginx 域名反代），前端改走 `https://100000whys.cn/obj/*`，从此不依赖任何人的本地电脑。

参考先例：8-30 部署的 `ws-server`（同款模式：pm2 + Nginx extension 反代），本次完全同构，更简单（纯 HTTP，无 WebSocket Upgrade）。

## 二、任务

部署 `proxy.js` 为常驻服务 `hap-proxy`，并通过 Nginx 挂到 `https://100000whys.cn/obj/`。

**文件**：随本任务单一同提供的 `proxy.js`（约 500 行，**零 npm 依赖**——只用 Node 内置模块，无需 npm install）。放置到：`/www/wwwroot/workspace/hap-proxy/proxy.js`

**注意**：该文件已改为 `server.listen(PORT, '127.0.0.1', ...)`——只监听本机回环，外网**不能**直连 3014，必须走 Nginx。请勿改回。

## 三、操作步骤

1. **放文件**：把 `proxy.js` 放到 `/www/wwwroot/workspace/hap-proxy/proxy.js`

2. **pm2 启动**：
```bash
cd /www/wwwroot/workspace/hap-proxy
pm2 start proxy.js --name hap-proxy
pm2 save
pm2 logs hap-proxy --lines 10   # 确认打印 "listening on http://127.0.0.1:3014"
```

3. **Nginx 反代**（同 /ws 的宝塔 extension 方式）：`https://100000whys.cn/obj/*` → `http://127.0.0.1:3014/*`
```nginx
location /obj/ {
    proxy_pass http://127.0.0.1:3014/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 120s;   # /api/all-targets 拉全表约 17s，放宽超时
}
```
   注意 `proxy_pass` 末尾的 `/`（去掉 /obj 前缀转发）。改完 `nginx -t && nginx -s reload`。

4. **安全确认**：
   - `ss -tlnp | grep 3014` 应显示 `127.0.0.1:3014`（不是 0.0.0.0）
   - 宝塔防火墙/安全组：**不需要**为 3014 放行任何外网规则（走 Nginx 即可）

## 四、验收标准（做完必须自测）

```bash
# 1. 本机直连
curl -s "http://127.0.0.1:3014/api/all-targets" | head -c 200
# 预期：{"total":4746,...}（约 4746 条，17 秒左右返回，v2 拉全表属正常）

# 2. 域名反代
curl -s "https://100000whys.cn/obj/api/all-targets" | head -c 200
# 预期：同上

# 3. 写通路
curl -s -X POST "https://100000whys.cn/obj/api/record-update" -H "Content-Type: application/json" -d '{}'
# 预期：{"error":"rowId required"}（400 类业务报错 = 路由通了，不是 502/404）

# 4. pm2 状态
pm2 ls | grep hap-proxy   # online
```

## 五、完成后请汇报

1. `pm2 ls` 中 hap-proxy 状态
2. 四项验收的实际输出
3. Nginx 配置片段（/obj 那段）

## 六、说明

- 本次**不做**通用化改造（端点保持 shangpin 专用），原样上线上即可
- 前端（本地 objectives-management-system 的 api.js base URL）由委托人本地自行修改，与你无关
- 服务名 `hap-proxy`，未来若做通用 HAP 网关直接演进这个进程

---

*此文档由林东城主会话生成。部署完成验收通过后，本地前端将不再依赖任何人的电脑开机。*
