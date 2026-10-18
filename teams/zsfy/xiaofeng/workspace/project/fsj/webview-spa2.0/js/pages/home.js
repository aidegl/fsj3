/**
 * SPA 2.0 首页 - 配置驱动组件系统
 * 根据 JSON 配置动态渲染首页组件（banner_swiper / feature_list / content_list）
 */
(function () {
  'use strict';

  // ========== 拼团用户头像渲染 ==========

  /**
   * 从 ptyh 字段解析拼团用户头像
   * 审核期间不返回头像
   */
  function renderPtyhAvatars(ptyhField) {
    // 审核期间不显示用户头像
    var shenhe = localStorage.getItem('fsj_shenhe') || '';
    if (shenhe === '1') return '';

    if (!ptyhField) return '';
    var avatars = [];
    try {
      var ptyh = typeof ptyhField === 'string' ? JSON.parse(ptyhField) : ptyhField;
      if (!Array.isArray(ptyh)) return '';
      ptyh.forEach(function (user) {
        if (!user.sourcevalue) return;
        try {
          var sv = JSON.parse(user.sourcevalue);
          var avatarField = sv['69ad979f6a3532cabd764603'];
          if (avatarField) {
            var avatarArr = typeof avatarField === 'string' ? JSON.parse(avatarField) : avatarField;
            if (Array.isArray(avatarArr) && avatarArr.length > 0) {
              var url = avatarArr[0].thumbnail_full_path || avatarArr[0].large_thumbnail_full_path || '';
              if (url) avatars.push(url);
            }
          }
        } catch (e) {}
      });
    } catch (e) { return ''; }
    if (avatars.length === 0) return '';
    var maxShow = 3;
    var html = '<div class="post-ptyh-avatars">';
    avatars.slice(0, maxShow).forEach(function (url) {
      html += '<img class="post-ptyh-avatar" src="' + url + '" alt="" />';
    });
    if (avatars.length > maxShow) {
      html += '<span class="post-ptyh-more">...</span>';
    }
    html += '</div>';
    return html;
  }

  // ========== adv 语义模型 → HAP 筛选器线格式（兼容旧格式数据） ==========
var ADV_FIELD_DT = { mingcheng:2, miaoshu:2, leixing:11, sew:11, '6a0521f9104f63109c08d466':29, '6a045ea70507e352629dd2c6':29, fbsj:16, ctime:16, yuedu:6, dianzan:6, pinglun:6 };
function advCondToWire(c, splice) {
  var dt = ADV_FIELD_DT[c.field] || 2;
  var w = { controlId: c.field, dataType: dt, spliceType: splice || 1 };
  switch (c.op) {
    case 'eq': w.filterType = 2; w.value = c.value; break;
    case 'ne': w.filterType = 6; w.value = c.value; break;
    case 'like': w.filterType = 1; w.value = c.value; break;
    case 'rceq': w.filterType = 24; w.value = c.value; break;
    case 'gt': w.filterType = 13; w.value = c.value; break;
    case 'gte': w.filterType = 14; w.value = c.value; break;
    case 'lt': w.filterType = 15; w.value = c.value; break;
    case 'lte': w.filterType = 16; w.value = c.value; break;
    case 'between': w.filterType = 11; w.minValue = c.min; w.maxValue = c.max; break;
    case 'date_today': w.filterType = 17; w.dateRange = 1; break;
    case 'date_thismonth': w.filterType = 17; w.dateRange = 7; break;
    default: return null;
  }
  return w;
}
function advToWire(adv) {
  var st = (adv.op === 'or') ? 2 : 1;
  var out = [];
  (adv.items || []).forEach(function (it) {
    if (it.kind === 'group') {
      var gst = (it.op === 'or') ? 2 : 1;
      var gf = [];
      (it.items || []).forEach(function (c) {
        if (c.kind !== 'cond') return;
        var w = advCondToWire(c, gst);
        if (w) gf.push(w);
      });
      if (gf.length) out.push({ controlId: gf[0].controlId, dataType: gf[0].dataType, spliceType: gst, filterType: gf[0].filterType, isGroup: true, groupFilters: gf });
    } else {
      var w = advCondToWire(it, st);
      if (w) out.push(w);
    }
  });
  return out;
}

var HomePage = {
    config: null,
    currentCategory: 0,
    currentFilterRowid: '',
    categoryTabs: [],
    bannerSwiper: null,
    bannerDots: null,
    categoryNav: null,
    articleList: null,
    currentBannerIndex: 0,
    bannerTimer: null,
    iconData: {},
    // 内容列表分页状态
    listPageIndex: 0,
    listHasMore: true,
    listLoading: false,
    listLoadedCount: 0,
    listPageSize: 10,
    _homeScrollBound: false,

    init: function (pageConfig) {
      this.config = this.loadHomeConfig(pageConfig);
      var self = this;
      this._prepareIcons(function () {
        self.renderSections();
      });
    },

    loadHomeConfig: function (pageConfig) {
      if (pageConfig && typeof pageConfig === 'object' && pageConfig.home_sections) {
        return pageConfig;
      }
      return this.getDefaultConfig();
    },

    getDefaultConfig: function () {
      return {
        home_sections: [
          {
            type: 'banner_swiper',
            config: {
              items: []
            }
          },
          {
            type: 'content_list',
            config: {
              content_types: ['article'],
              card_layout: 'horizontal',
              items_per_load: 10,
              category_filter: [
                { name: '全部', sort: '0', rowid: '' }
              ]
            }
          }
        ]
      };
    },

    renderSections: function () {
      var contentEl = document.getElementById('home-content');
      if (!contentEl) return;
      contentEl.innerHTML = '';

      var self = this;
      this.config.home_sections.forEach(function (section, index) {
        if (section.hidden) return;
        var renderer = self.getRenderer(section.type);
        if (renderer) {
          renderer.call(self, section.config, contentEl, index);
        } else {
          console.warn('[HomePage] 未知组件类型:', section.type);
        }
      });

      this.bindEvents();
    },

    getRenderer: function (type) {
      var renderers = {
        'search_box': this.renderSearchBox,
        'banner_swiper': this.renderBannerSwiper,
        'feature_list': this.renderFeatureList,
        'content_list': this.renderContentList
      };
      return renderers[type] || null;
    },

    // ========== search_box 渲染器 ==========
    renderSearchBox: function (config, containerEl, sectionIndex) {
      var self = this;
      var sectionEl = document.createElement('div');
      sectionEl.className = 'section search-section';
      sectionEl.dataset.sectionIndex = sectionIndex;

      var showOrgSwitch = config && config.show_org_switch === true;

      var html = '<div class="search-bar-wrapper">' +
        (showOrgSwitch ? '<div class="search-org-selector"><span class="search-org-arrow">▼</span><span class="search-org-name">组织</span></div>' : '') +
        '<div class="search-input-wrap">' +
          '<span class="search-icon">🔍</span>' +
          '<input type="text" class="search-input" placeholder="请输入要搜索的内容" />' +
          '<span class="search-clear" style="display:none;">×</span>' +
        '</div>' +
      '</div>';

      sectionEl.innerHTML = html;
      containerEl.appendChild(sectionEl);

      // 绑定输入框清空按钮
      var input = sectionEl.querySelector('.search-input');
      var clearBtn = sectionEl.querySelector('.search-clear');
      if (input && clearBtn) {
        input.addEventListener('input', function () {
          clearBtn.style.display = input.value ? '' : 'none';
        });
        clearBtn.addEventListener('click', function () {
          input.value = '';
          clearBtn.style.display = 'none';
          input.focus();
        });
      }

      // 绑定组织选择器
      if (showOrgSwitch) {
        this.bindOrgSelector(sectionEl);
      }
    },

    // ========== 组织选择器交互 ==========
    bindOrgSelector: function (sectionEl) {
      var self = this;
      var selector = sectionEl.querySelector('.search-org-selector');
      if (!selector) return;
      selector.addEventListener('click', function (e) {
        e.stopPropagation();
        self.toggleOrgDropdown(sectionEl, selector);
      });
    },

    toggleOrgDropdown: function (sectionEl, selector) {
      if (document.querySelector('.org-sheet')) return; // 已打开则忽略（用遮罩/关闭按钮关）

      // 遮罩
      var mask = document.createElement('div');
      mask.className = 'org-dropdown-mask';
      document.body.appendChild(mask);

      // 底部面板
      var sheet = document.createElement('div');
      sheet.className = 'org-sheet';
      sheet.innerHTML =
        '<div class="org-sheet-header">' +
          '<span class="org-sheet-title">选择组织</span>' +
          '<span class="org-sheet-close">×</span>' +
        '</div>' +
        '<div class="org-sheet-search">' +
          '<input type="text" class="org-sheet-search-input" placeholder="搜索组织" />' +
        '</div>' +
        '<div class="org-sheet-list"><div class="org-dropdown-loading">加载中...</div></div>';
      document.body.appendChild(sheet);

      // 触发进入动画
      setTimeout(function () {
        mask.classList.add('show');
        sheet.classList.add('show');
      }, 10);

      // 关闭（带退出动画）
      function closeSheet() {
        mask.classList.remove('show');
        sheet.classList.remove('show');
        setTimeout(function () { mask.remove(); sheet.remove(); }, 250);
      }

      mask.addEventListener('click', closeSheet);
      var closeBtn = sheet.querySelector('.org-sheet-close');
      if (closeBtn) closeBtn.addEventListener('click', closeSheet);

      if (!window.FsjApi || !FsjApi.getUserOrgs) {
        sheet.querySelector('.org-sheet-list').innerHTML = '<div class="org-dropdown-error">接口不可用</div>';
        return;
      }

      // 按关键词渲染组织列表（前端过滤）
      function renderList(orgs, keyword) {
        var listEl = sheet.querySelector('.org-sheet-list');
        if (!listEl) return;
        var kw = (keyword || '').trim().toLowerCase();
        var filtered = kw
          ? orgs.filter(function (o) { return (o.mingcheng || '').toLowerCase().indexOf(kw) !== -1; })
          : orgs;

        if (filtered.length === 0) {
          listEl.innerHTML = '<div class="org-dropdown-empty">' + (kw ? '无匹配组织' : '未加入任何组织') + '</div>';
          return;
        }
        var nameEl = sectionEl.querySelector('.search-org-name');
        var currentName = nameEl ? nameEl.textContent : '';
        listEl.innerHTML = filtered.map(function (o) {
          var name = o.mingcheng || o.rowid;
          var cls = (name === currentName) ? 'org-dropdown-item org-dropdown-item-selected' : 'org-dropdown-item';
          return '<div class="' + cls + '" data-rowid="' + o.rowid + '">' + name + '</div>';
        }).join('');

        listEl.querySelectorAll('.org-dropdown-item').forEach(function (item) {
          item.addEventListener('click', function (e) {
            e.stopPropagation();
            var nEl = sectionEl.querySelector('.search-org-name');
            if (nEl) nEl.textContent = this.textContent;
            // TODO: MVP-4 选中状态持久化 + 联动内容过滤
            closeSheet();
          });
        });
      }

      FsjApi.getUserOrgs().then(function (orgs) {
        if (!orgs || orgs.length === 0) {
          sheet.querySelector('.org-sheet-list').innerHTML = '<div class="org-dropdown-empty">未加入任何组织</div>';
          return;
        }
        renderList(orgs, '');
        var searchInput = sheet.querySelector('.org-sheet-search-input');
        if (searchInput) {
          searchInput.addEventListener('input', function () { renderList(orgs, this.value); });
          setTimeout(function () { searchInput.focus(); }, 300); // 进入动画后聚焦
        }
      }).catch(function () {
        sheet.querySelector('.org-sheet-list').innerHTML = '<div class="org-dropdown-error">加载失败</div>';
      });
    },


    // ========== banner_swiper 渲染器 ==========
    renderBannerSwiper: function (config, containerEl, sectionIndex) {
      var self = this;
      var sectionEl = document.createElement('div');
      sectionEl.className = 'section banner-section';
      sectionEl.dataset.sectionIndex = sectionIndex;

      // 兼容新旧三种格式：
      // 1. 新格式: config.items = ["rowid1", "rowid2", ...]  → API 查数据
      // 2. 旧格式(rowid数组): config.source_filter.items = ["rowid1", ...]  → API 查数据
      // 3. 旧格式(图片对象): config.source_filter.items = [{image_url, title}, ...]  → 直接渲染
      var rawItems = config.items || [];
      if (rawItems.length === 0 && config.source_filter && config.source_filter.items) {
        rawItems = config.source_filter.items;
      }
      console.log('[HomePage][Banner] rawItems 数量:', rawItems.length);
      if (!rawItems || rawItems.length === 0) {
        return;
      }

      // 判断是 rowid 字符串数组还是图片对象数组
      var isRowidArray = rawItems.length > 0 && typeof rawItems[0] === 'string';

      if (isRowidArray) {
        // rowid 字符串模式 → 通过 API 获取数据
        var rowids = rawItems.filter(function (r) { return r; });
        console.log('[HomePage][Banner] rowid 模式:', rowids);

        containerEl.appendChild(sectionEl);

        FsjApi.getContentByRowids(rowids).then(function (rows) {
          if (!rows || rows.length === 0) {
            return;
          }
          self._renderBannerDOM(rows.map(function (row) {
            return {
              image_url: FsjApi.parseImage ? FsjApi.parseImage(row.zhutu) : '',
              title: row.mingcheng || '',
              rowid: row.rowid || ''
            };
          }), sectionEl);
        }).catch(function (err) {
          console.error('[HomePage] 轮播图加载失败:', err);
        });
      } else {
        // 图片对象模式 → 直接渲染
        console.log('[HomePage][Banner] 图片对象模式:', rawItems.length, '个');
        var bannerItems = rawItems.map(function (item) {
          return {
            image_url: item.image_url || '',
            title: item.title || '',
            rowid: item.rowid || '',
            link_url: item.link_url || '',
            link_type: item.link_type || 'none'
          };
        });

        var html = '<div class="banner-container">' +
          '<div class="banner-swiper">';
        bannerItems.forEach(function (item, i) {
          html += '<div class="banner-slide' + (i === 0 ? ' active' : '') + '"' +
            (item.rowid ? ' data-rowid="' + item.rowid + '"' : '') + '>' +
            '<img class="banner-img" src="' + (item.image_url || '') + '" alt="' + (item.title || '') + '" />' +
          '</div>';
        });
        html += '</div><div class="banner-dots">';
        bannerItems.forEach(function (item, i) {
          html += '<span class="banner-dot' + (i === 0 ? ' active' : '') + '"></span>';
        });
        html += '</div></div>';

        sectionEl.innerHTML = html;
        containerEl.appendChild(sectionEl);

        this.bannerSwiper = sectionEl.querySelector('.banner-swiper');
        this.bannerDots = sectionEl.querySelector('.banner-dots');

        // 如果有 rowid 则绑定点击跳转
        var hasRowid = bannerItems.some(function (item) { return item.rowid; });
        if (hasRowid) {
          this._bindBannerClick(bannerItems);
        }
        this._bindBannerSwipe();
      }
    },

    // 渲染轮播图 DOM（rowid 模式数据已加载后调用）
    _renderBannerDOM: function (bannerItems, sectionEl) {
      var self = this;
      var html = '<div class="banner-container">' +
        '<div class="banner-swiper">';
      bannerItems.forEach(function (item, i) {
        html += '<div class="banner-slide' + (i === 0 ? ' active' : '') + '" data-rowid="' + (item.rowid || '') + '">' +
          '<img class="banner-img" src="' + (item.image_url || '') + '" alt="' + (item.title || '') + '" />' +
        '</div>';
      });
      html += '</div><div class="banner-dots">';
      bannerItems.forEach(function (item, i) {
        html += '<span class="banner-dot' + (i === 0 ? ' active' : '') + '"></span>';
      });
      html += '</div></div>';

      sectionEl.innerHTML = html;

      self.bannerSwiper = sectionEl.querySelector('.banner-swiper');
      self.bannerDots = sectionEl.querySelector('.banner-dots');
      self._bindBannerClick(bannerItems);
      self._bindBannerSwipe();
    },

    // 轮播图点击跳转详情
    _bindBannerClick: function (bannerItems) {
      var self = this;
      if (!this.bannerSwiper) return;
      this.bannerSwiper.addEventListener('click', function (e) {
        var slide = e.target.closest('.banner-slide');
        if (!slide) return;
        var rowid = slide.getAttribute('data-rowid');
        if (!rowid) return;
        console.log('[HomePage] 轮播图点击跳转, rowid:', rowid);
        if (window.App) App.switchToContentDetail(rowid, 'home');
      });
    },

    // ========== feature_list 渲染器 ==========
    renderFeatureList: function (config, containerEl, sectionIndex) {
      if (!config.show_feature_list) return;

      var self = this;
      var sectionEl = document.createElement('div');
      sectionEl.className = 'section feature-section';
      sectionEl.dataset.sectionIndex = sectionIndex;

      // 标题（已禁用）
      var headerHtml = '';

      // 加载占位
      sectionEl.innerHTML = headerHtml + '<div class="feature-grid"><div class="feature-loading">加载中...</div></div>';
      containerEl.appendChild(sectionEl);

      // 从明道云功能表获取数据
      FsjApi.getFeatureList().then(function (items) {
        if (!items || items.length === 0) {
          sectionEl.innerHTML = headerHtml + '<div class="feature-grid"><div class="feature-empty">暂无功能</div></div>';
          return;
        }

        var gridHtml = items.map(function (item) {
          var iconHtml = item.iconUrl
            ? '<img class="feature-icon-img" src="' + item.iconUrl + '" alt="" />'
            : '';
          var urlAttr = item.url ? ' data-url="' + item.url + '"' : '';
          return '<div class="feature-item"' + urlAttr + '>' +
            '<div class="feature-icon">' + iconHtml + '</div>' +
            '<div class="feature-label">' + item.label + '</div>' +
          '</div>';
        }).join('');

        var colCount = config.columns || 4;
        sectionEl.innerHTML = headerHtml + '<div class="feature-grid" style="grid-template-columns: repeat(' + colCount + ', 1fr);">' + gridHtml + '</div>';

        // 绑定点击事件
        self._bindFeatureClick(sectionEl);
      }).catch(function (err) {
        console.error('[HomePage] 功能列表加载失败:', err);
        sectionEl.innerHTML = headerHtml + '<div class="feature-grid"><div class="feature-empty">加载失败</div></div>';
      });
    },

    _bindFeatureClick: function (sectionEl) {
      var items = sectionEl.querySelectorAll('.feature-item');
      items.forEach(function (item) {
        item.addEventListener('click', function () {
          var url = item.getAttribute('data-url');
          if (url && url.indexOf('http') === 0 && window.App) {
            // 二级入口：传来源页，webview 顶栏显示返回按钮
            App.switchToWebview(url, 'home');
          } else if (window.App) {
            // url 为空时，根据 label 判断跳转（回退逻辑）
            var label = item.querySelector('.feature-label');
            var text = label ? label.textContent : '';
            if (text.indexOf('订单') !== -1) App.switchToOrders();
            else if (text.indexOf('积分') !== -1) App.switchToPoints();
            else if (text.indexOf('地址') !== -1) App.switchToAddress();
          }
        });
      });
    },

    // ========== content_list 渲染器 ==========
    renderContentList: function (config, containerEl, sectionIndex) {
      var self = this;

      // 每页条数取配置 items_per_load，默认 10
      this.listPageSize = (config && parseInt(config.items_per_load, 10)) || 10;

      var sectionEl = document.createElement('div');
      sectionEl.className = 'section content-section';
      sectionEl.dataset.sectionIndex = sectionIndex;

      // 从 config.category_filter 读分类配置（商家在后台 JSON 编辑）
      var categories = (config && Array.isArray(config.category_filter)) ? config.category_filter.slice() : [];

      if (categories.length === 0) {
        // 没配分类 → 不渲染 tab，直接加载全部
        this.categoryNav = null;
        this.categoryTabs = [];
        this.currentFilterRowid = '';
        sectionEl.innerHTML = '<div class="post-list"></div>';
        containerEl.appendChild(sectionEl);
        this.articleList = sectionEl.querySelector('.post-list');
        this.renderArticles();
        return;
      }

      // 按 sort 排序
      categories.sort(function (a, b) {
        return (parseInt(a.sort) || 0) - (parseInt(b.sort) || 0);
      });
      // 归一化（2026-09-07 多条件导航）：
      // ① 旧配置无 type → 按 rowid 推导 category/all
      // ② 有 type 无 conds → 从 type/rowid/sewKey 推导单条件 conds
      // ③ type=all 缺省 leixing=['文章']
      categories.forEach(function (cat) {
        if (!cat.type) cat.type = (cat.rowid ? 'category' : 'all');
        if (cat.type === 'all' && !Array.isArray(cat.leixing)) cat.leixing = ['文章'];
        if (!Array.isArray(cat.conds)) {
          var c = {};
          if (cat.type === 'sew' && cat.sewKey) { c.type = 'sew'; c.sewKey = cat.sewKey; }
          else if (cat.rowid) { c.type = 'category'; c.rowid = cat.rowid; }
          else if (cat.type === 'keyword' && cat.kwName) { c.type = 'keyword'; }
          cat.conds = (c.type || cat.kwName) ? [c] : [];
        }
      });
      this.categoryTabs = categories;

      // 默认选中第一个
      this.currentFilterTab = categories[0] || { name: '全部', type: 'all', leixing: ['文章'] };
      this.currentFilterRowid = this.currentFilterTab.rowid || '';

      var html = '<div class="category-scroll">' +
        '<div class="category-nav">';
      categories.forEach(function (cat, i) {
        var isActive = i === 0 ? ' active' : '';
        html += '<div class="category-item' + isActive + '" data-index="' + i + '">' + cat.name + '</div>';
      });
      html += '</div></div><div class="post-list">';
      html += '</div>';

      sectionEl.innerHTML = html;
      containerEl.appendChild(sectionEl);

      this.categoryNav = sectionEl.querySelector('.category-nav');
      this.articleList = sectionEl.querySelector('.post-list');

      this.renderArticles();
    },

    // ========== 文章列表渲染（content_list 子方法，分页加载） ==========
    renderArticles: function () {
      if (!this.articleList) return;
      // 重置分页状态，加载第一页
      this.listPageIndex = 0;
      this.listHasMore = true;
      this.listLoading = false;
      this.listLoadedCount = 0;
      this.articleList.innerHTML = '<div class="loading-state" style="padding:40px 0;"><div class="loading-spinner"></div><p>加载中...</p></div>';
      if (FsjApi && FsjApi.getContentList) {
        this._loadArticlesPage(1);
      } else {
        this.renderArticlesFallback();
      }
    },

    // 构建列表过滤条件（每次新建数组，getContentList 内部会往里 push 商家/删除条件）
    // 2026-09-07 多条件导航：tab.conds = [{type,rowid|sewKey}…] + tab.op（and/or）
    // 兼容旧单条件格式 { type, rowid, sewKey }
    _buildListFilters: function () {
      var filters = [
        { controlId: 'shangjia1', dataType: 2, spliceType: 1, filterType: 2, value: '1' }
      ];
      var tab = this.currentFilterTab || {};
      // HAP 原生筛选器格式直接透传
      if (tab.filters && Array.isArray(tab.filters) && tab.filters.length) {
        return filters.concat(tab.filters);
      }
      // 兼容旧格式（adv 语义模型）
      if (tab.adv && typeof advToWire === 'function') {
        return filters.concat(advToWire(tab.adv));
      }
      var conds = Array.isArray(tab.conds) ? tab.conds.slice() : [];
      // 旧单条件格式兼容
      if (conds.length === 0 && tab.rowid) {
        conds.push({ type: tab.type || 'category', rowid: tab.rowid });
      } else if (conds.length === 0 && tab.sewKey) {
        conds.push({ type: 'sew', sewKey: tab.sewKey });
      }
      var op = (tab.op === 'or') ? 'or' : 'and';
      var ST = (op === 'or') ? 2 : 1;   // 条件间拼接方式（第一个条件的 spliceType 无实际作用）

      conds.forEach(function (c) {
        if (c.type === 'category' && c.rowid) {
          filters.push({ controlId: '6a0521f9104f63109c08d466', dataType: 29, spliceType: ST, filterType: 24, value: c.rowid });
        } else if (c.type === 'keyword' && c.rowid) {
          filters.push({ controlId: '6a045ea70507e352629dd2c6', dataType: 29, spliceType: ST, filterType: 24, value: c.rowid });
        } else if (c.type === 'sew' && c.sewKey) {
          filters.push({ controlId: '6a376a7b9513239477b93e31', dataType: 11, spliceType: ST, filterType: 2, value: c.sewKey });
        }
      });

      // leixing 集合过滤（任意 tab 都可配；空=不限类型）
      if (Array.isArray(tab.leixing) && tab.leixing.length > 0) {
        filters.push({
          controlId: 'leixing',
          dataType: 11,
          spliceType: (op === 'or') ? 2 : 1,
          filterType: 2,
          values: tab.leixing
        });
      }
      return filters;
    },

    // 按页加载文章列表（滚动到底部追加下一页）
    _loadArticlesPage: function (pageIndex) {
      var self = this;
      if (!self.articleList || self.listLoading || !self.listHasMore) return;
      self.listLoading = true;

      var filters = self._buildListFilters();
      var tab = self.currentFilterTab || {};
      console.log('[HomePage] 加载内容列表, 页码:', pageIndex, '当前 tab:', JSON.stringify({ name: tab.name, type: tab.type, rowid: tab.rowid, sewKey: tab.sewKey, leixing: tab.leixing }), '过滤条件:', JSON.stringify(filters));

      // 缓存优先（2026-09-05）：第一页先渲染缓存秒开，后台再拉最新覆盖
      if (pageIndex === 1) {
        var cacheKey = 'home_' + JSON.stringify({ c: tab.conds || [], o: tab.op || 'and', l: tab.leixing || [] });
        var cachedWrapper = FsjApi.listCache ? FsjApi.listCache.get(cacheKey) : null;
        var cachedRows = cachedWrapper ? cachedWrapper.rows : null;
        if (cachedRows) {
          self.articleList.innerHTML = '';
          self.listPageIndex = 1;
          self.listLoadedCount = cachedRows.length;
          self.articleList.insertAdjacentHTML('beforeend', cachedRows.map(function (row) {
            return self._renderArticleCard(row);
          }).join(''));
          self._bindPostCardClick(self.articleList);
        }
      }

      // 追加加载指示器（首页加载占位已由 renderArticles 设置）
      var moreEl = null;
      if (pageIndex > 1) {
        moreEl = document.createElement('div');
        moreEl.className = 'list-loading-more';
        moreEl.innerHTML = '<div class="loading-state" style="padding:16px 0;"><div class="loading-spinner"></div><p>加载中...</p></div>';
        self.articleList.appendChild(moreEl);
      }

      FsjApi.getContentList(filters, pageIndex, self.listPageSize).then(function (res) {
        var rows = [];
        var total = 0;
        if (res && res.data && res.data.rows) {
          rows = res.data.rows;
          total = res.data.total || res.data.totalCount || 0;
        } else if (res && res.rows) {
          rows = res.rows;
        }

        // 客户端类型过滤跟随 tab.leixing 配置（有配置 → 按集合过滤；无配置 → 不限类型）
        var filteredRows = rows;
        console.log('[HomePage] 第', pageIndex, '页返回', rows.length, '条, 后端总数:', total);

        if (moreEl && moreEl.parentNode) moreEl.parentNode.removeChild(moreEl);

        self.listPageIndex = pageIndex;
        self.listLoadedCount += rows.length;
        self.listHasMore = rows.length > 0 && self.listLoadedCount < total;

        // 第一页就没数据 → 空状态
        if (pageIndex === 1 && rows.length === 0) {
          console.log('[HomePage] 无内容数据，显示空状态');
          self.articleList.innerHTML = '<div style="text-align:center;padding:40px 0;color:var(--color-text-weak,#9CA3AF);font-size:var(--font-sm,13px);">暂无内容</div>';
          self.listLoading = false;
          return;
        }

        // 清掉首页加载占位
        if (pageIndex === 1) self.articleList.innerHTML = '';

        if (pageIndex === 1 && FsjApi.listCache) {
          FsjApi.listCache.set('home_' + JSON.stringify({ c: tab.conds || [], o: tab.op || 'and', l: tab.leixing || [] }), filteredRows);
        }
        if (filteredRows.length > 0) {
          // 缓存秒开后拉到最新 → 覆盖第一页（分页指针按新数据重置，保证不重不漏）
          if (pageIndex === 1) self.articleList.innerHTML = '';
          self.articleList.insertAdjacentHTML('beforeend', filteredRows.map(function (row) {
            return self._renderArticleCard(row);
          }).join(''));
          self._bindPostCardClick(self.articleList);
        }

        // 全部加载完 → 底部提示
        if (!self.listHasMore && self.listLoadedCount > 0) {
          var footer = document.createElement('div');
          footer.className = 'list-footer';
          footer.style.cssText = 'text-align:center;padding:16px 0;color:var(--color-text-weak,#9CA3AF);font-size:var(--font-sm,13px);';
          footer.textContent = '没有更多了';
          self.articleList.appendChild(footer);
        }

        self.listLoading = false;

        // 内容不足一屏（触发不了滚动）时自动续加载下一页
        var scroller = document.getElementById('home-content');
        if (self.listHasMore && scroller && scroller.scrollHeight <= scroller.clientHeight + 10) {
          self._loadArticlesPage(self.listPageIndex + 1);
        }
      }).catch(function (err) {
        console.error('[HomePage] 文章列表加载失败:', err);
        if (moreEl && moreEl.parentNode) moreEl.parentNode.removeChild(moreEl);
        self.listLoading = false;
        if (pageIndex === 1) self.renderArticlesFallback();
      });
    },

    // 生成单张文章卡片 HTML
    _renderArticleCard: function (row) {
      var self = this;
      var shenhe = localStorage.getItem('fsj_shenhe') || '';

      var cover = '';
      if (row.zhutu) {
        cover = FsjApi.parseImage ? FsjApi.parseImage(row.zhutu) : '';
      }
      // 没有主图就不显示，cover 保持空字符串

      var authorName = '';
      var authorAvatar = 'assets/logo.png';

      // 审核期间不显示用户头像
      if (shenhe !== '1') {
        // 发布者头像：优先级 fbztx > caid.avatar > 默认
        if (row.fbztx) {
          try {
            var fbztxData = typeof row.fbztx === 'string' ? JSON.parse(row.fbztx) : row.fbztx;
            if (Array.isArray(fbztxData) && fbztxData.length > 0) {
              authorAvatar = fbztxData[0].thumbnail_full_path || fbztxData[0].large_thumbnail_full_path || authorAvatar;
            }
          } catch (e) {}
        } else if (row.caid && row.caid.avatar) {
          authorAvatar = row.caid.avatar;
        }
      }

      if (row.fabuzhe) {
        try {
          var publisher = typeof row.fabuzhe === 'string' ? JSON.parse(row.fabuzhe) : row.fabuzhe;
          if (Array.isArray(publisher) && publisher.length > 0) {
            authorName = publisher[0].name || publisher[0].mingcheng || '';
          }
        } catch (e) {}
      }

      var rowid = row.rowid || '';
      var url = row.url || '';

      // 分类标签
      var category = '内容';
      if (row.leixing) category = row.leixing;

      // 多人标签：ptxz 不为空时显示，括号内为可参加人数
      var duoRenHtml = '';
      if (row.ptxz && row.ptxz !== '' && row.ptxz !== '0') {
        duoRenHtml = '<span class="post-duoren-tag">多人(' + row.ptxz + ')</span>';
      }

      // 发布时间
      var publishTime = '';
      if (row.ctime) {
        publishTime = FormatUtils && FormatUtils.formatRelativeTime ? FormatUtils.formatRelativeTime(row.ctime) : row.ctime;
      }

      // 主图：没有图就不渲染 cover 区域，标题自动占满宽度
      var coverHtml = '';
      if (cover) {
        coverHtml = '<div class="post-cover"><img src="' + cover + '" alt="" /></div>';
      }

      // 审核期间不渲染头像
      var authorAvatarHtml = '';
      if (shenhe !== '1') {
        authorAvatarHtml = '<img class="post-author-avatar" src="' + authorAvatar + '" alt="" />';
      }

      return '<div class="post-card" data-rowid="' + rowid + '" data-url="' + (url || '') + '">' +
        coverHtml +
        '<div class="post-info">' +
          '<h3 class="post-title">' + (row.mingcheng || '未命名') + '</h3>' +
          '<div class="post-tags">' +
            duoRenHtml +
            '<span class="post-category-tag">' + category + '</span>' +
          '</div>' +
          '<div class="post-author-row">' +
            authorAvatarHtml +
            '<span class="post-author-name">' + (authorName || '匿名') + '</span>' +
            renderPtyhAvatars(row.ptyh) +
          '</div>' +
          '<div class="post-stats">' +
            '<span class="post-stat"><img class="post-stat-icon" src="' + (self.iconData.attention || 'assets/attention0.png') + '" alt="" /> ' + (row.yuedu || 0) + '</span>' +
            '<span class="post-stat"><img class="post-stat-icon" src="' + (self.iconData.like || 'assets/like0.png') + '" alt="" /> ' + (row.dianzan || 0) + '</span>' +
            '<span class="post-stat"><img class="post-stat-icon" src="' + (self.iconData.favor || 'assets/favor0.png') + '" alt="" /> ' + (row.shoucang || 0) + '</span>' +
            '<span class="post-stat"><img class="post-stat-icon" src="' + (self.iconData.message || 'assets/comment0.png') + '" alt="" /> ' + (row.pinglun || 0) + '</span>' +
            '<span class="post-stats-time">' + (publishTime || '') + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    },

    // 首页滚动到底部检测（滚动容器是 #home-content）
    onHomeScroll: function () {
      if (!this.listHasMore || this.listLoading || !this.articleList) return;
      var el = document.getElementById('home-content');
      if (!el) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
        this._loadArticlesPage(this.listPageIndex + 1);
      }
    },

    // 假数据回退（当 API 不可用时）
    renderArticlesFallback: function () {
      var self = this;
      var articles = [
        { cover: 'https://picsum.photos/240/180?random=10', title: '如何选择合适的AI智能体为你服务', author: '小风', authorAvatar: 'assets/logo.png', category: '技术' },
        { cover: 'https://picsum.photos/240/180?random=11', title: '新手入门指南：三步搭建你的第一个小程序', author: '小粽', authorAvatar: 'assets/logo.png', category: '教程' }
      ];
      this.articleList.innerHTML = articles.map(function (a) {
        var attentionIcon = self.iconData.attention || 'assets/attention0.png';
        var likeIcon = self.iconData.like || 'assets/like0.png';
        var favorIcon = self.iconData.favor || 'assets/favor0.png';
        var messageIcon = self.iconData.message || 'assets/comment0.png';
        return '<div class="post-card" data-rowid="test-rowid" data-url="">' +
          '<div class="post-cover"><img src="' + a.cover + '" alt="" /></div>' +
          '<div class="post-info">' +
            '<h3 class="post-title">' + a.title + '</h3>' +
            '<div class="post-tags"><span class="post-category-tag">' + a.category + '</span></div>' +
            '<div class="post-author-row">' +
              '<img class="post-author-avatar" src="' + a.authorAvatar + '" alt="" />' +
              '<span class="post-author-name">' + a.author + '</span>' +
            '</div>' +
            '<div class="post-stats">' +
              '<span class="post-stat"><img class="post-stat-icon" src="' + attentionIcon + '" alt="" /> 0</span>' +
              '<span class="post-stat"><img class="post-stat-icon" src="' + likeIcon + '" alt="" /> 0</span>' +
              '<span class="post-stat"><img class="post-stat-icon" src="' + favorIcon + '" alt="" /> 0</span>' +
              '<span class="post-stat"><img class="post-stat-icon" src="' + messageIcon + '" alt="" /> 0</span>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');
      // 也要绑定点击事件
      this._bindPostCardClick(this.articleList);
    },

    // 绑定文章卡片点击事件（跳过已绑定的，避免分页追加时重复绑定）
    _bindPostCardClick: function (container) {
      var cards = container.querySelectorAll('.post-card:not([data-bound])');
      cards.forEach(function (card) {
        card.setAttribute('data-bound', '1');
        var rowid = card.getAttribute('data-rowid');
        var url = card.getAttribute('data-url');
        card.addEventListener('click', function () {
          console.log('[HomePage] 文章卡片被点击! rowid:', rowid, 'url:', url);
          if (!rowid) {
            console.warn('[HomePage] rowid 为空，无法跳转');
            return;
          }
          if (url && url.indexOf('http') === 0) {
            // 外部链接：webview
            console.log('[HomePage] 跳转到 webview:', url);
            if (window.App) App.switchToWebview(url, 'home');
          } else {
            // 通用详情页
            console.log('[HomePage] 跳转到内容详情, rowid:', rowid);
            if (window.App) App.switchToContentDetail(rowid, 'home');
          }
        });
      });
    },

    // ========== 图标预处理：二值化 + 统一上色，缓存 data URL ==========
    _prepareIcons: function (callback) {
      var iconConfigs = [
        { key: 'like', src: 'assets/like0.png', color: '#9CA3AF' },
        { key: 'favor', src: 'assets/favor0.png', color: '#9CA3AF' },
        { key: 'attention', src: 'assets/attention0.png', color: '#9CA3AF' },
        { key: 'message', src: 'assets/comment0.png', color: '#9CA3AF' }
      ];
      var remaining = iconConfigs.length;
      var self = this;

      iconConfigs.forEach(function (cfg) {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
          var canvas = document.createElement('canvas');
          var ctx = canvas.getContext('2d');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          ctx.drawImage(img, 0, 0);
          var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          var data = imageData.data;
          var r = parseInt(cfg.color.slice(1, 3), 16);
          var g = parseInt(cfg.color.slice(3, 5), 16);
          var b = parseInt(cfg.color.slice(5, 7), 16);
          for (var i = 0; i < data.length; i += 4) {
            if (data[i + 3] > 128) {
              data[i] = r;
              data[i + 1] = g;
              data[i + 2] = b;
              data[i + 3] = 255;
            } else {
              data[i + 3] = 0;
            }
          }
          ctx.putImageData(imageData, 0, 0);
          self.iconData[cfg.key] = canvas.toDataURL('image/png');
          if (--remaining === 0 && callback) callback();
        };
        img.src = cfg.src;
      });
    },

    // ========== 事件绑定 ==========
    bindEvents: function () {
      var self = this;

      // 滚动到底部加载更多（#home-content 是滚动容器，只绑一次）
      var homeScroller = document.getElementById('home-content');
      if (homeScroller && !self._homeScrollBound) {
        self._homeScrollBound = true;
        homeScroller.addEventListener('scroll', function () {
          self.onHomeScroll();
        });
      }

      // 分类导航点击
      if (this.categoryNav) {
        var items = this.categoryNav.querySelectorAll('.category-item');
        items.forEach(function (item) {
          item.addEventListener('click', function () {
            var index = parseInt(item.getAttribute('data-index'));
            self.switchCategory(index);
          });
        });
      }

      // 功能列表点击
      var featureItems = document.querySelectorAll('.feature-item');
      featureItems.forEach(function (item) {
        item.addEventListener('click', function () {
          var linkType = item.getAttribute('data-link-type');
          var linkValue = item.getAttribute('data-link-value');
          if (linkType === 'page' && linkValue && window.App) {
            var pageMap = { 'orders': 'orders', 'points': 'points', 'address': 'address' };
            var targetPage = pageMap[linkValue];
            if (targetPage === 'orders') App.switchToOrders();
            else if (targetPage === 'points') App.switchToPoints();
            else if (targetPage === 'address') App.switchToAddress();
          }
        });
      });
    },

    // ========== 轮播图触摸滑动（DOM 渲染完成后调用） ==========
    _bindBannerSwipe: function () {
      if (!this.bannerSwiper) return;
      var self = this;
      var startX = 0;
      var isDragging = false;

      this.bannerSwiper.addEventListener('touchstart', function (e) {
        startX = e.touches[0].clientX;
        isDragging = true;
        clearInterval(self.bannerTimer);
      }, { passive: false });

      this.bannerSwiper.addEventListener('touchmove', function (e) {
        e.preventDefault();
      }, { passive: false });

      this.bannerSwiper.addEventListener('touchend', function (e) {
        if (!isDragging) return;
        isDragging = false;
        var diffX = e.changedTouches[0].clientX - startX;
        if (Math.abs(diffX) > 50) {
          if (diffX > 0) {
            self.currentBannerIndex = (self.currentBannerIndex - 1 + self.getBannerCount()) % self.getBannerCount();
          } else {
            self.currentBannerIndex = (self.currentBannerIndex + 1) % self.getBannerCount();
          }
          self.switchBanner(self.currentBannerIndex);
        }
        self.startBannerAutoplay();
      });

      // 桌面端鼠标拖拽
      this.bannerSwiper.addEventListener('mousedown', function (e) {
        startX = e.clientX;
        isDragging = true;
        clearInterval(self.bannerTimer);
      });

      this.bannerSwiper.addEventListener('mousemove', function (e) {
        if (!isDragging) return;
      });

      this.bannerSwiper.addEventListener('mouseup', function (e) {
        if (!isDragging) return;
        isDragging = false;
        var diffX = e.clientX - startX;
        if (Math.abs(diffX) > 50) {
          if (diffX > 0) {
            self.currentBannerIndex = (self.currentBannerIndex - 1 + self.getBannerCount()) % self.getBannerCount();
          } else {
            self.currentBannerIndex = (self.currentBannerIndex + 1) % self.getBannerCount();
          }
          self.switchBanner(self.currentBannerIndex);
        }
        self.startBannerAutoplay();
      });

      this.startBannerAutoplay();
    },

    getBannerCount: function () {
      if (!this.bannerSwiper) return 3;
      return this.bannerSwiper.querySelectorAll('.banner-slide').length || 3;
    },

    switchBanner: function (index) {
      var slides = this.bannerSwiper.querySelectorAll('.banner-slide');
      var dots = this.bannerDots.querySelectorAll('.banner-dot');
      slides.forEach(function (s, i) { s.classList.toggle('active', i === index); });
      dots.forEach(function (d, i) { d.classList.toggle('active', i === index); });
      this.currentBannerIndex = index;
    },

    startBannerAutoplay: function () {
      var self = this;
      clearInterval(this.bannerTimer);
      var count = this.getBannerCount();
      if (count <= 1) return;
      this.bannerTimer = setInterval(function () {
        self.currentBannerIndex = (self.currentBannerIndex + 1) % count;
        self.switchBanner(self.currentBannerIndex);
      }, 10000);
    },

    switchCategory: function (index) {
      if (index === this.currentCategory) return;
      var items = this.categoryNav.querySelectorAll('.category-item');
      items.forEach(function (item) {
        item.classList.toggle('active', parseInt(item.getAttribute('data-index')) === index);
      });
      this.currentCategory = index;
      // 记录当前 tab 完整配置（type/category rowid/sewKey/leixing）
      this.currentFilterTab = this.categoryTabs[index] || { name: '全部', type: 'all', leixing: ['文章'] };
      this.currentFilterRowid = this.currentFilterTab.rowid || '';
      this.renderArticles();
    }
  };

  window.HomePage = HomePage;
})();
