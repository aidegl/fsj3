/**
 * 分层学习页面
 */
var LearningPage = {
  _initialized: false,

  init: function () {
    if (this._initialized) return;
    this._initialized = true;

    this.bindEvents();
  },

  bindEvents: function () {
    var self = this;

    // 层级切换
    var tabs = document.getElementById('level-tabs');
    if (tabs) {
      tabs.addEventListener('click', function (e) {
        var tab = e.target.closest('.level-tab');
        if (!tab) return;

        document.querySelectorAll('.level-tab').forEach(function (t) {
          t.classList.remove('active');
        });
        tab.classList.add('active');

        // 更新侧边栏
        var level = tab.getAttribute('data-level');
        var items = document.querySelectorAll('.sidebar-item');
        items.forEach(function (item) {
          item.classList.remove('active');
        });

        if (level === 'basic') items[0].classList.add('active');
        else if (level === 'improve') items[1].classList.add('active');
        else items[2].classList.add('active');

        // 更新进度条（模拟数据）
        var fill = document.getElementById('progress-fill');
        if (fill) {
          var widths = { basic: '75%', improve: '50%', extend: '30%' };
          fill.style.width = widths[level] || '50%';
        }
      });
    }

    // 侧边栏点击
    var sidebar = document.querySelector('.learning-sidebar');
    if (sidebar) {
      sidebar.addEventListener('click', function (e) {
        var item = e.target.closest('.sidebar-item');
        if (!item) return;

        document.querySelectorAll('.sidebar-item').forEach(function (s) {
          s.classList.remove('active');
        });
        item.classList.add('active');

        // 同步更新顶部tab
        var idx = Array.from(sidebar.children).indexOf(item);
        var tabs = document.querySelectorAll('.level-tab');
        tabs.forEach(function (t) { t.classList.remove('active'); });
        if (tabs[idx]) tabs[idx].classList.add('active');
      });
    }
  }
};

export default LearningPage;
