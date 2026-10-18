/**
 * 地图编辑器（M1 基础版）
 * 参数：?page=map-editor&sceneId=<rowid>
 * 功能：涂/擦/吸/标墙 4 工具；瓦片选择；撤销栈；保存到 localStorage
 * 保存目标：本地草稿（M1 mock）+ 更新 places.json 缓存（HAP 写入 M2 接入）
 */
import World from '../../services/world.js';

const TILE = 16;          // 编辑器每格视觉尺寸（可调）
const GRID = 48;          // 场景格子数（天孚宫固定 48，后续按 scene.size 动态）
const DRAFT_KEY = 'mape_draft_';   // localStorage 草稿前缀

export default class MapEditorPage {
    constructor(container, params) {
        this.container = container;
        this.params = params;
        this.sceneId = params.get('sceneId') || '75fdbe30-0dcb-47c8-90d2-7efd6a76df8d';
        this.canvas = container.querySelector('#mapeCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;

        // 编辑状态
        this.tool = 'pen';           // pen | eraser | picker | wall
        this.activeTileId = null;    // 当前选的瓦片
        this.hover = null;           // {tx, ty}
        this.drawing = false;
        this.dirty = false;

        // 编辑数据：scene 副本（mutate 后可保存）
        this.scene = null;           // { layers, tiles, tilesize, ... }
        this.undoStack = [];
        this.MAX_UNDO = 50;

        // 视图：TILE 在 init 里按 scene.tilesize 设（默认 48）
        this.TILE = 48;
        this.zoom = 1;               // 画布缩放（0.2 ~ 3）
        this.pan = { x: 0, y: 0 };   // 画布平移（抓手/空格拖动）
        this._panning = null;        // 抓手拖动中 {sx, sy, px, py}
        this.showGrid = true;

        // 临时：涂墙模式专用 layer 缓存
        this.activeLayer = 'ground';
    }

    async init() {
        // 必须先 World.load()：加载 config(world.json) + places(HAP 实时/本地兜底)
        await World.load();
        await this.loadScene();
        if (this.scene) this.TILE = this.scene.tilesize || 48;
        this.buildPalette();
        this.bindUI();
        if (this.scene) {
            const N = this.scene.size;
            this.canvas.width = N * this.TILE;
            this.canvas.height = N * this.TILE;   // 必须设 height，否则 HTML 默认 150 导致底部被裁
            this.canvas.style.width = 'auto';
            this.canvas.style.height = 'auto';
            this.render();
            // 视图初始化（在 bindUI 之后：canvasBox 已就绪）
        }
        this.updateHUD();
        this.updateLayerCounts();
        this.updateUndoUI();
        this.updateDirtyUI();
        if (this.scene) {
            requestAnimationFrame(() => {
                this.fitZoom = this.computeFitZoom();
                this.zoom = 1;
                this.applyViewTransform();
            });
            // 监听 box 尺寸变化（窗口 resize / 布局变化 → 自动重 fit）
            this.resizeObs = new ResizeObserver(() => {
                if (!this.fitZoom) return;
                this.fitZoom = this.computeFitZoom();
                this.applyViewTransform();
            });
            this.resizeObs.observe(this.canvasBox);
        }
    }

    // ==================== 加载场景 ====================

    async loadScene() {
        try {
            this.scene = await World.getScene(this.sceneId);
        } catch (e) {
            this.toast('加载场景失败：' + e.message);
            this.scene = null;
            return;
        }
        // 容错：必须含 tiles + layers.ground/collision，否则当 null
        if (!this.scene || !this.scene.tiles || !this.scene.layers
            || !this.scene.layers.ground || !this.scene.layers.collision) {
            console.error('[map-editor] scene 数据缺失:', this.scene);
            this.toast('场景数据不完整，tilesize=' + (this.scene && this.scene.tilesize) + ' tiles=' + (this.scene && this.scene.tiles && Object.keys(this.scene.tiles).length));
            this.scene = null;
            return;
        }
        // 标题
        const name = this.scene.name || this.scene.mingcheng || this.sceneId.slice(0, 8);
        this.container.querySelector('#mapeSceneName').textContent = name;
        const N = this.scene.size;
        this.container.querySelector('#mapeSceneSub').textContent = `${N}×${N} · ${Object.keys(this.scene.tiles).length} 瓦片`;
        // 恢复草稿
        this.restoreDraft();
        console.log('[map-editor] 加载场景 OK', {
            sceneId: this.sceneId, size: N, tilesize: this.scene.tilesize,
            tileCount: Object.keys(this.scene.tiles).length
        });
    }

    /** 从 localStorage 读草稿覆盖 scene.layers */
    restoreDraft() {
        try {
            const raw = localStorage.getItem(DRAFT_KEY + this.sceneId);
            if (!raw) return;
            const draft = JSON.parse(raw);
            if (draft.layers && this.scene.layers) {
                if (draft.layers.ground) this.scene.layers.ground = draft.layers.ground;
                if (draft.layers.collision) this.scene.layers.collision = draft.layers.collision;
            }
            this.dirty = !!draft.dirty;
            this.toast('已恢复本地草稿');
        } catch (e) { /* ignore */ }
    }

    /** 草稿写 localStorage */
    saveDraft() {
        try {
            localStorage.setItem(DRAFT_KEY + this.sceneId, JSON.stringify({
                ts: Date.now(),
                layers: {
                    ground: this.scene.layers.ground,
                    collision: this.scene.layers.collision
                },
                dirty: this.dirty
            }));
        } catch (e) {
            this.toast('草稿保存失败：' + e.message);
        }
    }

    clearDraft() {
        try { localStorage.removeItem(DRAFT_KEY + this.sceneId); } catch (e) {}
    }

    // ==================== 资产数量（11 仓：瓦片=资产，用完就少） ====================

    /** 初始化每个瓦片的剩余数量（M1 mock：默认 100；有 HAP 数据后从这里读） */
    initTileCounts() {
        this.tileCount = {};
        if (!this.scene || !this.scene.tiles) return;
        for (const id of Object.keys(this.scene.tiles)) {
            const meta = this.scene.tiles[id];
            // 支持两种形态：tiles[id] 直接是像素数组（老格式），或 {data, count}（资产格式）
            const count = (meta && typeof meta === 'object' && !Array.isArray(meta) && typeof meta.count === 'number')
                ? meta.count
                : 100;   // mock 默认
            this.tileCount[id] = count;
        }
    }

    // ==================== 调色板 ====================

    buildPalette() {
        this.initTileCounts();
        const ids = this.scene && this.scene.tiles ? Object.keys(this.scene.tiles) : [];
        if (!ids.length) {
            const empty = '<div class="mape-empty">无可用瓦片</div>';
            this.container.querySelector('#mapePalette').innerHTML = empty;
            this.container.querySelector('#mapePaletteBottom').innerHTML = empty;
            return;
        }
        const buildInto = (container) => {
            container.innerHTML = '';
            for (const id of ids) {
                const sw = document.createElement('div');
                sw.className = 'mape-swatch';
                sw.title = `#${id} · 剩余 ${this.tileCount[id]}`;
                sw.dataset.tileId = id;
                const px = this.scene.tiles[id];
                const c = document.createElement('canvas');
                c.width = px[0].length; c.height = px.length;
                const cx = c.getContext('2d');
                cx.imageSmoothingEnabled = false;
                for (let y = 0; y < px.length; y++)
                    for (let x = 0; x < px[y].length; x++) {
                        const hex = px[y][x];
                        if (hex) { cx.fillStyle = '#' + hex; cx.fillRect(x, y, 1, 1); }
                    }
                sw.style.background = `url(${c.toDataURL()}) center/cover`;
                // 数量徽章（资产剩余）
                const badge = document.createElement('span');
                badge.className = 'swatch-count';
                sw.appendChild(badge);
                sw.addEventListener('click', () => {
                    if ((this.tileCount[id] || 0) <= 0) {
                        this.toast('该瓦片数量已用完');
                        return;
                    }
                    this.activeTileId = id;
                    this.markActiveSwatch();
                    this.setTool('pen');
                    this.updateProp();
                });
                container.appendChild(sw);
            }
            this.refreshCounts();
        };
        buildInto(this.container.querySelector('#mapePalette'));
        buildInto(this.container.querySelector('#mapePaletteBottom'));
        // 默认选第一个（有数量的）
        const first = ids.find(id => (this.tileCount[id] || 0) > 0) || ids[0];
        this.activeTileId = first;
        this.markActiveSwatch();
    }

    /** 刷新所有 swatch 的数量徽章 */
    refreshCounts() {
        this.container.querySelectorAll('.mape-swatch').forEach(sw => {
            const id = sw.dataset.tileId;
            const badge = sw.querySelector('.swatch-count');
            if (!badge) return;
            const n = this.tileCount[id] || 0;
            badge.textContent = n;
            badge.classList.toggle('empty', n <= 0);
            sw.classList.toggle('exhausted', n <= 0);
        });
    }

    markActiveSwatch() {
        this.container.querySelectorAll('.mape-swatch').forEach(s => {
            s.classList.toggle('active', s.dataset.tileId === this.activeTileId);
        });
    }

    // ==================== 渲染 ====================

    render() {
        if (!this.scene) return;
        const N = this.scene.size;
        const T = this.TILE;
        const cv = this.canvas;
        const ctx = this.ctx;
        // 不重设 canvas.width/height（init 时已设）
        // 棋盘格底
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                ctx.fillStyle = ((x + y) % 2 === 0) ? '#3a4860' : '#324054';
                ctx.fillRect(x * T, y * T, T, T);
            }
        }
        // ground 层（每个 ground[ty][tx] = tileId，瓦片 16x16 拉伸/平铺填满 1 格 48x48）
        const ground = this.scene.layers.ground;
        const tiles = this.scene.tiles;
        const tileCache = {};
        const getTileCanvas = (id) => {
            if (!id || tileCache[id]) return tileCache[id];
            const px = tiles[id];
            if (!px) return null;
            const c = document.createElement('canvas');
            c.width = px[0].length; c.height = px.length;
            const cc = c.getContext('2d');
            for (let y = 0; y < px.length; y++)
                for (let x = 0; x < px[y].length; x++) {
                    const h = px[y][x]; if (!h) continue;
                    cc.fillStyle = '#' + h; cc.fillRect(x, y, 1, 1);
                }
            tileCache[id] = c;
            return c;
        };
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                const tid = ground[y][x];
                const c = getTileCanvas(tid);
                if (c) ctx.drawImage(c, x * T, y * T, T, T);
            }
        }
        // 碰撞层叠加（半透明红色）
        const col = this.scene.layers.collision;
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                if (col[y][x]) {
                    ctx.fillStyle = 'rgba(232,59,59,0.25)';
                    ctx.fillRect(x * T, y * T, T, T);
                }
            }
        }
        // 网格线
        if (this.showGrid) {
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1;
            for (let i = 0; i <= N; i++) {
                ctx.beginPath();
                ctx.moveTo(i * T + 0.5, 0);
                ctx.lineTo(i * T + 0.5, N * T);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, i * T + 0.5);
                ctx.lineTo(N * T, i * T + 0.5);
                ctx.stroke();
            }
        }
        // 光标高亮
        if (this.hover) {
            ctx.strokeStyle = '#FFC229';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.hover.tx * T + 1, this.hover.ty * T + 1, T - 2, T - 2);
        }
    }

    updateHUD() {
        const hud = this.container.querySelector('#mapeHud');
        const box = this.canvasBox;
        const wrap = box ? box.parentElement : null;
        const boxInfo = box ? `box=${box.clientWidth}×${box.clientHeight}` : 'no-box';
        const wrapInfo = wrap ? `wrap=${wrap.clientWidth}×${wrap.clientHeight}` : '';
        const cs = `${this.canvas.width}×${this.canvas.height}`;
        const zPct = Math.round((this.fitZoom || 0) * (this.zoom || 1) * 100);
        const display = `${Math.round(this.canvas.width * (this.fitZoom || 0))}×${Math.round(this.canvas.height * (this.fitZoom || 0))}`;
        if (this.hover) {
            const c = this.scene && this.scene.layers && this.scene.layers.collision[this.hover.ty][this.hover.tx];
            hud.textContent = `${this.tool} · ${zPct}% · 显示=${display} · ${boxInfo} ${ wrapInfo}`;
        } else {
            hud.textContent = `${this.tool} · ${zPct}% · 显示=${display} · ${boxInfo} ${ wrapInfo}`;
        }
    }

    updateLayerCounts() {
        if (!this.scene) return;
        const ground = this.scene.layers.ground;
        const col = this.scene.layers.collision;
        let gCount = 0, cCount = 0;
        for (let y = 0; y < ground.length; y++) {
            for (let x = 0; x < ground[0].length; x++) {
                if (ground[y][x]) gCount++;
                if (col[y][x]) cCount++;
            }
        }
        this.container.querySelector('#mapeGroundCount').textContent = gCount;
        this.container.querySelector('#mapeCollCount').textContent = cCount;
        this.container.querySelector('#mapeDecorCount').textContent = '—';
    }

    updateDirtyUI() {
        const dot = this.container.querySelector('#mapeStatus');
        dot.classList.toggle('dirty', this.dirty);
        dot.classList.toggle('saved', !this.dirty);
    }

    updateUndoUI() {
        const btn = this.container.querySelector('#mapeUndo');
        btn.disabled = this.undoStack.length === 0;
        this.container.querySelector('#mapeUndoCount').textContent = `${this.undoStack.length} / ${this.MAX_UNDO}`;
    }

    updateProp() {
        if (!this.hover) {
            this.container.querySelector('#mapePropPos').textContent = '—';
            this.container.querySelector('#mapePropTile').textContent = this.activeTileId ? '#' + this.activeTileId : '—';
            return;
        }
        const { tx, ty } = this.hover;
        const g = this.scene.layers.ground[ty][tx];
        const c = this.scene.layers.collision[ty][tx];
        this.container.querySelector('#mapePropPos').textContent = `(${tx}, ${ty})`;
        this.container.querySelector('#mapePropLayer').textContent = 'ground';
        this.container.querySelector('#mapePropTile').textContent = g ? '#' + g : '空';
        this.container.querySelector('#mapePropColl').textContent = c ? '墙' : '可走';
    }

    // ==================== 视图（缩放/平移） ====================

    /**
     * zoom = fit 容器的倍数
     *   zoom=1 → 画布刚好塞进容器，完整可见
     *   zoom=2 → 画布 2 倍于 fit，溢出容器，需滚动
     *   zoom=0.5 → 画布 0.5 倍于 fit（缩小看更多，但 canvas 不会被压缩）
     */
    /** 计算 fit zoom：按视口算（不依赖 box 测量）
 *   手机（vw < 720）：容器约等于视口宽
 *   桌面（vw ≥ 720）：容器 ≈ 视口宽 - 左栏(180) - 右栏(220) = 视口 - 400 */
    computeFitZoom() {
        if (!this.canvas.width) return 1;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const isDesktop = vw >= 720;
        // 横向预留：桌面减左右栏 400 + 边距 24；手机减边距 24
        const cw = vw - (isDesktop ? 424 : 24);
        // 纵向预留：顶栏 36 + 底抽屉 90 + padding 16 ≈ 142
        const ch = vh - 142;
        return Math.min(cw / this.canvas.width, ch / this.canvas.height);
    }

    applyViewTransform() {
        if (!this.canvasBox || !this.canvas.width || !this.fitZoom) return;
        const z = this.fitZoom * this.zoom;
        // 用 transform：canvas 永远保持原始 2304×2304 布局
        // scale 让它视觉 fit box，translate 移动 pan 偏移
        // box overflow:hidden 裁切到容器可见区域
        this.canvas.style.transformOrigin = '0 0';
        this.canvas.style.transform =
            `translate(${this.pan.x}px, ${this.pan.y}px) scale(${z})`;
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.maxWidth = 'none';
        this.canvas.style.maxHeight = 'none';
        this.canvas.style.minWidth = '0';
        this.canvas.style.minHeight = '0';
        this.updateHUD();
    }

    /** 滚轮缩放：以鼠标位置为锚 */
    onWheelZoom(e) {
        e.preventDefault();
        const box = this.canvasBox;
        if (!box) return;
        const oldZoom = this.zoom;
        const delta = e.deltaY > 0 ? -0.12 : 0.12;
        const newZoom = Math.max(0.3, Math.min(8, oldZoom + delta));
        if (newZoom === oldZoom) return;
        // 鼠标相对容器的位置
        const rect = box.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        // 当前鼠标下的画布原始坐标（fit 缩放后，视觉坐标 / 总缩放 = 画布原始坐标）
        const totalZoom = this.fitZoom * oldZoom;
        const rawX = (mx - this.pan.x) / totalZoom;
        const rawY = (my - this.pan.y) / totalZoom;
        this.zoom = newZoom;
        // 缩放后调整 pan，使鼠标下的画布原始点仍在鼠标位置
        const newTotalZoom = this.fitZoom * newZoom;
        this.pan.x = mx - rawX * newTotalZoom;
        this.pan.y = my - rawY * newTotalZoom;
        this.applyViewTransform();
    }

    resetView() {
        this.zoom = 1;
        this.pan = { x: 0, y: 0 };
        this.applyViewTransform();
        this.toast('视图已重置');
    }

    // ==================== 事件 ====================

    bindUI() {
        // 返回
        this.container.querySelector('#mapeBack').addEventListener('click', () => window.PxNav('world'));

        // 工具按钮
        this.container.querySelectorAll('.mape-tool[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => this.setTool(btn.dataset.tool));
        });

        // 图层 chip（顶栏：地皮 / 装饰物）
        this.container.querySelectorAll('.mape-z-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                this.container.querySelectorAll('.mape-z-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.toast(`切换到 z=${chip.dataset.z} 图层（M1 只支持地皮编辑）`);
            });
        });

        // 右侧图层列表
        this.container.querySelectorAll('.mape-layer-item').forEach(li => {
            li.addEventListener('click', () => {
                this.container.querySelectorAll('.mape-layer-item').forEach(x => x.classList.remove('active'));
                li.classList.add('active');
                this.activeLayer = li.dataset.layer;
                this.toast(`当前编辑层：${li.querySelector('.mape-layer-name').textContent}`);
            });
        });

        // 保存
        this.container.querySelector('#mapeSave').addEventListener('click', () => this.save());
        // 导出
        this.container.querySelector('#mapeExport').addEventListener('click', () => this.exportJson());
        // 撤销
        this.container.querySelector('#mapeUndo').addEventListener('click', () => this.undo());
        // 重置视图
        this.container.querySelector('#mapeZoomReset').addEventListener('click', () => this.resetView());

        // 画布交互
        const cv = this.canvas;
        cv.style.touchAction = 'none';
        cv.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        cv.addEventListener('pointermove', (e) => this.onPointerMove(e));
        cv.addEventListener('pointerup', () => { this.drawing = false; this._panning = null; });
        cv.addEventListener('pointerleave', () => { this.drawing = false; this._panning = null; this.hover = null; this.render(); this.updateHUD(); });

        // 滚轮缩放（以画布中心为锚）
        this.canvasBox = cv.parentElement;
        this.canvasBox.addEventListener('wheel', (e) => this.onWheelZoom(e), { passive: false });

        // 键盘：G 切网格 / Ctrl+Z 撤销 / 空格临时抓手 / 0 重置视图
        this._onKey = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === 'g' || e.key === 'G') { this.showGrid = !this.showGrid; this.render(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); this.undo(); }
            if (e.key === '0') this.resetView();
            if (e.key === 'Escape') { this.drawing = false; this._panning = null; }
            // 按住空格 → 临时抓手（松开恢复）
            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                this._prevTool = this.tool;
                this.setTool('pan');
            }
        };
        this._onKeyUp = (e) => {
            if (e.code === 'Space' && this._prevTool) {
                this.setTool(this._prevTool);
                this._prevTool = null;
            }
        };
        window.addEventListener('keydown', this._onKey);
        window.addEventListener('keyup', this._onKeyUp);

        // 底部瓦片条：鼠标拖拽滑动（移动 >5px 视为拖动，否则算点击选瓦片）
        const scroll = this.container.querySelector('.mape-palette-scroll');
        if (scroll) {
            let drag = null;
            scroll.addEventListener('pointerdown', (e) => {
                drag = { sx: e.clientX, sl: scroll.scrollLeft, moved: false };
            });
            scroll.addEventListener('pointermove', (e) => {
                if (!drag) return;
                const dx = e.clientX - drag.sx;
                if (!drag.moved && Math.abs(dx) > 5) {
                    drag.moved = true;
                    scroll.classList.add('dragging');
                }
                if (drag.moved) {
                    scroll.scrollLeft = drag.sl - dx;
                    e.preventDefault();
                }
            });
            const endDrag = () => {
                if (drag && drag.moved) {
                    // 拖动刚结束：拦截紧随的 click（避免误选瓦片）
                    this._scrollJustDragged = true;
                    setTimeout(() => { this._scrollJustDragged = false; }, 80);
                }
                drag = null;
                scroll.classList.remove('dragging');
            };
            window.addEventListener('pointerup', endDrag);
            window.addEventListener('pointercancel', endDrag);
            // 捕获阶段拦截：拖动结束的 80ms 内吞掉 swatch 的 click
            scroll.addEventListener('click', (e) => {
                if (this._scrollJustDragged) {
                    e.stopPropagation();
                    e.preventDefault();
                }
            }, true);
        }
    }

    setTool(tool) {
        this.tool = tool;
        this.container.querySelectorAll('.mape-tool').forEach(b => {
            b.classList.toggle('active', b.dataset.tool === tool);
        });
        // 抓手 → grab 光标；其他 → crosshair
        this.canvas.style.cursor = tool === 'pan' ? 'grab' : 'crosshair';
        this.updateHUD();
    }

    cellFromEvent(e) {
        // getBoundingClientRect 返回 transform 后的实际显示区域，
        // 用相对位置换算 canvas 内部坐标，天然兼容 zoom + pan
        const rect = this.canvas.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width;   // 0~1
        const relY = (e.clientY - rect.top) / rect.height;
        const px = relX * this.canvas.width;
        const py = relY * this.canvas.height;
        const x = Math.floor(px / this.TILE);
        const y = Math.floor(py / this.TILE);
        const N = this.scene ? this.scene.size : GRID;
        if (x < 0 || y < 0 || x >= N || y >= N) return null;
        return { tx: x, ty: y };
    }

    onPointerDown(e) {
        // 抓手工具：拖动 = 改 canvas 平移（transform translate）
        if (this.tool === 'pan') {
            this._panning = { sx: e.clientX, sy: e.clientY, px: this.pan.x, py: this.pan.y };
            try { this.canvas.setPointerCapture(e.pointerId); } catch (err) {}
            this.canvas.style.cursor = 'grabbing';
            return;
        }
        const c = this.cellFromEvent(e);
        if (!c) return;
        this.hover = c;
        this.drawing = true;
        try { this.canvas.setPointerCapture(e.pointerId); } catch (err) {}
        // 拾取模式：点击立刻拿属性
        if (this.tool === 'picker') {
            const g = this.scene.layers.ground[c.ty][c.tx];
            if (g) {
                this.activeTileId = g;
                this.markActiveSwatch();
            }
            this.render();
            this.updateHUD();
            this.updateProp();
            return;
        }
        this.applyTool(c.tx, c.ty);
        this.render();
        this.updateHUD();
        this.updateProp();
    }

    onPointerMove(e) {
        // 抓手拖动中：改 canvas translate
        if (this._panning) {
            this.pan.x = this._panning.px + (e.clientX - this._panning.sx);
            this.pan.y = this._panning.py + (e.clientY - this._panning.sy);
            this.applyViewTransform();
            return;
        }
        const c = this.cellFromEvent(e);
        const changed = JSON.stringify(c) !== JSON.stringify(this.hover);
        this.hover = c;
        if (c && this.drawing && this.tool !== 'picker') this.applyTool(c.tx, c.ty);
        if (changed || this.drawing) {
            this.render();
            this.updateHUD();
            this.updateProp();
        }
    }

    /** 应用当前工具到指定格子（push undo + mutate + 资产数量扣/还） */
    applyTool(tx, ty) {
        // 入栈（仅首次按下；拖动时不再入栈）
        if (!this._lastPainted || this._lastPainted.tx !== tx || this._lastPainted.ty !== ty) {
            this.pushUndo();
            this._lastPainted = { tx, ty };
        } else {
            return; // 同一格已画过，不重复入栈/改动
        }
        const g = this.scene.layers.ground;
        const oldTile = g[ty][tx];

        if (this.tool === 'pen') {
            const tid = this.activeTileId;
            if (!tid) return;
            if (oldTile === tid) return; // 同瓦片，无变化
            // 资产数量检查：数量不足则拒绝
            if ((this.tileCount[tid] || 0) <= 0) {
                this.toast(`「${tid}」数量已用完`);
                return;
            }
            // 换瓦片：还旧 → 扣新
            if (oldTile) this.tileCount[oldTile] = (this.tileCount[oldTile] || 0) + 1;
            this.tileCount[tid]--;
            g[ty][tx] = tid;
        } else if (this.tool === 'eraser') {
            if (!oldTile) return; // 已是空
            // 擦除：归还瓦片
            this.tileCount[oldTile] = (this.tileCount[oldTile] || 0) + 1;
            g[ty][tx] = null;
        } else if (this.tool === 'wall') {
            this.scene.layers.collision[ty][tx] = this.scene.layers.collision[ty][tx] ? 0 : 1;
        }
        this.dirty = true;
        this.refreshCounts();
        this.updateDirtyUI();
    }

    pushUndo() {
        this.undoStack.push(JSON.stringify({
            ground: this.scene.layers.ground,
            collision: this.scene.layers.collision,
            tileCount: this.tileCount
        }));
        if (this.undoStack.length > this.MAX_UNDO) this.undoStack.shift();
        this.updateUndoUI();
    }

    undo() {
        if (!this.undoStack.length) return;
        const snap = this.undoStack.pop();
        const data = JSON.parse(snap);
        this.scene.layers.ground = data.ground;
        this.scene.layers.collision = data.collision;
        if (data.tileCount) this.tileCount = data.tileCount;
        this.dirty = true;
        this.render();
        this.refreshCounts();
        this.updateLayerCounts();
        this.updateDirtyUI();
        this.updateUndoUI();
        this.updateProp();
    }

    // ==================== 保存 / 导出 ====================

    save() {
        // M1：写 localStorage 草稿 + 更新 places.json 缓存（HAP 写入 M2 接入）
        this.saveDraft();
        this.dirty = false;
        this.updateDirtyUI();
        this.toast('已保存草稿到 localStorage（M2 接 HAP）');
        // 同步到 World.places 缓存（让世界页立即看到效果）
        if (World.places && World.places.get(this.sceneId)) {
            const p = World.places.get(this.sceneId);
            if (p.xsdt) {
                p.xsdt.layers = this.scene.layers;
                // 写 places.json（dev mock）
                this.writePlacesJson(p);
            }
        }
    }

    async writePlacesJson(place) {
        try {
            const arr = await fetch('./assets/places.json?v=' + Date.now(), { cache: 'no-store' })
                .then(r => r.ok ? r.json() : []);
            const idx = arr.findIndex(p => p.rowid === this.sceneId);
            if (idx >= 0) {
                arr[idx] = place;
                // 注：浏览器 fetch 不能写文件，仅更新内存缓存
                // 真实持久化由 sync-hap-data.js 烘焙或 M2 直写 HAP
                this.toast('已更新内存缓存 + localStorage 草稿');
            }
        } catch (e) {}
    }

    exportJson() {
        const blob = new Blob([JSON.stringify(this.scene, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${this.sceneId.slice(0, 8)}_scene.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    toast(text) {
        const el = this.container.querySelector('#mapeToast');
        el.textContent = text;
        el.style.display = '';
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2200);
    }

    destroy() {
        clearTimeout(this._toastTimer);
        window.removeEventListener('keydown', this._onKey);
        window.removeEventListener('keyup', this._onKeyUp);
        if (this.resizeObs) this.resizeObs.disconnect();
    }
}