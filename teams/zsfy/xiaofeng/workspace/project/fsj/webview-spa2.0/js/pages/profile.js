/**
 * 我的页面
 */
var ProfilePage = {
  /**
   * 初始化
   */
  init: function () {
    this.renderUserCard();
    this.renderStatsCard();
    this.renderSettingsList();
    this.renderFooter();
    this.bindWechatLoginCallback();
  },

  /**
   * 监听微信登录回调
   */
  bindWechatLoginCallback: function () {
    var self = this;
    window.addEventListener('wechatlogin:change', function (e) {
      var detail = e.detail;
      if (detail.type === 'login' || detail.type === 'restore') {
        self.renderUserCard();
        self.renderSettingsList();
        self.renderFooter();
        // 登录后重新渲染统计看板（读取最新 fsj_user_info + fsj_board_config）
        setTimeout(function () {
          self.renderStatsCard();
        }, 300);
      } else if (detail.type === 'logout') {
        self.renderUserCard();
        self.renderSettingsList();
        self.renderFooter();
        // 退出后重新渲染（显示默认值 0）
        self.renderStatsCard();
      }
    });

    // 监听用户数据变化，自动更新看板
    window.addEventListener('storage', function (e) {
      if (e.key === 'fsj_user_info' && e.newValue) {
        try {
          var parsed = JSON.parse(e.newValue);
          var userData = parsed && parsed.raw ? parsed.raw : parsed;
          console.log('[Profile] storage 事件: fsj_user_info 更新', JSON.stringify(userData));
          // 重新渲染整个统计看板（确保板配置已加载）
          self.renderStatsCard();
        } catch (err) {
          console.warn('[Profile] 用户数据解析失败:', err);
        }
      }
    });
  },

  /**
   * 判断是否处于审核状态（商家 shenhe 字段为 "1"）
   * 审核期间不显示头像，避免审核不通过
   */
  isInReview: function () {
    var shenhe = localStorage.getItem('fsj_shenhe') || '';
    return shenhe === '1';
  },

  /**
   * 渲染用户卡片
   */
  renderUserCard: function () {
    var container = document.getElementById('profile-user-card');
    if (!container) return;

    var token = localStorage.getItem('fsj_token');
    var openid = localStorage.getItem('fsj_openid');   // 账号密码登录写入的是 fsj_openid（无 fsj_token）
    var storedInfo = null;
    try { storedInfo = JSON.parse(localStorage.getItem('fsj_user_info') || 'null'); } catch (e) {}
    var userName = (storedInfo && storedInfo.name) || localStorage.getItem('fsj_user_name') || '学生';
    var isLogin = !!token || !!openid;
    var user = isLogin ? { name: userName, role: '四年级' } : { name: '未登录', role: '请先登录' };
    var isReview = this.isInReview();

    var self = this;
    var nicknameHtml = '<div class="nickname">' + user.name + '</div>';

    // 已登录时，昵称旁显示编辑图标
    if (isLogin) {
      nicknameHtml = '<div class="nickname-row">' +
        '<span class="nickname">' + user.name + '</span>' +
        '<span class="nickname-edit" id="nickname-edit-btn" title="修改昵称"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></span>' +
        '</div>';
    }

    // 审核期间不显示头像
    var avatarHtml = '';
    if (!isReview) {
      var avatarSrc = 'assets/logo.png';
      if (isLogin) {
        var storedInfo = localStorage.getItem('fsj_user_info');
        console.log('[Profile] renderUserCard - fsj_user_info:', storedInfo ? storedInfo.substring(0, 300) : '无');
        if (storedInfo) {
          try {
            var parsed = JSON.parse(storedInfo);
            console.log('[Profile] renderUserCard - parsed.avatar:', parsed && parsed.avatar);
            if (parsed && parsed.avatar && (parsed.avatar.startsWith('http') || parsed.avatar.startsWith('data:'))) {
              avatarSrc = parsed.avatar;
            }
          } catch (e) {}
        }
      }

      console.log('[Profile] renderUserCard - 最终 avatarSrc:', avatarSrc);

      avatarHtml = '<div class="avatar" id="avatar-upload-trigger">' +
        '<img src="' + avatarSrc + '" alt="avatar" />' +
        (isLogin ? '<div class="avatar-overlay"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></div>' : '') +
        '</div>';
    }

    container.innerHTML = avatarHtml + nicknameHtml;

    // 未登录时，点击卡片弹出登录弹窗
    if (!isLogin) {
      container.classList.add('login-prompt');
      container.addEventListener('click', function () {
        self.renderLoginModal();
      });
    } else {
      container.classList.remove('login-prompt');
      // 绑定编辑按钮事件
      var editBtn = document.getElementById('nickname-edit-btn');
      if (editBtn) {
        editBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          self.openNicknameModal();
        });
      }
      // 绑定头像上传
      var avatarTrigger = document.getElementById('avatar-upload-trigger');
      if (avatarTrigger) {
        avatarTrigger.addEventListener('click', function (e) {
          e.stopPropagation();
          self.uploadAvatar();
        });
      }
    }
  },

  /**
   * 打开修改昵称弹窗
   */
  openNicknameModal: function () {
    var existing = document.getElementById('nickname-modal');
    if (existing) existing.remove();

    var currentName = localStorage.getItem('fsj_user_name') || '';

    var modal = document.createElement('div');
    modal.id = 'nickname-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML =
      '<div class="modal-content nickname-modal">' +
        '<div class="modal-header">' +
          '<h3 class="modal-title">修改昵称</h3>' +
          '<span class="modal-close" id="nickname-modal-close">&#10005;</span>' +
        '</div>' +
        '<div class="modal-body">' +
          '<div class="form-group">' +
            '<input type="text" class="form-input" id="nickname-input" placeholder="请输入昵称" maxlength="20" value="' + currentName + '" />' +
          '</div>' +
          '<button class="btn-account-login" id="nickname-save-btn"><span>保存</span></button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);

    var self = this;
    var input = document.getElementById('nickname-input');

    // 关闭按钮
    document.getElementById('nickname-modal-close').addEventListener('click', function () {
      modal.remove();
    });

    // 点击背景关闭
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.remove();
    });

    // 保存按钮
    document.getElementById('nickname-save-btn').addEventListener('click', function () {
      var newName = input.value.trim();
      if (!newName) {
        alert('昵称不能为空');
        return;
      }
      var saveBtn = document.getElementById('nickname-save-btn');
      saveBtn.innerHTML = '<span>保存中...</span>';
      saveBtn.disabled = true;

      var userRowid = '';
      var storedInfo = localStorage.getItem('fsj_user_info');
      if (storedInfo) {
        try { userRowid = JSON.parse(storedInfo).id || ''; } catch (e) {}
      }

      if (!userRowid) {
        alert('用户信息缺失，请重新登录');
        modal.remove();
        return;
      }

      FsjApi.updateUserNickname(userRowid, newName).then(function () {
        // 更新 localStorage
        localStorage.setItem('fsj_user_name', newName);
        var info = JSON.parse(localStorage.getItem('fsj_user_info') || '{}');
        info.name = newName;
        if (info.raw) info.raw.nicheng = newName;
        localStorage.setItem('fsj_user_info', JSON.stringify(info));

        modal.remove();
        self.renderUserCard();
        alert('昵称修改成功');
      }).catch(function (err) {
        alert('昵称修改失败: ' + err.message);
        saveBtn.innerHTML = '<span>保存</span>';
        saveBtn.disabled = false;
      });
    });

    // 回车保存
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        document.getElementById('nickname-save-btn').click();
      }
    });

    // 自动聚焦并选中文字
    setTimeout(function () {
      input.focus();
      input.select();
    }, 100);
  },

  /**
   * 上传头像
   * 流程：选择图片 → 上传到临时接口 → 拿到 HTTPS URL → 更新明道云
   */
  uploadAvatar: function () {
    var self = this;
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = function (e) {
      var file = e.target.files[0];
      if (!file) return;

      // 限制大小 10MB
      if (file.size > 10 * 1024 * 1024) {
        alert('图片不能超过 10MB');
        return;
      }

      var formData = new FormData();
      formData.append('file', file);

      // 1. 上传到临时接口
      fetch('https://100000whys.cn/api/v1/temp/upload', {
        method: 'POST',
        body: formData,
      })
      .then(function (res) { return res.json(); })
      .then(function (result) {
        if (result.code !== 200) {
          throw new Error(result.message || '上传失败');
        }

        var tempUrl = 'https://100000whys.cn' + result.data.url;
        console.log('[Profile] 临时头像 URL:', tempUrl);

        // 2. 更新明道云头像字段
        var userRowid = '';
        var storedInfo = localStorage.getItem('fsj_user_info');
        if (storedInfo) {
          try { userRowid = JSON.parse(storedInfo).id || ''; } catch (e) {}
        }
        if (!userRowid) {
          throw new Error('用户信息缺失，请重新登录');
        }

        return FsjApi.updateUserAvatar(userRowid, tempUrl).then(function () {
          return tempUrl;
        });
      })
      .then(function (avatarUrl) {
        // 3. 更新本地缓存和 UI
        var info = JSON.parse(localStorage.getItem('fsj_user_info') || '{}');
        info.avatar = avatarUrl;
        if (info.raw) info.raw.avatar = avatarUrl;
        localStorage.setItem('fsj_user_info', JSON.stringify(info));

        // 更新头像显示
        var avatarImg = document.querySelector('#avatar-upload-trigger img');
        if (avatarImg) {
          avatarImg.src = avatarUrl;
        }

        console.log('[Profile] 头像已更新');
      })
      .catch(function (err) {
        console.error('[Profile] 头像上传失败:', err);
        alert('头像上传失败: ' + err.message);
      });
    };

    input.click();
  },

  /**
   * 渲染数据统计
   */
  renderStatsCard: function () {
    var container = document.getElementById('profile-stats');
    if (!container) return;

    var boardConfig = this.getBoardConfig();
    if (!boardConfig || boardConfig.length === 0) {
      container.innerHTML = '';
      return;
    }

    var userData = this.getUserData();
    var self = this;

    container.innerHTML = boardConfig.filter(function (card) { return card && card.controlId; }).map(function (card) {
      var value = userData && userData[card.controlId] !== undefined
        ? userData[card.controlId]
        : '0';
      return '<div class="stat-item" data-control-id="' + card.controlId + '">' +
        '<div class="stat-num">' + value + '</div>' +
        '<div class="stat-label">' + card.name + '</div>' +
        '</div>';
    }).join('');
  },

  /**
   * 获取看板配置
   */
  getBoardConfig: function () {
    try {
      var config = localStorage.getItem('fsj_board_config');
      console.log('[Profile] localStorage fsj_board_config:', config);
      if (config) {
        var parsed = typeof config === 'string' ? JSON.parse(config) : config;
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    console.log('[Profile] 未找到看板配置，返回空数组');
    return [];
  },

  /**
   * 获取用户数据
   */
  getUserData: function () {
    try {
      // 优先读 fsj_user_info（登录时保存）
      var info = localStorage.getItem('fsj_user_info');
      if (info) {
        var parsed = JSON.parse(info);
        if (parsed && parsed.raw) return parsed.raw;
        return parsed;
      }
      // 兼容旧数据
      var data = localStorage.getItem('userData');
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  },

  /**
   * 从后端刷新用户数据
   */
  refreshUserInfo: function () {
    var self = this;
    var userData = this.getUserData();
    var userRowid = userData.rowid || userData.id || '';
    if (!userRowid) {
      console.log('[Profile] 未获取到用户 rowid，跳过刷新');
      return;
    }
    console.log('[Profile] 开始刷新用户数据, rowid:', userRowid);
    FsjApi.getUserInfoByRowid(userRowid).then(function (info) {
      console.log('[Profile] 用户数据刷新成功:', JSON.stringify(info).substring(0, 300));
      // 打印用户已加入的组织（老板要看）
      FsjApi.getUserOrgs().then(function(orgs){
        console.log('[Profile] 用户已加入的组织 (jrdzz):', JSON.stringify(orgs));
      }).catch(function(e){ console.log('[Profile] jrdzz 获取失败:', e.message); });
      // 保留已有的头像（refreshUserInfo 主要刷新余额/积分等，不应覆盖登录时保存的头像）
      var existingInfo = localStorage.getItem('fsj_user_info');
      var existingAvatar = '';
      if (existingInfo) {
        try { existingAvatar = JSON.parse(existingInfo).avatar || ''; } catch (e) {}
      }
      // 使用 processUserData 统一处理
      var processed = WechatLoginService.processUserData(info);
      // 如果 processUserData 没取到头像且之前有有效的（http/data 开头），保留旧的
      if (!processed.avatar && existingAvatar && (existingAvatar.startsWith('http') || existingAvatar.startsWith('data:'))) {
        processed.avatar = existingAvatar;
      }
      // 更新 localStorage
      localStorage.setItem('fsj_user_info', JSON.stringify(processed));
      if (info.yue !== undefined) localStorage.setItem('fsj_user_balance', String(info.yue));
      if (info.jifen !== undefined) localStorage.setItem('fsj_user_points', String(info.jifen));
      // 重新渲染
      self.renderUserCard();
      self.renderStatsCard();
    }).catch(function (err) {
      console.warn('[Profile] 刷新用户数据失败:', err.message);
    });
  },

  /**
   * 更新看板数值（供外部调用）
   */
  updateStatsCard: function (userData) {
    var container = document.getElementById('profile-stats');
    if (!container) return;

    var items = container.querySelectorAll('.stat-item');
    items.forEach(function (item) {
      var controlId = item.getAttribute('data-control-id');
      if (controlId && userData && userData[controlId] !== undefined) {
        var numEl = item.querySelector('.stat-num');
        if (numEl) {
          numEl.textContent = userData[controlId] !== null && userData[controlId] !== ''
            ? userData[controlId] : '0';
        }
      }
    });
  },

  /**
   * 渲染设置列表
   */
  renderSettingsList: function () {
    var container = document.getElementById('profile-settings');
    if (!container) return;

    var token = localStorage.getItem('fsj_token');
    var menu = [];

    // 读取商家自定义菜单配置
    var customMenu = this._getCustomMenu();

    if (customMenu !== null) {
      // 商家配置过 wode：按配置显示（空数组就不显示任何菜单项）
      if (customMenu.length > 0) {
        customMenu.forEach(function (item) {
          menu.push({ label: item.name, action: 'custom', page: item.page, url: item.url, mode: item.mode });
        });
      }
    } else {
      // 未配置过：显示默认菜单
      menu.push({ label: '学习指引', action: 'guide' });
      if (token) {
        menu.push({ label: '我的错题', action: 'my-errors' });
        menu.push({ label: '学习报告', action: 'report' });
      }
    }

    // 退出登录（登录后显示）
    if (token) {
      menu.push({ label: '退出登录', action: 'logout', logout: true });
    }

    if (menu.length === 0) {
      container.style.display = 'none';
    } else {
      container.style.display = '';
      container.innerHTML = menu.map(function (item) {
        var pageAttr = item.page ? ' data-page="' + item.page + '"' : '';
        return '<div class="settings-list-item" data-action="' + item.action + '"' + pageAttr + '>' +
          '<span class="name' + (item.logout ? ' logout' : '') + '">' + item.label + '</span>' +
          '<span class="arrow">›</span>' +
          '</div>';
      }).join('');

      var self = this;
      container.querySelectorAll('.settings-list-item').forEach(function (el) {
        el.addEventListener('click', function () {
          var action = el.getAttribute('data-action');
          var page = el.getAttribute('data-page');
          var url = el.getAttribute('data-url');
          var mode = el.getAttribute('data-mode');
          self.handleAction(action, page, url, mode);
        });
      });
    }
  },

  /**
   * 获取商家自定义菜单配置
   * 返回 null 表示未配置过（走默认菜单）
   * 返回 [] 表示商家明确配置了空数组（不显示任何菜单项）
   * 返回 [items] 表示有自定义菜单
   */
  _getCustomMenu: function () {
    var configured = localStorage.getItem('fsj_wode_configured');
    if (configured !== 'true') return null;

    try {
      var stored = localStorage.getItem('fsj_profile_menu');
      if (stored) {
        var parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  },

  /**
   * 设置"我的页面"自定义菜单（供外部调用）
   * @param {Array} menu - 菜单配置数组
   */
  setCustomMenu: function (menu) {
    if (!Array.isArray(menu)) return;
    localStorage.setItem('fsj_profile_menu', JSON.stringify(menu));
    this.renderSettingsList();
  },

  /**
   * 渲染底部区域（登录按钮 + 版本号）
   */
  renderFooter: function () {
    var footer = document.getElementById('profile-footer');
    var loginBtn = document.getElementById('profile-login-btn');
    if (!footer || !loginBtn) return;

    var token = localStorage.getItem('fsj_token');

    if (token) {
      loginBtn.style.display = 'none';
    } else {
      loginBtn.style.display = '';
      loginBtn.innerHTML = '<div class="login-text-btn" id="profile-login-action">登录</div>';
      var self = this;
      document.getElementById('profile-login-action').addEventListener('click', function () {
        self.renderLoginModal();
      });
    }

    // 版本号（只渲染一次）
    var versionEl = footer.querySelector('.version-footer');
    if (!versionEl) {
      versionEl = document.createElement('div');
      versionEl.className = 'version-footer';
      footer.appendChild(versionEl);
    }
    versionEl.textContent = 'v' + this._getVersion();
  },

  /**
   * 获取当前商家ID
   */
  _getShangjiaId: function () {
    var params = window.location.search.substring(1);
    var shangjia = '';
    params.split('&').forEach(function (p) {
      var parts = p.split('=');
      if (parts[0] === 'shangjia') shangjia = decodeURIComponent(parts[1] || '');
    });
    return shangjia;
  },

  /**
   * 获取版本号
   * 优先从 URL ?v= 参数读取，回退到 APP_VERSION
   */
  _getVersion: function () {
    // 从 URL 参数读取
    var params = window.location.search.substring(1);
    var vParam = '';
    params.split('&').forEach(function (p) {
      var parts = p.split('=');
      if (parts[0] === 'v') vParam = decodeURIComponent(parts[1] || '');
    });
    if (vParam) return vParam;
    return window.APP_VERSION || '2.0.3';
  },

  /**
   * 渲染登录弹窗
   */
  renderLoginModal: function () {
    var existing = document.getElementById('login-modal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'login-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML =
      '<div class="modal-content login-modal">' +
        '<div class="modal-header">' +
          '<h3 class="modal-title">登录</h3>' +
          '<span class="modal-close" id="login-modal-close">✕</span>' +
        '</div>' +
        '<div class="modal-tabs" id="login-modal-tabs">' +
          '<div class="modal-tab active" data-mode="wx">微信授权登录</div>' +
          '<div class="modal-tab" data-mode="account">账号密码登录</div>' +
        '</div>' +
        '<div class="modal-body" id="login-modal-body">' +
          '<!-- 登录表单容器 -->' +
        '</div>' +
        '<div class="modal-footer" style="padding:8px 16px 16px;text-align:center;">' +
          '<button id="modal-skip-login" style="background:transparent;border:1px solid #ccc;color:#999;padding:8px 32px;border-radius:20px;font-size:13px;cursor:pointer;">暂不登录，先逛逛</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    this.bindLoginModalEvents();
    this.switchLoginMode('wx');
  },

  /**
   * 切换登录方式（弹窗内）
   */
  switchLoginMode: function (mode) {
    var body = document.getElementById('login-modal-body');
    var tabs = document.querySelectorAll('#login-modal-tabs .modal-tab');
    if (!body) return;

    tabs.forEach(function (tab) {
      tab.classList.toggle('active', tab.getAttribute('data-mode') === mode);
    });

    if (mode === 'wx') {
      body.innerHTML =
        '<div class="login-wx-modal">' +
          '<div class="wx-icon-box"><img class="wx-login-img" src="assets/weichat.png" alt="微信登录" /></div>' +
          '<p class="wx-login-desc">点击按钮授权登录</p>' +
          '<button class="btn-wx-login" id="modal-wx-login-btn">' +
            '<span>微信授权登录</span>' +
          '</button>' +
          '<p class="login-hint">微信登录后将自动关联您的账号</p>' +
        '</div>';

      var self = this;
      document.getElementById('modal-wx-login-btn').addEventListener('click', function () {
        console.log('[Profile] 微信授权登录按钮被点击');
        // 使用 WechatLoginService 跳转到小程序登录页
        if (window.WechatLoginService) {
          console.log('[Profile] WechatLoginService 存在，调用 navigateToLogin');
          // 重置取消标记（用户主动重新登录）
          WechatLoginService.state._cancelled = false;
          WechatLoginService.navigateToLogin();
        } else {
          console.log('[Profile] WechatLoginService 不存在，使用 Bridge.requestLogin 降级');
          // 降级方案：通过 Bridge 触发
          Bridge.requestLogin('wx');
        }
        self.closeLoginModal();
      });
    } else {
      body.innerHTML =
        '<div class="login-account-modal">' +
          '<div class="form-group">' +
            '<label class="form-label">手机号</label>' +
            '<input type="tel" class="form-input" id="modal-account-input" placeholder="请输入手机号" maxlength="11" />' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">密码</label>' +
            '<input type="password" class="form-input" id="modal-password-input" placeholder="请输入密码" />' +
          '</div>' +
          '<button class="btn-account-login" id="modal-account-login-btn"><span>登 录</span></button>' +
          '<p class="login-hint">请输入注册时的手机号和密码</p>' +
        '</div>';

      var self = this;
      document.getElementById('modal-account-login-btn').addEventListener('click', function () {
        var phone = document.getElementById('modal-account-input').value.trim();
        var pwd = document.getElementById('modal-password-input').value.trim();
        if (!/^1[3-9]\d{9}$/.test(phone)) {
          alert('请输入正确的手机号');
          return;
        }
        if (!pwd) {
          alert('请输入密码');
          return;
        }

        // 显示加载状态
        var loginBtn = document.getElementById('modal-account-login-btn');
        loginBtn.textContent = '登录中...';
        loginBtn.disabled = true;

        LoginService.accountLogin(phone, pwd, self._getShangjiaId())
          .then(function (loginData) {
            self.handleLoginResult(loginData);
          })
          .catch(function (err) {
            alert('登录失败: ' + err.message);
          })
          .finally(function () {
            // 恢复按钮状态
            var btn = document.getElementById('modal-account-login-btn');
            if (btn) {
              btn.innerHTML = '<span>登 录</span>';
              btn.disabled = false;
            }
          });
      });
    }
  },

  /**
   * 绑定弹窗事件
   */
  bindLoginModalEvents: function () {
    var self = this;
    var modal = document.getElementById('login-modal');
    var closeBtn = document.getElementById('login-modal-close');
    var skipBtn = document.getElementById('modal-skip-login');

    closeBtn.addEventListener('click', function () {
      self.closeLoginModal();
    });

    if (skipBtn) {
      skipBtn.addEventListener('click', function () {
        self.closeLoginModal();
      });
    }

    modal.addEventListener('click', function (e) {
      if (e.target === modal) {
        self.closeLoginModal();
      }
    });

    document.querySelectorAll('#login-modal-tabs .modal-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var mode = tab.getAttribute('data-mode');
        self.switchLoginMode(mode);
      });
    });
  },

  /**
   * 关闭登录弹窗
   */
  closeLoginModal: function () {
    // 通知 WechatLoginService 取消待完成的登录请求（阻止小程序回调后自动登录）
    if (window.WechatLoginService) {
      WechatLoginService.cancelPendingLogin();
    }
    var modal = document.getElementById('login-modal');
    if (modal) modal.remove();
  },

  /**
   * 处理登录结果
   * @param {object} loginData - 登录返回数据 { name, rowid, shangjia, agent }
   */
  handleLoginResult: function (loginData) {
    // 保存登录信息
    if (loginData.rowid) {
      localStorage.setItem('fsj_token', loginData.rowid);
    }
    if (loginData.name) {
      localStorage.setItem('fsj_user_name', loginData.name);
    }
    if (loginData.shangjia) {
      localStorage.setItem('fsj_shangjia_tabs', JSON.stringify(loginData.shangjia));
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

    // 保存用户资产字段（积分、余额等）
    if (loginData.jifen !== undefined) {
      localStorage.setItem('fsj_user_points', String(loginData.jifen));
    }
    if (loginData.yue !== undefined) {
      localStorage.setItem('fsj_user_balance', String(loginData.yue));
    }

    // 保存 fsj_user_info（统计看板读取的数据源）
    // 与微信登录路径保持一致的结构：{ id, name, avatar, raw: loginData }
    var userInfo = {
      id: loginData.rowid,
      rowid: loginData.rowid,      // ChatService.getUser 依赖的字段
      openid: loginData.rowid,     // ChatService.getUser 依赖的字段
      agent: loginData.agent || '',
      name: loginData.name,
      avatar: loginData.touxiang || '',
      raw: loginData,
    };
    localStorage.setItem('fsj_user_info', JSON.stringify(userInfo));
    localStorage.setItem('fsj_openid', loginData.rowid);

    // 关闭登录弹窗
    this.closeLoginModal();

    // 更新我的页面
    this.renderUserCard();
    this.renderSettingsList();
    this.renderFooter();

    // 重新渲染统计看板（此时 fsj_user_info 已保存）
    this.renderStatsCard();

    // 更新底部导航栏
    if (window.App && window.App.updateTabBar && Array.isArray(loginData.shangjia)) {
      // 仅当登录返回了标签页配置数组时才重建导航栏（账号密码登录返回的是商家 rowid 字符串，不重建）
      window.App.updateTabBar(loginData.shangjia);
    }

    // 通知其他模块登录成功（如订单页面）
    window.dispatchEvent(new CustomEvent('wechatlogin:change', {
      detail: {
        type: 'login',
        isLoggedIn: true,
        openid: loginData.rowid,
        userInfo: { name: loginData.name, id: loginData.rowid },
      },
    }));

    // 提示登录成功
    alert('登录成功，欢迎 ' + (loginData.name || '回来'));
  },

  /**
   * 处理操作
   */
  handleAction: function (action, page, url, mode) {
    switch (action) {
      case 'custom':
        // 优先判断 SPA 内部页面跳转
        if (page === 'dingdan' || page === 'orders') {
          if (window.App && window.App.switchToOrders) {
            window.App.switchToOrders();
          }
        } else if (page === 'jifen' || page === 'points') {
          if (window.App && window.App.switchToPoints) {
            window.App.switchToPoints();
          }
        } else if (page === 'shdz' || page === 'address') {
          if (window.App && window.App.switchToAddress) {
            window.App.switchToAddress();
          }
        } else if (page === 'xiangce' || page === 'album') {
          this._switchToAlbum();
        } else if (page === 'kongjian') {
          this._switchToKongjian();
        } else if (page === 'xiangqing' || page === 'content-detail') {
          if (window.App && window.App.switchToContentDetail) {
            var contentRowid = this._getCustomMenuRowid(page);
            window.App.switchToContentDetail(contentRowid, 'profile');
          }
        } else if (mode == 1 && url) {
          // 通过 webview iframe 打开
          if (window.App) {
            window.App.switchToWebview(url, 'profile');
          }
        } else if (url) {
          window.open(url, '_blank');
        }
        break;
      case 'guide':
        Bridge.postMessage('navigate', { page: 'guide' });
        break;
      case 'my-errors':
        Bridge.postMessage('navigate', { page: 'analysis' });
        break;
      case 'report':
        Bridge.postMessage('navigate', { page: 'evaluation' });
        break;
      case 'logout':
        if (window.WechatLoginService) {
          WechatLoginService.logout();
        } else {
          localStorage.removeItem('fsj_token');
          localStorage.removeItem('fsj_user_name');
          localStorage.removeItem('fsj_shangjia_tabs');
          localStorage.removeItem('fsj_agent_id');
          localStorage.removeItem('fsj_agent_mode');
          localStorage.removeItem('fsj_shuohua_id');
          localStorage.removeItem('fsj_bushuohua_id');
          this.renderUserCard();
          this.renderSettingsList();
          this.renderFooter();
        }
        break;
      case 'album':
        this._switchToAlbum();
        break;
    }
  },

  /**
   * 跳转到个人相册页面
   */
  _switchToAlbum: function () {
    document.querySelectorAll('#app .page').forEach(function (p) {
      p.classList.remove('active');
    });
    var target = document.getElementById('page-album');
    if (target) {
      target.classList.add('active');
    }
    document.querySelectorAll('#tab-bar .tab-item').forEach(function (tab) {
      tab.classList.remove('active');
    });
    var tabBar = document.getElementById('tab-bar');
    if (tabBar) tabBar.classList.add('hidden');
    if (window.AlbumPage) {
      AlbumPage.loadPhotos();
    }
    console.log('[Profile] 已跳转到个人相册页面');
  },

  /**
   * 跳转到个人空间页面
   */
  _switchToKongjian: function () {
    document.querySelectorAll('#app .page').forEach(function (p) {
      p.classList.remove('active');
    });
    var target = document.getElementById('page-kongjian');
    if (target) {
      target.classList.add('active');
    }
    document.querySelectorAll('#tab-bar .tab-item').forEach(function (tab) {
      tab.classList.remove('active');
    });
    var tabBar = document.getElementById('tab-bar');
    if (tabBar) tabBar.classList.add('hidden');
    if (window.KongjianPage) {
      KongjianPage.init();
    }
    console.log('[Profile] 已跳转到个人空间页面');
  }
};
