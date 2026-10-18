# 自定义页面支付技术方案

> webview-spa2.0 iframe 嵌入的第三方 HTML 页面调用微信支付流程

---

## 一、整体架构

```
主页面(webview-spa2.0)              iframe(第三方页面)              小程序                  后端
       │                              │                           │                      │
       │─── postMessage ──────────────>│                           │                      │
       │   initData{openid,userId}     │                           │                      │
       │                              │                           │                      │
       │                              │─── fetch ───────────────────────────────────────>│
       │                              │   {openid: xxx}            │                      │
       │                              │   查余额                    │                      │
       │                              │<───────────────────────────│──────────────────────┤
       │                              │   {balance: 50}            │                      │
       │                              │                           │                      │
       │                              │─── Bridge.postMessage ───>│                      │
       │                              │   getBalance              │                      │
       │                              │                           │─── wx.request ──────>│
       │                              │                           │   /api/pay/unified    │
       │                              │<──────────────────────────│                      │
       │─── 支付结果回调 <──────────────│                           │   pay_params          │
       │                              │─── wx.requestPayment      │                      │
       │                              │                           │                      │
       │<─── paymentResult ────────────│                           │                      │
       │                              │                           │                      │
```

---

## 二、用户身份传递（postMessage 方案）

### 2.1 主页面 → iframe 传递用户身份

**时机**：主页面 `switchToWebview(url)` 加载 iframe 后，通过 `postMessage` 发送用户身份。

```js
// app.js - switchToWebview 中
var iframe = document.getElementById('webview-iframe');
iframe.src = url;

// 延迟发送，确保 iframe 加载完成
iframe.onload = function() {
  var iframeWindow = iframe.contentWindow;
  if (iframeWindow) {
    iframeWindow.postMessage({
      type: 'fsj:userData',
      data: {
        openid: WechatLoginService.getOpenid() || '',
        userId: window.App.getUserData()?.rowid || '',
        userName: WechatLoginService.getUserInfo()?.name || '',
        shangjiaRowid: FsjApi.getShangjiaRowid() || ''
      }
    }, '*');
  }
};
```

### 2.2 iframe 页面接收

**iframe 内部**：

```js
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'fsj:userData') {
    var userData = e.data.data;
    // userData.openid 用于后续支付
    console.log('收到用户身份:', userData.openid, userData.userId);
  }
});
```

> **为什么不传 URL 参数？**
> 不污染 URL、不暴露敏感信息、跨域友好。

---

## 三、余额查询

### 3.1 前端判断（展示用）

登录成功后 `fsj_user_info` 已存 localStorage，自定义页面可通过主页面传递的 openid 获取余额。

### 3.2 后端校验（支付核心）

**接口**：已有的 `POST https://100000whys.cn/fsj/api/user/code2session`

```
请求：{ openid: "oABC123..." }
返回：{ code: 200, data: { user: { balance: 50.00, ... } } }
```

> **注意**：支付前必须调后端查最新余额，不能依赖前端缓存。

---

## 四、支付流程（核心）

### 4.1 iframe → 小程序 → 后端 → 微信支付

| 步骤 | 调用方 | 动作 |
|------|--------|------|
| 1 | iframe 页面 | 调后端查余额确认 |
| 2 | iframe 页面 | `Bridge.doPayment({ body, total_fee })` → 通知小程序 |
| 3 | 小程序 | 收到消息，调后端 `/api/pay/unified` 统一下单（商户密钥在小程序代码中） |
| 4 | 小程序 | 收到 `pay_params`，调 `wx.requestPayment` 拉起支付 |
| 5 | 小程序 | 支付成功/失败，`postMessage` 回传 iframe |
| 6 | iframe 页面 | 收到结果，刷新 UI |

> **安全说明**：商户密钥（`mch_id`、`api_key`）存放在小程序 `app.js` 的 `globalData.payConfig` 中，iframe 前端页面无法直接访问。iframe 只传商品描述和金额给小程序，由小程序端完成统一下单。

### 4.2 关键接口

**统一下单**（已有）：
```
POST https://100000whys.cn/api/pay/unified
请求：{ appid, mch_id, api_key, openid, out_trade_no, body, total_fee }
返回：{ code: 200, data: { pay_params: { appId, timeStamp, nonceStr, package, signType, paySign } } }
```

---

## 五、扩展 Bridge 层

### 5.1 `bridge.js` 新增方法

```js
// iframe 页面调用小程序统一下单 + 拉起支付
// 传 { body, total_fee }，由小程序端调用后端
Bridge.doPayment: function(orderInfo) {
  this.postMessage('doPayment', orderInfo);
}

// 也兼容旧方式：直接传 pay_params
// Bridge.doPayment({ pay_params: {...} })

// iframe 页面调用小程序查余额（需要后端配合）
Bridge.getBalance: function(openid) {
  this.postMessage('getBalance', { openid: openid });
}

// 监听小程序回传结果
Bridge.onPaymentResult: function(callback) {
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'paymentResult') {
      callback(e.data.data);
    }
  });
}
```

### 5.2 小程序端 `wxApp/app.js` 配置

商户支付配置存放在 `globalData.payConfig` 中：

```js
globalData: {
  // ...
  payConfig: {
    appid: 'wx022fc6b610cfa5b4',  // 小程序 AppID
    mch_id: '1234567890',         // 商户号（需替换为真实值）
    api_key: 'xxx'                // API 密钥（需替换为真实值）
  }
}
```

### 5.3 小程序端 `wxApp/pages/webview/index.js`

```js
// 监听 webview 发来的消息
onMessage(e) {
  var msg = e.detail.data;
  if (msg.type === 'doPayment') {
    // 新方式：传 body 和 total_fee，由小程序端统一下单
    if (msg.data.pay_params) {
      this.doWechatPay(msg.data.pay_params); // 兼容旧方式
    } else {
      this.createOrderAndPay(msg.data);
    }
  }
}

// 统一下单 + 拉起支付（保护商户密钥）
createOrderAndPay(orderInfo) {
  var payConfig = app.globalData.payConfig;
  wx.request({
    url: 'https://100000whys.cn/api/pay/unified',
    data: {
      appid: payConfig.appid,
      mch_id: payConfig.mch_id,
      api_key: payConfig.api_key,
      openid: app.globalData.openid,
      body: orderInfo.body,
      total_fee: orderInfo.total_fee
    },
    success: (res) => {
      if (res.data.code === 200) {
        this.doWechatPay(res.data.data.pay_params);
      }
    }
  });
}

// 拉起微信支付
doWechatPay(payParams) {
  wx.requestPayment({
    ...payParams,
    success: () => {
      this.postMessageToWebview('paymentResult', { success: true });
    },
    fail: (err) => {
      this.postMessageToWebview('paymentResult', {
        success: false,
        error: err.errMsg
      });
    }
  });
}
```

---

## 六、iframe 页面接入示例

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>商品购买</title>
</head>
<body>
  <div>
    <p>余额：<span id="balance">--</span> 元</p>
    <button onclick="buyProduct()">立即购买 ¥0.01</button>
  </div>

  <script>
    var currentOpenid = '';

    // 1. 接收主页面传递的用户身份
    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'fsj:userData') {
        currentOpenid = e.data.data.openid;
        console.log('用户ID:', currentOpenid);
        fetchBalance();
      }
    });

    // 2. 查询余额
    function fetchBalance() {
      fetch('https://100000whys.cn/fsj/api/user/code2session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openid: currentOpenid })
      })
      .then(function(res) { return res.json(); })
      .then(function(res) {
        if (res.code === 200) {
          document.getElementById('balance').textContent = res.data.user.balance;
        }
      });
    }

    // 3. 购买
    async function buyProduct() {
      // 3a. 统一下单
      var orderRes = await fetch('https://100000whys.cn/api/pay/unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appid: 'wx你的AppID',
          mch_id: '你的商户号',
          api_key: '你的API密钥',
          openid: currentOpenid,
          out_trade_no: 'ORDER' + Date.now(),
          body: '测试商品',
          total_fee: 1  // 1分
        })
      });
      var orderData = await orderRes.json();

      if (orderData.code !== 200) {
        alert('下单失败: ' + orderData.message);
        return;
      }

      // 3b. 通知小程序拉起支付
      window.parent.postMessage({
        type: 'doPayment',
        data: orderData.data.pay_params
      }, '*');
    }

    // 4. 监听支付结果
    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'paymentResult') {
        if (e.data.data.success) {
          alert('支付成功！');
          fetchBalance();  // 刷新余额
        } else {
          alert('支付失败: ' + (e.data.data.error || ''));
        }
      }
    });
  </script>
</body>
</html>
```

---

## 七、安全注意事项

1. **商户密钥不能放在前端** — 统一下单应由自建后端代理，或后端提供无需 api_key 的封装接口
2. **余额校验必须走后端** — 前端缓存仅用于展示
3. **订单号必须唯一** — 用 `ORDER + Date.now() + 随机串`
4. **支付回调必须验签** — 后端收到微信支付回调后验证签名再更新订单状态

---

## 八、待办清单

- [x] `app.js` - `switchToWebview` 中 iframe onload 后 postMessage 传用户身份
- [x] `bridge.js` - 扩展 `doPayment` / `getBalance` / `onPaymentResult` 方法
- [x] `wxApp/pages/webview/index.js` - 监听 webview 消息，拉起微信支付
- [x] `wxApp/pages/webview/index.js` - 支付结果回传 iframe
- [x] 更新 iframe 支付示例页面
- [ ] 测试完整支付流程

---

*编写时间: 2026-05-23*
