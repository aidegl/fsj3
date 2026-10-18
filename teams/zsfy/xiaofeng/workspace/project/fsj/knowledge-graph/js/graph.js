/**
 * graph.js — Canvas 力导向图引擎（黑色背景 + 辉光节点）
 *
 * 设计目标：4500+ 节点流畅。
 *  - 力模拟：网格分桶斥力 O(n) + 弹簧（fu 边）+ 向心力，alpha 降温自动停
 *  - 初始布局：径向树（按 fu 层级），给力模拟一个好起点，避免乱团
 *  - 渲染：节点辉光用离屏 sprite 缓存（颜色×半径），drawImage 贴图
 *  - 交互：滚轮缩放 / 拖拽平移 / 节点拖拽 / 悬停高亮邻居 / 点击选中
 *  - 两种模式：force（力导向）| tree（层级树固定布局）
 */

const DPR = () => Math.min(window.devicePixelRatio || 1, 2);

/* 辉光 sprite 缓存：key = color|r */
const spriteCache = new Map();

function getNodeSprite(color, r) {
    const key = `${color}|${Math.round(r)}`;
    let sp = spriteCache.get(key);
    if (sp) return sp;

    const glow = r * 2.6;                       // 辉光半径
    const size = Math.ceil((r + glow) * 2 + 4); // sprite 画布边长
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const cx = size / 2;

    // 外层辉光（径向渐变）
    const grad = g.createRadialGradient(cx, cx, r * 0.3, cx, cx, r + glow);
    grad.addColorStop(0, color);
    grad.addColorStop(0.35, withAlpha(color, 0.55));
    grad.addColorStop(1, withAlpha(color, 0));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cx, r + glow, 0, Math.PI * 2);
    g.fill();

    // 实心核心
    g.fillStyle = color;
    g.beginPath();
    g.arc(cx, cx, r, 0, Math.PI * 2);
    g.fill();

    // 高光点（左上小白点，球体感）
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath();
    g.arc(cx - r * 0.3, cx - r * 0.3, Math.max(1, r * 0.18), 0, Math.PI * 2);
    g.fill();

    sp = { canvas: c, size };
    if (spriteCache.size > 2000) spriteCache.clear(); // 防无限膨胀
    spriteCache.set(key, sp);
    return sp;
}

/** 'hsl(h, s%, l%)' → 'hsla(h, s%, l%, a)'；兼容 rgb/hex 直接返回带 alpha 的近似 */
function withAlpha(color, a) {
    const m = color.match(/^hsl\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)$/);
    if (m) return `hsla(${m[1]}, ${m[2]}%, ${m[3]}%, ${a})`;
    return color;
}

/* ============================================================ */

export class ForceGraph {

    /**
     * @param {HTMLCanvasElement} canvas
     * @param {object} cb {onHover(node, sx, sy), onClick(node), onViewport()}
     */
    constructor(canvas, cb = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.cb = cb;

        this.nodes = [];
        this.links = [];
        this.nodeById = new Map();
        this.adj = new Map();          // rowid → Set(邻居rowid)

        this.transform = { x: 0, y: 0, k: 1 };
        this.mode = 'force';
        this.alpha = 0;                // 模拟能量
        this.hoverNode = null;
        this.selectedNode = null;
        this.showLabels = true;
        this._raf = null;
        this._dragging = null;
        this._panning = false;
        this._lastMouse = null;
        this._moved = false;

        this._resize();
        this._bind();
    }

    /* ---------------- 数据 ---------------- */

    setData(nodes, links) {
        const old = this.nodeById;
        this.nodes = nodes;
        this.links = links;
        this.nodeById = new Map(nodes.map(n => [n.rowid, n]));

        // 保留旧位置（筛选后不跳变）
        let placed = 0;
        for (const n of nodes) {
            const o = old.get(n.rowid);
            if (o && Number.isFinite(o.x)) { n.x = o.x; n.y = o.y; placed++; }
        }

        // 邻接表
        this.adj = new Map(nodes.map(n => [n.rowid, new Set()]));
        for (const l of links) {
            if (this.adj.has(l.source)) this.adj.get(l.source).add(l.target);
            if (this.adj.has(l.target)) this.adj.get(l.target).add(l.source);
        }

        // 新节点占比高 → 重新初始布局
        if (placed < nodes.length * 0.5) this._radialTreeLayout();
        this.selectedNode = this.selectedNode && this.nodeById.has(this.selectedNode.rowid)
            ? this.nodeById.get(this.selectedNode.rowid) : null;
        this.hoverNode = null;

        if (this.mode === 'force') this.alpha = 0.9; else this.alpha = 0;
        this._kick();
    }

    setMode(mode) {
        this.mode = mode;
        if (mode === 'tree') { this._radialTreeLayout(); this.alpha = 0; }
        else { this.alpha = 0.6; }
        this._kick();
    }

    /* ---------------- 初始/树布局：径向树 ---------------- */

    _radialTreeLayout() {
        const { nodes } = this;
        if (!nodes.length) return;
        const children = new Map(nodes.map(n => [n.rowid, []]));
        const hasParent = new Set();
        for (const n of nodes) {
            for (const pid of n.fuIds) {
                if (children.has(pid) && pid !== n.rowid) {
                    children.get(pid).push(n.rowid);
                    hasParent.add(n.rowid);
                }
            }
        }
        const roots = nodes.filter(n => !hasParent.has(n.rowid)).map(n => n.rowid);

        // 叶子数（决定扇区大小）
        const leaf = new Map();
        const countLeaf = (id, seen) => {
            if (seen.has(id)) return 0;
            seen.add(id);
            const ch = children.get(id);
            if (!ch.length) { leaf.set(id, 1); return 1; }
            let s = 0;
            for (const c of ch) s += countLeaf(c, seen);
            leaf.set(id, s);
            return s;
        };
        for (const r0 of roots) countLeaf(r0, new Set());

        // 每层节点数 → 层半径（保证周长足够）
        const depth = new Map();
        const setDepth = (id, d, seen) => {
            if (seen.has(id)) return;
            seen.add(id); depth.set(id, d);
            for (const c of children.get(id)) setDepth(c, d + 1, seen);
        };
        for (const r0 of roots) setDepth(r0, 0, new Set());
        const layerCount = new Map();
        for (const n of nodes) {
            const d = depth.get(n.rowid) ?? 0;
            layerCount.set(d, (layerCount.get(d) || 0) + 1);
        }
        const SPACING = 26;
        const layerR = new Map();
        let acc = 0;
        const maxD = Math.max(0, ...layerCount.keys());
        for (let d = 0; d <= maxD; d++) {
            const cnt = layerCount.get(d) || 1;
            layerR.set(d, Math.max(60, cnt * SPACING / (2 * Math.PI)));
        }
        // 累加得到绝对半径
        const absR = new Map();
        for (let d = 0; d <= maxD; d++) { acc += layerR.get(d); absR.set(d, acc); }

        // DFS 分配角度扇区
        const put = (id, a0, a1, seen) => {
            if (seen.has(id)) return;
            seen.add(id);
            const node = this.nodeById.get(id);
            const d = depth.get(id) || 0;
            const ang = (a0 + a1) / 2;
            const rr = absR.get(d) || 0;
            if (node) {
                node.x = Math.cos(ang) * rr;
                node.y = Math.sin(ang) * rr;
            }
            const ch = children.get(id) || [];
            const total = ch.reduce((s, c) => s + (leaf.get(c) || 1), 0) || 1;
            let cur = a0;
            for (const c of ch) {
                const span = (a1 - a0) * ((leaf.get(c) || 1) / total);
                put(c, cur, cur + span, seen);
                cur += span;
            }
        };
        for (const r0 of roots) {
            const w = (leaf.get(r0) || 1) / Math.max(1, nodes.length);
            // 每棵树给满圈的一部分 + 根间留隙
            put(r0, -Math.PI, Math.PI, new Set());
        }

        // 未放置的（环等异常）随机放外圈
        const maxAbsR = acc + 200;
        for (const n of nodes) {
            if (!Number.isFinite(n.x)) {
                const a = Math.random() * Math.PI * 2;
                n.x = Math.cos(a) * maxAbsR;
                n.y = Math.sin(a) * maxAbsR;
            }
            n.vx = 0; n.vy = 0;
        }
    }

    /* ---------------- 力模拟 ---------------- */

    _step() {
        if (this.alpha <= 0.01) { this.alpha = 0; return false; }
        const { nodes, links } = this;
        const n = nodes.length;
        const k = Math.sqrt((4000 * 4000) / Math.max(1, n)); // 理想间距基准
        const rep = k * k * 0.02;
        const alpha = this.alpha;

        // 1) 斥力：网格分桶
        const CELL = Math.max(60, k * 0.9);
        const grid = new Map();
        for (let i = 0; i < n; i++) {
            const nd = nodes[i];
            const gx = Math.floor(nd.x / CELL), gy = Math.floor(nd.y / CELL);
            const key = gx + ',' + gy;
            let arr = grid.get(key);
            if (!arr) { arr = []; grid.set(key, arr); }
            arr.push(nd);
        }
        for (const nd of nodes) {
            const gx = Math.floor(nd.x / CELL), gy = Math.floor(nd.y / CELL);
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                const arr = grid.get((gx + dx) + ',' + (gy + dy));
                if (!arr) continue;
                for (const other of arr) {
                    if (other === nd) continue;
                    let ddx = nd.x - other.x, ddy = nd.y - other.y;
                    let d2 = ddx * ddx + ddy * ddy;
                    if (d2 < 1e-4) { ddx = (Math.random() - .5) * 0.1; ddy = (Math.random() - .5) * 0.1; d2 = ddx * ddx + ddy * ddy; }
                    if (d2 > CELL * CELL * 9) continue;
                    const d = Math.sqrt(d2);
                    const f = rep / d2 * alpha;
                    nd.vx += (ddx / d) * f; nd.vy += (ddy / d) * f;
                }
            }
        }

        // 2) 弹簧（fu 边紧、yynr 边松）
        for (const l of links) {
            const s = this.nodeById.get(l.source), t = this.nodeById.get(l.target);
            if (!s || !t) continue;
            const rest = (l.type === 'fu' ? 0.9 : 1.8) * k * 0.12 + s.r + t.r;
            const dx = t.x - s.x, dy = t.y - s.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
            const f = (d - rest) * 0.06 * alpha;
            const fx = (dx / d) * f, fy = (dy / d) * f;
            s.vx += fx; s.vy += fy;
            t.vx -= fx; t.vy -= fy;
        }

        // 3) 向心 + 积分
        const decay = 0.85;
        for (const nd of nodes) {
            nd.vx += -nd.x * 0.0015 * alpha;
            nd.vy += -nd.y * 0.0015 * alpha;
            nd.vx *= decay; nd.vy *= decay;
            if (nd === this._dragging) { nd.vx = nd.vy = 0; continue; }
            nd.x += Math.max(-30, Math.min(30, nd.vx));
            nd.y += Math.max(-30, Math.min(30, nd.vy));
        }

        this.alpha *= 0.995;
        return true;
    }

    /* ---------------- 渲染 ---------------- */

    render() {
        const { ctx, canvas } = this;
        const dpr = DPR();
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        const t = this.transform;
        const k = t.k * dpr;

        // 视口（世界坐标范围）
        const wx0 = -t.x / (t.k) , wy0 = -t.y / (t.k);
        const wx1 = (canvas.clientWidth - t.x) / t.k;
        const wy1 = (canvas.clientHeight - t.y) / t.k;

        const sx = (x) => x * k + t.x * dpr;
        const sy = (y) => y * k + t.y * dpr;

        const hover = this.hoverNode;
        const sel = this.selectedNode;
        // 高亮集合：hover/选中节点的邻居
        let hlSet = null;
        const focus = hover || sel;
        if (focus) {
            hlSet = new Set([focus.rowid, ...(this.adj.get(focus.rowid) || [])]);
        }

        /* --- 边 --- */
        ctx.lineWidth = 1;
        const drawLinks = (dim) => {
            ctx.beginPath();
            for (const l of this.links) {
                const s = this.nodeById.get(l.source), tn = this.nodeById.get(l.target);
                if (!s || !tn) continue;
                if (Math.min(s.x, tn.x) > wx1 || Math.max(s.x, tn.x) < wx0) continue;
                if (Math.min(s.y, tn.y) > wy1 || Math.max(s.y, tn.y) < wy0) continue;
                if (dim && hlSet && !(hlSet.has(l.source) && hlSet.has(l.target))) continue;
                ctx.moveTo(sx(s.x), sy(s.y));
                ctx.lineTo(sx(tn.x), sy(tn.y));
            }
            ctx.stroke();
        };
        // 普通边
        ctx.strokeStyle = 'rgba(160,170,200,0.14)';
        drawLinks(true);
        // 高亮边
        if (hlSet) {
            ctx.strokeStyle = 'rgba(110,168,254,0.55)';
            ctx.lineWidth = 1.4;
            drawLinks(false);
            ctx.lineWidth = 1;
        }
        // yynr 引用边（虚线，微亮）— 单独一轮画避免每边 setLineDash
        ctx.strokeStyle = 'rgba(253,224,71,0.18)';
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        for (const l of this.links) {
            if (l.type !== 'yynr') continue;
            const s = this.nodeById.get(l.source), tn = this.nodeById.get(l.target);
            if (!s || !tn) continue;
            ctx.moveTo(sx(s.x), sy(s.y));
            ctx.lineTo(sx(tn.x), sy(tn.y));
        }
        ctx.stroke();
        ctx.setLineDash([]);

        /* --- 节点 --- */
        // 标签兜底：缩小后阈值法会得到 0 个标签，改为对视口内最大 K 个节点强制标注
        const K = 12;
        const topR = []; // 降序，长度 ≤ K，末位即"第 K 大半径"
        for (const nd of this.nodes) {
            if (nd.x < wx0 || nd.x > wx1 || nd.y < wy0 || nd.y > wy1) continue;
            if (topR.length < K || nd.r > topR[K - 1]) {
                topR.push(nd.r);
                topR.sort((a, b) => b - a);
                if (topR.length > K) topR.length = K;
            }
        }
        // 兜底不看屏幕尺寸：全图视角下连最大节点都 <1px，直接强制 top-K 标注（星图式：点小字大）
        const fallbackR = topR.length === K ? topR[K - 1] : 0;

        const candidates = [];
        for (const nd of this.nodes) {
            const r = nd.r;
            if (nd.x + r * 4 < wx0 || nd.x - r * 4 > wx1) continue;
            if (nd.y + r * 4 < wy0 || nd.y - r * 4 > wy1) continue;

            const dimmed = hlSet && !hlSet.has(nd.rowid);
            ctx.globalAlpha = dimmed ? 0.25 : 1;

            const sp = getNodeSprite(nd.color, r);
            const size = sp.size * (k / DPR());
            ctx.drawImage(sp.canvas, sx(nd.x) - size / 2, sy(nd.y) - size / 2, size, size);
            ctx.globalAlpha = 1;

            // 选中环
            if (nd === sel) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(sx(nd.x), sy(nd.y), (r + 6) * k / DPR(), 0, Math.PI * 2);
                ctx.stroke();
            } else if (nd === hover) {
                ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(sx(nd.x), sy(nd.y), (r + 4) * k / DPR(), 0, Math.PI * 2);
                ctx.stroke();
            }

            // 标签：大节点 + 足够缩放；全图视角下兜底标注最大的 K 个
            if (this.showLabels && (r * t.k > 7 || (fallbackR > 0 && r >= fallbackR)) && candidates.length < 400) {
                candidates.push(nd);
            }
        }

        // 超量时优先保留大节点（放大后小节点也能过阈值，随机截断会显得杂乱）
        let labels = candidates;
        if (candidates.length > 220) {
            candidates.sort((a, b) => b.r - a.r);
            labels = candidates.slice(0, 220);
        }

        /* --- 标签 --- */
        if (labels.length) {
            // 字号下限 10px 保证可读，上限 15px：放大后节点变大而字不再放大，避免满屏文字淹没节点
            const fontPx = Math.min(15, Math.max(10, 11 * t.k * DPR()));
            ctx.font = `${fontPx}px "Segoe UI", "Microsoft YaHei", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            for (const nd of labels) {
                const dimmed = hlSet && !hlSet.has(nd.rowid);
                ctx.globalAlpha = dimmed ? 0.2 : 0.9;
                const tx = sx(nd.x);
                const ty = sy(nd.y) + nd.r * k / DPR() + 4 * DPR();
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                const txt = nd.mingcheng.slice(0, 24);
                const w2 = ctx.measureText(txt).width / 2;
                ctx.fillRect(tx - w2 - 3, ty, w2 * 2 + 6, fontPx + 6);
                ctx.fillStyle = '#e8e8ee';
                ctx.fillText(txt, tx, ty);
                ctx.globalAlpha = 1;
            }
        }
    }

    _loop = () => {
        const simActive = this.alpha > 0.01;
        if (simActive) this._step();
        this.render();
        if (simActive) {
            this._raf = requestAnimationFrame(this._loop);
        } else {
            this._raf = null;
        }
    };

    _kick() {
        if (!this._raf) this._raf = requestAnimationFrame(this._loop);
    }

    redraw() { this._kick(); }

    /* ---------------- 视口 ---------------- */

    zoomToFit(padding = 80) {
        if (!this.nodes.length) return;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const n of this.nodes) {
            if (n.x < x0) x0 = n.x; if (n.x > x1) x1 = n.x;
            if (n.y < y0) y0 = n.y; if (n.y > y1) y1 = n.y;
        }
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        const k = Math.min((w - padding * 2) / Math.max(1, x1 - x0), (h - padding * 2) / Math.max(1, y1 - y0));
        this.transform.k = Math.max(0.02, Math.min(2.5, k));
        this.transform.x = w / 2 - (x0 + x1) / 2 * this.transform.k;
        this.transform.y = h / 2 - (y0 + y1) / 2 * this.transform.k;
        this._kick();
    }

    focusNode(rowid, zoomK) {
        const n = this.nodeById.get(rowid);
        if (!n) return;
        this.selectedNode = n;
        if (zoomK) {
            const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
            this.transform.k = zoomK;
            this.transform.x = w / 2 - n.x * zoomK;
            this.transform.y = h / 2 - n.y * zoomK;
        }
        this._kick();
    }

    /* ---------------- 交互 ---------------- */

    _screenToWorld(sx0, sy0) {
        return {
            x: (sx0 - this.transform.x) / this.transform.k,
            y: (sy0 - this.transform.y) / this.transform.k,
        };
    }

    nodeAtScreen(sx0, sy0) {
        const w = this._screenToWorld(sx0, sy0);
        let best = null, bestD = Infinity;
        for (const n of this.nodes) {
            const dx = n.x - w.x, dy = n.y - w.y;
            const d = dx * dx + dy * dy;
            const rr = (n.r + 3) * (n.r + 3);
            if (d < rr && d < bestD) { best = n; bestD = d; }
        }
        return best;
    }

    _resize() {
        const dpr = DPR();
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
        this._kick();
    }

    _bind() {
        const cv = this.canvas;
        let downPos = null;

        cv.addEventListener('wheel', (e) => {
            e.preventDefault();
            const factor = Math.exp(-e.deltaY * 0.0012);
            const k0 = this.transform.k;
            const k1 = Math.max(0.01, Math.min(8, k0 * factor));
            // 以鼠标为锚点缩放
            const mx = e.offsetX, my = e.offsetY;
            this.transform.x = mx - (mx - this.transform.x) * (k1 / k0);
            this.transform.y = my - (my - this.transform.y) * (k1 / k0);
            this.transform.k = k1;
            this._kick();
        }, { passive: false });

        cv.addEventListener('mousedown', (e) => {
            downPos = { x: e.offsetX, y: e.offsetY };
            this._moved = false;
            const nd = this.nodeAtScreen(e.offsetX, e.offsetY);
            if (nd) {
                this._dragging = nd;
                this.canvas.classList.add('dragging');
            } else {
                this._panning = true;
                this.canvas.classList.add('dragging');
            }
        });

        cv.addEventListener('mousemove', (e) => {
            if (this._dragging || this._panning) {
                if (downPos && (Math.abs(e.offsetX - downPos.x) + Math.abs(e.offsetY - downPos.y) > 3)) {
                    this._moved = true;
                }
            }
            if (this._dragging) {
                const w = this._screenToWorld(e.offsetX, e.offsetY);
                this._dragging.x = w.x; this._dragging.y = w.y;
                this._dragging.vx = this._dragging.vy = 0;
                this.alpha = Math.max(this.alpha, 0.25); // 拖拽扰动周围
                this._kick();
            } else if (this._panning) {
                const dx = e.movementX, dy = e.movementY;
                this.transform.x += dx;
                this.transform.y += dy;
                this._kick();
            } else {
                const nd = this.nodeAtScreen(e.offsetX, e.offsetY);
                if (nd !== this.hoverNode) {
                    this.hoverNode = nd;
                    this.canvas.classList.toggle('hovering', !!nd);
                    this.cb.onHover && this.cb.onHover(nd, e.offsetX, e.offsetY);
                    this._kick();
                } else if (nd && this.cb.onHover) {
                    this.cb.onHover(nd, e.offsetX, e.offsetY);
                }
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (this._dragging && !this._moved) {
                this.selectedNode = this._dragging;
                this.cb.onClick && this.cb.onClick(this._dragging);
                this._kick();
            } else if (this._panning && !this._moved) {
                // 点击空白
                this.selectedNode = null;
                this.cb.onClick && this.cb.onClick(null);
                this._kick();
            }
            this._dragging = null;
            this._panning = false;
            this.canvas.classList.remove('dragging');
        });

        // 触摸（基础支持）
        cv.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                const t0 = e.touches[0];
                const rect = cv.getBoundingClientRect();
                const nd = this.nodeAtScreen(t0.clientX - rect.left, t0.clientY - rect.top);
                if (nd) { this._dragging = nd; }
                else this._panning = true;
            }
        }, { passive: true });
        cv.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1 && this._dragging) {
                const t0 = e.touches[0];
                const rect = cv.getBoundingClientRect();
                const w = this._screenToWorld(t0.clientX - rect.left, t0.clientY - rect.top);
                this._dragging.x = w.x; this._dragging.y = w.y;
                this.alpha = Math.max(this.alpha, 0.25);
                this._kick();
            }
        }, { passive: true });
        window.addEventListener('touchend', () => { this._dragging = null; this._panning = false; });

        window.addEventListener('resize', () => this._resize());
    }
}
