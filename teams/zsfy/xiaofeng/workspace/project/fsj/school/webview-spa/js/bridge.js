/**
 * 小程序桥接层
 * 在微信环境中与小程序通信
 */
var Bridge = {
  isWxEnv: typeof wx !== 'undefined' && wx.miniProgram,

  /**
   * 向小程序发送消息
   */
  postMessage: function (data) {
    if (this.isWxEnv && wx.miniProgram.postMessage) {
      wx.miniProgram.postMessage({ data: data });
    }
    console.log('[Bridge] postMessage:', data);
  },

  /**
   * 跳转到小程序页面
   */
  navigateTo: function (url) {
    if (this.isWxEnv && wx.miniProgram.navigateTo) {
      wx.miniProgram.navigateTo({ url: url });
    }
  },

  /**
   * 返回小程序上一页
   */
  navigateBack: function () {
    if (this.isWxEnv && wx.miniProgram.navigateBack) {
      wx.miniProgram.navigateBack();
    }
  },

  /**
   * 获取小程序传递的参数
   */
  getQueryParams: function () {
    var params = {};
    var search = window.location.search.substring(1);
    search.split('&').forEach(function (pair) {
      var parts = pair.split('=');
      if (parts[0]) params[parts[0]] = decodeURIComponent(parts[1] || '');
    });
    return params;
  },

  /**
   * 获取hash参数
   */
  getHashParams: function () {
    var params = {};
    var hash = window.location.hash.substring(1);
    hash.split('&').forEach(function (pair) {
      var parts = pair.split('=');
      if (parts[0]) params[parts[0]] = decodeURIComponent(parts[1] || '');
    });
    return params;
  }
};

export default Bridge;
