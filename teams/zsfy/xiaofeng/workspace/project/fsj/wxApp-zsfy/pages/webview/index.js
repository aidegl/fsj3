// pages/webview/index.js - WebView 页面
const app = getApp();

Page({
  data: {
    url: '',
    webviewKey: 0  // 用于强制 webview 重建
  },

  // ========== 开发测试：切换到本地 webview ==========
  USE_DEV_URL: true,
  DEV_URL: 'https://100000whys.cn/fsj_webview2.0/?shangjia=f009cda3-cc49-400d-82cd-cbe79ee8892f&v=2.0.9',
  // =================================================

  onLoad: function (o) {
    console.log('[Webview] onLoad:', JSON.stringify(o));
    // 如果是 reset 请求，确保 openid 已清除
    if (o && o._reset) {
      app.globalData.openid = '';
      wx.removeStorageSync('openid');
      console.log('[Webview] reset 模式，清除 openid');
    }
    this.loadWebview(o);
  },

  onShow: function () {
    var currentUrl = this.data.url;
    if (!currentUrl) {
      console.log('[Webview] url 未设置，跳过 onShow 处理');
      return;
    }

    // 检查是否有支付结果需要通知
    var payResult = getApp().globalData.lastPaymentResult;
    if (payResult) {
      console.log('[Webview] onShow: 检测到支付结果, 成功:', payResult.success);
      // 写入 storage，H5 可通过 Bridge 读取
      wx.setStorageSync('fsj_paymentResult', JSON.stringify(payResult));
      getApp().globalData.lastPaymentResult = null;

      // 用 _pay 参数强制 webview 重载，确保 H5 页面重新初始化
      var baseUrl = currentUrl.split('#')[0];
      var sep = baseUrl.indexOf('?') === -1 ? '?' : '&';
      var reloadUrl = baseUrl + sep + '_pay=' + encodeURIComponent(JSON.stringify(payResult)) + '&_ts=' + Date.now();
      this.setData({ url: reloadUrl });
      console.log('[Webview] 已通过 URL 参数通知支付结果给 H5');
      return;
    }

    var openid = app.globalData.openid || wx.getStorageSync('openid') || '';
    if (openid && currentUrl.indexOf('openId=') === -1) {
      // 登录后回来：用 redirectTo 重建全新页面实例
      console.log('[Webview] onShow: 登录后回来，redirectTo 重建');
      var baseUrl = currentUrl.split('#')[0];
      var newUrl = baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') + 'openId=' + openid + '&_ts=' + Date.now();
      wx.redirectTo({
        url: '/pages/webview/index?url=' + encodeURIComponent(newUrl) + '&_login=' + Date.now()
      });
    }
  },

  /** 强制重新加载 webview：先隐藏 → 再显示新 URL */
  forceReload: function (newUrl) {
    console.log('[Webview] forceReload:', newUrl);
    var self = this;
    // 先隐藏 webview 并清空 URL
    this.setData({ webviewKey: Date.now(), url: '' });
    // 等一小段时间确保 webview 完全销毁
    setTimeout(function () {
      // 设置新 URL 并重新显示
      self.setData({ webviewKey: Date.now(), url: newUrl });
      console.log('[Webview] forceReload 完成');
    }, 1000);
  },

  loadWebview: function (o) {
    var url = '';
    var openid = app.globalData.openid || wx.getStorageSync('openid') || '';

    // 优先使用传入的 url 参数
    if (o && o.url) {
      url = decodeURIComponent(o.url);
      console.log('[Webview] 使用传入的 url:', url);
    }

    if (!url && this.USE_DEV_URL) {
      console.log('[Webview] 开发模式 - 使用本地 URL');
      url = this.DEV_URL;
    }

    if (!url) {
      var base = 'https://100000whys.cn/fsj_webview2.0/?shangjia=f009cda3-cc49-400d-82cd-cbe79ee8892f&v=2.0.9';
      url = base + '?v=' + Date.now() + '&_r=' + Math.random().toString(36).substr(2, 8);
    }

    // 如果还没有 openId，注入进去
    if (openid && url.indexOf('openId=') === -1) {
      var baseUrl2 = url.split('#')[0];
      url = baseUrl2 + (baseUrl2.indexOf('?') === -1 ? '?' : '&') + 'openId=' + openid;
      console.log('[Webview] loadWebview: 注入 openId 到 URL:', openid);
    }

    // 如果传入参数中有 openid 但 globalData 还没有，同步
    if (o && o.openid && !openid) {
      app.globalData.openid = o.openid;
      wx.setStorageSync('openid', o.openid);
      var baseUrl3 = url.split('#')[0];
      url = baseUrl3 + (baseUrl3.indexOf('?') === -1 ? '?' : '&') + 'openId=' + o.openid;
    }

    this.setData({ url: url });
    console.log('[Webview] 最终 URL:', url);
  },

  // 接收 H5 webview 发来的消息
  onMessage: function (e) {
    var dataList = e.detail.data || [];
    console.log('[Webview] onMessage 被触发, 消息条数:', dataList.length);
    console.log('[Webview] 消息内容:', JSON.stringify(dataList));
    for (var i = 0; i < dataList.length; i++) {
      var msg = dataList[i];
      if (!msg) continue;

      console.log('[Webview] 处理消息 type:', msg.type);

      if (msg.type === 'requestLogin') {
        wx.navigateTo({
          url: '/pages/login/index',
          success: function () {
            console.log('[WebView] 已跳转到登录页');
          }
        });
        return;
      }
      if (msg.type === 'logout') {
        app.globalData.openid = '';
        wx.removeStorageSync('openid');
        console.log('[WebView] 退出登录，reLaunch 重启小程序');
        // 用 reLaunch 完全重启，确保所有页面状态清除
        wx.reLaunch({
          url: '/pages/webview/index?_reset=' + Date.now()
        });
        return;
      }
      if (msg.type === 'requestOpenid') {
        var openid = app.globalData.openid || wx.getStorageSync('openid') || '';
        console.log('[WebView] SPA 请求 openid，返回:', openid);
        if (openid) {
          var currentUrl = this.data.url;
          if (currentUrl && currentUrl.indexOf('openId=') === -1) {
            var baseUrl = currentUrl.split('#')[0];
            var newUrl = baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') + 'openId=' + openid + '&_ts=' + Date.now();
            console.log('[WebView] redirectTo 返回 openid, URL:', newUrl);
            wx.redirectTo({
              url: '/pages/webview/index?url=' + encodeURIComponent(newUrl) + '&_login=' + Date.now()
            });
          }
        }
        return;
      }
      if (msg.type === 'h5Debug') {
        console.log('[H5调试]', JSON.stringify(msg));
        return;
      }
      if (msg.type === 'setNavigationBarTitle' && msg.title) {
        wx.setNavigationBarTitle({ title: msg.title });
        return;
      }
      if (msg.type === 'doPayment') {
        console.log('[Webview] 收到 doPayment 消息, data:', JSON.stringify(msg.data));
        // 兼容旧方式：直接传 pay_params
        if (msg.data.pay_params) {
          console.log('[Webview] 旧方式：直接传 pay_params');
          this.doWechatPay(msg.data.pay_params);
        } else {
          // 新方式：传 body 和 total_fee，由小程序端统一下单
          console.log('[Webview] 新方式：调用 createOrderAndPay');
          this.createOrderAndPay(msg.data);
        }
        return;
      }
    }
  },

  // 向 webview 发送消息
  postMessageToWebview: function (type, data) {
    this.sendMsgToWebview({ type: type, data: data });
  },

  // 统一下单 + 拉起支付（小程序端调用，保护商户密钥）
  createOrderAndPay: function (orderInfo) {
    var self = this;
    var payConfig = app.globalData.payConfig;
    var openid = app.globalData.openid || wx.getStorageSync('openid') || '';

    console.log('[Pay] createOrderAndPay 开始, orderInfo:', JSON.stringify(orderInfo));
    console.log('[Pay] payConfig.mch_id:', payConfig.mch_id ? '已设置(' + payConfig.mch_id + ')' : '未设置(空)');
    console.log('[Pay] payConfig.api_key:', payConfig.api_key ? '已设置' : '未设置(空)');
    console.log('[Pay] openid:', openid || '(空)');

    if (!payConfig.mch_id || !payConfig.api_key) {
      console.error('[Pay] 商户支付配置未设置');
      this.postMessageToWebview('paymentResult', { success: false, error: '商户配置未设置，请在 app.js 配置 payConfig' });
      return;
    }

    var orderNo = 'ORDER' + Date.now() + Math.random().toString(36).substr(2, 4).toUpperCase();
    console.log('[Pay] 订单号:', orderNo);

    var requestData = {
      appid: payConfig.appid,
      mch_id: payConfig.mch_id,
      api_key: payConfig.api_key,
      openid: openid,
      out_trade_no: orderNo,
      body: (orderInfo.body || '商品购买').replace('盒子价先享后付', '先享后付'),
      total_fee: orderInfo.total_fee || 1,
      spbill_create_ip: '127.0.0.1',
      notify_url: 'https://100000whys.cn/fsj/api/pay/notify'
    };
    console.log('[Pay] 请求统一下单, data:', JSON.stringify(requestData));

    wx.request({
      url: 'https://100000whys.cn/api/pay/unified',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: requestData,
      success: function (res) {
        console.log('[Pay] 统一下单返回, statusCode:', res.statusCode);
        console.log('[Pay] 统一下单返回 body:', JSON.stringify(res.data));
        if (res.data && res.data.code === 200 && res.data.data && res.data.data.pay_params) {
          console.log('[Pay] 下单成功，拉起支付');
          self.doWechatPay(res.data.data.pay_params);
        } else {
          var errMsg = '下单失败: ' + (res.data && res.data.message || '未知错误');
          console.error('[Pay]', errMsg);
          self.postMessageToWebview('paymentResult', { success: false, error: errMsg });
        }
      },
      fail: function (err) {
        console.error('[Pay] 统一下单请求失败:', JSON.stringify(err));
        self.postMessageToWebview('paymentResult', { success: false, error: '网络异常: ' + (err.errMsg || '') });
      }
    });
  },

  // 拉起微信支付
  doWechatPay: function (payParams) {
    var self = this;
    console.log('[Pay] doWechatPay 被调用, payParams:', JSON.stringify(payParams));
    wx.requestPayment({
      ...payParams,
      success: function () {
        console.log('[Pay] 支付成功');
        self.postMessageToWebview('paymentResult', { success: true });
      },
      fail: function (err) {
        var isCancel = err.errMsg && err.errMsg.indexOf('cancel') > -1;
        console.log('[Pay] 支付失败/取消:', err.errMsg, 'isCancel:', isCancel);
        self.postMessageToWebview('paymentResult', {
          success: false,
          error: isCancel ? '用户取消支付' : (err.errMsg || '支付失败')
        });
      }
    });
  },

  sendMsgToWebview: function (msg) {
    var currentUrl = this.data.url;
    if (currentUrl) {
      var baseUrl = currentUrl.split('#')[0];
      var newUrl = baseUrl + '#msg=' + encodeURIComponent(JSON.stringify(msg));
      this.setData({ url: newUrl });
    }
  },

  onWebviewLoad: function () {
    console.log('[Webview] 加载完成');
  },

  onShareAppMessage: function () {
    return {
      title: '',
      path: '/pages/webview/index'
    };
  }
});
