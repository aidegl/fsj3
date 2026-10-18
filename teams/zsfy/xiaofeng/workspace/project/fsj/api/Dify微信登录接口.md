# Dify 接口文档

> 创建时间：2026-06-09
> 版本：v2.0（已实测验证，含登录 + 通用明道云 API 代理）
> 架构：前端 → Dify Workflow API → 后端数据查询
> **变更说明**：微信登录 API 和通用明道云代理从 Coze Workflow 迁移至 Dify，均通过 API 实测验证

---

## 一、迁移背景

原微信登录通过 Coze Workflow（ID: `7638934243805003810`）实现，现改为 Dify Workflow 提供登录/用户匹配服务。

**核心变化：**

| 维度 | 旧方案 (Coze) | 新方案 (Dify) |
|------|--------------|--------------|
| 请求地址 | `https://api.coze.cn/v1/workflow/stream_run` | `https://dify.100000whys.cn/v1/workflows/run` |
| 响应模式 | SSE 流式（需解析 `data:` 行） | 同步阻塞（`blocking`，直接返回 JSON） |
| 认证方式 | `Bearer sat_...` | `Bearer app-jVwBLG5TYgdPk14IRSYaUDSD` |
| 入参方式 | `parameters` 对象 | `inputs` 对象 |
| 返回结构 | `output` 是 JSON 字符串需二次解析 | `outputs` 是对象，每个字段独立 `{output: 值}` |

---

## 二、接口详情

### 2.1 基础信息

| 字段 | 值 |
|------|------|
| 请求地址 | `https://dify.100000whys.cn/v1/workflows/run` |
| 请求方法 | `POST` |
| Content-Type | `application/json` |
| 响应模式 | `blocking`（同步等待结果） |

### 2.2 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `inputs.openid` | string | 是 | 微信用户 openid（传空会创建新用户） |
| `inputs.shangjia` | string | 是 | 商家 ID（UUID 格式，传空则不关联商家） |
| `response_mode` | string | 是 | 固定填 `blocking`（同步等待） |
| `user` | string | 是 | 任意用户标识，用于 Dify 日志追踪，通常传 openid |

### 2.3 请求体示例

```json
{
  "inputs": {
    "openid": "用户openid",
    "shangjia": "商家ID（UUID）"
  },
  "response_mode": "blocking",
  "user": "用户openid"
}
```

### 2.4 成功响应 (200) — 已实测 ✅

```json
{
  "task_id": "xxx-xxx-xxx",
  "workflow_run_id": "xxx-xxx-xxx",
  "data": {
    "id": "xxx-xxx-xxx",
    "workflow_id": "f5e88cd7-b9c9-4148-9c12-1c3314d7379d",
    "status": "partial-succeeded",
    "outputs": {
      "name": {"output": "新用户1380"},
      "rowid": {"output": "afdd9193-ebd7-46ca-9a98-969782076b7b"},
      "agent": null,
      "shuohua": null,
      "bushuohua": null,
      "jifen": null,
      "yue": null,
      "mrshdz": null,
      "touxiang": null
    },
    "error": null,
    "elapsed_time": 1.22,
    "total_tokens": 0,
    "total_steps": 8,
    "created_at": 1780979975,
    "finished_at": 1780979976
  }
}
```

> **关键**：`data.outputs` 是一个对象，每个字段的结构为 `{字段名: {"output": 实际值}}` 或 `null`。
> - `name.output` → 用户名称（如 "新用户1380"）
> - `rowid.output` → 用户记录的 rowid（UUID）
> - 其余字段（agent、shuohua、jifen、yue 等）当前返回 `null`

---

## 三、前端调用

### 3.1 直接调用（开发/测试阶段）

```javascript
/**
 * 调用 Dify 微信登录工作流
 * @param {string} openid - 当前用户 openid
 * @param {string} shangjia - 目标商家 ID
 * @returns {Object} 用户信息 {name, rowid}
 */
async function difyWechatLogin(openid, shangjia) {
  const res = await fetch('https://dify.100000whys.cn/v1/workflows/run', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer app-jVwBLG5TYgdPk14IRSYaUDSD',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      inputs: {
        openid: openid,
        shangjia: shangjia
      },
      response_mode: 'blocking',
      user: openid
    })
  });

  if (!res.ok) {
    throw new Error('Dify 请求失败: ' + res.status);
  }

  const data = await res.json();
  const outputs = data.data.outputs;

  return {
    name: outputs.name ? outputs.name.output : '',
    rowid: outputs.rowid ? outputs.rowid.output : '',
    agent: outputs.agent,
    shuohua: outputs.shuohua,
    bushuohua: outputs.bushuohua,
    jifen: outputs.jifen,
    yue: outputs.yue,
    mrshdz: outputs.mrshdz,
    touxiang: outputs.touxiang
  };
}

// 使用示例
const user = await difyWechatLogin('oXXXXXXXXXXXX', '商家rowid');
console.log(user.name);  // "新用户1380"
console.log(user.rowid); // "afdd9193-ebd7-46ca-9a98-969782076b7b"
```

### 3.2 后端代理调用（生产推荐 ⭐）

**⚠️ 安全警告：** API Key 硬编码在前端有泄露风险。生产环境必须通过 `100000whys.cn` 后端加一层代理，将 key 藏在服务端。

**建议代理路由：** `POST /api/merchant/login`

后端代理实现示例（Node.js / Express）：

```javascript
// server.js - 后端代理
const express = require('express');
const router = express.Router();

router.post('/api/merchant/login', async (req, res) => {
  const { openid, shangjia } = req.body;

  if (!openid) {
    return res.status(400).json({ error: '缺少 openid 参数' });
  }

  try {
    const difyRes = await fetch('https://dify.100000whys.cn/v1/workflows/run', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.DIFY_API_KEY,  // 环境变量，不暴露给前端
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: {
          openid: openid,
          shangjia: shangjia || ''
        },
        response_mode: 'blocking',
        user: openid
      })
    });

    if (!difyRes.ok) {
      return res.status(difyRes.status).json({ error: 'Dify 请求失败' });
    }

    const data = await difyRes.json();
    const outputs = data.data.outputs;

    res.json({
      success: true,
      data: {
        name: outputs.name ? outputs.name.output : '',
        rowid: outputs.rowid ? outputs.rowid.output : '',
        // 按需返回其他字段
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

前端调用后端代理：

```javascript
// 前端 - 调后端代理，不再携带 API Key
async function login(openid, shangjia) {
  const res = await fetch('/api/merchant/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ openid, shangjia })
  });

  const result = await res.json();
  if (result.success) {
    return result.data;  // {name, rowid}
  }
  throw new Error(result.error);
}
```

---

## 四、与旧 Coze 接口的对照

### 4.1 响应解析对比

**旧方案（Coze SSE）：**

```javascript
// 需要解析 SSE 流式响应
const text = await res.text();
const lines = text.split('\n');
for (const line of lines) {
  if (line.trim().startsWith('data: ')) {
    const parsed = JSON.parse(line.substring(6));
    // output 还是 JSON 字符串，需要二次解析
    const result = JSON.parse(JSON.parse(parsed.content).output);
  }
}
```

**新方案（Dify blocking）：**

```javascript
// 直接 JSON 响应，一次解析，字段通过 outputs.字段名.output 取值
const data = await res.json();
const name = data.data.outputs.name.output;
const rowid = data.data.outputs.rowid.output;
```

### 4.2 调用参数对比

| 字段 | Coze | Dify |
|------|------|------|
| 入参容器 | `parameters` | `inputs` |
| 响应模式 | 无（默认 SSE） | `response_mode: 'blocking'` |
| 日志标识 | 无 | `user` 字段 |
| workflow 标识 | `workflow_id` 在 body 中 | URL 中已包含，body 不需要 |
| 返回格式 | `output` 字段是 JSON 字符串 | `outputs` 对象，每项 `{output: 值}` |

---

## 五、登录完整流程

```
用户打开小程序
    ↓
  微信授权获取 openid
    ↓
  调用 Dify /workflows/run (openid + shangjia)
    ↓
  Dify 返回用户信息
    ├── outputs.name.output   → 用户名称
    └── outputs.rowid.output  → 用户 rowid
    ↓
  写入 localStorage
    ├── fsj_openid = openid
    ├── fsj_user_info = JSON.stringify({name, id: rowid, ...})
    └── fsj_shangjia_rowid = 商家rowid
    ↓
  业务页面从 localStorage 读取身份继续加载
```

---

## 六、输出字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `name.output` | string | 用户名称（如 "新用户1380"） |
| `rowid.output` | string | 用户记录 rowid（UUID） |
| `agent` | null | 暂未启用 |
| `shuohua` | null | 暂未启用 |
| `bushuohua` | null | 暂未启用 |
| `jifen` | null | 积分，暂未启用 |
| `yue` | null | 余额，暂未启用 |
| `mrshdz` | null | 默认收货地址，暂未启用 |
| `touxiang` | null | 头像，暂未启用 |

> 目前只有 `name` 和 `rowid` 有实际返回值，其余字段均为 `null`。

---

## 七、通用明道云 API 代理 — 已实测 ✅

替代旧的 Coze 通用工作流（ID: `7639306110034378761`），用于商品、订单、地址、评论等所有明道云 CRUD 操作。

### 7.1 基础信息

| 字段 | 值 |
|------|------|
| 请求地址 | `https://dify.100000whys.cn/v1/workflows/run` |
| 请求方法 | `POST` |
| Token | `app-wiFOFfbqggxDlfgsAYDV3gqT` |
| 响应模式 | `blocking` |

### 7.2 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `inputs.url` | string | 是 | 明道云 API 完整 URL |
| `inputs.input` | string | 是 | 请求体 JSON 字符串（**不含 appKey/sign**） |
| `response_mode` | string | 是 | 固定 `blocking` |
| `user` | string | 是 | 日志标识 |

### 7.3 成功响应

**查询类接口**（getFilterRows / getRowByIdPost）：

```json
{
  "data": {
    "status": "succeeded",
    "outputs": {
      "output": "{\"data\":{\"rows\":[...],\"total\":439},\"success\":true,\"error_code\":1}"
    }
  }
}
```

**新增类接口**（addRow）：

```json
{
  "data": {
    "status": "succeeded",
    "outputs": {
      "output": "{\"data\":\"新建记录rowid\",\"success\":true,\"error_code\":1}"
    }
  }
}
```

> `outputs.output` 是 **JSON 字符串**，需要 `JSON.parse` 后才能拿到明道云数据。这和旧 Coze 代理的 `output` 二次解析模式一致。
> **input 长度限制**：Dify 工作流已放宽限制，实测最长 534 字符（创建订单）的请求正常通过。

### 7.4 前端调用封装

```javascript
function callMingdaoAPI(url, body) {
  return fetch('https://dify.100000whys.cn/v1/workflows/run', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Authorization': 'Bearer app-wiFOFfbqggxDlfgsAYDV3gqT',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      inputs: {
        url: url,
        input: JSON.stringify(body)
      },
      response_mode: 'blocking',
      user: 'frontend_call'
    })
  })
  .then(function (res) {
    if (!res.ok) throw new Error('网络请求失败: ' + res.status);
    return res.json();
  })
  .then(function (data) {
    var outputStr = data.data.outputs.output;
    if (!outputStr) throw new Error('未获取到有效结果');
    return JSON.parse(outputStr);  // 二次解析，拿到明道云数据
  });
}
```

---

## 八、注意事项

1. **⚠️ API Key 安全**：生产环境必须通过后端代理转发，API Key 存放在服务端环境变量中，前端只传 openid 和 shangjia
2. **同步阻塞模式**：`response_mode: 'blocking'` 会等待整个工作流执行完成才返回，实测耗时约 1 秒
3. **outputs 结构**：`data.outputs` 是对象不是数组，每个字段的值在 `{字段名}.output` 里取，不是 `output[0]`！
4. **空 openid 行为**：传空 openid 时 Dify 工作流会自动创建 "新用户xxx" 名称的记录
5. **日志追踪**：`user` 字段用于 Dify 的日志记录，建议传 openid 方便追踪
6. **旧接口下线**：Coze 微信登录 Workflow（ID: `7638934243805003810`）和通用代理 Workflow（ID: `7639306110034378761`）已不再使用

---

## 九、商家配置获取（已实测 ✅）

替代旧的 Coze 商家配置工作流（ID: `7638635859176587283`）。

### 9.1 商家表信息

| 字段 | 值 |
|------|------|
| 商家 worksheetId | `69f549c69f1956fc0e171aa6` |
| API 接口 | `getRowByIdPost` |

### 9.2 明道云字段名 → 前端字段名映射

| 明道云字段 | 前端使用字段 | 说明 |
|-----------|------------|------|
| `dbdhl` | `shangjia` | 底部导航栏配置（JSON 字符串数组） |
| `wxappid` | `appid` | 微信 AppID |
| `wxsecret` | `appsecret` | 微信 AppSecret |
| `color` | `color` | 主题色（如 `#f06c00`） |
| `sjkb` | `sjkb` | 数据看板配置（JSON 字符串） |
| `wode` | `wode` | 我的页面自定义菜单（JSON 字符串） |
| `icons` | `icons` | 图标资源（JSON 字符串数组） |
| `mingcheng` | `mingcheng` | 商家名称 |

### 9.3 前端映射代码（`app.js`）

```javascript
var raw = mingdaoResult.data;
var config = {
  shangjia: raw.dbdhl || raw.shangjia,      // 底部导航栏
  appid: raw.wxappid || raw.appid,           // 微信appid
  appsecret: raw.wxsecret || raw.appsecret,  // 微信appsecret
  color: raw.color,
  sjkb: raw.sjkb,
  wode: raw.wode,
  icons: raw.icons,
  mingcheng: raw.mingcheng,
  sjbh: raw.sjbh
};
```

> ⚠️ `shangjia`（dbdhl）、`wode`、`sjkb`、`icons` 等字段返回的是 **JSON 字符串**，需要 `JSON.parse` 后使用。

---

*文档版本：v2.1*
*创建时间：2026-06-09*
*更新时间：2026-06-09（商家配置已实测验证）*
