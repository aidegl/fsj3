/**
 * 发布页面（Vditor 所见即所得 Markdown 编辑器版）
 * - 正文：Vditor mode:'ir'（即时渲染，有道云体验），输出纯 md 存 wznr
 * - 图片：Vditor upload handler → 临时上传 → tupian 表(HAP 抓取永久) → insertValue
 * - v2.2.4：替换 textarea+预览+自定义工具栏 为 Vditor
 */
var PublishPage = (function () {
  'use strict';

  // ===== tupian 独立图片应用凭证（前端可暴露：独立应用，只管图片） =====
  var TUPIAN_APPKEY = 'a0bb1f23bc1216bc';
  var TUPIAN_SIGN = 'ZmY4YjEyMzdmMDg0OGYxNTRiNDUyOGY2ZDc4MjE4OWFkNDg1ZTA2N2I4ZWM2YjIxZTEyZWM1M2E3NDg0NmY5YQ==';
  var TUPIAN_WS = '688f41562d5f8be36b258033';

  var vditor = null;
  var coverInput = null;
  var coverGrid = null;
  var coverAddBtn = null;
  var titleInput = null;
  var summaryInput = null;
  var submitBtn = null;
  var coverFiles = [];
  var uploadingCount = 0;
  // 分类选择状态
  var selectedCategory = '';
  var categoryOptions = [];

  function init(options) {
    options = options || {};
    coverInput = document.getElementById('publish-cover-input');
    coverGrid = document.getElementById('publish-cover-grid');
    coverAddBtn = document.getElementById('publish-cover-add');
    titleInput = document.getElementById('publish-title-input');
    summaryInput = document.getElementById('publish-summary-input');
    submitBtn = document.getElementById('publish-submit-btn');

    loadCategories(options.category);
    bindEvents();
    bindCoverGridClick();
    initVditor();
    bindBackBtn();
  }

  // ========== 分类选择 ==========

  // 从商家首页配置(content_list.category_filter)读取分类选项
  // 默认选中：options.category > window.location 的 ?category 参数 > 第一项
  function loadCategories(defaultRowid) {
    // 兼容：从 URL ?category=<rowid> 取默认选中值
    if (!defaultRowid) {
      try {
        var params = (window.location.search || '').substring(1).split('&');
        for (var i = 0; i < params.length; i++) {
          var kv = params[i].split('=');
          if (kv[0] === 'category') defaultRowid = decodeURIComponent(kv[1] || '');
        }
      } catch (e) {}
    }

    categoryOptions = [];
    try {
      var tabs = JSON.parse(localStorage.getItem('fsj_shangjia_tabs') || '[]');
      for (var t = 0; t < tabs.length; t++) {
        var cfg = tabs[t].url;
        if (!cfg || !cfg.home_sections) continue;
        for (var s = 0; s < cfg.home_sections.length; s++) {
          var sec = cfg.home_sections[s];
          if (sec.type !== 'content_list' || !sec.config || !Array.isArray(sec.config.category_filter)) continue;
          sec.config.category_filter.forEach(function (cat) {
            if (cat && cat.rowid) {
              categoryOptions.push({ name: cat.name, rowid: cat.rowid, sort: parseInt(cat.sort, 10) || 0 });
            }
          });
        }
      }
    } catch (e) {}
    categoryOptions.sort(function (a, b) { return a.sort - b.sort; });

    var field = document.getElementById('publish-category-field');
    var list = document.getElementById('publish-category-list');
    if (!field || !list) return;

    // 无分类配置：隐藏字段，不选分类（提交时也不会写 spfl）
    if (categoryOptions.length === 0) {
      field.style.display = 'none';
      selectedCategory = '';
      return;
    }

    // 默认选中：传入值有效则用，否则回退到第一项
    selectedCategory = categoryOptions.some(function (c) { return c.rowid === defaultRowid; })
      ? defaultRowid
      : categoryOptions[0].rowid;

    field.style.display = '';
    list.innerHTML = categoryOptions.map(function (c) {
      var cls = c.rowid === selectedCategory ? 'publish-category-chip active' : 'publish-category-chip';
      return '<span class="' + cls + '" data-rowid="' + c.rowid + '">' + c.name + '</span>';
    }).join('');

    Array.prototype.forEach.call(list.querySelectorAll('.publish-category-chip'), function (chip) {
      chip.addEventListener('click', function () {
        selectedCategory = chip.getAttribute('data-rowid');
        Array.prototype.forEach.call(list.querySelectorAll('.publish-category-chip'), function (el) {
          el.classList.toggle('active', el.getAttribute('data-rowid') === selectedCategory);
        });
      });
    });

    console.log('[PublishPage] 分类选项数:', categoryOptions.length, '默认选中:', selectedCategory);
  }

  // ========== Vditor 所见即所得编辑器 ==========

  function initVditor() {
    if (typeof Vditor === 'undefined') {
      console.error('[PublishPage] Vditor 未加载，回退到 textarea');
      fallbackTextarea();
      return;
    }
    vditor = new Vditor('vditor', {
      mode: 'ir',
      height: 420,
      lang: 'zh_CN',
      placeholder: '开始写作…（输入 # 变标题、**加粗**、- 列表）',
      cache: { enable: false },
      counter: { enable: true, type: 'markdown', max: 2000 },
      toolbar: [
        'headings', 'bold', 'italic', 'strike', '|',
        'list', 'ordered-list', 'quote', '|',
        'code', 'link', 'table', '|',
        'upload', '|',
        'undo', 'redo', '|',
        'edit-mode', 'fullscreen'
      ],
      upload: {
        accept: 'image/*',
        multiple: true,
        handler: function (files) {
          Array.prototype.forEach.call(files, function (file) {
            handleInlineImage(file);
          });
          return null; // 阻止 Vditor 默认上传，走我们的 HAP 链路
        }
      },
      preview: {
        delay: 300,
        math: { engine: 'KaTeX' }
      },
      hint: {
        emoji: { '+1': '👍', '-1': '👎', 'heart': '❤️' }
      }
    });
  }

  /** Vditor 加载失败时回退为普通 textarea（保底） */
  function fallbackTextarea() {
    var container = document.getElementById('vditor');
    if (!container) return;
    container.innerHTML = '<textarea id="publish-content-fallback" class="publish-textarea" rows="12" placeholder="支持 Markdown"></textarea>';
  }

  /** 获取正文 md（Vditor 或 fallback textarea） */
  function getContent() {
    if (vditor) return vditor.getValue() || '';
    var fb = document.getElementById('publish-content-fallback');
    return fb ? fb.value : '';
  }

  /** 清空正文 */
  function clearContent() {
    if (vditor) { vditor.setValue(''); return; }
    var fb = document.getElementById('publish-content-fallback');
    if (fb) fb.value = '';
  }

  // ========== 正文图片：临时 URL → HAP 抓取 → md 永久链接 ==========

  function handleInlineImage(file) {
    if (!file || file.type.indexOf('image/') !== 0) return;
    uploadingCount++;
    if (vditor) vditor.tip('图片上传中…', 0);

    uploadImageToHap(file).then(function (permUrl) {
      var md = '\n![' + (file.name || '图片') + '](' + permUrl + ')\n';
      if (vditor) {
        vditor.insertValue(md);
      } else {
        var fb = document.getElementById('publish-content-fallback');
        if (fb) fb.value += md;
      }
    }).catch(function (err) {
      console.error('[PublishPage] 图片上传失败:', err);
      if (vditor) vditor.tip('图片上传失败: ' + err.message, -1);
      else alert('图片上传失败: ' + (err.message || err));
    }).finally(function () {
      uploadingCount--;
      if (uploadingCount <= 0 && vditor) vditor.tip('', 0);
    });
  }

  function uploadImageToHap(file) {
    if (!window.FsjApi || !FsjApi.uploadImageToTemp) {
      return Promise.reject(new Error('FsjApi.uploadImageToTemp 不可用'));
    }
    return FsjApi.uploadImageToTemp(file).then(function (temp) {
      return fetch('https://api.mingdao.com/v2/open/worksheet/addRow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appKey: TUPIAN_APPKEY,
          sign: TUPIAN_SIGN,
          worksheetId: TUPIAN_WS,
          triggerWorkflow: false,
          getSystemControl: 'false',
          controls: [
            { controlId: 'title', value: file.name || '正文图片' },
            { controlId: 'fujian', value: temp.url }
          ]
        })
      }).then(function (r) { return r.json(); });
    }).then(function (add) {
      if (!add.success) throw new Error('tupian addRow 失败: ' + (add.error_msg || ''));
      return pollDownloadUrl(add.data, 12, 500);
    });
  }

  function pollDownloadUrl(rowid, retries, interval) {
    return fetch('https://api.mingdao.com/v3/app/worksheets/' + TUPIAN_WS + '/rows/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'HAP-Appkey': TUPIAN_APPKEY, 'HAP-Sign': TUPIAN_SIGN },
      body: JSON.stringify({
        pageSize: 1, pageIndex: 1,
        fields: ['fujian'],
        filter: { type: 'group', logic: 'AND', children: [ { type: 'condition', field: 'rowid', operator: 'eq', value: rowid } ] }
      })
    }).then(function (r) { return r.json(); }).then(function (q) {
      var att = q.data && q.data.rows && q.data.rows[0] && q.data.rows[0].fujian;
      if (Array.isArray(att) && att[0] && att[0].downloadUrl) return att[0].downloadUrl;
      if (retries > 0) {
        return new Promise(function (res) { setTimeout(res, interval); })
          .then(function () { return pollDownloadUrl(rowid, retries - 1, interval); });
      }
      throw new Error('HAP 抓取超时');
    });
  }

  // ========== 封面图（保留原逻辑） ==========

  function bindEvents() {
    if (coverAddBtn && coverInput) {
      var lastClickTime = 0;
      coverAddBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var now = Date.now();
        if (now - lastClickTime < 500) return;
        lastClickTime = now;
        coverInput.click();
      });
    }

    if (coverInput) {
      var lastChangeTime = 0;
      coverInput.addEventListener('change', function (e) {
        var now = Date.now();
        if (now - lastChangeTime < 1000 || !e.target.files.length) return;
        lastChangeTime = now;
        var files = Array.prototype.slice.call(e.target.files);
        files.forEach(function (file) {
          if (file.type.indexOf('image/') === 0) addCoverFile(file);
        });
        setTimeout(function () { coverInput.value = ''; }, 0);
      });
    }

    var xuanshangInput = document.getElementById('publish-xuanshang-input');
    var xuanshangAmount = document.getElementById('publish-xuanshang-amount');
    var xuanshangUnit = document.querySelector('.publish-amount-unit');
    if (xuanshangInput && xuanshangAmount) {
      xuanshangInput.addEventListener('change', function () {
        var show = xuanshangInput.checked;
        xuanshangAmount.style.display = show ? '' : 'none';
        if (xuanshangUnit) xuanshangUnit.style.display = show ? '' : 'none';
        if (!show) xuanshangAmount.value = '';
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', function () { handleSubmit(); });
    }
  }

  function addCoverFile(file) {
    var item = { file: file, url: '', localPreview: '', id: Date.now() + '_' + Math.random() };
    var idx = coverFiles.length;
    coverFiles.push(item);
    var reader = new FileReader();
    reader.onload = function (e) {
      item.localPreview = e.target.result;
      renderCoverItem(idx);
    };
    reader.readAsDataURL(file);
    FsjApi.uploadImageToTemp(file).then(function (result) {
      item.url = result.url;
    }).catch(function (err) {
      console.error('[PublishPage] 封面上传失败:', err);
    });
  }

  function renderCoverItem(idx) {
    var item = coverFiles[idx];
    if (!item) return;
    var el = document.createElement('div');
    el.className = 'publish-cover-item';
    el.dataset.index = idx;
    el.innerHTML = '<img src="' + (item.localPreview || item.url) + '" alt="" />' +
      '<span class="publish-cover-item-remove" data-index="' + idx + '">×</span>';
    var existing = coverGrid.querySelector('.publish-cover-item[data-index="' + idx + '"]');
    if (existing) coverGrid.replaceChild(el, existing);
    else coverGrid.insertBefore(el, coverAddBtn);
  }

  function bindCoverGridClick() {
    if (!coverGrid) return;
    coverGrid.addEventListener('click', function (e) {
      var removeBtn = e.target.closest('.publish-cover-item-remove');
      if (removeBtn) {
        e.stopPropagation();
        var idx = parseInt(removeBtn.getAttribute('data-index'), 10);
        removeCoverFile(idx);
        return;
      }
      var itemEl = e.target.closest('.publish-cover-item');
      if (itemEl) {
        var i = parseInt(itemEl.getAttribute('data-index'), 10);
        var it = coverFiles[i];
        if (it && it.url) showCoverPreview(it.url);
      }
    });
  }

  function removeCoverFile(idx) {
    coverFiles.splice(idx, 1);
    renderCoverGrid();
  }

  function renderCoverGrid() {
    coverGrid.querySelectorAll('.publish-cover-item').forEach(function (el) { el.remove(); });
    coverFiles.forEach(function (item, i) { renderCoverItem(i); });
  }

  function showCoverPreview(imgUrl) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:9999;';
    overlay.innerHTML = '<img src="' + imgUrl + '" style="max-width:92%;max-height:88%;object-fit:contain;" />';
    overlay.addEventListener('click', function () { document.body.removeChild(overlay); });
    document.body.appendChild(overlay);
  }

  function resetCover() {
    coverFiles = [];
    renderCoverGrid();
  }

  // ========== 提交（wznr = Markdown） ==========

  function handleSubmit() {
    var openid = localStorage.getItem('fsj_openid') || '';
    if (!openid) {
      alert('请先登录后再发布');
      if (window.App) App.switchPage('profile');
      return;
    }

    var title = (titleInput.value || '').trim();
    var summary = (summaryInput.value || '').trim();
    var content = getContent().trim();  // Vditor 或 fallback textarea

    if (!title) { alert('请输入文章标题'); return; }
    if (!content) { alert('请输入文章内容'); return; }

    if (uploadingCount > 0) { alert('正文图片还在上传，请稍候'); return; }
    var pendingUploads = coverFiles.filter(function (f) { return !f.url && f.file; });
    if (pendingUploads.length > 0) { alert('封面图片正在上传，请稍候'); return; }

    var duorenInput = document.getElementById('publish-duoren-input');
    var xuanshangInput = document.getElementById('publish-xuanshang-input');
    var xuanshangAmount = document.getElementById('publish-xuanshang-amount');
    var duoren = duorenInput && duorenInput.checked ? '1' : '';
    var coverUrls = coverFiles.filter(function (f) { return f.url; }).map(function (f) { return f.url; });

    submitBtn.disabled = true;
    submitBtn.textContent = '发布中...';

    var userRowid = '';
    try {
      var info = JSON.parse(localStorage.getItem('fsj_user_info') || '{}');
      userRowid = info.id || '';
    } catch (e) {}

    var shangjiaRowid = FsjApi.getShangjiaRowid ? FsjApi.getShangjiaRowid() : '';

    var controls = [
      { controlId: 'title', value: title },
      { controlId: 'mdnr', value: summary || '' },
      { controlId: 'kind', value: '文章' },
      { controlId: 'dimension', value: '2想法', valueType: 2 },
      { controlId: 'content', value: content },
      { controlId: 'attachments', value: coverUrls.join(',') },
      { controlId: 'publisher', value: userRowid, valueType: 2 },
      { controlId: 'is_published', value: '1', valueType: 2 },
      { controlId: 'audit_status', value: '待审核' }
    ];
    if (duoren) controls.push({ controlId: 'is_multi_participant', value: duoren, valueType: 2 });
    if (shangjiaRowid) {
      controls.push({ controlId: 'org', value: shangjiaRowid, valueType: 2 });
    }
    if (selectedCategory) {
      controls.push({ controlId: 'category', value: selectedCategory, valueType: 2 });
    }

    FsjApi.callMingdaoAPI('https://api.mingdao.com/v2/open/worksheet/addRow', {
      worksheetId: '6a03ceaa7e29abcb297cbdfc',
      triggerWorkflow: true,
      getSystemControl: 'false',
      controls: controls
    }).then(function (result) {
      console.log('[PublishPage] 发布成功:', result);
      alert('发布成功！内容已进入待审核状态。');

      titleInput.value = '';
      summaryInput.value = '';
      clearContent();
      resetCover();

      if (duorenInput) duorenInput.checked = false;
      if (xuanshangInput) xuanshangInput.checked = false;
      if (xuanshangAmount) xuanshangAmount.value = '';

      if (window.App) {
        setTimeout(function () { App.switchPage('profile'); }, 500);
      }
    }).catch(function (err) {
      console.error('[PublishPage] 发布失败:', err);
      alert('发布失败: ' + err.message);
    }).finally(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = '发布';
    });
  }

  function bindBackBtn() {
    var backBtn = document.getElementById('publish-back-btn');
    if (backBtn && !backBtn.__bound) {
      backBtn.__bound = true;
      backBtn.addEventListener('click', function () {
        if (window.App && App.switchPage) App.switchPage('profile');
      });
    }
  }

  return { init: init };
})();