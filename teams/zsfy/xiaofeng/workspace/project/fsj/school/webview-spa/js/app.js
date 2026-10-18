/**
 * School SPA - App Entry Point
 */
import Router from './router.js';

var App = {
  init: function () {
    Router.init();
    this.renderFuncGrid();
    this.bindTabEvents();
    this.bindModeToggle();
  },

  /**
   * 渲染九宫格功能入口
   */
  renderFuncGrid: function () {
    var grid = document.getElementById('func-grid');
    if (!grid) return;

    var items = [
      { icon: '💬', text: '智能问答', cls: 'func-chat', page: 'chat' },
      { icon: '📸', text: '错题诊疗', cls: 'func-analysis', page: 'analysis' },
      { icon: '📚', text: '分层学习', cls: 'func-learning', page: 'learning' },
      { icon: '🎨', text: '可视化教学', cls: 'func-visual', page: 'visual' },
      { icon: '📊', text: '过程评价', cls: 'func-eval', page: 'evaluation' },
      { icon: '📖', text: '数学史', cls: 'func-history', page: 'history' },
      { icon: '✏️', text: '错题巩固', cls: 'func-diagnosis', page: 'analysis' },
      { icon: '🏆', text: '能力拓展', cls: 'func-extend', page: 'learning' },
      { icon: '👨‍🏫', text: '教师后台', cls: 'func-teacher', page: 'teacher' },
    ];

    grid.innerHTML = items.map(function (item) {
      return '<div class="func-item ' + item.cls + '" data-page="' + item.page + '">' +
        '<span class="func-icon">' + item.icon + '</span>' +
        '<span>' + item.text + '</span>' +
        '</div>';
    }).join('');

    // 绑定点击事件
    grid.addEventListener('click', function (e) {
      var el = e.target.closest('.func-item');
      if (!el) return;
      var page = el.getAttribute('data-page');
      Router.go(page);
    });
  },

  /**
   * 绑定底部Tab事件
   */
  bindTabEvents: function () {
    var tabBar = document.getElementById('tab-bar');
    if (!tabBar) return;

    tabBar.addEventListener('click', function (e) {
      var tab = e.target.closest('.tab-item');
      if (!tab) return;
      var page = tab.getAttribute('data-page');
      Router.go(page);
    });
  },

  /**
   * 绑定学生/教师模式切换
   */
  bindModeToggle: function () {
    var toggle = document.getElementById('mode-toggle');
    if (!toggle) return;

    var isStudent = localStorage.getItem('fsj_school_mode') !== 'teacher';

    toggle.addEventListener('click', function () {
      isStudent = !isStudent;
      localStorage.setItem('fsj_school_mode', isStudent ? 'student' : 'teacher');
      toggle.textContent = (isStudent ? '学生' : '教师') + ' ▾';

      if (!isStudent) {
        Router.go('teacher');
      } else {
        Router.go('home');
      }
    });

    // 恢复上次模式
    if (!isStudent) {
      toggle.textContent = '教师 ▾';
    }
  },

  /**
   * 显示/隐藏加载
   */
  showLoading: function () {
    var el = document.getElementById('loading-overlay');
    if (el) el.style.display = 'flex';
  },

  hideLoading: function () {
    var el = document.getElementById('loading-overlay');
    if (el) el.style.display = 'none';
  }
};

// 启动
App.init();
