
> [文档状态] 废弃 · 2026-09-06 · Dify 版已归档（东城 2026-09-06 裁决：Node 版为权威）。权威版本：`api/通用API接口文档-Node版.md`。Dify 调用方式整体退役（曾因 workflow_node_executions 日志 3.5GB 打爆库）。
# 孚世界 - Dify 通用 API 接口文档

> ⚠️ **已废弃（2026-09-04）：通用 CRUD 请改用 Node 代理版** → [通用API接口文档-Node版-1.md](./通用API接口文档-Node版-1.md)（`https://100000whys.cn/mingdao`）。原因：Dify 每次调用写 PostgreSQL 日志，曾把数据库打爆（workflow_node_executions 单表 3.5GB）。
> Node 版已**自包含**（增删改查参数、filterType/DataType 枚举表、特殊字段处理、工作表清单全部合并过去），本文档仅作历史参考，**无需再从本文档查任何定义**。
> 微信登录工作流（app-jVwBLG5T）仍在用 Dify，参考 `Dify微信登录接口.md`。

> 创建时间：2026-05-13
> 版本：v3.0（Dify 版）
> 架构：前端 → Dify Workflow API → 明道云 HAP（密钥不暴露）
> **变更说明**：从 Coze Workflow 迁移至 Dify Workflow，实测验证增删改查全链路通过（2026-07-11）

---

## 一、架构概述

前端直接调用明道云 HAP 会暴露 `appKey` 和 `sign`，因此通过 **Dify Workflow** 作为中间代理层：

```
前端（Webview / 小程序）
    ↓ 调用 Dify Workflow API（仅传 URL + 入参，不含密钥）
Dify Workflow（内部持有 appKey / sign，自动注入）
    ↓ 调用明道云 HAP API
明道云 HAP（数据存储，所有项目共享）
```

### 1.1 数据集中原则

所有项目的商品、订单、用户等核心数据统一存放在服世界的同一套明道云工作表中，通过 `shangjia_id` 区分归属，不形成数据孤岛。

### 1.2 迁移对照

| 维度 | 旧方案 (Coze) | 新方案 (Dify) |
|------|--------------|--------------|
| 请求地址 | `https://api.coze.cn/v1/workflow/stream_run` | `https://dify.100000whys.cn/v1/workflows/run` |
| 响应模式 | SSE 流式（需解析 `data:` 行） | 同步阻塞（`blocking`，直接返回 JSON） |
| 认证方式 | `Bearer sat_...` | `Bearer app-wiFOFfbqggxDlfgsAYDV3gqT` |
| 入参方式 | `parameters` 对象 | `inputs` 对象 |
| 返回结构 | `output` 是 JSON 字符串需二次解析 | `outputs.output` 是 JSON 字符串需一次解析 |
| 工作流标识 | body 中传 `workflow_id` | URL 已包含，body 不需要 |
| 日志标识 | 无 | `user` 字段 |

> ⚠️ **Coze 额度易耗尽**（报错 `error_code 4028: Insufficient coze credits balance`），所有新代码必须走 Dify。

---

## 二、Dify 代理工作流（通用 CRUD）

### 2.1 基础信息

| 字段 | 值 |
|------|------|
| 请求地址 | `https://dify.100000whys.cn/v1/workflows/run` |
| 请求方法 | `POST` |
| Token | `app-wiFOFfbqggxDlfgsAYDV3gqT` |
| 响应模式 | `blocking`（同步等待结果） |

### 2.2 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `inputs.url` | string | 是 | 明道云 API 完整 URL（见下方增删改查） |
| `inputs.input` | string | 是 | 请求体 JSON 字符串（**不含 appKey/sign**） |
| `response_mode` | string | 是 | 固定填 `blocking` |
| `user` | string | 是 | 日志标识，建议传 `fabuzhe` 或 `frontend_call` |

### 2.3 请求头

```
Authorization: Bearer app-wiFOFfbqggxDlfgsAYDV3gqT
Content-Type: application/json
```

### 2.4 请求体示例

```json
{
  "inputs": {
    "url": "https://api.mingdao.com/v2/open/worksheet/getFilterRows",
    "input": "{\"worksheetId\":\"shangpin\",\"pageSize\":20,\"pageIndex\":1,\"listType\":0,\"controls\":[\"rowid\",\"mingcheng\"],\"filters\":[]}"
  },
  "response_mode": "blocking",
  "user": "frontend_call"
}
```

> ⚠️ `inputs.input` 的值必须是 **JSON 字符串**（不是对象），需要 `JSON.stringify(body)` 序列化。

### 2.5 响应格式

同步 JSON 响应，`outputs.output` 是明道云返回的 JSON 字符串，需要 `JSON.parse` 一次：

**查询类接口**（getFilterRows / getRowByIdPost）：

```json
{
  "task_id": "xxx",
  "workflow_run_id": "xxx",
  "data": {
    "id": "xxx",
    "status": "succeeded",
    "outputs": {
      "output": "{\"data\":{\"rows\":[...],\"total\":100},\"success\":true,\"error_code\":1}"
    },
    "elapsed_time": 0.85,
    "total_steps": 7
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

### 2.6 前端调用封装

```javascript
/**
 * 调用 Dify 通用代理工作流（替代旧 Coze 版本）
 * @param {string} url - 明道云 API 地址
 * @param {Object} body - 请求体（不含 appKey/sign）
 * @returns {Object} 明道云返回数据
 */
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
    var outputStr = data.data && data.data.outputs && data.data.outputs.output;
    if (!outputStr) throw new Error('未获取到有效结果');
    return JSON.parse(outputStr);  // 一次解析，拿到明道云数据
  });
}
```

> 对比旧 Coze 版本：不需要解析 SSE 流、不需要二次 `JSON.parse`，只需一次解析 `outputs.output`。

---

## 三、增删改查接口

### 3.1 查 - 条件筛选（getFilterRows）

**用途：** 根据筛选条件批量查询记录

| 字段 | 值 |
|------|------|
| API URL | `https://api.mingdao.com/v2/open/worksheet/getFilterRows` |
| 方法 | `POST` |

**请求参数：**

```json
{
  "worksheetId": "工作表ID（推荐用别名 shangpin）",
  "viewId": "",
  "pageSize": 20,
  "pageIndex": 1,
  "keyWords": "",
  "listType": 0,
  "controls": [],
  "filters": [
    {
      "controlId": "字段ID",
      "dataType": 1,
      "spliceType": 1,
      "filterType": 1,
      "value": "筛选值"
    }
  ],
  "sortId": "",
  "isAsc": "false",
  "notGetTotal": "false",
  "useControlId": "false",
  "getSystemControl": "false"
}
```

**filters 字段说明：**

每个 filter 对象包含以下属性：

| 属性 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `controlId` | 是 | string | 字段别名（如 `shangjia`、`mingcheng`） |
| `dataType` | 是 | number | 控件类型编号，见附录 DataTypeEnum |
| `spliceType` | 是 | number | 拼接方式：`1`=And，`2`=Or |
| `filterType` | 是 | number | 筛选类型，见附录 FilterTypeEnum |
| `value` | 否 | string | 单个筛选值 |
| `values` | 否 | list[string] | 多个筛选值（如 `["值1","值2"]`） |
| `dateRange` | 否 | number | 日期范围，见附录 DateRangeEnum |

**筛选值写法：**
- 单个值 → 用 `value`（字符串），如 `"value": "65428a74-..."`
- 多个值 → 用 `values`（数组），如 `"values": ["值1","值2","值3"]`

**filterType 常用对照表：**

| filterType | 含义 | value 格式 | 示例场景 |
|------------|------|-----------|---------|
| 1 | 等于 | 单值 | 文本字段精确匹配 |
| 2 | 不等于 | 单值 | 排除某值 |
| 3 | 包含 | 单值 | 模糊搜索关键词 |
| 4 | 开头为 | 单值 | 前缀匹配 |
| 5 | 不包含 | 单值 | 排除关键词 |
| 6 | 不是 | 单值 | 不等于（同2） |
| 7 | 为空 | 无需 value | 检查空值 |
| 8 | 不为空 | 无需 value | 检查有值 |
| 11 | 在范围内 | `values` 数组 | 数值区间 |
| 13 | 大于 | 单值 | 数值 > N |
| 14 | 大于等于 | 单值 | 数值 >= N |
| 15 | 小于 | 单值 | 数值 < N |
| 16 | 小于等于 | 单值 | 数值 <= N |
| 24 | **关联控件是** | 单值（rowid） | **他表关联字段筛选 ⭐** |
| 25 | 关联控件不是 | 单值 | 排除关联记录 |
| 26 | 数组等于 | `values` 数组 | 多选字段完全匹配 |
| 27 | 数组不等于 | `values` 数组 | 多选字段不匹配 |

**他表关联字段筛选示例（⭐ 最常用）：**

```json
{
  "controlId": "shangjia",
  "dataType": 29,
  "spliceType": 1,
  "filterType": 24,
  "value": "65428a74-2f5e-46a8-a111-e1a59297b22e"
}
```

> ⚠️ 关联字段的 dataType 是 `29`（关联记录），不是 `6`（数值）或 `1`（文本）。value 传的是关联记录的 rowid 字符串（不是数组）。

**调用示例：**

```javascript
// 查询某个商家的商品
callMingdaoAPI('https://api.mingdao.com/v2/open/worksheet/getFilterRows', {
  worksheetId: 'shangpin',
  pageSize: 20,
  pageIndex: 1,
  listType: 0,
  controls: ['rowid', 'mingcheng', 'shoujia', 'zhutu'],
  filters: [
    {
      controlId: 'shangjia',
      dataType: 29,
      spliceType: 1,
      filterType: 24,
      value: '65428a74-2f5e-46a8-a111-e1a59297b22e'
    }
  ]
})
.then(function (res) {
  console.log('总数:', res.data.total);
  console.log('商品列表:', res.data.rows);
});
```

> **controls 说明**：填写要返回的字段别名（如 `mingcheng`、`zhutu`），建议明确指定而非空数组，减少冗余数据。
> **输入参数规范**：参考 `.claude/skills/fsj-skills2.0/内容元数据.md` 中的字段对照表。

**多条件组合示例：**

```json
{
  "filters": [
    {
      "controlId": "shangjia",
      "dataType": 29,
      "spliceType": 1,
      "filterType": 24,
      "value": "商家rowid"
    },
    {
      "controlId": "leixing",
      "dataType": 1,
      "spliceType": 1,
      "filterType": 1,
      "value": "文章"
    },
    {
      "controlId": "shanchu",
      "dataType": 2,
      "spliceType": 1,
      "filterType": 6,
      "value": "1"
    }
  ]
}
```

> ⚠️ **所有查询必须加 `shanchu != "1"` 过滤**，排除已逻辑删除的记录。

**返回结构：**

```json
{
  "success": true,
  "data": {
    "rows": [
      {
        "rowid": "016bda4d-a411-408d-be55-43c86edf3457",
        "ctime": "2026-05-13 18:06:04",
        "mingcheng": "商品名称",
        "zhutu": [{ "thumbnail_full_path": "https://..." }],
        "guanjianci": [{"sid": "标签rowid", "name": "标签名"}]
      }
    ],
    "total": 100
  },
  "error_code": 1
}
```

---

### 3.2 查 - 单条记录（getRowByIdPost）

**用途：** 根据 rowId 查询单条记录详情

| 字段 | 值 |
|------|------|
| API URL | `https://api.mingdao.com/v2/open/worksheet/getRowByIdPost` |
| 方法 | `POST` |

**请求参数：**

```json
{
  "worksheetId": "shangpin",
  "rowId": "记录rowid",
  "getSystemControl": "false",
  "includeControls": ["mingcheng", "zhutu", "mdnr", "wznr", "leixing", "fabuzhe"]
}
```

**调用示例：**

```javascript
callMingdaoAPI('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost', {
  worksheetId: 'shangpin',
  rowId: '记录rowid',
  getSystemControl: 'false'
})
.then(function (res) {
  console.log('记录详情:', res.data);
});
```

---

### 3.3 增 - 新增记录（addRow）

**用途：** 向指定工作表新增一条记录

| 字段 | 值 |
|------|------|
| API URL | `https://api.mingdao.com/v2/open/worksheet/addRow` |
| 方法 | `POST` |

**请求参数：**

```json
{
  "worksheetId": "shangpin",
  "triggerWorkflow": true,
  "controls": [
    { "controlId": "字段ID", "value": "字段值" },
    { "controlId": "字段ID", "value": "字段值", "valueType": 2 }
  ],
  "getSystemControl": "false"
}
```

> `valueType: 2` 表示值是关联记录/选项等复杂类型（如 `fabuzhe`、`sew`、`shangjia1`）。

**调用示例：**

```javascript
// 新增一条内容记录（参考 fsj-skills2.0/内容元数据.md 字段规范）
callMingdaoAPI('https://api.mingdao.com/v2/open/worksheet/addRow', {
  worksheetId: 'shangpin',
  triggerWorkflow: true,
  getSystemControl: 'false',
  controls: [
    { controlId: 'mingcheng', value: '文章标题' },
    { controlId: 'leixing', value: '文章' },
    { controlId: 'sew', value: '9信息', valueType: 2 },
    { controlId: 'wznr', value: '<p>文章正文 HTML</p>' },
    { controlId: 'mdnr', value: '文章摘要' },
    { controlId: 'zhutu', value: 'https://封面图URL' },
    { controlId: 'fabuzhe', value: '用户rowid', valueType: 2 },
    { controlId: 'shangjia1', value: '1', valueType: 2 },
    { controlId: 'guanjianci', value: '标签rowid1,标签rowid2' }
  ]
})
.then(function (res) {
  var newRowid = typeof res.data === 'string' ? res.data : res.data.rowid;
  console.log('新增成功，记录ID:', newRowid);
});
```

**返回结构：**

```json
{
  "success": true,
  "data": "新增记录的rowid（字符串）",
  "error_code": 1
}
```

> ⚠️ `data` 直接是 rowid 字符串（不是对象），需要判断 `typeof res.data === 'string'`。

---

### 3.4 改 - 更新记录（editRow）

**用途：** 更新指定工作表的记录

| 字段 | 值 |
|------|------|
| API URL | `https://api.mingdao.com/v2/open/worksheet/editRow` |
| 方法 | `POST` |

**请求参数：**

```json
{
  "worksheetId": "shangpin",
  "rowId": "要更新的记录rowid",
  "controls": [
    { "controlId": "字段ID", "value": "新值" }
  ],
  "triggerWorkflow": false,
  "getSystemControl": "false"
}
```

> ⚠️ 更新时一般 `triggerWorkflow: false`，避免触发不必要的自动化流程。

**调用示例：**

```javascript
// 更新内容标题和正文
callMingdaoAPI('https://api.mingdao.com/v2/open/worksheet/editRow', {
  worksheetId: 'shangpin',
  rowId: '记录rowid',
  triggerWorkflow: false,
  getSystemControl: 'false',
  controls: [
    { controlId: 'mingcheng', value: '新标题' },
    { controlId: 'wznr', value: '<p>新正文 HTML</p>' }
  ]
})
.then(function (res) {
  console.log('更新成功:', res);
});
```

---

### 3.5 删 - 删除记录

#### 3.5.1 逻辑删除（推荐）⭐

**用途：** 通过设置 `shanchu` 字段标记为已删除，数据仍在表中可恢复，查询时自动过滤。

| 字段 | 值 |
|------|------|
| API URL | `https://api.mingdao.com/v2/open/worksheet/editRow` |
| 方法 | `POST` |

**操作步骤：**
1. 调用 `editRow` 将 `shanchu` 字段设为 `"1"`
2. 所有查询接口在 `filters` 中添加 `shanchu != "1"` 的过滤条件

**删除操作：**
```javascript
// 逻辑删除：设置 shanchu=1
callMingdaoAPI('https://api.mingdao.com/v2/open/worksheet/editRow', {
  worksheetId: 'shangpin',
  rowId: '记录rowid',
  controls: [
    { controlId: 'shanchu', value: '1' }
  ],
  getSystemControl: 'false'
})
```

**查询过滤（所有查询都必须加）：**
```javascript
filters: [
  // ... 其他过滤条件
  { controlId: 'shanchu', dataType: 2, spliceType: 1, filterType: 6, value: '1' }
]
```

> **shanchu 字段说明：**
> - 字段别名：`shanchu`
> - 数据类型：文本（dataType: 2）
> - 值：`"0"` = 未删除（正常），`"1"` = 已删除（逻辑删除）
> - filterType: 6 = 不等于，查询时过滤掉 shanchu=1 的记录

#### 3.5.2 物理删除（⚠️ Dify 工作流不支持）

> ⚠️ **重要变更**：Dify 通用代理工作流 **不支持** `deleteRows` 端点（调用会返回 405 Method Not Allowed）。如需物理删除，请：
> 1. 通过明道云后台手动操作
> 2. 或联系管理员在 Dify 工作流中开放该端点
> 3. 日常删除请使用逻辑删除（shanchu=1）

---

### 3.6 清理 - 定期清理已删除数据

由于 Dify 不支持物理删除，定期清理需要在明道云后台手动操作，或通过管理员配置的工作流执行。

建议流程：
1. 查询 `shanchu=1` 且创建时间超过 N 天的记录
2. 导出备份后在明道云后台批量删除
3. 建议每月执行一次

---

## 四、特殊字段处理

### 4.1 关联字段（如 fabuzhe、guanjianci）

**写入时**：value 是 **逗号分隔的 rowid 字符串**（不是数组！）

```json
{
  "controlId": "fabuzhe",
  "value": "用户rowid",
  "valueType": 2
}
```

```json
{
  "controlId": "guanjianci",
  "value": "标签rowid1,标签rowid2,标签rowid3"
}
```

**读取时**：关联字段展开为 **JSON 字符串化的对象数组**，需要 `JSON.parse` 后取 `sid`：

```javascript
var fabuzheArr = JSON.parse(row.fabuzhe);  // [{sid: "用户rowid", name: "用户名"}]
var userRowid = fabuzheArr[0].sid;

var tagsArr = JSON.parse(row.guanjianci);  // [{sid: "标签rowid", name: "标签名"}]
var tagRowids = tagsArr.map(function (t) { return t.sid; });
```

### 4.2 图片/文件字段（zhutu 等）

**写入时**：value 是 URL 字符串（单个）或逗号分隔的 URL（多个）

```json
{
  "controlId": "zhutu",
  "value": "https://图片URL"
}
```

**读取时**：图片字段展开为对象数组：

```javascript
var images = JSON.parse(row.zhutu);  // [{thumbnail_full_path: "https://..."}]
var firstImage = images[0].thumbnail_full_path;
```

### 4.3 复选框字段

```json
{
  "controlId": "复选框字段ID",
  "value": true
}
```

### 4.4 下拉选项字段

```json
{
  "controlId": "下拉字段ID",
  "value": "选项值"
}
```

---

## 五、附录：枚举值参考

### 5.1 DataTypeEnum（控件类型）

| 枚举值 | 控件类型 | 说明 |
|--------|---------|------|
| 1 | 文本 | 单行、多行、富文本 |
| 2 | 文本（逻辑标记） | 如 `shanchu` 字段 |
| 6 | 数值 | 数字类型 |
| 11 | 下拉单选 | 下拉选择 |
| 14 | 附件 | 图片、文件 |
| 29 | **关联记录** | 他表关联字段 ⭐ |
| 30 | 他表字段 | 关联记录的字段 |
| 36 | 检查框 | 布尔值 |

> ⚠️ 关联记录字段（dataType: 29）是最常用的筛选类型，配合 filterType: 24 使用。

### 5.2 FilterTypeEnum（筛选类型）

| 枚举值 | 含义 | 适用场景 |
|--------|------|---------|
| 1 | 等于 | 文本精确匹配 |
| 2 | 不等于 | 排除 |
| 3 | 包含 | 模糊搜索 |
| 4 | 开头为 | 前缀匹配 |
| 5 | 不包含 | 排除关键词 |
| 6 | 不是 | 不等于 |
| 7 | 为空 | 空值检查 |
| 8 | 不为空 | 有值检查 |
| 11 | 在范围内 | 数值区间（values 数组） |
| 12 | 不在范围内 | 数值区间排除 |
| 13 | 大于 | 数值 > N |
| 14 | 大于等于 | 数值 >= N |
| 15 | 小于 | 数值 < N |
| 16 | 小于等于 | 数值 <= N |
| 17 | 日期是 | 日期精确匹配 |
| 18 | 日期不是 | 日期排除 |
| 21 | 我拥有的 | 数据权限过滤 |
| 24 | **关联控件是** | 他表关联字段筛选 ⭐ |
| 25 | 关联控件不是 | 排除关联记录 |
| 26 | 数组等于 | 多选完全匹配 |
| 27 | 数组不等于 | 多选不匹配 |

### 5.3 DateRangeEnum（日期范围）

| 枚举值 | 含义 | 枚举值 | 含义 |
|--------|------|--------|------|
| 1 | 今天 | 2 | 昨天 |
| 3 | 明天 | 4 | 本周 |
| 5 | 上周 | 6 | 下周 |
| 7 | 本月 | 8 | 上月 |
| 9 | 下月 | 10 | 上季度 |
| 11 | 下季度 | 12 | 本季度 |
| 13 | 上季度 | 14 | 下季度 |
| 15 | 本年 | 16 | 去年 |
| 17 | 明年 | 18 | 自定义 |
| 21 | 过去7天 | 22 | 过去14天 |
| 23 | 过去30天 | 31 | 未来7天 |
| 32 | 未来14天 | 33 | 未来30天 |

---

## 六、已知工作表

### 6.1 服世界核心表（Dify 统一入口）

| 表名 | worksheetId | 用途 |
|------|-------------|------|
| 商品/内容统一表 | `shangpin`（别名） | 商品、文章、任务、评论、知识、相册等所有数据 |

> ⚠️ 所有数据统一使用 `shangpin` 表（别名），通过 `leixing`（UI 类型）和 `sew`（12维分类）区分数据性质。参考 `.claude/skills/fsj-skills2.0/内容元数据.md`。

### 6.2 用户/组织相关表

| 表名 | worksheetId | 用途 |
|------|-------------|------|
| 用户表 | `69b0077358322d512e60bad0` | 用户信息（openid、昵称等） |
| 组织/商家表 | `69f549c69f1956fc0e171aa6` | 商家配置（leixing 区分） |

> ⚠️ 用户表/商家表通过各自的 Dify 工作流访问（不在通用 CRUD 范围内），参考 `Dify微信登录接口.md`。

### 6.3 其他业务表

| 表名 | worksheetId | 用途 |
|------|-------------|------|
| 商品表（SPU） | `67b9d2ab322edd7d3c5424c0` | 同檐er 旧业务商品表 |
| 用户表 | `67b9d2ab322edd7d3c5424bf` | 同檐er 旧业务用户表 |
| 分类表 | `67b9d2ab322edd7d3c5424b2` | 同檐er 商品分类 |
| APP订单 | `68c521a4646f5f797f37ecaa` | 订单主表 |
| APP订单明细 | `68c521ae646f5f797f37ece7` | 订单明细表 |

---

## 七、注意事项

1. **⚠️ API Key 安全**：生产环境必须通过后端代理转发，`app-wiFOFfbqggxDlfgsAYDV3gqT` 不暴露给前端
2. **同步阻塞模式**：`response_mode: 'blocking'` 等待工作流执行完才返回，实测耗时约 0.6-1.5 秒
3. **outputs.output 是一次 JSON 字符串**：需要 `JSON.parse` 一次，不需要二次解析
4. **input 长度**：Dify 已放宽限制，实测 534+ 字符正常通过
5. **worksheetId 用别名**：统一使用 `shangpin`，不用 UUID
6. **关联字段读写格式不同**：写入逗号分隔 rowid，读取 JSON 对象数组 `[{sid, name}]`
7. **所有查询必加 `shanchu != "1"`**：排除已逻辑删除的记录
8. **物理删除不支持**：Dify 工作流不开放 `deleteRows` 端点（405），日常用逻辑删除

---

## 八、与其他 Dify 工作流的关系

| 工作流 | Token | 用途 |
|--------|-------|------|
| 通用 CRUD（本文档） | `app-wiFOFfbqggxDlfgsAYDV3gqT` | 商品/内容/订单/地址/评论增删改查 |
| 微信登录 | `app-jVwBLG5TYgdPk14IRSYaUDSD` | 微信授权登录、用户匹配 |
| 12维记忆管理 | `app-b66KDnwelK1AZzyEBF1M6cgr` | Agent 专属 12维数据增删改查（需密码验证） |
| 标签管理 | `app-XgTtNlqu9QmRA4n5iAx62l32` | 关键词标签生成/查询 |

> 所有工作流统一走 `https://dify.100000whys.cn/v1/workflows/run`，仅 token 和入参不同。

---

*文档版本：v3.0（Dify 版）*
*创建时间：2026-05-13*
*更新时间：2026-07-11（从 Coze 迁移至 Dify，实测验证增改查通过，物理删除不支持）*
