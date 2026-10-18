// 明道云API调用组件（新增数据）- 小程序版（使用 wx.request）
class MingDaoYunAddAPI {
  constructor() {
    this.appKey = "59c7bdc2cdf74e5e";
    this.sign = "YTkzMjE4NGE3YThmYTE1Nzc4ODE5YTYxYzg3ZGM0YTZhZGMxZWJkMDU4ZTA0MzIwOWE5NDMzOTQ2MTRhNTk2Ng==";
    this.baseUrl = "https://api.mingdao.com/v2/open/worksheet/addRow";
  }

  async getData(worksheetId, controls) {
    console.log("[组件日志] 调用明道云addRow接口, worksheetId:", worksheetId);
    console.log("[组件日志] controls:", controls);

    const requestBody = {
      "appKey": this.appKey,
      "sign": this.sign,
      "worksheetId": worksheetId,
      "triggerWorkflow": true,
      "controls": controls,
      "getSystemControl": "false"
    };

    console.log("[组件日志] 请求体:", requestBody);

    return new Promise((resolve) => {
      wx.request({
        url: this.baseUrl,
        method: "POST",
        header: { "Content-Type": "application/json" },
        data: requestBody,
        success: (res) => {
          const mdResult = res.data || {};
          console.log("[组件日志] 明道云返回结果:", mdResult);

          if (mdResult.success) {
            resolve({
              success: true,
              data: mdResult.data,
              error_msg: "",
              error_code: mdResult.error_code || 1
            });
          } else {
            resolve({
              success: false,
              data: null,
              error_msg: mdResult.error_msg || "明道云接口调用失败",
              error_code: mdResult.error_code || 10101
            });
          }
        },
        fail: (err) => {
          console.error("[明道云日志] 请求失败:", err);
          resolve({
            success: false,
            data: null,
            error_msg: `网络错误: ${err.errMsg || "请求失败"}`,
            error_code: 99999
          });
        }
      });
    });
  }
}

module.exports = MingDaoYunAddAPI;
