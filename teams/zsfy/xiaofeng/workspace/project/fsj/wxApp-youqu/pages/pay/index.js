// pages/pay/index.js - 支付页面（微信官方API，仅处理支付，不创建订单）
const app = getApp();
const paySign = require('../../utils/pay-sign');

Page({
  data: {
    body: '',
    totalFee: 0,
    yuanAmount: '0.00',
    loading: false
  },

  onLoad: function (options) {
    console.log('[Pay] 支付页面 onLoad, options:', JSON.stringify(options));
    var body = decodeURIComponent(options.body || '');
    // 将"盒子价先享后付"替换为"先享后付"
    body = body.replace('盒子价先享后付', '先享后付');
    var fee = parseInt(options.fee) || 1;
    var yuan = (fee / 100).toFixed(2);

    console.log('[Pay] 商品:', body, ', 金额(分):', fee, ', 金额(元):', yuan);

    this.setData({
      body: body,
      totalFee: fee,
      yuanAmount: yuan
    });
  },

  // 确认支付按钮
  handlePay: function () {
    var self = this;
    if (this.data.loading) return;

    console.log('[Pay] 点击确认支付');
    this.setData({ loading: true });

    var payConfig = app.globalData.payConfig;
    var openid = app.globalData.openid || wx.getStorageSync('openid') || '';

    console.log('[Pay] payConfig.mch_id:', payConfig.mch_id ? '已设置(' + payConfig.mch_id.substring(0, 4) + '...)' : '未设置');
    console.log('[Pay] payConfig.api_key:', payConfig.api_key ? '已设置' : '未设置');
    console.log('[Pay] openid:', openid || '(空)');

    if (!payConfig.mch_id || !payConfig.api_key) {
      console.error('[Pay] 商户支付配置未设置');
      this.setData({ loading: false });
      wx.showModal({
        title: '配置错误',
        content: '商户支付配置未设置，请在 app.js 中配置 payConfig.mch_id 和 payConfig.api_key',
        showCancel: false
      });
      return;
    }

    if (!openid) {
      console.error('[Pay] openid 为空');
      this.setData({ loading: false });
      wx.showModal({
        title: '登录状态异常',
        content: '未获取到用户 openid，请重新登录',
        showCancel: false
      });
      return;
    }

    var orderNo = 'ORDER' + Date.now() + Math.random().toString(36).substr(2, 4).toUpperCase();
    var timeStamp = String(Math.floor(Date.now() / 1000));
    console.log('[Pay] 订单号:', orderNo);

    // 构建统一下单参数（微信官方API要求）
    var orderParams = {
      appid: payConfig.appid,
      mch_id: payConfig.mch_id,
      nonce_str: Math.random().toString(36).substr(2, 32),
      body: this.data.body,
      out_trade_no: orderNo,
      total_fee: String(this.data.totalFee),
      spbill_create_ip: '127.0.0.1',
      notify_url: 'https://100000whys.cn/fsj/api/pay/notify',
      trade_type: 'JSAPI',
      openid: openid
    };

    // 签名
    var sign = paySign.createSign(orderParams, payConfig.api_key);
    orderParams.sign = sign;
    console.log('[Pay] 统一下单签名:', sign);

    // 构建 XML 请求体
    var xmlBody = paySign.buildUnifiedOrderXml(orderParams);
    console.log('[Pay] 统一下单 XML:', xmlBody);

    // 调用微信官方统一下单API
    wx.request({
      url: 'https://api.mch.weixin.qq.com/pay/unifiedorder',
      method: 'POST',
      header: { 'Content-Type': 'application/xml' },
      data: xmlBody,
      success: function (res) {
        console.log('[Pay] 微信统一下单返回, statusCode:', res.statusCode);
        console.log('[Pay] 微信统一下单 XML 响应:', res.data);

        if (res.statusCode === 200) {
          var xmlData = paySign.parseXmlResponse(res.data);
          console.log('[Pay] 解析后响应:', JSON.stringify(xmlData));

          if (xmlData.return_code === 'SUCCESS' && xmlData.result_code === 'SUCCESS' && xmlData.prepay_id) {
            console.log('[Pay] 统一下单成功, prepay_id:', xmlData.prepay_id);

            // 构建 wx.requestPayment 参数
            var payParams = {
              appId: payConfig.appid,
              timeStamp: timeStamp,
              nonceStr: orderParams.nonce_str,
              package: 'prepay_id=' + xmlData.prepay_id,
              signType: 'MD5'
            };

            // 二次签名
            var paySignStr = paySign.createSign(payParams, payConfig.api_key);
            payParams.paySign = paySignStr;
            console.log('[Pay] 支付签名:', paySignStr);

            self.doWechatPay(payParams);
          } else {
            var errMsg = xmlData.err_code_des || xmlData.return_msg || '下单失败';
            console.error('[Pay]', errMsg, 'XML:', JSON.stringify(xmlData));
            self.setData({ loading: false });
            wx.showToast({ title: errMsg, icon: 'error' });
          }
        } else {
          console.error('[Pay] 请求异常, statusCode:', res.statusCode);
          self.setData({ loading: false });
          wx.showToast({ title: '请求异常', icon: 'error' });
        }
      },
      fail: function (err) {
        console.error('[Pay] 统一下单请求失败:', JSON.stringify(err));
        self.setData({ loading: false });
        wx.showToast({ title: '网络异常: ' + err.errMsg, icon: 'error' });
      }
    });
  },

  // 拉起微信支付
  doWechatPay: function (payParams) {
    var self = this;
    console.log('[Pay] wx.requestPayment 参数:', JSON.stringify(payParams));

    wx.requestPayment({
      ...payParams,
      success: function () {
        console.log('[Pay] 支付成功');
        // 盒子页面需要读取此标记来判断支付是否成功
        wx.setStorageSync('hezi_payResult', 'success');
        getApp().globalData.lastPaymentResult = {
          success: true,
          // 订单创建所需数据
          body: self.data.body,
          amount: self.data.yuanAmount,
          totalFee: self.data.totalFee,
          _needCreateOrder: true
        };
        wx.showToast({ title: '支付成功', icon: 'success' });
        setTimeout(function () {
          wx.navigateBack({ delta: 1 });
        }, 1500);
      },
      fail: function (err) {
        var isCancel = err.errMsg && err.errMsg.indexOf('cancel') > -1;
        console.log('[Pay] 支付失败/取消:', err.errMsg, 'isCancel:', isCancel);
        // 盒子页面需要读取此标记来判断支付是否成功
        wx.setStorageSync('hezi_payResult', 'failed');
        getApp().globalData.lastPaymentResult = {
          success: false,
          error: isCancel ? '用户取消支付' : (err.errMsg || '支付失败')
        };
        self.setData({ loading: false });
        if (isCancel) {
          wx.showToast({ title: '已取消支付', icon: 'none' });
        } else {
          wx.showToast({ title: '支付失败: ' + err.errMsg, icon: 'error' });
        }
        setTimeout(function () {
          wx.navigateBack({ delta: 1 });
        }, 1500);
      }
    });
  }
});
