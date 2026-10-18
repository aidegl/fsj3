/**
 * fsj-decoration 手机预览
 * 按 home_sections JSON 顺序渲染组件，视觉还原 webview-spa2.0 首页；
 * banner/内容列表/功能列表使用真实商家数据（缓存避免频繁拉取）。
 */
var Preview = (function () {
  'use strict';

  var Store = DecorationStore;
  var view = 'home';            // 当前预览视图：home | profile
  var bannerTimer = null;
  var currentBannerIndex = 0;
  var currentCategory = 0;      // content_list 选中的分类下标

  // 数据缓存（配置 key → 数据），配置变化时 key 变化自然失效
  var bannerCache = {};
  var contentCache = {};
  var featureCache = null;

  var el = {};

  function init() {
    el.screen = document.getElementById('phoneScreen') || document.querySelector('.phone-screen');
    el.pageHome = document.getElementById('phonePageHome');
    el.pageProfile = document.getElementById('phonePageProfile');
    el.tabbar = document.getElementById('phoneTabbar');
    el.navbar = document.getElementById('phoneNavbar');
    el.navbarTitle = document.getElementById('phoneNavbarTitle');
    bindTabbarDelegation();
    bindSectionDelegation();
  }

  // ==================== 主题色 ====================

  function applyTheme() {
    document.querySelector('.phone').style.setProperty('--p-primary', Store.state.color);
    el.navbarTitle.textContent = Store.state.mingcheng || '商家名称';
  }

  // ==================== 整体渲染 ====================

  function render() {
    applyTheme();
    renderTabbar();
    renderHome();
    renderProfile();
    updateViewVisibility();
  }

  function updateViewVisibility() {
    var isHome = view === 'home';
    el.pageHome.style.display = isHome ? '' : 'none';
    el.pageProfile.style.display = isHome ? 'none' : '';
    document.querySelectorAll('.view-switch-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-view') === view);
    });
    markActiveTab();
  }

  // ==================== TabBar ====================

  function sortedTabs() {
    return Store.state.tabBar.slice().sort(function (a, b) {
      return (parseInt(a.sort, 10) || 0) - (parseInt(b.sort, 10) || 0);
    });
  }

  function renderTabbar() {
    var tabs = sortedTabs();
    if (tabs.length === 0) {
      el.tabbar.innerHTML = '<div class="pv-tab-empty">底部导航为空，请在左侧添加</div>';
      return;
    }
    el.tabbar.innerHTML = tabs.map(function (tab, idx) {
      var isActive = isTabActive(tab);
      // 商家 icons 资源在预览中不可用，按 page 映射占位图标
      var icon = DecorationSchema.pageIcons[tab.page] || 'fa-navicon';
      return '<div class="pv-tab-item' + (isActive ? ' active' : '') + '" data-page="' + (tab.page || '') + '" data-pv-idx="' + idx + '">' +
        '<div class="pv-tab-icon"><i class="fa ' + icon + '"></i></div>' +
        '<div class="pv-tab-label">' + escapeHtml(tab.name || '') + '</div>' +
        '</div>';
    }).join('');
    applyTabStyles(tabs);
  }

  /** 应用 tab.style 自定义样式（含选中态，注入 <style> 规则） */
  function applyTabStyles(tabs) {
    var styleEl = document.getElementById('pv-tab-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'pv-tab-style';
      document.head.appendChild(styleEl);
    }
    var css = [];
    tabs.forEach(function (tab, idx) {
      var st = (tab.style && typeof tab.style === 'object' && !Array.isArray(tab.style)) ? tab.style : {};
      if (!Object.keys(st).length) return;
      var base = '';
      if (st.bgColor) base += 'background:' + st.bgColor + ';';
      if (st.textColor) base += 'color:' + st.textColor + ';';
      if (st.borderRadius) base += 'border-radius:' + parseInt(st.borderRadius, 10) + 'px;';
      if (base) css.push('.pv-tab-item[data-pv-idx="' + idx + '"]{' + base + '}');
      var active = '';
      if (st.activeBg) active += 'background:' + st.activeBg + ' !important;';
      if (st.activeText) active += 'color:' + st.activeText + ' !important;';
      if (active) {
        css.push('.pv-tab-item[data-pv-idx="' + idx + '"].active,' +
          '.pv-tab-item[data-pv-idx="' + idx + '"].active .pv-tab-icon,' +
          '.pv-tab-item[data-pv-idx="' + idx + '"].active .pv-tab-label{' + active + '}');
      }
    });
    styleEl.textContent = css.join('\n');
  }

  function isTabActive(tab) {
    if (view === 'home') return tab.page === 'home';
    return tab.page === 'mine' || tab.page === 'profile';
  }

  function markActiveTab() {
    el.tabbar.querySelectorAll('.pv-tab-item').forEach(function (item) {
      var page = item.getAttribute('data-page');
      var active = view === 'home' ? page === 'home' : (page === 'mine' || page === 'profile');
      item.classList.toggle('active', active);
    });
  }

  function bindTabbarDelegation() {
    el.tabbar.addEventListener('click', function (e) {
      var item = e.target.closest('.pv-tab-item');
      if (!item) return;
      var page = item.getAttribute('data-page');
      if (page === 'home') {
        switchView('home');
      } else if (page === 'mine' || page === 'profile') {
        switchView('profile');
      } else {
        showToast('「' + page + '」页面不在装修范围，仅支持首页与我的');
      }
    });
  }

  /** 切换预览视图（工具栏按钮 / TabBar 点击共用） */
  function switchView(v) {
    if (view === v) return;
    view = v;
    currentCategory = 0;
    updateViewVisibility();
    renderHome();
    renderProfile();
  }

  // ==================== 首页视图 ====================

  function renderHome() {
    stopBanner();
    currentBannerIndex = 0;
    var sections = Store.getHomeSections();
    if (!sections) {
      el.pageHome.innerHTML =
        '<div class="pv-placeholder"><i class="fa fa-info-circle" style="margin-right:5px;"></i>' +
        '底部导航中没有「首页」标签（page=home）<br>添加后即可在此配置首页组件</div>';
      return;
    }

    el.pageHome.innerHTML = '';
    sections.forEach(function (section, index) {
      if (!section || !section.type) return;
      var renderer = renderers[section.type];
      var wrap = document.createElement('div');
      wrap.className = 'pv-section' + (section.hidden ? ' pv-section-hidden' : '');
      wrap.setAttribute('data-sel-type', 'section');
      wrap.setAttribute('data-sel-index', index);
      wrap.setAttribute('data-label', DecorationSchema.sectionTypes[section.type]
        ? DecorationSchema.sectionTypes[section.type].label : section.type);
      if (renderer) {
        renderer(section.config || {}, wrap, index);
      } else {
        wrap.innerHTML = '<div class="pv-placeholder">未知组件类型: ' + escapeHtml(section.type) + '</div>';
      }
      el.pageHome.appendChild(wrap);
    });

    highlightSelection();
  }

  var renderers = {
    search_box: renderSearchBox,
    banner_swiper: renderBanner,
    feature_list: renderFeatureList,
    content_list: renderContentList
  };

  // ---------- search_box ----------

  function renderSearchBox(config, wrap) {
    var orgHtml = config.show_org_switch
      ? '<div class="pv-search-org"><span class="pv-arrow">▼</span><span>组织</span></div>'
      : '';
    wrap.innerHTML =
      '<div class="pv-search"><div class="pv-search-wrapper">' + orgHtml +
      '<div class="pv-search-input-wrap"><span class="pv-search-icon"><i class="fa fa-search"></i></span>' +
      '<input class="pv-search-input" placeholder="请输入要搜索的内容" /></div>' +
      '</div></div>';
  }

  // ---------- banner_swiper ----------

  function renderBanner(config, wrap) {
    var rowids = (config && Array.isArray(config.items)) ? config.items.filter(Boolean) : [];
    var key = rowids.join(',');

    var html = '<div class="pv-banner-container"><div class="pv-banner-slides">';
    if (rowids.length === 0) {
      html += '<div class="pv-banner-slide active"><div class="pv-banner-empty">' +
        '<i class="fa fa-picture-o"></i><span>未选择轮播内容</span></div></div>';
    }
    html += '</div><div class="pv-banner-dots"></div></div>';
    wrap.innerHTML = html;

    if (rowids.length === 0) return;

    if (bannerCache[key]) {
      fillBanner(wrap, bannerCache[key]);
      startBanner(wrap);
    } else {
      DecorationApi.getContentByRowids(rowids).then(function (rows) {
        bannerCache[key] = rows;
        // 渲染期间配置可能已变，确认当前 DOM 仍属于本次渲染
        if (!wrap.isConnected) return;
        fillBanner(wrap, rows);
        startBanner(wrap);
      });
    }
  }

  function fillBanner(wrap, rows) {
    var slidesEl = wrap.querySelector('.pv-banner-slides');
    var dotsEl = wrap.querySelector('.pv-banner-dots');
    if (!slidesEl) return;
    if (rows.length === 0) {
      slidesEl.innerHTML = '<div class="pv-banner-slide active"><div class="pv-banner-empty">' +
        '<i class="fa fa-exclamation-circle"></i><span>轮播内容加载失败或已被删除</span></div></div>';
      dotsEl.innerHTML = '';
      return;
    }
    slidesEl.innerHTML = rows.map(function (row, i) {
      return '<div class="pv-banner-slide' + (i === 0 ? ' active' : '') + '">' +
        (row.zhutu
          ? '<img class="pv-banner-img" src="' + row.zhutu + '" alt="" />'
          : '<div class="pv-banner-empty"><i class="fa fa-picture-o"></i><span>' +
            escapeHtml(row.mingcheng || '无主图') + '</span></div>') +
        '</div>';
    }).join('');
    dotsEl.innerHTML = rows.map(function (row, i) {
      return '<span class="pv-banner-dot' + (i === 0 ? ' active' : '') + '"></span>';
    }).join('');
  }

  function startBanner(wrap) {
    stopBanner();
    var count = wrap.querySelectorAll('.pv-banner-slide').length;
    if (count <= 1) return;
    bannerTimer = setInterval(function () {
      if (!wrap.isConnected) { stopBanner(); return; }
      currentBannerIndex = (currentBannerIndex + 1) % count;
      wrap.querySelectorAll('.pv-banner-slide').forEach(function (s, i) {
        s.classList.toggle('active', i === currentBannerIndex);
      });
      wrap.querySelectorAll('.pv-banner-dot').forEach(function (d, i) {
        d.classList.toggle('active', i === currentBannerIndex);
      });
    }, 4000);
  }

  function stopBanner() {
    if (bannerTimer) { clearInterval(bannerTimer); bannerTimer = null; }
  }

  // ---------- feature_list ----------

  function renderFeatureList(config, wrap) {
    if (config.show_feature_list === false) {
      wrap.innerHTML = '';
      return;
    }
    var cols = parseInt(config.columns, 10) || 4;
    wrap.innerHTML = '<div class="pv-feature-section"><div class="pv-feature-grid" ' +
      'style="grid-template-columns:repeat(' + cols + ',1fr);">' +
      '<div class="pv-feature-empty"><i class="fa fa-spinner fa-spin" style="margin-right:5px;"></i>功能加载中...</div>' +
      '</div></div>';

    if (featureCache) {
      fillFeature(wrap, featureCache, cols);
    } else {
      DecorationApi.getFeatureList().then(function (items) {
        featureCache = items;
        if (!wrap.isConnected) return;
        fillFeature(wrap, items, cols);
      }).catch(function () {
        if (!wrap.isConnected) return;
        fillFeature(wrap, [], cols);
      });
    }
  }

  function fillFeature(wrap, items, cols) {    var grid = wrap.querySelector('.pv-feature-grid');
    if (!grid) return;
    if (items.length === 0) {
      grid.innerHTML = '<div class="pv-feature-empty">功能表中暂无该商家的功能</div>';
      return;
    }
    grid.style.gridTemplateColumns = 'repeat(' + cols + ',1fr)';
    grid.innerHTML = items.slice(0, 8).map(function (item) {
      var iconHtml = item.iconUrl
        ? '<img src="' + item.iconUrl + '" alt="" />'
        : '<i class="fa fa-th"></i>';
      return '<div class="pv-feature-item">' +
        '<div class="pv-feature-icon">' + iconHtml + '</div>' +
        '<div class="pv-feature-label">' + escapeHtml(item.label) + '</div>' +
        '</div>';
    }).join('');
  }

  // ---------- content_list ----------

  function renderContentList(config, wrap, sectionIndex) {
    var categories = (config && Array.isArray(config.category_filter)) ? config.category_filter.slice() : [];
    categories.sort(function (a, b) {
      return (parseInt(a.sort, 10) || 0) - (parseInt(b.sort, 10) || 0);
    });
    if (currentCategory >= categories.length) currentCategory = 0;
    var activeCat = categories[currentCategory] || null;

    var html = '';
    if (categories.length > 0) {
      html += '<div class="pv-category-scroll"><div class="pv-category-nav">' +
        categories.map(function (cat, i) {
          return '<div class="pv-category-item' + (i === currentCategory ? ' active' : '') + '" data-cat-index="' + i + '">' +
            escapeHtml(cat.name || '未命名') + '</div>';
        }).join('') +
        '</div></div>';
    }
    html += '<div class="pv-post-list"><div class="pv-list-loading">' +
      '<i class="fa fa-spinner fa-spin"></i>内容加载中...</div></div>';
    wrap.innerHTML = html;

    // 分类 tab 点击（预览内切换，不冒泡到选中）
    wrap.querySelectorAll('.pv-category-item').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        currentCategory = parseInt(this.getAttribute('data-cat-index'), 10) || 0;
        renderHome();
      });
    });

    var listEl = wrap.querySelector('.pv-post-list');
    var types = (config && Array.isArray(config.content_types) && config.content_types.length > 0)
      ? config.content_types : ['article'];
    var cacheKey = sectionIndex + '|' + types.join(',') + '|' + (activeCat ? (activeCat.rowid || '') : '');

    if (contentCache[cacheKey]) {
      fillContentList(listEl, contentCache[cacheKey], config);
    } else {
      var opts = {
        leixing: types.indexOf('article') !== -1 ? '文章' : '',
        categoryRowid: activeCat ? (activeCat.rowid || '') : '',
        pageSize: parseInt((config && config.items_per_load), 10) || 10
      };
      DecorationApi.getContentList(opts).then(function (res) {
        contentCache[cacheKey] = res.rows;
        if (!listEl.isConnected) return;
        fillContentList(listEl, res.rows, config);
      }).catch(function () {
        if (!listEl.isConnected) return;
        listEl.innerHTML = '<div class="pv-list-loading">内容加载失败</div>';
      });
    }
  }

  function fillContentList(listEl, rows, config) {
    if (rows.length === 0) {
      listEl.innerHTML = '<div class="pv-list-loading">该分类下暂无内容</div>';
      return;
    }
    listEl.innerHTML = rows.map(function (row) {
      var cover = row.zhutu
        ? '<img src="' + row.zhutu + '" alt="" />'
        : '<div class="pv-cover-fallback"><i class="fa fa-file-image-o"></i></div>';
      return '<div class="pv-post-card">' +
        '<div class="pv-post-cover">' + cover + '</div>' +
        '<div class="pv-post-info">' +
          '<div class="pv-post-title">' + escapeHtml(row.mingcheng || '未命名') + '</div>' +
          '<div class="pv-post-tags"><span class="pv-post-tag">' + escapeHtml(row.leixing || '内容') + '</span></div>' +
          '<div class="pv-post-author-row"></div>' +
          '<div class="pv-post-stats"><span class="pv-post-stat"><i class="fa fa-eye"></i></span>' +
          '<span class="pv-post-stat"><i class="fa fa-heart-o"></i></span>' +
          '<span class="pv-post-stat"><i class="fa fa-comment-o"></i></span></div>' +
        '</div></div>';
    }).join('');
  }

  // ==================== 我的视图 ====================

  function renderProfile() {
    var wode = Store.state.wode.slice().sort(function (a, b) {
      return (parseInt(a.sort, 10) || 0) - (parseInt(b.sort, 10) || 0);
    });

    var itemsHtml = wode.length === 0
      ? '<div class="pv-wode-empty">「我的」页面菜单为空，请在左侧添加</div>'
      : wode.map(function (item) {
        var idx = Store.state.wode.indexOf(item);
        var icon = DecorationSchema.pageIcons[item.page] || 'fa-navicon';
        return '<div class="pv-wode-item" data-sel-type="wode" data-sel-index="' + idx + '">' +
          '<div class="pv-wode-item-icon"><i class="fa ' + icon + '"></i></div>' +
          '<div class="pv-wode-item-name">' + escapeHtml(item.name || '未命名菜单') + '</div>' +
          '<i class="fa fa-angle-right"></i>' +
          '</div>';
      }).join('');

    el.pageProfile.innerHTML =
      '<div class="pv-profile-header">' +
        '<div class="pv-profile-avatar"><i class="fa fa-user"></i></div>' +
        '<div><div class="pv-profile-name">点击登录</div>' +
        '<div class="pv-profile-sub">' + escapeHtml(Store.state.mingcheng || '') + '</div></div>' +
      '</div>' +
      '<div class="pv-profile-card">' + itemsHtml + '</div>';

    highlightSelection();
  }

  // ==================== 选中联动 ====================

  function bindSectionDelegation() {
    el.pageHome.addEventListener('click', function (e) {
      if (e.target.closest('.pv-category-item')) return; // 分类切换已单独处理
      var sec = e.target.closest('.pv-section');
      if (!sec) return;
      Store.select('section', parseInt(sec.getAttribute('data-sel-index'), 10));
    });
    el.pageProfile.addEventListener('click', function (e) {
      var item = e.target.closest('.pv-wode-item');
      if (!item) return;
      Store.select('wode', parseInt(item.getAttribute('data-sel-index'), 10));
    });
  }

  function highlightSelection() {
    var sel = Store.getSelection();
    document.querySelectorAll('.pv-section.pv-selected').forEach(function (n) {
      n.classList.remove('pv-selected');
    });
    if (!sel) return;
    if (sel.type === 'section') {
      var node = el.pageHome.querySelector('.pv-section[data-sel-index="' + sel.index + '"]');
      if (node) node.classList.add('pv-selected');
    }
  }

  return {
    init: init,
    render: render,
    renderHome: renderHome,
    renderProfile: renderProfile,
    renderTabbar: renderTabbar,
    switchView: switchView,
    highlightSelection: highlightSelection,
    /** 功能项数据变化后调用（右栏管理器增删改/排序后） */
    invalidateFeature: function () {
      featureCache = null;
      renderHome();
    },
    clearCaches: function () {
      bannerCache = {};
      contentCache = {};
      featureCache = null;
    }
  };
})();
