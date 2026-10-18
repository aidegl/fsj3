/**
 * 消息页面 - 会话列表 + 聊天详情
 * 会话类型：AI 助手（内置轻量聊天）/ 用户私聊 / 群聊（fsj 4交流协议，见
 * .claude/skills/fsj-skills-open/私聊.md、群聊.md）
 *
 * 依赖：ChatService / FsjApi / App
 */
var MessagePage = {
  currentConv: null,      // 当前会话 { key, type, peer, members }
  conversations: [],
  listRefreshing: false,

  // ==================== 生命周期 ====================

  _inited: false,
  init: function () {
    // 防重入：页面反复切换会多次调 init，监听/轮询只允许绑一次（否则叠加竞态）
    if (this._inited) { this.syncLoginUi(); this.refreshList(); return; }
    this._inited = true;
    // 输入探针（2026-09-05 排查"点发送 text 为空"）：实时打印输入框变化 + 元素数量
    setTimeout(function () {
      var ci = document.getElementById('chat-input');
      if (!ci) { console.log('[发送调试] init 时 #chat-input 不存在！'); return; }
      console.log('[发送调试] #chat-input 元素数量=' + document.querySelectorAll('#chat-input').length);
      ci.addEventListener('input', function () {
        console.log('[发送调试] input 事件：长度=' + ci.value.length + ' 内容=' + JSON.stringify(ci.value.slice(0, 30)));
      });
    }, 800);
    this.renderListSkeleton();
    this.refreshList();
    this.bindPolling();
    this.syncLoginUi();
    // 登录态变化时刷新 UI（账号密码登录成功后由 profile.js 广播）
    var self = this;
    window.addEventListener('wechatlogin:change', function () {
      self.syncLoginUi();
      self.refreshList();
    });
  },

  /** 未登录时的 UI（fsj 模式）+ 演示入口控制 */
  syncLoginUi: function () {
    var tip = document.getElementById('messageLoginTip');
    var merchantEntry = document.getElementById('msgMerchantEntry');
    var user = ChatService.getUser();
    var isMock = ChatService.isMock();
    // fsj 模式未登录 → 提示登录；联系商家仅 mock 演示模式提供
    if (tip) tip.style.display = (!user && !isMock) ? '' : 'none';
    if (merchantEntry) merchantEntry.style.display = isMock ? '' : 'none';
  },

  onLeave: function () {
    ChatService.stopPolling();
  },

  bindPolling: function () {
    var self = this;
    ChatService.onPeerMessage = function (convKey) {
      if (self.currentConv && self.currentConv.key === convKey) {
        self.reloadCurrentConv();
      }
      self.refreshList();
    };
    ChatService.onPeerResolved = function () {
      if (!self.currentConv) self.refreshList();
    };
    // 列表轮询（全量，低频）
    ChatService.startPolling(function () { self.refreshList(); });
    // WS 推送（chat.new 信号）：实时刷新，替代高频轮询（2026-09-05）
    if (ChatService.subscribePush) {
      ChatService.subscribePush(function (body) {
        if (self.currentConv && self.currentConv.key === body.conv) self.reloadCurrentConv();
        self.refreshList();
      });
    }
    // 兜底轮询（只查当前会话；WS 断线/漏信号时兜底，页面隐藏时自动暂停）
    this.startChatPolling();
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        self.stopChatPolling();
        ChatService.stopPolling();
      } else {
        ChatService.startPolling(function () { self.refreshList(); });
        self.startChatPolling();
        // 回前台立即补拉一次
        if (self.currentConv) self.reloadCurrentConv();
        else self.refreshList();
      }
    });
  },

  // 聊天窗内定向轮询：只拉当前会话消息，单请求、高频
  CHAT_POLL_MS: 30000,

  startChatPolling: function () {
    var self = this;
    if (this._chatPollTimer) return;
    this._chatPollTimer = setInterval(function () {
      if (self.currentConv && !document.hidden) {
        self.reloadCurrentConv();
      }
    }, this.CHAT_POLL_MS);
  },

  stopChatPolling: function () {
    if (this._chatPollTimer) {
      clearInterval(this._chatPollTimer);
      this._chatPollTimer = null;
    }
  },

  // ==================== 会话列表 ====================

  renderListSkeleton: function () {
    var container = document.getElementById('message-list');
    if (container) container.innerHTML = '<div class="msg-list-loading">加载会话中...</div>';
  },

  // ===== 会话列表本地缓存（2026-09-05 缓存优先：先秒开缓存，再静默更新）=====
  CONV_CACHE_KEY: 'fsj_conv_cache_v1',
  loadConvCache: function () {
    try {
      var c = JSON.parse(localStorage.getItem(this.CONV_CACHE_KEY) || 'null');
      return Array.isArray(c) && c.length ? c : null;
    } catch (e) { return null; }
  },
  saveConvCache: function (convs) {
    try { localStorage.setItem(this.CONV_CACHE_KEY, JSON.stringify(convs)); } catch (e) { /* 超容量忽略 */ }
  },

  refreshList: function () {
    var self = this;
    if (this.listRefreshing) return;
    if (!ChatService.getUser() && !ChatService.isMock()) {
      var c = document.getElementById('message-list');
      if (c) c.innerHTML = '';
      return;
    }
    // 缓存优先：有缓存先立即渲染（秒开），接口返回后再更新
    if (!this.conversations.length) {
      var cached = this.loadConvCache();
      if (cached) {
        this.conversations = cached;
        this.renderConversationList();
      }
    }
    this._listSeq = (this._listSeq || 0) + 1;
    var seq = this._listSeq;
    this.listRefreshing = true;
    ChatService.getConversations().then(function (convs) {
      if (seq !== self._listSeq) return;   // 过期响应：已有更新的刷新，丢弃
      self.conversations = convs;
      self.saveConvCache(convs);           // 刷新成功 → 更新本地缓存
      self.renderConversationList();
    }).catch(function (err) {
      if (seq !== self._listSeq) return;
      console.error('[MessagePage] 会话列表加载失败:', err);
      var container = document.getElementById('message-list');
      if (container) container.innerHTML = '<div class="msg-list-loading">会话加载失败：' + self.escapeHtml(err.message || '') + '</div>';
    }).then(function () {
      self.listRefreshing = false;
    });
  },

  renderConversationList: function () {
    var container = document.getElementById('message-list');
    if (!container) return;

    if (this.conversations.length === 0) {
      container.innerHTML = '<div class="msg-list-empty">' +
        '<div class="msg-list-empty-icon">💬</div>' +
        '<p>还没有会话</p>' +
        '<p class="msg-list-empty-sub">点击右上角「通讯录」或「发起群聊」开始</p>' +
        '</div>';
      return;
    }

    var self = this;
    container.innerHTML = this.conversations.map(function (conv) {
      var lastText;
      var senderPrefix = '';
      if (conv.last) {
        lastText = conv.last.neirong || '';
        var isMine = conv.last.fasongzhe === (ChatService.getUser() || {}).rowid;
        // 群聊显示发送者名
        if (conv.type === 'group' && conv.last.fasongzheName) {
          senderPrefix = (isMine ? '我' : conv.last.fasongzheName) + ': ';
        } else if (isMine && conv.type !== 'ai') {
          senderPrefix = '我: ';
        }
      } else {
        lastText = conv.type === 'ai' ? '有什么可以帮你？' : '开始新的对话';
      }
      var label = self.convTypeLabel(conv.type);
      var memberCount = (conv.type === 'group' && conv.members) ? ' (' + conv.members.length + ')' : '';
      return '<div class="message-list-item" data-conv-key="' + conv.key + '">' +
        self.renderAvatar(conv.peer, 44) +
        '<div class="msg-content">' +
          '<div class="msg-header">' +
            '<div class="msg-name">' + self.escapeHtml(conv.peer.name) + memberCount +
              (label ? ' <span class="msg-type-tag ' + conv.type + '">' + label + '</span>' : '') +
            '</div>' +
            '<div class="msg-time">' + (conv.time ? self.formatTime(conv.time) : '') + '</div>' +
          '</div>' +
          '<div class="msg-text">' + senderPrefix + self.escapeHtml(lastText).replace(/\n/g, ' ') + '</div>' +
          '<div class="msg-meta">' +
            (conv.unread > 0 ? '<span class="msg-badge">' + (conv.unread > 99 ? '99+' : conv.unread) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '</div>';
    }).join('');

    container.querySelectorAll('.message-list-item').forEach(function (item) {
      item.addEventListener('click', function () {
        var key = this.getAttribute('data-conv-key');
        var conv = self.conversations.find(function (c) { return c.key === key; });
        if (conv) self.openChat(conv);
      });
    });
  },

  convTypeLabel: function (type) {
    if (type === 'ai') return 'AI';
    if (type === 'group') return '群聊';
    if (type === 'merchant') return '商家';
    return '';
  },

  renderAvatar: function (peer, size) {
    var style = 'width:' + size + 'px;height:' + size + 'px;';
    if (peer.avatar) {
      return '<div class="msg-avatar" style="' + style + '"><img src="' + peer.avatar + '" onerror="this.style.display=\'none\'" /></div>';
    }
    var icon = peer.type === 'ai' ? '🤖' : (peer.type === 'group' ? '👥' : (peer.type === 'merchant' ? '🏪' : '👤'));
    var cls = peer.type === 'ai' ? ' avatar-ai' : (peer.type === 'group' ? ' avatar-group' : (peer.type === 'merchant' ? ' avatar-merchant' : ''));
    return '<div class="msg-avatar' + cls + '" style="' + style + '">' + icon + '</div>';
  },

  // ==================== 通讯录（联系人 + 发起群聊） ====================

  openDirectory: function () {
    var self = this;
    var mask = document.createElement('div');
    mask.className = 'chat-sheet-mask';
    var sheet = document.createElement('div');
    sheet.className = 'chat-sheet';
    sheet.innerHTML =
      '<div class="chat-sheet-header">' +
        '<span>通讯录</span>' +
        '<span class="chat-directory-actions">' +
          '<span class="chat-sheet-action" id="dirGroupBtn"><i class="fa fa-users"></i> 发起群聊</span>' +
          '<span class="chat-sheet-close">×</span>' +
        '</span>' +
      '</div>' +
      '<div class="chat-sheet-body"><div class="msg-list-loading">加载联系人...</div></div>';
    document.body.appendChild(sheet);
    document.body.appendChild(mask);

    var body = sheet.querySelector('.chat-sheet-body');
    var usersCache = null;
    var usersPromise = null;
    var usersFailed = false;

    function close() { mask.remove(); sheet.remove(); }
    mask.addEventListener('click', close);
    sheet.querySelector('.chat-sheet-close').addEventListener('click', close);

    // 加载联系人（成功后缓存；失败可重试），通讯录列表与发起群聊共用
    function loadUsers() {
      if (usersCache) return Promise.resolve(usersCache);
      if (!usersPromise || usersFailed) {
        usersFailed = false;
        usersPromise = ChatService.getChatableUsers().then(function (users) {
          usersCache = users;
          return users;
        }).catch(function (err) {
          usersFailed = true;
          throw err;
        });
      }
      return usersPromise;
    }

    function renderContactList(users) {
      if (users.length === 0) {
        body.innerHTML = '<div class="msg-list-loading">通讯录为空</div>';
        return;
      }
      body.innerHTML = users.map(function (u) {
        return '<div class="chat-user-item" data-rowid="' + u.rowid + '" data-name="' + self.escapeHtml(u.name) + '">' +
          self.renderAvatar({ type: 'user', avatar: u.avatar }, 40) +
          '<span class="chat-user-name">' + self.escapeHtml(u.name) + '</span>' +
          '<i class="fa fa-angle-right"></i></div>';
      }).join('');
      body.querySelectorAll('.chat-user-item').forEach(function (item) {
        item.addEventListener('click', function () {
          var rowid = this.getAttribute('data-rowid');
          var name = this.getAttribute('data-name');
          close();
          self.startUserChat(rowid, name);
        });
      });
    }

    // 发起群聊：切换为多选模式（群名输入与创建按钮固定在底部栏，不随列表滚动）
    function renderGroupSelect(users) {
      var selected = [];
      body.innerHTML = users.map(function (u) {
        return '<div class="chat-user-item chat-user-selectable" data-rowid="' + u.rowid + '">' +
          '<span class="chat-check"><i class="fa fa-check"></i></span>' +
          self.renderAvatar({ type: 'user', avatar: u.avatar }, 40) +
          '<span class="chat-user-name">' + self.escapeHtml(u.name) + '</span>' +
          '</div>';
      }).join('');

      var footer = document.createElement('div');
      footer.className = 'chat-sheet-footer';
      footer.innerHTML =
        '<div class="chat-group-name-row">' +
          '<input type="text" class="chat-group-name-input" id="dirGroupName" placeholder="群聊名称（如：项目讨论组）" />' +
        '</div>' +
        '<button class="chat-create-group-btn" id="dirCreateBtn" disabled>' +
          '<i class="fa fa-users"></i> 创建群聊（<span id="dirCount">0</span> 人）</button>';
      sheet.appendChild(footer);

      body.querySelectorAll('.chat-user-selectable').forEach(function (item) {
        item.addEventListener('click', function () {
          var rid = this.getAttribute('data-rowid');
          var pos = selected.indexOf(rid);
          if (pos === -1) { selected.push(rid); this.classList.add('selected'); }
          else { selected.splice(pos, 1); this.classList.remove('selected'); }
          footer.querySelector('#dirCount').textContent = selected.length;
          footer.querySelector('#dirCreateBtn').disabled = selected.length === 0;
        });
      });

      footer.querySelector('#dirCreateBtn').addEventListener('click', function () {
        var groupName = (footer.querySelector('#dirGroupName').value || '').trim();
        if (!groupName) { MessagePage.showToast('请输入群聊名称'); return; }
        if (selected.length === 0) { MessagePage.showToast('请选择群成员'); return; }
        MessagePage.createGroup(groupName, selected, close);
      });
    }

    // 立即绑定：无论联系人加载成功/失败/为空，按钮都可点
    sheet.querySelector('#dirGroupBtn').addEventListener('click', function () {
      if (body.querySelector('#dirCreateBtn')) return; // 已在多选模式：不重渲染，保留已勾选成员
      if (!usersCache) body.innerHTML = '<div class="msg-list-loading">加载联系人...</div>';
      loadUsers().then(renderGroupSelect).catch(function (err) {
        body.innerHTML = '<div class="msg-list-loading">加载失败：' + self.escapeHtml(err.message || '') + '</div>';
      });
    });

    loadUsers().then(renderContactList).catch(function (err) {
      body.innerHTML = '<div class="msg-list-loading">加载失败：' + self.escapeHtml(err.message || '') + '</div>';
    });
  },

  /** 与某用户私聊：先打开聊天窗；会话记录延迟到首条消息发出时创建（避免误点产生空会话） */
  startUserChat: function (peerRowid, peerName) {
    var self = this;
    var peer = { type: 'user', name: peerName || '用户', avatar: '', rowid: peerRowid };
    if (ChatService.isMock()) {
      var user = ChatService.getUser();
      var key = 'u_' + [user.rowid, peerRowid].sort().join('_');
      this.openChat({ key: key, type: 'user', peer: peer, members: [] });
      return;
    }
    // 先查已有会话；查到直接打开，查不到进入待定会话（发送首条消息时创建）
    ChatService.fsjFindPrivate(peer).then(function (convKey) {
      if (convKey) {
        self.openChat({ key: convKey, type: 'user', peer: peer, members: [] });
      } else {
        self.openChat({ key: 'pending_' + peerRowid, type: 'user', peer: peer, members: [], _pending: true });
      }
    }).catch(function (err) {
      self.showToast('打开会话失败：' + (err.message || ''), 'error');
    });
  },

  /** 建群并打开 */
  createGroup: function (groupName, memberRowids, closeFn) {
    var self = this;
    if (ChatService.isMock()) {
      this.showToast('演示模式不支持建群');
      return;
    }
    this.showToast('正在创建群聊...');
    ChatService.fsjCreateGroup(groupName, memberRowids).then(function (groupRowid) {
      if (closeFn) closeFn();
      self.showToast('群聊已创建');
      self.openChat({
        key: groupRowid,
        type: 'group',
        peer: { type: 'group', name: groupName, avatar: '', rowid: groupRowid, members: [] },
        members: []
      });
      self.refreshList();
    }).catch(function (err) {
      self.showToast('建群失败：' + (err.message || ''), 'error');
    });
  },

  /** 打开与商家的客服会话（仅 mock 演示） */
  openMerchantChat: function () {
    var self = this;
    ChatService.getMerchantInfo().then(function (m) {
      var user = ChatService.getUser();
      var key = 's_' + m.rowid + '_' + (user ? user.rowid : 'demo-user');
      self.openChat({ key: key, type: 'merchant', peer: { type: 'merchant', name: m.name + ' · 客服', avatar: '', rowid: m.rowid }, members: [] });
    });
  },

  // ==================== 聊天详情 ====================

  openChat: function (conv) {
    this.currentConv = conv;
    ChatService.markRead(conv.key);

    var chatPage = document.getElementById('page-chat');
    if (!chatPage) return;

    // 顶栏
    document.getElementById('chat-peer-avatar').innerHTML = this.renderAvatar(conv.peer, 34);
    var title = conv.peer.name || '会话';
    if (conv.type === 'group' && conv.members && conv.members.length) {
      title += ' (' + conv.members.length + ')';
    }
    document.getElementById('chat-peer-name').textContent = title;
    document.getElementById('chat-clear-btn').style.display = conv.type === 'ai' ? '' : 'none';

    App.switchPage('chat');
    document.getElementById('tab-bar').classList.add('hidden');

    document.getElementById('chat-input').value = '';
    this.renderChatMessages(null);
    this.reloadCurrentConv();
  },

  /** 重新拉取当前会话消息并渲染（silent=轮询模式：无新消息不重绘，不打断滚动/流式） */
  MSG_CACHE_PREFIX: 'fsj_msg_cache_',
  loadMsgCache: function (key) {
    try {
      var c = JSON.parse(localStorage.getItem(this.MSG_CACHE_PREFIX + key) || 'null');
      return Array.isArray(c) ? c : null;
    } catch (e) { return null; }
  },
  saveMsgCache: function (key, rows) {
    try {
      var trimmed = rows.slice(-200);   // 最多缓存最近 200 条
      localStorage.setItem(this.MSG_CACHE_PREFIX + key, JSON.stringify(trimmed));
    } catch (e) { /* 超容量忽略 */ }
  },

  reloadCurrentConv: function (silent) {
    var self = this;
    if (!this.currentConv) return;
    var key = this.currentConv.key;
    if (silent && this._streaming) return; // 流式输出中不重绘
    // 缓存优先：每次进会话都先渲染缓存消息（秒开），再拉最新覆盖
    var cachedMsgs = this.loadMsgCache(key);
    if (cachedMsgs && cachedMsgs.length && this.currentConv.key === key) {
      this.renderChatMessages(cachedMsgs);
    }
    ChatService.getConvMessages(key).then(function (rows) {
      // 过期守卫：查询期间切走了会话 → 丢弃旧结果（防止把别的会话的消息渲染进来）
      if (!self.currentConv || self.currentConv.key !== key) return;
      self.saveMsgCache(key, rows);
      var list = rows;
      if (list.length === 0 && self.currentConv.type === 'ai') {
        list = [{
          rowid: 'welcome', huiche: self.currentConv.key, leixing: '智能体',
          neirong: '你好呀！我是你的 AI 助手 🤖\n可以问我商品、订单、积分，也能帮你写文案、出主意～',
          fasongzhe: 'agent', ctime: self.nowStr()
        }];
      }
      // 轮询模式：消息数量没变就不重绘
      if (silent && self._renderedCount === list.length) return;
      self._renderedCount = list.length;
      self.renderChatMessages(list);
      ChatService.markRead(self.currentConv.key);
    });
  },

  closeChat: function () {
    this.currentConv = null;
    ChatService.stopPolling();
    App.switchPage('message');
    this.refreshList();
    var self = this;
    ChatService.startPolling(function () { self.refreshList(); });
  },

  // ==================== 消息渲染 ====================

  renderChatMessages: function (rows) {
    var listEl = document.getElementById('chat-msg-list');
    if (!listEl) return;

    if (rows === null) {
      listEl.innerHTML = '<div class="chat-loading">加载中...</div>';
      return;
    }
    if (rows.length === 0) {
      listEl.innerHTML = '<div class="chat-empty">开始你们的对话吧 👇</div>';
      return;
    }

    var user = ChatService.getUser();
    var self = this;
    var conv = this.currentConv || {};
    var html = '';
    var lastDay = '';
    rows.forEach(function (r) {
      var day = (r.ctime || '').split(' ')[0];
      if (day && day !== lastDay) {
        html += '<div class="chat-day-divider"><span>' + MessagePage.formatDay(day) + '</span></div>';
        lastDay = day;
      }
      var mine = user && r.fasongzhe === user.rowid;
      html += MessagePage.renderBubble(r, mine, user, conv);
    });
    listEl.innerHTML = html;
    this.scrollChatBottom();
  },

  renderBubble: function (r, mine, user, conv) {
    var isAgent = r.leixing === '智能体';
    var isMerchant = r.leixing === '商家';
    var avatarHtml;
    if (mine) {
      avatarHtml = '<div class="chat-avatar mine">' + this.escapeHtml(((user && user.name) || '我').charAt(0)) + '</div>';
    } else if (isAgent) {
      avatarHtml = '<div class="chat-avatar ai">🤖</div>';
    } else if (isMerchant) {
      avatarHtml = '<div class="chat-avatar merchant">🏪</div>';
    } else {
      var name = r.fasongzheName || (conv.peer && conv.peer.name) || '友';
      avatarHtml = '<div class="chat-avatar">' + this.escapeHtml(name.charAt(0)) + '</div>';
    }

    // 群聊气泡上方显示发送者名（对方的）
    var senderHtml = '';
    if (conv.type === 'group' && !mine && r.fasongzheName) {
      senderHtml = '<div class="chat-sender-name">' + this.escapeHtml(r.fasongzheName) + '</div>';
    }

    var statusHtml = '';
    if (mine && r._sendState === 'sending') {
      statusHtml = '<span class="chat-msg-status"><i class="fa fa-clock-o"></i></span>';
    } else if (mine && r._sendState === 'failed') {
      statusHtml = '<span class="chat-msg-status failed"><i class="fa fa-exclamation-circle"></i></span>';
    }

    // 正文：转义后渲染 @ 占位
    var bodyHtml = this.escapeHtml(r.neirong || '').replace(/\n/g, '<br/>');
    if (conv.type === 'group' || (conv.members && conv.members.length)) {
      bodyHtml = ChatService.renderMentions(bodyHtml, conv.members);
    }

    return '<div class="chat-msg-row ' + (mine ? 'mine' : 'theirs') + '" data-rowid="' + r.rowid + '">' +
      (mine ? statusHtml : '') +
      avatarHtml +
      '<div class="chat-bubble-wrap">' +
        senderHtml +
        '<div class="chat-bubble">' + bodyHtml + '</div>' +
        '<div class="chat-msg-time">' + this.formatClock(r.ctime) + '</div>' +
      '</div>' +
      '</div>';
  },

  appendBubble: function (row) {
    var listEl = document.getElementById('chat-msg-list');
    if (!listEl) return;
    var empty = listEl.querySelector('.chat-empty, .chat-loading');
    if (empty) empty.remove();
    var user = ChatService.getUser();
    var mine = user && row.fasongzhe === user.rowid;
    var wrap = document.createElement('div');
    wrap.innerHTML = this.renderBubble(row, mine, user, this.currentConv || {});
    listEl.appendChild(wrap.firstChild);
    this.scrollChatBottom();
  },

  updateStreamingBubble: function (text) {
    var listEl = document.getElementById('chat-msg-list');
    if (!listEl) return;
    var el = listEl.querySelector('.chat-bubble.streaming');
    if (!el) {
      var row = { rowid: 'streaming', leixing: '智能体', neirong: text, ctime: this.nowStr(), fasongzhe: 'agent' };
      var wrap = document.createElement('div');
      wrap.innerHTML = this.renderBubble(row, false, ChatService.getUser(), this.currentConv || {});
      var node = wrap.firstChild;
      node.querySelector('.chat-bubble').classList.add('streaming');
      listEl.appendChild(node);
      this.scrollChatBottom();
      return;
    }
    el.innerHTML = this.escapeHtml(text).replace(/\n/g, '<br/>') + '<span class="chat-streaming-cursor">▌</span>';
    this.scrollChatBottom(true);
  },

  finishStreamingBubble: function () {
    var el = document.querySelector('.chat-bubble.streaming');
    if (el) {
      el.classList.remove('streaming');
      var cursor = el.querySelector('.chat-streaming-cursor');
      if (cursor) cursor.remove();
    }
  },

  scrollChatBottom: function (gentle) {
    var page = document.querySelector('#page-chat .page-content');
    if (page) page.scrollTop = gentle ? page.scrollHeight - 1 : page.scrollHeight;
  },

  // ==================== 发送 ====================

  sendMessage: function () {
    var input = document.getElementById('chat-input');
    var text = (input.value || '').trim();
    var user0 = ChatService.getUser();
    var dbg0 = '[发送调试] 点击发送：text=' + JSON.stringify(text) +
      ' | conv=' + (this.currentConv ? this.currentConv.key + '/' + this.currentConv.type : '(null)') +
      ' | user=' + (user0 ? user0.rowid : '(未登录)');
    console.log(dbg0);
    if (typeof window.logDebug === 'function') window.logDebug(dbg0);
    if (!text || !this.currentConv) {
      console.log('[发送调试] 早退：' + (!text ? '文本为空' : '无当前会话') +
        ' | #chat-input 数量=' + document.querySelectorAll('#chat-input').length +
        ' | 实时值=' + JSON.stringify(input.value));
      return;
    }
    input.value = '';
    this.autoResizeInput();

    var self = this;
    var conv = this.currentConv;

    if (conv.type === 'ai') {
      console.log('[发送调试] AI 会话通道');
      this.appendBubble({
        rowid: 'tmp-u-' + Date.now(), leixing: '用户', neirong: text,
        fasongzhe: (ChatService.getUser() || {}).rowid || '', ctime: this.nowStr()
      });
      this.setSending(true);
      this._streaming = true;
      ChatService.sendToAgent(text, function (chunk) {
        if (chunk.type === 'delta' || chunk.type === 'progress') {
          self.updateStreamingBubble(chunk.content);
        } else if (chunk.type === 'result') {
          if (chunk.content) self.updateStreamingBubble(chunk.content);
          self.finishStreamingBubble();
        }
      }).then(function () {
        self._streaming = false;
        self.setSending(false);
        self.reloadCurrentConv(true);
      }).catch(function (err) {
        console.error('[MessagePage] AI 回复失败:', err);
        self._streaming = false;
        self.setSending(false);
        self.finishStreamingBubble();
        self.appendBubble({
          rowid: 'err-' + Date.now(), leixing: '系统', neirong: '回复失败，请稍后重试',
          fasongzhe: 'system', ctime: self.nowStr()
        });
      });
      return;
    }

    // 真人 / 群聊 / 商家
    if (!ChatService.getUser()) {
      console.log('[发送调试] 早退：未登录（getUser 为 null）');
      this.showToast('请先登录后再发送');
      return;
    }
    if (ChatService.isReadOnly()) {
      console.log('[发送调试] 早退：调试视角只读');
      this.showToast('调试视角只读，不能发送消息');
      input.value = text; // 还原输入
      return;
    }
    console.log('[发送调试] 走 fsj 协议发送：conv=' + conv.key + ' text长度=' + text.length);
    var self = this;
    var conv = this.currentConv;

    // 待定私聊：首条消息发出时才创建会话记录
    var sendPromise;
    if (conv._pending) {
      sendPromise = ChatService.fsjEnsurePrivate(conv.peer).then(function (convKey) {
        conv.key = convKey;
        delete conv._pending;
        return ChatService.sendMessage(conv, text);
      });
    } else {
      sendPromise = ChatService.sendMessage(conv, text);
    }

    var optRow = {
      rowid: 'tmp-' + Date.now(), leixing: '用户', neirong: text,
      fasongzhe: (ChatService.getUser() || {}).rowid, ctime: this.nowStr(), _sendState: 'sending'
    };
    this.appendBubble(optRow);
    sendPromise.then(function () {
      console.log('[发送调试] ✅ 发送成功（已落库+已广播）');
      var el = document.querySelector('.chat-msg-row[data-rowid="' + optRow.rowid + '"] .chat-msg-status');
      if (el) el.remove();
    }).catch(function (err) {
      console.log('[发送调试] ❌ 发送失败：' + (err.message || err));
      if (typeof window.logDebug === 'function') window.logDebug('[发送] ❌ 失败：' + (err.message || err));
      var el = document.querySelector('.chat-msg-row[data-rowid="' + optRow.rowid + '"] .chat-msg-status');
      if (el) { el.classList.add('failed'); el.innerHTML = '<i class="fa fa-exclamation-circle"></i>'; }
      self.showToast('发送失败：' + (err.message || '请检查网络'));
    });
  },

  setSending: function (on) {
    var btn = document.getElementById('chat-send-btn');
    if (btn) btn.disabled = on;
  },

  // ==================== 工具 ====================

  formatTime: function (ctime) {
    if (!ctime) return '';
    var d = new Date(String(ctime).replace(/-/g, '/'));
    var now = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : n; };
    var hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (isNaN(d.getTime())) return '';
    if (d.toDateString() === now.toDateString()) return hm;
    var yesterday = new Date(now.getTime() - 86400000);
    if (d.toDateString() === yesterday.toDateString()) return '昨天';
    if (now - d < 7 * 86400000) return '周' + '日一二三四五六'[d.getDay()];
    return (d.getMonth() + 1) + '/' + d.getDate();
  },

  formatClock: function (ctime) {
    if (!ctime) return '';
    var d = new Date(String(ctime).replace(/-/g, '/'));
    if (isNaN(d.getTime())) return '';
    var pad = function (n) { return n < 10 ? '0' + n : n; };
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  },

  formatDay: function (day) {
    var d = new Date(String(day).replace(/-/g, '/'));
    var now = new Date();
    if (isNaN(d.getTime())) return day;
    if (d.toDateString() === now.toDateString()) return '今天';
    var yesterday = new Date(now.getTime() - 86400000);
    if (d.toDateString() === yesterday.toDateString()) return '昨天';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  },

  nowStr: function () {
    var d = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  },

  autoResizeInput: function () {
    var input = document.getElementById('chat-input');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 90) + 'px';
  },

  showToast: function (msg, type) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'show' + (type === 'error' ? ' toast-error' : '');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.className = ''; }, 2200);
  },

  escapeHtml: function (s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
};

// 全局事件绑定（HTML 内联 onclick）
function msgOpenDirectory() { MessagePage.openDirectory(); }
function msgOpenMerchantChat() { MessagePage.openMerchantChat(); }
function msgCloseChat() { MessagePage.closeChat(); }
function msgSend() { MessagePage.sendMessage(); }
function msgClearAiChat() {
  if (!MessagePage.currentConv || MessagePage.currentConv.type !== 'ai') return;
  var key = MessagePage.currentConv.key;
  ChatService.clearMockConversation(key);
  MessagePage.openChat(MessagePage.currentConv);
  MessagePage.showToast('会话已清空');
}
