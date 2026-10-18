/**
 * Agent 视频资源服务
 */
var AgentVideoService = {
  config: {
    appKey: '5cf5c6ba1ecbae8a',
    sign: 'NDQyM2EzZWM0YzE1ZjE1M2M3YzAxNjZhNjg0YTQ5ZGZhNjJjNzZkN2M0OTViOWNmNjdjZmE0YjQ2ZmU4OTJhOA==',
    worksheetId: 'ziyuan',
    baseUrl: 'https://api.mingdao.com/v2/open/worksheet/getRowByIdPost'
  },

  getVideoUrl: function (rowId) {
    var self = this;
    return this._fetchRow(rowId).then(function (data) {
      if (!data) return null;
      var filesStr = data['69f5b6930d1a8f4a06d48f69'];
      if (!filesStr) return null;
      try {
        var files = JSON.parse(filesStr);
        if (Array.isArray(files) && files.length > 0) return files[0].DownloadUrl || null;
      } catch (e) {}
      return null;
    });
  },

  getBgImageUrl: function (rowId) {
    var self = this;
    return this._fetchRow(rowId).then(function (data) {
      if (!data) return null;
      var agentsStr = data['69f5b878765e479ba3d512a4'];
      if (!agentsStr) return null;
      try {
        var agents = JSON.parse(agentsStr);
        if (Array.isArray(agents) && agents.length > 0) {
          var sourceValue = JSON.parse(agents[0].sourcevalue);
          var attachments = JSON.parse(sourceValue['69ad979f6a3532cabd764603'] || '[]');
          if (Array.isArray(attachments) && attachments.length > 0) {
            return attachments[0].DownloadUrl || attachments[0].preview_url || null;
          }
        }
      } catch (e) {}
      return null;
    });
  },

  getAllResources: function (shuohuaId, bushuohuaId) {
    var self = this;
    return Promise.all([
      self.getVideoUrl(shuohuaId),
      self.getVideoUrl(bushuohuaId),
      self.getBgImageUrl(shuohuaId)
    ]).then(function (results) {
      return { shuohua: results[0], bushuohua: results[1], bgImage: results[2] };
    });
  },

  _fetchRow: function (rowId) {
    var cfg = this.config;
    return fetch(cfg.baseUrl, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appKey: cfg.appKey, sign: cfg.sign, worksheetId: cfg.worksheetId, rowId: rowId })
    })
    .then(function (res) { if (!res.ok) return null; return res.json(); })
    .then(function (result) { if (result && result.success && result.data) return result.data; return null; })
    .catch(function () { return null; });
  }
};
