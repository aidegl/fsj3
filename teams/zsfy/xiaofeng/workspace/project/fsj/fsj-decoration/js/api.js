/**
 * fsj-decoration API 层
 * 经 Node 代理（mingdao-proxy）调用明道云 HAP（appKey/sign 不暴露）
 * 与 webview-spa2.0 的 fsj-api.js 保持同一通道、同一数据结构
 * 2026-09-04 从 Dify 迁移至 Node 代理（详见 api/通用API接口文档-Node版.md）
 */
var DecorationApi = (function () {
  'use strict';

  var MINGDAO_PROXY = 'https://100000whys.cn/mingdao';

  var MINGDAO_API = 'https://api.mingdao.com/v2/open/worksheet/getFilterRows';
  var MINGDAO_GET_ROW_API = 'https://api.mingdao.com/v2/open/worksheet/getRowByIdPost';
  var MINGDAO_EDIT_ROW_API = 'https://api.mingdao.com/v2/open/worksheet/editRow';
  var MINGDAO_ADD_API = 'https://api.mingdao.com/v2/open/worksheet/addRow';
  var MINGDAO_DELETE_API = 'https://api.mingdao.com/v2/open/worksheet/deleteRow';
  // 临时文件上传（HAP 会自动从 URL 下载并注册为附件）
  var TEMP_UPLOAD_URL = 'https://100000whys.cn/api/v1/temp/upload';

  // 组织/商家表（leixing 区分：商家 / 组织 / 部分可见 ...）
  var ORG_WORKSHEET_ID = '69f549c69f1956fc0e171aa6';
  // 内容表（商品/文章/积分商品，leixing 区分）
  var CONTENT_WORKSHEET_ID = 'shangpin';
  // 功能表
  var FEATURE_WORKSHEET_ID = 'gongnengbiao';
  // shangpin 表内"商品分类"关联字段（content_list.category_filter 的 rowid 指向它）
  var CONTENT_CATEGORY_FIELD = '6a0521f9104f63109c08d466';
  // 关键词表（三维度分类导航：关键词维度来源）
  var KEYWORD_WORKSHEET_ID = '69e04b28924f17c90a970f3d';

  /**
   * Node 代理调用（mingdao-proxy）
   * @param {string} url - 明道云 open API 地址
   * @param {Object} body - 明道云请求体（不含 appKey/sign，服务端注入）
   * @returns {Promise<Object>} 明道云原始返回数据（无包裹，无需二次解析）
   */
  function callMingdaoAPI(url, body) {
    return fetch(MINGDAO_PROXY, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url: url, input: body })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('网络请求失败: ' + res.status);
        return res.json();
      });
  }

  /** 解析明道云附件字段为图片 URL */
  function parseImage(f) {
    if (!f) return '';
    if (typeof f === 'string') {
      try {
        var p = JSON.parse(f);
        if (Array.isArray(p) && p.length > 0) {
          return p[0].large_thumbnail_full_path || p[0].thumbnail_full_path || '';
        }
      } catch (e) { /* 非JSON字符串原样返回 */ }
      if (f.indexOf('http') === 0) return f;
      return '';
    }
    if (Array.isArray(f) && f.length > 0) {
      return f[0].large_thumbnail_full_path || f[0].thumbnail_full_path || '';
    }
    return '';
  }

  // ==================== 商家（组织表） ====================

  /**
   * 按 mrowid 字段值查询商家记录（装修页 URL ?mRowid= 的定位方式）
   * @returns {Promise<Object|null>} 商家记录（含 rowid），未找到返回 null
   */
  function getMerchantByMrowid(mrowid) {
    var body = {
      worksheetId: ORG_WORKSHEET_ID,
      pageSize: 1,
      pageIndex: 1,
      listType: 0,
      controls: [],
      filters: [
        { controlId: 'mrowid', dataType: 2, spliceType: 1, filterType: 1, value: mrowid }
      ]
    };
    return callMingdaoAPI(MINGDAO_API, body).then(function (res) {
      var rows = (res.data && res.data.rows) || [];
      return rows.length > 0 ? rows[0] : null;
    });
  }

  /** 按记录 rowid 直接取商家记录 */
  function getMerchantByRowid(rowid) {
    var body = {
      worksheetId: ORG_WORKSHEET_ID,
      rowId: rowid,
      getSystemControl: 'false'
    };
    return callMingdaoAPI(MINGDAO_GET_ROW_API, body).then(function (res) {
      return res.success && res.data ? res.data : null;
    });
  }

  /** 列出所有商家（leixing=商家），供无参数时选择进入 */
  function getMerchantList() {
    var body = {
      worksheetId: ORG_WORKSHEET_ID,
      pageSize: 100,
      pageIndex: 1,
      listType: 0,
      controls: ['rowid', 'mingcheng', 'mrowid', 'leixing', 'color'],
      filters: [
        { controlId: 'leixing', dataType: 1, spliceType: 1, filterType: 1, value: '商家' }
      ]
    };
    return callMingdaoAPI(MINGDAO_API, body).then(function (res) {
      return (res.data && res.data.rows) || [];
    });
  }

  /**
   * 保存商家装修配置（editRow 更新 dbdhl / wode / color 字段）
   * @param {string} merchantRowid - 商家记录 rowid
   * @param {Object} cfg - { dbdhl, wode, color } 均为序列化后的字符串
   */
  function saveMerchantConfig(merchantRowid, cfg) {
    var controls = [];
    if (cfg.dbdhl !== undefined) controls.push({ controlId: 'dbdhl', value: cfg.dbdhl });
    if (cfg.wode !== undefined) controls.push({ controlId: 'wode', value: cfg.wode });
    if (cfg.color !== undefined) controls.push({ controlId: 'color', value: cfg.color });

    var body = {
      worksheetId: ORG_WORKSHEET_ID,
      rowId: merchantRowid,
      controls: controls,
      getSystemControl: 'false'
    };
    console.log('[保存调试] saveMerchantConfig 请求体:', JSON.stringify(body, null, 2));
    return callMingdaoAPI(MINGDAO_EDIT_ROW_API, body).then(function (res) {
      if (!res.success) throw new Error(res.error_msg || res.error || '保存失败');
      return res;
    });
  }

  // ==================== 内容表（shangpin） ====================

  /**
   * 查询当前商家的内容列表（banner 选择器 / content_list 预览共用）
   * @param {Object} [opts] - { leixing, categoryRowid, pageIndex, pageSize, keyword }
   */
  function getContentList(opts) {
    opts = opts || {};
    var merchantRowid = window._decoMerchantRowid || '';
    var filters = [];
    if (merchantRowid) {
      filters.push({ controlId: 'shangjia2', dataType: 29, spliceType: 1, filterType: 24, value: merchantRowid });
    }
    if (opts.leixing) {
      filters.push({ controlId: 'leixing', dataType: 1, spliceType: 1, filterType: 1, value: opts.leixing });
    }
    if (opts.categoryRowid) {
      filters.push({ controlId: CONTENT_CATEGORY_FIELD, dataType: 29, spliceType: 1, filterType: 24, value: opts.categoryRowid });
    }
    if (opts.keyword) {
      filters.push({ controlId: 'mingcheng', dataType: 1, spliceType: 1, filterType: 3, value: opts.keyword });
    }
    var body = {
      worksheetId: CONTENT_WORKSHEET_ID,
      viewId: '',
      pageSize: opts.pageSize || 20,
      pageIndex: opts.pageIndex || 1,
      listType: 0,
      controls: ['mingcheng', 'zhutu', 'leixing', 'ctime', 'shoujia'],
      filters: filters
    };
    return callMingdaoAPI(MINGDAO_API, body).then(function (res) {
      var rows = (res.data && res.data.rows) || [];
      return {
        total: (res.data && res.data.total) || 0,
        rows: rows.map(function (row) {
          return {
            rowid: row.rowid || '',
            mingcheng: row.mingcheng || '',
            zhutu: parseImage(row.zhutu),
            leixing: row.leixing || '',
            ctime: row.ctime || ''
          };
        })
      };
    });
  }

  /**
   * 按 rowid 数组批量取内容（banner_swiper 预览渲染）
   * 与 spa2.0 一致：逐条 getRowByIdPost 并行查询
   */
  function getContentByRowids(rowids) {
    if (!rowids || rowids.length === 0) return Promise.resolve([]);
    var promises = rowids.map(function (rid) {
      return callMingdaoAPI(MINGDAO_GET_ROW_API, {
        worksheetId: CONTENT_WORKSHEET_ID,
        rowId: rid,
        getSystemControl: 'false'
      }).then(function (res) {
        if (res.success && res.data) {
          return {
            rowid: res.data.rowid || rid,
            mingcheng: res.data.mingcheng || '',
            zhutu: parseImage(res.data.zhutu),
            leixing: res.data.leixing || ''
          };
        }
        return null;
      }).catch(function () { return null; });
    });
    return Promise.all(promises).then(function (list) {
      return list.filter(function (r) { return r; });
    });
  }

  // ==================== 功能表（gongnengbiao 6a235480b8345eda5d03ce50） ====================

  // 「排序」数字字段 controlId（2026-09-11 新增，用于功能项排序）
  var FEATURE_SORT_CONTROL = '6aa3f2d85c076794825c6c5e';

  /** 查询当前商家的功能列表（feature_list 预览渲染 + 右栏管理器共用），按排序字段升序 */
  function getFeatureList() {
    var merchantRowid = window._decoMerchantRowid || '';
    if (!merchantRowid) return Promise.resolve([]);
    var body = {
      worksheetId: FEATURE_WORKSHEET_ID,
      viewId: '',
      pageSize: 50,
      pageIndex: 1,
      listType: 1,
      controls: ['rowid', 'mingcheng', 'icon', 'url', FEATURE_SORT_CONTROL],
      filters: [
        { controlId: 'shangjia', dataType: 29, spliceType: 1, filterType: 24, value: merchantRowid }
      ],
      sortId: FEATURE_SORT_CONTROL,
      isAsc: true
    };
    return callMingdaoAPI(MINGDAO_API, body).then(function (res) {
      if (!res.success || !res.data || !res.data.rows) return [];
      return res.data.rows.map(function (row) {
        return {
          rowid: row.rowid || '',
          label: row.mingcheng || '',
          iconUrl: parseImage(row.icon),
          url: row.url || ''
        };
      });
    });
  }

  /** 临时文件上传 → 返回 { url, filename }（icon 换图用，HAP 自动下载注册为附件） */
  function uploadTempFile(file) {
    var formData = new FormData();
    formData.append('file', file);
    return fetch(TEMP_UPLOAD_URL, { method: 'POST', body: formData })
      .then(function (res) {
        if (!res.ok) throw new Error('上传失败: ' + res.status);
        return res.json();
      })
      .then(function (result) {
        if (result.code === 200) {
          return { url: 'https://100000whys.cn' + result.data.url, filename: result.data.filename };
        }
        throw new Error(result.message || '上传失败');
      });
  }

  /** 新增功能项（icon 传临时文件 URL，可空） */
  function addFeatureItem(name, url, iconUrl) {
    var merchantRowid = window._decoMerchantRowid || '';
    if (!merchantRowid) return Promise.reject(new Error('商家未加载'));
    var controls = [
      { controlId: 'mingcheng', value: name || '' },
      { controlId: 'shangjia', value: merchantRowid }
    ];
    if (url) controls.push({ controlId: 'url', value: url });
    if (iconUrl) controls.push({ controlId: 'icon', value: iconUrl });
    return callMingdaoAPI(MINGDAO_ADD_API, {
      worksheetId: FEATURE_WORKSHEET_ID,
      controls: controls,
      getSystemControl: 'false'
    }).then(function (res) {
      if (!res.success) throw new Error(res.error_msg || res.error || '新增失败');
      return res.data;
    });
  }

  /** 修改功能项（fields: { name?, url?, iconUrl? }，只传要改的） */
  function editFeatureItem(rowid, fields) {
    var controls = [];
    if (fields.name !== undefined) controls.push({ controlId: 'mingcheng', value: fields.name });
    if (fields.url !== undefined) controls.push({ controlId: 'url', value: fields.url });
    if (fields.iconUrl !== undefined) controls.push({ controlId: 'icon', value: fields.iconUrl });
    if (controls.length === 0) return Promise.resolve();
    return callMingdaoAPI(MINGDAO_EDIT_ROW_API, {
      worksheetId: FEATURE_WORKSHEET_ID,
      rowId: rowid,
      controls: controls,
      getSystemControl: 'false'
    }).then(function (res) {
      if (!res.success) throw new Error(res.error_msg || res.error || '修改失败');
      return res;
    });
  }

  /** 删除功能项（代理白名单只放行单数 deleteRow，一次一条） */
  function deleteFeatureItem(rowid) {
    return callMingdaoAPI(MINGDAO_DELETE_API, {
      worksheetId: FEATURE_WORKSHEET_ID,
      rowId: rowid,
      triggerWorkflow: false,
      thoroughDelete: 'false'
    }).then(function (res) {
      if (!res.success) throw new Error(res.error_msg || res.error || '删除失败');
      return res;
    });
  }

  /** 重排序：给每个 rowid 写入 0..n-1 的排序值（并行 editRow） */
  function resortFeatureItems(rowids) {
    var promises = rowids.map(function (rid, idx) {
      return callMingdaoAPI(MINGDAO_EDIT_ROW_API, {
        worksheetId: FEATURE_WORKSHEET_ID,
        rowId: rid,
        controls: [{ controlId: FEATURE_SORT_CONTROL, value: String(idx) }],
        getSystemControl: 'false'
      });
    });
    return Promise.all(promises).then(function (results) {
      results.forEach(function (res) {
        if (res && !res.success) throw new Error(res.error_msg || res.error || '排序保存失败');
      });
      return results;
    });
  }

  return {
    parseImage: parseImage,
    getMerchantByMrowid: getMerchantByMrowid,
    getMerchantByRowid: getMerchantByRowid,
    getMerchantList: getMerchantList,
    saveMerchantConfig: saveMerchantConfig,
    getContentList: getContentList,
    getContentByRowids: getContentByRowids,
    getFeatureList: getFeatureList,
    uploadTempFile: uploadTempFile,
    addFeatureItem: addFeatureItem,
    editFeatureItem: editFeatureItem,
    deleteFeatureItem: deleteFeatureItem,
    resortFeatureItems: resortFeatureItems,
    CONTENT_CATEGORY_FIELD: CONTENT_CATEGORY_FIELD,
    /** 搜索关键词表（三维度分类导航：关键词维度选择器数据源） */
    searchKeywords: function (query, pageSize) {
      var filters = [];
      if (query) {
        filters.push({ controlId: 'mingcheng', dataType: 1, spliceType: 1, filterType: 1, value: query });
      }
      return callMingdaoAPI(MINGDAO_API, {
        worksheetId: KEYWORD_WORKSHEET_ID,
        pageSize: pageSize || 20, pageIndex: 1, listType: 0,
        controls: ['rowid', 'mingcheng'],
        filters: filters
      }).then(function (res) {
        return ((res.success && res.data && res.data.rows) || []).map(function (r) {
          return { rowid: r.rowid, mingcheng: r.mingcheng || '' };
        });
      });
    },
  };
})();
