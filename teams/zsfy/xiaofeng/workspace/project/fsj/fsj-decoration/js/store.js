/**
 * fsj-decoration 状态管理
 * 内存数据模型 + dirty 跟踪 + localStorage 草稿
 *
 * 数据模型（与商家表字段一一对应）：
 *   state.tabBar  ←→ dbdhl 字段（TabBar 数组，首页 tab 的 url 为 home_sections 配置对象）
 *   state.wode    ←→ wode 字段（我的页面菜单数组）
 *   state.color   ←→ color 字段（主题色）
 */
var DecorationStore = (function () {
  'use strict';

  var state = {
    merchantRowid: '',   // 商家记录 rowid（保存目标）
    mrowid: '',          // 商家 mrowid 字段值
    mingcheng: '',       // 商家名称
    color: '#006eff',
    tabBar: [],          // [{name, sort, page, mode, icon, url}]
    wode: [],            // [{name, sort, page, mode, url?}]
    dirty: false
  };

  // 当前选中：{ type: 'global'|'tab'|'section'|'wode', index: number }
  var selection = null;

  var listeners = [];

  /** 订阅变更（change 事件统一触发刷新） */
  function onChange(fn) {
    listeners.push(fn);
  }

  function emit() {
    listeners.forEach(function (fn) { fn(); });
  }

  /** 标记已修改并广播 */
  function markDirty() {
    state.dirty = true;
    saveDraft();
    emit();
  }

  /** 修改主题色 */
  function setColor(color) {
    state.color = color;
    markDirty();
  }

  // ==================== TabBar ====================

  function addTab(tab) {
    state.tabBar.push(tab);
    markDirty();
  }

  function updateTab(index, key, value) {
    if (!state.tabBar[index]) return;
    state.tabBar[index][key] = value;
    markDirty();
  }

  function removeTab(index) {
    state.tabBar.splice(index, 1);
    markDirty();
  }

  function moveTab(index, delta) {
    var target = index + delta;
    if (target < 0 || target >= state.tabBar.length) return;
    var arr = state.tabBar;
    arr.splice(target, 0, arr.splice(index, 1)[0]);
    markDirty();
  }

  // ==================== 首页组件区块 ====================

  /** 当前首页 tab 在 tabBar 中的下标（page === 'home' 的第一个），未找到 -1 */
  function homeTabIndex() {
    for (var i = 0; i < state.tabBar.length; i++) {
      var t = state.tabBar[i];
      if (t.page === 'home') return i;
    }
    return -1;
  }

  /** 取首页 home_sections（无首页 tab / 配置不合法时返回 null） */
  function getHomeSections() {
    var i = homeTabIndex();
    if (i < 0) return null;
    var url = state.tabBar[i].url;
    if (url && typeof url === 'object' && Array.isArray(url.home_sections)) {
      return url.home_sections;
    }
    return null;
  }

  /** 确保首页 tab 及 home_sections 存在（组件库添加时调用），返回 sections 数组 */
  function ensureHomeSections() {
    var i = homeTabIndex();
    if (i < 0) {
      state.tabBar.push({
        name: '首页', sort: '0', page: 'home', mode: '0',
        url: { home_sections: [] }
      });
      i = homeTabIndex();
    }
    var tab = state.tabBar[i];
    if (!tab.url || typeof tab.url !== 'object' || !Array.isArray(tab.url.home_sections)) {
      tab.url = { home_sections: [] };
    }
    return tab.url.home_sections;
  }

  function addSection(type) {
    var sections = ensureHomeSections();
    var section = { type: type, config: DecorationSchema.defaultConfig(type) };
    sections.push(section);
    markDirty();
    return sections.length - 1;
  }

  function updateSection(index, key, value) {
    var sections = getHomeSections();
    if (!sections || !sections[index]) return;
    sections[index][key] = value;
    markDirty();
  }

  function updateSectionConfig(index, key, value) {
    var sections = getHomeSections();
    if (!sections || !sections[index]) return;
    if (!sections[index].config) sections[index].config = {};
    sections[index].config[key] = value;
    markDirty();
  }

  function removeSection(index) {
    var sections = getHomeSections();
    if (!sections) return;
    sections.splice(index, 1);
    markDirty();
  }

  function moveSection(index, delta) {
    var sections = getHomeSections();
    if (!sections) return;
    var target = index + delta;
    if (target < 0 || target >= sections.length) return;
    sections.splice(target, 0, sections.splice(index, 1)[0]);
    markDirty();
  }

  // ==================== 我的页面菜单 ====================

  function addWode(item) {
    state.wode.push(item);
    markDirty();
  }

  function updateWode(index, key, value) {
    if (!state.wode[index]) return;
    state.wode[index][key] = value;
    markDirty();
  }

  function removeWode(index) {
    state.wode.splice(index, 1);
    markDirty();
  }

  function moveWode(index, delta) {
    var target = index + delta;
    if (target < 0 || target >= state.wode.length) return;
    state.wode.splice(target, 0, state.wode.splice(index, 1)[0]);
    markDirty();
  }

  // ==================== 选中状态 ====================

  function select(type, index) {
    selection = index === undefined ? { type: type } : { type: type, index: index };
    emit();
  }

  function getSelection() {
    return selection;
  }

  // ==================== 序列化 ====================

  /** 导出为商家表字段值（dbdhl / wode / color） */
  function exportConfig() {
    return {
      dbdhl: JSON.stringify(state.tabBar, null, 2),
      wode: JSON.stringify(state.wode, null, 2),
      color: state.color
    };
  }

  /** 从商家记录行初始化 state */
  function loadFromMerchant(row) {
    state.merchantRowid = row.rowid || '';
    state.mrowid = row.mrowid || '';
    state.mingcheng = row.mingcheng || '';
    state.color = row.color || '#006eff';

    state.tabBar = parseJsonArray(row.dbdhl);
    state.wode = parseJsonArray(row.wode);

    // 兼容：配置写在 shangjia 字段的历史数据
    if (state.tabBar.length === 0 && row.shangjia) {
      state.tabBar = parseJsonArray(row.shangjia);
    }

    state.dirty = false;
    selection = null;
  }

  function parseJsonArray(str) {
    if (!str) return [];
    try {
      var arr = typeof str === 'string' ? JSON.parse(str) : str;
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      console.warn('[Store] JSON 解析失败:', e);
      return [];
    }
  }

  // ==================== 草稿 ====================

  function draftKey() {
    return 'fsj_decoration_draft_' + (state.mrowid || state.merchantRowid);
  }

  function saveDraft() {
    if (!state.merchantRowid) return;
    try {
      localStorage.setItem(draftKey(), JSON.stringify({
        tabBar: state.tabBar,
        wode: state.wode,
        color: state.color,
        savedAt: Date.now()
      }));
    } catch (e) { /* 存储满等异常忽略 */ }
  }

  /** 读取草稿，有则返回 {tabBar, wode, color, savedAt}，否则 null */
  function loadDraft() {
    try {
      var raw = localStorage.getItem(draftKey());
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clearDraft() {
    localStorage.removeItem(draftKey());
  }

  /** 保存成功后：清除草稿、清除 dirty */
  function markSaved() {
    state.dirty = false;
    clearDraft();
    emit();
  }

  return {
    state: state,
    onChange: onChange,
    markDirty: markDirty,
    setColor: setColor,
    addTab: addTab,
    updateTab: updateTab,
    removeTab: removeTab,
    moveTab: moveTab,
    homeTabIndex: homeTabIndex,
    getHomeSections: getHomeSections,
    ensureHomeSections: ensureHomeSections,
    addSection: addSection,
    updateSection: updateSection,
    updateSectionConfig: updateSectionConfig,
    removeSection: removeSection,
    moveSection: moveSection,
    addWode: addWode,
    updateWode: updateWode,
    removeWode: removeWode,
    moveWode: moveWode,
    select: select,
    getSelection: getSelection,
    exportConfig: exportConfig,
    loadFromMerchant: loadFromMerchant,
    loadDraft: loadDraft,
    clearDraft: clearDraft,
    markSaved: markSaved
  };
})();
