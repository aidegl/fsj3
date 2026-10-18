/**
 * 路由管理
 */
var Router = {
  currentPage: 'home',
  pageHistory: [],

  /**
   * 页面配置
   */
  pages: {
    home: { el: 'page-home', tab: 'home', backBtn: null },
    chat: { el: 'page-chat', tab: 'chat', backBtn: 'chat-back-btn' },
    analysis: { el: 'page-analysis', tab: null, backBtn: 'analysis-back-btn' },
    learning: { el: 'page-learning', tab: null, backBtn: 'learning-back-btn' },
    visual: { el: 'page-visual', tab: null, backBtn: 'visual-back-btn' },
    evaluation: { el: 'page-evaluation', tab: 'evaluation', backBtn: 'eval-back-btn' },
    history: { el: 'page-history', tab: null, backBtn: 'history-back-btn' },
    teacher: { el: 'page-teacher', tab: null, backBtn: 'teacher-back-btn' },
    message: { el: 'page-message', tab: 'message', backBtn: 'message-back-btn' },
    profile: { el: 'page-profile', tab: 'profile', backBtn: 'profile-back-btn' },
  },

  /**
   * 初始化路由
   */
  init: function () {
    var self = this;

    // 绑定所有返回按钮
    Object.keys(this.pages).forEach(function (key) {
      var page = self.pages[key];
      if (page.backBtn) {
        var btn = document.getElementById(page.backBtn);
        if (btn) {
          btn.addEventListener('click', function () {
            self.back();
          });
        }
      }
    });

    // 默认显示首页
    this.showPage('home');
  },

  /**
   * 跳转到指定页面
   */
  go: function (pageName) {
    if (!this.pages[pageName]) {
      console.warn('[Router] page not found:', pageName);
      return;
    }

    // 记录历史
    if (this.currentPage !== pageName) {
      this.pageHistory.push(this.currentPage);
    }

    this.showPage(pageName);
  },

  /**
   * 显示页面
   */
  showPage: function (pageName) {
    var config = this.pages[pageName];
    if (!config) return;

    // 隐藏所有页面
    var allPages = document.querySelectorAll('.page');
    allPages.forEach(function (p) {
      p.classList.remove('active');
    });

    // 显示目标页面
    var target = document.getElementById(config.el);
    if (target) {
      target.classList.add('active');
    }

    // 更新Tab高亮
    this.updateTab(pageName);

    this.currentPage = pageName;

    // 初始化页面
    this.initPage(pageName);
  },

  /**
   * 返回上一页
   */
  back: function () {
    if (this.pageHistory.length > 0) {
      var prev = this.pageHistory.pop();
      this.showPage(prev);
    } else {
      this.go('home');
    }
  },

  /**
   * 更新Tab高亮
   */
  updateTab: function (pageName) {
    var config = this.pages[pageName];
    if (!config || !config.tab) {
      // 如果没有对应tab，清除所有active
      document.querySelectorAll('.tab-item').forEach(function (t) {
        t.classList.remove('active');
      });
      return;
    }

    document.querySelectorAll('.tab-item').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-page') === config.tab);
    });
  },

  /**
   * 页面初始化（懒加载）
   */
  initPage: function (pageName) {
    switch (pageName) {
      case 'chat':
        import('./pages/chat.js').then(function (m) {
          m.default.init();
        });
        break;
      case 'analysis':
        import('./pages/analysis.js').then(function (m) {
          m.default.init();
        });
        break;
      case 'history':
        import('./pages/history.js').then(function (m) {
          m.default.init();
        });
        break;
      case 'message':
        import('./pages/message.js').then(function (m) {
          m.default.init();
        });
        break;
      case 'profile':
        import('./pages/profile.js').then(function (m) {
          m.default.init();
        });
        break;
      case 'visual':
        import('./pages/visual.js').then(function (m) {
          m.default.init();
        });
        break;
      case 'evaluation':
        import('./pages/evaluation.js').then(function (m) {
          m.default.init();
        });
        break;
      case 'teacher':
        import('./pages/teacher.js').then(function (m) {
          m.default.init();
        });
        break;
      case 'learning':
        import('./pages/learning.js').then(function (m) {
          m.default.init();
        });
        break;
    }
  }
};

export default Router;
