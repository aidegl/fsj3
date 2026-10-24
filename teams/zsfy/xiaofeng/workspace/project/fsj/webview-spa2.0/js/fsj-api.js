/**
 * fsj 商品数据 API - 通过 Node 代理调用明道云
 * 替代之前的 Dify 通用工作流代理（Dify 每次调用写库导致 Postgres 资源耗尽）
 */
var FsjApi = (function () {
  'use strict';

  // Node 轻量代理（mingdao-proxy）：服务端注入密钥，响应直接是明道云 JSON，无需二次解析
  var MINGDAO_PROXY_URL = 'https://100000whys.cn/mingdao';
  // 请求/响应日志开关：默认静默；URL 带 ?debug=1 或 localStorage.fsj_api_debug=1 时开启
  var MINGDAO_DEBUG = window.location.search.indexOf('debug=1') > -1 ||
                      (function () { try { return localStorage.getItem('fsj_api_debug') === '1'; } catch (e) { return false; } })();
  var TEMP_UPLOAD_URL = 'https://100000whys.cn/api/v1/temp/upload';
  var MINGDAO_API = 'https://api.mingdao.com/v2/open/worksheet/getFilterRows';
  var MINGDAO_ADD_API = 'https://api.mingdao.com/v2/open/worksheet/addRow';
  var MINGDAO_GET_ROW_API = 'https://api.mingdao.com/v2/open/worksheet/getRowByIdPost';
  var MINGDAO_DELETE_API = 'https://api.mingdao.com/v2/open/worksheet/deleteRows';

  var WORKSHEET_ID = '6a03ceaa7e29abcb297cbdfc';
  var USER_WORKSHEET_ID = '69b0077358322d512e60bad0';
  var ORG_WORKSHEET_ID = '69f549c69f1956fc0e171aa6'; // 组织/商家表（leixing 区分）
  var VIEW_ID = '';

  var _shangjiaRowid = '';

  var CATEGORY_ROWID_MAP = {
    '': '',
    '饮品': '3f944d84-ebfe-4b7f-ad2e-7d8a1670e5a8',
    '零食': 'ce5b3049-a06f-4a1e-ad05-edea9fcf1a98',
    '主食': '551eea77-e923-4490-80b1-58672ec1adad',
    '日用品': '71b143d5-cab2-459d-b3fd-1d2bca40e792'
  };

  function getShangjiaRowid() {
    if (_shangjiaRowid) return _shangjiaRowid;
    var params = window.location.search.substring(1);
    var parts = params.split('&');
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split('=');
      if (kv[0] === 'shangjia') {
        _shangjiaRowid = decodeURIComponent(kv[1] || '');
        return _shangjiaRowid;
      }
    }
    // 也尝试从 localStorage 获取（SPA2.0 app.js 可能已存储）
    var cached = localStorage.getItem('fsj_shangjia_rowid');
    if (cached) { _shangjiaRowid = cached; return cached; }
    return '';
  }

  function setShangjiaRowid(rowid) {
    _shangjiaRowid = rowid;
  }

  /**
   * 字段别名英文化兼容垫片（2026-10-24 HAP 内容元数据表 67 字段别名全量英文）：
   * 响应行的新英文键 → 同步补一份旧拼音派生键（旧键已存在时不覆盖），
   * 让存量代码的 row.mingcheng / row.zhutu 等读取继续工作。逐步消化后可移除本垫片。
   */
  var ALIAS_SHIM = {
    title:'mingcheng', content:'wznr', dimension:'sew', publisher:'fabuzhe', kind:'leixing',
    published_at:'fbsj', weight:'quanzhong', attachments:'zhutu', tags:'guanjianci', category:'spfl',
    org:'shangjia2', is_deleted:'shanchu', visible_org:'kjzz', audit_status:'shenhe', audit_note:'shnr',
    like_count:'dianzan', comment_count:'pinglun', view_count:'yuedu', description:'miaoshu',
    is_multi_participant:'duoren', permission_tags:'quanxian', blocked_user:'bkjyh',
    participant:'ptyh', participant_limit:'ptxz', group_expire_at:'ptrq', completed_at:'sjwcrq',
    icon:'xstb', is_completed:'wancheng', cost_price:'chengbenjia', sell_price:'shoujia',
    special_price:'tejia', is_published:'shangjia1', like_total:'dianzanshu',
    comment_total:'pinglunshu', bookmark_total:'shoucangshu', like_factor:'dzyz',
    comment_factor:'plsyz', bookmark_factor:'scsyz', home_view_total:'zyfw', home_view_factor:'zyyz',
    recent_score:'jinqizhi', composite_weight:'dianzanzhi', rating_grade:'pingfeng',
    rating_total:'zongpingfen', rating_vote_total:'pfcs', composite_rating:'zhpf',
    record:'jilubiao', at_user:'atyonghu', reply_user:'hfyh', author_avatar:'fbztx'
  };

  function shimAliasKeys(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    for (var nk in ALIAS_SHIM) {
      if (obj[nk] !== undefined && obj[ALIAS_SHIM[nk]] === undefined) obj[ALIAS_SHIM[nk]] = obj[nk];
    }
    return obj;
  }

  function shimRows(result) {
    try {
      var d = result && result.data;
      if (!d) return result;
      if (Array.isArray(d.rows)) d.rows.forEach(shimAliasKeys);
      else if (d.rows) shimAliasKeys(d.rows);
      if (d.rowid && d.controlId === undefined && typeof d === 'object' && !Array.isArray(d)) shimAliasKeys(d);
    } catch (e) { /* 垫片失败不阻塞响应 */ }
    return result;
  }

  function callMingdaoAPI(url, body) {
    if (MINGDAO_DEBUG) {
      console.log('[MingdaoAPI] 请求 URL:', url);
      console.log('[MingdaoAPI] 请求体:', JSON.stringify(body).substring(0, 500));
    }

    return fetch(MINGDAO_PROXY_URL, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url, input: body })
    })
    .then(function (res) {
      if (!res.ok) throw new Error('网络请求失败: ' + res.status + ' ' + res.statusText);
      return res.json();
    })
    .then(function (result) {
      shimRows(result);
      if (MINGDAO_DEBUG) console.log('[MingdaoAPI] 响应:', JSON.stringify(result).substring(0, 500));
      return result;
    });
  }

  function parseImage(f) {
    if (!f) return '';
    if (typeof f === 'string') { try { var p = JSON.parse(f); if (Array.isArray(p) && p.length > 0) return p[0].large_thumbnail_full_path || p[0].thumbnail_full_path || p[0].file_path + p[0].file_name || ''; } catch(e) {} }
    if (Array.isArray(f) && f.length > 0) return f[0].large_thumbnail_full_path || f[0].downloadUrl || '';
    return '';
  }

  function parseShangjia(s) {
    if (!s) return '';
    try { var l = typeof s === 'string' ? JSON.parse(s) : s; return l.length > 0 ? l[0].name : ''; } catch(e) { return ''; }
  }

  function parseCategory(c) {
    if (!c) return '';
    try { var l = typeof c === 'string' ? JSON.parse(c) : c; return l.length > 0 ? l[0].name : ''; } catch(e) { return ''; }
  }

  function mapProduct(row) {
    return {
      id: row.rowid || '', code: row.auto_number || row.zdbh || '', name: row.title || row.mingcheng || '',
      price: parseFloat(row.shoujia) || 0, boxPrice: parseFloat(row.points || row.jifen) || 0,
      imageUrl: parseImage(row.zhutu), stock: 999, limit: 999,
      shangjia: parseShangjia(row.shangjia2), category: parseCategory(row.spfl),
      weight: parseInt(row.quanzhong) || 0, description: row.miaoshu || '',
      leixing: row.leixing || '',
      // 拼团字段
      ptxz: parseInt(row.ptxz) || 0,   // 拼团限制（人数上限）
      ptyh: parseCount(row.ptyh),      // 拼团用户（已报名人数）
      ptrq: row.ptrq || ''              // 拼团截止日期
    };
  }

  function parseCount(field) {
    if (!field) return 0;
    if (Array.isArray(field)) return field.length;
    if (typeof field === 'string') {
      try { var p = JSON.parse(field); if (Array.isArray(p)) return p.length; } catch(e) {}
    }
    return 0;
  }

  function filterByShangjia(rows, rowid) {
    if (!rowid) return rows;
    return rows.filter(function (row) {
      if (!row.shangjia2) return false;
      try { var l = JSON.parse(row.shangjia2); return l.some(function(item) { return item.sid === rowid; }); } catch(e) { return false; }
    });
  }

  function filterByCategory(rows, name) {
    if (!name || !CATEGORY_ROWID_MAP.hasOwnProperty(name)) return rows;
    var rid = CATEGORY_ROWID_MAP[name];
    if (!rid) return rows;
    return rows.filter(function (row) {
      if (!row.spfl) return false;
      try { var l = JSON.parse(row.spfl); return l.some(function(item) { return item.sid === rid || item.rowid === rid; }); } catch(e) { return false; }
    });
  }

  function excludePointsProducts(rows) {
    return rows.filter(function (row) { return row.leixing !== '积分商城'; });
  }

  function filterPointsProducts(rows) {
    return rows.filter(function (row) { return row.leixing === '积分商城'; });
  }

  var _cache = { keyword: '', allRows: [], backendTotal: 0, loading: false, backendPageIndex: 0 };
  var BACKEND_PAGE_SIZE = 50;

  function clearCache() { _cache.allRows = []; _cache.backendTotal = 0; _cache.loading = false; _cache.backendPageIndex = 0; }

  function loadBackendPage(pageIndex, keyword) {
    var shangjiaRowid = getShangjiaRowid();
    var body = { worksheetId: WORKSHEET_ID, viewId: VIEW_ID, pageSize: BACKEND_PAGE_SIZE, pageIndex: pageIndex, listType: 0 };
    if (keyword) body.keyWords = keyword;
    if (shangjiaRowid) {
      body.filters = [
        { controlId: 'org', dataType: 29, spliceType: 1, filterType: 24, value: shangjiaRowid },
        { controlId: 'is_deleted', dataType: 2, spliceType: 1, filterType: 6, value: '1' }
      ];
    }
    return callMingdaoAPI(MINGDAO_API, body).then(function (res) {
      if (!res.success || !res.data.rows) { _cache.loading = false; return; }
      _cache.backendTotal = res.data.total || res.data.totalCount || 0;
      _cache.allRows = _cache.allRows.concat(res.data.rows);
      _cache.backendPageIndex = pageIndex;
      _cache.loading = false;
    });
  }

  function getProductList(pageIndex, pageSize, categoryName, keyword) {
    var shangjiaRowid = getShangjiaRowid();
    if (!shangjiaRowid) return Promise.resolve({ success: true, data: { rows: [], total: 0, totalCount: 0 } });
    if (keyword !== _cache.keyword) { clearCache(); _cache.keyword = keyword; }
    if (_cache.backendTotal > 0 && _cache.allRows.length >= _cache.backendTotal) {
      var filtered = applyFilters(_cache.allRows, shangjiaRowid, categoryName);
      var start = (pageIndex - 1) * pageSize;
      var pageRows = filtered.slice(start, start + pageSize);
      return Promise.resolve({ success: true, data: { rows: pageRows, total: filtered.length, totalCount: filtered.length } });
    }
    if (_cache.loading) return Promise.resolve({ success: true, data: { rows: [], total: 0, totalCount: 0 } });
    _cache.loading = true;
    return loadBackendPage(_cache.backendPageIndex + 1, keyword).then(function () {
      _cache.loading = false;
      var filtered = applyFilters(_cache.allRows, shangjiaRowid, categoryName);
      var filteredTotal = filtered.length;
      var loadRatio = _cache.allRows.length / _cache.backendTotal;
      var projectedTotal = Math.round(filteredTotal / loadRatio);
      var start = (pageIndex - 1) * pageSize;
      var pageRows = filtered.slice(start, start + pageSize);
      return { success: true, data: { rows: pageRows, total: projectedTotal, totalCount: projectedTotal } };
    });
  }

  function applyFilters(rows, shangjiaRowid, categoryName) {
    var result = filterByShangjia(rows, shangjiaRowid);
    result = excludePointsProducts(result);
    if (categoryName) result = filterByCategory(result, categoryName);
    return result;
  }

  function getPointsProductList(pageIndex, pageSize, keyword) {
    var shangjiaRowid = getShangjiaRowid();
    if (!shangjiaRowid) return Promise.resolve({ success: true, data: { rows: [], total: 0, totalCount: 0 } });
    if (keyword !== _cache.keyword) { clearCache(); _cache.keyword = keyword; }
    if (_cache.backendTotal > 0 && _cache.allRows.length >= _cache.backendTotal) {
      var filtered = filterPointsProducts(_cache.allRows);
      if (keyword) { var kw = keyword; filtered = filtered.filter(function(r) { var nm = r.title || r.mingcheng; return nm && nm.indexOf(kw) !== -1; }); }
      var start = (pageIndex - 1) * pageSize;
      var pageRows = filtered.slice(start, start + pageSize);
      return Promise.resolve({ success: true, data: { rows: pageRows, total: filtered.length, totalCount: filtered.length } });
    }
    if (_cache.loading) return Promise.resolve({ success: true, data: { rows: [], total: 0, totalCount: 0 } });
    _cache.loading = true;
    return loadBackendPage(_cache.backendPageIndex + 1, keyword).then(function () {
      _cache.loading = false;
      var filtered = filterPointsProducts(_cache.allRows);
      if (keyword) { var kw = keyword; filtered = filtered.filter(function(r) { var nm = r.title || r.mingcheng; return nm && nm.indexOf(kw) !== -1; }); }
      var filteredTotal = filtered.length;
      var loadRatio = _cache.allRows.length / _cache.backendTotal;
      var projectedTotal = Math.round(filteredTotal / loadRatio);
      var start = (pageIndex - 1) * pageSize;
      var pageRows = filtered.slice(start, start + pageSize);
      return { success: true, data: { rows: pageRows, total: projectedTotal, totalCount: projectedTotal } };
    });
  }

  // ========== 订单相关 ==========
  var ORDER_WORKSHEET_ID = 'dingdan';
  var ORDER_ITEM_WORKSHEET_ID = 'ddmx';
  var ORDER_ITEM_API = 'https://api.mingdao.com/v2/open/worksheet/getFilterRows';

  function getOrders(shangjiaRowid) {
    if (!shangjiaRowid) shangjiaRowid = getShangjiaRowid();
    var filters = [];
    if (shangjiaRowid) {
      filters.push({
        controlId: 'shangjia',
        dataType: 6,
        spliceType: 1,
        filterType: 24,
        value: shangjiaRowid
      });
    }

    // 按当前登录用户过滤（只查自己的订单）
    var userRowid = '';
    var storedInfo = localStorage.getItem('fsj_user_info');
    if (storedInfo) {
      try { userRowid = JSON.parse(storedInfo).id || ''; } catch (e) {}
    }
    if (userRowid) {
      filters.push({
        controlId: 'juese',
        dataType: 6,
        spliceType: 1,
        filterType: 24,
        value: userRowid
      });
    }

    var body = {
      worksheetId: ORDER_WORKSHEET_ID,
      viewId: '',
      pageSize: 100,
      pageIndex: 1,
      listType: 0,
      controls: ['ddid', 'zhuangtai', 'shangjia', 'juese', 'fkfs', 'ctime'],
      filters: filters
    };
    return callMingdaoAPI(ORDER_ITEM_API, body).then(function (res) {
      if (!res.success || !res.data.rows) return [];
      return res.data.rows;
    });
  }

  /**
   * 获取指定订单的明细（通过 dingdan 关联字段过滤）
   * @param {string} orderRowid - 订单 rowid
   */
  function getOrderItemsByOrder(orderRowid) {
    var body = {
      worksheetId: ORDER_ITEM_WORKSHEET_ID,
      viewId: '',
      pageSize: 200,
      pageIndex: 1,
      listType: 0,
      controls: ['rowid', 'ddid', 'dingdan', 'tejia', 'shoujia', 'goumaijia', 'shuliang', 'spspu', 'zhutu', 'mingcheng', 'juese'],
      filters: [{
        controlId: 'dingdan',
        dataType: 6,
        spliceType: 1,
        filterType: 24,
        value: orderRowid
      }]
    };
    return callMingdaoAPI(ORDER_ITEM_API, body).then(function (res) {
      if (!res.success || !res.data.rows) return [];
      return res.data.rows.map(function (row) {
        return {
          id: row.ddid || row.rowid || '',
          rowid: row.rowid || '',
          name: row.mingcheng || '',
          image: parseImage(row.zhutu),
          quantity: parseFloat(row.shuliang) || 1,
          price: parseFloat(row.shoujia) || 0,
          buyPrice: parseFloat(row.goumaijia) || 0,
          specialPrice: parseFloat(row.tejia) || 0,
          date: row.ctime || '',
          juese: parseRelName(row.juese)
        };
      });
    });
  }

  /**
   * 获取全部订单明细（不过滤，兼容旧调用）
   */
  function getOrderDetails(shangjiaRowid) {
    var body = {
      worksheetId: ORDER_ITEM_WORKSHEET_ID,
      viewId: '',
      pageSize: 200,
      pageIndex: 1,
      listType: 0,
      controls: ['ddid', 'dingdan', 'tejia', 'shoujia', 'goumaijia', 'shuliang', 'spspu', 'zhutu', 'mingcheng', 'juese']
    };
    return callMingdaoAPI(ORDER_ITEM_API, body).then(function (res) {
      if (!res.success || !res.data.rows) return [];
      return res.data.rows.map(function (row) {
        var orderRowid = null;
        if (row.dingdan) {
          try {
            var rel = typeof row.dingdan === 'string' ? JSON.parse(row.dingdan) : row.dingdan;
            if (Array.isArray(rel) && rel.length > 0) orderRowid = rel[0].sid || null;
          } catch (e) {}
        }
        return {
          id: row.ddid || row.rowid || '',
          orderRowid: orderRowid,
          name: row.mingcheng || '',
          image: parseImage(row.zhutu),
          quantity: parseFloat(row.shuliang) || 1,
          price: parseFloat(row.shoujia) || 0,
          buyPrice: parseFloat(row.goumaijia) || 0,
          specialPrice: parseFloat(row.tejia) || 0,
          date: row.ctime || '',
          juese: parseRelName(row.juese)
        };
      });
    });
  }

  function parseRelName(field) {
    if (!field) return '';
    try {
      var arr = typeof field === 'string' ? JSON.parse(field) : field;
      return Array.isArray(arr) && arr.length > 0 ? (arr[0].name || arr[0].val || '') : '';
    } catch (e) { return ''; }
  }

  function parseRelRowid(field) {
    if (!field) return '';
    try {
      var arr = typeof field === 'string' ? JSON.parse(field) : field;
      return Array.isArray(arr) && arr.length > 0 ? (arr[0].sid || arr[0].rowid || '') : '';
    } catch (e) { return ''; }
  }

  function mapOrder(row) {
    return {
      id: row.ddid || row.rowid || '',
      status: parseRelName(row.zhuangtai),
      date: row.createdate || '',
      shangjia: parseRelName(row.shangjia),
      juese: row.juese || ''
    };
  }

  function mapOrderItem(row) {
    return {
      name: row.mingcheng || '',
      image: parseImage(row.zhutu),
      quantity: parseFloat(row.shuliang) || 1,
      price: parseFloat(row.shoujia) || 0,
      buyPrice: parseFloat(row.goumaijia) || 0,
      specialPrice: parseFloat(row.tejia) || 0
    };
  }

  function getOrdersWithItems(shangjiaRowid) {
    if (!shangjiaRowid) shangjiaRowid = getShangjiaRowid();
    if (!shangjiaRowid) return Promise.resolve([]);

    return getOrders(shangjiaRowid).then(function (orderRows) {
      if (!orderRows || orderRows.length === 0) return [];

      // 获取所有订单 rowid（UUID）
      var orderRowids = orderRows.map(function (r) { return r.rowid; });

      // 并行获取所有订单明细（通过 dingdan 关联字段过滤）
      return Promise.all(orderRowids.map(function (oid) {
        return getOrderItemsByOrder(oid).then(function (items) {
          return { orderRowid: oid, items: items.map(mapOrderItem) };
        });
      })).then(function (itemResults) {
        var itemsMap = {};
        itemResults.forEach(function (r) { itemsMap[r.orderRowid] = r.items; });

        return orderRows.map(function (row) {
          var order = mapOrder(row);
          order.items = itemsMap[row.rowid] || [];
          order.total = order.items.reduce(function (sum, item) {
            return sum + item.price * item.quantity;
          }, 0);
          return order;
        });
      });
    });
  }

  /**
   * 通过用户 rowid 查询用户信息
   */
  function getUserInfoByRowid(userRowid) {
    var body = {
      worksheetId: USER_WORKSHEET_ID,
      rowId: userRowid,
      getSystemControl: 'false'
    };
    return callMingdaoAPI(MINGDAO_GET_ROW_API, body).then(function (res) {
      if (res.success && res.data) {
        return res.data;
      }
      throw new Error('未找到用户');
    });
  }

  // ========== 内容元数据 API ==========
  var CONTENT_WORKSHEET_ID = '6a03ceaa7e29abcb297cbdfc';   // 内容元数据表 UUID（原别名 shangpin，抗表改名 notes）

  function getContentDetail(rowid) {
    var body = {
      worksheetId: CONTENT_WORKSHEET_ID,
      rowId: rowid,
      getSystemControl: 'false',
      includeControls: ['title', 'attachments', 'mdnr', 'content', 'neirong', 'kind', 'publisher', 'org', 'weight']
    };
    return callMingdaoAPI(MINGDAO_GET_ROW_API, body).then(function (res) {
      if (res.success && res.data) {
        return { success: true, data: res.data };
      }
      throw new Error('内容不存在');
    });
  }

  function getContentList(filters, pageIndex, pageSize) {
    if (!filters) filters = [];
    if (pageIndex === undefined) pageIndex = 1;
    if (pageSize === undefined) pageSize = 20;
    var shangjiaRowid = getShangjiaRowid();
    if (shangjiaRowid) {
      filters.push({ controlId: 'org', dataType: 29, spliceType: 1, filterType: 24, value: shangjiaRowid });
    }
    // 逻辑删除过滤：排除 shanchu=1 的记录
    // kjzz 过滤（2026-09-11 老板要求）：只显示用户已加入组织的内容
    var userJrdzz = [];
    try { userJrdzz = JSON.parse(localStorage.getItem('fsj_user_jrdzz') || '[]'); } catch(e) {}
    if (userJrdzz.length) {
      filters.push({ controlId: 'visible_org', dataType: 29, spliceType: 1, filterType: 24, values: userJrdzz });
    }
    filters.push({ controlId: 'is_deleted', dataType: 2, spliceType: 1, filterType: 6, value: '1' });
    console.log('[ContentListAPI] 最终过滤条件:', JSON.stringify(filters));
    var body = {
      worksheetId: CONTENT_WORKSHEET_ID,
      viewId: '',
      pageSize: pageSize,
      pageIndex: pageIndex,
      listType: 0,
      controls: ['title', 'attachments', 'mdnr', 'content', 'kind', 'publisher', 'caid', 'weight', 'sell_price', 'points', 'participant_limit', 'group_expire_at', 'ptrx', 'participant', 'category', 'tags', 'like_count', 'comment_count', 'view_count', 'author_avatar', 'audit_status', 'ctime'],
      filters: filters
    };
    return callMingdaoAPI(MINGDAO_API, body);
  }

  /**
   * 根据 rowid 数组批量获取内容数据（用于 banner_swiper 等按 ID 取数据的场景）
   * 通过 Node 通用代理调用 mingdao getRowByIdPost 逐条查询
   * @param {string[]} rowids - 内容 rowid 数组
   * @returns {Promise<Array>} 内容数据数组
   */
  function getContentByRowids(rowids) {
    if (!rowids || rowids.length === 0) return Promise.resolve([]);

    // 逐条查询，并行请求
    var promises = rowids.map(function (rid) {
      var body = {
        worksheetId: CONTENT_WORKSHEET_ID,
        rowId: rid,
        getSystemControl: 'false'
      };
      return callMingdaoAPI(MINGDAO_GET_ROW_API, body).then(function (res) {
        if (res.success && res.data) {
          return res.data;
        }
        return null;
      }).catch(function () {
        return null;
      });
    });

    return Promise.all(promises).then(function (results) {
      // 按传入顺序返回，过滤掉查询失败的
      var valid = results.filter(Boolean);
      console.log('[FsjApi] getContentByRowids 请求 rowids:', rowids);
      console.log('[FsjApi] getContentByRowids 返回有效记录数:', valid.length);
      if (valid.length > 0) {
        console.log('[FsjApi] getContentByRowids 首条 zhutu:', valid[0].zhutu ? valid[0].zhutu.substring(0, 200) : '空');
      }
      return valid;
    });
  }

  // ========== 临时文件上传 ==========

  /**
   * 上传文件到临时文件服务器（10分钟有效期）
   * @param {File} file - 本地文件对象
   * @returns {Promise<{url: string, filename: string, size: number}>}
   */
  function uploadImageToTemp(file) {
    console.log('[TempUpload] 正在上传文件:', file.name, file.size, 'bytes');
    var formData = new FormData();
    formData.append('file', file);

    return fetch(TEMP_UPLOAD_URL, {
      method: 'POST',
      body: formData
    }).then(function (res) {
      if (!res.ok) throw new Error('上传失败: ' + res.status);
      return res.json();
    }).then(function (result) {
      if (result.code === 200) {
        var tempUrl = 'https://100000whys.cn' + result.data.url;
        console.log('[TempUpload] 上传成功, URL:', tempUrl);
        return {
          url: tempUrl,
          filename: result.data.filename,
          size: result.data.size
        };
      }
      throw new Error(result.message || '上传失败');
    });
  }

  // ========== 个人相册 API ==========

  /**
   * 获取用户的个人相册列表
   * @param {number} pageIndex - 页码
   * @param {number} pageSize - 每页数量
   * @returns {Promise}
   */
  function getAlbumList(pageIndex, pageSize) {
    if (!pageIndex) pageIndex = 1;
    if (!pageSize) pageSize = 20;
    var shangjiaRowid = getShangjiaRowid();
    var filters = [
      { controlId: 'kind', dataType: 2, spliceType: 1, filterType: 2, value: '个人相册' },
      { controlId: 'is_deleted', dataType: 2, spliceType: 1, filterType: 6, value: '1' }
    ];
    if (shangjiaRowid) {
      filters.push({ controlId: 'org', dataType: 29, spliceType: 1, filterType: 24, value: shangjiaRowid });
    }
    // 按当前登录用户过滤（只查自己的相册）
    var userRowid = '';
    var storedInfo = localStorage.getItem('fsj_user_info');
    if (storedInfo) {
      try { userRowid = JSON.parse(storedInfo).id || ''; } catch (e) {}
    }
    if (userRowid) {
      filters.push({ controlId: 'publisher', dataType: 29, spliceType: 1, filterType: 24, value: userRowid });
    }
    var body = {
      worksheetId: CONTENT_WORKSHEET_ID,
      viewId: '',
      pageSize: pageSize,
      pageIndex: pageIndex,
      listType: 0,
      controls: ['title', 'attachments', 'mdnr', 'content', 'kind', 'publisher', 'weight', 'ctime'],
      filters: filters,
      sortId: 'ctime',
      isAsc: true
    };
    return callMingdaoAPI(MINGDAO_API, body);
  }

  /**
   * 标准化相册数据
   */
  function mapAlbumItem(row) {
    return {
      id: row.rowid || '',
      name: row.title || row.mingcheng || '',
      imageUrl: parseImage(row.zhutu),
      description: row.wznr || '',
      content: row.mdnr || '',
      weight: parseInt(row.quanzhong) || 0,
      ctime: row.ctime || ''
    };
  }

  /**
   * 创建相册条目
   * @param {string} imageUrl - 图片 URL（临时文件服务器 URL，Mingdao 会自动下载）
   * @param {string} title - 标题（可选）
   * @returns {Promise<string>} 新记录的 rowid
   */
  function createAlbumItem(imageUrl, title) {
    var shangjiaRowid = getShangjiaRowid();
    if (!shangjiaRowid) return Promise.reject(new Error('商家配置未加载'));

    var userRowid = '';
    try {
      var info = JSON.parse(localStorage.getItem('fsj_user_info') || '{}');
      userRowid = info.id || '';
    } catch(e) {}

    // 直接传 URL 字符串，Mingdao 会自动从 URL 下载文件并注册为附件
    var controls = [
      { controlId: 'kind', value: '个人相册' },
      { controlId: 'org', value: shangjiaRowid },
      { controlId: 'attachments', value: imageUrl }
    ];
    if (userRowid) {
      controls.push({ controlId: 'publisher', value: userRowid });
    }
    if (title) {
      controls.push({ controlId: 'title', value: title });
    }

    var body = {
      worksheetId: CONTENT_WORKSHEET_ID,
      controls: controls,
      triggerWorkflow: true,
      getSystemControl: 'false'
    };

    console.log('[AlbumAPI] 创建相册条目, zhutu URL:', imageUrl);

    return callMingdaoAPI(MINGDAO_ADD_API, body).then(function (res) {
      if (res.success && res.data) {
        var rowid = res.data.rowid || res.data;
        console.log('[AlbumAPI] 相册条目创建成功, rowid:', rowid);
        return rowid;
      }
      throw new Error(res.error_msg || res.error || '相册条目创建失败');
    });
  }

  /**
   * 批量删除相册条目（逻辑删除：设置 shanchu=1）
   * @param {string[]} rowids - 要删除的记录 rowid 数组
   * @returns {Promise}
   */
  function deleteAlbumItems(rowids) {
    if (!rowids || rowids.length === 0) return Promise.reject(new Error('未选择要删除的条目'));

    console.log('[AlbumAPI] 批量删除相册条目:', rowids);

    // 逐个调用 editRow 设置 shanchu=1
    var promises = rowids.map(function (rowid) {
      var body = {
        worksheetId: CONTENT_WORKSHEET_ID,
        rowId: rowid,
        controls: [
          { controlId: 'is_deleted', value: '1' }
        ],
        getSystemControl: 'false'
      };
      return callMingdaoAPI('https://api.mingdao.com/v2/open/worksheet/editRow', body);
    });

    return Promise.all(promises).then(function (results) {
      var successCount = results.filter(function (r) { return r.success; }).length;
      console.log('[AlbumAPI] 批量删除完成, 成功:', successCount, '/', rowids.length);
      return { success: successCount === rowids.length, deleted: successCount };
    });
  }

  // ========== 评论 API ==========
  var COMMENT_PAGE_SIZE = 10;

  function getComments(contentRowid, pageIndex, pageSize) {
    if (!contentRowid) return Promise.resolve({ success: true, data: { rows: [], total: 0 } });
    if (!pageIndex) pageIndex = 1;
    if (!pageSize) pageSize = COMMENT_PAGE_SIZE;
    // 过滤：leixing=评论, root=当前内容rowid（原 fuyuan，2026-10-24 别名英文化）, shangjia2=当前商家
    var filters = [
      { controlId: 'kind', dataType: 2, spliceType: 1, filterType: 2, value: '评论' },
      { controlId: 'root', dataType: 29, spliceType: 1, filterType: 24, value: contentRowid }
    ];
    var shangjiaRowid = getShangjiaRowid();
    if (shangjiaRowid) {
      filters.push({ controlId: 'org', dataType: 6, spliceType: 1, filterType: 24, value: shangjiaRowid });
    }
    var body = {
      worksheetId: CONTENT_WORKSHEET_ID,
      viewId: '',
      pageSize: pageSize,
      pageIndex: pageIndex,
      listType: 0,
      controls: ['title', 'root', 'parent', 'hfyh', 'child', 'publisher', 'kind', 'org', 'ctime'],
      filters: filters,
      sort: [{ controlId: 'ctime', isAsc: false }]
    };
    console.log('[CommentsAPI] 请求体:', JSON.stringify(body, null, 2));
    return callMingdaoAPI(MINGDAO_API, body).then(function (res) {
      console.log('[CommentsAPI] 返回:', JSON.stringify(res, null, 2));
      return res;
    });
  }

  function createComment(contentRowid, text, parentCommentRowid, parentCommentAuthorRowid) {
    var shangjiaRowid = getShangjiaRowid();
    if (!shangjiaRowid) return Promise.reject(new Error('商家配置未加载'));

    var openid = localStorage.getItem('fsj_openid') || '';
    if (!openid) return Promise.reject(new Error('请先登录'));

    // 获取当前用户 rowid
    var userRowid = '';
    try {
      var info = JSON.parse(localStorage.getItem('fsj_user_info') || '{}');
      userRowid = info.id || '';
    } catch(e) {}

    if (!userRowid) {
      return FsjApi.getUserRowidByOpenid(openid).then(function (uid) {
        return _doCreateComment(contentRowid, text, parentCommentRowid, parentCommentAuthorRowid, uid, shangjiaRowid);
      });
    }
    return _doCreateComment(contentRowid, text, parentCommentRowid, parentCommentAuthorRowid, userRowid, shangjiaRowid);
  }

  function _doCreateComment(contentRowid, text, parentCommentRowid, parentCommentAuthorRowid, userRowid, shangjiaRowid) {
    var controls = [
      { controlId: 'kind', value: '评论' },
      { controlId: 'title', value: text },
      { controlId: 'org', value: shangjiaRowid },
      { controlId: 'publisher', value: userRowid },
      // root 永远指向文章/内容 rowid（原 fuyuan，2026-10-24 别名英文化）
      { controlId: 'root', value: contentRowid }
    ];

    // 回复评论：填 hfyh（被回复者 rowid）和 parent（被回复评论 rowid，原 fu）
    if (parentCommentRowid) {
      controls.push({ controlId: 'reply_user', value: parentCommentAuthorRowid || '' });
      controls.push({ controlId: 'parent', value: parentCommentRowid });
    }

    var body = {
      worksheetId: CONTENT_WORKSHEET_ID,
      controls: controls
    };

    return callMingdaoAPI(MINGDAO_ADD_API, body).then(function (res) {
      if (res.success) {
        return res.data;
      }
      throw new Error(res.error_msg || res.error || '评论发表失败');
    });
  }

  // ========== 订单创建（通过 Coze 工作流） ==========
  var ORDER_WORKSHEET_ID_ADD = '6a03c9aee37b5f883e0c99f6';
  var ORDER_DETAIL_WORKSHEET_ID_ADD = '6a03cb851077554405a9e587';

  function createOrder(orderData) {
    var controls = [
      { controlId: 'shangjia', value: orderData.shangjiaRowid },
      { controlId: 'juese', value: orderData.jueseRowid },
      { controlId: 'shdz', value: orderData.shdz || '' },
      { controlId: 'zhuangtai', value: orderData.zhuangtai || '待送达', valueType: 2 },
      { controlId: 'kaifeng', value: '0' },
      { controlId: 'fkfs', value: orderData.fkfs || '微信支付', valueType: 2 },
      { controlId: 'ddmx', value: '' },
      { controlId: '_owner', value: 'ae75cf2e-0f73-4137-9e99-116d92c45a47' }
    ];
    if (orderData.yue !== undefined && orderData.yue !== null) controls.push({ controlId: 'yue', value: parseFloat(orderData.yue) });
    if (orderData.jinfen !== undefined && orderData.jinfen !== null) controls.push({ controlId: 'jinfen', value: parseFloat(orderData.jinfen) });
    if (orderData.jine !== undefined && orderData.jine !== null) controls.push({ controlId: 'jine', value: parseFloat(orderData.jine) });

    var body = {
      worksheetId: ORDER_WORKSHEET_ID_ADD,
      triggerWorkflow: true,
      controls: controls,
      getSystemControl: 'false'
    };

    console.log('[OrderAPI] ===== 创建订单完整请求体 =====');
    console.log('[OrderAPI] URL: ' + MINGDAO_ADD_API);
    console.log('[OrderAPI] Body: ' + JSON.stringify(body));
    console.log('[OrderAPI] Dify 封装: ' + JSON.stringify({
      inputs: { url: MINGDAO_ADD_API, input: JSON.stringify(body) },
      response_mode: 'blocking'
    }));
    console.log('[OrderAPI] ================================');

    return callMingdaoAPI(MINGDAO_ADD_API, body).then(function (res) {
      if (res.success && res.data) {
        var rowid = typeof res.data === 'string' ? res.data : res.data.rowid || res.data.rowId;
        console.log('[OrderAPI] 订单创建成功, rowid:', rowid);
        return rowid;
      }
      throw new Error(res.error || '订单创建失败');
    });
  }

  function createOrderDetails(orderRowid, jueseRowid, items) {
    var promises = items.map(function (item) {
      var body = {
        worksheetId: ORDER_DETAIL_WORKSHEET_ID_ADD,
        triggerWorkflow: true,
        controls: [
          { controlId: 'dingdan', value: orderRowid },
          { controlId: 'juese', value: jueseRowid },
          { controlId: 'spspu', value: item.productRowid },
          { controlId: 'shuliang', value: item.shuliang || 1 },
          { controlId: 'tejia', value: parseFloat(item.tejia) || 0 },
          { controlId: 'shoujia', value: parseFloat(item.shoujia) || 0 },
          { controlId: 'goumaijia', value: parseFloat(item.goumaijia) || parseFloat(item.tejia) || 0 }
        ],
        getSystemControl: 'false'
      };
      // 如果有状态和付款方式，也一起设置
      if (item.zhuangtai !== undefined) body.controls.push({ controlId: 'zhuangtai', value: item.zhuangtai, valueType: 2 });
      if (item.fkfs !== undefined) body.controls.push({ controlId: 'fkfs', value: item.fkfs });
      console.log('[OrderAPI] 创建订单明细:', JSON.stringify(body));
      return callMingdaoAPI(MINGDAO_ADD_API, body).then(function (res) {
        if (res.success && res.data) {
          console.log('[OrderAPI] 订单明细创建成功');
          return res.data;
        }
        throw new Error(res.error_msg || res.error || '订单明细创建失败');
      });
    });
    return Promise.all(promises);
  }

  /**
   * 更新订单状态
   * @param {string} orderRowid - 订单 rowid
   * @param {string} status - 新状态，如 '已送达'、'已完成'
   * @returns {Promise}
   */
  function updateOrderStatus(orderRowid, status) {
    var body = {
      worksheetId: ORDER_WORKSHEET_ID_ADD,
      rowId: orderRowid,
      controls: [
        { controlId: 'zhuangtai', value: status, valueType: 2 }
      ],
      getSystemControl: 'false'
    };

    console.log('[OrderAPI] 更新订单状态:', orderRowid, '->', status);

    return callMingdaoAPI(MINGDAO_UPDATE_ROW_API, body).then(function (res) {
      if (res.success) {
        console.log('[OrderAPI] 订单状态更新成功');
      } else {
        console.warn('[OrderAPI] 订单状态更新失败:', res.error_msg || res.error);
        throw new Error(res.error_msg || res.error || '订单状态更新失败');
      }
    });
  }

  /**
   * 更新订单明细状态（通过 dingdan 关联字段批量查询并更新）
   * @param {string} orderRowid - 订单 rowid
   * @param {string} status - 新状态
   * @returns {Promise}
   */
  function updateOrderDetailStatus(orderRowid, status) {
    return getOrderItemsByOrder(orderRowid).then(function (items) {
      if (!items || items.length === 0) {
        console.log('[OrderAPI] 没有明细数据，跳过明细状态更新');
        return;
      }
      var promises = items.map(function (item) {
        var body = {
          worksheetId: ORDER_ITEM_WORKSHEET_ID,
          rowId: item.rowid,
          controls: [
            { controlId: 'zhuangtai', value: status, valueType: 2 }
          ],
          getSystemControl: 'false'
        };
        console.log('[OrderAPI] 更新明细状态:', item.rowid, '->', status);
        return callMingdaoAPI(MINGDAO_UPDATE_ROW_API, body).then(function (res) {
          if (res.success) {
            console.log('[OrderAPI] 明细状态更新成功:', item.rowid);
          } else {
            console.warn('[OrderAPI] 明细状态更新失败:', res.error_msg || res.error);
          }
        });
      });
      return Promise.all(promises);
    });
  }

  // ========== 通过 openid 查询用户 rowid ==========
  var MINGDAO_FILTER_API = 'https://api.mingdao.com/v2/open/worksheet/getFilterRows';

  function getUserRowidByOpenid(openid) {
    var body = {
      worksheetId: USER_WORKSHEET_ID,
      pageSize: 1,
      filters: [{
        controlId: 'wxopenid',
        dataType: 1,
        spliceType: 1,
        filterType: 1,
        value: openid
      }],
      controls: ['rowid']
    };
    return callMingdaoAPI(MINGDAO_FILTER_API, body).then(function (res) {
      if (res.success && res.data && res.data.rows && res.data.rows.length > 0) {
        return res.data.rows[0].rowid;
      }
      throw new Error('未找到用户');
    });
  }

  // ========== 收货地址 ==========
  var SHDZ_WORKSHEET_ID = 'shdz';
  var ZDYYJDZ_WORKSHEET_ID = 'zdyyjdz';
  var ZDYEDZ_WORKSHEET_ID = 'zdyejdz';
  var ZDYSDZ_WORKSHEET_ID = 'zdysjdz';
  var MINGDAO_ADD_ROW_API = 'https://api.mingdao.com/v2/open/worksheet/addRow';
  var MINGDAO_UPDATE_ROW_API = 'https://api.mingdao.com/v2/open/worksheet/editRow';
  var MINGDAO_DELETE_ROW_API = 'https://api.mingdao.com/v2/open/worksheet/deleteRow';

  /**
   * 获取商家自定义的地址级别选项
   * @param {string} type - 'zdyyjdz' | 'zdyejdz' | 'zdysjdz'
   * @param {string} shangjiaRowid - 商家 rowid
   */
  function getAddressLevel(type, shangjiaRowid) {
    var worksheetMap = {
      'zdyyjdz': ZDYYJDZ_WORKSHEET_ID,
      'zdyejdz': ZDYEDZ_WORKSHEET_ID,
      'zdysjdz': ZDYSDZ_WORKSHEET_ID
    };
    var worksheetId = worksheetMap[type] || type;

    var body = {
      worksheetId: worksheetId,
      pageSize: 200,
      pageIndex: 1,
      listType: 0,
      controls: ['mingcheng', 'shangjia']
    };

    console.log('[AddressAPI] getAddressLevel 请求: type=' + type + ', worksheetId=' + worksheetId + ', shangjiaRowid=' + shangjiaRowid);
    console.log('[AddressAPI] 请求体:', JSON.stringify(body));

    return callMingdaoAPI(MINGDAO_API, body).then(function (res) {
      console.log('[AddressAPI] ' + type + ' API 返回:', JSON.stringify(res).substring(0, 500));
      if (!res.success || !res.data.rows) {
        console.warn('[AddressAPI] ' + type + ' 无 rows, success=' + res.success + ', data=' + JSON.stringify(res.data).substring(0, 200));
        return [];
      }
      var rows = res.data.rows;
      console.log('[AddressAPI] ' + type + ' 原始 rows 数量:', rows.length);
      // 按商家过滤（如果该级别表有 shangjia 关联字段）
      return rows
        .filter(function (row) {
          if (!row.shangjia) return true;
          try {
            var arr = JSON.parse(row.shangjia);
            return arr.some(function (item) { return item.sid === shangjiaRowid; });
          } catch (e) { return true; }
        })
        .map(function (row) {
          return {
            id: row.rowid || '',
            name: row.mingcheng || row.name || '',
            _levelName: row._levelName || null
          };
        });
    }).catch(function (err) {
      console.error('[AddressAPI] ' + type + ' 请求失败:', err.message);
      return [];
    });
  }

  /**
   * 获取用户的默认地址 rowid（从用户表 mrshdz 字段）
   */
  function getUserDefaultAddressRowid(userRowid) {
    if (!userRowid) {
      var storedInfo = localStorage.getItem('fsj_user_info');
      if (storedInfo) {
        try { userRowid = JSON.parse(storedInfo).id || ''; } catch (e) {}
      }
    }
    if (!userRowid) return Promise.resolve('');

    var body = {
      worksheetId: USER_WORKSHEET_ID,
      rowId: userRowid,
      controls: ['mrshdz']
    };

    return callMingdaoAPI(MINGDAO_GET_ROW_API, body).then(function (res) {
      if (res.success && res.data) {
        return res.data.mrshdz || '';
      }
      return '';
    });
  }

  /**
   * 获取用户的收货地址列表
   */
  function getAddresses(shangjiaRowid) {
    var userRowid = '';
    var storedInfo = localStorage.getItem('fsj_user_info');
    if (storedInfo) {
      try { userRowid = JSON.parse(storedInfo).id || ''; } catch (e) {}
    }

    var filters = [];
    if (shangjiaRowid) {
      filters.push({
        controlId: 'shangjia',
        dataType: 6,
        spliceType: 1,
        filterType: 24,
        value: shangjiaRowid
      });
    }
    if (userRowid) {
      filters.push({
        controlId: 'yonghu',
        dataType: 6,
        spliceType: 1,
        filterType: 24,
        value: userRowid
      });
    }

    var body = {
      worksheetId: SHDZ_WORKSHEET_ID,
      pageSize: 100,
      pageIndex: 1,
      listType: 0,
      controls: ['shangjia', 'yonghu', 'dianhua', 'zdyyjdz', 'zdyejdz', 'zdysjdz', 'xxdz', 'dzqc', 'mingcheng1', 'mingcheng2', 'mingcheng3'],
      filters: filters
    };

    return callMingdaoAPI(MINGDAO_FILTER_API, body).then(function (res) {
      if (!res.success || !res.data.rows) return [];
      return res.data.rows.map(function (row) {
        // 他表字段直接包含名称文本，比 parseRelName 更可靠
        var l1Name = row.mingcheng1 || parseRelName(row.zdyyjdz);
        var l2Name = row.mingcheng2 || parseRelName(row.zdyejdz);
        var l3Name = row.mingcheng3 || parseRelName(row.zdysjdz);

        return {
          id: row.rowid || '',
          phone: row.dianhua || '',
          level1: l1Name,
          level1Rowid: parseRelRowid(row.zdyyjdz) || '',
          level2: l2Name,
          level2Rowid: parseRelRowid(row.zdyejdz) || '',
          level3: l3Name,
          level3Rowid: parseRelRowid(row.zdysjdz) || '',
          detail: row.xxdz || '',
          addressFull: row.dzqc || ''
        };
      });
    });
  }

  /**
   * 创建收货地址
   */
  function createAddress(addrData) {
    var controls = [
      { controlId: 'shangjia', value: addrData.shangjiaRowid },
      { controlId: 'yonghu', value: addrData.userRowid || '' },
      { controlId: 'dianhua', value: addrData.phone },
      { controlId: 'xxdz', value: addrData.detail || '' }
    ];

    // 地址级别（关联记录，填 rowid）
    if (addrData.level1) controls.push({ controlId: 'zdyyjdz', value: addrData.level1 });
    if (addrData.level2) controls.push({ controlId: 'zdyejdz', value: addrData.level2 });
    if (addrData.level3) controls.push({ controlId: 'zdysjdz', value: addrData.level3 });

    var body = {
      worksheetId: SHDZ_WORKSHEET_ID,
      controls: controls,
      getSystemControl: 'false'
    };

    console.log('[AddressAPI] 创建地址:', JSON.stringify(body));
    return callMingdaoAPI(MINGDAO_ADD_ROW_API, body).then(function (res) {
      if (res.success && res.data) {
        console.log('[AddressAPI] 地址创建成功');
        return res.data;
      }
      throw new Error(res.error || '地址创建失败');
    });
  }

  /**
   * 更新收货地址
   */
  function updateAddress(addrData) {
    var controls = [
      { controlId: 'yonghu', value: addrData.userRowid || '' },
      { controlId: 'dianhua', value: addrData.phone },
      { controlId: 'xxdz', value: addrData.detail || '' }
    ];

    if (addrData.level1) controls.push({ controlId: 'zdyyjdz', value: addrData.level1 });
    if (addrData.level2) controls.push({ controlId: 'zdyejdz', value: addrData.level2 });
    if (addrData.level3) controls.push({ controlId: 'zdysjdz', value: addrData.level3 });

    var body = {
      worksheetId: SHDZ_WORKSHEET_ID,
      rowId: addrData.id,
      controls: controls,
      getSystemControl: 'false'
    };

    console.log('[AddressAPI] 更新地址:', JSON.stringify(body));
    return callMingdaoAPI(MINGDAO_UPDATE_ROW_API, body).then(function (res) {
      if (res.success) {
        console.log('[AddressAPI] 地址更新成功');
        return res.data;
      }
      throw new Error(res.error || '地址更新失败');
    });
  }

  /**
   * 删除收货地址
   */
  function deleteAddress(rowid) {
    var body = {
      worksheetId: SHDZ_WORKSHEET_ID,
      rowId: rowid
    };

    console.log('[AddressAPI] 删除地址:', rowid);
    return callMingdaoAPI(MINGDAO_DELETE_ROW_API, body).then(function (res) {
      if (res.success) {
        console.log('[AddressAPI] 地址删除成功');
        return res.data;
      }
      throw new Error(res.error || '地址删除失败');
    });
  }

  /**
   * 设置用户默认收货地址（更新用户表 mrshdz 字段）
   */
  function setUserDefaultAddressRowid(userRowid, addressRowid) {
    var body = {
      worksheetId: USER_WORKSHEET_ID,
      rowId: userRowid,
      controls: [
        { controlId: 'mrshdz', value: addressRowid }
      ],
      getSystemControl: 'false'
    };

    console.log('[AddressAPI] 设置默认地址, userRowid=' + userRowid + ', addressRowid=' + addressRowid);
    return callMingdaoAPI(MINGDAO_UPDATE_ROW_API, body).then(function (res) {
      if (res.success) {
        console.log('[AddressAPI] 默认地址设置成功');
        return res.data;
      }
      throw new Error(res.error || '默认地址设置失败');
    });
  }

  /**
   * 更新订单明细已支付数量（先享后付专用）
   * @param {string} detailRowid - 订单明细 rowid
   * @param {number} newCount - 新的已支付数量
   * @returns {Promise}
   */
  function updateOrderDetailYzfsl(detailRowid, newCount) {
    var body = {
      worksheetId: ORDER_DETAIL_WORKSHEET_ID_ADD,
      rowId: detailRowid,
      controls: [
        { controlId: 'yzfsl', value: newCount }
      ],
      getSystemControl: 'false'
    };

    console.log('[OrderAPI] 更新已支付数量:', detailRowid, '->', newCount);
    console.log('[OrderAPI] updateRow body:', JSON.stringify(body));

    return callMingdaoAPI(MINGDAO_UPDATE_ROW_API, body).then(function (res) {
      console.log('[OrderAPI] updateRow 完整响应:', JSON.stringify(res).substring(0, 300));
      if (res.success) {
        console.log('[OrderAPI] 已支付数量更新成功');
      } else {
        console.warn('[OrderAPI] 已支付数量更新失败:', res.error_msg || res.error);
        throw new Error(res.error_msg || res.error || '已支付数量更新失败');
      }
    });
  }

  /**
   * 更新用户昵称
   * @param {string} userRowid - 用户 rowid
   * @param {string} nickname - 新昵称
   */
  function updateUserNickname(userRowid, nickname) {
    var body = {
      worksheetId: USER_WORKSHEET_ID,
      rowId: userRowid,
      controls: [
        { controlId: 'nickname', value: nickname }
      ]
    };

    console.log('[UserAPI] 更新用户昵称:', userRowid, '->', nickname);

    return callMingdaoAPI(MINGDAO_UPDATE_ROW_API, body).then(function (res) {
      if (res.success) {
        console.log('[UserAPI] 用户昵称更新成功');
        return res.data;
      } else {
        console.warn('[UserAPI] 用户昵称更新失败:', res.error_msg || res.error);
        throw new Error(res.error_msg || res.error || '昵称更新失败');
      }
    });
  }

  // ========== 功能列表 ==========
  var FEATURE_WORKSHEET_ID = 'gongnengbiao';
  // 功能表「排序」数字字段（2026-09-11 新增，门店装修端可调整功能项顺序）
  var FEATURE_SORT_CONTROL = '6aa3f2d85c076794825c6c5e';

  /**
   * 获取功能列表（按商家过滤，按排序字段升序）
   * @returns {Promise<Array>} 功能项数组
   */
  function getFeatureList() {
    var shangjiaRowid = getShangjiaRowid();
    if (!shangjiaRowid) return Promise.resolve([]);

    var body = {
      worksheetId: FEATURE_WORKSHEET_ID,
      viewId: '',
      pageSize: 50,
      pageIndex: 1,
      listType: 1,
      controls: ['rowid', 'mingcheng', 'icon', 'url', FEATURE_SORT_CONTROL],
      filters: [
        {
          controlId: 'shangjia',
          dataType: 29,
          spliceType: 1,
          filterType: 24,
          type: 24,
          value: shangjiaRowid
        }
      ],
      sortId: FEATURE_SORT_CONTROL,
      isAsc: true
    };

    return callMingdaoAPI(MINGDAO_API, body).then(function (res) {
      if (!res.success || !res.data.rows) return [];
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

  /**
   * 更新用户头像
   * @param {string} userRowid - 用户 rowid
   * @param {string} avatarUrl - 头像 URL（HTTPS 开头）
   */
  function updateUserAvatar(userRowid, avatarUrl) {
    var body = {
      worksheetId: USER_WORKSHEET_ID,
      rowId: userRowid,
      controls: [
        { controlId: 'avatar', value: avatarUrl }
      ]
    };

    console.log('[UserAPI] 更新用户头像:', userRowid, '->', avatarUrl);

    return callMingdaoAPI(MINGDAO_UPDATE_ROW_API, body).then(function (res) {
      if (res.success) {
        console.log('[UserAPI] 用户头像更新成功');
        return res.data;
      } else {
        console.warn('[UserAPI] 用户头像更新失败:', res.error_msg || res.error);
        throw new Error(res.error_msg || res.error || '头像更新失败');
      }
    });
  }

  /**
   * 发布文章
   * @param {Object} articleData - { title, summary, content, coverUrl }
   * @returns {Promise<string>} 新文章的 rowid
   */
  function createArticle(articleData) {
    var shangjiaRowid = getShangjiaRowid();
    if (!shangjiaRowid) return Promise.reject(new Error('商家配置未加载'));

    var userRowid = '';
    try {
      var info = JSON.parse(localStorage.getItem('fsj_user_info') || '{}');
      userRowid = info.id || '';
    } catch(e) {}

    var controls = [
      { controlId: 'kind', value: 'article' },
      { controlId: 'org', value: shangjiaRowid },
      { controlId: 'title', value: articleData.title || '' },
      { controlId: 'content', value: articleData.content || '' }
    ];

    if (articleData.summary) {
      controls.push({ controlId: 'mdnr', value: articleData.summary });
    }
    if (articleData.coverUrls && articleData.coverUrls.length > 0) {
      controls.push({ controlId: 'attachments', value: articleData.coverUrls.join(',') });
    } else if (articleData.coverUrl) {
      controls.push({ controlId: 'attachments', value: articleData.coverUrl });
    }
    if (articleData.duoren) {
      controls.push({ controlId: 'participant_limit', value: articleData.duoren });
    }
    if (articleData.xuanshang) {
      controls.push({ controlId: 'xianshang', value: articleData.xuanshang });
    }
    if (articleData.xuanshangAmount) {
      controls.push({ controlId: 'xianshang_amount', value: articleData.xuanshangAmount });
    }
    if (userRowid) {
      controls.push({ controlId: 'publisher', value: userRowid });
    }

    var body = {
      worksheetId: CONTENT_WORKSHEET_ID,
      controls: controls,
      triggerWorkflow: true,
      getSystemControl: 'false'
    };

    console.log('[ArticleAPI] 发布文章:', JSON.stringify(body).substring(0, 300));

    return callMingdaoAPI(MINGDAO_ADD_API, body).then(function (res) {
      if (res.success && res.data) {
        var rowid = typeof res.data === 'string' ? res.data : res.data.rowid || res.data.rowId;
        console.log('[ArticleAPI] 文章发布成功, rowid:', rowid);
        return rowid;
      }
      throw new Error(res.error_msg || res.error || '文章发布失败');
    });
  }

  /**
   * 获取当前用户加入的组织列表
   * 解析用户表 jrdzz 字段，兼容两种格式：
   *   - 字符串数组 ["rowid1"]（旧数据）
   *   - 对象数组 [{sid, name, ...}]（关联记录标准格式，带 name）
   * 字符串格式缺 name 时查组织表补名
   * @returns {Promise<Array<{rowid:string, mingcheng:string}>>}
   */
  function getUserOrgs() {
    var userRowid = '';
    try {
      var info = JSON.parse(localStorage.getItem('fsj_user_info') || '{}');
      userRowid = info.id || '';
    } catch (e) {}
    if (!userRowid) return Promise.reject(new Error('未登录'));

    return callMingdaoAPI(MINGDAO_GET_ROW_API, {
      worksheetId: USER_WORKSHEET_ID,
      rowId: userRowid,
      controls: ['jrdzz']
    }).then(function (res) {
      if (!res || !res.success || !res.data) return [];
      var items = [];
      try { items = JSON.parse(res.data.jrdzz || '[]'); } catch (e) { items = []; }
      if (!Array.isArray(items)) items = [];

      // 兼容两种格式 → 统一 {rowid, mingcheng}
      var orgs = items.map(function (it) {
        if (typeof it === 'string') return { rowid: it, mingcheng: '' };
        return { rowid: it.sid || it.rowid || '', mingcheng: it.name || '' };
      }).filter(function (o) { return !!o.rowid; });

      if (orgs.length === 0) return [];

      // 有缺 mingcheng 的（字符串格式），查组织表补名
      var needLookup = orgs.some(function (o) { return !o.mingcheng; });
      if (!needLookup) return orgs;

      return callMingdaoAPI(MINGDAO_API, {
        worksheetId: ORG_WORKSHEET_ID,
        viewId: '',
        pageSize: 200,
        pageIndex: 1,
        listType: 0,
        controls: ['rowid', 'mingcheng']
      }).then(function (r) {
        var rows = (r && r.data && r.data.rows) || [];
        var nameMap = {};
        rows.forEach(function (row) { nameMap[row.rowid] = row.mingcheng || ''; });
        orgs.forEach(function (o) { if (!o.mingcheng) o.mingcheng = nameMap[o.rowid] || ''; });
        return orgs;
      }).catch(function () { return orgs; });
    });
  }

  // ========== 十二维 JSON 自动创建明道云数据 ==========

  /**
   * 把 12wei 嵌套树展平为一维数组（带 parentId 关联）
   * @param {Object} node - 树节点（{ rowid, mingcheng, sew, children[], ... }）
   * @param {string} parentId - 父节点 rowid
   * @returns {Array<Object>} 展平后的节点数组
   */
  function flatten12weiTree(node, parentId) {
    var flat = [{
      rowid: node.rowid || '',
      mingcheng: node.mingcheng || '',
      sew: node.sew || '',
      guanjianci: node.guanjianci || [],
      ctime: node.ctime || '',
      utime: node.utime || '',
      fabuzhe: node.fabuzhe || '',
      neirong: node.neirong || node.wznr || '',
      quanzhong: node.quanzhong || 0,
      zhixindu: node.zhixindu || 0,
      shangjia1: node.shangjia1 || '0',
      parentId: parentId || ''
    }];

    if (node.children && node.children.length > 0) {
      for (var i = 0; i < node.children.length; i++) {
        flat = flat.concat(flatten12weiTree(node.children[i], node.rowid));
      }
    }
    return flat;
  }

  /**
   * 把单个节点转成明道云 controls 格式
   * @param {Object} node - flatten12weiTree 输出的节点
   * @param {string} parentControlId - 明道云表中 parent_node 字段的 controlId
   * @returns {Array} controls 数组
   */
  function nodeToControls(node, parentControlId) {
    var controls = [
      { controlId: 'kind', value: '十二维', valueType: 2 },
      { controlId: 'title', value: node.mingcheng },
      { controlId: 'dimension', value: node.sew, valueType: 2 },
      { controlId: 'tags', value: JSON.stringify(node.guanjianci) },
      { controlId: 'neirong', value: node.neirong },
      { controlId: 'weight', value: node.quanzhong },
      { controlId: 'zhixindu', value: node.zhixindu }
    ];

    if (node.ctime) controls.push({ controlId: 'ctime', value: node.ctime });
    if (node.utime) controls.push({ controlId: 'utime', value: node.utime });
    if (node.fabuzhe) controls.push({ controlId: 'publisher', value: node.fabuzhe });
    if (node.shangjia1) controls.push({ controlId: 'is_published', value: node.shangjia1, valueType: 2 });
    // 所属商家（2026-09-06 拍板：创建 shangpin 必带；节点带 shangjia2 则写入，取不到跳过由 HAP 工作流兜底）
    if (node.shangjia2) controls.push({ controlId: 'org', value: node.shangjia2, valueType: 2 });

    // 父子关联字段（需在明道云表新增 parent_node 关联记录字段）
    if (node.parentId) {
      controls.push({ controlId: parentControlId || 'parent_node', value: node.parentId });
    }

    return controls;
  }

  /**
   * 前端生成的 12wei JSON 树 → 批量创建到明道云
   * @param {Object} tree - 12wei JSON 树（符合 12wei.schema.json）
   * @param {Object} [options] - 可选配置
   * @param {string} [options.parentControlId='parent_node'] - 明道云 parent 字段 controlId
   * @param {string} [options.worksheetId] - 目标表 ID（默认用 CONTENT_WORKSHEET_ID）
   * @param {number} [options.batchSize=10] - 并发批次大小
   * @returns {Promise<Array<{originalRowid: string, newRowid: string, mingcheng: string}>>}
   */
  function create12weiTree(tree, options) {
    if (!tree || !tree.rowid || !tree.mingcheng || !tree.sew) {
      return Promise.reject(new Error('12wei JSON 格式错误：缺少 rowid/mingcheng/sew'));
    }

    options = options || {};
    var parentControlId = options.parentControlId || 'parent_node';
    var worksheetId = options.worksheetId || CONTENT_WORKSHEET_ID;
    var batchSize = options.batchSize || 10;

    var nodes = flatten12weiTree(tree);
    console.log('[12wei] 展平节点数:', nodes.length, ', 批次大小:', batchSize);

    // 单条创建逻辑
    function createOne(node) {
      var body = {
        worksheetId: worksheetId,
        controls: nodeToControls(node, parentControlId),
        triggerWorkflow: true,
        getSystemControl: 'false'
      };
      return callMingdaoAPI(MINGDAO_ADD_API, body).then(function (res) {
        if (res.success && res.data) {
          var rowid = typeof res.data === 'string' ? res.data : (res.data.rowid || res.data.rowId);
          console.log('[12wei] 创建成功:', node.mingcheng, '->', rowid);
          return { originalRowid: node.rowid, newRowid: rowid, mingcheng: node.mingcheng };
        }
        console.error('[12wei] 创建失败:', node.mingcheng, res.error_msg || res.error);
        return { originalRowid: node.rowid, newRowid: null, mingcheng: node.mingcheng, error: res.error_msg || res.error };
      }).catch(function (err) {
        console.error('[12wei] 网络错误:', node.mingcheng, err.message);
        return { originalRowid: node.rowid, newRowid: null, mingcheng: node.mingcheng, error: err.message };
      });
    }

    // 按 batchSize 分批，串行批次 + 每批内并发
    var batches = [];
    for (var i = 0; i < nodes.length; i += batchSize) {
      batches.push(nodes.slice(i, i + batchSize));
    }

    return batches.reduce(function (prevPromise, batch) {
      return prevPromise.then(function (allResults) {
        return Promise.all(batch.map(createOne)).then(function (batchResults) {
          return allResults.concat(batchResults);
        });
      });
    }, Promise.resolve([]));
  }

  /**
   * 列表缓存工具（2026-09-05 缓存优先）：列表页先渲染缓存秒开，再拉最新覆盖
   * get(key) → {rows, ts} | null；set(key, rows)
   */
  var listCache = {
    get: function (key) {
      try {
        var v = JSON.parse(localStorage.getItem('fsj_list_cache_' + key) || 'null');
        return (v && Array.isArray(v.rows)) ? v : null;
      } catch (e) { return null; }
    },
    set: function (key, rows) {
      try { localStorage.setItem('fsj_list_cache_' + key, JSON.stringify({ rows: rows, ts: Date.now() })); } catch (e) { /* 忽略 */ }
    }
  };

  return {
    listCache: listCache,
    getProductList: getProductList, getPointsProductList: getPointsProductList,
    getFeatureList: getFeatureList,
    // 内容元数据
    getContentDetail: getContentDetail, getContentList: getContentList, getContentByRowids: getContentByRowids,
    // 发布文章
    createArticle: createArticle,
    // 个人相册
    getAlbumList: getAlbumList, mapAlbumItem: mapAlbumItem, createAlbumItem: createAlbumItem, deleteAlbumItems: deleteAlbumItems,
    // 临时文件上传
    uploadImageToTemp: uploadImageToTemp,
    // 评论
    getComments: getComments, createComment: createComment,
    parseImage: parseImage, mapProduct: mapProduct,
    getShangjiaRowid: getShangjiaRowid, setShangjiaRowid: setShangjiaRowid,
    callMingdaoAPI: callMingdaoAPI,
    // 订单
    getOrders: getOrders, getOrderDetails: getOrderDetails, getOrderItemsByOrder: getOrderItemsByOrder,
    getOrdersWithItems: getOrdersWithItems,
    mapOrder: mapOrder, mapOrderItem: mapOrderItem,
    createOrder: createOrder, createOrderDetails: createOrderDetails,
    updateOrderDetailYzfsl: updateOrderDetailYzfsl,
    updateOrderStatus: updateOrderStatus,
    updateOrderDetailStatus: updateOrderDetailStatus,
    // 用户
    getUserOrgs: getUserOrgs,
    getUserInfoByRowid: getUserInfoByRowid,
    getUserRowidByOpenid: getUserRowidByOpenid,
    updateUserNickname: updateUserNickname,
    updateUserAvatar: updateUserAvatar,
    // 收货地址
    getAddresses: getAddresses, createAddress: createAddress,
    updateAddress: updateAddress, deleteAddress: deleteAddress,
    getUserDefaultAddressRowid: getUserDefaultAddressRowid,
    setUserDefaultAddressRowid: setUserDefaultAddressRowid,
    getAddressLevel: getAddressLevel,
    // 十二维 JSON 自动创建
    create12weiTree: create12weiTree,
    flatten12weiTree: flatten12weiTree
  };
})();
