# 通用微信支付 API — 前端调用说明

> 域名：`https://100000whys.cn`
> 协议：HTTPS + JSON
> 适用范围：任何微信小程序

---

## 一、完整支付流程

```
wx.login() 获取 code
    ↓
POST /fsj/api/user/code2session    用 code 换 openid
    ↓
POST /api/pay/unified              统一下单，获取 pay_params
    ↓
wx.requestPayment()                拉起微信支付
    ↓
支付成功 / 失败                    处理结果
```

---

## 二、获取 openid

### 接口

```
POST https://100000whys.cn/fsj/api/user/code2session
```

### 请求体

```json
{
  "code": "0a1b2c3d4e5f"        // 必填，wx.login() 返回的一次性 code
}
```

### 返回

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 2592000,
    "user": {
      "id": 1,
      "openid": "oABC123...",
      "nickname": "新用户",
      "balance": 5.00,
      "source": "fsj"
    }
  }
}
```

---

## 三、统一下单（核心支付接口）

### 接口

```
POST https://100000whys.cn/api/pay/unified
```

### 请求体

```json
{
  "appid":            "wx你的小程序AppID",     // 必填
  "mch_id":           "1234567890",           // 必填，商户号（10位数字）
  "api_key":          "你的商户API密钥",       // 必填，32位字符串
  "openid":           "oABC123...",           // 必填，用户 openid
  "out_trade_no":     "ORDER20240101001",     // 必填，商户订单号（≤32字符，唯一）
  "body":             "商品描述",              // 必填
  "total_fee":        100,                    // 必填，金额，单位：分（100 = 1元）
  "notify_url":       "https://...",          // 可选，支付回调地址
  "spbill_create_ip": "1.2.3.4"              // 可选，客户端IP
}
```

### 返回

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "out_trade_no": "ORDER20240101001",
    "prepay_id": "wx20240101123456abcdef",
    "pay_params": {
      "appId":     "wx你的小程序AppID",
      "timeStamp": "1700000000",
      "nonceStr":  "abc123def456...",
      "package":   "prepay_id=wx2024...",
      "signType":  "MD5",
      "paySign":   "DEF456GHI789..."
    }
  }
}
```

### 常见错误

| code | message | 说明 |
|------|---------|------|
| 400 | 参数不完整 | 缺少必填字段 |
| 400 | 金额不合法 | total_fee 不在 1~99999999 范围 |
| 400 | 签名错误 | appid/mch_id/api_key 不匹配 |
| 400 | mch_id参数格式错误 | 商户号不是10位数字 |

---

## 四、前端完整代码示例

### 方式一：微信小程序原生

```javascript
// ========== 第一步：登录获取 openid ==========
function getOpenid() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (loginRes) => {
        wx.request({
          url: 'https://100000whys.cn/fsj/api/user/code2session',
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data: { code: loginRes.code },
          success: (res) => {
            if (res.data.code === 200) {
              resolve(res.data.data.user.openid)
            } else {
              reject(new Error(res.data.message))
            }
          },
          fail: reject
        })
      },
      fail: reject
    })
  })
}

// ========== 第二步：统一下单 ==========
function unifiedOrder(params) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: 'https://100000whys.cn/api/pay/unified',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: params,
      success: (res) => {
        if (res.data.code === 200) {
          resolve(res.data.data.pay_params)
        } else {
          reject(new Error(res.data.message))
        }
      },
      fail: reject
    })
  })
}

// ========== 第三步：拉起支付 ==========
function doPayment(payParams) {
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      ...payParams,
      success: resolve,
      fail: reject
    })
  })
}

// ========== 完整流程调用 ==========
async function pay(orderNo, description, amountInYuan) {
  try {
    wx.showLoading({ title: '正在下单...' })

    // 1. 获取 openid
    const openid = await getOpenid()

    // 2. 统一下单
    const payParams = await unifiedOrder({
      appid: 'wx你的AppID',        // ← 替换为你的小程序 AppID
      mch_id: '1234567890',        // ← 替换为你的商户号
      api_key: '你的32位API密钥',   // ← 替换为你的商户 API Key
      openid: openid,
      out_trade_no: orderNo,
      body: description,
      total_fee: Math.round(amountInYuan * 100)  // 元转分
    })

    wx.hideLoading()

    // 3. 拉起微信支付
    await doPayment(payParams)

    wx.showToast({ title: '支付成功', icon: 'success' })

  } catch (err) {
    wx.hideLoading()
    if (err.errMsg && err.errMsg.indexOf('cancel') > -1) {
      wx.showToast({ title: '已取消支付', icon: 'none' })
    } else {
      wx.showToast({ title: err.message || '支付失败', icon: 'error' })
    }
  }
}

// 调用示例
pay('ORDER' + Date.now(), '测试商品', 0.01)  // 支付 1 分钱
```

### 方式二：uni-app

```javascript
async function pay(orderNo, description, amountInYuan) {
  // 1. 登录获取 code
  const loginRes = await uni.login()

  // 2. 用 code 换 openid
  const openidRes = await uni.request({
    url: 'https://100000whys.cn/fsj/api/user/code2session',
    method: 'POST',
    data: { code: loginRes.code }
  })
  const openid = openidRes.data.data.user.openid

  // 3. 统一下单
  const payRes = await uni.request({
    url: 'https://100000whys.cn/api/pay/unified',
    method: 'POST',
    data: {
      appid: 'wx你的AppID',
      mch_id: '1234567890',
      api_key: '你的API密钥',
      openid,
      out_trade_no: orderNo,
      body: description,
      total_fee: Math.round(amountInYuan * 100)
    }
  })

  if (payRes.data.code !== 200) {
    throw new Error(payRes.data.message)
  }

  // 4. 拉起支付
  await uni.requestPayment({
    provider: 'wxpay',
    ...payRes.data.data.pay_params
  })
}
```
