/**
 * Game World · 拼接地图（2×2 块，每块独立资产）
 * MVP：程序化占位图（块底色+标签+网格纹理）；真实资产就绪后换 drawImage 贴图
 */
export const BLOCK_W = 480;
export const BLOCK_H = 270;
export const WORLD_W = BLOCK_W * 2;   // 960
export const WORLD_H = BLOCK_H * 2;   // 540

const BLOCKS = [
    { name: '中央广场', base: '#1a2332', accent: '#2a3a55' },
    { name: '东 市',   base: '#22301f', accent: '#33502e' },
    { name: '工坊区',   base: '#301f1a', accent: '#4d3328' },
    { name: '绿 洲',   base: '#1a2e2a', accent: '#2a4d44' },
];

/** 程序化占位地图（预渲染到离屏 canvas，一次绘制） */
export function buildMap() {
    const off = document.createElement('canvas');
    off.width = WORLD_W; off.height = WORLD_H;
    const ctx = off.getContext('2d');
    BLOCKS.forEach((b, i) => {
        const bx = (i % 2) * BLOCK_W, by = Math.floor(i / 2) * BLOCK_H;
        ctx.fillStyle = b.base;
        ctx.fillRect(bx, by, BLOCK_W, BLOCK_H);
        // 网格纹理（40px 格）
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        for (let gx = bx; gx <= bx + BLOCK_W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, by); ctx.lineTo(gx, by + BLOCK_H); ctx.stroke(); }
        for (let gy = by; gy <= by + BLOCK_H; gy += 40) { ctx.beginPath(); ctx.moveTo(bx, gy); ctx.lineTo(bx + BLOCK_W, gy); ctx.stroke(); }
        // 块标签
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.font = '700 22px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(b.name, bx + BLOCK_W / 2, by + BLOCK_H / 2);
        // 块边界
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.strokeRect(bx + 0.5, by + 0.5, BLOCK_W - 1, BLOCK_H - 1);
    });
    // 中央十字路
    ctx.fillStyle = 'rgba(232,213,163,0.08)';
    ctx.fillRect(WORLD_W / 2 - 24, 0, 48, WORLD_H);
    ctx.fillRect(0, WORLD_H / 2 - 24, WORLD_W, 48);
    return off;
}
