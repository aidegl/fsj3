/**
 * 消息页面
 */
var MessagePage = {
  _initialized: false,

  init: function () {
    if (this._initialized) return;
    this._initialized = true;

    this.renderMessages();
  },

  renderMessages: function () {
    var list = document.getElementById('message-list');
    if (!list) return;

    var messages = [
      { name: '小智AI助手', preview: '你的错题分析已完成，点击查看结果', time: '刚刚', unread: true },
      { name: '系统通知', preview: '新一轮练习已推送，快来挑战吧！', time: '10分钟前', unread: true },
      { name: '学习日报', preview: '今日学习报告：已完成3个知识点', time: '1小时前', unread: false },
      { name: '小智AI助手', preview: '加油！你今天表现很棒', time: '昨天', unread: false },
    ];

    list.innerHTML = messages.map(function (msg) {
      return '<div class="message-item">' +
        '<div class="msg-avatar">🤖</div>' +
        '<div class="msg-body">' +
          '<div class="msg-header">' +
            '<span class="msg-name">' + msg.name + '</span>' +
            '<span class="msg-time">' + msg.time + '</span>' +
          '</div>' +
          '<div class="msg-preview">' + msg.preview + '</div>' +
        '</div>' +
        (msg.unread ? '<div class="msg-unread"></div>' : '') +
        '</div>';
    }).join('');
  }
};

export default MessagePage;
