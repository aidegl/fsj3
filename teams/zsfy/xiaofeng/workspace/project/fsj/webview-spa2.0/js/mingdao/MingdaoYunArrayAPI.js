/**
 * 明道云批量查询 API（H5 浏览器版本，使用 fetch）
 */
var MingDaoYunArrayAPI = (function () {
  function MingDaoYunArrayAPI() {
    this.appKey = '59c7bdc2cdf74e5e';
    this.sign = 'YTkzMjE4NGE3YThmYTE1Nzc4ODE5YTYxYzg3ZGM0YTZhZGMxZWJkMDU4ZTA0MzIwOWE5NDMzOTQ2MTRhNTk2Ng==';
    this.baseUrl = 'https://api.mingdao.com/v2/open/worksheet/getFilterRows';
  }

  MingDaoYunArrayAPI.prototype.getData = function (params) {
    var self = this;
    var filters = params.filters || [];
    var filtersJson = typeof filters === 'string' ? filters : JSON.stringify(filters);

    var requestBody = {
      appKey: params.appKey || this.appKey,
      sign: params.sign || this.sign,
      worksheetId: params.worksheetId,
      viewId: params.viewId || '',
      pageSize: params.pageSize || 50,
      pageIndex: params.pageIndex || 1,
      keyWords: params.keyWords || '',
      listType: params.listType || 0,
      controls: Array.isArray(params.controls) ? params.controls : [],
      filters: JSON.parse(filtersJson),
      sortId: params.sortId || '',
      isAsc: params.isAsc || 'false',
      notGetTotal: params.notGetTotal || 'false',
      useControlId: params.useControlId || 'false',
      getSystemControl: params.getSystemControl || 'false'
    };

    console.log('[MingDaoYunArrayAPI] 请求体:', JSON.stringify(requestBody));

    return fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    }).then(function (response) {
      return response.json();
    }).then(function (res) {
      console.log('[MingDaoYunArrayAPI] 返回结果:', JSON.stringify(res));
      if (res.success) {
        return { success: true, data: res.data };
      } else {
        return { success: false, error_msg: res.error_msg || '查询失败', error_code: res.error_code || 10101 };
      }
    }).catch(function (err) {
      console.error('[MingDaoYunArrayAPI] 请求失败:', err);
      return { success: false, error_msg: '网络错误: ' + err.message, error_code: 99999 };
    });
  };

  return MingDaoYunArrayAPI;
})();
