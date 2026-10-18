/**
 * ws-bus - 像素视界的消息收发室（透明管道客户端）
 *
 * 后端（wss://100000whys.cn/ws）是纯广播管道：收到 JSON 原样转发给所有连接，
 * 不解析、不存储、不鉴权。所有语义都约定在前端信封里：
 *
 *   { type, from, to, body, ts }
 *     type: 消息种类（world.chat / world.move / ...），前端按 type 分发
 *     from: 发送者 rowid（HAP 全局身份）
 *     to:   空 = 广播；填 rowid = 私信（前端过滤）
 *     body: 业务内容
 *     ts:   发送时间戳
 *
 * 安全模型：前端过滤（type 白名单 + to 匹配 + from 忽略自己的回声）。
 * 自动重连（指数退避）+ 心跳保活 + 断线消息排队。
 */
export class WsBus {
    constructor({ url, rowid, heartbeat = 25000 }) {
        this.url = url;
        this.rowid = rowid;
        this.heartbeatMs = heartbeat;
        this.handlers = new Map();   // type -> Set<fn(body, msg)>
        this.ws = null;
        this.retry = 1000;
        this.retryMax = 30000;
        this.timer = null;
        this.hb = null;
        this.closedByUser = false;
        this.queue = [];             // 断线期间的消息排队
    }

    connect() {
        if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
        try { this.ws = new WebSocket(this.url); } catch (e) { return this._schedule(); }

        this.ws.onopen = () => {
            this.retry = 1000;
            while (this.queue.length) {
                try { this.ws.send(this.queue.shift()); } catch (e) { /* ignore */ }
            }
            this._beat();
        };

        this.ws.onmessage = (e) => {
            let d = null;
            try { d = JSON.parse(e.data); } catch (err) { return; }
            if (!d || typeof d !== 'object') return;
            if (d.type === 'pong' || d.type === 'welcome' || d.type === 'reply') return; // 非 bus 信封
            if (d.from === this.rowid) return;        // 自己的回声
            if (d.to && d.to !== this.rowid) return;  // 别人的私信
            const set = this.handlers.get(d.type);
            if (set) set.forEach(fn => {
                try { fn(d.body, d); } catch (err) { console.error('[ws-bus] handler', err); }
            });
        };

        this.ws.onerror = () => { try { this.ws.close(); } catch (e) { /* ignore */ } };
        this.ws.onclose = () => {
            this._stopBeat();
            if (!this.closedByUser) this._schedule();
        };
    }

    /** 订阅某 type；返回解绑函数 */
    on(type, fn) {
        if (!this.handlers.has(type)) this.handlers.set(type, new Set());
        this.handlers.get(type).add(fn);
        return () => this.handlers.get(type).delete(fn);
    }

    /** 发一条信封消息（断线时自动排队，重连后补发） */
    send(type, body = {}, to = '') {
        const raw = JSON.stringify({ type, from: this.rowid, to, body, ts: Date.now() });
        if (this.ws && this.ws.readyState === 1) {
            this.ws.send(raw);
        } else {
            this.queue.push(raw);
            this.connect();
        }
    }

    close() {
        this.closedByUser = true;
        this._stopBeat();
        clearTimeout(this.timer);
        if (this.ws) this.ws.close();
    }

    _schedule() {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.connect(), this.retry);
        this.retry = Math.min(this.retry * 2, this.retryMax);
    }

    _beat() {
        this._stopBeat();
        this.hb = setInterval(() => {
            try { this.ws.send(JSON.stringify({ type: 'ping' })); } catch (e) { /* ignore */ }
        }, this.heartbeatMs);
    }

    _stopBeat() { clearInterval(this.hb); this.hb = null; }
}
