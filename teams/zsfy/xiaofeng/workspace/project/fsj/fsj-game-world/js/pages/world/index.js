const WS_URL = 'wss://100000whys.cn/ws';
const M_PROXY = 'https://100000whys.cn/mingdao';
const MEMBER_WS = '69b0077358322d512e60bad0';
const N = 40;

const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

async function proxyPost(url, input) {
    const r = await fetch(M_PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, input }) });
    if (!r.ok) throw new Error('proxy ' + r.status);
    return r.json();
}

async function fetchMustread(agentRowid) {
    const j = await proxyPost('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost', { worksheetId: MEMBER_WS, rowId: agentRowid });
    const d = j.data?.data || j.data || {};
    const raw = String(d.bdwznr || '').replace(/^\s*```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
    let items = [];
    try { items = JSON.parse(raw || '[]'); } catch (e) { items = []; }
    if (!Array.isArray(items)) items = [];
    const out = [];
    for (const it of (Array.isArray(items) ? items : [])) {
        if (!it.rowid) continue;
        out.push({ rowid: it.rowid, shuoming: it.shuoming || '' });
    }
    return out;
}

export default class WorldPage {
    constructor(container, params) {
        this.container = container;
        this.canvas = container.querySelector('#gwCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.agentRowid = params.get('use') || 'a4501620-fff9-4780-a77c-c810a7f8d44e';
        this.currentAgentName = '无名';
        this.player = { x: 480, y: 270, speed: 2.5, target: null };
        this.remotes = new Map();
        this.ws = null;
        this.wsRetry = 1000;
        this.wsConnected = false;
        this.raf = 0;
        this.lastRafT = 0;
        this.destroyed = false;
        this.keys = new Set();
        this._onResize = () => this.resizeCanvas();
        this._onKeyDown = (e) => { if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'].includes(e.code)) this.keys.add(e.code); };
        this._onKeyUp = (e) => this.keys.delete(e.code);
        this._onBlur = () => this.keys.clear();
    }

    async init() {
        this.resizeCanvas();
        window.addEventListener('resize', this._onResize);
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        window.addEventListener('blur', this._onBlur);
        await this.loadMustreadPanel();
        this.connectWs();
        this.startLoop();
    }

    async loadMustreadPanel() {
        try {
            const items = await this.fetchMustreadData(this.agentRowid);
            const list = this.container.querySelector('#mustreadList');
            if (!list) return;
            if (!items.length) { list.innerHTML = '<div class="mr-empty">必读段为空</div>'; return; }
            list.innerHTML = items.map(it =>
                `<div class="mr-item"><div class="t">${esc(it.mingcheng || '(未命名)')}</div>${it.shuoming ? `<div class="s">${esc(it.shuoming)}</div>` : ''}</div>`
            ).join('');
        } catch (e) {
            const list = this.container.querySelector('#mustreadList');
            if (list) list.innerHTML = `<div class="mr-empty">加载失败: ${esc(e.message)}</div>`;
        }
    }

    async fetchMustreadData(agentRowid) {
        const j = await proxyPost('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost', { worksheetId: MEMBER_WS, rowId: agentRowid });
        const d = j.data?.data || j.data || {};
        const raw = String(d.bdwznr || '').replace(/^\s*```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
        let items = [];
        try { items = JSON.parse(raw || '[]'); } catch (e) { items = []; }
        if (!Array.isArray(items)) items = [];
        const out = [];
        for (const it of (Array.isArray(items) ? items : [])) {
            if (!it.rowid) continue;
            let mingcheng = '';
            try {
                const r = await proxyPost('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost', { worksheetId: SHANGPIN, rowId: it.rowid });
                const rd = r.data?.data || r.data || {};
                mingcheng = rd.mingcheng ?? rd[SHANGPIN + 'd'] ?? '';
            } catch (e) { /* skip */ }
            out.push({ rowid: it.rowid, shuoming: it.shuoming || '', mingcheng });
        }
        return out;
    }

    resizeCanvas() {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const cw = this.container.clientWidth, ch = this.container.clientHeight;
        this.canvas.width = Math.round(cw * dpr);
        this.canvas.height = Math.round(ch * dpr);
        this.canvas.style.width = cw + 'px';
        this.canvas.style.height = ch + 'px';
    }

    connectWs() {
        this.connectWsInner();
    }

    connectWsInner() {
        try { this.ws = new WebSocket(WS_URL); } catch (e) { return this.scheduleReconnect(); }
        this.ws.onopen = () => { this.wsRetry = 1000; this.wsConnected = true; };
        this.ws.onclose = () => { this.wsConnected = false; this.scheduleReconnect(); };
        this.ws.onerror = () => { try { this.ws.close(); } catch (e) { /* */ } };
        this.ws.onmessage = (e) => {
            let d; try { d = JSON.parse(e.data); } catch (err) { return; }
            if (!d || typeof d !== 'object') return;
            if (d.type === 'game.move' && d.body) {
                const b = d.body;
                if (b.agentId !== this.agentRowid) {
                    this.remotes.set(b.agentId, { x: b.x, y: b.y, name: b.name || b.agentId, char: b.char || '?', color: b.color || '#1677ff', lastSeen: Date.now() });
                }
            }
        };
    }

    scheduleReconnect() {
        if (this._wsRetryTimer) return;
        this._wsRetryTimer = setTimeout(() => { this._wsRetryTimer = null; this.connectWsInner(); }, this.wsRetry);
        this.wsRetry = Math.min(this.wsRetry * 2, 30000);
    }

    startLoop() {
        const loop = (t) => {
            if (this.destroyed) return;
            const dt = Math.min(50, t - (this.lastRafT || t)) / 1000;
            this.lastRafT = t;
            this.update(dt);
            this.draw();
            this.raf = requestAnimationFrame(loop);
        };
        this.raf = requestAnimationFrame(loop);
    }

    update(dt) {
        // keyboard
        let dx = 0, dy = 0;
        if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) dy -= 1;
        if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) dy += 1;
        if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) dx -= 1;
        if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) dx += 1;
        if (dx || dy) {
            const len = Math.hypot(dx, dy);
            this.player.x += (dx / len) * 200 * dt;
            this.player.y += (dy / len) * 200 * dt;
        }
    }

    draw() {
        const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
        ctx.clearRect(0, 0, W, H);
        // bg
        ctx.fillStyle = '#060810'; ctx.fillRect(0, 0, W, H);
        // grid
        ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
        for (let gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
        for (let gy = 0; gy < H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
        // center cross-path
        ctx.fillStyle = 'rgba(232,213,163,0.04)';
        ctx.fillRect(W / 2 - 24, 0, 48, H);
        ctx.fillRect(0, H / 2 - 24, W, 48);
        // player
        this.drawPlayer(ctx);
    }

    drawPlayer(ctx) {
        const x = this.player.x, y = this.player.y;
        ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2);
        ctx.fillStyle = '#16233c'; ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = '#e8d5a3'; ctx.stroke();
        ctx.fillStyle = '#eef2fa'; ctx.font = '700 14px "Noto Sans SC"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this.currentAgentName.charAt(0), x, y);
    }

    destroy() {
        this.destroyed = true;
        cancelAnimationFrame(this.raf);
        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        window.removeEventListener('blur', this._onBlur);
        if (this.ws) { try { this.ws.close(); } catch (e) {} }
    }
}
