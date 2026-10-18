/**
 * Game World · HD 世界页
 * 拼接地图 + agent 走行 + WS 实时 + 必读段 + 认知模式色环
 */
const WS_URL = 'wss://100000whys.cn/ws';
const M_PROXY = 'https://100000whys.cn/mingdao';
const MEMBER_WS = '69b0077358322d512e60bad0';
const SHANGPIN_WS = '6a03ceaa7e29abcb297cbdfc';

const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

async function proxyPost(url, input) {
    const r = await fetch(M_PROXY, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({url,input}) });
    if (!r.ok) throw new Error('proxy ' + r.status);
    return r.json();
}

const BLOCKS = [
    { n: '中央广场', c: '#0e1420' }, { n: '东 市', c: '#0a1210' },
    { n: '工坊区', c: '#140f0c' }, { n: '绿 洲', c: '#0a1414' },
];

export default class WorldPage {
    constructor(container, params) {
        this.container = container;
        this.canvas = container.querySelector('#gwCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.agentRowid = params.get('use') || 'a4501620-fff9-4780-a77c-c810a7f8d44e';
        this.agentName = '无名';
        this.player = { x: 480, y: 270, speed: 120 };
        this.remotes = new Map();
        this.bus = null;
        this.raf = 0;
        this.lastRafT = 0;
        this.lastSent = 0;
        this.keys = new Set();
        this.destroyed = false;
        this.dirty = false;
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
        this.connectWs();
        await this.loadMustread();
        this.startLoop();
    }

    connectWs() {
        this.bus = new WsBus({ url: WS_URL, rowid: this.agentRowid });
        this.bus.on('game.move', (body) => {
            if (body.agentId === this.agentRowid) return;
            this.remotes.set(body.agentId, {
                x: body.x, y: body.y, name: body.name || body.agentId,
                char: body.char || '?', color: body.color || '#1677ff',
                lastSeen: Date.now()
            });
        });
        this.bus.connect();
    }

    async loadMustread() {
        try {
            const j = await proxyPost('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost', { worksheetId: MEMBER_WS, rowId: this.agentRowid });
            const d = j.data?.data || j.data || {};
            const raw = String(d.bdwznr || '').replace(/^\s*```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
            let items = [];
            try { items = JSON.parse(raw || '[]'); } catch (e) { items = []; }
            if (!Array.isArray(items)) items = [];
            const list = this.container.querySelector('#mustreadList');
            if (!list) return;
            if (!items.length) { list.innerHTML = '<div class="mr-empty">必读段为空（去 wushi 页面「权重必读」置入）</div>'; return; }
            list.innerHTML = items.map(it => {
                let mingcheng = '';
                try {
                    const r = await proxyPost('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost', { worksheetId: SHANGPIN_WS, rowId: it.rowid });
                    const rd = r.data?.data || r.data || {};
                    mingcheng = rd.mingcheng ?? '';
                } catch (e) { /* skip */ }
                return `<div class="mr-item"><div class="t">${esc(mingcheng || '(未命名)')}</div>${it.shuoming ? `<div class="s">${esc(it.shuoming)}</div>` : ''}<div class="r">${esc(it.rowid)}</div></div>`;
            }).join('');
        } catch (e) {
            const list = this.container.querySelector('#mustreadList');
            if (list) list.innerHTML = `<div class="mr-empty">加载失败: ${esc(e.message)}</div>`;
        }
    }

    resizeCanvas() {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const cw = this.container.clientWidth, ch = this.container.clientHeight;
        this.canvas.width = Math.round(cw * dpr);
        this.canvas.height = Math.round(ch * dpr);
        this.canvas.style.width = cw + 'px';
        this.canvas.style.height = ch + 'px';
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
        let dx = 0, dy = 0;
        if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) dy -= 1;
        if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) dy += 1;
        if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) dx -= 1;
        if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) dx += 1;
        if (dx || dy) {
            const len = Math.hypot(dx, dy);
            this.player.x = Math.max(16, Math.min(960-16, this.player.x + (dx/len) * this.player.speed * dt));
            this.player.y = Math.max(16, Math.min(540-16, this.player.y + (dy/len) * this.player.speed * dt));
        }
    }

    draw() {
        const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
        ctx.fillStyle = '#060810'; ctx.fillRect(0, 0, W, H);
        // 地图块
        const scale = Math.min(W / 960, H / 540);
        const ox = (W - 960 * scale) / 2, oy = (H - 540 * scale) / 2;
        const bw = 480 * scale, bh = 270 * scale;
        BLOCKS.forEach((b, i) => {
            const bx = ox + (i % 2) * bw, by = oy + Math.floor(i / 2) * bh;
            ctx.fillStyle = b.c; ctx.fillRect(bx, by, bw, bh);
            ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.strokeRect(bx + .5, by + .5, bw - 1, bh - 1);
            ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.font = `700 ${Math.round(20*scale)}px "Noto Sans SC"`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(b.n, bx + bw/2, by + bh/2);
        });
        // 十字路
        ctx.fillStyle = 'rgba(232,213,163,0.08)';
        ctx.fillRect(ox + 468*scale, oy, 48*scale, 540*scale);
        ctx.fillRect(ox, oy + 258*scale, 960*scale, 48*scale);
        // 玩家
        const px = ox + this.player.x * scale, py = oy + this.player.y * scale;
        ctx.beginPath(); ctx.arc(px, py, 16*scale, 0, Math.PI*2);
        ctx.fillStyle = '#16233c'; ctx.fill();
        ctx.lineWidth = 3*scale; ctx.strokeStyle = '#e8d5a3'; ctx.stroke();
        ctx.fillStyle = '#eef2fa'; ctx.font = `700 ${14*scale}px "Noto Sans SC"`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this.agentName.charAt(0), px, py);
    }

    destroy() {
        this.destroyed = true;
        cancelAnimationFrame(this.raf);
        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        window.removeEventListener('blur', this._onBlur);
        if (this.bus) { try { this.bus.close(); } catch (e) { /* */ } }
    }
}
