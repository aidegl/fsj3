/**
 * 个人空间页面
 * 入口：我的页面 → 商家 wode 配置 → "我的空间"
 * 三个列表（2026-09-11 老板拍板口径）：
 *   我的笔记 = 类型 != 任务接单 且 发布者 = 当前用户
 *   我的悬赏 = 类型 == 任务接单 且 发布者 = 当前用户
 *   我的任务 = 类型 == 任务接单 且 发布者 != 当前用户 且 参与活动用户 包含当前用户
 */
(function () {
  'use strict';

  // 内容表「任务接单」类型值 + 「参与活动用户」关联字段 controlId
  var TYPE_TASK = '任务接单';
  var PARTICIPANT_CONTROL = '6a11531da47867dee8cda8cb';

  var KongjianPage = {
    currentTab: 'note',

    init: function () {
      this.renderUserCard();
      this.renderStats();
      this.bindTabSwitch();
      this.bindBackBtn();
      this.loadList();
    },

    /**
     * 渲染用户卡片
     */
    renderUserCard: function () {
      var avatar = document.getElementById('kongjian-avatar');
      var nickname = document.getElementById('kongjian-nickname');
      if (!avatar || !nickname) return;

      var token = localStorage.getItem('fsj_token');
      if (!token) {
        nickname.textContent = '未登录';
        avatar.src = 'assets/logo.png';
        return;
      }

      // 审核期间不显示头像
      var shenhe = localStorage.getItem('fsj_shenhe') || '';
      if (shenhe === '1') {
        avatar.style.display = 'none';
      } else {
        avatar.style.display = '';
        var storedInfo = localStorage.getItem('fsj_user_info');
        if (storedInfo) {
          try {
            var parsed = JSON.parse(storedInfo);
            nickname.textContent = parsed.name || '用户';
            if (parsed.avatar) {
              avatar.src = parsed.avatar;
            }
          } catch (e) {
            nickname.textContent = localStorage.getItem('fsj_user_name') || '用户';
          }
        } else {
          nickname.textContent = localStorage.getItem('fsj_user_name') || '用户';
        }
      }
    },

    /**
     * 渲染统计栏（UI 占位，数据后续接入）
     */
    renderStats: function () {
      // TODO: 接入真实数据
      document.getElementById('kongjian-publish-count').textContent = '0';
      document.getElementById('kongjian-fans-count').textContent = '0';
      document.getElementById('kongjian-like-count').textContent = '0';
    },

    /**
     * 绑定 Tab 切换
     */
    bindTabSwitch: function () {
      var self = this;
      var tabs = document.querySelectorAll('.kongjian-tab');
      tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          var tabKey = tab.getAttribute('data-tab');
          if (tabKey === self.currentTab) return;

          tabs.forEach(function (t) { t.classList.remove('active'); });
          tab.classList.add('active');
          self.currentTab = tabKey;
          self.loadList();
        });
      });
    },

    /**
     * 绑定返回按钮
     */
    bindBackBtn: function () {
      var backBtn = document.getElementById('kongjian-back-btn');
      if (backBtn) {
        backBtn.addEventListener('click', function () {
          KongjianPage.goBack();
        });
      }
    },

    /**
     * 返回列表
     */
    goBack: function () {
      document.querySelectorAll('#app .page').forEach(function (p) {
        p.classList.remove('active');
      });
      var profile = document.getElementById('page-profile');
      if (profile) profile.classList.add('active');

      var tabBar = document.getElementById('tab-bar');
      if (tabBar) tabBar.classList.remove('hidden');
    },

    /**
     * 加载列表
     */
    loadList: function () {
      var self = this;
      var listEl = document.getElementById('kongjian-list');
      var emptyEl = document.getElementById('kongjian-empty');
      if (!listEl) return;

      var userRowid = '';
      try {
        var info = JSON.parse(localStorage.getItem('fsj_user_info') || '{}');
        userRowid = info.id || '';
      } catch (e) {}

      if (!userRowid) {
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.style.display = '';
        return;
      }

      // 三列表过滤口径（2026-09-11 老板拍板）：
      //   note   = 类型 != 任务接单 且 发布者 = 我
      //   reward = 类型 == 任务接单 且 发布者 = 我
      //   task   = 类型 == 任务接单 且 参与活动用户 包含 我（客户端再排除我发布的）
      if (self.currentTab === 'note') {
        self._loadMyContent(listEl, emptyEl, userRowid, {
          extraFilters: [{ controlId: 'kind', dataType: 11, spliceType: 1, filterType: 6, value: TYPE_TASK }],
          countStat: true
        });
      } else if (self.currentTab === 'reward') {
        self._loadMyContent(listEl, emptyEl, userRowid, {
          extraFilters: [{ controlId: 'kind', dataType: 11, spliceType: 1, filterType: 2, value: TYPE_TASK }]
        });
      } else {
        self._loadMyContent(listEl, emptyEl, userRowid, {
          noAuthorFilter: true,
          extraFilters: [
            { controlId: 'kind', dataType: 11, spliceType: 1, filterType: 2, value: TYPE_TASK },
            { controlId: PARTICIPANT_CONTROL, dataType: 29, spliceType: 2, filterType: 24, value: userRowid }
          ],
          postFilter: function (row) {
            return String(row.fabuzhe || '').indexOf(userRowid) === -1;
          }
        });
      }
    },

    /**
     * 加载"我的"内容列表（三个 tab 共用）
     * 注意：不用 FsjApi.getContentList（它会按 shangjia2 商家过滤），
     * 我的空间直接调 API，只按 fabuzhe/leixing/参与者 + shanchu 过滤，含待审核内容
     * @param {Object} opts - { noAuthorFilter?, extraFilters?, postFilter?, countStat? }
     */
    _loadMyContent: function (listEl, emptyEl, userRowid, opts) {
      var self = this;
      opts = opts || {};
      listEl.innerHTML = '<div class="kongjian-loading"><div class="loading-spinner"></div><p>加载中...</p></div>';

      var filters = [];
      if (!opts.noAuthorFilter) {
        // 发布者 = 当前用户
        filters.push({ controlId: 'publisher', dataType: 29, spliceType: 1, filterType: 24, value: userRowid });
      }
      (opts.extraFilters || []).forEach(function (f) { filters.push(f); });
      // 排除已逻辑删除
      filters.push({ controlId: 'is_deleted', dataType: 2, spliceType: 1, filterType: 6, value: '1' });

      FsjApi.callMingdaoAPI('https://api.mingdao.com/v2/open/worksheet/getFilterRows', {
        worksheetId: '6a03ceaa7e29abcb297cbdfc',
        viewId: '',
        pageSize: 50,
        pageIndex: 1,
        listType: 0,
        controls: ['rowid', 'title', 'attachments', 'mdnr', 'kind', 'publisher', 'audit_status', 'ctime'],
        filters: filters,
        sortId: 'ctime',
        isAsc: false,
        getSystemControl: 'false'
      }).then(function (res) {
        var rows = [];
        if (res && res.data && res.data.rows) rows = res.data.rows;
        else if (res && res.rows) rows = res.rows;

        // 发布数统计（跟随「我的笔记」tab）
        if (opts.countStat) {
          var publishCountEl = document.getElementById('kongjian-publish-count');
          if (publishCountEl) {
            var total = (res && res.data && (res.data.total || res.data.dataTotal)) || rows.length;
            publishCountEl.textContent = String(total);
          }
        }

        // 客户端二次过滤（我的任务：排除我自己发布的）
        if (opts.postFilter) rows = rows.filter(opts.postFilter);

        if (!rows || rows.length === 0) {
          listEl.innerHTML = '';
          if (emptyEl) emptyEl.style.display = '';
          return;
        }

        listEl.innerHTML = rows.map(function (row) {
          var cover = FsjApi.parseImage ? FsjApi.parseImage(row.zhutu) : '';
          var coverHtml = cover ? '<div class="kongjian-card-cover"><img src="' + cover + '" alt="" /></div>' : '';

          // 审核状态标签
          var shenhe = row.shenhe || '';
          var statusHtml = '';
          if (shenhe === '待审核') {
            statusHtml = '<span class="kongjian-status-tag kongjian-status-pending">待审核</span>';
          } else if (shenhe === '二次审核') {
            statusHtml = '<span class="kongjian-status-tag kongjian-status-reviewing">审核中</span>';
          }
          // "已审核" 和空值不显示标签

          return '<div class="kongjian-card" data-rowid="' + (row.rowid || '') + '">' +
            coverHtml +
            '<div class="kongjian-card-info">' +
              '<div class="kongjian-card-title">' + (row.title || row.mingcheng || '未命名') + '</div>' +
              '<div class="kongjian-card-meta">' +
                statusHtml +
                '<span>' + (row.ctime || '') + '</span>' +
              '</div>' +
            '</div>' +
          '</div>';
        }).join('');

        if (emptyEl) emptyEl.style.display = 'none';

        // 绑定点击
        listEl.querySelectorAll('.kongjian-card').forEach(function (card) {
          card.addEventListener('click', function () {
            var rowid = card.getAttribute('data-rowid');
            if (rowid && window.App) App.switchToContentDetail(rowid, 'kongjian');
          });
        });
      }).catch(function (err) {
        console.error('[Kongjian] 列表加载失败:', err);
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.style.display = '';
      });
    }
  };

  window.KongjianPage = KongjianPage;
})();
