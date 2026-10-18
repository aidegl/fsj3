/**
 * fsj-decoration 主入口
 * 职责：URL 商家定位 → 加载配置 → 三栏联动（左树 / 中预览 / 右面板）→ 保存回写商家表
 */
(function () {
  'use strict';

  var Store = DecorationStore;
  var Schema = DecorationSchema;

  var el = {};

  init();

  function init() {
    el = {
      merchantName: document.getElementById('merchantName'),
      saveStatus: document.getElementById('saveStatus'),
      btnSave: document.getElementById('btnSave'),
      btnReload: document.getElementById('btnReload'),
      picker: document.getElementById('merchantPicker'),
      pickerList: document.getElementById('merchantList'),
      loadError: document.getElementById('loadError'),
      workspace: document.getElementById('workspace'),
      treeTabs: document.getElementById('treeTabs'),
      treeSections: document.getElementById('treeSections'),
      treeWode: document.getElementById('treeWode'),
      libraryGrid: document.getElementById('libraryGrid'),
      counts: {
        tab: document.getElementById('tabCount'),
        section: document.getElementById('sectionCount'),
        wode: document.getElementById('wodeCount')
      },
      sectionsEmpty: document.getElementById('sectionsEmpty')
    };

    bindGlobalEvents();
    Preview.init();
    Panel.init();

    var params = getUrlParams();
    if (params.mRowid) {
      loadByMrowid(params.mRowid);
    } else if (params.rowid) {
      loadByRowid(params.rowid);
    } else {
      showMerchantPicker();
    }
  }

  // ==================== URL ====================

  function getUrlParams() {
    var params = new URLSearchParams(window.location.search);
    return {
      mRowid: params.get('mRowid') || '',
      rowid: params.get('rowid') || ''
    };
  }

  // ==================== 商家加载 ====================

  function loadByMrowid(mrowid) {
    setStatus('正在定位商家...');
    DecorationApi.getMerchantByMrowid(mrowid).then(function (row) {
      if (!row) {
        showError('未找到 mrowid 为 <code>' + escapeHtml(mrowid) + '</code> 的商家记录。<br>' +
          '<a href="index.html" style="color:var(--primary-color);">返回商家列表</a>');
        return;
      }
      initWorkspace(row);
    }).catch(function (err) {
      showError('加载商家失败：' + err.message);
    });
  }

  function loadByRowid(rowid) {
    setStatus('正在定位商家...');
    DecorationApi.getMerchantByRowid(rowid).then(function (row) {
      if (!row) {
        showError('未找到 rowid 为 <code>' + escapeHtml(rowid) + '</code> 的商家记录。<br>' +
          '<a href="index.html" style="color:var(--primary-color);">返回商家列表</a>');
        return;
      }
      initWorkspace(row);
    }).catch(function (err) {
      showError('加载商家失败：' + err.message);
    });
  }

  function initWorkspace(row) {
    Store.loadFromMerchant(row);
    window._decoMerchantRowid = row.rowid; // API 层内容查询按商家过滤

    el.merchantName.textContent = row.mingcheng || '未命名商家';
    el.picker.style.display = 'none';
    el.loadError.style.display = 'none';
    el.workspace.style.display = 'flex';
    setStatus('');

    renderLibrary();
    renderTree();
    Preview.render();
    Panel.render();
    updateSaveButton();

    // 有未保存草稿时询问恢复
    var draft = Store.loadDraft();
    if (draft) {
      var time = new Date(draft.savedAt);
      var timeStr = time.getHours() + ':' + String(time.getMinutes()).padStart(2, '0');
      Panel.confirmModal('发现未保存草稿',
        '检测到 ' + timeStr + ' 的编辑草稿（可能来自上次未保存就关闭页面）。<br>' +
        '「恢复」继续上次编辑，「放弃」则使用商家表当前配置。',
        function () {
          Store.state.tabBar = draft.tabBar || [];
          Store.state.wode = draft.wode || [];
          Store.state.color = draft.color || Store.state.color;
          Store.state.dirty = true;
          Store.clearDraft();
          Store.markDirty();
          Panel.showToast('已恢复草稿，记得保存');
        },
        { okText: '恢复草稿', onCancel: function () { Store.clearDraft(); } });
    }
  }

  function showMerchantPicker() {
    el.picker.style.display = 'flex';
    DecorationApi.getMerchantList().then(function (rows) {
      if (rows.length === 0) {
        el.pickerList.innerHTML = '<div class="merchant-picker-loading">商家表中暂无 leixing=商家 的记录</div>';
        return;
      }
      el.pickerList.innerHTML = rows.map(function (row) {
        var hasMr = !!(row.mrowid && String(row.mrowid).trim());
        var jump = hasMr ? 'index.html?mRowid=' + encodeURIComponent(row.mrowid) : 'index.html?rowid=' + row.rowid;
        return '<a class="merchant-item" href="' + jump + '" style="text-decoration:none;color:inherit;">' +
          '<div class="merchant-item-icon"><i class="fa fa-store"></i></div>' +
          '<div class="merchant-item-info">' +
            '<div class="merchant-item-name">' + escapeHtml(row.mingcheng || '未命名商家') + '</div>' +
            '<div class="merchant-item-meta">' +
              (hasMr ? 'mrowid: ' + escapeHtml(row.mrowid) : 'rowid: ' + escapeHtml(row.rowid)) +
            '</div>' +
          '</div>' +
          (!hasMr ? '<span style="font-size:10px;color:var(--warn-color);flex-shrink:0;">未设mrowid</span>' : '') +
          '<i class="fa fa-arrow-right"></i>' +
          '</a>';
      }).join('');
    }).catch(function (err) {
      el.pickerList.innerHTML = '<div class="merchant-picker-loading">加载失败：' + escapeHtml(err.message) + '</div>';
    });
  }

  function showError(html) {
    el.workspace.style.display = 'none';
    el.picker.style.display = 'none';
    el.loadError.style.display = 'flex';
    el.loadError.innerHTML = '<div style="text-align:center;"><i class="fa fa-exclamation-triangle" style="font-size:30px;margin-bottom:10px;"></i><br>' + html + '</div>';
    setStatus('');
  }

  function setStatus(text) {
    el.saveStatus.textContent = text;
  }

  // ==================== 左栏：组件库 ====================

  function renderLibrary() {
    el.libraryGrid.innerHTML = Object.keys(Schema.sectionTypes).map(function (type) {
      var def = Schema.sectionTypes[type];
      return '<div class="library-card" data-type="' + type + '">' +
        '<div class="library-card-icon"><i class="fa ' + def.icon + '"></i></div>' +
        '<div class="library-card-name">' + escapeHtml(def.label) + '</div>' +
        '<div class="library-card-desc">' + escapeHtml(def.desc) + '</div>' +
        '</div>';
    }).join('');

    el.libraryGrid.querySelectorAll('.library-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var type = this.getAttribute('data-type');
        var idx = Store.addSection(type);
        Store.select('section', idx);
        Preview.switchView('home');
        Panel.showToast('已添加「' + Schema.sectionTypes[type].label + '」区块');
      });
    });
  }

  // ==================== 左栏：结构树 ====================

  function renderTree() {
    var sel = Store.getSelection();
    var s = Store.state;

    // TabBar
    el.treeTabs.innerHTML = s.tabBar.map(function (tab, i) {
      var isSel = sel && sel.type === 'tab' && sel.index === i;
      var isHome = tab.page === 'home';
      return '<div class="tree-item' + (isSel ? ' selected' : '') + '" data-kind="tab" data-idx="' + i + '">' +
        '<span class="tree-item-icon"><i class="fa ' + (Schema.pageIcons[tab.page] || 'fa-navicon') + '"></i></span>' +
        '<span class="tree-item-name">' + escapeHtml(tab.name || '未命名') + '</span>' +
        '<span class="tree-item-actions">' +
          (i > 0 ? '<button class="tree-item-act" data-op="up"><i class="fa fa-arrow-up"></i></button>' : '') +
          (i < s.tabBar.length - 1 ? '<button class="tree-item-act" data-op="down"><i class="fa fa-arrow-down"></i></button>' : '') +
          '<button class="tree-item-act danger" data-op="del"><i class="fa fa-trash"></i></button>' +
        '</span>' +
        (isHome ? '<span style="font-size:10px;color:var(--primary-color);flex-shrink:0;">首页</span>' : '') +
        '</div>';
    }).join('');
    el.counts.tab.textContent = s.tabBar.length;

    // 首页组件区块
    var sections = Store.getHomeSections() || [];
    el.treeSections.innerHTML = sections.map(function (section, i) {
      var def = Schema.sectionTypes[section.type] || { label: section.type, icon: 'fa-question' };
      var isSel = sel && sel.type === 'section' && sel.index === i;
      return '<div class="tree-item' + (isSel ? ' selected' : '') + (section.hidden ? ' tree-item-hidden' : '') + '" data-kind="section" data-idx="' + i + '">' +
        '<span class="tree-item-icon"><i class="fa ' + def.icon + '"></i></span>' +
        '<span class="tree-item-name">' + escapeHtml(def.label) + '</span>' +
        '<span class="tree-item-actions">' +
          '<button class="tree-item-act" data-op="hide" title="' + (section.hidden ? '显示' : '隐藏') + '"><i class="fa ' + (section.hidden ? 'fa-eye' : 'fa-eye-slash') + '"></i></button>' +
          (i > 0 ? '<button class="tree-item-act" data-op="up"><i class="fa fa-arrow-up"></i></button>' : '') +
          (i < sections.length - 1 ? '<button class="tree-item-act" data-op="down"><i class="fa fa-arrow-down"></i></button>' : '') +
          '<button class="tree-item-act danger" data-op="del"><i class="fa fa-trash"></i></button>' +
        '</span>' +
        '</div>';
    }).join('');
    el.counts.section.textContent = sections.length;
    el.sectionsEmpty.style.display = sections.length === 0 ? '' : 'none';

    // 我的页面菜单
    el.treeWode.innerHTML = s.wode.map(function (item, i) {
      var isSel = sel && sel.type === 'wode' && sel.index === i;
      return '<div class="tree-item' + (isSel ? ' selected' : '') + '" data-kind="wode" data-idx="' + i + '">' +
        '<span class="tree-item-icon"><i class="fa ' + (Schema.pageIcons[item.page] || 'fa-navicon') + '"></i></span>' +
        '<span class="tree-item-name">' + escapeHtml(item.name || '未命名') + '</span>' +
        '<span class="tree-item-actions">' +
          (i > 0 ? '<button class="tree-item-act" data-op="up"><i class="fa fa-arrow-up"></i></button>' : '') +
          (i < s.wode.length - 1 ? '<button class="tree-item-act" data-op="down"><i class="fa fa-arrow-down"></i></button>' : '') +
          '<button class="tree-item-act danger" data-op="del"><i class="fa fa-trash"></i></button>' +
        '</span>' +
        '</div>';
    }).join('');
    el.counts.wode.textContent = s.wode.length;
  }

  /** 树节点点击 / 行内操作（事件委托） */
  function bindTreeEvents() {
    ['treeTabs', 'treeSections', 'treeWode'].forEach(function (key) {
      el[key].addEventListener('click', function (e) {
        var item = e.target.closest('.tree-item');
        if (!item) return;
        var kind = item.getAttribute('data-kind');
        var idx = parseInt(item.getAttribute('data-idx'), 10);

        // 行内操作按钮
        var act = e.target.closest('.tree-item-act');
        if (act) {
          e.stopPropagation();
          var op = act.getAttribute('data-op');
          if (op === 'del') {
            if (kind === 'tab') Store.removeTab(idx);
            else if (kind === 'section') Store.removeSection(idx);
            else Store.removeWode(idx);
            Store.select('global');
          } else if (op === 'up') {
            if (kind === 'tab') Store.moveTab(idx, -1);
            else if (kind === 'section') Store.moveSection(idx, -1);
            else Store.moveWode(idx, -1);
          } else if (op === 'down') {
            if (kind === 'tab') Store.moveTab(idx, +1);
            else if (kind === 'section') Store.moveSection(idx, +1);
            else Store.moveWode(idx, +1);
          } else if (op === 'hide') {
            var sections = Store.getHomeSections();
            if (sections && sections[idx]) {
              Store.updateSection(idx, 'hidden', !sections[idx].hidden);
            }
          }
          return;
        }

        // 选中 → 右栏属性面板
        Store.select(kind, idx);
      });
    });

    // 全局设置入口
    document.querySelector('.tree-item[data-sel="global"]').addEventListener('click', function () {
      Store.select('global');
    });
  }

  // ==================== 保存 ====================

  function saveConfig() {
    if (!Store.state.dirty) {
      Panel.showToast('配置没有改动', 'success');
      return;
    }
    var cfg = Store.exportConfig();

    // ===== 保存前把 adv 语义模型转成 HAP 原生筛选器数组 =====
    // 存的格式 = getFilterRows 的 filters 参数格式，webview 直接透传零转换
    var _tabBar = JSON.parse(cfg.dbdhl);
    _tabBar.forEach(function(tab) {
      if (tab.url && tab.url.home_sections) {
        tab.url.home_sections.forEach(function(section) {
          if (section.type === 'content_list' && section.config && section.config.category_filter) {
            section.config.category_filter.forEach(function(cat) {
              if (cat.adv && window.advToWire) {
                cat.filters = window.advToWire(cat.adv);
              }
              // 只保留 HAP 格式字段，删掉旧格式
              delete cat.adv;
              delete cat.conds;
              delete cat.rowid;
              delete cat.type;
            });
          }
        });
      }
    });
    cfg.dbdhl = JSON.stringify(_tabBar, null, 2);
    console.log('[保存] HAP 原生筛选器格式:', JSON.stringify(_tabBar, null, 2));
    console.log('[保存调试] exportConfig 输出:', JSON.stringify(cfg, null, 2));
    var summary = '将更新商家表以下字段：<br><br>' +
      '<div class="readonly-box">' +
      '· dbdhl（底部导航+首页配置）：' + cfg.dbdhl.length + ' 字符<br>' +
      '· wode（我的页面菜单）：' + cfg.wode.length + ' 字符<br>' +
      '· color（主题色）：' + escapeHtml(cfg.color) + '</div><br>' +
      '<span style="color:var(--warn-color);font-size:12px;">保存立即对小程序生效，请确认无误。</span>';

    Panel.confirmModal('保存装修配置', summary, function () {
      setStatus('保存中...');
      el.btnSave.disabled = true;
      DecorationApi.saveMerchantConfig(Store.state.merchantRowid, cfg).then(function () {
        Store.markSaved();
        Panel.showToast('保存成功，小程序端已生效', 'success');
      }).catch(function (err) {
        Panel.showToast('保存失败：' + err.message, 'error');
      }).then(function () {
        updateSaveButton();
      });
    }, { okText: '确认保存' });
  }

  function updateSaveButton() {
    el.btnSave.disabled = !Store.state.dirty;
    if (Store.state.dirty) {
      el.saveStatus.innerHTML = '<i class="fa fa-circle" style="font-size:8px;color:var(--warn-color);"></i> 有未保存更改';
      el.saveStatus.className = 'save-status';
    } else {
      el.saveStatus.innerHTML = '<i class="fa fa-check-circle"></i> 与商家表一致';
      el.saveStatus.className = 'save-status saved';
    }
  }

  // ==================== 全局事件 ====================

  function bindGlobalEvents() {
    bindTreeEvents();

    // 侧栏 tab 切换
    document.querySelectorAll('.sidebar-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.sidebar-tab').forEach(function (t) { t.classList.remove('active'); });
        this.classList.add('active');
        document.getElementById('paneStructure').style.display =
          this.getAttribute('data-tab') === 'structure' ? '' : 'none';
        document.getElementById('paneLibrary').style.display =
          this.getAttribute('data-tab') === 'library' ? '' : 'none';
      });
    });

    // 添加导航项 / 菜单项
    document.getElementById('btnAddTab').addEventListener('click', function () {
      var idx = Store.state.tabBar.length;
      Store.addTab({ name: '新导航', sort: String(idx * 10), page: '', mode: '0' });
      Store.select('tab', idx);
    });
    document.getElementById('btnAddWode').addEventListener('click', function () {
      var idx = Store.state.wode.length;
      Store.addWode({ name: '新菜单', sort: String(idx * 10), page: '', mode: '0' });
      Store.select('wode', idx);
    });

    // 预览视图切换
    document.querySelectorAll('.view-switch-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Preview.switchView(this.getAttribute('data-view'));
      });
    });

    // 保存 / 重置
    el.btnSave.addEventListener('click', saveConfig);
    el.btnReload.addEventListener('click', function () {
      var doReload = function () {
        Preview.clearCaches();
        var params = getUrlParams();
        if (params.mRowid) loadByMrowid(params.mRowid);
        else if (params.rowid) loadByRowid(params.rowid);
      };
      if (Store.state.dirty) {
        Panel.confirmModal('放弃修改',
          '当前有未保存的修改，重置将丢失这些改动（草稿仍保留，重新进入页面时可恢复）。确定重置吗？',
          doReload);
      } else {
        doReload();
      }
    });

    // 弹窗遮罩点击关闭
    document.getElementById('modalMask').addEventListener('click', function (e) {
      if (e.target === this) Panel.closeModal();
    });

    // beforeunload 拦截已移除（2026-09-09）：草稿在 localStorage 刷新不丢，Live Preview 自动刷新不再被弹窗打断

    // 状态统一刷新
    Store.onChange(function () {
      renderTree();
      Preview.render();
      Panel.render();
      updateSaveButton();
    });
  }

  // ==================== 全局工具函数 ====================

  window.showToast = function (msg, type) { Panel.showToast(msg, type); };
  window.escapeHtml = Panel.escapeHtml;

  // confirmModal 支持取消回调（Panel 内部版只有一个按钮，这里扩展）
  var _confirm = Panel.confirmModal;
  Panel.confirmModal = function (title, message, onOk, onCancel) {
    _confirm(title, message, onOk);
    if (onCancel) {
      setTimeout(function () {
        var cancelBtn = document.getElementById('confirmCancel');
        if (cancelBtn) {
          var newBtn = cancelBtn.cloneNode(true);
          cancelBtn.parentNode.replaceChild(newBtn, cancelBtn);
          newBtn.addEventListener('click', function () {
            Panel.closeModal();
            onCancel();
          });
        }
      }, 0);
    }
  };
})();
