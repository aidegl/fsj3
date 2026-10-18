/**
 * 像素渲染器
 * 坐标体系：Canvas 逻辑宽固定 120（系统级分辨率=屏宽/120），1 像素数据 = 1 逻辑像素
 * - 整数倍缩放显示、禁抗锯齿，保证像素清晰
 * - 静态地图预渲染到离屏 canvas，主循环只 drawImage + 画角色（性能保障）
 */

/** 尺寸约定：视口逻辑宽 120（zoom 2x，约 2.5 格宽）；瓦片像素数据 16x16，每格 2x2=4 块 */

/** 通用像素数组绘制：pixels[y][x] = hex(无#) | null；1 数据像素 = scale 逻辑像素 */
export function drawPixels(ctx, pixels, dx, dy, scale = 1) {
    for (let y = 0; y < pixels.length; y++) {
        const row = pixels[y];
        for (let x = 0; x < row.length; x++) {
            const px = row[x];
            if (px === null || px === '' || px === undefined) continue;
            ctx.fillStyle = '#' + px;
            ctx.fillRect(dx + x * scale, dy + y * scale, scale, scale);
        }
    }
}

/** 轮廓描边：沿像素边界外圈绘制 1px 描边（4 邻域透明检测） */
export function drawOutline(ctx, pixels, dx, dy, color, scale = 1) {
    const h = pixels.length, w = pixels[0].length;
    const solid = (x, y) => x >= 0 && x < w && y >= 0 && y < h && pixels[y][x] !== null && pixels[y][x] !== '';
    ctx.fillStyle = color;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (!solid(x, y)) continue;
            if (!solid(x, y - 1)) ctx.fillRect(dx + x * scale, dy + (y - 1) * scale, scale, scale);
            if (!solid(x, y + 1)) ctx.fillRect(dx + x * scale, dy + (y + 1) * scale, scale, scale);
            if (!solid(x - 1, y)) ctx.fillRect(dx + (x - 1) * scale, dy + y * scale, scale, scale);
            if (!solid(x + 1, y)) ctx.fillRect(dx + (x + 1) * scale, dy + y * scale, scale, scale);
        }
    }
}

/**
 * 场景渲染器（48x48 格，1 格 = TILE 像素）
 * 管理摄像机与三层绘制（地形/装饰缓存为离屏图，角色每帧画）
 */
export class SceneRenderer {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {Object} scene 场景数据（assets/scenes/*.json）
     */
    constructor(canvas, scene) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;
        this.scene = scene;
        this.TILE = scene.tilesize;             // 16
        this.worldPx = scene.size * this.TILE;  // 768
        this.camera = { x: 0, y: 0 };
        this.camTarget = null;                   // 镜头平滑跟随目标（传呼居中等）
        this.scale = 1;                          // 逻辑像素 → 屏幕像素（可为非整数，CSS 满屏）
        this.decoCache = null;                   // 地形+装饰离屏缓存
    }

    /** 每帧调用：镜头向目标平滑插值；camTarget = {x,y} 静态点 或 {agent} 跟随角色 */
    tickCamera() {
        if (!this.camTarget) return;
        let tx, ty;
        if (this.camTarget.agent) {
            const a = this.camTarget.agent;
            tx = a.wx + this.TILE / 2 - this.viewW / 2;
            ty = a.wy + a.drawOffY + a.ph / 2 - this.viewH / 2;
        } else {
            tx = this.camTarget.x; ty = this.camTarget.y;
        }
        const dx = tx - this.camera.x;
        const dy = ty - this.camera.y;
        // 跟随模式持续追踪；静态目标贴齐后结束
        if (!this.camTarget.agent && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
            this.camera.x = tx;
            this.camera.y = ty;
            this.camTarget = null;
        } else {
            this.camera.x += dx * 0.12;
            this.camera.y += dy * 0.12;
        }
        this.clampCamera();
    }

    /** 尺寸适配：视口逻辑宽固定 120（整体 2x 放大），CSS 满屏缩放 */
    resize() {
        this.scale = window.innerWidth / 120;
        const logicW = 120;
        const logicH = Math.ceil(window.innerHeight / this.scale);
        this.canvas.width = logicW;
        this.canvas.height = logicH;
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = (logicH * this.scale) + 'px';
        this.viewW = logicW;
        this.viewH = logicH;
        this.buildDecoCache();
        this.clampCamera();
    }

    /** 地形+装饰预渲染：每格 3x3 = 9 块瓦片（各 TILE/3 = 16px，瓦片数据 1:1 无缩放） */
    buildDecoCache() {
        const off = document.createElement('canvas');
        off.width = this.worldPx;
        off.height = this.worldPx;
        const octx = off.getContext('2d');
        octx.imageSmoothingEnabled = false;
        const { ground, decor } = this.scene.layers;
        // 瓦片数据 16x16 → 每块 TILE/3 px（48/3=16，整数 1:1），每 tileId 缓存一个小 canvas
        const third = this.TILE / 3;
        const tileCanvas = {};
        const getTile = (id) => {
            if (tileCanvas[id]) return tileCanvas[id];
            const px = this.scene.tiles[id];
            if (!px) return null;
            const c = document.createElement('canvas');
            c.width = 16; c.height = 16;
            const cctx = c.getContext('2d');
            drawPixels(cctx, px, 0, 0);
            tileCanvas[id] = c;
            return c;
        };
        for (let ty = 0; ty < this.scene.size; ty++) {
            for (let tx = 0; tx < this.scene.size; tx++) {
                const gx = tx * this.TILE, gy = ty * this.TILE;
                const g = getTile(ground[ty][tx]);
                if (g) {
                    for (let by = 0; by < 3; by++) {
                        for (let bx = 0; bx < 3; bx++) {
                            octx.drawImage(g, gx + bx * third, gy + by * third, third, third);
                        }
                    }
                }
                const dId = decor[ty][tx];
                if (dId) {
                    const d = getTile(dId);
                    if (d) octx.drawImage(d, gx, gy, this.TILE, this.TILE);
                }
            }
        }
        this.decoCache = off;
    }

    clampCamera() {
        const maxX = Math.max(0, this.worldPx - this.viewW);
        const maxY = Math.max(0, this.worldPx - this.viewH);
        this.camera.x = Math.min(Math.max(0, this.camera.x), maxX);
        this.camera.y = Math.min(Math.max(0, this.camera.y), maxY);
    }

    /** 世界逻辑坐标 → 屏幕坐标（供拾取/UI 锚定） */
    worldToScreen(wx, wy) {
        return { x: (wx - this.camera.x) * this.scale, y: (wy - this.camera.y) * this.scale };
    }

    /** 屏幕坐标 → 世界逻辑坐标 */
    screenToWorld(sx, sy) {
        return { x: sx / this.scale + this.camera.x, y: sy / this.scale + this.camera.y };
    }

    /** 每帧：镜头跟随 → 清屏 → 画缓存地图 → 画角色列表（按 y 排序） */
    render(agents, t) {
        this.tickCamera();
        const ctx = this.ctx;
        ctx.fillStyle = '#0a0a12';
        ctx.fillRect(0, 0, this.viewW, this.viewH);
        ctx.drawImage(this.decoCache, -this.camera.x, -this.camera.y);

        // 角色阴影（角色脚下=绘制底部，逻辑坐标系直接绘制）
        for (const a of agents) {
            const lx = a.wx + this.TILE / 2 - this.camera.x;
            const ly = a.wy + a.drawOffY + a.ph - this.camera.y;
            ctx.fillStyle = 'rgba(3,3,3,0.25)';
            ctx.fillRect(lx - 6, ly - 1, 12, 2);
        }
        // 按 y 排序绘制（远→近）；像素画以脚底格为锚：水平居中、底部对齐脚底
        const sorted = agents.slice().sort((a, b) => a.wy - b.wy);
        for (const a of sorted) {
            const frame = a.currentFrame(t);
            const dx = Math.round(a.wx + a.drawOffX - this.camera.x);
            const dy = Math.round(a.wy + a.drawOffY - this.camera.y - (a.bounceOffset(t) || 0));
            drawPixels(ctx, frame, dx, dy);
            if (a.selected) {
                const wuxingColor = a.getOutlineColor();
                drawOutline(ctx, frame, dx, dy, wuxingColor);
            }
        }
    }
}

