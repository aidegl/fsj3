/**
 * ws-bus（经典脚本版）— 与 fsj-pixel-world/js/services/ws-bus.js 同源的 WS 信封客户端
 * 信封：{ type, from, to, body, ts }；服务端为纯广播哑管道（world.* 与 chat.* 类型广播，其余 echo）
 * 用途（2026-09-05）：chat.new 推送信号 —— 收到后按会话刷新，替代高频轮询
 * 自动重连（指数退避）+ 心跳保活 + 断线消息排队
 */
var WsBus = (function () {
  'use strict';

  function WsBusImpl(opts) {
    opts = opts || {};
    this.url = opts.url || 'wss://100000whys.cn/ws';
    this.rowid = opts.rowid || 'guest';
    this.heartbeatMs = opts.heartbeat || 25000;
    this.handlers = {};
    this.ws = null;
    this.retry = 1000;
    this.retryMax = 30000;
    this.timer = null;
    this.hb = null;
    this.closedByUser = false;
    this.queue = [];
  }

  WsBusImpl.prototype.on = function (type, fn) {
    if (!this.handlers[type]) this.handlers[type] = [];
    this.handlers[type].push(fn);
    return this;
  };

  WsBusImpl.prototype.connect = function () {
    var self = this;
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    try { this.ws = new WebSocket(this.url); } catch (e) { return this._schedule(); }

    this.ws.onopen = function () {
      self.retry = 1000;
      while (self.queue.length) {
        try { self.ws.send(self.queue.shift()); } catch (e) { /* ignore */ }
      }
      self._beat();
    };

    this.ws.onmessage = function (e) {
      var d = null;
      try { d = JSON.parse(e.data); } catch (err) { return; }
      if (!d || typeof d !== 'object') return;
      if (d.type === 'pong' || d.type === 'welcome' || d.type === 'reply') return;
      if (d.from === self.rowid) return;        // 自己的回声
      if (d.to && d.to !== self.rowid) return;  // 别人的私信
      var set = self.handlers[d.type];
      if (set) set.forEach(function (fn) {
        try { fn(d.body, d); } catch (err) { console.error('[ws-bus] handler', err); }
      });
    };

    this.ws.onerror = function () { try { self.ws.close(); } catch (e) { /* ignore */ } };
    this.ws.onclose = function () {
      self._stopBeat();
      if (!self.closedByUser) self._schedule();
    };
  };

  WsBusImpl.prototype.send = function (type, body, to) {
    var self = this;
    var raw = JSON.stringify({ type: type, from: this.rowid, to: to || '', body: body || {}, ts: Date.now() });
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(raw);
    } else {
      this.queue.push(raw);
      this.connect();
    }
  };

  WsBusImpl.prototype.close = function () {
    this.closedByUser = true;
    this._stopBeat();
    clearTimeout(this.timer);
    if (this.ws) this.ws.close();
  };

  WsBusImpl.prototype._schedule = function () {
    var self = this;
    clearTimeout(this.timer);
    this.timer = setTimeout(function () { self.connect(); }, this.retry);
    this.retry = Math.min(this.retry * 2, this.retryMax);
  };

  WsBusImpl.prototype._beat = function () {
    var self = this;
    this._stopBeat();
    this.hb = setInterval(function () {
      try { self.ws.send(JSON.stringify({ type: 'ping' })); } catch (e) { /* ignore */ }
    }, this.heartbeatMs);
  };

  WsBusImpl.prototype._stopBeat = function () { clearInterval(this.hb); this.hb = null; };

  return WsBusImpl;
})();
