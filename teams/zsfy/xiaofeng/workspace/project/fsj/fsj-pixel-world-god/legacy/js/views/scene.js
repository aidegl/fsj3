/**
 * scene - 场景视图（唯一主视图）
 * 地图 + PC 相机：方向键平移 / 空格+拖动平移 / 滚轮缩放（锚定鼠标）
 * 角色实时移动（WS）+ 悬停名牌 + 点击资料卡 + 聚焦下拉
 */
import { Roster } from '../services/roster.js';
import { GodWorld } from '../services/god-world.js';
import { GodCamera, renderScene, buildSceneCanvas } from '../core/god-renderer.js';

export const SceneView = {
    canvas: null, ctx: null,
    cam: null, mapCanvas: null,
    sceneId: null,
    onPick: null, onSceneChange: null,
    _keys: new Set(),          // 按住的键（方向键平移）
    _drag: null,               // 空格+拖动
    _space: false,
    _hover: null,
    _focusId: null,            // 聚焦的角色 rowid（相机一次性居中）

    async init(onPick, onSceneChange) {
        this.canvas = document.getElementById('sc-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.onPick = onPick;
        this.onSceneChange = onSceneChange;

        // 滚轮缩放（锚定鼠标）
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const r = this.canvas.getBoundingClientRect();
            if (this.cam) this.cam.zoomAt(e.clientX - r.left, e.clientY - r.top,
                e.deltaY < 0 ? 1.15 : 1 / 1.15, r.width, r.height);
        }, { passive: false });

        // 空格 + 拖动平移（空格按住时光标变抓手；平移仅此方式）
        this.canvas.addEventListener('pointerdown', (e) => {
            if (!this._space || e.button !== 0) return;
            this._drag = { sx: e.clientX, sy: e.clientY };
            this.canvas.setPointerCapture(e.pointerId);
            this.canvas.style.cursor = 'grabbing';
        });
        this.canvas.addEventListener('pointermove', (e) => {
            const r = this.canvas.getBoundingClientRect();
            if (this._drag) {
                if (this.cam) this.cam.pan(e.clientX - this._drag.sx, e.clientY - this._drag.sy, r.width, r.height);
                this._drag.sx = e.clientX; this._drag.sy = e.clientY;
            }
            this.hover(e.clientX - r.left, e.clientY - r.top);
        });
        this.canvas.addEventListener('pointerup', (e) => {
            const wasDrag = !!this._drag;
            this._drag = null;
            if (this.canvas) this.canvas.style.cursor = this._space ? 'grab' : '';
            if (!wasDrag) {
                const r = this.canvas.getBoundingClientRect();
                this.click(e.clientX - r.left, e.clientY - r.top);
            }
        });

        // 键盘：方向键平移；空格切换抓手模式
        window.addEventListener('keydown', (e) => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                this._keys.add(e.key);
            }
            if (e.code === 'Space' && !this._space) {
                e.preventDefault();
                this._space = true;
                this.canvas.style.cursor = 'grab';
            }
        });
        window.addEventListener('keyup', (e) => {
            this._keys.delete(e.key);
            if (e.code === 'Space') {
                this._space = false;
                if (this.canvas) this.canvas.style.cursor = '';
            }
        });

        window.addEventListener('resize', () => this.resize());
    },

    /** 填充地图切换下拉（有地图数据的场景才可选） */
    async buildSceneSelect() {
        const sel = document.getElementById('sc-select');
        sel.innerHTML = '';
        for (const conf of GodWorld.scenes()) {
            const map = await GodWorld.getSceneMap(conf.id);
            const opt = document.createElement('option');
            opt.value = conf.id;
            opt.textContent = conf.name + (map ? '' : '（暂无地图）');
            opt.disabled = !map;
            sel.appendChild(opt);
        }
        sel.onchange = (e) => { e.target.blur(); this.enter(e.target.value); };
    },

    /** 进入场景（默认 天孚宫） */
    async enter(sceneId) {
        this.sceneId = sceneId;
        const map = await GodWorld.getSceneMap(sceneId);
        this.mapCanvas = map ? buildSceneCanvas(map) : null;
        this.cam = new GodCamera(map || { size: 48, tilesize: 48 });
        this.resize();
        this.cam.fit(this.canvas.width, this.canvas.height);
        const conf = GodWorld.scenes().find(s => s.id === sceneId);
        document.getElementById('sc-title').textContent =
            (conf ? conf.name : sceneId) + (map ? '' : '（暂无地图数据）');
        document.getElementById('sc-select').value = sceneId;
        this._focusId = null;
        if (this.onSceneChange) this.onSceneChange(sceneId);
    },

    /** 聚焦角色（相机居中一次 + 选中描边 + 打开资料卡） */
    focus(rowid) {
        const m = Roster.byRowid.get(rowid);
        if (!m || !m.pos || !this.cam) return;
        this._focusId = rowid;
        Roster.members.forEach(x => { x._selected = x.rowid === rowid; });
        const wx = m.pos.tx * this.cam.TILE + this.cam.TILE / 2;
        const wy = m.pos.ty * this.cam.TILE + this.cam.TILE / 2;
        this.cam.x = wx - this.canvas.width / this.cam.zoom / 2;
        this.cam.y = wy - this.canvas.height / this.cam.zoom / 2;
        this.cam.clamp(this.canvas.width, this.canvas.height);
        if (this.onPick) this.onPick(m);
    },

    /** 当前地图的角色（供聚焦下拉刷新） */
    membersHere(t) {
        const list = Roster.members.filter(m => m.sceneId === this.sceneId && m.pos);
        const SPEED = 7;    // 格/秒（视觉插值）
        for (const m of list) {
            const px = m.pos.px ?? m.pos.tx, py = m.pos.py ?? m.pos.ty;
            const dx = m.pos.tx - px, dy = m.pos.ty - py;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.01) {
                const step = Math.min(dist, (SPEED / 60));
                m.pos.px = px + dx / dist * step;
                m.pos.py = py + dy / dist * step;
                m._movingUntil = t + 200;
            } else {
                m.pos.px = m.pos.tx; m.pos.py = m.pos.ty;
            }
            m._stale = Roster.isStale(m);
        }
        return list;
    },

    hover(sx, sy) {
        if (!this.cam) return;
        const list = this.membersHere(performance.now());
        const w = this.cam.screenToWorldPx(sx, sy);
        const TILE = this.cam.TILE;
        let hit = null;
        for (const m of list) {
            const wx = m.pos.px * TILE, wy = m.pos.py * TILE;
            if (w.x >= wx && w.x <= wx + TILE && w.y >= wy - TILE && w.y <= wy + TILE) { hit = m; break; }
        }
        this._hover = hit;
        const tip = document.getElementById('sc-tooltip');
        if (hit) {
            tip.style.display = '';
            tip.style.left = (sx + 14) + 'px';
            tip.style.top = (sy + 10) + 'px';
            tip.innerHTML = `<div class="tt-name">${hit.mingcheng}</div>
                <div class="tt-meta">${hit.zhiwei || ''} · Lv.${(hit.char && hit.char.dengji) || '?'} ${hit.wuxing || ''}</div>
                <div class="tt-meta">${hit.pos && hit.pos.source === 'live' ? '实时位置' : '快照位置（HAP 最近保存）'}</div>`;
            this.canvas.style.cursor = this._space ? 'grab' : 'pointer';
        } else {
            tip.style.display = 'none';
            this.canvas.style.cursor = this._space ? 'grab' : '';
        }
    },

    click(sx, sy) {
        if (this._hover && this.onPick) this.onPick(this._hover);
    },

    resize() {
        if (!this.canvas) return;
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
        if (this.cam) this.cam.clamp(this.canvas.width, this.canvas.height);
    },

    /** 每帧：键盘平移（方向键）→ 成员插值 → 渲染 */
    loop(t, dtMs) {
        if (!this.cam) return;
        // 方向键平移（按住持续移动）
        if (this._keys.size && this.canvas) {
            const speed = 700 * (dtMs / 1000) / this.cam.zoom;   // 700px/s
            let dx = 0, dy = 0;
            if (this._keys.has('ArrowLeft')) dx -= 1;
            if (this._keys.has('ArrowRight')) dx += 1;
            if (this._keys.has('ArrowUp')) dy -= 1;
            if (this._keys.has('ArrowDown')) dy += 1;
            if (dx || dy) this.cam.pan(dx * speed, dy * speed, this.canvas.width, this.canvas.height);
        }
        const members = this.membersHere(t);
        renderScene(this.ctx, this.cam, this.mapCanvas, members, t,
            this.canvas.width, this.canvas.height);
    }
};
