// pages/login/index.js
const app = getApp();

Page({
  data: {
    loginLoading: false,
    agreed: false // 是否已同意协议（默认未勾选）
  },

  /**
   * 切换协议勾选状态
   */
  toggleAgreement() {
    this.setData({ agreed: !this.data.agreed });
  },

  /**
   * 打开用户协议页面
   */
  openUserAgreement() {
    wx.navigateTo({ url: '/pages/user-agreement/index' });
  },

  /**
   * 打开隐私政策页面
   */
  openPrivacyPolicy() {
    wx.navigateTo({ url: '/pages/privacy-policy/index' });
  },

  handleLogin() {
    console.log('[LoginPage] handleLogin 被调用');

    // 检查是否已勾选协议
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意协议', icon: 'none' });
      return;
    }

    if (this.data.loginLoading) {
      console.log('[LoginPage] 加载中，忽略重复点击');
      return;
    }

    console.log('[LoginPage] 准备调用 app.login()');
    this.setData({ loginLoading: true });
    wx.showLoading({ title: '登录中...' });

    const self = this;
    app.login().then(function (res) {
      console.log('[LoginPage] app.login() 返回:', JSON.stringify(res));

      wx.hideLoading();
      self.setData({ loginLoading: false });

      if (res.success) {
        console.log('[LoginPage] 登录成功，openid:', res.openid);

        // 保存 openid 到小程序全局和 storage
        app.globalData.openid = res.openid;
        wx.setStorageSync('openid', res.openid);

        wx.showToast({ title: '登录成功', icon: 'success' });

        // 返回上一页（原来的 webview 页面）
        // webview 的 onShow 会检测到 globalData.openid 并自动 redirect 带 openId 的 URL
        setTimeout(function () {
          var pages = getCurrentPages();
          console.log('[LoginPage] 登录成功前的页面栈:', pages.length, '页');
          console.log('[LoginPage] 上一页路由:', pages.length > 1 ? pages[pages.length - 2].route : '无');

          wx.navigateBack({
            delta: 1,
            success: function () {
              console.log('[LoginPage] 已 navigateBack 返回');
            },
            fail: function (err) {
              console.log('[LoginPage] navigateBack 失败，降级 redirectTo');
              wx.redirectTo({
                url: '/pages/webview/index?openId=' + res.openid + '&_ts=' + Date.now(),
              });
            }
          });
        }, 1000);
      } else {
        console.error('[LoginPage] 登录失败:', res.error);
        wx.showToast({ title: res.error || '登录失败', icon: 'none' });
      }
    }).catch(function (err) {
      console.error('[LoginPage] app.login() 异常:', err);
      wx.hideLoading();
      self.setData({ loginLoading: false });
      wx.showToast({ title: '登录异常: ' + (err.message || ''), icon: 'none' });
    });
  },

  /**
   * 暂不登录，返回上一页
   */
  handleSkipLogin() {
    wx.navigateBack({
      delta: 1,
      fail: function () {
        wx.redirectTo({ url: '/pages/webview/index' });
      }
    });
  }
});
