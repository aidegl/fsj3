// pages/choose-image/index.js
// 专门用于 H5 请求选择图片的中转页

Page({
  onLoad: function () {
    console.log('[ChooseImage] 页面加载');
    this.pickAndUpload();
  },

  pickAndUpload: function () {
    var self = this;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var tempFilePath = res.tempFilePaths[0];
        console.log('[ChooseImage] 图片选择成功:', tempFilePath);
        wx.showLoading({ title: '上传中...' });

        wx.uploadFile({
          url: 'https://100000whys.cn/api/v1/temp/upload',
          filePath: tempFilePath,
          name: 'file',
          success: function (uploadRes) {
            console.log('[ChooseImage] 上传成功:', uploadRes.data);
            try {
              var result = JSON.parse(uploadRes.data);
              var imageUrl = 'https://100000whys.cn' + result.data.url;
              // 通过 postMessage 返回结果给 H5
              wx.miniProgram.postMessage({
                data: { type: 'imagePickResult', data: { success: true, url: imageUrl } }
              });
              // 返回上一页
              setTimeout(function () {
                wx.navigateBack();
              }, 500);
            } catch (e) {
              wx.hideLoading();
              wx.miniProgram.postMessage({
                data: { type: 'imagePickResult', data: { success: false, error: '上传结果解析失败' } }
              });
              setTimeout(function () {
                wx.navigateBack();
              }, 500);
            }
          },
          fail: function (err) {
            wx.hideLoading();
            console.log('[ChooseImage] 上传失败:', JSON.stringify(err));
            wx.miniProgram.postMessage({
              data: { type: 'imagePickResult', data: { success: false, error: '上传失败: ' + (err.errMsg || '') } }
            });
            setTimeout(function () {
              wx.navigateBack();
            }, 500);
          }
        });
      },
      fail: function (err) {
        console.log('[ChooseImage] 图片选择失败/取消:', JSON.stringify(err));
        wx.miniProgram.postMessage({
          data: { type: 'imagePickResult', data: { success: false, error: '取消选择' } }
        });
        setTimeout(function () {
          wx.navigateBack();
        }, 300);
      }
    });
  }
});
