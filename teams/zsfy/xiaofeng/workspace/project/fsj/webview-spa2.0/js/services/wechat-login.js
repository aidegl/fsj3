/**
 * 微信登录服务
 * 负责 webview 与小程序之间的登录通信
 *
 * 流程：
 * 1. 用户在 webview 点击登录 → 跳转小程序登录页
 * 2. 小程序完成微信授权 → 拿到 openid
 * 3. 小程序返回 webview（带 #openid=xxx hash）
 * 4. 本模块监听 hash 变化 → 明道云查询/创建用户
 */
var WechatLoginService = {
  /**
   * 配置
   */
  config: {
    // 小程序登录页面路径
    miniProgramLoginUrl: '/pages/login/index',
    // 小程序退出登录页面路径
    miniProgramLogoutUrl: '/pages/login/index',
    // 明道云用户表 worksheetId
    mingdaoWorksheetId: '69b5db58a606df9d8178a03d',
    // 明道云 openid 字段 ID
    openidField: '69b5db58a606df9d8178a03e',
    // 默认头像
    defaultAvatar: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjY2NjIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PGNpcmNsZSBjeD0iMTIiIGN5PSI4IiByPSI0Ii8+PHBhdGggZD0iTTIwIDIxdi0yYTQgNCAwIDAgMC00LTRoLThhNCA0IDAgMCAwLTQgNHYyIi8+PC9zdmc+',
  },

  /**
   * 内部状态
   */
  state: {
    isLoggedIn: false,
    userInfo: null,
    openid: null,
    _cancelled: false, // 用户关闭登录弹窗时设为 true，阻止后台自动登录
  },

  /**
   * 初始化：优先从 localStorage 恢复登录状态
   */
  init: function () {
    var self = this;
    logDebug('=== WechatLogin.init 开始 ===');
    logDebug('URL: ' + window.location.href.substring(0, 200));

    // 第一步：尝试从 localStorage 恢复登录状态（最快、最可靠）
    this.restoreFromLocalStorage();
    logDebug('init 后状态: isLoggedIn=' + this.state.isLoggedIn + ', openid=' + this.state.openid);

    // 第二步：检查 hash 中是否有新登录的 openid（首次加载时）
    this.handleAuthLogic();

    logDebug('handleAuthLogic 完成');

    // 第三步：监听 hash 变化（小程序返回时触发）
    window.addEventListener('hashchange', function () {
      logDebug('=== hashchange 触发 ===');
      // 重置 openidRequested，允许 hashchange 后重新请求
      self._openidRequested = false;
      self.handleAuthLogic();
    });

    // 额外检测：页面可见性变化时重新检查（小程序切回来时）
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        logDebug('=== 页面恢复可见，重新检查登录状态 ===');
        self._openidRequested = false;
        self.handleAuthLogic();
      }
    });
  },

  /**
   * 从 localStorage 恢复登录状态（优先使用）
   */
  restoreFromLocalStorage: function () {
    var storedOpenid = localStorage.getItem('fsj_openid');
    var storedUserInfo = localStorage.getItem('fsj_user_info');
    var storedToken = localStorage.getItem('fsj_token');
    logDebug('localStorage: openid=' + (storedOpenid ? '有' : '无') + ', token=' + (storedToken ? '有' : '无') + ', userInfo=' + (storedUserInfo ? '有' : '无'));

    if (storedOpenid && storedUserInfo && storedToken) {
      logDebug('从 localStorage 恢复登录, openid: ' + storedOpenid);
      this.state.openid = storedOpenid;
      try {
        this.state.userInfo = JSON.parse(storedUserInfo);
      } catch (e) {
        this.state.userInfo = null;
      }
      this.state.isLoggedIn = true;
      logDebug('登录状态已恢复（不触发事件）');
    } else {
      logDebug('localStorage 无完整登录信息');
    }
  },

  /**
   * 判断是否在小程序环境中
   */
  isInMiniProgram: function () {
    var ua = navigator.userAgent;
    var hasWx = !!(window.wx && window.wx.miniProgram);
    var hasWxjsEnv = typeof window.__wxjs_environment === 'string';
    var isMiniUA = /miniProgram/i.test(ua);
    var isMicroMsgUA = /MicroMessenger/i.test(ua);

    console.log('[WechatLogin] === 环境检测 ===');
    console.log('[WechatLogin]   window.wx:', typeof window.wx);
    console.log('[WechatLogin]   wx.miniProgram:', hasWx);
    console.log('[WechatLogin]   __wxjs_environment:', window.__wxjs_environment);
    console.log('[WechatLogin]   userAgent:', ua);
    console.log('[WechatLogin]   /miniProgram/i.test(ua):', isMiniUA);
    console.log('[WechatLogin]   /MicroMessenger/i.test(ua):', isMicroMsgUA);

    var result = (
      window.__wxjs_environment === 'miniprogram' ||
      (window.wx && window.wx.miniProgram) ||
      /miniProgram/i.test(navigator.userAgent)
    );
    console.log('[WechatLogin]   isInMiniProgram 结果:', result);
    console.log('[WechatLogin] === 环境检测结束 ===');
    return result;
  },

  /**
   * 确保小程序 SDK 已加载
   */
  ensureMiniProgramReady: function () {
    var self = this;
    return new Promise(function (resolve) {
      if (window.wx && window.wx.miniProgram) {
        resolve();
        return;
      }
      var tries = 0;
      var timer = setInterval(function () {
        tries++;
        if (window.wx && window.wx.miniProgram) {
          clearInterval(timer);
          resolve();
          return;
        }
        if (tries >= 20) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  },

  /**
   * 跳转到小程序登录页
   */
  navigateToLogin: function () {
    var self = this;
    console.log('[WechatLogin] ===== navigateToLogin 被调用 =====');

    // 发送 requestOpenid，让小程序知道我们在等待 openid
    this._requestOpenidFromMiniProgram();

    // 第一步：直接检测 wx.miniProgram 是否已经存在
    console.log('[WechatLogin] 直接检测 window.wx:', typeof window.wx);
    console.log('[WechatLogin] 直接检测 wx.miniProgram:', !!(window.wx && window.wx.miniProgram));

    if (window.wx && window.wx.miniProgram && typeof wx.miniProgram.navigateTo === 'function') {
      console.log('[WechatLogin] wx.miniProgram 已存在，直接跳转');
      wx.miniProgram.navigateTo({
        url: self.config.miniProgramLoginUrl,
        success: function () {
          console.log('[WechatLogin] navigateTo 成功！');
        },
        fail: function (err) {
          console.error('[WechatLogin] navigateTo 失败:', JSON.stringify(err));
          // 如果直接跳转失败，尝试等 ready 后再试
          self._retryNavigateToLogin();
        }
      });
      return;
    }

    // 第二步：wx.miniProgram 不存在，等待加载后重试
    console.log('[WechatLogin] wx.miniProgram 不存在，等待加载...');
    this._retryNavigateToLogin();
  },

  /**
   * 重试导航到登录页（等待 wx.miniProgram 加载）
   */
  _retryNavigateToLogin: function () {
    var self = this;
    this.ensureMiniProgramReady().then(function () {
      console.log('[WechatLogin] ensureMiniProgramReady 完成');
      console.log('[WechatLogin]   wx:', typeof window.wx);
      console.log('[WechatLogin]   wx.miniProgram:', !!(window.wx && window.wx.miniProgram));
      console.log('[WechatLogin]   navigateTo 可用:', !!(window.wx && window.wx.miniProgram && typeof wx.miniProgram.navigateTo === 'function'));

      if (window.wx && window.wx.miniProgram && typeof wx.miniProgram.navigateTo === 'function') {
        console.log('[WechatLogin] 执行 wx.miniProgram.navigateTo, url:', self.config.miniProgramLoginUrl);
        wx.miniProgram.navigateTo({
          url: self.config.miniProgramLoginUrl,
          success: function () {
            console.log('[WechatLogin] navigateTo 成功');
          },
          fail: function (err) {
            console.error('[WechatLogin] navigateTo 失败:', JSON.stringify(err));
          }
        });
      } else {
        console.error('[WechatLogin] wx.miniProgram 仍未加载，无法跳转到小程序登录页');
        alert('小程序环境异常，无法跳转到登录页');
      }
    });
  },

  /**
   * 处理登录回调（通过 URL hash 接收 openid）
   * 小程序登录成功后会 navigateBack 到 webview，URL 带 #openid=xxx
   */
  handleAuthLogic: function () {
    var hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    logDebug('handleAuthLogic 触发, hash: "' + hash + '"');
    logDebug('URL: ' + window.location.href.substring(0, 150));

    var params = new URLSearchParams(hash);
    var openid = params.get('openid');

    // 也从 URL search 参数读取 openid（小程序通过 ?openId=xxx 传入）
    if (!openid) {
      var searchParams = new URLSearchParams(window.location.search.substring(1));
      openid = searchParams.get('openId') || searchParams.get('openid');
      if (openid) {
        logDebug('从 search 参数提取 openid: ' + openid);
      }
    }

    logDebug('提取 openid: ' + openid + ', isLoggedIn: ' + this.state.isLoggedIn);

    // 有有效的 openid 才执行登录逻辑
    if (openid) {
      logDebug('发现 OpenID: ' + openid);
      // 检查用户是否已取消登录（关闭了登录弹窗）
      if (this.state._cancelled) {
        logDebug('用户已取消登录，忽略 hash 中的 openid');
        this.state._cancelled = false;
        return;
      }
      if (!this.state.isLoggedIn || this.state.openid !== openid) {
        logDebug('执行登录逻辑...');
        this.loginWithOpenid(openid);
      } else {
        logDebug('已处于登录状态且 OpenID 未变');
      }
      return;
    }

    // 只有当 hash 中明确包含 openid= 但值为空时（退出登录指令），才执行退出
    // 注意：hash 为空或不含 openid 参数时，不触发退出（可能是正常页面导航）
    if (hash.indexOf('openid=') !== -1 && !openid) {
      logDebug('收到退出登录指令');
      this.logout();
      return;
    }

    // 从 localStorage 恢复登录状态（仅在未登录且没有 hash 指令时）
    var stored = localStorage.getItem('fsj_openid');
    var storedUserInfo = localStorage.getItem('fsj_user_info');

    logDebug('检查 localStorage: openid=' + (stored ? stored.substring(0, 10) : '无'));

    if (stored && storedUserInfo) {
      logDebug('从本地存储恢复登录: ' + stored.substring(0, 10));
      if (!this.state.isLoggedIn || this.state.openid !== stored) {
        this.state.openid = stored;
        try {
          this.state.userInfo = JSON.parse(storedUserInfo);
        } catch (e) {
          this.state.userInfo = null;
        }
        this.state.isLoggedIn = true;
        // restore 不触发事件，避免页面重复刷新
        logDebug('本地恢复完成（不触发事件）');
      }
      return;
    }

    // 没有 hash openid 也没有 localStorage，向小程序请求 openid（仅当用户没有取消过登录）
    if (!this.state._cancelled && !this._openidRequested) {
      this._openidRequested = true;
      logDebug('未检测到 openid，向小程序请求');
      this._requestOpenidFromMiniProgram();
    }
  },

  /**
   * 显示登录加载提示
   */
  _showLoginLoading: function () {
    var existing = document.getElementById('login-loading-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'login-loading-overlay';
    overlay.innerHTML =
      '<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,0.9);' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:99999;">' +
        '<div style="width:36px;height:36px;border:3px solid #e2e8f0;border-top-color:#2563eb;' +
      'border-radius:50%;animation:spin 0.8s linear infinite;"></div>' +
        '<p style="margin-top:16px;font-size:14px;color:#666;">正在登录中...</p>' +
      '</div>';
    document.body.appendChild(overlay);
  },

  /**
   * 隐藏登录加载提示
   */
  _hideLoginLoading: function () {
    var overlay = document.getElementById('login-loading-overlay');
    if (overlay) overlay.remove();
  },

  /**
   * 向小程序请求 openid（小程序通过 redirectTo 重载页面并携带 openId）
   */
  _requestOpenidFromMiniProgram: function () {
    var self = this;
    if (window.wx && window.wx.miniProgram) {
      console.log('[WechatLogin] 发送 requestOpenid 消息到小程序');
      window.wx.miniProgram.postMessage({
        data: { type: 'requestOpenid' }
      });
      // 小程序 onMessage 收到 requestOpenid 后会 redirectTo 带 openId 的 URL
      // 页面会重新加载，handleAuthLogic 会读取 openId 参数
      // 这里不需要监听 postMessage，只需要 redirect 机制
    } else {
      console.log('[WechatLogin] 非小程序环境，跳过 openid 请求');
    }
  },

  /**
   * 判断是否在浏览器测试模式（非小程序、无 MingDaoYunAPI）
   * 或在小程序 webview 中 MingDaoYunAPI 未加载的情况
   */
  isBrowserTestMode: function () {
    return !window.MingDaoYunAPI;
  },

  /**
   * 取消待完成的登录请求（用户关闭登录弹窗时调用）
   */
  cancelPendingLogin: function () {
    this.state._cancelled = true;
    this._loginInProgress = false;
    // 重置 openid 请求标志，允许重新发送 requestOpenid
    this._openidRequested = false;
    logDebug('用户取消登录，已重置 _cancelled 和 _openidRequested');
  },

  /**
   * 使用 openid 登录（调用 Coze API 获取用户信息）
   */
  loginWithOpenid: function (openid) {
    if (!openid) return;

    // 用户手动关闭了登录弹窗，阻止后台自动登录
    if (this.state._cancelled) {
      logDebug('用户已取消登录，阻止后台自动登录');
      this.state._cancelled = false;
      return;
    }

    // 防止重复登录：如果已经在登录中或已完成登录，忽略
    if (this._loginInProgress) {
      logDebug('登录正在进行中，忽略重复调用');
      return;
    }
    if (this.state.isLoggedIn && this.state.openid === openid) {
      logDebug('已处于同一用户的登录状态，忽略重复调用');
      return;
    }

    this._loginInProgress = true;
    logDebug('===== 开始登录流程, openid: ' + openid.substring(0, 10) + ' =====');
    logDebug('LoginService 已加载: ' + !!window.LoginService);

    // 显示登录加载提示
    this._showLoginLoading();

    var self = this;

    if (window.LoginService) {
      logDebug('调用 LoginService.wxLogin...');
      var shangjia = (typeof FsjApi !== 'undefined' && FsjApi.getShangjiaRowid) ? FsjApi.getShangjiaRowid() : '';
      if (!shangjia) shangjia = localStorage.getItem('fsj_shangjia_rowid') || '';
      logDebug('shangjia: ' + shangjia);
      LoginService.wxLogin(openid, shangjia)
        .then(function (res) {
          self._hideLoginLoading();
          logDebug('Coze API 返回: ' + JSON.stringify(res).substring(0, 200));
          self._loginInProgress = false;
          // API 返回后再次检查用户是否已取消登录（时序：API 请求中用户关闭弹窗）
          if (self.state._cancelled) {
            logDebug('用户已在 API 返回前关闭弹窗，取消登录');
            self.state._cancelled = false;
            return;
          }
          if (res && res.rowid) {
            logDebug('rowid 存在，执行 finishLogin');
            self.finishLogin(res, openid);
          } else {
            logDebug('Coze API 返回空用户信息: ' + JSON.stringify(res).substring(0, 200));
          }
        })
        .catch(function (err) {
          self._hideLoginLoading();
          self._loginInProgress = false;
          logDebug('Coze API 调用失败: ' + String(err));
        });
    } else {
      this._hideLoginLoading();
      this._loginInProgress = false;
      logDebug('LoginService 未加载');
    }
  },

  /**
   * 完成登录流程
   */
  finishLogin: function (userData, openid) {
    var processedData = this.processUserData(userData);

    logDebug('finishLogin - userData: ' + JSON.stringify(userData).substring(0, 200));
    logDebug('finishLogin - processedData: ' + JSON.stringify(processedData).substring(0, 200));

    this.state.userInfo = processedData;
    this.state.isLoggedIn = true;
    this.state.openid = openid;

    // 持久化
    localStorage.setItem('fsj_openid', openid);
    localStorage.setItem('fsj_user_info', JSON.stringify(processedData));

    if (userData.rowid) {
      logDebug('保存 fsj_token: ' + userData.rowid);
      localStorage.setItem('fsj_token', userData.rowid);
    } else {
      logDebug('userData.rowid 不存在，未保存 fsj_token');
    }

    logDebug('调用 notifyLoginSuccess');
    this.notifyLoginSuccess(processedData, 'login');
  },

  /**
   * 处理用户数据（提取有用字段）
   */
  processUserData: function (userData) {
    var name = userData.nickname || userData.mingcheng || userData.nicheng || userData.name ||
      (userData.caid && userData.caid.fullname) || userData['姓名'] || '用户';

    console.log('[WechatLogin] processUserData - 原始数据:', JSON.stringify(userData).substring(0, 300));

    // 处理头像
    var avatar = '';
    // 兼容 touxiang、touxiasng（登录 workflow 返回）和 avatar（明道云 controlId）
    var touxiang = userData.touxiang || userData.touxiasng || userData.avatar;

    console.log('[WechatLogin] processUserData - touxiang 字段值:', touxiang, '类型:', typeof touxiang);

    if (touxiang) {
      if (Array.isArray(touxiang) && touxiang[0]) {
        avatar = touxiang[0].large_thumbnail_full_path || touxiang[0].path || avatar;
      } else if (typeof touxiang === 'string') {
        var trimmed = touxiang.trim();
        if (trimmed.startsWith('http')) {
          avatar = trimmed;
        } else {
          try {
            var parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed) && parsed[0]) {
              avatar = parsed[0].large_thumbnail_full_path || parsed[0].path || avatar;
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    console.log('[WechatLogin] processUserData - 最终 avatar:', avatar);

    return {
      id: userData.rowid,
      rowid: userData.rowid,            // ChatService.getUser 依赖（2026-09-05 补齐，防止覆盖后聊天判未登录）
      openid: userData.openid || userData.rowid,
      agent: userData.mragent || '',
      name: name,
      avatar: avatar,
      raw: userData,
    };
  },

  /**
   * 通知登录成功
   */
  notifyLoginSuccess: function (userInfo, type) {
    logDebug('登录成功: ' + userInfo.name);

    // 触发事件（供其他模块监听）
    window.dispatchEvent(new CustomEvent('wechatlogin:change', {
      detail: {
        type: type,
        isLoggedIn: this.state.isLoggedIn,
        openid: this.state.openid,
        userInfo: userInfo,
      },
    }));

    // 通知 App 层
    if (type === 'login' && window.App && window.App.handleLoginResult) {
      logDebug('调用 App.handleLoginResult');
      window.App.handleLoginResult({
        rowid: userInfo.id,
        name: userInfo.name,
        openid: this.state.openid || '',
        shangjia: this.getDefaultShangjia(),
        jifen: userInfo.raw && userInfo.raw.jifen,
        yue: userInfo.raw && userInfo.raw.yue,
      });
    }
  },

  /**
   * 获取默认的商家配置（登录后使用）
   */
  getDefaultShangjia: function () {
    return [
      { name: '首页', sort: 0, page: 'home' },
      { name: '智能体', sort: 1, page: 'agent' },
      { name: '消息', sort: 2, page: 'message' },
      { name: '我的', sort: 3, page: 'profile' },
    ];
  },

  /**
   * 退出登录
   */
  logout: function () {
    logDebug('退出登录开始');
    // 停止登录轮询和请求
    this._stopLoginPolling();
    this._loginInProgress = false;
    // 清除用户身份相关数据
    localStorage.removeItem('fsj_openid');
    localStorage.removeItem('fsj_user_info');
    localStorage.removeItem('fsj_token');
    localStorage.removeItem('fsj_user_name');
    localStorage.removeItem('fsj_agent_id');
    localStorage.removeItem('fsj_agent_mode');
    localStorage.removeItem('fsj_shuohua_id');
    localStorage.removeItem('fsj_bushuohua_id');
    logDebug('退出登录：身份数据已清除');

    // 保留商家配置（fsj_shangjia_tabs、fsj_profile_menu、fsj_shangjia_rowid 等）

    this.state.isLoggedIn = false;
    this.state.userInfo = null;
    this.state.openid = null;

    // 直接调用 wx.miniProgram.reLaunch 刷新 webview（用 _reset 参数让小程序清除 openid）
    // 不用 postMessage 因为 postMessage 是缓冲的，会在用户下次导航时触发导致干扰登录流程
    if (window.wx && window.wx.miniProgram && typeof wx.miniProgram.reLaunch === 'function') {
      logDebug('调用 wx.miniProgram.reLaunch 刷新 webview');
      wx.miniProgram.reLaunch({
        url: '/pages/webview/index?_reset=' + Date.now()
      });
    } else {
      logDebug('wx.miniProgram.reLaunch 不可用，降级为 postMessage');
      Bridge.postMessage('logout', {});
    }

    window.dispatchEvent(new CustomEvent('wechatlogin:change', {
      detail: { type: 'logout', isLoggedIn: false },
    }));
  },

  /**
   * 退出登录后启动轮询，检测用户是否重新登录
   */
  _startLoginPolling: function () {
    var self = this;
    // 清除之前的轮询
    this._stopLoginPolling();

    var pollCount = 0;
    var maxPolls = 120; // 最多轮询120次（3秒×120=6分钟）

    this._pollTimer = setInterval(function () {
      pollCount++;
      logDebug('轮询(' + pollCount + '/' + maxPolls + ') URL: ' + window.location.href.substring(80, 130));

      // 检查 URL 中是否有新的 openId
      var searchParams = new URLSearchParams(window.location.search.substring(1));
      var urlOpenid = searchParams.get('openId') || searchParams.get('openid');

      if (urlOpenid) {
        logDebug('轮询发现 URL 中新的 openId: ' + urlOpenid.substring(0, 10));
        self._stopLoginPolling();
        self.loginWithOpenid(urlOpenid);
        return;
      }

      // 检查 hash 中是否有新的 openId
      var hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
      var hashParams = new URLSearchParams(hash);
      var hashOpenid = hashParams.get('openid') || hashParams.get('openId');

      if (hashOpenid) {
        logDebug('轮询发现 hash 中新的 openid: ' + hashOpenid.substring(0, 10));
        self._stopLoginPolling();
        self.loginWithOpenid(hashOpenid);
        return;
      }

      if (pollCount >= maxPolls) {
        logDebug('轮询超时，停止检测');
        self._stopLoginPolling();
      }
    }, 3000); // 每3秒轮询一次
  },

  /**
   * 停止轮询
   */
  _stopLoginPolling: function () {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  /**
   * 获取当前登录状态
   */
  isLoggedIn: function () {
    return this.state.isLoggedIn;
  },

  /**
   * 获取当前用户信息
   */
  getUserInfo: function () {
    return this.state.userInfo;
  },

  /**
   * 获取 openid
   */
  getOpenid: function () {
    return this.state.openid;
  },
};

// 暴露到全局
window.WechatLoginService = WechatLoginService;
