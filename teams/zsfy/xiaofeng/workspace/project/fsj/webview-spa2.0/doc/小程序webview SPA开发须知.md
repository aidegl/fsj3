# 小程序 webview SPA 开发须知

> 记录在微信 `<web-view>` 组件中嵌入 H5 SPA 时踩到的坑和最佳实践

---

## 1. webview 组件重载的三大误区

### 误区 1：用 `setData({ src: newUrl })` 重载

```xml
<!-- 错误做法 -->
<web-view src="{{url}}"></web-view>
```

```js
this.setData({ url: newUrl });  // 不会触发 H5 重新加载
```

**原因**：`<web-view>` 是微信的**原生组件**，当 base URL（域名+路径）相同时，即使 query 参数不同，它可能不会重新创建 H5 的 JavaScript 上下文，而是从缓存加载。

### 误区 2：用 `wx:if` 销毁重建

```xml
<web-view wx:if="{{showWebview}}" src="{{url}}"></web-view>
```

```js
this.setData({ showWebview: false, url: '' });
setTimeout(() => { this.setData({ showWebview: true, url: newUrl }); }, 300);
```

**原因**：即使组件被移除再重建，微信可能仍然复用之前的 H5 运行时。`App.init()` 不会重新执行，H5 页面状态不变。

### 误区 3：用 `wx:key` 改变 key 值

```xml
<web-view wx:key="{{webviewKey}}" src="{{url}}"></web-view>
```

```js
this.setData({ webviewKey: Date.now(), url: newUrl });
```

**原因**：`wx:key` 改变后微信框架会销毁重建组件，但 `<web-view>` 作为**原生组件**的特殊性，内部 H5 的 JavaScript 上下文可能仍然被保留，页面仍然不从新 URL 加载。

## 2. 可靠的 webview 重载方案

### 方案 1：`wx.redirectTo`（推荐用于登录/退出场景）

```js
// 登录后注入 openId
wx.redirectTo({
  url: '/pages/webview/index?url=' + encodeURIComponent(newUrl)
});

// 退出登录后清理
wx.reLaunch({
  url: '/pages/webview/index?_reset=' + Date.now()
});
```

**为什么有效**：`wx.redirectTo` 关闭当前页面、打开新页面实例，创建全新的页面实例和 `<web-view>` 组件，不受组件缓存影响。

**注意**：在 `onLoad` 中接收传入的 URL 参数并设置给 web-view：

```js
onLoad: function (o) {
  if (o && o.url) {
    url = decodeURIComponent(o.url);
  }
  this.setData({ url: url });
}
```

### 方案 2：H5 端轮询检测（适用于不重载页面的场景）

当不能重载页面时，H5 侧主动轮询检测状态变化：

```js
// 退出登录后启动轮询
_startLoginPolling: function () {
  var self = this;
  this._pollTimer = setInterval(function () {
    // 检查 localStorage 是否已恢复
    var stored = localStorage.getItem('fsj_openid');
    if (stored) {
      self._stopLoginPolling();
      self.loginWithOpenid(stored);
      return;
    }
    // 检查 URL 是否已有 openId
    var urlOpenid = new URLSearchParams(window.location.search).get('openId');
    if (urlOpenid) {
      self._stopLoginPolling();
      self.loginWithOpenid(urlOpenid);
      return;
    }
  }, 3000);  // 每 3 秒检测一次
}
```

**适用场景**：webview 不重载、小程序通过 hash 或 search 参数注入 openid 但 H5 未收到 `hashchange` 事件的情况。

## 3. 小程序 → H5 通信注意事项

| 方法 | 可靠性 | 说明 |
|------|--------|------|
| 修改 `<web-view>` 的 `src` URL（带 query 参数） | ❌ 低 | H5 可能收不到，JS 上下文不重建 |
| 修改 hash（`#openid=xxx`） | ⚠️ 不确定 | 部分情况下触发 `hashchange`，部分情况下不触发 |
| `wx.redirectTo` 重建页面 | ✅ 高 | 新页面实例，URL 参数必定可用 |
| `wx.miniProgram.postMessage` | ❌ 延迟 | 消息是异步延迟触发的，不适合实时通信 |

**推荐做法**：不要依赖 `postMessage` 的实时性，通过 URL 参数传递数据，配合 `wx.redirectTo` 确保 H5 重新加载后能读到参数。

## 4. H5 → 小程序通信

```js
// H5 侧：发送消息
window.wx.miniProgram.postMessage({
  data: { type: 'requestOpenid' }
});
```

```js
// 小程序侧：在 onMessage 中接收
onMessage: function (e) {
  var dataList = e.detail.data || [];
  for (var i = 0; i < dataList.length; i++) {
    var msg = dataList[i];
    if (msg.type === 'requestOpenid') {
      // 处理请求
    }
  }
}
```

**注意**：H5 通过 `postMessage` 发送的消息，小程序**可能延迟收到**（部分版本在页面离开时才触发），不适合实时双向通信。

## 5. 调试技巧

在 `<web-view>` 中嵌入 H5 时，小程序的微信开发者工具**看不到 H5 内部的 console.log**。临时方案：

1. 在 H5 页面顶部添加调试面板，用 `logDebug()` 代替 `console.log()`
2. 添加一键复制按钮，方便粘贴日志
3. 问题修复后设为 `display:none` 隐藏

```html
<div id="debug-overlay" style="display:none; position:fixed; top:0; left:0; right:0; background:rgba(0,0,0,0.85); color:#0f0; padding:8px; max-height:180px; overflow:auto; font-size:11px; font-family:monospace; z-index:99999;">
  <button onclick="copyDebugLog()">复制</button>
  <pre id="debug-log-content"></pre>
</div>
```

## 6. 实战总结

### 登录/退出/重新登录的完整流程

```
首次加载 → webview onLoad → 加载 H5 → H5 未登录
     ↓ 用户点击登录
小程序 navigateTo → 登录页 → 微信授权成功
     ↓
onShow 触发 → wx.redirectTo 新页面实例（带 openId 参数）
     ↓
H5 新页面加载 → handleAuthLogic 读到 URL 中的 openId
     ↓
loginWithOpenid → Coze API → 登录成功，UI 更新
     ↓ 用户点击退出
H5 发送 logout 消息 → 小程序 wx.reLaunch 完全重启
     ↓ 用户再次点击登录
小程序重新走登录流程 → redirectTo 重建 webview
     ↓
H5 新页面加载 → 读到 openId → 登录成功
```

**关键原则**：登录/退出场景必须用**页面级导航**（`wx.redirectTo`/`wx.reLaunch`）重建 webview，不能依赖组件内的 `setData` 或 `wx:key`。

---

*创建时间: 2026-05-26 | 项目: fsj webview-spa2.0*
