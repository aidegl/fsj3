/**
 * 明道云 HAP v3 API 封装
 * 参考同檐er项目 wxapp/pages/index/index.js 的调用方式
 */
var HapApi = (function () {
  'use strict';

  var CONFIG = {
    baseURL: 'https://api.mingdao.com/v3',
    appKey: '6ae7c57929f9ed30',
    sign: 'OWQ3YjYxOGU3MWUyZThmODM5Zjc3YThhMTc4MDZhYTc4ZWI5YjA0NDdlNDNiYmUxZmMwMGY3MDFjMTg1YmMwZQ==',
    worksheetId: {
      product: '67b9d2ab322edd7d3c5424c0'
    }
  };

  // 商品表字段 ID
  var PRODUCT_FIELDS = {
    name: '6718e0c91064261092224e30',           // 商品名称
    coverImage: '6718e0c91064261092224e32',    // 封面图
    price: '67232e28a6330dcf75ac36ed',         // 售价（全额价）
    category0: '677607499e007e4411067520',     // 分类（关联字段）
    shangjia: '68c566c7ae63d696e10266d3',      // 上架（复选框）
    hezija: '69cb6be62304b0580851f971',        // 盒子价
    kucun: '69cb6be62304b0580851f972',         // 库存
    xiangoushuliang: '69cb6be62304b0580851f973', // 限购数量
    quanzhong: '68c5670ca7762faa4242d99c'      // 权重（排序）
  };

  // 分类名称 → 关联表记录 rowid 映射
  var CATEGORY_ROWID_MAP = {
    '': '',
    '饮品': 'ad5c026d-53fc-43c6-ac0f-76f14b014925',
    '零食': 'bb8c348c-bfb0-427f-ab45-5cc940286352',
    '主食': 'a832bf3d-5eb5-4583-b352-b105bf668540',
    '日用品': 'c754a26c-b9f3-4139-8004-ffbae6a165f9'
  };

  /**
   * 请求 HAP v3 API
   */
  function request(endpoint, data) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', CONFIG.baseURL + endpoint, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('HAP-Appkey', CONFIG.appKey);
      xhr.setRequestHeader('HAP-Sign', CONFIG.sign);
      xhr.timeout = 10000;

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          try {
            var res = JSON.parse(xhr.responseText);
            resolve(res);
          } catch (e) {
            reject(new Error('解析失败: ' + e.message));
          }
        }
      };

      xhr.onerror = function () {
        reject(new Error('网络请求失败'));
      };

      xhr.ontimeout = function () {
        reject(new Error('请求超时'));
      };

      xhr.send(JSON.stringify(data));
    });
  }

  /**
   * 获取商品列表
   * @param {number} pageIndex - 页码，从 1 开始
   * @param {number} pageSize - 每页条数
   * @param {string} categoryName - 分类名称（如 '饮品'，空字符串表示全部）
   * @param {string} keyword - 搜索关键词
   */
  function getProductList(pageIndex, pageSize, categoryName, keyword) {
    var filters = [{
      type: 'condition',
      field: PRODUCT_FIELDS.shangjia,
      operator: 'eq',
      value: [true]
    }];

    // 分类筛选
    if (categoryName && CATEGORY_ROWID_MAP.hasOwnProperty(categoryName)) {
      filters.push({
        type: 'condition',
        field: PRODUCT_FIELDS.category0,
        operator: 'belongsto',
        value: [CATEGORY_ROWID_MAP[categoryName]]
      });
    }

    // 关键词搜索
    if (keyword) {
      filters.push({
        type: 'condition',
        field: PRODUCT_FIELDS.name,
        operator: 'contains',
        value: [keyword]
      });
    }

    return request('/app/worksheets/' + CONFIG.worksheetId.product + '/rows/list', {
      pageIndex: pageIndex,
      pageSize: pageSize,
      filter: {
        type: 'group',
        logic: 'AND',
        children: filters
      },
      sorts: [
        { field: PRODUCT_FIELDS.quanzhong, isAsc: false }
      ]
    });
  }

  /**
   * 解析明道云图片字段
   */
  function parseImage(imageField) {
    if (!imageField) return '';
    if (typeof imageField === 'string') {
      try {
        var parsed = JSON.parse(imageField);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed[0].large_thumbnail_full_path ||
                 parsed[0].middle_thumbnail_full_path ||
                 parsed[0].downloadUrl ||
                 parsed[0].url || '';
        }
        return '';
      } catch (e) {
        return '';
      }
    }
    if (Array.isArray(imageField) && imageField.length > 0) {
      return imageField[0].large_thumbnail_full_path ||
             imageField[0].downloadUrl || '';
    }
    return '';
  }

  /**
   * 将 HAP 原始数据转换为前端可用格式
   */
  function mapProduct(row) {
    return {
      id: row.rowId || '',
      name: row[PRODUCT_FIELDS.name] || row.name || '',
      price: parseFloat(row[PRODUCT_FIELDS.price] || row.price) || 0,
      boxPrice: parseFloat(row[PRODUCT_FIELDS.hezija] || row.hezija) || 0,
      stock: parseInt(row[PRODUCT_FIELDS.kucun] || row.kucun) || 999,
      limit: parseInt(row[PRODUCT_FIELDS.xiangoushuliang] || row.xiangoushuliang) || 999,
      imageUrl: parseImage(row[PRODUCT_FIELDS.coverImage] || row.coverImage)
    };
  }

  return {
    CONFIG: CONFIG,
    PRODUCT_FIELDS: PRODUCT_FIELDS,
    CATEGORY_ROWID_MAP: CATEGORY_ROWID_MAP,
    getProductList: getProductList,
    parseImage: parseImage,
    mapProduct: mapProduct
  };
})();
