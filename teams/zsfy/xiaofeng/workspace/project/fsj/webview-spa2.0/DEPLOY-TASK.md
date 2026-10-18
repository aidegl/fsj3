# 给宝塔服务器 Agent 的任务：发布 webview-spa2.0（H5 前端静态站）

> 委托人：林东城（fsj2 项目，本地 Windows）
> 执行人：宝塔服务器上的 Agent
> 日期：2026-09-23
> 优先级：中
> 参考先例：`给宝塔agent的hap-proxy部署任务.md`（同服务器同模式，hap-proxy 已按此部署成功）

---

## 一、来龙去脉（2 分钟）

1. `webview-spa2.0`（H5 前端：商家端+智能体端，纯静态零构建）此前只在本地跑（VSCode Live Preview / 127.0.0.1:3000），手机访问不了。
2. 目标：发布为宝塔服务器上的静态站点，走 Nginx 域名访问 `https://100000whys.cn/wv/`。
3. **API 零改动**：前端写死的 API 基址是 `https://100000whys.cn/mingdao`（同域名），该反代已实测可用（真实调用拉到数据）——前端不需要任何跨域/代理改动。

## 二、材料

随任务单一同提供：`webview-spa2.0-deploy.tar.gz`（6.4MB，660 文件——index.html + js/ + css/ + assets/，已排除开发文件 dev-server.js / login-test.html / js/__test-yynr.mjs / doc/）

## 三、操作步骤

1. **放文件**：
```bash
mkdir -p /www/wwwroot/workspace/webview-spa2.0
tar -xzf webview-spa2.0-deploy.tar.gz -C /www/wwwroot/workspace/webview-spa2.0/
chown -R www:www /www/wwwroot/workspace/webview-spa2.0
```

2. **Nginx 静态站点**（挂到已有域名子路径）：
```nginx
location /wv/ {
    alias /www/wwwroot/workspace/webview-spa2.0/;
    index index.html;
}
```
   改完 `nginx -t && nginx -s reload`。

3. **安全确认**：
   - 纯静态站，无进程、无端口、无数据库
   - 宝塔防火墙：不需要新增规则（走 Nginx 443）

## 四、验收标准（做完必须自测）

```bash
# 1. 静态页可达
curl -s -o /dev/null -w "%{http_code}" "https://100000whys.cn/wv/index.html"
# 预期：200

# 2. 关键资源可达（抽 js 和 assets 各一）
curl -s -o /dev/null -w "%{http_code}" "https://100000whys.cn/wv/js/app.js"
curl -s -o /dev/null -w "%{http_code}" "https://100000whys.cn/wv/assets/logo.png"
# 预期：200

# 3. API 反代回归（前端会调用）
curl -s -X POST "https://100000whys.cn/mingdao" -H "Content-Type: application/json" \
  -d '{"url":"https://api.mingdao.com/v2/open/worksheet/getRowByIdPost","input":{"worksheetId":"6a03ceaa7e29abcb297cbdfc","rowId":"976d860f-8adb-4c00-9745-9aa9b8958530","getSystemControl":"false"}}'
# 预期：返回记录 JSON（含 mingcheng=内容权重规则）——此反代已有，回归确认未被站点改动破坏
```

浏览器实测：打开 `https://100000whys.cn/wv/index.html?shangjia=f009cda3-cc49-400d-82cd-cbe79ee8892f` → 四 Tab（首页/智能体/消息/我的）渲染正常、商家配置加载成功。

## 五、完成后请汇报

1. 解压后文件数（预期 ~660）
2. 三项 curl 验收实际输出
3. Nginx 配置片段（/wv/ 那段）
4. 浏览器实测截图或文字确认

## 六、说明

- 本站为纯静态，无 pm2 进程、无端口、无数据库依赖——后续更新只需覆盖 `/www/wwwroot/workspace/webview-spa2.0/` 下的静态文件
- 前端 API 基址 `https://100000whys.cn/mingdao` 为同域名——**请勿**对该路径加额外限制（已有反代，前端依赖）
- guolv.json（完全引用合规规则）由前端 fetch 同目录加载——已包含在包内，请勿移动

---

*任务文档：无名（fsj2 侧）· 2026-09-23 · 参考 hap-proxy 部署任务格式*
