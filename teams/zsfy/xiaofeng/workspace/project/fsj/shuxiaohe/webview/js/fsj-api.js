/**
 * fsj 商品数据 API - 经 Node 代理（mingdao-proxy）调用明道云
 * appKey/sign 不暴露在前端（服务端注入），响应即明道云原始 JSON
 * 2026-09-04 从 Dify 迁移至 Node 代理（详见 api/通用API接口文档-Node版.md）
 */
var FsjApi = (function () {
  'use strict';

  // ========== 配置 ==========
  var MINGDAO_PROXY = 'https://100000whys.cn/mingdao';

  var WORKSHEET_ID = '6a03ceaa7e29abcb297cbdfc'; // fsj 商品表
  var VIEW_ID = ''; // 默认视图（留空使用全部数据）

  // 订单相关表
  var ORDER_WORKSHEET_ID = '6a03c9aee37b5f883e0c99f6'; // 订单表
  var ORDER_DETAIL_WORKSHEET_ID = '6a03cb851077554405a9e587'; // 订单明细表
  var USER_WORKSHEET_ID = '69b0077358322d512e60bad0'; // 用户表

  // 明道云 API 端点
  var MINGDAO_API = 'https://api.mingdao.com/v2/open/worksheet/getFilterRows';
  var MINGDAO_ADD_API = 'https://api.mingdao.com/v2/open/worksheet/addRow';
  var MINGDAO_ADD_ROWS_API = 'https://api.mingdao.com/v2/open/worksheet/addRows';
  var MINGDAO_UPDATE_API = 'https://api.mingdao.com/v2/open/worksheet/editRow';
  var MINGDAO_GET_ROW_API = 'https://api.mingdao.com/v2/open/worksheet/getRowByIdPost';

  // 分类名称 → 关联表记录 rowid 映射
  var CATEGORY_ROWID_MAP = {
    '': '',
    '饮品': '3f944d84-ebfe-4b7f-ad2e-7d8a1670e5a8',
    '零食': 'ce5b3049-a06f-4a1e-ad05-edea9fcf1a98',
    '主食': '551eea77-e923-4490-80b1-58672ec1adad',
    '日用品': '71b143d5-cab2-459d-b3fd-1d2bca40e792'
  };

  // 商家 rowid（从 URL 参数获取，缓存到这里）
  var _shangjiaRowid = '';

  /**
   * 从 URL 参数获取商家 rowid
   */
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
    return '';
  }

  /**
   * 调用 Node 代理（mingdao-proxy）
   * @param {string} url - 明道云 API 地址
   * @param {Object} body - 请求体（不含 appKey/sign，服务端注入）
   * @returns {Promise<Object>} 明道云原始返回数据（无包裹）
   */
  function callMingdaoAPI(url, body) {
    console.log('[API] callMingdaoAPI 调用:', url);
    console.log('[API] 请求体:', JSON.stringify(body));

    if (typeof window.logDebug === 'function') {
      window.logDebug('[Mingdao] POST ' + url.split('/').pop() + ' 请求: ' + JSON.stringify(body).substring(0, 200));
    }

    return fetch(MINGDAO_PROXY, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: url,
        input: body
      })
    })
    .then(function (res) {
      console.log('[API] 代理响应状态:', res.status);
      if (!res.ok) throw new Error('网络请求失败: ' + res.status);
      return res.json();
    })
    .then(function (result) {
      if (typeof window.logDebug === 'function') {
        window.logDebug('[Mingdao] 响应: ' + JSON.stringify(result).substring(0, 300));
      }
      console.log('[API] 返回结果:', JSON.stringify(result).substring(0, 500));
      return result;
    });
  }

  /**
   * 解析图片字段
   */
  function parseImage(imageField) {
    if (!imageField) return '';
    if (typeof imageField === 'string') {
      try {
        var parsed = JSON.parse(imageField);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed[0].large_thumbnail_full_path ||
                 parsed[0].thumbnail_full_path ||
                 parsed[0].file_path + parsed[0].file_name || '';
        }
      } catch (e) {}
    }
    if (Array.isArray(imageField) && imageField.length > 0) {
      return imageField[0].large_thumbnail_full_path ||
             imageField[0].downloadUrl || '';
    }
    return '';
  }

  /**
   * 解析商家关联字段
   */
  function parseShangjia(shangjiaField) {
    if (!shangjiaField) return '';
    try {
      var list = typeof shangjiaField === 'string' ? JSON.parse(shangjiaField) : shangjiaField;
      return list.length > 0 ? list[0].name : '';
    } catch (e) {
      return '';
    }
  }

  /**
   * 解析分类关联字段
   */
  function parseCategory(categoryField) {
    if (!categoryField) return '';
    try {
      var list = typeof categoryField === 'string' ? JSON.parse(categoryField) : categoryField;
      return list.length > 0 ? list[0].name : '';
    } catch (e) {
      return '';
    }
  }

  /**
   * 解析关联字段的 rowid（提取 sid）
   */
  function parseRelRowid(relField) {
    if (!relField) return '';
    try {
      var list = typeof relField === 'string' ? JSON.parse(relField) : relField;
      return list.length > 0 ? (list[0].sid || list[0].rowid || '') : '';
    } catch (e) {
      return '';
    }
  }

  /**
   * 将 fsj 商品数据转换为前端格式
   */
  function mapProduct(row) {
    return {
      id: row.rowid || '',
      code: row.auto_number || row.zdbh || '',
      name: row.title || row.mingcheng || '',
      price: parseFloat(row.sell_price || row.shoujia) || 0,
      boxPrice: parseFloat(row.tejia) || 0,
      imageUrl: parseImage(row.attachments || row.zhutu),
      stock: 999,
      limit: 999,
      shangjia: parseShangjia(row.org || row.shangjia2),
      category: parseCategory(row.category || row.spfl),
      weight: parseInt(row.weight || row.quanzhong) || 0,
      description: row.description || row.miaoshu || '',
      leixing: row.kind || row.leixing || ''
    };
  }

  /**
   * 前端 JS 过滤：只保留指定商家的商品
   * （Coze workflow 暂时不支持 filters 数组格式，先用前端过滤）
   */
  function filterByShangjia(rows, shangjiaRowid) {
    if (!shangjiaRowid) return rows;
    return rows.filter(function (row) {
      if (!row.org && !row.shangjia2) return false;
      try {
        var shangjiaList = JSON.parse(row.org || row.shangjia2);
        return shangjiaList.some(function (item) {
          return item.sid === shangjiaRowid;
        });
      } catch (e) {
        return false;
      }
    });
  }

  /**
   * 前端 JS 过滤：按分类筛选
   * fsj 表的 spfl 是关联记录，需要匹配分类 rowid
   */
  function filterByCategory(rows, categoryName) {
    if (!categoryName || !CATEGORY_ROWID_MAP.hasOwnProperty(categoryName)) return rows;
    var categoryRowid = CATEGORY_ROWID_MAP[categoryName];
    if (!categoryRowid) return rows;
    return rows.filter(function (row) {
      if (!row.category && !row.spfl) return false;
      try {
        var catList = JSON.parse(row.category || row.spfl);
        return catList.some(function (item) {
          return item.sid === categoryRowid || item.rowid === categoryRowid;
        });
      } catch (e) {
        return false;
      }
    });
  }

  /**
   * 前端 JS 过滤：排除积分商城商品（首页用）
   * leixing='积分商城' 的商品不显示在首页，只在积分商城页面展示
   */
  function excludePointsProducts(rows) {
    return rows.filter(function (row) {
      return (row.kind || row.leixing) !== '积分商城';
    });
  }

  /**
   * 前端 JS 过滤：只保留积分商城商品
   */
  function filterPointsProducts(rows) {
    return rows.filter(function (row) {
      return (row.kind || row.leixing) === '积分商城';
    });
  }

  // 数据缓存
  var _cache = {
    keyword: '',       // 当前缓存的关键词
    allRows: [],       // 全部已加载的原始行数据
    backendTotal: 0,   // 后端返回的总记录数
    loading: false,    // 是否正在加载中
    backendPageIndex: 0 // 当前已加载到的后端页码
  };

  var BACKEND_PAGE_SIZE = 50;

  /**
   * 清空缓存
   */
  function clearCache() {
    _cache.allRows = [];
    _cache.backendTotal = 0;
    _cache.loading = false;
    _cache.backendPageIndex = 0;
  }

  /**
   * 从后端加载一页数据
   * @param {number} pageIndex - 页码
   * @param {string} keyword - 搜索关键词
   * @param {string} shangjiaRowid - 商家 rowid（用于后端过滤）
   */
  function loadBackendPage(pageIndex, keyword, shangjiaRowid) {
    var body = {
      worksheetId: WORKSHEET_ID,
      pageSize: BACKEND_PAGE_SIZE,
      pageIndex: pageIndex,
      listType: 0
    };
    if (keyword) {
      body.keyWords = keyword;
    }
    // 商家过滤 + 逻辑删除过滤
    if (shangjiaRowid) {
      body.filters = [
        {
          controlId: 'org',
          dataType: 29,
          spliceType: 1,
          filterType: 24,
          value: shangjiaRowid
        },
        {
          controlId: 'is_deleted',
          dataType: 2,
          spliceType: 1,
          filterType: 6,
          value: '1'
        }
      ];
    }

    return callMingdaoAPI(MINGDAO_API, body)
      .then(function (res) {
        if (!res.success || !res.data.rows) {
          _cache.loading = false;
          return { rows: [], total: 0 };
        }
        _cache.backendTotal = res.data.total || res.data.totalCount || 0;
        _cache.allRows = _cache.allRows.concat(res.data.rows);
        _cache.backendPageIndex = pageIndex;
        _cache.loading = false;
        return { rows: res.data.rows, total: _cache.backendTotal };
      })
      .catch(function (err) {
        _cache.loading = false;
        throw err;
      });
  }

  /**
   * 获取商品列表
   * @param {number} pageIndex - 页码
   * @param {number} pageSize - 每页条数
   * @param {string} categoryName - 分类名称
   * @param {string} keyword - 搜索关键词
   */
  function getProductList(pageIndex, pageSize, categoryName, keyword) {
    var shangjiaRowid = getShangjiaRowid();

    // 没有商家参数，不显示商品
    if (!shangjiaRowid) {
      return Promise.resolve({
        success: true,
        data: { rows: [], total: 0, totalCount: 0 }
      });
    }

    // 切换关键词时清空缓存
    if (keyword !== _cache.keyword) {
      clearCache();
      _cache.keyword = keyword;
    }

    // 缓存已全部加载完，直接从缓存分页
    if (_cache.backendTotal > 0 && _cache.allRows.length >= _cache.backendTotal) {
      var filtered = applyFilters(_cache.allRows, shangjiaRowid, categoryName);
      var filteredTotal = filtered.length;
      var start = (pageIndex - 1) * pageSize;
      var end = start + pageSize;
      var pageRows = filtered.slice(start, end);
      return Promise.resolve({
        success: true,
        data: { rows: pageRows, total: filteredTotal, totalCount: filteredTotal }
      });
    }

    // 正在加载中
    if (_cache.loading) {
      return Promise.resolve({
        success: true,
        data: { rows: [], total: 0, totalCount: 0 }
      });
    }

    _cache.loading = true;

    // 第一次：只加载一页后端数据
    function loadOnePage() {
      return loadBackendPage(_cache.backendPageIndex + 1, keyword, shangjiaRowid).then(function () {
        _cache.loading = false;
        var filtered = applyFilters(_cache.allRows, shangjiaRowid, categoryName);
        var filteredTotal = filtered.length;

        // 用比例估算总数量
        var loadRatio = _cache.allRows.length / _cache.backendTotal;
        var projectedTotal = Math.round(filteredTotal / loadRatio);

        var start = (pageIndex - 1) * pageSize;
        var end = start + pageSize;
        var pageRows = filtered.slice(start, end);

        return {
          success: true,
          data: {
            rows: pageRows,
            total: projectedTotal,
            totalCount: projectedTotal
          }
        };
      });
    }

    return Promise.resolve(loadOnePage());
  }

  /**
   * 应用分类过滤（首页用，排除积分商城商品）
   * 注意：商家过滤已在后端完成，前端只做分类和类型过滤
   */
  function applyFilters(rows, shangjiaRowid, categoryName) {
    var result = excludePointsProducts(rows);
    if (categoryName) {
      result = filterByCategory(result, categoryName);
    }
    return result;
  }

  /**
   * 获取积分商城商品列表
   */
  function getPointsProductList(pageIndex, pageSize, keyword) {
    var shangjiaRowid = getShangjiaRowid();

    if (!shangjiaRowid) {
      return Promise.resolve({
        success: true,
        data: { rows: [], total: 0, totalCount: 0 }
      });
    }

    // 关键词切换时清空缓存（复用同一份缓存，不区分关键词）
    if (keyword !== _cache.keyword) {
      clearCache();
      _cache.keyword = keyword;
    }

    // 缓存已全部加载完，直接从缓存分页
    if (_cache.backendTotal > 0 && _cache.allRows.length >= _cache.backendTotal) {
      var filtered = filterPointsProducts(_cache.allRows);
      if (keyword) {
        filtered = filtered.filter(function (row) {
          return (row.title || row.mingcheng) && (row.title || row.mingcheng).indexOf(keyword) !== -1;
        });
      }
      var filteredTotal = filtered.length;
      var start = (pageIndex - 1) * pageSize;
      var end = start + pageSize;
      var pageRows = filtered.slice(start, end);
      return Promise.resolve({
        success: true,
        data: { rows: pageRows, total: filteredTotal, totalCount: filteredTotal }
      });
    }

    // 正在加载中
    if (_cache.loading) {
      return Promise.resolve({
        success: true,
        data: { rows: [], total: 0, totalCount: 0 }
      });
    }

    _cache.loading = true;

    // 加载一页后端数据
    function loadOnePage() {
      return loadBackendPage(_cache.backendPageIndex + 1, keyword, shangjiaRowid).then(function () {
        _cache.loading = false;
        var filtered = filterPointsProducts(_cache.allRows);
        if (keyword) {
          filtered = filtered.filter(function (row) {
            return (row.title || row.mingcheng) && (row.title || row.mingcheng).indexOf(keyword) !== -1;
          });
        }
        var filteredTotal = filtered.length;

        var loadRatio = _cache.allRows.length / _cache.backendTotal;
        var projectedTotal = Math.round(filteredTotal / loadRatio);

        var start = (pageIndex - 1) * pageSize;
        var end = start + pageSize;
        var pageRows = filtered.slice(start, end);

        return {
          success: true,
          data: {
            rows: pageRows,
            total: projectedTotal,
            totalCount: projectedTotal
          }
        };
      });
    }

    return Promise.resolve(loadOnePage());
  }

  // ========== 订单相关 API ==========

  /**
   * 通过 openid 查询用户 rowid
   * @param {string} openid - 用户 openid
   * @returns {Promise<string>} 用户 rowid
   */
  function getUserRowidByOpenid(openid) {
    return getUserInfo(openid).then(function (info) {
      return info.rowid;
    });
  }

  /**
   * 通过 openid 查询用户完整信息（rowid + 余额 + 积分）
   * @param {string} openid - 用户 openid
   * @returns {Promise<Object>} { rowid, balance, jifen }
   */
  function getUserInfo(openid) {
    var body = {
      worksheetId: USER_WORKSHEET_ID,
      filter: {
        relation: 1,
        fields: [{
          fieldId: '69b5db58a606df9d8178a03e',
          type: 3,
          value: openid
        }]
      },
      page: 1,
      pageSize: 1
    };

    return callMingdaoAPI(MINGDAO_API, body).then(function (res) {
      if (res.success && res.data.rows && res.data.rows.length > 0) {
        var row = res.data.rows[0];
        return {
          rowid: row.rowid,
          balance: parseFloat(row.yue) || 0,
          jifen: parseInt(row.jifen) || 0
        };
      }
      throw new Error('未找到用户');
    });
  }

  /**
   * 通过用户 rowid 查询用户信息（余额、积分）
   * @param {string} userRowid - 用户 rowid
   * @returns {Promise<Object>} { rowid, balance, jifen }
   */
  /**
   * 通过用户 rowid 查询用户信息（余额、积分）— 用 getRowByIdPost 查单条
   */
  function getUserInfoByRowid(userRowid) {
    console.log('[API] getUserInfoByRowid 开始, rowid:', userRowid);
    var body = {
      worksheetId: USER_WORKSHEET_ID,
      rowId: userRowid,
      getSystemControl: 'false'
    };
    console.log('[API] getUserInfoByRowid body:', JSON.stringify(body));

    return callMingdaoAPI(MINGDAO_GET_ROW_API, body).then(function (res) {
      console.log('[API] getUserInfoByRowid 返回:', JSON.stringify(res));
      if (res.success && res.data) {
        var row = res.data;
        console.log('[API] 用户数据 row:', JSON.stringify(row).substring(0, 300));
        return {
          rowid: row.rowId || row.rowid,
          balance: parseFloat(row.yue) || 0,
          jifen: parseInt(row.jifen) || 0
        };
      }
      console.warn('[API] 未找到用户, success:', res.success);
      throw new Error('未找到用户');
    });
  }

  /**
   * 创建订单主记录
   * @param {Object} orderData - { shangjiaRowid, jueseRowid, zhuangtai, fkfs, addressRowid }
   * @returns {Promise<string>} 订单 rowid
   */
  function createOrder(orderData) {
    var controls = [
      { controlId: 'shangjia', value: orderData.shangjiaRowid },
      { controlId: 'juese', value: orderData.jueseRowid },
      { controlId: 'shdz', value: orderData.shdz || '' },
      { controlId: 'zhuangtai', value: orderData.zhuangtai || '待送达', valueType: 2 },
      { controlId: 'kaifeng', value: '0' },
      { controlId: 'fkfs', value: orderData.fkfs || '微信支付', valueType: 2 },
      { controlId: '_owner', value: 'ae75cf2e-0f73-4137-9e99-116d92c45a47' }
    ];

    // 订单明细关联：用 values 传入明细 rowid 数组
    if (orderData.detailRowids && orderData.detailRowids.length > 0) {
      controls.push({ controlId: 'ddmx', values: orderData.detailRowids });
    } else {
      controls.push({ controlId: 'ddmx', value: '' });
    }

    // 支付金额字段
    if (orderData.yue !== undefined && orderData.yue !== null) controls.push({ controlId: 'yue', value: parseFloat(orderData.yue) });
    if (orderData.jinfen !== undefined && orderData.jinfen !== null) controls.push({ controlId: 'jinfen', value: parseFloat(orderData.jinfen) });
    if (orderData.jine !== undefined && orderData.jine !== null) controls.push({ controlId: 'jine', value: parseFloat(orderData.jine) });

    // 打印每个 control 的详细信息用于调试
    console.log('[OrderAPI] ===== controls 逐项详情 =====');
    for (var ci = 0; ci < controls.length; ci++) {
      console.log('[OrderAPI]   [' + ci + '] controlId=' + controls[ci].controlId + ', value=' + JSON.stringify(controls[ci].value) + ', valueType=' + (controls[ci].valueType || '无'));
    }
    console.log('[OrderAPI] ================================');

    var body = {
      worksheetId: ORDER_WORKSHEET_ID,
      triggerWorkflow: true,
      controls: controls,
      getSystemControl: 'false'
    };

    console.log('[OrderAPI] ===== 创建订单完整请求体 =====');
    console.log('[OrderAPI] URL: ' + MINGDAO_ADD_API);
    console.log('[OrderAPI] Body: ' + JSON.stringify(body));
    console.log('[OrderAPI] ================================');

    if (typeof window.logDebug === 'function') {
      window.logDebug('[createOrder] 请求: ' + JSON.stringify(body).substring(0, 300));
    }

    return callMingdaoAPI(MINGDAO_ADD_API, body).then(function (res) {
      console.log('[OrderAPI] 订单 addRow 完整返回:', JSON.stringify(res).substring(0, 500));
      if (res.success && res.data) {
        // res.data 直接是 rowid 字符串
        var rowid = typeof res.data === 'string' ? res.data : res.data.rowid || res.data.rowId;
        console.log('[OrderAPI] 订单创建成功, rowid:', rowid);
        return rowid;
      }
      throw new Error(res.error || '订单创建失败');
    });
  }

  /**
   * 逐条创建订单明细，返回明细 rowid 数组
   * @param {string} orderRowid - 订单 rowid（用于 dingdan 关联）
   * @param {string} jueseRowid - 用户 rowid
   * @param {Array} items - [{ productRowid, shuliang, tejia, shoujia, zhuangtai, fkfs }]
   * @returns {Promise<Array>} 明细 rowid 列表
   */
  function createOrderDetails(orderRowid, jueseRowid, items) {
    console.log('[OrderAPI] createOrderDetails 入口, orderRowid:', orderRowid, ', jueseRowid:', jueseRowid, ', items:', items.length);
    // 逐条创建，每条返回一个 rowid
    var promises = items.map(function (item) {
      var controls = [
        { controlId: 'dingdan', value: orderRowid },
        { controlId: 'juese', value: jueseRowid },
        { controlId: 'shuliang', value: item.shuliang || 1 },
        { controlId: 'tejia', value: parseFloat(item.tejia) || 0 },
        { controlId: 'shoujia', value: parseFloat(item.shoujia) || 0 },
        { controlId: 'goumaijia', value: parseFloat(item.goumaijia) || parseFloat(item.tejia) || 0 }
      ];

      // spspu 是关联商品字段，直接用 value 字符串
      if (item.productRowid) {
        controls.push({ controlId: 'spspu', value: item.productRowid });
      } else {
        controls.push({ controlId: 'spspu', value: '' });
      }

      if (item.zhuangtai !== undefined) controls.push({ controlId: 'zhuangtai', value: item.zhuangtai, valueType: 2 });
      if (item.fkfs !== undefined) controls.push({ controlId: 'fkfs', value: item.fkfs });

      var body = {
        worksheetId: ORDER_DETAIL_WORKSHEET_ID,
        triggerWorkflow: true,
        controls: controls,
        getSystemControl: 'false'
      };

      console.log('[OrderAPI] 创建订单明细:', JSON.stringify(body));

      return callMingdaoAPI(MINGDAO_ADD_API, body).then(function (res) {
        console.log('[OrderAPI] 明细 addRow 完整返回:', JSON.stringify(res).substring(0, 500));
        if (res.success && res.data) {
          var rowid = typeof res.data === 'string' ? res.data : res.data.rowid || res.data.rowId;
          console.log('[OrderAPI] 订单明细创建成功, rowid:', rowid);
          return rowid;
        }
        throw new Error(res.error_msg || res.error || '订单明细创建失败');
      });
    });

    return Promise.all(promises);
  }
  /**
   * 更新用户余额
   * @param {string} userRowid - 用户 rowid
   * @param {number} newBalance - 新余额
   * @returns {Promise}
   */
  function updateUserBalance(userRowid, newBalance) {
    var body = {
      worksheetId: USER_WORKSHEET_ID,
      rowId: userRowid,
      controls: [
        { controlId: 'yue', value: newBalance }
      ],
      getSystemControl: 'false'
    };

    console.log('[OrderAPI] 更新用户余额:', userRowid, '新余额:', newBalance);

    return callMingdaoAPI(MINGDAO_UPDATE_API, body).then(function (res) {
      if (res.success) {
        console.log('[OrderAPI] 余额更新成功');
      } else {
        console.error('[OrderAPI] 余额更新失败:', res.error);
      }
    });
  }

  /**
   * 更新订单状态
   * @param {string} orderRowid - 订单 rowid
   * @param {string} status - 新状态
   * @returns {Promise}
   */
  function updateOrderStatus(orderRowid, status) {
    var body = {
      worksheetId: ORDER_WORKSHEET_ID,
      rowId: orderRowid,
      controls: [
        { controlId: 'zhuangtai', value: status, valueType: 2 }
      ],
      getSystemControl: 'false'
    };

    console.log('[OrderAPI] 更新订单状态:', orderRowid, status);

    return callMingdaoAPI(MINGDAO_UPDATE_API, body).then(function (res) {
      if (res.success) {
        console.log('[OrderAPI] 订单状态更新成功');
      } else {
        console.warn('[OrderAPI] 订单状态更新失败:', res.error_msg || res.error);
      }
    }).catch(function (err) {
      // Coze 代理不支持 updateRow（返回405），不影响订单已创建成功的事实
      console.warn('[OrderAPI] 订单状态更新接口不可用（代理不支持）:', err.message);
    });
  }

  /**
   * 获取用户的先享后付订单明细
   * @param {string} userRowid - 用户 rowid
   * @returns {Promise<Array>} 订单明细列表
   */
  function getOrderDetails(userRowid) {
    var body = {
      worksheetId: ORDER_DETAIL_WORKSHEET_ID,
      pageSize: 1000,
      pageIndex: 1,
      listType: 0,
      controls: ['ddid', 'dingdan', 'juese', 'spspu', 'zhutu', 'mingcheng', 'tejia', 'shoujia', 'goumaijia', 'shuliang', 'zhuangtai', 'fkfs', 'yzfsl'],
      filters: [
        {
          controlId: 'juese',
          dataType: 29,
          spliceType: 1,
          filterType: 24,
          value: userRowid
        },
        {
          controlId: 'fkfs',
          dataType: 5,
          spliceType: 1,
          filterType: 1,
          value: '先享后付'
        }
      ]
    };

    console.log('[OrderAPI] 获取订单明细, 用户:', userRowid);

    return callMingdaoAPI(MINGDAO_API, body).then(function (res) {
      if (!res.success || !res.data.rows) {
        return [];
      }
      var rows = res.data.rows;
      console.log('[OrderAPI] 获取到', rows.length, '条订单明细');
      if (rows.length > 0) {
        console.log('[OrderAPI] 第一条明细原始数据:', JSON.stringify(rows[0]).substring(0, 500));
      }

      // 解析并转换为前端格式
      return rows.map(function (row) {
        var productInfo = parseProductInfo(row.spspu);
        // 优先用明细表自带的 zhutu/mingcheng，其次用关联商品的信息
        var imageUrl = parseImage(row.attachments || row.zhutu) || productInfo.imageUrl;
        var productName = row.mingcheng || productInfo.name;
        if (!productInfo.rowid) {
          console.warn('[OrderAPI] spspu解析失败, 原始spspu:', JSON.stringify(row.spspu).substring(0, 300));
        }
        return {
          rowid: row.rowid || row.ddid || '',
          orderRowid: parseRelRowid(row.dingdan),
          productId: productInfo.rowid,
          spspuRaw: row.spspu,
          productName: productName,
          imageUrl: imageUrl,
          boxPrice: parseFloat(row.tejia) || 0,
          shoujia: parseFloat(row.shoujia) || 0,
          goumaijia: parseFloat(row.goumaijia) || 0,
          shuliang: parseInt(row.shuliang) || 1,
          yizhifuShuliang: parseInt(row.yzfsl) || 0,
          zhuangtai: row.zhuangtai || '待送达',
          fkfs: row.fkfs || '先享后付'
        };
      });
    });
  }

  /**
   * 解析商品关联字段（订单明细中的 spspu）
   */
  function parseProductInfo(productField) {
    if (!productField) return { rowid: '', name: '', imageUrl: '' };
    try {
      var list = typeof productField === 'string' ? JSON.parse(productField) : productField;
      if (Array.isArray(list) && list.length > 0) {
        var item = list[0];
        // 尝试多种可能的字段名
        var rowid = item.sid || item.rowid || item.recordId || item.id || '';
        // 如果 rowid 是对象（明道云关联记录格式），取其中的 sid 或 rowid
        if (rowid && typeof rowid === 'object') {
          rowid = rowid.sid || rowid.rowid || '';
        }
        return {
          rowid: rowid,
          name: item.name || item.text || '',
          imageUrl: parseImage(item.zhutu || item.image)
        };
      }
      // 如果 spspu 是纯字符串（不是数组），直接当作 rowid
      if (typeof productField === 'string' && productField.indexOf('[') !== 0) {
        return { rowid: productField, name: '', imageUrl: '' };
      }
    } catch (e) {}
    return { rowid: '', name: '', imageUrl: '' };
  }

  /**
   * 更新订单明细状态
   * @param {string} detailRowid - 订单明细 rowid
   * @param {string} status - 新状态
   * @returns {Promise}
   */
  function updateOrderDetailStatus(detailRowid, status) {
    var body = {
      worksheetId: ORDER_DETAIL_WORKSHEET_ID,
      rowId: detailRowid,
      controls: [
        { controlId: 'zhuangtai', value: status, valueType: 2 }
      ],
      getSystemControl: 'false'
    };

    console.log('[OrderAPI] 更新订单明细状态:', detailRowid, '->', status);

    return callMingdaoAPI(MINGDAO_UPDATE_API, body).then(function (res) {
      if (res.success) {
        console.log('[OrderAPI] 订单明细状态更新成功');
      } else {
        console.warn('[OrderAPI] 订单明细状态更新失败:', res.error_msg || res.error);
        throw new Error(res.error_msg || res.error || '状态更新失败');
      }
    });
  }

  /**
   * 更新订单明细的订单关联（dingdan 字段）
   * @param {string} detailRowid - 订单明细 rowid
   * @param {string} orderRowid - 新订单 rowid
   * @returns {Promise}
   */
  function updateOrderDetailDingdan(detailRowid, orderRowid) {
    var body = {
      worksheetId: ORDER_DETAIL_WORKSHEET_ID,
      rowId: detailRowid,
      controls: [
        { controlId: 'dingdan', value: orderRowid }
      ],
      getSystemControl: 'false'
    };

    console.log('[OrderAPI] 更新明细订单关联:', detailRowid, '->', orderRowid);

    return callMingdaoAPI(MINGDAO_UPDATE_API, body).then(function (res) {
      if (res.success) {
        console.log('[OrderAPI] 明细订单关联成功');
      } else {
        console.warn('[OrderAPI] 明细订单关联失败:', res.error_msg || res.error);
        throw new Error(res.error_msg || res.error || '订单关联失败');
      }
    });
  }

  /**
   * 更新订单明细已支付数量（先享后付专用）
   * @param {string} detailRowid - 订单明细 rowid
   * @param {number} newCount - 新的已支付数量（当前值 + 增加数）
   * @returns {Promise}
   */
  function updateOrderDetailYzfsl(detailRowid, newCount) {
    var body = {
      worksheetId: ORDER_DETAIL_WORKSHEET_ID,
      rowId: detailRowid,
      controls: [
        { controlId: 'yzfsl', value: newCount }
      ],
      getSystemControl: 'false'
    };

    console.log('[OrderAPI] 更新已支付数量:', detailRowid, '->', newCount);
    console.log('[OrderAPI] updateRow body:', JSON.stringify(body));
    if (typeof window.logDebug === 'function') {
      window.logDebug('[updateRow] 请求体: ' + JSON.stringify(body));
    }

    return callMingdaoAPI(MINGDAO_UPDATE_API, body).then(function (res) {
      console.log('[OrderAPI] updateRow 完整响应:', JSON.stringify(res).substring(0, 300));
      if (typeof window.logDebug === 'function') {
        window.logDebug('[updateRow] 响应: ' + JSON.stringify(res).substring(0, 200));
      }
      if (res.success) {
        console.log('[OrderAPI] 已支付数量更新成功');
      } else {
        console.warn('[OrderAPI] 已支付数量更新失败:', res.error_msg || res.error);
        throw new Error(res.error_msg || res.error || '已支付数量更新失败');
      }
    });
  }

  /**
   * 更新订单明细状态为已支付（支付完成后调用）
   * @param {Array<string>} detailRowids - 订单明细 rowid 列表
   * @returns {Promise}
   */
  function payOrderDetails(detailRowids) {
    var promises = detailRowids.map(function (rowid) {
      var body = {
        worksheetId: ORDER_DETAIL_WORKSHEET_ID,
        rowId: rowid,
        controls: [
          { controlId: 'zhuangtai', value: '已支付', valueType: 2 },
          { controlId: 'fkfs', value: '微信支付', valueType: 2 }
        ],
        getSystemControl: 'false'
      };

      console.log('[OrderAPI] 支付订单明细:', rowid);

      return callMingdaoAPI(MINGDAO_UPDATE_API, body).then(function (res) {
        if (res.success) {
          console.log('[OrderAPI] 订单明细支付成功:', rowid);
        } else {
          console.warn('[OrderAPI] 订单明细支付失败:', rowid, res.error_msg || res.error);
          throw new Error(res.error_msg || res.error || '支付失败');
        }
      }).catch(function (err) {
        // Coze 代理可能不支持 updateRow
        console.warn('[OrderAPI] 订单明细更新接口不可用:', err.message);
        throw err;
      });
    });

    return Promise.all(promises);
  }

  // ========== 收货地址 ==========
  var ADDRESS_WORKSHEET_ID = '6a17a1e31721cd9590ab2f34';

  /**
   * 获取用户的默认收货地址 rowid（mrshdz 字段）
   */
  function getUserAddressRowid(userRowid) {
    var body = {
      worksheetId: USER_WORKSHEET_ID,
      rowId: userRowid,
      getSystemControl: 'false'
    };
    return callMingdaoAPI(MINGDAO_GET_ROW_API, body).then(function (res) {
      if (res.success && res.data && res.data.mrshdz) {
        return res.data.mrshdz;
      }
      return '';
    });
  }

  /**
   * 获取用户的收货地址列表（通过 yonghu 关联字段过滤）
   */
  function getUserAddresses(userRowid) {
    var body = {
      worksheetId: ADDRESS_WORKSHEET_ID,
      pageSize: 50,
      pageIndex: 1,
      listType: 0,
      controls: ['rowid', 'mingcheng1', 'mingcheng2', 'mingcheng3', 'dzqc', 'dianhua', 'yonghu'],
      filters: [{
        controlId: 'yonghu',
        dataType: 6,
        spliceType: 1,
        filterType: 24,
        value: userRowid
      }]
    };
    return callMingdaoAPI(MINGDAO_API, body).then(function (res) {
      if (!res.success || !res.data.rows) return [];
      return res.data.rows.map(function (row) {
        return {
          rowid: row.rowid || '',
          mingcheng1: row.mingcheng1 || '',
          mingcheng2: row.mingcheng2 || '',
          mingcheng3: row.mingcheng3 || '',
          dzqc: row.dzqc || '',
          dianhua: row.dianhua || ''
        };
      });
    });
  }

  /**
   * 设置用户的默认收货地址（更新 mrshdz 字段）
   */
  function setUserAddressRowid(userRowid, addressRowid) {
    var body = {
      worksheetId: USER_WORKSHEET_ID,
      rowId: userRowid,
      controls: [
        { controlId: 'mrshdz', value: addressRowid }
      ],
      getSystemControl: 'false'
    };
    return callMingdaoAPI(MINGDAO_UPDATE_API, body).then(function (res) {
      if (res.success) {
        console.log('[AddressAPI] mrshdz 更新成功:', userRowid, '->', addressRowid);
      } else {
        console.warn('[AddressAPI] mrshdz 更新失败:', res.error_msg || res.error);
      }
      return res.success;
    });
  }

  return {
    CONFIG: {
      baseURL: MINGDAO_PROXY,
      worksheetId: {
        product: WORKSHEET_ID,
        order: ORDER_WORKSHEET_ID,
        orderDetail: ORDER_DETAIL_WORKSHEET_ID,
        user: USER_WORKSHEET_ID
      }
    },
    getProductList: getProductList,
    getPointsProductList: getPointsProductList,
    parseImage: parseImage,
    mapProduct: mapProduct,
    getShangjiaRowid: getShangjiaRowid,
    callMingdaoAPI: callMingdaoAPI,
    // 订单相关
    getUserRowidByOpenid: getUserRowidByOpenid,
    getUserInfo: getUserInfo,
    getUserInfoByRowid: getUserInfoByRowid,
    createOrder: createOrder,
    createOrderDetails: createOrderDetails,
    updateUserBalance: updateUserBalance,
    updateOrderStatus: updateOrderStatus,
    // 订单明细相关
    getOrderDetails: getOrderDetails,
    updateOrderDetailDingdan: updateOrderDetailDingdan,
    updateOrderDetailStatus: updateOrderDetailStatus,
    updateOrderDetailYzfsl: updateOrderDetailYzfsl,
    payOrderDetails: payOrderDetails,
    // 地址相关
    getUserAddressRowid: getUserAddressRowid,
    getUserAddresses: getUserAddresses,
    setUserAddressRowid: setUserAddressRowid
  };
})();
