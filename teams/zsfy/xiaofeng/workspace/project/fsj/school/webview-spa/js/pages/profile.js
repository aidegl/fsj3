/**
 * 我的页面
 */
var ProfilePage = {
  _initialized: false,

  init: function () {
    if (this._initialized) return;
    this._initialized = true;

    this.renderProfile();
  },

  renderProfile: function () {
    var header = document.getElementById('profile-header');
    var stats = document.getElementById('profile-stats');
    var menu = document.getElementById('profile-menu');

    if (header) {
      header.innerHTML =
        '<div class="profile-avatar">👤</div>' +
        '<div class="profile-info">' +
          '<div class="profile-name">同学</div>' +
          '<div class="profile-role">小学四年级</div>' +
        '</div>';
    }

    if (stats) {
      stats.innerHTML =
        '<div class="stat-card"><div class="stat-value">12</div><div class="stat-label">学习天数</div></div>' +
        '<div class="stat-card"><div class="stat-value">8</div><div class="stat-label">完成题目</div></div>' +
        '<div class="stat-card"><div class="stat-value">6</div><div class="stat-label">获得星星</div></div>';
    }

    if (menu) {
      var items = [
        { icon: '📊', text: '学习报告' },
        { icon: '', text: '错题本' },
        { icon: '⭐', text: '我的收藏' },
        { icon: '⚙️', text: '设置' },
      ];

      menu.innerHTML = items.map(function (item) {
        return '<div class="menu-item">' +
          '<div class="menu-left">' +
            '<span class="menu-icon">' + item.icon + '</span>' +
            '<span>' + item.text + '</span>' +
          '</div>' +
          '<span class="menu-arrow">›</span>' +
          '</div>';
      }).join('');
    }
  }
};

export default ProfilePage;
