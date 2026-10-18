/**
 * 像素形象编辑器 - Tab 切换三角度（正面/背面/侧面），单大画布编辑
 * 侧面编辑的是左侧，保存时右侧自动镜像同步
 * 编辑 → 保存（localStorage 热覆盖，世界立即生效）/ 导出 JSON（回流资产库）
 * 参数：?page=editor&agentId=demo-xxx
 */
import Palette from '../../core/palette.js';
import World from '../../services/world.js';
import { loadAgents, saveCharacterOverride, clearCharacterOverride, getCharacterOverride } from '../../services/agents.js';

const mirror = px => px.map(row => row.slice().reverse());
const SKIN = new Set(['FFD0B0', 'FFAE71', 'FFBC8F']);

/** 背面化派生（旧数据无背面时）：脸部肤色包围盒 → 头发色 */
function deriveUp(front) {
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
    front.forEach((row, y) => row.forEach((p, x) => {
        if (SKIN.has(p)) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }));
    if (minX === 1e9) return front.map(r => r.slice());
    const d = front.map(r => r.slice());
    for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++)
            if (d[y][x]) d[y][x] = '2E2E2E';
    return d;
}

const FACES = {
    down: { tag: '正面' },
    up: { tag: '背面' },
    side: { tag: '侧面（左）' }
};

export default class EditorPage {
    constructor(container, params) {
        this.container = container;
        this.agentId = params.get('agentId') || 'demo-xiaozong';
        this.agent = null;
        this.surfaces = null;       // {down, up, side} 三角度工作副本
        this.active = 'down';       // 当前编辑的面
        this.N = 40;
        this.CELL = 8;
        this.hover = null;
        this.color = '#FFC229';
        this.tool = 'pen';
        this.undoStack = [];
        this.drawing = false;
        this._onUp = () => { this.drawing = false; };
    }

    async init() {
        await Palette.load();
        await World.load();
        const all = await loadAgents();
        this.agent = all.find(a => a.rowid === this.agentId) || all[0];
        const dir = this.agent.pixels_dir || {};
        this.surfaces = {
            down: this.agent.pixels_xiao[0].map(r => r.slice()),
            up: (dir.up || deriveUp(this.agent.pixels_xiao[0])).map(r => r.slice()),
            side: (dir.left || this.agent.pixels_xiao[0]).map(r => r.slice())
        };
        this.N = this.surfaces.down.length;
        this.CELL = Math.max(6, Math.floor(340 / this.N)); // 40→8（画布320px）
        const cv = this.container.querySelector('#edCanvas');
        cv.width = this.N * this.CELL;
        cv.height = this.N * this.CELL;
        this.color = this.mostUsedColor(this.surfaces.down) || '#FFC229';

        this.container.querySelector('#edName').textContent = this.agent.mingcheng;
        this.buildPalette();
        this.bindEvents();
        this.render();
        window.PxEditor = this; // 调试钩子
    }

    /** 取形象"下半身"（衣服区）中出现最多的颜色作为默认画笔色（返回带# hex） */
    mostUsedColor(pixels) {
        const count = {};
        const y0 = Math.floor(pixels.length / 2);
        for (let y = y0; y < pixels.length; y++) {
            for (const px of pixels[y]) {
                if (px) count[px] = (count[px] || 0) + 1;
            }
        }
        let best = null, bestN = 0;
        for (const [hex, n] of Object.entries(count)) {
            if (n > bestN && hex !== '181818') { best = hex; bestN = n; }
        }
        return best ? '#' + best : null;
    }

    // ==================== 调色板 ====================

    buildPalette() {
        const wrap = this.container.querySelector('#edPalette');
        wrap.innerHTML = '';
        // 110 色板
        for (const row of Palette.data) {
            for (const hex of row) {
                const el = document.createElement('div');
                el.className = 'ed-swatch';
                el.style.background = '#' + hex;
                el.title = '#' + hex;
                el.addEventListener('click', () => this.pickSwatch(el, '#' + hex));
                wrap.appendChild(el);
            }
        }
        // 特殊色放最后：纯白 / 纯黑 / 透明
        for (const hex of ['FFFFFF', '000000']) {
            const el = document.createElement('div');
            el.className = 'ed-swatch';
            el.style.background = '#' + hex;
            el.title = '#' + hex;
            el.addEventListener('click', () => this.pickSwatch(el, '#' + hex));
            wrap.appendChild(el);
        }
        const tr = document.createElement('div');
        tr.className = 'ed-swatch transparent';
        tr.title = '透明';
        tr.addEventListener('click', () => this.pickSwatch(tr, null));
        wrap.appendChild(tr);
        this.markActiveSwatch();
    }

    pickSwatch(el, hex) {
        this.color = hex;
        if (hex === null) this.setTool('eraser');
        else if (this.tool === 'eraser') this.setTool('pen');
        this.markActiveSwatch(el);
        // 调试：点击调色板颜色 → 后台打印（带当前编辑角度）
        console.log('[editor] 选色 ' + (hex || '透明') + ' @ ' + FACES[this.active].tag);
    }

    markActiveSwatch(el) {
        this.container.querySelectorAll('.ed-swatch').forEach(s => s.classList.remove('active'));
        if (!el) {
            const target = this.color === null ? '.ed-swatch.transparent'
                : [...this.container.querySelectorAll('.ed-swatch')].find(s => s.title === this.color);
            if (target) target.classList.add('active');
            return;
        }
        el.classList.add('active');
    }

    // ==================== 画布渲染 ====================

    render() {
        const cv = this.container.querySelector('#edCanvas');
        const ctx = cv.getContext('2d');
        const N = this.N, CELL = this.CELL;
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                ctx.fillStyle = ((x + y) % 2 === 0) ? '#ffffff' : '#e8e8e8';
                ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
            }
        }
        const pixels = this.surfaces[this.active];
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                const px = pixels[y][x];
                if (!px) continue;
                ctx.fillStyle = '#' + px;
                ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
            }
        }
        ctx.strokeStyle = 'rgba(3,3,3,0.12)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= N; i++) {
            ctx.beginPath(); ctx.moveTo(i * CELL + 0.5, 0); ctx.lineTo(i * CELL + 0.5, N * CELL); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, i * CELL + 0.5); ctx.lineTo(N * CELL, i * CELL + 0.5); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(213,130,0,0.5)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(0, N / 2 * CELL + 0.5); ctx.lineTo(N * CELL, N / 2 * CELL + 0.5); ctx.stroke();
        ctx.setLineDash([]);
        if (this.hover) {
            ctx.strokeStyle = '#FFC229';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.hover.x * CELL + 1, this.hover.y * CELL + 1, CELL - 2, CELL - 2);
        }
    }

    cellFromEvent(e) {
        const cv = this.container.querySelector('#edCanvas');
        const rect = cv.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / (rect.width / this.N));
        const y = Math.floor((e.clientY - rect.top) / (rect.height / this.N));
        if (x < 0 || y < 0 || x >= this.N || y >= this.N) return null;
        return { x, y };
    }

    pushUndo() {
        this.undoStack.push(JSON.stringify(this.surfaces));
        if (this.undoStack.length > 40) this.undoStack.shift();
    }

    applyTool(x, y) {
        if (this.tool === 'picker') {
            const px = this.surfaces[this.active][y][x];
            if (px) {
                this.color = '#' + px;
                this.setTool('pen');
                this.markActiveSwatch();
                // 调试：吸色器取色 → 后台打印
                console.log('[editor] 吸色 #' + px + ' @ ' + FACES[this.active].tag);
            }
            return;
        }
        const val = this.tool === 'eraser' ? null : this.color.slice(1);
        if (this.surfaces[this.active][y][x] === val) return;
        this.surfaces[this.active][y][x] = val;
        this.render();
    }

    // ==================== 事件 ====================

    bindEvents() {
        const cv = this.container.querySelector('#edCanvas');
        cv.addEventListener('pointerdown', (e) => {
            const c = this.cellFromEvent(e);
            if (!c) return;
            this.hover = c;
            if (this.tool !== 'picker') this.pushUndo();
            this.drawing = true;
            this.applyTool(c.x, c.y);
            try { cv.setPointerCapture(e.pointerId); } catch (err) { }
            this.render();
        });
        cv.addEventListener('pointermove', (e) => {
            const c = this.cellFromEvent(e);
            const changed = JSON.stringify(c) !== JSON.stringify(this.hover);
            this.hover = c;
            if (c && this.drawing && this.tool !== 'picker') this.applyTool(c.x, c.y);
            else if (changed) this.render();
        });
        window.addEventListener('pointerup', this._onUp);

        // Tab 切换三面
        this.container.querySelectorAll('.ed-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.active = tab.dataset.face;
                this.container.querySelectorAll('.ed-tab').forEach(b => b.classList.remove('active'));
                tab.classList.add('active');
                this.render();
            });
        });

        this.container.querySelectorAll('.ed-tool[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => this.setTool(btn.dataset.tool, btn));
        });
        this.container.querySelector('#edUndo').addEventListener('click', () => {
            const snap = this.undoStack.pop();
            if (snap) { this.surfaces = JSON.parse(snap); this.render(); }
        });
        this.container.querySelector('#edClear').addEventListener('click', () => {
            if (!confirm('清空【' + FACES[this.active].tag + '】的全部像素？')) return;
            this.pushUndo();
            this.surfaces[this.active] = Array.from({ length: this.N }, () => Array(this.N).fill(null));
            this.render();
        });

        this.container.querySelector('#edBack').addEventListener('click', () => window.PxNav('world'));
        this.container.querySelector('#edSave').addEventListener('click', () => this.save());
        this.container.querySelector('#edExport').addEventListener('click', () => this.exportJson());
        this.container.querySelector('#edReset').addEventListener('click', () => this.resetOriginal());
    }

    setTool(tool, btn) {
        this.tool = tool;
        this.container.querySelectorAll('.ed-tool[data-tool]').forEach(b =>
            b.classList.toggle('active', b.dataset.tool === tool));
        if (btn) btn.classList.add('active');
    }

    // ==================== 保存 / 导出 / 恢复 ====================

    save() {
        const ok = saveCharacterOverride(this.agent.rowid, this.surfaces, this.agent.blink);
        this.toast(ok ? '已保存，正在返回世界…' : '保存失败（存储空间不足？）');
        if (ok) setTimeout(() => window.PxNav('world'), 900);
    }

    toast(text) {
        let el = this.container.querySelector('.ed-toast');
        if (!el) {
            el = document.createElement('div');
            el.className = 'ed-toast';
            this.container.appendChild(el);
        }
        el.textContent = text;
        el.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
    }

    exportJson() {
        const out = Object.assign({}, this.agent, this.exportPixels());
        const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = this.agentId + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
    }

    /** 组装导出/保存用的完整像素结构 */
    exportPixels() {
        const blink = this.agent.blink || { eye: '181818', closed: 'FFC2C2' };
        const down = this.surfaces.down.map(r => r.slice());
        const blinkFrame = down.map((row, y) => row.map(px => (px === blink.eye) ? blink.closed : px));
        return {
            pixels_xiao: [down, blinkFrame],
            pixels_dir: {
                up: this.surfaces.up.map(r => r.slice()),
                left: this.surfaces.side.map(r => r.slice()),
                right: mirror(this.surfaces.side)
            }
        };
    }

    resetOriginal() {
        if (!getCharacterOverride(this.agent.rowid)) { this.toast('当前已是原始形象'); return; }
        if (!confirm('放弃编辑，恢复原始形象？')) return;
        clearCharacterOverride(this.agent.rowid);
        window.PxNav('editor', { agentId: this.agentId });
    }

    destroy() {
        window.removeEventListener('pointerup', this._onUp);
    }
}
