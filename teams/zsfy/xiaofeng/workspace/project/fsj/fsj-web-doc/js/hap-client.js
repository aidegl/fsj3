// fsj-web-doc HAP 客户端（浏览器端）
// 通过 proxy.js（端口 3012）拉 HAP 数据，避免暴露 API key
// 创建：2026-08-17（小风）

const API_BASE = 'http://localhost:3012';

const HapClient = {
  async getDimensions() {
    try {
      const res = await fetch(API_BASE + '/api/dimensions');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      console.error('[HapClient.getDimensions] 失败:', e);
      return [];
    }
  },

  async getDimension(id) {
    try {
      const res = await fetch(API_BASE + '/api/dimension/' + id);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      console.error('[HapClient.getDimension] 失败:', e);
      return null;
    }
  }
};