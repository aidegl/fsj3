# 鼠小盒 webview 迁移方案 - fsj 商品数据 + Coze 工作流代理

> 创建时间：2026-05-16
> 状态：方案阶段

---

## 一、背景

### 1.1 现状
- 鼠小盒 webview（`shuxiaohe/webview/`）直接调用明道云 v3 API，使用 `appKey` + `sign` 鉴权
- 商品数据来源：同檐er 商品表（`67b9d2ab322edd7d3c5424c0`）
- **问题**：appKey/sign 暴露在前端，且数据与其他项目隔离

### 1.2 目标
- 商品数据统一使用 **fsj 商品表**（`6a03ceaa7e29abcb297cbdfc`）
- 前端 **不暴露** appKey/sign，全部通过 **Coze 工作流代理**调用
- 数据加载必须加上 **商家筛选条件**（`shangjia2` 字段）

---

## 二、商家身份获取

### 2.1 URL 参数传递

SPA2.0 初始化时通过 URL 参数获取商家 rowid：

```
http://127.0.0.1:5501/workspace/project/fsj/shuxiaohe/webview/index.html?shangjia=65428a74-2f5e-46a8-a111-e1a59297b22e
```

### 2.2 获取方式

```javascript
function getShangjiaRowid() {
  var params = window.location.search.substring(1);
  var parts = params.split('&');
  for (var i = 0; i < parts.length; i++) {
    var kv = parts[i].split('=');
    if (kv[0] === 'shangjia') {
      return decodeURIComponent(kv[1] || '');
    }
  }
  return '';
}

var shangjiaRowid = getShangjiaRowid(); // '65428a74-2f5e-46a8-a111-e1a59297b22e'
```

### 2.3 存储

获取后保存到 `localStorage` 或全局变量中，供后续接口调用使用：

```javascript
if (shangjiaRowid) {
  localStorage.setItem('fsj_shangjia_rowid', shangjiaRowid);
  window.SHANGJIA_ROWID = shangjiaRowid;
}
```

---

## 三、Coze 工作流代理

### 3.1 架构

```
前端（shuxiaohe webview）
    ↓ 调用 Coze Workflow API（仅传 URL + 入参）
Coze Workflow（内部持有 appKey/sign，自动注入）
    ↓ 调用明道云 v2 HAP API
明道云 HAP（fsj 商品数据，所有项目共享）
```

### 3.2 工作流配置

| 字段 | 值 |
|------|------|
| Workflow ID | `7639306110034378761` |
| 用途 | 通用明道云 API 代理 |
| 请求地址 | `https://api.coze.cn/v1/workflow/stream_run` |
| Token | `sat_PsqZd6JJl9qOPZoT30rPv2gLKAVIMXGMmIp38VzXXIRU77nzgzk09yvcFwNT8Z4h` |

### 3.3 请求参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `url` | string | 是 | 明道云 API 完整 URL |
| `input` | string | 是 | 请求体 JSON 字符串（不含 appKey/sign） |

### 3.4 前端调用封装

```javascript
/**
 * 调用 Coze 通用代理工作流
 * @param {string} url - 明道云 API 地址
 * @param {Object} body - 请求体（不含 appKey/sign）
 * @returns {Promise<Object>} 明道云返回数据
 */
function callMingdaoAPI(url, body) {
  return fetch('https://api.coze.cn/v1/workflow/stream_run', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Authorization': 'Bearer sat_PsqZd6JJl9qOPZoT30rPv2gLKAVIMXGMmIp38VzXXIRU77nzgzk09yvcFwNT8Z4h',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      workflow_id: '7639306110034378761',
      parameters: {
        url: url,
        input: JSON.stringify(body)
      }
    })
  })
  .then(function (res) {
    if (!res.ok) throw new Error('网络请求失败: ' + res.status);
    return res.text();
  })
  .then(function (text) {
    // 解析 SSE 响应
    var lines = text.split('\n');
    var result = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.indexOf('data: ') === 0) {
        try {
          var data = JSON.parse(line.substring(6));
          if (data.content) {
            result = JSON.parse(data.content);
          }
        } catch (e) {}
      }
    }
    if (!result) throw new Error('未获取到结果');

    // output 是 JSON 字符串，需要二次解析
    if (result.output && typeof result.output === 'string') {
      return JSON.parse(result.output);
    }
    return result;
  });
}
```

---

## 四、fsj 商品数据表

### 4.1 基本信息

| 字段 | 值 |
|------|------|
| 工作表别名 | `shangpin` |
| worksheetId | `6a03ceaa7e29abcb297cbdfc` |
| 默认视图 | `6a05246116650ca275151c41` |

### 4.2 字段对照

| 字段名称 | 类型 | 字段别名 | 说明 |
|---------|------|---------|------|
| 自动编号 | 自动编号 | `zdbh` | 商品编号 |
| 名称 | 文本框 | `mingcheng` | 商品名称 |
| 上架 | 检查框 | `shangjia1` | 是否上架（1=是） |
| 权重 | 数值 | `quanzhong` | 排序权重 |
| 成本价 | 金额 | `chengbenjia` | |
| 特价 | 金额 | `tejia` | 促销价 |
| 售价 | 金额 | `shoujia` | 原价/全额价 |
| 描述 | 文本框 | `miaoshu` | |
| 主图 | 附件 | `zhutu` | 商品图片 |
| 商家 | 关联记录 | `shangjia2` | 归属商家（筛选用） |
| 关键词 | 关联记录 | `guanjianci` | 搜索关键词标签 |
| 自定义字段 | 文本框 | `zdyzd` | |
| 商品分类 | 关联记录 | `spfl` | |

### 4.3 与旧表字段映射

| 旧表字段（同檐er） | 新表字段（fsj） | 说明 |
|-------------------|----------------|------|
| `6718e0c91064261092224e30` | `mingcheng` | 商品名称 |
| `6718e0c91064261092224e32` | `zhutu` | 封面图 |
| `67232e28a6330dcf75ac36ed` | `shoujia` | 售价 |
| `677607499e007e4411067520` | `spfl` | 分类 |
| `68c566c7ae63d696e10266d3` | `shangjia1` | 上架 |
| `69cb6be62304b0580851f971` | `tejia` | 盒子价/特价 |
| `69cb6be62304b0580851f972` | — | 库存（新表暂无） |
| `68c5670ca7762faa4242d99c` | `quanzhong` | 权重 |

---

## 五、数据查询方案

### 5.1 基础查询（无筛选）

```javascript
function getProductList(pageIndex, pageSize) {
  return callMingdaoAPI(
    'https://api.mingdao.com/v2/open/worksheet/getFilterRows',
    {
      worksheetId: '6a03ceaa7e29abcb297cbdfc',
      viewId: '6a05246116650ca275151c41',
      pageSize: pageSize || 20,
      pageIndex: pageIndex || 1,
      listType: 0
    }
  );
}
```

### 5.2 按商家筛选（⚠️ 待 Coze workflow 修复）

由于关联记录字段 `shangjia2` 的 `value` 需要数组格式，当前 Coze workflow 二次序列化会导致 JSON 解析错误。

**临时方案**：前端拿到数据后自行 JS 过滤

```javascript
function getProductsByShangjia(pageIndex, pageSize, shangjiaRowid) {
  return callMingdaoAPI(
    'https://api.mingdao.com/v2/open/worksheet/getFilterRows',
    {
      worksheetId: '6a03ceaa7e29abcb297cbdfc',
      viewId: '6a05246116650ca275151c41',
      pageSize: pageSize || 20,
      pageIndex: pageIndex || 1,
      listType: 0
    }
  )
  .then(function (res) {
    if (!res.success || !res.data.rows) return res;
    // 前端过滤：只保留当前商家的商品
    var filtered = res.data.rows.filter(function (row) {
      if (!row.shangjia2) return false;
      try {
        var shangjiaList = JSON.parse(row.shangjia2);
        return shangjiaList.some(function (item) {
          return item.sid === shangjiaRowid;
        });
      } catch (e) {
        return false;
      }
    });
    res.data.rows = filtered;
    res.data.total = filtered.length;
    return res;
  });
}
```

**理想方案**（Coze workflow 修复后）：

```javascript
function getProductsByShangjia(pageIndex, pageSize, shangjiaRowid) {
  return callMingdaoAPI(
    'https://api.mingdao.com/v2/open/worksheet/getFilterRows',
    {
      worksheetId: '6a03ceaa7e29abcb297cbdfc',
      viewId: '6a05246116650ca275151c41',
      pageSize: pageSize || 20,
      pageIndex: pageIndex || 1,
      listType: 0,
      filters: [
        {
          controlId: 'shangjia2',
          dataType: 1,
          filterType: 1,
          value: [shangjiaRowid]
        }
      ]
    }
  );
}
```

### 5.3 关键词搜索

```javascript
function searchProducts(keyword, pageIndex, pageSize) {
  return callMingdaoAPI(
    'https://api.mingdao.com/v2/open/worksheet/getFilterRows',
    {
      worksheetId: '6a03ceaa7e29abcb297cbdfc',
      viewId: '6a05246116650ca275151c41',
      pageSize: pageSize || 20,
      pageIndex: pageIndex || 1,
      listType: 0,
      keyWords: keyword
    }
  );
}
```

### 5.4 数据转换

```javascript
/**
 * 将 fsj 商品数据转换为前端格式
 */
function mapProduct(row) {
  return {
    id: row.rowid || '',
    code: row.zdbh || '',
    name: row.mingcheng || '',
    price: parseFloat(row.shoujia) || 0,
    boxPrice: parseFloat(row.tejia) || 0,
    imageUrl: parseImage(row.zhutu),
    stock: 999, // 新表暂无库存字段，可后续补充
    limit: 999,
    shangjia: parseShangjia(row.shangjia2),
    category: parseCategory(row.spfl),
    weight: parseInt(row.quanzhong) || 0
  };
}

/**
 * 解析图片字段
 */
function parseImage(imageField) {
  if (!imageField) return '';
  if (typeof imageField === 'string') {
    try {
      var parsed = JSON.parse(imageField);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed[0].large_thumbnail_full_path ||
               parsed[0].thumbnail_full_path ||
               parsed[0].file_path + parsed[0].file_name || '';
      }
    } catch (e) {}
  }
  if (Array.isArray(imageField) && imageField.length > 0) {
    return imageField[0].large_thumbnail_full_path ||
           imageField[0].downloadUrl || '';
  }
  return '';
}

/**
 * 解析商家关联字段
 */
function parseShangjia(shangjiaField) {
  if (!shangjiaField) return '';
  try {
    var list = typeof shangjiaField === 'string' ? JSON.parse(shangjiaField) : shangjiaField;
    return list.length > 0 ? list[0].name : '';
  } catch (e) {
    return '';
  }
}

/**
 * 解析分类关联字段
 */
function parseCategory(categoryField) {
  if (!categoryField) return '';
  try {
    var list = typeof categoryField === 'string' ? JSON.parse(categoryField) : categoryField;
    return list.length > 0 ? list[0].name : '';
  } catch (e) {
    return '';
  }
}
```

---

## 六、测试验证

### 6.1 已验证

| 测试项 | 状态 | 结果 |
|--------|------|------|
| URL 获取商家 rowid | ✅ | `65428a74-2f5e-46a8-a111-e1a59297b22e` |
| 商家配置获取（workflow `7638635859176587283`） | ✅ | 拿到 appid/appsecret/color/shangjia tabs |
| 商品无筛选查询（Coze 代理） | ✅ | 432 条记录 |
| 商品关键词搜索（keyWords） | ✅ | "坚果" 返回 8 条 |

### 6.2 待解决

| 问题 | 状态 | 说明 |
|------|------|------|
| 商家筛选（`filters` 数组格式） | ❌ | Coze workflow 二次序列化导致 JSON 错误，当前用前端 JS 过滤替代 |

---

## 七、实施状态

### 7.1 已完成 ✅

| 步骤 | 状态 | 说明 |
|------|------|------|
| 创建 `js/fsj-api.js` | ✅ | 封装 Coze 代理调用，含商家/分类前端过滤、分页、数据转换 |
| 初始化获取商家 rowid | ✅ | 从 URL 参数 `?shangjia=xxx` 提取并缓存到 `FsjApi._shangjiaRowid` |
| 替换首页商品查询 | ✅ | `home.js` 中 `HapApi` → `FsjApi` |
| 更新 HTML 引用 | ✅ | `index.html` 和 `hezi.html` 中 `hap-api.js` → `fsj-api.js` |
| 数据转换适配 | ✅ | 新旧字段映射（zdbh→code, mingcheng→name, shoujia→price 等） |
| 测试验证 | ✅ | Node.js 端到端测试：首页加载、分页、关键词搜索均通过 |

### 7.2 待实施

| 步骤 | 状态 | 说明 |
|------|------|------|
| 删除旧依赖 | ⏳ | 移除 `js/hap-api.js`（保留作为回滚参考） |
| 其他 API 迁移 | ⏳ | 如有订单、用户等其他 API 调用，也需改为 Coze 代理 |
| 商家筛选后端化 | ⏳ | Coze workflow 修复后，将前端 JS 过滤切换为后端 `filters` 数组 |

---

## 八、API 对比

| 项目 | 旧 hap-api.js（明道云 v3） | 新 fsj-api.js（Coze 代理） |
|------|------|------|
| 鉴权 | `appKey/sign` 硬编码在前端 | `Bearer token` 在 Coze，`appKey/sign` 在 Coze workflow 内部注入 |
| 商品表 | `67b9d2ab322edd7d3c5424c0`（同檐er） | `6a03ceaa7e29abcb297cbdfc`（fsj） |
| API 版本 | v3 (`/app/worksheets/{id}/rows/list`) | v2 (`/v2/open/worksheet/getFilterRows`) |
| 字段识别 | 字段 ID（如 `6718e0c91064261092224e30`） | 字段别名（如 `mingcheng`） |
| 商家筛选 | 无 | 前端 JS 过滤 `shangjia2` 字段 |
| 分页 | 后端分页 | 一次取50条，前端分页 |
