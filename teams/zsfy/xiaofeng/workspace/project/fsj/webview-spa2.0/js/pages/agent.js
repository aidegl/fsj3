/**
 * 智能体聊天页面
 */
var AgentPage = {
  messages: [],
  inputText: '',
  isAITyping: false,
  hasStreamingMsg: false,
  videoResources: null,
  immersiveMessages: [],
  immersiveDisplayPos: 0,
  ttsEnabled: true,
  ttsCurrentAudio: null,
  ttsSentenceQueue: [],
  ttsSentenceIndex: 0,
  ttsCurrentSentence: '',
  ttsProcessing: false,
  ttsTextPos: 0,
  // 聊天历史（localStorage 持久化，格式: [{role, content}]）
  chatHistory: [],
  maxHistoryCount: 20,
  historyKey: 'fsj_chat_history',

  // 内容类型检测（HTML/DOC/PPT/TEXT）
  _contentType: 'text',
  _contentRaw: '',

  init: function () {
    this._init(true);
  },

  /**
   * 初始化（不恢复沉浸模式）- 用于全局 init 调用
   */
  initWithoutRestore: function () {
    this._init(false);
  },

  /**
   * 内部初始化
   * @param {boolean} restoreMode - 是否恢复沉浸模式
   */
  _init: function (restoreMode) {
    if (!window._consoleLogs) {
      window._consoleLogs = [];
      var origLog = console.log;
      var origWarn = console.warn;
      var origErr = console.error;
      console.log = function () {
        window._consoleLogs.push({ type: 'log', msg: Array.prototype.map.call(arguments, String).join(' ') });
        origLog.apply(console, arguments);
      };
      console.warn = function () {
        window._consoleLogs.push({ type: 'warn', msg: Array.prototype.map.call(arguments, String).join(' ') });
        origWarn.apply(console, arguments);
      };
      console.error = function () {
        window._consoleLogs.push({ type: 'error', msg: Array.prototype.map.call(arguments, String).join(' ') });
        origErr.apply(console, arguments);
      };
    }

    this.renderAgentTopBar();
    this.loadChatHistory();
    this.renderWelcome();
    this.renderQuickActions();
    this.renderInputArea();
    this.bindInputEvents();
    this.bindQuickActionEvents();
    this.bindTopBtnEvents();
    if (restoreMode) this.restoreAgentMode();
    this.loadTtsSetting();
  },

  loadTtsSetting: function () {
    var stored = localStorage.getItem('fsj_tts_enabled');
    if (stored === null) localStorage.setItem('fsj_tts_enabled', '1');
    this.ttsEnabled = stored === null ? true : stored === '1';
    var voiceBtn = document.getElementById('chat-voice-btn');
    if (voiceBtn) voiceBtn.classList.toggle('tts-on', this.ttsEnabled);
  },

  /** 加载聊天历史 */
  loadChatHistory: function () {
    try {
      var stored = localStorage.getItem(this.historyKey);
      if (stored) this.chatHistory = JSON.parse(stored);
    } catch (e) { this.chatHistory = []; }
  },

  /** 保存聊天历史 */
  saveChatHistory: function () {
    try {
      localStorage.setItem(this.historyKey, JSON.stringify(this.chatHistory));
    } catch (e) {
      if (this.chatHistory.length > 4) {
        this.chatHistory = this.chatHistory.slice(-this.maxHistoryCount / 2);
        localStorage.setItem(this.historyKey, JSON.stringify(this.chatHistory));
      }
    }
  },

  /** 添加消息到历史 */
  addMessageToHistory: function (role, content) {
    this.chatHistory.push({ role: role, content: content });
    if (this.chatHistory.length > this.maxHistoryCount) {
      this.chatHistory = this.chatHistory.slice(-this.maxHistoryCount);
    }
    this.saveChatHistory();
  },

  /** 清空聊天历史 */
  clearChatHistory: function () {
    this.chatHistory = [];
    localStorage.removeItem(this.historyKey);
  },

  /** 将历史消息拼接到当前输入内容前 */
  buildContentWithContext: function (currentContent) {
    if (this.chatHistory.length === 0) {
      console.log('[AgentPage] 无历史记录，直接发送当前内容:', currentContent);
      return currentContent;
    }

    var parts = [];
    var history = this.chatHistory.slice(-20);

    console.log('[AgentPage] 当前历史记录条数:', history.length);
    console.log('[AgentPage] 历史记录:', JSON.stringify(history));

    parts.push('以下是之前的对话历史，请根据上下文继续回答：\n');
    for (var i = 0; i < history.length; i++) {
      var msg = history[i];
      var role = msg.role === 'user' ? '用户' : '助手';
      parts.push(role + '：' + msg.content);
    }
    parts.push('\n---\n当前问题：\n' + currentContent);

    var finalContent = parts.join('\n\n');
    console.log('[AgentPage] 拼接后的完整 content:', finalContent.substring(0, 200) + '...');
    return finalContent;
  },

  toggleTts: function () {
    this.ttsEnabled = !this.ttsEnabled;
    localStorage.setItem('fsj_tts_enabled', this.ttsEnabled ? '1' : '0');
    var voiceBtn = document.getElementById('chat-voice-btn');
    if (voiceBtn) voiceBtn.classList.toggle('tts-on', this.ttsEnabled);
    if (!this.ttsEnabled) TtsService.stop();
  },

  /** 开始新对话 */
  startNewChat: function () {
    var mode = localStorage.getItem('fsj_agent_mode') || '0';
    if (!confirm('确定要开始新对话吗？当前对话记录将被清除。')) return;

    this.clearChatHistory();
    this.resetTts();

    if (mode === '1') {
      this.immersiveMessages = [];
      this.immersiveDisplayPos = 0;
      this.renderImmersiveMessages();
    } else {
      var list = document.getElementById('chat-message-list');
      if (list) list.innerHTML = '';
      this.messages = [];
      var welcome = document.getElementById('chat-welcome');
      if (welcome) welcome.style.display = '';
      var container = document.getElementById('chat-container');
      if (container) container.classList.remove('has-messages');
    }
  },

  restoreAgentMode: function () {
    var mode = localStorage.getItem('fsj_agent_mode') || '0';
    if (mode === '1') this.loadVideoResources();
  },

  loadVideoResources: function () {
    var self = this;
    var shuohuaId = localStorage.getItem('fsj_shuohua_id');
    var bushuohuaId = localStorage.getItem('fsj_bushuohua_id');

    if (!shuohuaId || !bushuohuaId) {
      this.renderImmersiveMode();
      return;
    }

    AgentVideoService.getAllResources(shuohuaId, bushuohuaId)
      .then(function (resources) {
        self.videoResources = resources;
        self.renderImmersiveMode();
      })
      .catch(function (e) {
        self.renderImmersiveMode();
      });
  },

  switchAgentVideo: function (speaking) {
    var videoEl = document.getElementById('immersive-agent-video');
    if (!videoEl || !this.videoResources) return;
    if (this._videoSpeaking === speaking) return;
    this._videoSpeaking = speaking;

    var url = speaking ? this.videoResources.bushuohua : this.videoResources.shuohua;
    if (!url) return;

    videoEl.src = url;
    videoEl.play().catch(function () {});
  },

  renderAgentTopBar: function () {
    var agentId = localStorage.getItem('fsj_agent_id');
    this.currentAgent = {
      id: agentId || '',
      name: '童小智',
      avatar: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%232563EB" width="100" height="100"/><text x="50" y="65" font-size="50" fill="white" text-anchor="middle" dominant-baseline="middle">智</text></svg>',
      title: '技术总监'
    };

    var avatarEl = document.getElementById('agent-avatar-top');
    var nameEl = document.getElementById('agent-name-top');
    if (avatarEl) avatarEl.src = this.currentAgent.avatar;
    if (nameEl) nameEl.textContent = this.currentAgent.name;
  },

  bindTopBtnEvents: function () {
    var self = this;
    document.querySelectorAll('.agent-top-btn[data-panel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var panel = btn.getAttribute('data-panel');
        self.handleTopPanel(panel);
      });
    });

    var logViewBtn = document.getElementById('btn-log-view');
    if (logViewBtn) {
      logViewBtn.addEventListener('click', function () { self.showLogViewer(); });
    }

    var newChatBtn = document.getElementById('btn-new-chat');
    if (newChatBtn) {
      newChatBtn.addEventListener('click', function () { self.startNewChat(); });
    }
  },

  showLogViewer: function () {
    var existing = document.getElementById('log-viewer-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'log-viewer-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;';

    var header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:#1a1a2e;color:#fff;flex-shrink:0;';
    header.innerHTML = '<span style="font-size:16px;font-weight:600;">日志</span><button id="log-viewer-close" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;padding:0 8px;">✕</button>';

    var logContent = document.createElement('div');
    logContent.id = 'log-viewer-content';
    logContent.style.cssText = 'flex:1;overflow:auto;padding:12px 16px;font-family:monospace;font-size:12px;color:#e0e0e0;line-height:1.5;';

    var logs = window._consoleLogs || [];
    logContent.innerHTML = logs.map(function (l) {
      var color = '#e0e0e0';
      if (l.type === 'error') color = '#ff6b6b';
      else if (l.type === 'warn') color = '#ffa94d';
      return '<div style="color:' + color + ';border-bottom:1px solid #333;padding:2px 0;">' + l.msg + '</div>';
    }).join('') || '<div style="color:#666;">暂无日志</div>';

    overlay.appendChild(header);
    overlay.appendChild(logContent);
    document.body.appendChild(overlay);

    document.getElementById('log-viewer-close').addEventListener('click', function () { overlay.remove(); });
  },

  handleTopPanel: function (panel) {
    switch (panel) {
      case 'tasks':
        alert('任务队列：查看和管理智能体任务');
        break;
      case 'settings':
        this.renderSettingsModal();
        break;
    }
  },

  renderSettingsModal: function () {
    var existing = document.getElementById('agent-settings-modal');
    if (existing) existing.remove();

    var currentMode = localStorage.getItem('fsj_agent_mode') || '0';
    var ttsOn = this.ttsEnabled;

    var modal = document.createElement('div');
    modal.id = 'agent-settings-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML =
      '<div class="modal-content agent-settings-modal">' +
        '<div class="modal-header">' +
          '<h3 class="modal-title">设置</h3>' +
          '<span class="modal-close" id="agent-settings-close">✕</span>' +
        '</div>' +
        '<div class="agent-settings-body">' +
          '<div class="settings-section">' +
            '<div class="settings-section-title">语音朗读</div>' +
            '<div class="settings-section-desc">AI 回复后用星宝语音朗读</div>' +
            '<div class="toggle-row">' +
              '<span class="toggle-label">语音开关</span>' +
              '<div class="toggle-switch' + (ttsOn ? ' on' : '') + '" id="tts-toggle">' +
                '<div class="toggle-knob"></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="settings-divider"></div>' +
          '<div class="settings-section">' +
            '<div class="settings-section-title">灵魂设置</div>' +
            '<div class="settings-section-desc">配置智能体的性格、语气和知识库</div>' +
            '<div class="settings-action-btn" data-action="soul">进入设置 ›</div>' +
          '</div>' +
          '<div class="settings-divider"></div>' +
          '<div class="settings-section">' +
            '<div class="settings-section-title">模式切换</div>' +
            '<div class="mode-switch-row">' +
              '<div class="mode-option' + (currentMode === '0' ? ' active' : '') + '" data-mode="0">' +
                '<span class="mode-icon">💬</span>' +
                '<span class="mode-name">普通模式</span>' +
              '</div>' +
              '<div class="mode-option' + (currentMode === '1' ? ' active' : '') + '" data-mode="1">' +
                '<span class="mode-icon">🏠</span>' +
                '<span class="mode-name">沉浸模式</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    this.bindSettingsModalEvents();
  },

  bindSettingsModalEvents: function () {
    var self = this;
    var modal = document.getElementById('agent-settings-modal');
    var closeBtn = document.getElementById('agent-settings-close');

    if (closeBtn) closeBtn.addEventListener('click', function () { self.closeSettingsModal(); });
    if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) self.closeSettingsModal(); });

    var ttsToggle = document.getElementById('tts-toggle');
    if (ttsToggle) {
      ttsToggle.addEventListener('click', function () {
        self.toggleTts();
        ttsToggle.classList.toggle('on', self.ttsEnabled);
      });
    }

    document.querySelectorAll('.mode-option').forEach(function (el) {
      el.addEventListener('click', function () {
        var mode = el.getAttribute('data-mode');
        self.switchAgentMode(mode);
      });
    });

    var soulBtn = document.querySelector('.settings-action-btn[data-action="soul"]');
    if (soulBtn) soulBtn.addEventListener('click', function () { alert('灵魂设置：配置智能体的性格、语气和知识库（开发中）'); });
  },

  closeSettingsModal: function () {
    var modal = document.getElementById('agent-settings-modal');
    if (modal) modal.remove();
  },

  showAnalysisUploadModal: function () {
    var existing = document.getElementById('analysis-upload-modal');
    if (existing) existing.remove();

    this._analysisImages = [];

    var modal = document.createElement('div');
    modal.id = 'analysis-upload-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML =
      '<div class="analysis-modal">' +
        '<div class="analysis-modal-header">' +
          '<h3>错题分析</h3>' +
          '<span class="analysis-modal-close">✕</span>' +
        '</div>' +
        '<div class="analysis-modal-body">' +
          '<p class="analysis-modal-desc">上传错题照片，AI 将为你分析错因并给出解题思路</p>' +
          '<div class="analysis-upload-area" id="analysis-upload-area">' +
            '<div class="upload-icon">📷</div>' +
            '<div class="upload-text">点击拍照或选择图片</div>' +
            '<input type="file" id="analysis-file-input" accept="image/*" capture="environment" multiple style="display:none" />' +
          '</div>' +
          '<div class="analysis-preview-list" id="analysis-preview-list"></div>' +
          '<div class="analysis-modal-footer">' +
            '<button type="button" class="analysis-btn analysis-btn-cancel" id="analysis-cancel-btn">取消</button>' +
            '<button type="button" class="analysis-btn analysis-btn-submit" id="analysis-submit-btn">开始分析</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    this.bindAnalysisModalEvents();
  },

  bindAnalysisModalEvents: function () {
    var self = this;
    var modal = document.getElementById('analysis-upload-modal');
    var closeBtn = modal.querySelector('.analysis-modal-close');
    var cancelBtn = document.getElementById('analysis-cancel-btn');
    var submitBtn = document.getElementById('analysis-submit-btn');
    var uploadArea = document.getElementById('analysis-upload-area');
    var fileInput = document.getElementById('analysis-file-input');

    function closeModal() { var m = document.getElementById('analysis-upload-modal'); if (m) m.remove(); }

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', function (e) { e.stopPropagation(); if (e.target === modal) closeModal(); });

    if (uploadArea) {
      uploadArea.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); if (fileInput) fileInput.click(); });
    }

    if (fileInput) {
      fileInput.addEventListener('change', function (e) { e.preventDefault(); self.handleAnalysisFiles(e.target.files); });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); self.submitAnalysis(); closeModal(); });
    }
  },

  handleAnalysisFiles: function (files) {
    var self = this;
    if (!files || files.length === 0) return;

    var previewList = document.getElementById('analysis-preview-list');
    if (!previewList) return;

    var uploadArea = document.getElementById('analysis-upload-area');
    if (uploadArea) uploadArea.style.display = 'none';

    Array.from(files).forEach(function (file) {
      if (!file.type.startsWith('image/')) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        var dataUrl = e.target.result;
        self._analysisImages.push(dataUrl);

        var item = document.createElement('div');
        item.className = 'analysis-preview-item';
        item.innerHTML = '<img src="' + dataUrl + '" /><div class="preview-remove" data-idx="' + (self._analysisImages.length - 1) + '">✕</div>';
        previewList.appendChild(item);

        item.querySelector('.preview-remove').addEventListener('click', function (ev) {
          ev.stopPropagation();
          var idx = parseInt(this.getAttribute('data-idx'));
          self._analysisImages[idx] = null;
          item.remove();
          if (self._analysisImages.filter(Boolean).length === 0) {
            self._analysisImages = [];
            if (uploadArea) uploadArea.style.display = '';
          }
        });
      };
      reader.readAsDataURL(file);
    });
  },

  /**
   * 统一的 AI 回调处理器
   */
  _handleAiEvent: function (event, mode) {
    var self = this;
    var isImmersive = mode === '1';

    if (event.type === 'progress') {
      if (isImmersive) {
        if (event.content) self.streamTts(event.content);
      } else {
        // 检测内容类型
        self._detectContentType(event.content);
        if (self._contentType === 'text') {
          self.updateStreamingBubble(event.content || (event.nodeTitle + '...'));
        }
        // HTML/DOC/PPT：流式时不显示内容，等 result 再渲染
      }
    } else if (event.type === 'delta') {
      if (isImmersive) {
        self.streamTts(event.delta);
      } else {
        self._detectContentType(event.content || '');
        if (self._contentType === 'text') {
          self.appendImmersiveDelta(event.delta);
        }
      }
    } else if (event.type === 'result') {
      self._contentRaw = event.content || '';
      // 去掉前缀标签 [0] 或 [1]
      var cleanContent = self._stripFormatTag(event.content || '');
      // 保存 AI 回复到历史（保存纯净内容）
      if (cleanContent) {
        self.addMessageToHistory('assistant', cleanContent);
        console.log('[AgentPage] AI 回复已入库，当前历史总条数:', self.chatHistory.length);
      }
      if (isImmersive) {
        // 沉浸模式：渲染富内容
        if (self._contentType !== 'text') {
          self.addImmersiveUserMessage(self._renderRichContent(self._contentType, event.content));
        }
      } else {
        // 普通模式：渲染最终内容
        if (self._contentType === 'text') {
          self.updateStreamingBubble(event.content);
          self.finalizeStreamingBubble();
        } else {
          self.updateStreamingBubble(self._renderRichContent(self._contentType, event.content));
          self.finalizeStreamingBubble();
        }
      }
    } else if (event.type === 'done') {
      if (isImmersive) {
        self.finalizeTts();
        if (!self.ttsEnabled || self.ttsSentenceQueue.length === 0) self.finalizeStreamingBubble();
      } else {
        self.finalizeStreamingBubble();
      }
      // 重置类型状态
      self._resetContentType();
    }
  },

  submitAnalysis: function () {
    var images = this._analysisImages.filter(Boolean);
    var demoPrompt = '上面有一道方程题 2x + 3 = 7，学生选了 C. x=5（错误答案，正确应为 x=2），带有红色圈和叉号标记';
    var text = '📊 错题分析';
    if (images.length > 0) text = '📊 错题分析（' + images.length + '张图片）';

    var mode = localStorage.getItem('fsj_agent_mode') || '0';
    if (mode === '1') this.addImmersiveUserMessage(text); else this.addMessage('user', text);

    var self = this;
    self.createStreamingBubble();
    if (mode !== '1') self.updateStreamingBubble('正在处理...');
    self.resetTts();

    // 保存用户消息到历史
    self.addMessageToHistory('user', text);

    AIService.execute(
      { content: self.buildContentWithContext(demoPrompt), mode: mode === '1' ? 'immersive' : 'normal' },
      function (event) { self._handleAiEvent(event, mode); }
    );
  },

  switchAgentMode: function (mode) {
    localStorage.setItem('fsj_agent_mode', mode);
    document.querySelectorAll('.mode-option').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-mode') === mode);
    });

    if (mode === '1') {
      this.removeImmersiveMode();
      this.loadVideoResources();
    } else {
      this.removeImmersiveMode();
    }
  },

  renderImmersiveMode: function () {
    var container = document.getElementById('chat-container');
    if (!container) return;

    var existing = document.getElementById('agent-immersive-scene');
    if (existing) return;

    this.immersiveMessages = [];
    this.immersiveDisplayPos = 0;
    var msgList = document.getElementById('immersive-msg-list');
    if (msgList) msgList.innerHTML = '';

    var bgStyle = '';
    var videoSrc = '';
    var showVideo = false;

    if (this.videoResources) {
      if (this.videoResources.bgImage) bgStyle = 'background-image: url(\'' + this.videoResources.bgImage + '\'); background-size: cover; background-position: center;';
      if (this.videoResources.shuohua) { videoSrc = this.videoResources.shuohua; showVideo = true; }
    }

    var scene = document.createElement('div');
    scene.id = 'agent-immersive-scene';
    scene.className = 'immersive-scene';
    scene.innerHTML =
      '<div class="immersive-bg" id="immersive-bg" style="' + bgStyle + '"></div>' +
      '<div class="immersive-agent" id="immersive-agent">' +
        (showVideo
          ? '<video id="immersive-agent-video" class="agent-video" src="' + videoSrc + '" muted loop playsinline></video>'
          : '<div class="agent-character" style="position:absolute;inset:0;background:url(assets/logo.png) center center no-repeat;background-size:contain;"></div>') +
      '</div>';

    container.insertBefore(scene, container.firstChild);
    container.classList.add('immersive-active');
    var pageAgent = document.getElementById('page-agent');
    if (pageAgent) pageAgent.classList.add('immersive-active');

    var videoEl = document.getElementById('immersive-agent-video');
    if (videoEl) {
      this._videoSpeaking = undefined;
      videoEl.muted = true;
      // Chrome 需要等 loadeddata 后再播放
      videoEl.addEventListener('loadeddata', function () {
        videoEl.play().catch(function (e) {
          console.warn('[AgentPage] 视频播放失败:', e);
        });
      }, { once: true });
      // 兜底：超时后强制触发 play
      setTimeout(function () {
        videoEl.play().catch(function () {});
      }, 500);
    }
  },

  removeImmersiveMode: function () {
    var container = document.getElementById('chat-container');
    if (!container) return;

    var video = document.getElementById('immersive-agent-video');
    if (video) { video.pause(); video.src = ''; }

    var scene = document.getElementById('agent-immersive-scene');
    if (scene) scene.remove();

    container.classList.remove('immersive-active');
    var pageAgent = document.getElementById('page-agent');
    if (pageAgent) pageAgent.classList.remove('immersive-active');
    this._videoSpeaking = undefined;
    this.videoResources = null;
  },

  renderWelcome: function () {
    var container = document.getElementById('chat-messages');
    if (!container) return;

    container.innerHTML =
      '<div class="welcome-area" id="chat-welcome">' +
        '<div class="welcome-logo"></div>' +
        '<div class="welcome-text">您工作上的得力助手</div>' +
      '</div>' +
      '<div id="chat-message-list"></div>' +
      '<div id="anchor-bottom"></div>';
  },

  renderQuickActions: function () {
    var container = document.getElementById('quick-actions');
    if (!container) return;

    var actions = [
      { icon: '📊', text: '错题分析', action: 'analysis', highlight: true },
      { icon: '💬', text: '智能问答', action: 'qa' },
      { icon: '', text: '数学史', action: 'review' },
      { icon: '📋', text: '个性化学习', action: 'task' },
      { icon: '', text: '目标拆解', action: 'goal' },
      { icon: '📈', text: '数据分析', action: 'data' },
    ];

    container.innerHTML = actions.map(function (a) {
      return '<div class="quick-item' + (a.highlight ? ' highlight' : '') + '" data-action="' + a.action + '">' +
        '<span class="quick-icon-text">' + a.icon + '</span>' +
        '<span class="quick-text">' + a.text + '</span>' +
        '</div>';
    }).join('');
  },

  renderInputArea: function () {
    var container = document.getElementById('chat-input-area');
    if (!container) return;

    container.innerHTML =
      '<div class="input-wrapper">' +
        '<textarea class="input-field" id="agent-chat-input" placeholder="输入消息..." rows="1"></textarea>' +
        '<div class="input-actions">' +
          '<div class="attach-btn" id="chat-attach-btn">' +
            '<span class="attach-icon">📎</span>' +
          '</div>' +
          '<div class="right-actions">' +
            '<div class="voice-btn" id="chat-voice-btn">' +
              '<span class="voice-icon">🎤</span>' +
            '</div>' +
            '<div class="send-btn" id="chat-send-btn">发送</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  },

  bindInputEvents: function () {
    var self = this;
    var input = document.getElementById('agent-chat-input');
    var sendBtn = document.getElementById('chat-send-btn');

    if (input) {
      input.addEventListener('input', function () {
        self.inputText = input.value.trim();
        sendBtn.classList.toggle('active', self.inputText.length > 0);
      });

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); self.sendText(); }
      });
    }

    if (sendBtn) sendBtn.addEventListener('click', function () { self.sendText(); });

    var voiceBtn = document.getElementById('chat-voice-btn');
    if (voiceBtn) voiceBtn.addEventListener('click', function () { self.toggleTts(); });
  },

  bindQuickActionEvents: function () {
    var self = this;
    var container = document.getElementById('quick-actions');
    if (!container) return;

    container.addEventListener('click', function (e) {
      var item = e.target.closest('.quick-item');
      if (!item) return;
      var action = item.getAttribute('data-action');
      self.handleQuickAction(action);
    });
  },

  handleQuickAction: function (action) {
    TtsService.initAudio();

    if (action === 'analysis') { this.showAnalysisUploadModal(); return; }

    var actionTexts = {
      analysis: '📊 错题分析', qa: '💬 智能问答', review: '数学史',
      task: '📋 个性化学习', goal: '目标拆解', data: '📈 数据分析'
    };

    var text = actionTexts[action] || action;
    var mode = localStorage.getItem('fsj_agent_mode') || '0';
    if (mode === '1') this.addImmersiveUserMessage(text); else this.addMessage('user', text);

    var self = this;
    self.createStreamingBubble();
    if (mode !== '1') self.updateStreamingBubble('正在处理...');
    self.resetTts();

    // 保存用户消息到历史
    self.addMessageToHistory('user', text);

    AIService.execute(
      { content: self.buildContentWithContext(text), mode: mode === '1' ? 'immersive' : 'normal' },
      function (event) { self._handleAiEvent(event, mode); }
    );
  },

  addMessage: function (type, content) {
    var self = this;
    var list = document.getElementById('chat-message-list');
    var welcome = document.getElementById('chat-welcome');
    if (!list) return;

    if (welcome) welcome.style.display = 'none';

    var msg = {
      id: Date.now(), type: type, content: content,
      time: this.getCurrentTime(),
      formattedContent: type === 'ai' ? this.parseMarkdown(content) : ''
    };

    this.messages.push(msg);

    var container = document.getElementById('chat-container');
    if (container) container.classList.add('has-messages');

    var msgEl = document.createElement('div');
    msgEl.className = 'message-item ' + type;
    msgEl.id = 'msg-' + msg.id;
    msgEl.innerHTML = this.renderMessageBubble(msg);

    list.appendChild(msgEl);

    if (type === 'user') msgEl.scrollIntoView({ block: 'start' });
    else this.scrollToBottom();
  },

  renderMessageBubble: function (msg) {
    var avatar = msg.type === 'ai' ? '🤖' : '👤';
    var bubbleContent = '';

    if (msg.type === 'ai') {
      bubbleContent =
        '<div class="message-bubble ' + (msg.isStreaming ? 'streaming' : '') + '">' +
          '<div class="rich-text">' + msg.formattedContent + '</div>' +
          (msg.isStreaming ? '<span class="streaming-cursor">▌</span>' : '') +
        '</div>';
    } else {
      bubbleContent = '<div class="message-bubble"><text>' + msg.content + '</text></div>';
    }

    return '<div class="message-avatar">' + avatar + '</div>' +
      '<div class="message-content">' + bubbleContent +
      '<div class="message-time">' + msg.time + '</div></div>';
  },

  parseMarkdown: function (text) {
    if (!text) return '';
    if (typeof marked !== 'undefined') return marked.parse(text);
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/`(.*?)`/g, '<code>$1</code>').replace(/\n/g, '<br/>');
  },

  unlockAudio: function () {
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;
    var self = this;
    var silent = new Audio('data:audio/mpeg;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAA1N3aXRjaCBQbHVzIMKpIE5DSCBTb2Z0d2FyZQBUSVQyAAAABgAAAzIyMzUAVFNTRQAAAA8AAANMYXZmNTcuODMuMTAwAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV');
    silent.volume = 0;
    var unlockPromise = silent.play();
    if (unlockPromise) unlockPromise.then(function () { self.audioUnlocked = true; }).catch(function () {});

    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      try {
        var ctx = new AudioCtx();
        if (ctx.state === 'suspended') ctx.resume().catch(function () {});
      } catch (e) {}
    }
  },

  sendText: function () {
    var input = document.getElementById('agent-chat-input');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;

    TtsService.initAudio();

    var mode = localStorage.getItem('fsj_agent_mode') || '0';
    if (mode === '1') this.addImmersiveUserMessage(text); else this.addMessage('user', text);

    input.value = '';
    this.inputText = '';
    document.getElementById('chat-send-btn').classList.remove('active');

    var self = this;
    self.createStreamingBubble();
    if (mode !== '1') self.updateStreamingBubble('正在处理...');
    self.resetTts();

    // 保存用户消息到历史
    self.addMessageToHistory('user', text);

    AIService.execute(
      { content: self.buildContentWithContext(text), mode: mode === '1' ? 'immersive' : 'normal' },
      function (event) { self._handleAiEvent(event, mode); }
    );
  },

  createStreamingBubble: function () {
    this.isAITyping = true;
    this.hasStreamingMsg = true;
    var mode = localStorage.getItem('fsj_agent_mode') || '0';
    if (mode === '1') return;

    var aiMsgId = Date.now();
    this._currentMsgId = aiMsgId;
    var list = document.getElementById('chat-message-list');

    var msgEl = document.createElement('div');
    msgEl.className = 'message-item ai';
    msgEl.id = 'msg-' + aiMsgId;
    msgEl.innerHTML =
      '<div class="message-avatar">🤖</div>' +
      '<div class="message-content">' +
        '<div class="message-bubble streaming">' +
          '<div class="rich-text"></div>' +
          '<span class="streaming-cursor">▌</span>' +
        '</div>' +
        '<div class="message-time">' + this.getCurrentTime() + '</div>' +
      '</div>';

    list.appendChild(msgEl);
    this.scrollToBottom();
  },

  updateStreamingBubble: function (text) {
    var mode = localStorage.getItem('fsj_agent_mode') || '0';
    if (mode === '1') { this.updateImmersiveMessage(text); return; }

    var msgEl = document.getElementById('msg-' + this._currentMsgId);
    if (!msgEl) return;

    var bubble = msgEl.querySelector('.rich-text');
    if (!bubble) return;

    if (this._typingTimer) { cancelAnimationFrame(this._typingTimer); this._typingTimer = null; }

    bubble.innerHTML = this.parseMarkdown(text);
    this.scrollToBottom();
  },

  appendImmersiveDelta: function (delta) {
    var container = document.getElementById('immersive-msg-list');
    if (!container) return;

    var lastMsg = this.immersiveMessages[this.immersiveMessages.length - 1];
    if (lastMsg && lastMsg.type === 'ai' && lastMsg.isStreaming) {
      lastMsg.content += delta;
      lastMsg.formattedContent = this.parseMarkdown(lastMsg.content);
    } else {
      var msg = { type: 'ai', content: delta, formattedContent: this.parseMarkdown(delta), isStreaming: true };
      this.immersiveMessages.push(msg);
    }

    this.renderImmersiveMessages();
    this.scrollToBottom();
  },

  updateImmersiveMessage: function (text) {
    var container = document.getElementById('immersive-msg-list');
    if (!container) return;

    var delta = text.substring(this.immersiveDisplayPos);
    this.immersiveDisplayPos = text.length;
    if (!delta) return;

    var lastMsg = this.immersiveMessages[this.immersiveMessages.length - 1];
    if (lastMsg && lastMsg.type === 'ai' && lastMsg.isStreaming) {
      lastMsg.content += delta;
      lastMsg.formattedContent = this.parseMarkdown(lastMsg.content);
    } else {
      var msg = { type: 'ai', content: delta, formattedContent: this.parseMarkdown(delta), isStreaming: true };
      this.immersiveMessages.push(msg);
    }

    this.renderImmersiveMessages();
    this.scrollToBottom();
  },

  renderImmersiveMessages: function () {
    var container = document.getElementById('immersive-msg-list');
    if (!container) return;

    var html = this.immersiveMessages.map(function (msg) {
      if (msg.type === 'user') return '<div class="immersive-msg user"><span>' + msg.content + '</span></div>';
      var cursor = msg.isStreaming ? '<span class="streaming-cursor">▌</span>' : '';
      return '<div class="immersive-msg ai"><div class="rich-text">' + msg.formattedContent + '</div>' + cursor + '</div>';
    }).join('');

    container.innerHTML = html;
  },

  finalizeImmersiveMessage: function () {
    var lastMsg = this.immersiveMessages[this.immersiveMessages.length - 1];
    if (lastMsg && lastMsg.type === 'ai') lastMsg.isStreaming = false;
    this.renderImmersiveMessages();
  },

  addImmersiveUserMessage: function (text) {
    this.immersiveMessages.push({ type: 'user', content: text });
    this.renderImmersiveMessages();
  },

  finalizeStreamingBubble: function () {
    this.isAITyping = false;
    this.hasStreamingMsg = false;
    if (this._typingTimer) { cancelAnimationFrame(this._typingTimer); this._typingTimer = null; }

    var mode = localStorage.getItem('fsj_agent_mode') || '0';
    if (mode === '1') { this.finalizeImmersiveMessage(); return; }

    var msgEl = document.getElementById('msg-' + this._currentMsgId);
    if (!msgEl) return;

    var bubble = msgEl.querySelector('.message-bubble');
    var cursor = msgEl.querySelector('.streaming-cursor');
    if (bubble) bubble.classList.remove('streaming');
    if (cursor) cursor.style.display = 'none';
  },

  scrollToBottom: function () {
    var messages = document.getElementById('chat-messages');
    if (messages) messages.scrollTop = messages.scrollHeight;
    var msgList = document.getElementById('immersive-msg-list');
    if (msgList) msgList.scrollTop = msgList.scrollHeight;
  },

  streamTts: function (fullText) {
    if (!fullText) return;

    var delta = fullText.substring(this.ttsTextPos);
    this.ttsTextPos = fullText.length;
    if (!delta) return;

    delta = delta.replace(/\n/g, '');
    if (!delta) return;

    this.ttsCurrentSentence += delta;
    var match = this.ttsCurrentSentence.match(/[。！？]/);
    if (!match) return;

    var idx = match.index;
    var sentence = this.ttsCurrentSentence.substring(0, idx + 1);
    var plainText = this._stripMarkdown(sentence);

    if (plainText && plainText.length >= 2) {
      var lastQueued = this.ttsSentenceQueue[this.ttsSentenceQueue.length - 1];
      if (lastQueued !== plainText) {
        this.ttsSentenceQueue.push(plainText);
        this._processTtsQueue();
      }
    }

    this.ttsCurrentSentence = this.ttsCurrentSentence.substring(idx + 1);
  },

  finalizeTts: function () {
    if (!this.ttsEnabled) return;
    if (this.ttsFinalized) return;
    this.ttsFinalized = true;

    var remaining = this.ttsCurrentSentence.trim();
    this.ttsCurrentSentence = '';
    if (remaining) {
      var plainText = this._stripMarkdown(remaining);
      if (plainText) {
        this.ttsSentenceQueue.push(plainText);
        this._processTtsQueue();
      }
    } else if (this.ttsSentenceQueue.length === 0) {
      this._finalizeDisplay();
    }
  },

  _finalizeDisplay: function () {
    this.finalizeStreamingBubble();
  },

  _stripMarkdown: function (text) {
    return text.replace(/#{1,6}\s?/g, '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')
      .replace(/`(.*?)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/>\s?/g, '')
      .replace(/[-*]\s?/g, '').replace(/\n+/g, ' ').trim();
  },

  _processTtsQueue: function () {
    if (this.ttsProcessing) return;
    if (this.ttsSentenceIndex >= this.ttsSentenceQueue.length) {
      if (this.ttsFinalized) this._finalizeDisplay();
      return;
    }

    this.ttsProcessing = true;
    var self = this;
    var text = this.ttsSentenceQueue[this.ttsSentenceIndex];

    self._displayTtsSentence(text);

    var retryCount = 0;
    function tryPlay() {
      self.switchAgentVideo(true);

      TtsService.play(text).then(function () {
        self.switchAgentVideo(false);
        self.ttsSentenceIndex++;
        self.ttsProcessing = false;
        setTimeout(function () { self._processTtsQueue(); }, 300);
      }).catch(function (e) {
        retryCount++;
        if (retryCount < 2) {
          TtsService.initAudio();
          setTimeout(function () { tryPlay(); }, 500);
        } else {
          self.switchAgentVideo(false);
          self.ttsSentenceIndex++;
          self.ttsProcessing = false;
          setTimeout(function () { self._processTtsQueue(); }, 300);
        }
      });
    }
    tryPlay();
  },

  _displayTtsSentence: function (text) {
    var mode = localStorage.getItem('fsj_agent_mode') || '0';

    if (mode === '1') {
      var msg = { type: 'ai', content: text, formattedContent: this.parseMarkdown(text), isStreaming: false };
      this.immersiveMessages.push(msg);
      this.renderImmersiveMessages();
    } else {
      var msgEl = document.getElementById('msg-' + this._currentMsgId);
      if (msgEl) {
        var bubble = msgEl.querySelector('.rich-text');
        if (bubble) {
          bubble.innerHTML = this.parseMarkdown((bubble.getAttribute('data-content') || '') + text);
          bubble.setAttribute('data-content', (bubble.getAttribute('data-content') || '') + text);
        }
      }
    }

    this.scrollToBottom();
  },

  resetTts: function () {
    this.ttsSentenceQueue = [];
    this.ttsSentenceIndex = 0;
    this.ttsCurrentSentence = '';
    this.ttsProcessing = false;
    this.ttsTextPos = 0;
    this.ttsFinalized = false;
    TtsService.stop();
  },

  getCurrentTime: function () {
    var now = new Date();
    var h = now.getHours().toString().padStart(2, '0');
    var m = now.getMinutes().toString().padStart(2, '0');
    return h + ':' + m;
  },

  // ===== 内容类型检测与富内容渲染 =====

  /**
   * 剥离内容中的格式标签 [0] 或 [1]
   */
  _stripFormatTag: function (text) {
    if (!text) return text;
    // 匹配 [0] 或 [1]，允许标签内有换行
    var match = text.match(/^[\s]*\[\s*([01])\s*\]\s*/);
    if (match) return text.substring(match[0].length);
    // 内容以 [ 开头但标签不完整，暂不处理
    if (/^[\s]*\[/.test(text)) return null;
    return text;
  },

  /**
   * 检测并解析内容类型标记
   * 格式：[HTML]...[END] / [DOC]...[END] / [PPT]...[END] / [TEXT]...[END]
   */
  _detectContentType: function (content) {
    if (this._contentType !== 'text') return;
    var match = content.match(/^\[(HTML|DOC|PPT|TEXT)\]/);
    if (match) {
      this._contentType = match[1].toLowerCase();
      console.log('[AgentPage] 检测到内容类型:', this._contentType);
      if (this._contentType !== 'text') this._switchToContentLoading();
    }
  },

  /**
   * 切换到内容加载状态（HTML/DOC/PPT）
   */
  _switchToContentLoading: function () {
    var msgEl = document.getElementById('msg-' + this._currentMsgId);
    if (!msgEl) return;
    var bubble = msgEl.querySelector('.rich-text');
    if (bubble) bubble.innerHTML = '<span class="loading-text">正在生成内容<span class="loading-dot">.</span><span class="loading-dot">.</span><span class="loading-dot">.</span></span>';
  },

  /**
   * 提取纯净内容（去掉类型标记）
   */
  _extractContent: function (content) {
    return content.replace(/^\[(HTML|DOC|PPT|TEXT)\]/, '');
  },

  /**
   * 检查内容是否完成（包含 [END] 标记）
   */
  _isContentComplete: function (content) {
    return content.indexOf('[END]') !== -1;
  },

  /**
   * 提取最终内容（去掉 [END] 及之后的内容）
   */
  _extractFinalContent: function (content) {
    var idx = content.indexOf('[END]');
    if (idx !== -1) return content.substring(0, idx);
    return content;
  },

  /**
   * 渲染富内容（HTML/DOC/PPT）
   */
  _renderRichContent: function (type, content) {
    content = this._extractContent(content);
    var endIdx = content.indexOf('[END]');
    if (endIdx !== -1) content = content.substring(0, endIdx);
    content = content.trim();
    this._contentRaw = this._extractContent(this._contentRaw);

    if (type === 'html') return this._renderHtmlPreview(content);
    if (type === 'doc') return this._renderDocPreview(content);
    if (type === 'ppt') return this._renderPptPreview(content);
    return this.parseMarkdown(content);
  },

  /**
   * 渲染 HTML 预览
   */
  _renderHtmlPreview: function (html) {
    var previewId = 'html-preview-' + Date.now();
    return '<div class="rich-content-card html-card">' +
      '<div class="rich-content-header"><span class="rich-content-icon">🌐</span><span class="rich-content-title">HTML 预览</span></div>' +
      '<div class="rich-content-body">' +
        '<div class="html-preview-frame" id="' + previewId + '">' +
          '<iframe class="html-iframe" srcdoc="' + html.replace(/"/g, '&quot;') + '" sandbox="allow-scripts allow-same-origin"></iframe>' +
        '</div>' +
        '<div class="rich-content-actions">' +
          '<button class="rich-action-btn" onclick="AgentPage._openHtmlPreview(\'' + previewId + '\')">全屏预览</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  },

  /**
   * 打开全屏 HTML 预览
   */
  _openHtmlPreview: function (previewId) {
    var frame = document.getElementById(previewId);
    if (!frame) return;
    var iframe = frame.querySelector('.html-iframe');
    if (!iframe) return;

    var overlay = document.createElement('div');
    overlay.id = 'html-fullscreen-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#fff;z-index:10000;display:flex;flex-direction:column;';
    overlay.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:#1a1a2e;color:#fff;flex-shrink:0;">' +
        '<span style="font-size:16px;font-weight:600;">HTML 预览</span>' +
        '<button id="html-fullscreen-close" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;padding:0 8px;">✕</button>' +
      '</div>' +
      '<div style="flex:1;"><iframe srcdoc="' + iframe.srcdoc.replace(/"/g, '&quot;') + '" sandbox="allow-scripts allow-same-origin" style="width:100%;height:100%;border:none;"></iframe></div>';

    document.body.appendChild(overlay);
    document.getElementById('html-fullscreen-close').addEventListener('click', function () { overlay.remove(); });
  },

  /**
   * 渲染文档预览
   */
  _renderDocPreview: function (content) {
    return '<div class="rich-content-card doc-card">' +
      '<div class="rich-content-header"><span class="rich-content-icon">📄</span><span class="rich-content-title">学习文档</span></div>' +
      '<div class="rich-content-body">' +
        '<div class="doc-preview-text">' + this.parseMarkdown(content) + '</div>' +
        '<div class="rich-content-actions">' +
          '<button class="rich-action-btn" onclick="AgentPage._copyDocContent()">复制内容</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  },

  /**
   * 复制文档内容
   */
  _copyDocContent: function () {
    var text = AgentPage._contentRaw || '';
    text = text.replace(/^\[(HTML|DOC|PPT|TEXT)\]/, '');
    var endIdx = text.indexOf('[END]');
    if (endIdx !== -1) text = text.substring(0, endIdx);
    text = text.trim();

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () { alert('内容已复制'); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('内容已复制');
    }
  },

  /**
   * 渲染 PPT 预览
   */
  _renderPptPreview: function (content) {
    var slides = content.split(/\n---\n/);
    var html = slides.map(function (slide) {
      return '<div class="ppt-slide">' + AgentPage.parseMarkdown(slide) + '</div>';
    }).join('');

    return '<div class="rich-content-card ppt-card">' +
      '<div class="rich-content-header"><span class="rich-content-icon">📊</span><span class="rich-content-title">演示文稿（' + slides.length + ' 页）</span></div>' +
      '<div class="rich-content-body">' +
        '<div class="ppt-slides-scroll">' + html + '</div>' +
      '</div>' +
    '</div>';
  },

  /**
   * 重置内容类型状态
   */
  _resetContentType: function () {
    this._contentType = 'text';
    this._contentRaw = '';
  }
};
