/**
 * fsj-decoration 属性面板（右栏）
 * 根据 DecorationSchema 元数据自动生成表单：
 *   global  → 主题色
 *   tab     → TabBar 导航项字段
 *   section → 首页组件区块（hidden + 各组件 config）
 *   wode    → 我的页面菜单项
 */
var Panel = (function () {
  'use strict';

  var Store = DecorationStore;
  var Schema = DecorationSchema;

  var el = {};

  // 文本输入过程中的数据更新不需要重绘面板（否则输入框失焦打断打字），
  // 下一次 render() 调用会被吞掉
  var suppressRender = false;

  /** 标记：本次数据变更后跳过一次面板重绘 */
  function withSuppress(fn) {
    suppressRender = true;
    fn();
  }

  function init() {
    el.body = document.getElementById('inspectorBody');
    el.title = document.getElementById('inspectorTitle');
    el.subtitle = document.getElementById('inspectorSubtitle');
  }

  function render() {
    if (suppressRender) {
      suppressRender = false;
      return;
    }
    var sel = Store.getSelection();
    if (!sel) {
      el.title.textContent = '属性';
      el.subtitle.textContent = '';
      el.body.innerHTML =
        '<div class="inspector-empty"><i class="fa fa-hand-o-up"></i>' +
        '<p>从左侧选择一个元素，<br>或在预览中点击区块</p></div>';
      return;
    }
    if (sel.type === 'global') renderGlobal();
    else if (sel.type === 'tab') renderTab(sel.index);
    else if (sel.type === 'section') renderSection(sel.index);
    else if (sel.type === 'wode') renderWode(sel.index);
  }

  // ==================== 全局：主题色 ====================

  function renderGlobal() {
    el.title.textContent = '主题与外观';
    el.subtitle.textContent = '应用于小程序导航栏 / TabBar 高亮 / 分类选中';

    var color = Store.state.color || '#006eff';
    var presets = ['#006eff', '#0557e1', '#667eea', '#7c3aed', '#db2777',
      '#dc2626', '#ea580c', '#16a34a', '#0d9488', '#1e293b'];

    el.body.innerHTML =
      field('主题色', '',
        '<div class="color-field">' +
          '<input type="color" class="color-preview-input" id="colorInput" value="' + color + '" />' +
          '<input type="text" class="field-input" id="colorText" value="' + color + '" />' +
        '</div>' +
        '<div class="color-swatches">' +
          presets.map(function (c) {
            return '<div class="color-swatch' + (c.toLowerCase() === color.toLowerCase() ? ' active' : '') + '" data-color="' + c + '" style="background:' + c + '"></div>';
          }).join('') +
        '</div>',
        '对应商家表 color 字段，小程序端导航栏、TabBar 选中态、分类胶囊等都会使用该色') +
      field('商家信息', '', '<div class="readonly-box">' +
        '名称：' + escapeHtml(Store.state.mingcheng || '-') + '<br>' +
        'rowid：' + escapeHtml(Store.state.merchantRowid || '-') + '<br>' +
        'mrowid：' + escapeHtml(Store.state.mrowid || '(未设置)') + '</div>');

    var colorInput = document.getElementById('colorInput');
    var colorText = document.getElementById('colorText');
    colorInput.addEventListener('input', function () {
      colorText.value = this.value;
      applyColor(this.value);
    });
    colorInput.addEventListener('change', function () {
      Store.setColor(this.value);
    });
    colorText.addEventListener('change', function () {
      var v = normalizeColor(this.value);
      if (v) { colorInput.value = v; Store.setColor(v); }
      else { this.value = Store.state.color; showToast('请输入合法的颜色值，如 #006eff', 'error'); }
    });
    el.body.querySelectorAll('.color-swatch').forEach(function (sw) {
      sw.addEventListener('click', function () {
        var c = this.getAttribute('data-color');
        colorInput.value = c;
        colorText.value = c;
        el.body.querySelectorAll('.color-swatch').forEach(function (s) { s.classList.remove('active'); });
        this.classList.add('active');
        Store.setColor(c);
      });
    });
  }

  function applyColor(c) {
    document.querySelector('.phone').style.setProperty('--p-primary', c);
  }

  function normalizeColor(v) {
    v = (v || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(v)) {
      return '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
    }
    return '';
  }

  // ==================== TabBar 导航项 ====================

  function renderTab(index) {
    var tab = Store.state.tabBar[index];
    if (!tab) {
      // 选中项已不存在（被删除等），显示占位而不是递归 render
      el.title.textContent = '属性';
      el.subtitle.textContent = '';
      el.body.innerHTML = '<div class="inspector-empty">该元素已不存在，请重新选择</div>';
      return;
    }
    el.title.textContent = '导航项 · ' + (tab.name || '未命名');
    el.subtitle.textContent = 'TabBar 第 ' + (index + 1) + ' 项（按 sort 排序显示）';

    var html = Schema.tabFields.filter(function (f) {
      return !f.showWhen || f.showWhen(tab);
    }).map(function (f) {
      return renderField(f, tab, function (key, value) {
        Store.updateTab(index, key, value);
      });
    }).join('');
    html += dangerZone('删除该导航项', function () {
      confirmModal('删除导航项', '确定删除「' + escapeHtml(tab.name || '未命名') + '」吗？保存后生效。', function () {
        Store.removeTab(index);
        Store.select('global');
      });
    });
    el.body.innerHTML = html;
    bindFieldEvents(el.body, Schema.tabFields, tab, function (key, value) {
      Store.updateTab(index, key, value);
    });
  }

  // ==================== 首页组件区块 ====================

  function renderSection(index) {
    var sections = Store.getHomeSections();
    if (!sections || !sections[index]) {
      el.title.textContent = '属性';
      el.body.innerHTML = '<div class="inspector-empty">该区块已不存在</div>';
      return;
    }
    var section = sections[index];
    var def = Schema.sectionTypes[section.type] || { label: section.type, icon: 'fa-question', fields: [] };

    el.title.textContent = def.label + ' · 区块 ' + (index + 1);
    el.subtitle.textContent = def.desc || '';

    var html = '<div class="field"><div class="field-label">区块类型</div>' +
      '<div class="readonly-box"><i class="fa ' + (def.icon || 'fa-cube') + '" style="margin-right:6px;"></i>' +
      escapeHtml(def.label) + '（' + escapeHtml(section.type) + '）</div></div>';

    html += '<div class="field"><div class="switch-row"><span class="switch-row-label">隐藏该区块</span>' +
      '<label class="switch"><input type="checkbox" id="secHidden" ' + (section.hidden ? 'checked' : '') + ' />' +
      '<span class="switch-slider"></span></label></div>' +
      '<div class="field-hint">对应 home_sections 的 hidden 字段，临时下线不影响配置</div></div>';

    var config = section.config || {};
    html += '<div style="border-top:1px solid var(--border-color);margin:14px 0;"></div>';
    html += def.fields.map(function (f) {
      return renderField(f, config, function (key, value) {
        Store.updateSectionConfig(index, key, value);
      });
    }).join('');

    // 功能项管理器（2026-09-11：功能表实时数据，增删改/换图/排序）
    if (section.type === 'feature_list') {
      html += featureManagerHtml();
    }

    html += orderZone(
      function () { Store.moveSection(index, -1); },
      function () { Store.moveSection(index, +1); },
      '数组顺序即首页从上到下的渲染顺序'
    );
    html += dangerZone('删除该区块', function () {
      confirmModal('删除区块', '确定删除「' + escapeHtml(def.label) + '」区块吗？保存后生效。', function () {
        Store.removeSection(index);
        Store.select('global');
      });
    });

    el.body.innerHTML = html;

    // hidden 开关
    var hiddenCb = document.getElementById('secHidden');
    if (hiddenCb) {
      hiddenCb.addEventListener('change', function () {
        Store.updateSection(index, 'hidden', this.checked);
      });
    }

    bindFieldEvents(el.body, def.fields, config, function (key, value) {
      Store.updateSectionConfig(index, key, value);
    });

    if (section.type === 'feature_list') {
      bindFeatureManager();
    }
  }

  // ==================== 我的页面菜单项 ====================

  function renderWode(index) {
    var item = Store.state.wode[index];
    if (!item) {
      el.title.textContent = '属性';
      el.subtitle.textContent = '';
      el.body.innerHTML = '<div class="inspector-empty">该元素已不存在，请重新选择</div>';
      return;
    }
    el.title.textContent = '菜单项 · ' + (item.name || '未命名');
    el.subtitle.textContent = '「我的」页面菜单第 ' + (index + 1) + ' 项';

    var html = Schema.wodeFields.filter(function (f) {
      return !f.showWhen || f.showWhen(item);
    }).map(function (f) {
      return renderField(f, item, function (key, value) {
        Store.updateWode(index, key, value);
      });
    }).join('');
    html += orderZone(
      function () { Store.moveWode(index, -1); },
      function () { Store.moveWode(index, +1); },
      '按 sort 升序显示，调整数组顺序便于编辑对照'
    );
    html += dangerZone('删除该菜单项', function () {
      confirmModal('删除菜单项', '确定删除「' + escapeHtml(item.name || '未命名') + '」吗？保存后生效。', function () {
        Store.removeWode(index);
        Store.select('global');
      });
    });
    el.body.innerHTML = html;
    bindFieldEvents(el.body, Schema.wodeFields, item, function (key, value) {
      Store.updateWode(index, key, value);
    });
  }

  // ==================== 字段渲染器 ====================

  /**
   * 渲染单个字段
   * @param {Object} f - schema 字段定义
   * @param {Object} data - 该字段所在对象（tab / config / wode item）
   * @param {Function} onUpdate - (key, value) => void
   */
  function renderField(f, data, onUpdate) {
    var value = data[f.key];
    switch (f.type) {
      case 'text':
        return field(f.label, '',
          '<input type="text" class="field-input" data-key="' + f.key + '" value="' + escapeHtml(value == null ? '' : value) + '" ' +
          (f.placeholder ? 'placeholder="' + f.placeholder + '"' : '') + ' />',
          f.hint);

      case 'array-items':
        // 数组编辑器（2026-09-11 老板要求 UI 可视化生成 JSON）
        // 适用：底部导航 mode=2（JSON 配置跳转）时的 items 数组
        var arr = Array.isArray(value) ? value : [];
        var rowItems = arr.map(function (item, idx) {
          var nm = (item && (item.name || item.title)) || '';
          var pg = (item && item.page) || '';
          var ctg = (item && item.category) || '';
          var st = (item && item.style) || {};
          var dot = (st.bgColor || st.textColor)
            ? '<span title="已自定义样式" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + escapeHtml(st.bgColor || st.textColor) + ';margin-right:4px;border:1px solid #ddd;flex-shrink:0;"></span>'
            : '';
          return '<div data-idx="' + idx + '" style="display:flex;gap:4px;align-items:center;padding:4px 0;border-bottom:1px dashed var(--border-color,#e3e6ea);">' +
            dot +
            '<span style="flex:1;font-size:12px;color:var(--text-main);">' + escapeHtml(nm) + '</span>' +
            '<span style="font-size:11px;color:var(--text-weak);">→ ' + escapeHtml(pg) + '</span>' +
            '<span style="font-size:11px;color:var(--text-weak);">' + escapeHtml(ctg) + '</span>' +
            '<button class="item-list-act" data-array-act="edit" data-key="' + f.key + '" data-idx="' + idx + '" style="color:var(--accent);font-size:11px;" title="编辑名称/跳转/样式">✎</button>' +
            '<button class="item-list-act" data-array-act="up" data-key="' + f.key + '" data-idx="' + idx + '" style="color:var(--accent);font-size:11px;">↑</button>' +
            '<button class="item-list-act" data-array-act="down" data-key="' + f.key + '" data-idx="' + idx + '" style="color:var(--accent);font-size:11px;">↓</button>' +
            '<button class="item-list-act" data-array-act="del" data-key="' + f.key + '" data-idx="' + idx + '" style="color:var(--color-danger,#e83b3b);font-size:11px;">✕</button>' +
          '</div>';
        }).join('');
        var html2 = '<div data-array-root="' + f.key + '">' +
          '<div style="font-size:11px;color:var(--text-weak,#8a919c);margin-bottom:4px;">子项（' + arr.length + '）：' +
            '<span style="color:var(--accent,#0062ff);">点击「+ 子项」可视化添加，系统自动生成 JSON 保存</span>' +
          '</div>' +
          '<div data-array-list="' + f.key + '">' + (rowItems || '<div style="font-size:11px;color:#999;padding:6px 0;">暂无子项</div>') + '</div>' +
          '<button class="item-list-add" data-array-act="add" data-key="' + f.key + '" style="font-size:11px;padding:4px 10px;margin-top:4px;border:1px dashed var(--accent,#0062ff);border-radius:4px;background:none;color:var(--accent,#0062ff);cursor:pointer;">+ 子项</button>' +
          (f.hint ? '<div class="field-hint" style="margin-top:6px;">' + f.hint + '</div>' : '') +
        '</div>';
        return field(f.label, '', html2, '');

      case 'style-editor':
        // 样式编辑器（2026-09-11：底部导航 UI 样式可视化配置）
        var st0 = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
        var styleRows = Schema.styleSubFields.map(function (sf) {
          var v = st0[sf.key] == null ? '' : String(st0[sf.key]);
          var ctrl;
          if (sf.type === 'color') {
            ctrl = '<div style="display:flex;align-items:center;gap:6px;flex:1;">' +
              '<input type="color" data-style-key="' + sf.key + '" value="' + escapeHtml(v || '#000000') + '" style="width:32px;height:26px;padding:0;border:1px solid var(--border-color,#e3e6ea);border-radius:4px;background:#fff;cursor:pointer;flex-shrink:0;' + (v ? '' : 'opacity:.35;') + '" />' +
              '<input type="text" class="field-input" data-style-key="' + sf.key + '" value="' + escapeHtml(v) + '" placeholder="默认" style="flex:1;font-size:11px;" /></div>';
          } else {
            ctrl = '<input type="number" class="field-input" data-style-key="' + sf.key + '" value="' + escapeHtml(v) + '" placeholder="默认"' +
              (sf.min !== undefined ? ' min="' + sf.min + '"' : '') + (sf.max !== undefined ? ' max="' + sf.max + '"' : '') + ' style="flex:1;font-size:12px;" />';
          }
          return '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;">' +
            '<span style="width:88px;font-size:12px;color:var(--text-secondary,#5a6472);flex-shrink:0;">' + escapeHtml(sf.label) + '</span>' + ctrl + '</div>';
        }).join('');
        return field(f.label, '',
          '<div data-style-root="' + f.key + '">' + styleRows +
          '<button class="item-list-act" data-style-clear="' + f.key + '" style="margin-top:6px;font-size:11px;color:#999;border:1px dashed var(--border-color,#e3e6ea);border-radius:4px;padding:3px 8px;background:none;cursor:pointer;">恢复默认（清除全部样式）</button></div>',
          f.hint);

      case 'sheet-items':
        // 悬浮窗跳转配置可视化编辑器（2026-09-11 老板要求：添加/删除/编辑名称，不用手写 JSON）
        var sheetCfg = null;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          sheetCfg = value;
        } else if (typeof value === 'string' && value.trim()) {
          // 兼容历史手写 JSON 字符串
          try {
            var parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) sheetCfg = parsed;
          } catch (e) { /* 非法 JSON 走下方回退 */ }
        }
        if (!sheetCfg) {
          // 无合法 JSON 配置 → 回退 textarea 手动修正
          return field(f.label, '', textareaHtml(f, value == null ? '' : String(value)),
            (f.hint ? f.hint + ' ' : '') + '⚠ 当前内容不是合法 JSON 对象，请在此修正后重新保存');
        }
        var sheetItems = Array.isArray(sheetCfg.items) ? sheetCfg.items : [];
        var sheetRows = sheetItems.map(function (item, idx) {
          var nm = (item && (item.name || item.title)) || '';
          var pg = (item && item.page) || '';
          var ctg = (item && item.category) || '';
          var st = (item && item.style) || {};
          var dot = (st.bgColor || st.textColor)
            ? '<span title="已自定义样式" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + escapeHtml(st.bgColor || st.textColor) + ';margin-right:4px;border:1px solid #ddd;flex-shrink:0;"></span>'
            : '';
          return '<div data-idx="' + idx + '" style="display:flex;gap:4px;align-items:center;padding:4px 0;border-bottom:1px dashed var(--border-color,#e3e6ea);">' +
            dot +
            '<span style="flex:1;font-size:12px;color:var(--text-main);">' + escapeHtml(nm) + '</span>' +
            '<span style="font-size:11px;color:var(--text-weak);">→ ' + escapeHtml(pg) + '</span>' +
            '<span style="font-size:11px;color:var(--text-weak);">' + escapeHtml(ctg) + '</span>' +
            '<button class="item-list-act" data-sheet-act="edit" data-idx="' + idx + '" style="color:var(--accent);font-size:11px;" title="编辑名称/跳转/样式">✎</button>' +
            '<button class="item-list-act" data-sheet-act="up" data-idx="' + idx + '" style="color:var(--accent);font-size:11px;">↑</button>' +
            '<button class="item-list-act" data-sheet-act="down" data-idx="' + idx + '" style="color:var(--accent);font-size:11px;">↓</button>' +
            '<button class="item-list-act" data-sheet-act="del" data-idx="' + idx + '" style="color:var(--color-danger,#e83b3b);font-size:11px;">✕</button>' +
          '</div>';
        }).join('');
        return field(f.label, '',
          '<div data-sheet-root="' + f.key + '">' +
          '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;">' +
            '<span style="width:52px;font-size:12px;color:var(--text-secondary,#5a6472);flex-shrink:0;">标题</span>' +
            '<input type="text" class="field-input" data-sheet-title value="' + escapeHtml(sheetCfg.title || '') + '" placeholder="如：选择发布类型" style="flex:1;font-size:12px;" />' +
          '</div>' +
          '<div style="font-size:11px;color:var(--text-weak,#8a919c);margin:4px 0;">子项（' + sheetItems.length + '）：✎ 编辑 / ↑↓ 排序 / ✕ 删除，或「+ 子项」添加</div>' +
          '<div data-sheet-list>' + (sheetRows || '<div style="font-size:11px;color:#999;padding:6px 0;">暂无子项，点下方「+ 子项」添加</div>') + '</div>' +
          '<button class="item-list-act" data-sheet-act="add" style="font-size:11px;padding:4px 10px;margin-top:4px;border:1px dashed var(--accent,#0062ff);border-radius:4px;background:none;color:var(--accent,#0062ff);cursor:pointer;">+ 子项</button>' +
          '</div>', f.hint);

      case 'textarea':
        return field(f.label, '', textareaHtml(f, value), f.hint);

      case 'number':
        return field(f.label, '',
          '<input type="number" class="field-input" data-key="' + f.key + '" value="' + (value == null ? '' : value) + '" ' +
          (f.min !== undefined ? 'min="' + f.min + '"' : '') +
          (f.max !== undefined ? 'max="' + f.max + '"' : '') + ' />',
          f.hint);

      case 'switch':
        return '<div class="field"><div class="switch-row">' +
          '<span class="switch-row-label">' + escapeHtml(f.label) + '</span>' +
          '<label class="switch"><input type="checkbox" data-key="' + f.key + '" ' + (value ? 'checked' : '') + ' />' +
          '<span class="switch-slider"></span></label></div>' +
          (f.hint ? '<div class="field-hint">' + f.hint + '</div>' : '') +
          '</div>';

      case 'radio-cards':
        return field(f.label, '',
          '<div class="radio-cards" data-key="' + f.key + '">' +
          f.options.map(function (opt) {
            return '<div class="radio-card' + (String(value) === String(opt.value) ? ' active' : '') + '" data-value="' + opt.value + '">' +
              '<i class="fa ' + (opt.value === '0' || opt.value === 'horizontal' ? 'fa-home' : 'fa-external-link') + '"></i>' +
              escapeHtml(opt.label) + '</div>';
          }).join('') + '</div>',
          f.hint);

      case 'multi-select':
        var arr = Array.isArray(value) ? value : [];
        return field(f.label, '',
          '<div class="chips" data-key="' + f.key + '">' +
          f.options.map(function (opt) {
            return '<span class="chip' + (arr.indexOf(opt.value) !== -1 ? ' active' : '') + '" data-value="' + opt.value + '">' +
              escapeHtml(opt.label) + '</span>';
          }).join('') + '</div>',
          f.hint);

      case 'page-select':
        return field(f.label, '',
          '<select class="field-select" data-key="' + f.key + '">' +
          '<option value="">— 请选择 —</option>' +
          Schema.pageOptions.map(function (opt) {
            return '<option value="' + opt.value + '"' + (value === opt.value ? ' selected' : '') + '>' +
              escapeHtml(opt.label) + '</option>';
          }).join('') +
          (value && !Schema.pageOptions.some(function (o) { return o.value === value; })
            ? '<option value="' + escapeHtml(value) + '" selected>' + escapeHtml(value) + '（自定义）</option>'
            : '') +
          '</select>',
          f.hint);

      case 'content-picker':
        return renderContentPicker(f, data, onUpdate);

      case 'category-list':
        return renderCategoryList(f, data);

      default:
        return '';
    }
  }

  /** 轮播内容选择器：已选列表 + 弹窗多选 */
  function renderContentPicker(f, data, onUpdate) {
    var items = Array.isArray(data.items) ? data.items : [];
    var listHtml = items.length === 0
      ? '<div class="item-list-empty">尚未选择轮播内容</div>'
      : '<div class="item-list" data-key="items">' +
        items.map(function (rid, i) {
          return '<div class="item-list-row">' +
            '<span class="item-list-main"><div class="item-list-title">' + escapeHtml(shortId(rid)) + '</div></span>' +
            '<button class="item-list-act" data-op="up" data-idx="' + i + '" ' + (i === 0 ? 'disabled' : '') + '><i class="fa fa-arrow-up"></i></button>' +
            '<button class="item-list-act" data-op="down" data-idx="' + i + '" ' + (i === items.length - 1 ? 'disabled' : '') + '><i class="fa fa-arrow-down"></i></button>' +
            '<button class="item-list-act danger" data-op="del" data-idx="' + i + '"><i class="fa fa-trash"></i></button>' +
            '</div>';
        }).join('') + '</div>';

    var node = field(f.label, '',
      listHtml +
      '<button class="item-list-add" id="btnPickContent"><i class="fa fa-plus"></i> ' +
      (items.length === 0 ? '选择轮播内容' : '重新选择内容') + '</button>',
      f.hint);

    // 事件绑定（延迟到 bindFieldEvents 后手动挂）
    setTimeout(function () {
      var body = el.body;
      var listNode = body.querySelector('.item-list[data-key="items"]');
      if (listNode) {
        listNode.addEventListener('click', function (e) {
          var btn = e.target.closest('.item-list-act');
          if (!btn) return;
          var idx = parseInt(btn.getAttribute('data-idx'), 10);
          var op = btn.getAttribute('data-op');
          var cur = (Store.getHomeSections() || [])[getSelectedIndex()];
          if (!cur) return;
          var arr = (cur.config && cur.config.items ? cur.config.items.slice() : []);
          if (op === 'del') arr.splice(idx, 1);
          if (op === 'up' && idx > 0) { arr.splice(idx - 1, 0, arr.splice(idx, 1)[0]); }
          if (op === 'down' && idx < arr.length - 1) { arr.splice(idx + 1, 0, arr.splice(idx, 1)[0]); }
          onUpdate('items', arr);
        });
      }
      var pickBtn = document.getElementById('btnPickContent');
      if (pickBtn) pickBtn.addEventListener('click', function () { openContentPicker(); });
    }, 0);

    return node;
  }

  /** 当前选中的区块下标 */
  function getSelectedIndex() {
    var sel = Store.getSelection();
    return sel && sel.index !== undefined ? sel.index : -1;
  }

  /** 分类导航列表编辑器（category_filter，多条件+且/或+三维度） */
  var SEW_OPTS = ['0骨架','1技能','2想法','3项目','4交流','5规则','6价值','7目标','8计划','9信息','10人脉','11仓','12复盘'];
  var COND_TYPES = [['category','分类'],['keyword','关键词'],['sew','12维']];
  var LX_TYPES = ['文章','商品','任务接单','评论','知识','交流'];

  /** ===== 高级过滤（2026-09-09 重应用）：多字段/多操作符/一层条件组/单选下拉 ===== */
  var ADV_FIELDS=[
    {id:'mingcheng',name:'名称',type:'text',dataType:2},
    {id:'miaoshu',name:'描述',type:'text',dataType:2},
    {id:'leixing',name:'内容类型',type:'select',dataType:11,options:LX_TYPES},
    {id:'sew',name:'记忆维度',type:'select',dataType:11,options:SEW_OPTS},
    {id:'6a0521f9104f63109c08d466',name:'分类',type:'relation',dataType:29},
    {id:'6a045ea70507e352629dd2c6',name:'关键词',type:'relation',dataType:29},
    {id:'fbsj',name:'发布时间',type:'datetime',dataType:16},
    {id:'ctime',name:'创建时间',type:'datetime',dataType:16},
    {id:'yuedu',name:'阅读数',type:'number',dataType:6},
    {id:'dianzan',name:'点赞数',type:'number',dataType:6},
    {id:'pinglun',name:'评论数',type:'number',dataType:6}
  ];
  var ADV_OPS={
    text:[['eq','是'],['ne','不是'],['like','包含'],['nlike','不包含'],['start','开头为'],['end','结尾为'],['empty','为空'],['hasvalue','不为空']],
    select:[['eq','是（单选）']],
    relation:[['rceq','是'],['rcne','不是']],
    number:[['gt','大于'],['gte','大于等于'],['lt','小于'],['lte','小于等于'],['between','在范围内']],
    datetime:[['date_today','今天'],['date_yesterday','昨天'],['date_thisweek','本周'],['date_thismonth','本月'],['date_last30','过去30天'],['date_in','过去N个范围内']]
  };
  function advFieldDef(fid){ for (var i=0;i<ADV_FIELDS.length;i++) if (ADV_FIELDS[i].id===fid) return ADV_FIELDS[i]; return ADV_FIELDS[0]; }
  function advDefaultOp(type){ var ops = ADV_OPS[type] || []; return ops.length ? ops[0][0] : 'like'; }
  function advDefaultCond(){ return {kind:'cond',field:'mingcheng',op:'like',value:''}; }
  function parseKwRowids(guanjianciJson, filterSids) {
    var out = [];
    try {
      var kws = JSON.parse(guanjianciJson || '[]');
      kws.forEach(function (k) { if (!filterSids || filterSids.indexOf(k.sid) >= 0) out.push(k.sid); });
    } catch (e) { /* 坏数据忽略 */ }
    return out;
  }
  // 拉当前商家的分类列表（供高级过滤的分类下拉使用；拉完重渲染让下拉立即有值）
  function loadAdvCatOptions(){
    var shangjia = window._decoMerchantRowid || '';
    var payload = JSON.stringify({
      url: 'https://api.mingdao.com/v2/open/worksheet/getFilterRows',
      input: {
        worksheetId: '6a05208e125d721621c7551c',
        pageSize: 100, pageIndex: 1, listType: 0,
        controls: ['rowid', 'mingcheng'],
        filters: [{ controlId: 'shangjia', dataType: 29, spliceType: 1, filterType: 24, value: shangjia }]
      }
    });
    fetch('https://100000whys.cn/mingdao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        window.ADV_CAT_OPTS = ((d.data || {}).rows || []).map(function (r) { return { rowid: r.rowid, mingcheng: r.mingcheng }; });
        console.log('[高级过滤] 分类选项已加载:', window.ADV_CAT_OPTS.length);
        Panel.render();   // 选项到达后重渲染，下拉立即有值
      })
      .catch(function (e) { console.warn('[高级过滤] 分类选项加载失败', e); });
  }
  // 语义模型 → 明道云筛选器线格式（与 webview home.js 的 advToWire 同逻辑；
  // 装修器日志打印的就是这个数组——webview 端原样透传给 getFilterRows）
  function advCondToWire(c, splice) {
    var dtMap = { mingcheng: 2, miaoshu: 2, leixing: 11, sew: 11,
      '6a0521f9104f63109c08d466': 29, '6a045ea70507e352629dd2c6': 29,
      fbsj: 16, ctime: 16, yuedu: 6, dianzan: 6, pinglun: 6 };
    var w = { controlId: c.field, dataType: dtMap[c.field] || 2, spliceType: splice || 1 };
    switch (c.op) {
      case 'eq': w.filterType = 2; w.value = c.value; break;
      case 'ne': w.filterType = 6; w.value = c.value; break;
      case 'like': w.filterType = 1; w.value = c.value; break;
      case 'nlike': w.filterType = 5; w.value = c.value; break;
      case 'start': w.filterType = 3; w.value = c.value; break;
      case 'end': w.filterType = 4; w.value = c.value; break;
      case 'empty': w.filterType = 7; break;
      case 'hasvalue': w.filterType = 8; break;
      case 'in': w.filterType = 2; w.values = c.values || []; break;
      case 'nin': w.filterType = 6; w.values = c.values || []; break;
      case 'rceq': w.filterType = 24; w.value = c.value; break;
      case 'rcne': w.filterType = 25; w.value = c.value; break;
      case 'gt': w.filterType = 13; w.value = c.value; break;
      case 'gte': w.filterType = 14; w.value = c.value; break;
      case 'lt': w.filterType = 15; w.value = c.value; break;
      case 'lte': w.filterType = 16; w.value = c.value; break;
      case 'between': w.filterType = 11; w.minValue = c.min; w.maxValue = c.max; break;
      case 'date_today': w.filterType = 17; w.dateRange = 1; break;
      case 'date_yesterday': w.filterType = 17; w.dateRange = 2; break;
      case 'date_thisweek': w.filterType = 17; w.dateRange = 4; break;
      case 'date_thismonth': w.filterType = 17; w.dateRange = 7; break;
      case 'date_last30': w.filterType = 17; w.dateRange = 23; break;
      case 'date_in': w.filterType = 31; w.dateRangeType = c.dateRangeType || 1; w.dateRange = c.dateRange || 1; break;
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
        if (gf.length) {
          out.push({ controlId: gf[0].controlId, dataType: gf[0].dataType, spliceType: gst,
            filterType: gf[0].filterType, isGroup: true, groupFilters: gf });
        }
      } else {
        var w = advCondToWire(it, st);
        if (w) out.push(w);
      }
    });
    return out;
  }
  function logAdvFilters(tabName, adv) {
    var wire = advToWire(adv);
    console.log('[高级过滤] tab「' + tabName + '」filters 数组（webview 将原样发给 getFilterRows）:', JSON.stringify(wire));
  }
  function advItemHtml(item,ti,ii){
    var f=advFieldDef(item.field);
    var fieldSel='<select class="inline-input" style="flex:1.2;font-size:11px;" data-adv="field" data-ii="'+ii+'">' +
      ADV_FIELDS.map(function(fd){ return '<option value="'+fd.id+'"'+(fd.id===item.field?' selected':'')+'>'+fd.name+'</option>'; }).join('') + '</select>';
    var opSel='<select class="inline-input" style="flex:1;font-size:11px;" data-adv="op" data-ii="'+ii+'">' +
      (ADV_OPS[f.type]||[]).map(function(o){ return '<option value="'+o[0]+'"'+(item.op===o[0]?' selected':'')+'>'+o[1]+'</option>'; }).join('') + '</select>';
    var val='';
    if (f.type==='select') {
      // 单选下拉（2026-09-09 老板拍板：内容类型/12维不需要多选）
      val='<select class="inline-input" style="flex:2;font-size:11px;" data-adv="value" data-ii="'+ii+'">' +
        '<option value="">不限</option>' +
        (f.options||[]).map(function(o){ return '<option value="'+o+'"'+(item.value===o?' selected':'')+'>'+o+'</option>'; }).join('') +
        '</select>';
    } else if (f.id==='6a0521f9104f63109c08d466') {
      // 分类：按商家拉分类表做下拉（异步加载，缓存于 ADV_CAT_OPTS）
      val='<select class="inline-input" style="flex:2;font-size:11px;" data-adv="value" data-ii="'+ii+'">' +
        '<option value="">选择分类…</option>' +
        (window.ADV_CAT_OPTS||[]).map(function(o){ return '<option value="'+o.rowid+'"'+(item.value===o.rowid?' selected':'')+'>'+esc(o.mingcheng)+'</option>'; }).join('') +
        '</select>';
      if (!window.ADV_CAT_OPTS && !window.ADV_CAT_LOADING) { window.ADV_CAT_LOADING = true; loadAdvCatOptions(); }
    } else if (f.id==='6a045ea70507e352629dd2c6') {
      // 关键词：rowid 输入 + 原生搜索器（openKeywordPicker）
      val='<input type="text" class="inline-input" style="flex:1.4;font-size:11px;" placeholder="关键词rowid（🔍可搜索）" value="'+esc(item.value||'')+'" data-adv="value" data-ii="'+ii+'" />' +
        '<button class="item-list-act" data-adv="pick-kw" data-ii="'+ii+'" title="搜索关键词" style="font-size:11px;padding:2px 6px;border:1px solid var(--border,#ccc);border-radius:4px;background:none;cursor:pointer;">🔍</button>';
    } else if (f.type==='number') {
      val = item.op==='between'
        ? '<input type="number" class="inline-input" style="flex:1;font-size:11px;" placeholder="最小" value="'+esc(item.min||'')+'" data-adv="min" data-ii="'+ii+'" />' +
          '<input type="number" class="inline-input" style="flex:1;font-size:11px;" placeholder="最大" value="'+esc(item.max||'')+'" data-adv="max" data-ii="'+ii+'" />'
        : '<input type="number" class="inline-input" style="flex:2;font-size:11px;" value="'+esc(item.value||'')+'" data-adv="value" data-ii="'+ii+'" />';
    } else if (f.type==='datetime') {
      if (item.op==='date_in') {
        var DRT=[['1','天'],['2','周'],['3','月'],['4','季'],['5','年']];
        val='<select class="inline-input" style="flex:1;font-size:11px;" data-adv="drtype" data-ii="'+ii+'">' +
          DRT.map(function(o){ return '<option value="'+o[0]+'"'+(String(item.dateRangeType||'1')===o[0]?' selected':'')+'>'+o[1]+'</option>'; }).join('') + '</select>' +
          '<input type="number" class="inline-input" style="flex:1;font-size:11px;" value="'+esc(item.dateRange||'1')+'" data-adv="dr" data-ii="'+ii+'" />';
      } else {
        val='<span style="flex:2;font-size:10px;color:var(--text-sub,#8a919c);">（按当前时间自动计算）</span>';
      }
    } else {
      val='<input type="text" class="inline-input" style="flex:2;font-size:11px;" value="'+esc(item.value||'')+'" data-adv="value" data-ii="'+ii+'" />';
    }
    return '<div style="display:flex;gap:4px;align-items:center;padding:3px 0;border-bottom:1px dashed var(--border,#e3e6ea);">' +
      fieldSel + opSel + val +
      '<button class="item-list-act" data-adv="del-item" data-ii="'+ii+'" title="删除" style="color:var(--color-danger,#e83b3b);font-size:12px;">✕</button></div>';
  }
  function advHtml(adv,ti){
    var items=adv.items||[];
    var rows=items.map(function(it,ii){
      if (it.kind==='group') {
        var inner=(it.items||[]).map(function(c,ci2){ return advItemHtml(c,ti,ii+'-'+ci2); }).join('');
        var gop='<select class="inline-input" style="width:52px;font-size:11px;" data-adv="gop" data-gi="'+ii+'">' +
          '<option value="and"'+(it.op!=='or'?' selected':'')+'>且</option><option value="or"'+(it.op==='or'?' selected':'')+'>或</option></select>';
        return '<div style="border:1px dashed var(--accent,#1677ff);border-radius:6px;padding:5px 6px;margin:4px 0;background:rgba(22,119,255,0.04);">' +
          '<div style="display:flex;gap:4px;align-items:center;"><span style="font-size:10px;color:var(--accent,#1677ff);font-weight:600;">条件组</span>' + gop +
          '<span style="flex:1"></span><button class="item-list-act" data-adv="del-item" data-ii="'+ii+'" style="color:var(--color-danger,#e83b3b);font-size:12px;">✕</button></div>' +
          '<div class="adv-inner">' + inner +
          '<button class="item-list-act" data-adv="add-inner" data-gi="'+ii+'" style="font-size:10px;padding:2px 6px;border:1px dashed var(--border,#ccc);border-radius:4px;background:none;cursor:pointer;">+ 组内条件</button></div></div>';
      }
      return advItemHtml(it,ti,ii);
    }).join('');
    var topOp='<select class="inline-input" style="width:56px;font-size:11px;" data-adv="topop">' +
      '<option value="and"'+(adv.op!=='or'?' selected':'')+'>且</option><option value="or"'+(adv.op==='or'?' selected':'')+'>或</option></select>';
    return '<div style="border:1px solid var(--border,#e3e6ea);border-radius:6px;padding:6px 8px;margin:4px 0;background:var(--bg-panel,#fafafa);">' +
      '<div style="display:flex;gap:4px;align-items:center;margin-bottom:4px;"><span style="font-size:10px;color:var(--text-sub,#8a919c);">条件间关系：</span>' + topOp + '</div>' +
      (rows || '<div style="font-size:10px;color:#999;padding:4px 0;">无条件</div>') +
      '<div style="display:flex;gap:4px;margin-top:4px;">' +
        '<button class="item-list-act" data-adv="add-cond" style="font-size:10px;padding:2px 6px;border:1px dashed var(--border,#ccc);border-radius:4px;background:none;cursor:pointer;">+ 添加条件</button>' +
        '<button class="item-list-act" data-adv="add-group" style="font-size:10px;padding:2px 6px;border:1px dashed var(--accent,#1677ff);border-radius:4px;background:none;cursor:pointer;color:var(--accent,#1677ff);">+ 添加条件组</button>' +
      '</div>' +
      '<div style="font-size:10px;color:#999;margin-top:4px;">提示：条件组只支持一层（平台限制）；启用高级过滤后，简单过滤条件不再生效</div></div>';
  }
  /** ===== 高级过滤结束 ===== */


  function normCat(cat) {
    cat = JSON.parse(JSON.stringify(cat));
    if (!cat.type) cat.type = cat.rowid ? 'category' : 'all';
    if (!Array.isArray(cat.conds)) {
      var c = {};
      if (cat.type === 'sew' && cat.sewKey) { c = { type: 'sew', sewKey: cat.sewKey }; }
      else if (cat.rowid) { c = { type: 'category', rowid: cat.rowid }; }
      cat.conds = c.type ? [c] : [];
    }
    if (cat.type === 'all' && !Array.isArray(cat.leixing)) cat.leixing = ['文章'];
    return cat;
  }

  function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// 把日志辅助函数挂到 window，方便从 F12 控制台直接调用验证（与日志功能本身无关——日志一直在打印）
  window.advToWire = advToWire;
  window.logAdvFilters = logAdvFilters;

  function condRowHtml(cond, ti, ci) {
    var typeSel = '<select class="inline-input" style="flex:1;font-size:11px;" data-cop="type">' +
      COND_TYPES.map(function(o){ return '<option value="'+o[0]+'"'+(cond.type===o[0]?' selected':'')+'>'+o[1]+'</option>'; }).join('') + '</select>';
    var valField;
    if (cond.type === 'sew') {
      valField = '<select class="inline-input" style="flex:1.5;font-size:11px;" data-cop="sewKey">' +
        SEW_OPTS.map(function(s){ return '<option value="'+s+'"'+(cond.sewKey===s?' selected':'')+'>'+s+'</option>'; }).join('') + '</select>';
    } else {
      var ph = cond.type === 'keyword' ? '关键词rowid' : '分类rowid';
      valField = '<input type="text" class="inline-input" style="flex:1.5;font-size:11px;" placeholder="'+ph+'" value="'+esc(cond.rowid||'')+'" data-cop="rowid" />';
      if (cond.type === 'keyword') valField += '<button class="item-list-act" data-cop="pick-kw" title="搜索关键词"><i class="fa fa-search"></i></button>';
    }
    return '<div data-ci="' + ci + '" style="display:flex;gap:4px;align-items:center;padding:3px 0;border-bottom:1px dashed var(--border,#e3e6ea);">' +
      typeSel + valField +
      '<button class="item-list-act" data-cop="del" title="删除条件" style="color:var(--color-danger,#e83b3b);font-size:12px;">✕</button></div>';
  }

  function tabGroupHtml(cat, ti) {
    var conds = cat.conds || [];
    var condsHtml = conds.map(function(c, ci) { return condRowHtml(c, ti, ci); }).join("");
    var opSel = conds.length > 1 ? '<select class="inline-input" style="width:56px;font-size:11px;" data-cop="op">' +
      '<option value="and"' + (cat.op !== 'or' ? ' selected' : '') + '>且</option>' +
      '<option value="or"' + (cat.op === 'or' ? ' selected' : '') + '>或</option></select>' : '';
    var lxChips = LX_TYPES.map(function(lx) {
      var on = (cat.leixing || []).indexOf(lx) >= 0;
      return '<span class="lx-chip" data-cop="lx" data-lx="' + lx + '" style="display:inline-block;padding:1px 6px;margin:1px;border-radius:8px;font-size:10px;cursor:pointer;background:' + (on ? 'var(--accent,#1677ff);color:#fff' : 'var(--bg-tag,#f0f0f0);color:#666') + ';">' + lx + '</span>';
    }).join("");
    return '<div class="cat-tab-group" data-ti="' + ti + '" style="border:1px solid var(--border,#e3e6ea);border-radius:6px;padding:6px 8px;margin-bottom:6px;background:var(--bg-panel,#fafafa);">' +
      '<div style="display:flex;gap:4px;align-items:center;margin-bottom:4px;">' +
        '<input type="text" class="inline-input" style="flex:2;font-size:12px;" placeholder="tab名" value="' + esc(cat.name || '') + '" data-cop="name" />' +
        '<input type="number" class="inline-input" style="width:48px;font-size:11px;" placeholder="排序" value="' + (cat.sort != null ? cat.sort : '') + '" data-cop="sort" />' +
        '<button class="item-list-act" data-cop="del-tab" style="color:var(--color-danger,#e83b3b);font-size:13px;" title="删除tab">🗑</button>' +
      '</div>' +
      '<div style="font-size:10px;color:var(--text-sub,#8a919c);margin:3px 0;">过滤条件：</div>' +
      advHtml(cat.adv, ti) +
      '<div style="font-size:10px;color:var(--text-sub,#8a919c);margin:4px 0 2px;">内容类型（全部tab可配）：</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:2px;">' + lxChips + '</div>' +
    '</div>';
  }

  function renderCategoryList(f, data) {
    var list = Array.isArray(data.category_filter) ? data.category_filter : [];
    // 默认开启高级过滤（2026-09-11 老板拍板）：老 tab 无 adv 时自动补一个空 adv，避免 UI 空白
    list = list.map(function(c){ if (!c.adv) c.adv = { op: 'and', items: [advDefaultCond()] }; return normCat(c); });
    var rowsHtml = list.length === 0
      ? '<div class="item-list-empty">未配置导航</div>'
      : '<div class="cat-tab-list">' + list.map(function(c, i) { return tabGroupHtml(c, i); }).join("") + '</div>';
    var node = field(f.label, '',
      rowsHtml +
      '<button class="item-list-add" id="btnAddCategory"><i class="fa fa-plus"></i> 添加导航 tab</button>' +
      '<div style="font-size:10px;color:var(--color-text-weak,#9CA3AF);margin-top:4px;">每个 tab 可配多个条件（分类/关键词/12维），条件间可选 且/或</div>',
      f.hint);
    setTimeout(function () { bindCatEditor(f); }, 0);
    return node;
  }

  function bindCatEditor(f) {
    var listNode = el.body.querySelector('.cat-tab-list');
    if (!listNode) return;
    listNode.oninput = function (e) {
      // —— 高级过滤输入（data-adv）——
      var advEl = e.target.closest('[data-adv]');
      if (advEl) {
        var sectionsA = Store.getHomeSections();
        var secIdxA = getSelectedIndex();
        if (!sectionsA || !sectionsA[secIdxA]) return;
        var arrA = (sectionsA[secIdxA].config && sectionsA[secIdxA].config.category_filter || []).slice();
        var grpNode = advEl.closest('.cat-tab-group');
        var tiA = grpNode ? parseInt(grpNode.getAttribute('data-ti'), 10) : -1;
        if (!arrA[tiA]) return;
        var catA = arrA[tiA];
        if (!catA.adv) catA.adv = { op: 'and', items: [] };
        var adv = catA.adv;
        var aop = advEl.getAttribute('data-adv');
        var key = advEl.getAttribute('data-ii') || '';
        function getItem(container, k) {
          var parts = String(k).split('-');
          if (parts.length === 1) return container[parseInt(parts[0], 10)];
          var gi = parseInt(parts[0], 10), ci = parseInt(parts[1], 10);
          return (container[gi] && container[gi].items) ? container[gi].items[ci] : null;
        }
        var item = getItem(adv.items, key);
        var needsRerender = false;
        if (aop === 'topop') { adv.op = advEl.value; needsRerender = true; }
        else if (aop === 'gop') { var gi2 = parseInt(advEl.getAttribute('data-gi'), 10); if (adv.items[gi2]) adv.items[gi2].op = advEl.value; needsRerender = true; }
        else if (item) {
          if (aop === 'field') {
            item.field = advEl.value;
            var fdef = null;
            for (var fi = 0; fi < ADV_FIELDS.length; fi++) if (ADV_FIELDS[fi].id === item.field) fdef = ADV_FIELDS[fi];
            item.op = advDefaultOp(fdef ? fdef.type : 'text');
            delete item.value; delete item.values; delete item.min; delete item.max; delete item.dateRange; delete item.dateRangeType;
            needsRerender = true;   // 字段切换：操作符/值控件重渲染（分类下拉懒加载也在此触发）
          } else if (aop === 'op') {
            item.op = advEl.value;
            if (item.op !== 'between') { delete item.min; delete item.max; }
            if (item.op !== 'in' && item.op !== 'nin') delete item.values;
            needsRerender = true;
          } else if (aop === 'value') { item.value = advEl.value; }
          else if (aop === 'min') { item.min = advEl.value; }
          else if (aop === 'max') { item.max = advEl.value; }
          else if (aop === 'drtype') { item.dateRangeType = advEl.value; needsRerender = true; }
          else if (aop === 'dr') { item.dateRange = advEl.value; }
        }
        arrA[tiA] = catA;
        withSuppress(function () { Store.updateSectionConfig(secIdxA, 'category_filter', arrA); });
        logAdvFilters(catA.name || '', catA.adv);
        if (needsRerender) Panel.render();   // 右面板整体重渲染（分类下拉选项异步到达后也会触发一次）
        return;
      }
      var el2 = e.target.closest('[data-cop]');
      if (!el2) return;
      var grp = el2.closest('.cat-tab-group');
      var ti = grp ? parseInt(grp.getAttribute('data-ti'), 10) : -1;
      var sections = Store.getHomeSections();
      var secIdx = getSelectedIndex();
      if (!sections || !sections[secIdx]) return;
      var arr = (sections[secIdx].config && sections[secIdx].config.category_filter || []).slice();
      if (!arr[ti]) return;
      var cat = normCat(JSON.parse(JSON.stringify(arr[ti])));
      var cop = el2.getAttribute('data-cop');
      if (cop === 'name' || cop === 'sort') { cat[cop] = el2.value; }
      else {
        var condRow = el2.closest('[data-ci]');
        var ci = condRow ? parseInt(condRow.getAttribute('data-ci'), 10) : -1;
        if (ci >= 0 && Array.isArray(cat.conds) && cat.conds[ci]) cat.conds[ci][cop] = el2.value;
      }
      arr[ti] = cat;
      withSuppress(function () { Store.updateSectionConfig(secIdx, 'category_filter', arr); });
      // 行内下拉（条件类型/值）切换后重渲染；名称/排序的连续输入不重渲染（防焦点丢失）
      if (cop !== 'name' && cop !== 'sort') Panel.render();
    };
    listNode.onclick = function (e) {
      // —— 高级过滤按钮（data-adv）——
      var advBtn = e.target.closest('[data-adv]');
      if (advBtn) {
        var aop2 = advBtn.getAttribute('data-adv');
        var grpN = advBtn.closest('.cat-tab-group');
        var ti2 = grpN ? parseInt(grpN.getAttribute('data-ti'), 10) : -1;
        var sectionsB = Store.getHomeSections();
        var secIdxB = getSelectedIndex();
        if (!sectionsB || !sectionsB[secIdxB] || !sectionsB[secIdxB].config) return;
        var arrB = (sectionsB[secIdxB].config.category_filter || []).slice();
        if (!arrB[ti2]) return;
        var catB = arrB[ti2];
        function redraw() {
          Store.updateSectionConfig(secIdxB, 'category_filter', arrB);
          logAdvFilters(catB.name || '', catB.adv);
          Panel.render();
        }
        if (aop2 === 'add-cond') { catB.adv.items.push(advDefaultCond()); redraw(); return; }
        if (aop2 === 'add-group') { catB.adv.items.push({ kind: 'group', op: 'and', items: [advDefaultCond()] }); redraw(); return; }
        if (aop2 === 'add-inner') {
          var gi = parseInt(advBtn.getAttribute('data-gi'), 10);
          if (catB.adv.items[gi] && catB.adv.items[gi].items) catB.adv.items[gi].items.push(advDefaultCond());
          redraw(); return;
        }
        if (aop2 === 'del-item') {
          var kp = String(advBtn.getAttribute('data-ii') || '').split('-');
          if (kp.length === 1) catB.adv.items.splice(parseInt(kp[0], 10), 1);
          else {
            var g2 = parseInt(kp[0], 10), c2 = parseInt(kp[1], 10);
            if (catB.adv.items[g2] && catB.adv.items[g2].items) {
              catB.adv.items[g2].items.splice(c2, 1);
              if (catB.adv.items[g2].items.length === 0) catB.adv.items.splice(g2, 1);
            }
          }
          redraw(); return;
        }
        if (aop2 === 'pick-kw') {
          var pickKey = advBtn.getAttribute('data-ii') || '';
          openKeywordPicker(function (row) {
            var it = getItem(catB.adv.items, pickKey);
            if (it && row && row.rowid) {
              it.value = row.rowid;
              redraw();
            }
          });
          return;
        }
        return;
      }
      var btn = e.target.closest('[data-cop]');
      if (!btn) return;
      var cop = btn.getAttribute('data-cop');
      var grp = btn.closest('.cat-tab-group');
      var ti = grp ? parseInt(grp.getAttribute('data-ti'), 10) : -1;
      var sections = Store.getHomeSections();
      var secIdx = getSelectedIndex();
      if (!sections || !sections[secIdx]) return;
      var arr = (sections[secIdx].config && sections[secIdx].config.category_filter || []).slice();
      if (!arr[ti]) return;
      var cat = normCat(JSON.parse(JSON.stringify(arr[ti])));
      if (!Array.isArray(cat.conds)) cat.conds = [];
      if (cop === 'del-tab') {
        arr.splice(ti, 1);
        Store.updateSectionConfig(secIdx, 'category_filter', arr);
        Panel.render();
        return;
      }
      if (cop === 'add-cond') {
        cat.conds.push({ type: 'category', rowid: '' });
        arr[ti] = cat;
        Store.updateSectionConfig(secIdx, 'category_filter', arr);
        Panel.render();
        return;
      }
      if (cop === 'del') {
        var condRow = btn.closest('[data-ci]');
        var ci = condRow ? parseInt(condRow.getAttribute('data-ci'), 10) : -1;
        if (ci >= 0) {
          cat.conds.splice(ci, 1);
          arr[ti] = cat;
          Store.updateSectionConfig(secIdx, 'category_filter', arr);
          Panel.render();
        }
        return;
      }
      if (cop === 'lx') {
        var lx = btn.getAttribute('data-lx');
        var sel = Array.isArray(cat.leixing) ? cat.leixing : [];
        var pos = sel.indexOf(lx);
        if (pos >= 0) sel.splice(pos, 1); else sel.push(lx);
        cat.leixing = sel;
        arr[ti] = cat;
        Store.updateSectionConfig(secIdx, 'category_filter', arr);
        Panel.render();
        return;
      }
    };
  }

  function openKeywordPicker(cb) {
    var q = prompt('搜索关键词（留空=全部）：');
    if (window.DecorationApi && DecorationApi.searchKeywords) {
      DecorationApi.searchKeywords(q || '', 30).then(function (rows) {
        var opts = rows.map(function (r, i) { return (i + 1) + '. ' + r.rowid.slice(0, 8) + ' | ' + r.mingcheng; }).join('\n');
        var pick = prompt('输入序号：\n' + opts);
        var pi = parseInt(pick, 10) - 1;
        if (pi >= 0 && pi < rows.length) cb(rows[pi]);
      });
    }
  }

  // ==================== 内容选择弹窗 ====================

  function openContentPicker() {
    var secIdx = getSelectedIndex();
    var sections = Store.getHomeSections();
    if (!sections || !sections[secIdx]) return;
    var selected = (sections[secIdx].config && Array.isArray(sections[secIdx].config.items))
      ? sections[secIdx].config.items.slice() : [];

    openModal('选择轮播内容',
      '<div class="picker-toolbar">' +
        '<input type="text" class="field-input" id="pickerKeyword" placeholder="按内容名称搜索..." />' +
        '<button class="btn btn-ghost btn-sm" id="pickerSearchBtn"><i class="fa fa-search"></i> 搜索</button>' +
      '</div>' +
      '<div class="picker-list" id="pickerList"><div class="item-list-empty">加载中...</div></div>' +
      '<div class="field-hint" style="margin-top:10px;">已选 <b id="pickerCount">' + selected.length + '</b> 项 · 按勾选顺序生成轮播（后勾选的排在后面）</div>',
      '<button class="btn btn-ghost" id="pickerCancel">取消</button>' +
      '<button class="btn btn-primary" id="pickerOk"><i class="fa fa-check"></i> 确定</button>');

    var listNode = document.getElementById('pickerList');
    var selectedSet = {};
    selected.forEach(function (rid) { selectedSet[rid] = true; });
    var selectedOrder = selected.slice(); // 保持勾选顺序

    function loadList(keyword) {
      listNode.innerHTML = '<div class="item-list-empty">加载中...</div>';
      DecorationApi.getContentList({ keyword: keyword || '', pageSize: 50 }).then(function (res) {
        if (res.rows.length === 0) {
          listNode.innerHTML = '<div class="item-list-empty">当前商家暂无内容记录</div>';
          return;
        }
        listNode.innerHTML = res.rows.map(function (row) {
          var isSel = !!selectedSet[row.rowid];
          return '<div class="picker-item' + (isSel ? ' selected' : '') + '" data-rowid="' + row.rowid + '">' +
            (row.zhutu
              ? '<img class="picker-item-thumb" src="' + row.zhutu + '" alt="" />'
              : '<div class="picker-item-thumb"><i class="fa fa-image"></i></div>') +
            '<div class="picker-item-info">' +
              '<div class="picker-item-name">' + escapeHtml(row.mingcheng || '未命名') + '</div>' +
              '<div class="picker-item-meta">' + escapeHtml(row.leixing || '内容') +
              (row.ctime ? ' · ' + escapeHtml(row.ctime) : '') + '</div>' +
            '</div>' +
            '<div class="picker-item-check"><i class="fa fa-check"></i></div>' +
            '</div>';
        }).join('');
      }).catch(function () {
        listNode.innerHTML = '<div class="item-list-empty">加载失败，请重试</div>';
      });
    }

    loadList('');

    listNode.addEventListener('click', function (e) {
      var item = e.target.closest('.picker-item');
      if (!item) return;
      var rid = item.getAttribute('data-rowid');
      if (selectedSet[rid]) {
        delete selectedSet[rid];
        selectedOrder = selectedOrder.filter(function (x) { return x !== rid; });
        item.classList.remove('selected');
      } else {
        selectedSet[rid] = true;
        selectedOrder.push(rid);
        item.classList.add('selected');
      }
      document.getElementById('pickerCount').textContent = selectedOrder.length;
    });

    var searchTimer = null;
    document.getElementById('pickerKeyword').addEventListener('keyup', function (e) {
      if (e.key !== 'Enter') return;
      loadList(this.value.trim());
    });
    document.getElementById('pickerSearchBtn').addEventListener('click', function () {
      loadList(document.getElementById('pickerKeyword').value.trim());
    });

    document.getElementById('pickerCancel').addEventListener('click', closeModal);
    document.getElementById('pickerOk').addEventListener('click', function () {
      Store.updateSectionConfig(secIdx, 'items', selectedOrder);
      closeModal();
    });
  }

  // ==================== 通用 UI 辅助 ====================

  function field(label, subLabel, controlHtml, hint) {
    return '<div class="field">' +
      '<div class="field-label">' + escapeHtml(label) +
      (subLabel ? '<span style="font-weight:400;color:var(--text-weak);">' + escapeHtml(subLabel) + '</span>' : '') +
      '</div>' + controlHtml +
      (hint ? '<div class="field-hint">' + hint + '</div>' : '') +
      '</div>';
  }

  function textareaHtml(f, value) {
    return '<textarea class="field-textarea" data-key="' + f.key + '" rows="' + (f.rows || 4) + '"' +
      (f.placeholder ? ' placeholder="' + f.placeholder + '"' : '') +
      ' style="width:100%;box-sizing:border-box;min-height:80px;font-family:monospace;font-size:11px;padding:6px;border:1px solid var(--border-color,#e3e6ea);border-radius:6px;background:#fff;color:#262a30;resize:vertical;">' +
      escapeHtml(value == null ? '' : String(value)) + '</textarea>';
  }

  function orderZone(onUp, onDown, hint) {
    var node = document.createElement('div');
    node.innerHTML = '<div class="field"><div class="field-label">顺序调整</div>' +
      '<div class="field-row">' +
      '<button class="btn btn-ghost btn-sm" id="btnMoveUp"><i class="fa fa-arrow-up"></i> 上移</button>' +
      '<button class="btn btn-ghost btn-sm" id="btnMoveDown"><i class="fa fa-arrow-down"></i> 下移</button>' +
      '</div>' + (hint ? '<div class="field-hint">' + hint + '</div>' : '') + '</div>';
    // 直接返回 HTML + 事后绑定（统一在调用处 setTimeout 绑定不方便，这里用内联方式）
    var html = node.innerHTML;
    setTimeout(function () {
      var up = document.getElementById('btnMoveUp');
      var down = document.getElementById('btnMoveDown');
      if (up) up.addEventListener('click', onUp);
      if (down) down.addEventListener('click', onDown);
    }, 0);
    return html;
  }

  function dangerZone(btnText, onConfirm) {
    var html = '<div class="field" style="border-top:1px solid var(--border-color);padding-top:14px;">' +
      '<button class="btn btn-danger-ghost btn-sm" id="btnDangerZone" style="width:100%;justify-content:center;">' +
      '<i class="fa fa-trash"></i> ' + escapeHtml(btnText) + '</button></div>';
    setTimeout(function () {
      var btn = document.getElementById('btnDangerZone');
      if (btn) btn.addEventListener('click', onConfirm);
    }, 0);
    return html;
  }

  /** 根据 data-key 统一绑定常规表单事件 */
  function bindFieldEvents(root, fields, data, onUpdate) {
    fields.forEach(function (f) {
      if (f.type === 'textarea') {
        var ta = root.querySelector('textarea[data-key="' + f.key + '"]');
        if (ta) {
          ta.addEventListener('change', function () {
            withSuppress(function () { onUpdate(f.key, ta.value); });
          });
        }
      } else if (f.type === 'text' || f.type === 'number') {
        var input = root.querySelector('[data-key="' + f.key + '"]');
        if (input) {
          input.addEventListener('change', function () {
            withSuppress(function () { onUpdate(f.key, input.value); });
          });
        }
      } else if (f.type === 'switch') {
        var cb = root.querySelector('input[data-key="' + f.key + '"]');
        if (cb) {
          cb.addEventListener('change', function () {
            onUpdate(f.key, this.checked);
          });
        }
      } else if (f.type === 'radio-cards') {
        var group = root.querySelector('.radio-cards[data-key="' + f.key + '"]');
        if (group) {
          group.addEventListener('click', function (e) {
            var card = e.target.closest('.radio-card');
            if (!card) return;
            group.querySelectorAll('.radio-card').forEach(function (c) { c.classList.remove('active'); });
            card.classList.add('active');
            onUpdate(f.key, card.getAttribute('data-value'));
          });
        }
      } else if (f.type === 'multi-select') {
        var chips = root.querySelector('.chips[data-key="' + f.key + '"]');
        if (chips) {
          chips.addEventListener('click', function (e) {
            var chip = e.target.closest('.chip');
            if (!chip) return;
            var cur = Array.isArray(data[f.key]) ? data[f.key].slice() : [];
            var v = chip.getAttribute('data-value');
            var pos = cur.indexOf(v);
            if (pos !== -1) { cur.splice(pos, 1); chip.classList.remove('active'); }
            else { cur.push(v); chip.classList.add('active'); }
            onUpdate(f.key, cur);
          });
        }
      } else if (f.type === 'array-items') {
        var list = root.querySelector('[data-array-list="' + f.key + '"]');
        if (list) {
          list.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-array-act]');
            if (!btn) return;
            var act = btn.getAttribute('data-array-act');
            var idx = parseInt(btn.getAttribute('data-idx'), 10);
            var cur = Array.isArray(data[f.key]) ? data[f.key].slice() : [];
            var newVal = null;
            if (act === 'add') {
              // 自动复用上一个子项的字段值（如果存在），样式一并继承
              var lastItem = cur.length ? cur[cur.length - 1] : {};
              var newItem = { name: '新子项', page: lastItem.page || 'home', category: lastItem.category || '' };
              if (lastItem.style && typeof lastItem.style === 'object') {
                newItem.style = JSON.parse(JSON.stringify(lastItem.style));
              }
              newVal = cur.slice();
              newVal.push(newItem);
            } else if (act === 'del') {
              newVal = cur.slice(); newVal.splice(idx, 1);
            } else if (act === 'up' && idx > 0) {
              newVal = cur.slice();
              var tmp = newVal[idx - 1]; newVal[idx - 1] = newVal[idx]; newVal[idx] = tmp;
            } else if (act === 'down' && idx < cur.length - 1) {
              newVal = cur.slice();
              var tmp2 = newVal[idx]; newVal[idx] = newVal[idx + 1]; newVal[idx + 1] = tmp2;
            } else if (act === 'edit') {
              // 可视化编辑弹窗：名称 / 跳转 / 样式（2026-09-11）
              openSheetItemModal(cur[idx] || {}, function (updated) {
                var arr2 = cur.slice();
                arr2[idx] = updated;
                withSuppress(function () { onUpdate(f.key, arr2); });
              });
              return;
            }
            if (newVal !== null) withSuppress(function () { onUpdate(f.key, newVal); });
          });
        }
      } else if (f.type === 'sheet-items') {
        // 悬浮窗跳转配置：标题 + 子项的可视化增删改排序
        var sheetRoot = root.querySelector('[data-sheet-root="' + f.key + '"]');
        if (sheetRoot) {
          var getSheetCfg = function () {
            var cur = data[f.key];
            var cfg = (cur && typeof cur === 'object' && !Array.isArray(cur))
              ? JSON.parse(JSON.stringify(cur)) : {};
            if (!Array.isArray(cfg.items)) cfg.items = [];
            return cfg;
          };
          var titleInput = sheetRoot.querySelector('[data-sheet-title]');
          if (titleInput) {
            titleInput.addEventListener('change', function () {
              var cfg = getSheetCfg();
              cfg.title = titleInput.value;
              withSuppress(function () { onUpdate(f.key, cfg); });
            });
          }
          sheetRoot.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-sheet-act]');
            if (!btn) return;
            var act = btn.getAttribute('data-sheet-act');
            var idx = parseInt(btn.getAttribute('data-idx'), 10);
            var cfg = getSheetCfg();
            var arr = cfg.items;
            var done = false;
            if (act === 'add') {
              // 复用上一子项的字段与样式
              var lastItem = arr.length ? arr[arr.length - 1] : {};
              var newItem = { name: '新子项', page: lastItem.page || 'publish', category: lastItem.category || '' };
              if (lastItem.style && typeof lastItem.style === 'object') {
                newItem.style = JSON.parse(JSON.stringify(lastItem.style));
              }
              arr.push(newItem);
              done = true;
            } else if (act === 'del') {
              arr.splice(idx, 1);
              done = true;
            } else if (act === 'up' && idx > 0) {
              var tmp = arr[idx - 1]; arr[idx - 1] = arr[idx]; arr[idx] = tmp;
              done = true;
            } else if (act === 'down' && idx < arr.length - 1) {
              var tmp2 = arr[idx]; arr[idx] = arr[idx + 1]; arr[idx + 1] = tmp2;
              done = true;
            } else if (act === 'edit') {
              openSheetItemModal(arr[idx] || {}, function (updated) {
                var cfg2 = getSheetCfg();
                cfg2.items[idx] = updated;
                withSuppress(function () { onUpdate(f.key, cfg2); });
              });
              return;
            }
            if (done) withSuppress(function () { onUpdate(f.key, cfg); });
          });
        }
      } else if (f.type === 'style-editor') {
        // 样式编辑器：色值/圆角改动合并写回 style 对象；留空 = 删除该子样式（走默认）
        var sroot = root.querySelector('[data-style-root="' + f.key + '"]');
        if (sroot) {
          var collectStyle = function () {
            var st = (data[f.key] && typeof data[f.key] === 'object' && !Array.isArray(data[f.key]))
              ? JSON.parse(JSON.stringify(data[f.key])) : {};
            sroot.querySelectorAll('[data-style-key]').forEach(function (inp) {
              var k = inp.getAttribute('data-style-key');
              var v = String(inp.value || '').trim();
              if (v === '') delete st[k];
              else st[k] = v;
            });
            return Object.keys(st).length ? st : undefined;
          };
          sroot.querySelectorAll('[data-style-key]').forEach(function (inp) {
            inp.addEventListener('change', function () {
              // color / text 双输入同步
              var k = inp.getAttribute('data-style-key');
              sroot.querySelectorAll('[data-style-key="' + k + '"]').forEach(function (other) {
                if (other !== inp) other.value = inp.value;
              });
              withSuppress(function () { onUpdate(f.key, collectStyle()); });
            });
          });
          var clearBtn = sroot.querySelector('[data-style-clear]');
          if (clearBtn) {
            clearBtn.addEventListener('click', function () {
              sroot.querySelectorAll('[data-style-key]').forEach(function (inp) { inp.value = ''; });
              withSuppress(function () { onUpdate(f.key, undefined); });
            });
          }
        }
      } else if (f.type === 'page-select') {
        var select = root.querySelector('select[data-key="' + f.key + '"]');
        if (select) {
          select.addEventListener('change', function () {
            withSuppress(function () { onUpdate(f.key, select.value); });
          });
        }
      }
    });
  }

  // ==================== 功能项管理器（feature_list · 功能表实时数据） ====================

  // 模块级缓存：null = 未加载；加载后为功能项数组 [{rowid, label, iconUrl, url}]
  var featureItems = null;

  function featureManagerHtml() {
    return '<div style="border-top:1px solid var(--border-color);margin:14px 0;"></div>' +
      '<div class="field"><div class="field-label">功能项管理<span style="font-weight:400;color:var(--text-weak);">功能表实时数据</span></div>' +
      '<div id="featureManager"><div style="font-size:11px;color:#999;padding:6px 0;">功能项加载中...</div></div>' +
      '<button class="item-list-add" id="featureAddBtn" style="font-size:11px;padding:4px 10px;margin-top:6px;border:1px dashed var(--accent,#0062ff);border-radius:4px;background:none;color:var(--accent,#0062ff);cursor:pointer;">+ 添加功能项</button>' +
      '<div class="field-hint" style="margin-top:6px;">直接写入功能表（按商家过滤）；点击图片可更换，↑↓ 调整排序，改动保存后小程序端同步</div></div>';
  }

  function bindFeatureManager() {
    renderFeatureManager();

    var addBtn = document.getElementById('featureAddBtn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        openFeatureEditModal(null, function (data) {
          var doAdd = function (iconUrl) {
            DecorationApi.addFeatureItem(data.name, data.url, iconUrl).then(function () {
              showToast('功能项已添加', 'success');
              refreshFeature();
            }).catch(function (e) { showToast('添加失败：' + (e.message || ''), 'error'); });
          };
          if (data.file) {
            showToast('正在上传图片...', '');
            DecorationApi.uploadTempFile(data.file).then(function (r) { doAdd(r.url); })
              .catch(function (e) { showToast('图片上传失败：' + (e.message || ''), 'error'); });
          } else {
            doAdd('');
          }
        });
      });
    }

    var box = document.getElementById('featureManager');
    if (!box) return;
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-feature-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-feature-act');
      var idx = parseInt(btn.getAttribute('data-idx'), 10);
      var items = featureItems || [];
      var item = items[idx];
      if (!item) return;

      if (act === 'edit') {
        openFeatureEditModal(item, function (data) {
          var fields = { name: data.name, url: data.url };
          var doEdit = function (iconUrl) {
            if (iconUrl) fields.iconUrl = iconUrl;
            DecorationApi.editFeatureItem(item.rowid, fields).then(function () {
              showToast('已保存', 'success');
              refreshFeature();
            }).catch(function (er) { showToast('保存失败：' + (er.message || ''), 'error'); });
          };
          if (data.file) {
            showToast('正在上传图片...', '');
            DecorationApi.uploadTempFile(data.file).then(function (r) { doEdit(r.url); })
              .catch(function (er) { showToast('图片上传失败：' + (er.message || ''), 'error'); });
          } else {
            doEdit('');
          }
        });
      } else if (act === 'image') {
        var fileInput = document.getElementById('featureImageInput');
        if (fileInput) {
          fileInput.value = '';
          fileInput.setAttribute('data-target-rowid', item.rowid);
          fileInput.click();
        }
      } else if (act === 'up' || act === 'down') {
        var j = act === 'up' ? idx - 1 : idx + 1;
        if (j < 0 || j >= items.length) return;
        var arr = items.slice();
        var tmp = arr[idx]; arr[idx] = arr[j]; arr[j] = tmp;
        featureItems = arr;
        renderFeatureManager(); // 立即视觉反馈，后台写排序值
        DecorationApi.resortFeatureItems(arr.map(function (it) { return it.rowid; }))
          .then(function () {
            if (window.Preview && Preview.invalidateFeature) Preview.invalidateFeature();
          })
          .catch(function (er) { showToast('排序保存失败：' + (er.message || ''), 'error'); });
      } else if (act === 'del') {
        confirmModal('删除功能项', '确定删除「' + escapeHtml(item.label || '未命名') + '」吗？删除后小程序端同步消失。', function () {
          DecorationApi.deleteFeatureItem(item.rowid).then(function () {
            showToast('已删除', 'success');
            refreshFeature();
          }).catch(function (er) { showToast('删除失败：' + (er.message || ''), 'error'); });
        });
      }
    });

    // 隐藏 file input（换图入口），首次创建常驻 body
    if (!document.getElementById('featureImageInput')) {
      var fi = document.createElement('input');
      fi.type = 'file';
      fi.id = 'featureImageInput';
      fi.accept = 'image/*';
      fi.style.display = 'none';
      document.body.appendChild(fi);
      fi.addEventListener('change', function () {
        var file = fi.files && fi.files[0];
        var rowid = fi.getAttribute('data-target-rowid');
        if (!file || !rowid) return;
        showToast('正在上传图片...', '');
        DecorationApi.uploadTempFile(file).then(function (r) {
          return DecorationApi.editFeatureItem(rowid, { iconUrl: r.url });
        }).then(function () {
          showToast('图片已更换', 'success');
          refreshFeature();
        }).catch(function (er) { showToast('换图失败：' + (er.message || ''), 'error'); });
      });
    }
  }

  function renderFeatureManager() {
    var box = document.getElementById('featureManager');
    if (!box) return;
    if (featureItems === null) {
      DecorationApi.getFeatureList().then(function (items) {
        featureItems = items;
        renderFeatureManager();
      }).catch(function (e) {
        box.innerHTML = '<div style="font-size:11px;color:#e83b3b;padding:6px 0;">加载失败：' + escapeHtml(e.message || '') + '</div>';
      });
      return;
    }
    if (featureItems.length === 0) {
      box.innerHTML = '<div style="font-size:11px;color:#999;padding:6px 0;">暂无功能项，点下方「+ 添加功能项」</div>';
      return;
    }
    box.innerHTML = featureItems.map(function (it, idx) {
      var icon = it.iconUrl
        ? '<img src="' + escapeHtml(it.iconUrl) + '" style="width:32px;height:32px;border-radius:6px;object-fit:cover;border:1px solid var(--border-color,#e3e6ea);" />'
        : '<div style="width:32px;height:32px;border-radius:6px;background:#f0f2f5;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:12px;"><i class="fa fa-th"></i></div>';
      return '<div style="display:flex;gap:6px;align-items:center;padding:5px 0;border-bottom:1px dashed var(--border-color,#e3e6ea);">' +
        '<span data-feature-act="image" data-idx="' + idx + '" title="点击更换图片" style="cursor:pointer;line-height:0;display:flex;">' + icon + '</span>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:12px;color:var(--text-main);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(it.label || '未命名') + '</div>' +
          (it.url ? '<div style="font-size:10px;color:var(--text-weak);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(it.url) + '</div>' : '') +
        '</div>' +
        '<button class="item-list-act" data-feature-act="edit" data-idx="' + idx + '" title="编辑名称/链接" style="color:var(--accent);font-size:11px;">✎</button>' +
        '<button class="item-list-act" data-feature-act="up" data-idx="' + idx + '" title="上移" style="color:var(--accent);font-size:11px;">↑</button>' +
        '<button class="item-list-act" data-feature-act="down" data-idx="' + idx + '" title="下移" style="color:var(--accent);font-size:11px;">↓</button>' +
        '<button class="item-list-act" data-feature-act="del" data-idx="' + idx + '" title="删除" style="color:var(--color-danger,#e83b3b);font-size:11px;">✕</button>' +
      '</div>';
    }).join('');
  }

  /** 增删改后：清缓存重新拉取 + 刷新手机预览 */
  function refreshFeature() {
    featureItems = null;
    renderFeatureManager();
    if (window.Preview && Preview.invalidateFeature) Preview.invalidateFeature();
  }

  /** 功能项编辑弹窗（item=null 时为新增）：名称 / 链接 / 图片 */
  function openFeatureEditModal(item, onOk) {
    var isEdit = !!item;
    var imgHtml = '';
    if (isEdit) {
      imgHtml = item.iconUrl
        ? '<img src="' + escapeHtml(item.iconUrl) + '" style="width:40px;height:40px;border-radius:6px;object-fit:cover;border:1px solid var(--border-color,#e3e6ea);" />'
        : '<div style="width:40px;height:40px;border-radius:6px;background:#f0f2f5;display:flex;align-items:center;justify-content:center;color:#bbb;"><i class="fa fa-th"></i></div>';
    }
    var inputStyle = 'flex:1;font-size:12px;padding:5px 8px;border:1px solid var(--border-color,#e3e6ea);border-radius:4px;box-sizing:border-box;';
    var body = '<div style="display:flex;flex-direction:column;gap:8px;padding:4px 0;">' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span style="width:48px;font-size:12px;color:var(--text-secondary,#5a6472);flex-shrink:0;">名称</span>' +
        '<input type="text" id="fmName" value="' + escapeHtml(item ? (item.label || '') : '') + '" placeholder="如：会员充值" style="' + inputStyle + '" />' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span style="width:48px;font-size:12px;color:var(--text-secondary,#5a6472);flex-shrink:0;">链接</span>' +
        '<input type="text" id="fmUrl" value="' + escapeHtml(item ? (item.url || '') : '') + '" placeholder="可空，点击功能项跳转的链接" style="' + inputStyle + '" />' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span style="width:48px;font-size:12px;color:var(--text-secondary,#5a6472);flex-shrink:0;">图片</span>' +
        '<span id="fmImgWrap" style="display:flex;">' + (isEdit ? imgHtml : '<span style="font-size:11px;color:#999;">未设置</span>') + '</span>' +
        '<input type="file" id="fmFile" accept="image/*" style="flex:1;font-size:11px;" />' +
      '</div>' +
      '</div>';

    openModal(isEdit ? '编辑功能项' : '添加功能项', body,
      '<button class="btn btn-ghost" id="fmCancel">取消</button>' +
      '<button class="btn btn-primary" id="fmOk">保存</button>');

    document.getElementById('fmCancel').addEventListener('click', closeModal);
    document.getElementById('fmOk').addEventListener('click', function () {
      var name = String(document.getElementById('fmName').value || '').trim();
      if (!name) {
        showToast('请填写功能项名称', 'error');
        return;
      }
      var file = document.getElementById('fmFile').files[0] || null;
      var data = {
        name: name,
        url: String(document.getElementById('fmUrl').value || '').trim(),
        file: file
      };
      closeModal();
      onOk(data);
    });
  }



  // ==================== 弹窗 / 提示 ====================

  function openModal(title, bodyHtml, footerHtml) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHtml;
    document.getElementById('modalFooter').innerHTML = footerHtml || '';
    document.getElementById('modalMask').style.display = 'flex';
  }

  function closeModal() {
    document.getElementById('modalMask').style.display = 'none';
  }

  function confirmModal(title, message, onOk) {
    openModal(title,
      '<p style="font-size:13px;color:var(--text-secondary);line-height:1.7;">' + message + '</p>',
      '<button class="btn btn-ghost" id="confirmCancel">取消</button>' +
      '<button class="btn btn-primary" id="confirmOk" style="background:var(--danger-color);">确定删除</button>');
    document.getElementById('confirmCancel').addEventListener('click', closeModal);
    document.getElementById('confirmOk').addEventListener('click', function () {
      closeModal();
      onOk();
    });
  }

  function shortId(id) {
    id = String(id || '');
    return id.length > 20 ? id.slice(0, 8) + '...' + id.slice(-6) : id;
  }

  /** mode=2 悬浮窗子项可视化编辑弹窗：名称 / 跳转 / 样式（2026-09-11） */
  function openSheetItemModal(item, onOk) {
    var st = (item.style && typeof item.style === 'object' && !Array.isArray(item.style)) ? item.style : {};
    var bg = st.bgColor || '', tc = st.textColor || '', br = st.borderRadius || '';

    function row(label, ctrlHtml) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;">' +
        '<span style="width:72px;font-size:12px;color:var(--text-secondary,#5a6472);flex-shrink:0;">' + label + '</span>' + ctrlHtml + '</div>';
    }
    function colorPair(id, label, val) {
      return row(label,
        '<input type="color" id="' + id + '" value="' + escapeHtml(val || '#000000') + '" style="width:32px;height:26px;padding:0;border:1px solid var(--border-color,#e3e6ea);border-radius:4px;background:#fff;cursor:pointer;flex-shrink:0;' + (val ? '' : 'opacity:.35;') + '" />' +
        '<input type="text" id="' + id + 'Text" value="' + escapeHtml(val) + '" placeholder="默认" style="flex:1;font-size:12px;padding:4px 6px;border:1px solid var(--border-color,#e3e6ea);border-radius:4px;box-sizing:border-box;" />');
    }
    function textInput(id, val, placeholder) {
      return '<input type="text" id="' + id + '" value="' + escapeHtml(val) + '" placeholder="' + placeholder + '" style="flex:1;font-size:12px;padding:4px 6px;border:1px solid var(--border-color,#e3e6ea);border-radius:4px;box-sizing:border-box;" />';
    }

    var pageSel = '<select id="iePage" style="flex:1;font-size:12px;padding:4px 6px;border:1px solid var(--border-color,#e3e6ea);border-radius:4px;background:#fff;box-sizing:border-box;">' +
      '<option value="">— 请选择 —</option>' +
      Schema.pageOptions.map(function (opt) {
        return '<option value="' + opt.value + '"' + (item.page === opt.value ? ' selected' : '') + '>' + escapeHtml(opt.label) + '</option>';
      }).join('') +
      (item.page && !Schema.pageOptions.some(function (o) { return o.value === item.page; })
        ? '<option value="' + escapeHtml(item.page) + '" selected>' + escapeHtml(item.page) + '（自定义）</option>'
        : '') +
      '</select>';

    var body = '<div style="display:flex;flex-direction:column;gap:4px;padding:4px 0;">' +
      row('名称', textInput('ieName', item.name || '', '如：悬赏')) +
      row('跳转页面', pageSel) +
      row('分类 rowid', textInput('ieCategory', item.category || '', '可空，发布分类记录 rowid')) +
      '<div style="border-top:1px dashed var(--border-color,#e3e6ea);margin:6px 0 2px;"></div>' +
      '<div style="font-size:11px;color:var(--text-weak,#8a919c);padding:2px 0;">子项样式（留空走默认）</div>' +
      colorPair('ieBg', '背景色', bg) +
      colorPair('ieTc', '文字颜色', tc) +
      row('圆角 (px)', '<input type="number" id="ieBr" value="' + escapeHtml(br) + '" min="0" max="40" placeholder="默认" style="flex:1;font-size:12px;padding:4px 6px;border:1px solid var(--border-color,#e3e6ea);border-radius:4px;box-sizing:border-box;" />') +
      '</div>';

    openModal('编辑子项', body,
      '<button class="btn btn-ghost" id="ieCancel">取消</button>' +
      '<button class="btn btn-primary" id="ieOk">保存</button>');

    // color 与 text 双向同步
    ['ieBg', 'ieTc'].forEach(function (id) {
      var c = document.getElementById(id), t = document.getElementById(id + 'Text');
      if (!c || !t) return;
      c.addEventListener('input', function () { t.value = c.value; c.style.opacity = 1; });
      t.addEventListener('change', function () {
        if (t.value) { c.value = t.value; c.style.opacity = 1; }
        else { c.style.opacity = .35; }
      });
    });

    document.getElementById('ieCancel').addEventListener('click', closeModal);
    document.getElementById('ieOk').addEventListener('click', function () {
      var style = {};
      var bgV = String(document.getElementById('ieBgText').value || '').trim();
      var tcV = String(document.getElementById('ieTcText').value || '').trim();
      var brV = String(document.getElementById('ieBr').value || '').trim();
      if (bgV) style.bgColor = bgV;
      if (tcV) style.textColor = tcV;
      if (brV) style.borderRadius = brV;
      var updated = {
        name: String(document.getElementById('ieName').value || '').trim(),
        page: document.getElementById('iePage').value,
        category: String(document.getElementById('ieCategory').value || '').trim()
      };
      if (Object.keys(style).length) updated.style = style;
      closeModal();
      onOk(updated);
    });
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function showToast(msg, type) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.className = 'toast'; }, 2400);
  }

  return {
    init: init,
    render: render,
    openModal: openModal,
    closeModal: closeModal,
    confirmModal: confirmModal,
    showToast: showToast,
    escapeHtml: escapeHtml
  };
})();
