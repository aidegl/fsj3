/**
 * 小程序通信桥接层
 * 统一处理小程序与 WebView 之间的通信
 */
(function () {
  'use strict';

  var Bridge = {
    // 是否为小程序环境
    isMiniProgram: false,

    /**
     * 初始化桥接
     */
    init: function () {
      var ua = navigator.userAgent.toLowerCase();
      this.isMiniProgram = ua.indexOf('miniprogram') > -1 || ua.indexOf('micromessenger') > -1;

      console.log('[Bridge] === 初始化环境检测 ===');
      console.log('[Bridge]   userAgent:', navigator.userAgent);
      console.log('[Bridge]   typeof window.wx:', typeof window.wx);
      console.log('[Bridge]   wx.miniProgram 存在:', !!(window.wx && window.wx.miniProgram));
      if (window.wx && window.wx.miniProgram) {
        console.log('[Bridge]   wx.miniProgram.navigateTo 存在:', typeof wx.miniProgram.navigateTo === 'function');
        console.log('[Bridge]   wx.miniProgram.postMessage 存在:', typeof wx.miniProgram.postMessage === 'function');
      }
      console.log('[Bridge]   最终 isMiniProgram:', this.isMiniProgram);
      console.log('[Bridge] === 环境检测结束 ===');

      if (this.isMiniProgram) {
        this.bindMessage();
      }

      // 主动检测 wx SDK 是否加载（每 200ms 检查一次，最多 50 次）
      var self = this;
      var checkCount = 0;
      var checkTimer = setInterval(function () {
        checkCount++;
        if (window.wx && window.wx.miniProgram) {
          console.log('[Bridge] 第 ' + checkCount + ' 次检测：wx.miniProgram 已加载！');
          self.isMiniProgram = true;
          clearInterval(checkTimer);
          return;
        }
        if (checkCount >= 50) {
          console.log('[Bridge] 第 ' + checkCount + ' 次检测：wx.miniProgram 仍未加载，停止检测');
          clearInterval(checkTimer);
        }
      }, 200);
    },

    /**
     * 接收小程序消息
     */
    bindMessage: function () {
      var self = this;
      if (typeof wx !== 'undefined' && wx.miniProgram) {
        wx.miniProgram.getEnv(function (res) {
          if (res.miniprogram) {
            self.isMiniProgram = true;
          }
        });
      }

      // 监听小程序发来的消息
      window.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'loginSuccess') {
          self.handleLoginSuccess(e.data.data);
        }
        if (e.data && e.data.type === 'imagePickResult') {
          if (self._imagePickCallback) {
            self._imagePickCallback(e.data.data);
            self._imagePickCallback = null;
          }
        }
      });
    },

    /**
     * 向小程序发送消息
     * @param {string} type - 消息类型
     * @param {object} data - 消息数据
     */
    postMessage: function (type, data) {
      var payload = {
        type: type,
        data: data || {}
      };
      console.log('[Bridge] postMessage 被调用, type:', type, ', isMiniProgram:', this.isMiniProgram);

      if (this.isMiniProgram && typeof wx !== 'undefined' && wx.miniProgram) {
        console.log('[Bridge] 调用 wx.miniProgram.postMessage, payload:', JSON.stringify(payload));
        wx.miniProgram.postMessage({ data: payload });
        console.log('[Bridge] wx.miniProgram.postMessage 调用完成');
      } else {
        console.log('[Bridge] 非小程序环境，发送自定义事件');
        window.dispatchEvent(new CustomEvent('bridge-post', { detail: payload }));
        console.log('[Bridge] postMessage:', payload);
      }
    },

    /**
     * 设置导航栏标题
     * @param {string} title
     */
    setNavigationBarTitle: function (title) {
      if (this.isMiniProgram && typeof wx !== 'undefined' && wx.miniProgram) {
        wx.miniProgram.postMessage({
          data: { type: 'setNavigationBarTitle', title: title }
        });
      }
    },

    /**
     * 返回上一页
     */
    navigateBack: function () {
      if (this.isMiniProgram && typeof wx !== 'undefined' && wx.miniProgram) {
        wx.miniProgram.navigateBack();
      } else {
        history.back();
      }
    },

    /**
     * 登录请求
     */
    requestLogin: function (loginType) {
      console.log('[Bridge] requestLogin 被调用, loginType:', loginType);
      console.log('[Bridge] 当前 window.wx:', typeof window.wx);
      console.log('[Bridge] 当前 wx.miniProgram:', !!(window.wx && window.wx.miniProgram));

      // 直接检测 wx.miniProgram，不依赖 isMiniProgram 标记
      if (window.wx && window.wx.miniProgram && typeof wx.miniProgram.navigateTo === 'function') {
        console.log('[Bridge] 执行 wx.miniProgram.navigateTo, url: /pages/login/index');
        wx.miniProgram.navigateTo({ url: '/pages/login/index' });
      } else {
        console.log('[Bridge] wx.miniProgram 不可用，通过自定义事件通知');
        this.postMessage('requestLogin', { loginType: loginType });
      }
    },

    /**
     * 登录成功回调
     * @param {object} loginData - 登录返回数据 { rowid, name, shangjia, agent }
     */
    handleLoginSuccess: function (loginData) {
      if (loginData.rowid) {
        localStorage.setItem('fsj_token', loginData.rowid);
      }
      if (loginData.name) {
        localStorage.setItem('fsj_user_name', loginData.name);
      }
      if (loginData.shangjia) {
        localStorage.setItem('fsj_shangjia_tabs', JSON.stringify(loginData.shangjia));
      }
      if (loginData.icons) {
        localStorage.setItem('fsj_shangjia_icons', JSON.stringify(loginData.icons));
      }
      if (loginData.agent) {
        localStorage.setItem('fsj_agent_id', loginData.agent);
      }
      if (loginData.shuohua) {
        localStorage.setItem('fsj_shuohua_id', loginData.shuohua);
      }
      if (loginData.bushuohua) {
        localStorage.setItem('fsj_bushuohua_id', loginData.bushuohua);
      }

      // 通知 App 重新渲染 TabBar
      if (window.App && window.App.updateTabBar) {
        window.App.updateTabBar(loginData.shangjia, loginData.icons);
      }

      // 触发登录变更事件，通知其他模块（如 OrdersPage）
      window.dispatchEvent(new CustomEvent('wechatlogin:change', {
        detail: {
          type: 'login',
          isLoggedIn: true,
          userInfo: { name: loginData.name, id: loginData.rowid }
        }
      }));

      // 刷新我的页面
      if (window.ProfilePage) {
        window.ProfilePage.renderUserCard();
        window.ProfilePage.renderSettingsList();
      }

      // 刷新智能体页面
      if (window.AgentPage) {
        window.AgentPage.renderAgentTopBar();
      }
    },

    /**
     * 切换智能体
     */
    switchAgent: function (agentId) {
      this.postMessage('switchAgent', { agentId: agentId });
    },

    /**
     * 通知小程序发起支付（绕过 postMessage 缓冲延迟）
     * @param {object} orderInfo - { body, total_fee, items: [{ productRowid, name, shuliang, tejia, shoujia, goumaijia }] }
     */
    doPayment: function (orderInfo) {
      if (window.logDebug) window.logDebug('[Bridge] doPayment 被调用, body: ' + (orderInfo.body || '') + ', fee: ' + (orderInfo.total_fee || 1));
      console.log('[Bridge] doPayment 被调用, orderInfo:', JSON.stringify(orderInfo));

      // 保存收货地址全称（下单时用户选中的地址），供 app.js 创建订单时使用
      if (orderInfo.addressDzqc) {
        localStorage.setItem('fsj_selectedAddressDzqc', orderInfo.addressDzqc);
        console.log('[Bridge] 已保存收货地址全称:', orderInfo.addressDzqc);
      }

      // 如果有商品明细，先存到 localStorage，等支付成功后恢复
      if (orderInfo.items && Array.isArray(orderInfo.items) && orderInfo.items.length > 0) {
        var pendingOrder = {
          body: orderInfo.body,
          totalFee: orderInfo.total_fee,
          items: orderInfo.items
        };
        localStorage.setItem('fsj_pendingOrder', JSON.stringify(pendingOrder));
        console.log('[Bridge] 已保存待支付订单明细到 localStorage');
      }

      if (window.wx && window.wx.miniProgram && typeof wx.miniProgram.navigateTo === 'function') {
        var shangjiaRowid = localStorage.getItem('fsj_shangjia_rowid') || '';
        var params = 'body=' + encodeURIComponent(orderInfo.body || '') + '&fee=' + (orderInfo.total_fee || 1);
        if (shangjiaRowid) params += '&shangjia=' + encodeURIComponent(shangjiaRowid);
        var url = '/pages/pay/index?' + params;
        if (window.logDebug) window.logDebug('[Bridge] 调用 navigateTo, url: ' + url);
        console.log('[Bridge] 正在调用 wx.miniProgram.navigateTo, url:', url);
        wx.miniProgram.navigateTo({
          url: url,
          success: function () {
            if (window.logDebug) window.logDebug('[Bridge] navigateTo 成功');
            console.log('[Bridge] navigateTo 成功');
          },
          fail: function (err) {
            if (window.logDebug) window.logDebug('[Bridge] navigateTo 失败: ' + JSON.stringify(err));
            console.log('[Bridge] navigateTo 失败:', JSON.stringify(err));
          }
        });
      } else {
        if (window.logDebug) window.logDebug('[Bridge] wx.miniProgram 不可用，走 postMessage 降级');
        console.log('[Bridge] wx.miniProgram 不可用，走 postMessage 降级');
        this.postMessage('doPayment', orderInfo);
      }
    },

    /**
     * 通知小程序查余额（需要小程序端配合）
     * @param {string} openid - 用户 openid
     */
    getBalance: function (openid) {
      this.postMessage('getBalance', { openid: openid });
    },

    /**
     * 监听支付结果回调
     * @param {function} callback - 支付结果回调，参数为 { success: boolean, error?: string }
     */
    onPaymentResult: function (callback) {
      var self = this;
      window.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'paymentResult') {
          callback(e.data.data);
        }
      });
    },

    /**
     * 请求小程序选择图片
     * @param {function} callback - 回调，参数为 { success: boolean, url?: string, error?: string }
     */
    requestChooseImage: function (callback) {
      if (window.logDebug) window.logDebug('[Bridge] requestChooseImage 被调用');
      console.log('[Bridge] requestChooseImage 被调用, wx:', typeof window.wx, ', miniProgram:', !!(window.wx && window.wx.miniProgram));

      // 直接检测 wx.miniProgram
      if (window.wx && window.wx.miniProgram && typeof wx.miniProgram.navigateTo === 'function') {
        console.log('[Bridge] 执行 wx.miniProgram.navigateTo, url: /pages/choose-image/index');
        // 保存图片选择回调
        this._imagePickCallback = callback;
        wx.miniProgram.navigateTo({
          url: '/pages/choose-image/index',
          success: function () {
            console.log('[Bridge] navigateTo 成功');
          },
          fail: function (err) {
            console.log('[Bridge] navigateTo 失败:', JSON.stringify(err));
            if (callback) callback({ success: false, error: '无法打开图片选择' });
          }
        });
      } else {
        console.log('[Bridge] wx.miniProgram 不可用，降级为 input file');
        // 非小程序环境降级：用 input file
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = function (e) {
          var file = e.target.files[0];
          if (!file) { if (callback) callback({ success: false }); return; }
          var reader = new FileReader();
          reader.onload = function () {
            if (callback) callback({ success: true, url: reader.result });
          };
          reader.readAsDataURL(file);
        };
        input.click();
      }
    },

    /**
     * 设置图片选择回调（由小程序端调用）
     */
    setImagePickCallback: function (callback) {
      this._imagePickCallback = callback;
    }
  };

  // 初始化
  Bridge.init();

  // 暴露到全局
  window.Bridge = Bridge;
})();
