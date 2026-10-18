/**
 * 智能问答页面
 */
import AIService from '../services/ai.js';

var ChatPage = {
  messages: [],
  inputText: '',
  _currentMsgId: null,
  _isStreaming: false,

  init: function () {
    if (this._initialized) return;
    this._initialized = true;

    this.renderWelcome();
    this.bindEvents();
  },

  renderWelcome: function () {
    var container = document.getElementById('chat-messages');
    if (!container) return;

    container.innerHTML =
      '<div class="chat-msg ai">' +
        '<div class="chat-avatar">🤖</div>' +
        '<div class="chat-bubble">你好！我是你的数学AI助手小智 \n有什么数学问题都可以问我哦～</div>' +
      '</div>';
  },

  bindEvents: function () {
    var self = this;
    var input = document.getElementById('chat-input');
    var sendBtn = document.getElementById('chat-send-btn');
    var cameraBtn = document.getElementById('chat-camera-btn');

    if (input) {
      input.addEventListener('input', function () {
        self.inputText = input.value.trim();
        if (sendBtn) {
          sendBtn.style.opacity = self.inputText ? '1' : '0.5';
        }
      });

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          self.sendText();
        }
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', function () {
        self.sendText();
      });
    }

    if (cameraBtn) {
      cameraBtn.addEventListener('click', function () {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        input.onchange = function (e) {
          var file = e.target.files[0];
          if (file) {
            self.addMessage('user', '📷 [图片] 请帮我看看这道题');
            self.callAI('请帮我分析这张图片中的数学题');
          }
        };
        input.click();
      });
    }
  },

  sendText: function () {
    var input = document.getElementById('chat-input');
    if (!input) return;

    var text = input.value.trim();
    if (!text) return;

    this.addMessage('user', text);
    input.value = '';
    this.inputText = '';

    this.callAI(text);
  },

  callAI: function (text) {
    var self = this;

    // 创建AI回复气泡
    var msgId = Date.now();
    this._currentMsgId = msgId;
    this._isStreaming = true;

    var msgEl = document.createElement('div');
    msgEl.className = 'chat-msg ai';
    msgEl.id = 'chat-msg-' + msgId;
    msgEl.innerHTML =
      '<div class="chat-avatar">🤖</div>' +
      '<div class="chat-bubble" id="chat-bubble-' + msgId + '">思考中...</div>';

    var container = document.getElementById('chat-messages');
    container.appendChild(msgEl);
    this.scrollToBottom();

    AIService.execute(
      { content: text },
      function (event) {
        if (event.type === 'delta') {
          var bubble = document.getElementById('chat-bubble-' + msgId);
          if (bubble) {
            var current = bubble.textContent || '';
            bubble.textContent = current + event.delta;
          }
          self.scrollToBottom();
        } else if (event.type === 'result') {
          var bubble = document.getElementById('chat-bubble-' + msgId);
          if (bubble) {
            bubble.textContent = event.content;
          }
          self._isStreaming = false;
        } else if (event.type === 'done') {
          self._isStreaming = false;
        }
      }
    );
  },

  addMessage: function (type, content) {
    var container = document.getElementById('chat-messages');
    if (!container) return;

    var msgEl = document.createElement('div');
    msgEl.className = 'chat-msg ' + type;

    var avatar = type === 'ai' ? '🤖' : '👤';
    msgEl.innerHTML =
      '<div class="chat-avatar">' + avatar + '</div>' +
      '<div class="chat-bubble">' + content + '</div>';

    container.appendChild(msgEl);
    this.scrollToBottom();
  },

  scrollToBottom: function () {
    var container = document.getElementById('chat-messages');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }
};

export default ChatPage;
