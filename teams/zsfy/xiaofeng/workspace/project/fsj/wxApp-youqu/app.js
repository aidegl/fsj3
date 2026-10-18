// wxApp - webview 壳小程序

App({
  globalData: {
    openid: '',
    userId: '',
    userInfo: null,
    webviewUrl: '',
    // 微信支付商户配置（统一单商家模式）
    payConfig: {
      appid: 'wx022fc6b610cfa5b4',   // 小程序 AppID
      mch_id: '1709556093',                    // 商户号（10位数字）
      api_key: 'shuxiaohe022577wuweiqiluanyunshu'                    // 商户 API 密钥（32位字符串）
    }
  },

  onLaunch() {
    console.log('[App] onLaunch 启动');
    this.checkLogin();
    this.globalData.webviewUrl = this.buildWebviewUrl();
  },

  // 检查登录状态
  checkLogin() {
    console.log('[App] 检查登录状态');
    const openid = wx.getStorageSync('openid');
    if (openid) {
      this.globalData.openid = openid;
      console.log('[App] 从缓存恢复 openid:', openid);
      this.globalData.webviewUrl = this.buildWebviewUrl();
    } else {
      console.log('[App] 未找到缓存 openid');
    }
  },

  // 构建 webview URL（带身份信息和缓存破坏）
  buildWebviewUrl(forceRefresh) {
    const baseUrl = 'https://100000whys.cn/fsj_webview2.0/?shangjia=9cb358a8-620a-4fc7-970a-cf10aa2173d9';
    const v = Date.now();
    const r = Math.random().toString(36).substr(2, 8);
    let url = `${baseUrl}?v=${v}&_r=${r}${forceRefresh ? '&_ts=' + v : ''}`;

    // 通过 hash 传递身份信息
    if (this.globalData.openid) {
      url += `#openid=${this.globalData.openid}`;
    }
    console.log('[App] 构建 webview URL:', url);
    return url;
  },

  // 登录（参考 sxz 项目成功经验，使用回调式）
  login() {
    console.log('[App] ===== 登录流程开始 =====');

    const self = this;

    return new Promise(function (resolve) {
      console.log('[App] 步骤1: 调用 wx.login()');

      wx.login({
        success: function (loginRes) {
          console.log('[App] 步骤1 wx.login 成功, loginRes:', JSON.stringify(loginRes));

          if (!loginRes.code) {
            console.error('[App] 步骤1 失败: 没有获取到 code');
            resolve({ success: false, error: '获取登录码失败' });
            return;
          }
          console.log('[App] 步骤2: 准备请求后端 code2session, code:', loginRes.code);

          // 调用后端 code2session 接口
          wx.request({
            url: 'https://100000whys.cn/fsj/api/user/code2session',
            method: 'POST',
            header: { 'Content-Type': 'application/json' },
            data: { code: loginRes.code, appid: 'wxef28e4600201b359', secret: '24ebdf5b5b2cd7c6697d782ca1ba019a' },
            success: function (res) {
              console.log('[App] 步骤2 后端返回 statusCode:', res.statusCode);
              console.log('[App] 步骤2 后端返回 body:', JSON.stringify(res.data));

              if (res.data && res.data.code === 200 && res.data.data && res.data.data.user && res.data.data.user.openid) {
                const openid = res.data.data.user.openid;
                console.log('[App] 步骤2 成功, openid:', openid);

                // 保存登录状态
                self.globalData.openid = openid;
                wx.setStorageSync('openid', openid);
                self.globalData.webviewUrl = self.buildWebviewUrl();

                console.log('[App] ===== 登录成功 =====');
                resolve({ success: true, openid: openid });
              } else {
                console.error('[App] 步骤2 失败, 返回非预期格式:', res.data);
                var errMsg = res.data && res.data.message ? res.data.message : 'code2session 返回格式异常';
                resolve({ success: false, error: errMsg });
              }
            },
            fail: function (err) {
              console.error('[App] 步骤2 网络请求失败:', JSON.stringify(err));
              resolve({ success: false, error: '网络请求失败: ' + (err.errMsg || '') });
            }
          });
        },
        fail: function (err) {
          console.error('[App] 步骤1 wx.login 失败:', JSON.stringify(err));
          resolve({ success: false, error: 'wx.login 失败: ' + (err.errMsg || '') });
        }
      });
    });
  },

  // 退出登录
  logout() {
    console.log('[App] 退出登录');
    this.globalData.openid = '';
    this.globalData.userId = '';
    this.globalData.userInfo = null;
    this.globalData.webviewUrl = '';
    wx.removeStorageSync('openid');
    wx.removeStorageSync('userInfo');
  }
});
