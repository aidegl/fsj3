/**
 * god-renderer - PC 相机 + 场景绘制
 *
 * 与手机端 SceneRenderer 的差异：
 * - 相机由用户掌控（滚轮缩放/拖拽平移），不跟随角色；像素锐利（imageSmoothing off）
 * - 地图一次性预渲染整张离屏图（手机端只渲染视口相关），上帝端要"整图任意缩放"
 * - 角色像素画直接用 characters/*.json 的 pixels_xiao（数据驱动，帧循环）
 */
import { drawPixels } from '../../../fsj-pixel-world/js/core/renderer.js';

/** 场景整图预渲染：ground(每格3x3块) + decor(z 覆盖)，返回离屏 canvas */
export function buildSceneCanvas(scene) {
    const TILE = scene.tilesize || 48;
    const worldPx = scene.size * TILE;
    const off = document.createElement('canvas');
    off.width = worldPx; off.height = worldPx;
    const ctx = off.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const layers = scene.layers || {};
    const ground = layers.ground || [];
    const decor = layers.decor || [];
    const tileCanvas = {};
    const getTile = (id) => {
        if (!id) return null;
        if (tileCanvas[id]) return tileCanvas[id];
        const px = (scene.tiles || {})[id];
        if (!px) return null;
        const c = document.createElement('canvas');
        c.width = 16; c.height = 16;
        const cctx = c.getContext('2d');
        drawPixels(cctx, px, 0, 0);
        tileCanvas[id] = c;
        return c;
    };
    for (let ty = 0; ty < scene.size; ty++) {
        const grow = ground[ty] || [], drow = decor[ty] || [];
        for (let tx = 0; tx < scene.size; tx++) {
            const gx = tx * TILE, gy = ty * TILE;
            const g = getTile(grow[tx]);
            if (g) {
                const third = TILE / 3;
                for (let by = 0; by < 3; by++) {
                    for (let bx = 0; bx < 3; bx++) {
                        ctx.drawImage(g, gx + bx * third, gy + by * third, third, third);
                    }
                }
            }
            const d = getTile(drow[tx]);
            if (d) ctx.drawImage(d, gx, gy, TILE, TILE);
        }
    }
    return off;
}

/** 角色精灵缓存：pixels_xiao[帧] → 离屏 canvas（1 数据像素 = 1 canvas 像素） */
const spriteCache = new Map();      // agentId -> [canvas per frame]
export function getSprites(char) {
    if (!char || !char.pixels_xiao) return null;
    let arr = spriteCache.get(char.rowid);
    if (!arr) {
        arr = char.pixels_xiao.map(frame => {
            const h = frame.length, w = frame[0].length;
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            drawPixels(c.getContext('2d'), frame, 0, 0);
            return c;
        });
        spriteCache.set(char.rowid, arr);
    }
    return arr;
}

/**
 * GodCamera - 场景视图相机
 * zoom 连续可调（默认整图适配），缩放锚定鼠标点；拖拽平移；边界钳制
 */
export class GodCamera {
    constructor(scene) {
        this.TILE = scene.tilesize || 48;
        this.worldPx = scene.size * this.TILE;
        this.x = 0; this.y = 0;        // 视口左上角的世界像素坐标
        this.zoom = 1;
    }

    /** 视口尺寸变化/进入场景时：整图适配居中 */
    fit(vw, vh, pad = 24) {
        this.zoom = Math.min((vw - pad * 2) / this.worldPx, (vh - pad * 2) / this.worldPx);
        this.zoom = Math.max(0.1, Math.min(this.zoom, 4));
        this.center(vw, vh);
    }

    center(vw, vh) {
        this.x = (this.worldPx - vw / this.zoom) / 2;
        this.y = (this.worldPx - vh / this.zoom) / 2;
        this.clamp(vw, vh);
    }

    clamp(vw, vh) {
        const viewW = vw / this.zoom, viewH = vh / this.zoom;
        if (viewW >= this.worldPx) this.x = (this.worldPx - viewW) / 2;
        else this.x = Math.min(Math.max(0, this.x), this.worldPx - viewW);
        if (viewH >= this.worldPx) this.y = (this.worldPx - viewH) / 2;
        else this.y = Math.min(Math.max(0, this.y), this.worldPx - viewH);
    }

    /** 滚轮缩放（锚定鼠标点） */
    zoomAt(sx, sy, factor, vw, vh) {
        const wx = this.x + sx / this.zoom;
        const wy = this.y + sy / this.zoom;
        this.zoom = Math.min(Math.max(0.1, this.zoom * factor), 4);
        this.x = wx - sx / this.zoom;
        this.y = wy - sy / this.zoom;
        this.clamp(vw, vh);
    }

    pan(dx, dy, vw, vh) {
        this.x -= dx / this.zoom;
        this.y -= dy / this.zoom;
        this.clamp(vw, vh);
    }

    /** 世界格坐标 → 屏幕像素 */
    gridToScreen(tx, ty) {
        const wx = tx * this.TILE, wy = ty * this.TILE;
        return { x: (wx - this.x) * this.zoom, y: (wy - this.y) * this.zoom };
    }

    /** 屏幕像素 → 世界像素 */
    screenToWorldPx(sx, sy) {
        return { x: this.x + sx / this.zoom, y: this.y + sy / this.zoom };
    }
}

/** 每帧绘制场景视图：地图 + 阴影 + 角色（y 排序，stale 半透明）+ 帧动画 */
export function renderScene(ctx, cam, mapCanvas, members, t, vw, vh) {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, vw, vh);
    ctx.save();
    ctx.setTransform(cam.zoom, 0, 0, cam.zoom, -cam.x * cam.zoom, -cam.y * cam.zoom);
    if (mapCanvas) ctx.drawImage(mapCanvas, 0, 0);

    const TILE = cam.TILE;
    // 阴影
    for (const m of members) {
        if (!m.pos) continue;
        const wx = m.pos.px * TILE, wy = m.pos.py * TILE;
        ctx.fillStyle = 'rgba(3,3,3,0.25)';
        ctx.fillRect(wx + TILE / 2 - 6, wy + TILE - 2, 12, 2);
    }
    // 角色（按 y 排序；移动时帧循环）
    // 注：不再按"快照/实时"调透明度——快照是 HAP 里最权威的最近位置，全速显示；
    //     数据来源（快照/实时）在悬停名牌里说明。
    const sorted = members.filter(m => m.pos).sort((a, b) => a.pos.py - b.pos.py);
    for (const m of sorted) {
        const sprites = getSprites(m.char);
        if (!sprites || !sprites.length) continue;
        const moving = m._movingUntil && t < m._movingUntil;
        const frameIdx = moving ? Math.floor(t / 160) % sprites.length : 0;
        const sprite = sprites[frameIdx] || sprites[0];
        const TILEm = TILE;
        const dx = Math.round(m.pos.px * TILEm + TILEm / 2 - sprite.width / 2);
        const dy = Math.round(m.pos.py * TILEm + TILEm - sprite.height);
        ctx.drawImage(sprite, dx, dy);
        if (m._selected) {
            // 五行色描边（简化：底座方框）
            ctx.strokeStyle = colorOfWuxing(m.wuxing || (m.char && m.char.wuxing));
            ctx.lineWidth = 2 / cam.zoom;
            ctx.strokeRect(m.pos.px * TILEm + 4, m.pos.py * TILEm + 4, TILEm - 8, TILEm - 8);
        }
    }
    ctx.restore();
}

export function colorOfWuxing(wx) {
    return ({ 金: '#ffd700', 木: '#2bd64f', 水: '#00a2e8', 火: '#ff5a3c', 土: '#d9931a' })[wx] || '#1677ff';
}

/**
 * 缩略图：场景整图缩到 maxPx 内 + 成员实时圆点（每帧重绘圆点，图缓存）
 * 返回 {base: 离屏缩略图, dots(sceneId, members, t): 绘制圆点}
 */
export function buildThumb(scene, maxPx = 220) {
    const full = buildSceneCanvas(scene);
    const scale = Math.min(maxPx / full.width, maxPx / full.height);
    const base = document.createElement('canvas');
    base.width = Math.max(1, Math.round(full.width * scale));
    base.height = Math.max(1, Math.round(full.height * scale));
    const ctx = base.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(full, 0, 0, base.width, base.height);
    return { base, scale, sceneTile: scene.tilesize || 48 };
}

/** 在缩略图上画成员圆点（overview 主循环调用） */
export function drawThumbDots(ctx, thumb, members) {
    const TILE = 48;    // 场景标准 tilesize（缩略图按 scene.tilesize 换算）
    for (const m of members) {
        if (!m.pos) continue;
        const x = m.pos.px * thumb.sceneTile * thumb.scale;
        const y = m.pos.py * thumb.sceneTile * thumb.scale;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
}
