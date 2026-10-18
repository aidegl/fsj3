# web-deploy 部署服务使用文档

## 一句话

把改好的文件 POST 到这个接口，线上立即更新；部署失败或出问题可秒级回滚。

---

## 接口信息

| 项 | 值 |
|----|----|
| 地址 | `POST https://100000whys.cn/deploy/deploy` |
| 鉴权 | 请求头 `x-deploy-token: <TOKEN>`（token 向维护者索取） |
| 请求体 | `application/json`，UTF-8 |
| 单次上限 | 50MB |
| 回滚 | `POST https://100000whys.cn/deploy/rollback` |
| 版本列表 | `GET https://100000whys.cn/deploy/list`（同样需要 token） |
| 健康检查 | `GET https://100000whys.cn/deploy/health`（无需 token） |

---

## 可部署的项目（project 取值）

| project | 线上地址 | 说明 |
|---------|---------|------|
| `hezi` | https://100000whys.cn/hezi.html | 盒子页，部署后自动 pm2 reload |
| `index` | https://100000whys.cn/shuxiaohe-webview/ | shuxiaohe 主页，自动 reload |
| `shenhe` | https://100000whys.cn/shenhe/ | 审核页，自动 reload |
| `webview2` | https://100000whys.cn/fsj_webview2.0/ | 孚世界 WebView SPA 2.0，静态 |
| `playground` | https://100000whys.cn/playground/ | 测试专用，随便传，别放正式东西 |

> 只能传上表中的 project，其他值返回 400 并列出可用项目。
> 首次接入建议先在 `playground` 上试通流程。

---

## 请求体结构

```json
{
  "project": "hezi",
  "clean": false,
  "files": [
    { "path": "index.html", "content": "<html>…</html>" },
    { "path": "js/app.js", "content": "console.log(1)" },
    { "path": "img/logo.png", "content": "iVBORw0KGgo…", "encoding": "base64" }
  ]
}
```

### 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `project` | ✅ | 上表中的项目名 |
| `files` | ✅ | 文件数组，至少 1 个 |
| `files[].path` | ✅ | 相对路径，**不能**以 `/` 开头、不能含 `..`、不能动 `.git` |
| `files[].content` | ✅ | 文件内容字符串；二进制用 base64 |
| `files[].encoding` | — | 缺省 `utf8`；二进制传 `"base64"` |
| `clean` | — | `true` = 本次上传即完整项目（新目录只含这些文件）；缺省 `false` = 在当前版本基础上覆盖/新增这些文件 |

> ⚠️ 日常改几个文件就用默认 `clean:false`（增量），只有明确要"整体替换、删掉旧文件"时才用 `clean:true`。
> ⚠️ `.js` / `.html` / `.json` 不允许传空文件（会 400）。

---

## 响应

成功（HTTP 200）：

```json
{
  "ok": true,
  "project": "hezi",
  "release": "20260907061732-ppve",
  "files": 2,
  "prev": "20260907061720-42rd",
  "rollbackTo": "20260907061720-42rd",
  "live": "/opt/deploy/hezi",
  "pm2": { "ok": true, "detail": "fsj-hezi reloaded" },
  "hint": "回滚: POST /rollback {\"project\":\"hezi\"}"
}
```

失败（400/401/500）：

```json
{ "ok": false, "error": "unauthorized" }
```

| HTTP | 含义 |
|------|------|
| 400 | project 不在白名单 / files 缺失 / 路径越界 / 空文件 |
| 401 | token 错误或缺失 |
| 500 | 服务端写失败（此时自动清理半成品，线上不受影响） |

> **重要**：部署是原子切换 — 要么整体成功，要么线上保持原样，不存在传一半生效的情况。收到 `"ok": true` 才算部署成功。

---

## 完整调用示例

### curl

```bash
TOKEN='<你的token>'

# 1. 日常增量更新（改了 index.html 和一个 js）
curl -s -X POST https://100000whys.cn/deploy/deploy \
  -H "x-deploy-token: $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "project": "hezi",
    "files": [
      { "path": "index.html", "content": "<!DOCTYPE html><html>…</html>" },
      { "path": "js/app.js",  "content": "console.log(1)" }
    ]
  }'

# 2. 传二进制（图片）— content 用 base64
B64=$(base64 -w0 ./logo.png)
curl -s -X POST https://100000whys.cn/deploy/deploy \
  -H "x-deploy-token: $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"project\":\"hezi\",\"files\":[{\"path\":\"img/logo.png\",\"content\":\"$B64\",\"encoding\":\"base64\"}]}"

# 3. 查看线上当前版本和全部版本
curl -s https://100000whys.cn/deploy/list -H "x-deploy-token: $TOKEN"

# 4. 回滚到上一版
curl -s -X POST https://100000whys.cn/deploy/rollback \
  -H "x-deploy-token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"project":"hezi"}'

# 5. 回滚到指定版本（先用 list 查 release 名）
curl -s -X POST https://100000whys.cn/deploy/rollback \
  -H "x-deploy-token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"project":"hezi","to":"20260907-baseline"}'
```

### JavaScript（浏览器 / Node 通用）

```javascript
const TOKEN = '<你的token>';

async function deploy(project, files) {
  const res = await fetch('https://100000whys.cn/deploy/deploy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-deploy-token': TOKEN },
    body: JSON.stringify({ project, files })
  });
  const data = await res.json();
  if (!data.ok) throw new Error('部署失败: ' + data.error);
  console.log('部署成功', data.release, '回滚点:', data.rollbackTo);
  return data;
}

// 用法
deploy('shenhe', [
  { path: 'index.html', content: '<!DOCTYPE html>…' }
]);

// 二进制文件（浏览器）
async function deployFile(project, filePath, blob) {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())));
  return deploy(project, [{ path: filePath, content: b64, encoding: 'base64' }]);
}
```

### Python

```python
import requests

TOKEN = '<你的token>'

def deploy(project, files):
    r = requests.post('https://100000whys.cn/deploy/deploy',
        headers={'x-deploy-token': TOKEN},
        json={'project': project, 'files': files}, timeout=60)
    data = r.json()
    if not data.get('ok'):
        raise RuntimeError(f"部署失败: {data.get('error')}")
    return data

deploy('webview2', [{'path': 'css/main.css', 'content': open('main.css', encoding='utf-8').read()}])
```

---

## 推荐工作流（前端 agent 照此执行）

1. **改代码** → 本地确认改动的文件清单
2. **先打 playground**（首次接入或拿不准时）：往 `playground` 部署一版，浏览器打开 `https://100000whys.cn/playground/` 目检
3. **部署正式项目**：把改动文件按 `files` 数组发出去（增量，别乱用 `clean:true`）
4. **验证**：curl 对应线上 URL，确认新内容生效 + 页面功能正常
5. **出问题** → 立即 `rollback`（秒级生效），排查后重新部署

> 部署后如果 `pm2` 字段是 `{"ok":false,…}`，说明进程 reload 失败，请立刻回滚并报告维护者。

---

## 版本与回滚机制（为什么安全）

- 每次部署生成全新版本目录（如 `20260907061732-ppve`），与线上运行中的旧版本物理隔离 — **不存在新旧文件混合污染**
- 部署 = 原子软链切换，毫秒级，请求中途失败线上也是完好的旧版本
- 每个项目保留最近 **10** 个版本，更早的自动清理
- 回滚也是软链切换，秒级生效

---

## 常见错误排查

| 现象 | 原因 / 处理 |
|------|------------|
| 401 unauthorized | token 错。确认 header 是 `x-deploy-token`，值前后无空格/换行 |
| 400 unknown project | project 名拼写错误，看响应里的 `known` 列表 |
| 400 bad path | path 以 `/` 开头或含 `..`，改成相对路径 |
| 400 empty file not allowed | 传了空的 js/html/json，检查内容 |
| 413 / body too large | 超 50MB，拆分或压缩资源 |
| 部署 ok 但页面没变 | 浏览器缓存，强刷（Ctrl+Shift+R）；webview2 的 index.html 有禁缓存头，其余静态资源可能需要带版本参数 |
| 部署 ok 但功能异常 | 先回滚，再对照 diff 排查 |

---

## 安全约定

- token 请勿写入任何公开仓库 / 提交记录 / 客户端代码，放配置或环境变量
- 部署记录全量留档（服务器侧 `logs/deploy.log`）
- token 可随时轮换（旧 token 立即失效），维护者操作
- 不要把 `playground` 用于任何正式用途
