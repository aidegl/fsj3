# Webview 内嵌页面数据通信机制

> 记录孚世界小程序中 webview 内嵌页面的数据传递与共享方案

---

## 一、架构概述

小程序 webview 内嵌多个 H5 页面（SPA），这些页面之间的数据通信采用**混合策略**：

```
┌─────────────────────────────────────────────────┐
│                  小程序 (wxApp)                   │
│  ┌───────────────────────────────────────────┐  │
│  │               webview 容器                  │  │
│  │  ┌─────────────┐  ┌─────────┐  ┌───────┐  │  │
│  │  │ index.html  │  │hezi.html│  │其他   │  │  │
│  │  │ (SPA 主页面) │  │ (盒子页) │  │       │  │  │
│  │  └──────┬──────┘  └────┬────┘  └───┬───┘  │  │
│  │         │              │            │       │  │
│  │  ┌──────▼──────────────▼────────────▼───┐  │  │
│  │  │         localStorage (共享)           │  │  │
│  │  │  fsj_user_info / fsj_openid / ...    │  │  │
│  │  └──────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────┘  │
│                      ↑                          │
│              Bridge.postMessage                 │
│                      ↑                          │
│  ┌───────────────────┴───────────────────────┐  │
│  │         小程序原生页面 (index.js)           │  │
│  │         onMessage / navigateTo             │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

---

## 二、两种数据传递模式

### 模式 A：localStorage 共享（推荐）

**适用场景：** 同一个 webview 内导航切换的页面

**原理：** 小程序的 `<webview>` 组件为同一个 URL 域名维护独立的 localStorage 存储空间。在该 webview 内通过 `navigateTo`、`reLaunch` 等方式切换到的 H5 页面，共享同一个 localStorage。

**写入方（登录时）：**
```javascript
// wechat-login.js - finishLogin
localStorage.setItem('fsj_openid', openid);
localStorage.setItem('fsj_user_info', JSON.stringify({
  id: userData.rowid,
  name: name,
  avatar: avatarUrl,
  raw: userData
}));
localStorage.setItem('fsj_shangjia_rowid', shangjiaRowid);
```

**读取方（业务页面）：**
```javascript
// hezi.js - loadItems
var storedInfo = localStorage.getItem('fsj_user_info');
var userRowid = '';
if (storedInfo) {
  try { userRowid = JSON.parse(storedInfo).id || ''; } catch (e) {}
}
// 拿到 userRowid 后调用 API 获取数据
FsjApi.getOrderDetails(userRowid).then(...);
```

**优势：**
- 无需 URL 拼接，参数不暴露在地址栏
- 可存储结构化数据（JSON 对象）
- 页面切换无刷新，读取即时

**劣势：**
- 仅限同域 webview 内共享
- 跨域 iframe 无法访问父级 localStorage

---

### 模式 B：URL 参数传递（降级方案）

**适用场景：** 父级页面向跨域 iframe 传递身份

**原理：** 通过 URL hash 或 search 参数将关键信息传递给嵌入的 iframe。

```javascript
// agent.js - switchToWebview
var url = 'http://127.0.0.1:5501/workspace/project/fsj/shenhe/index.html' +
  '#fsj_openid=' + openid +
  '&fsj_user=' + userRowid +
  '&fsj_shangjia=' + shangjiaRowid +
  '&fsj_balance=' + balance;

// iframe 内解析 hash 参数
function parseHashParams() {
  var hash = window.location.hash.substring(1);
  var params = {};
  hash.split('&').forEach(function (part) {
    var kv = part.split('=');
    if (kv[0]) params[kv[0]] = decodeURIComponent(kv[1] || '');
  });
  return params;
}
```

**优势：**
- 跨域 iframe 也能接收参数
- 页面首次加载即可获取

**劣势：**
- URL 长度有限制
- 参数暴露在地址栏
- 每次切换页面都要重新拼接

---

## 三、跨端通信：H5 ↔ 小程序

### 3.1 H5 通知小程序

```javascript
// H5 → 小程序：跳转小程序页面
wx.miniProgram.navigateTo({
  url: '/pages/login/index'
});

// H5 → 小程序：发送消息（缓冲，非实时）
wx.miniProgram.postMessage({
  data: { type: 'requestOpenid' }
});
```

### 3.2 小程序通知 H5

```javascript
// 小程序 → H5：通过 URL 参数传递
// 小程序导航回 webview 时带参数
wx.miniProgram.navigateBack({
  delta: 1  // 返回 webview，URL 带 ?openId=xxx
});

// 小程序 → H5：通过 Bridge.doPayment 通知支付
// H5 监听 window.addEventListener('message', ...)
window.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'fsj:paymentResult') {
    // 处理支付结果
  }
});
```

---

## 四、项目中的实际应用

### 4.1 页面数据加载对照表

| 页面 | 数据获取方式 | 依赖 URL 参数 | 数据来源 |
|------|------------|--------------|---------|
| `index.html` (首页) | URL hash + API 查询 | 是 (跨域 iframe) | 父页面传参 |
| `hezi.html` (盒子) | localStorage + API 查询 | **否** | localStorage 共享 |
| 小程序登录页 | 微信授权 | 否 | 微信 JS-SDK |

### 4.2 盒子页面完整流程

```
用户点击底部 Tab「盒子」
  → 小程序 navigateTo 加载 hezi.html
  → HeziPage.init()
  → 读取 localStorage.fsj_user_info.id 获取用户 rowid
  → FsjApi.getOrderDetails(userRowid) 查询先享后付明细
  → 按未支付数量拆分成格子渲染
  → 用户选中格子 → 底部支付栏出现
  → 点击立即下单 → 选择支付方式 → 创建订单
```

全程不需要 URL 传递任何业务参数，仅凭 localStorage 中的用户身份即可完整运转。

---

## 五、踩坑记录

### 5.1 localStorage 不共享的情况

当 H5 页面被嵌入到**不同域名**的 iframe 中时，localStorage 不共享。此时必须使用 URL 参数传递关键信息。

**判断方法：** 在控制台执行 `window.parent === window` 判断是否处于 iframe。

### 5.2 小程序 postMessage 的延迟

`wx.miniProgram.postMessage` 是缓冲发送，不会立即触发小程序的 `onMessage`。只有特定时机（小程序后退、销毁、分享）才会真正发送。如需实时通信，应使用 URL 参数或 Bridge 机制。

### 5.3 webview 刷新后 localStorage 保留

小程序通过 `wx.miniProgram.reLaunch` 刷新 webview 后，localStorage 数据仍然保留。因此可以利用这一点实现"刷新页面但不丢失登录状态"。

---

## 六、总结

| 维度 | localStorage 方案 | URL 参数方案 |
|------|------------------|-------------|
| 安全性 | 较高（不暴露） | 较低（地址栏可见） |
| 容量 | 大（5MB） | 小（URL 长度限制） |
| 实时性 | 即时 | 页面加载时读取 |
| 跨域 | 不支持 | 支持 |
| 推荐场景 | 同域 webview 内页面 | 跨域 iframe、外部链接 |

**经验法则：** 能读 localStorage 就读 localStorage，读不到再降级到 URL 参数。两种兜底，保证数据可靠性。
