/**
 * Game World · 手机版地图（2×2 拼接占位图渲染）
 * 真实地图块资产就绪后换贴图渲染，接口不变
 */
export const WORLD_W = 960;
export const WORLD_H = 540;

const BLOCKS = [
    { name: '中央广场', base: '#1a2332', accent: '#2a3a55' },
    { name: '东 市',   base: '#22301f', accent: '#33502e' },
    { name: '工坊区',   base: '#301f1a', accent: '#4d3328' },
    { name: '绿 洲',   base: '#1a2e2a', accent: '#2a4d44' },
];

export function buildMap() {
    const off = document.createElement('canvas');
    off.width = WORLD_W; off.height = WORLD_H;
    const ctx = off.getContext('2d');
    BLOCKS.forEach((b, i) => {
        const bx = (i % 2) * WORLD_W / 2, by = Math.floor(i / 2) * WORLD_H / 2;
        const bw = WORLD_W / 2, bh = WORLD_H / 2;
        ctx.fillStyle = b.base;
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
        for (let gx = bx; gx <= bx + bw; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, by); ctx.lineTo(gx, by + bh); ctx.stroke(); }
        for (let gy = by; gy <= by + bh; gy += 40) { ctx.beginPath(); ctx.moveTo(bx, gy); ctx.lineTo(bx + bw, gy); ctx.stroke(); }
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.font = '700 20px "Noto Sans SC", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(b.name, bx + bw / 2, by + bh / 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    });
    ctx.fillStyle = 'rgba(232,213,163,0.08)';
    ctx.fillRect(WORLD_W / 2 - 24, 0, 48, WORLD_H);
    ctx.fillRect(0, WORLD_H / 2 - 24, WORLD_W, 48);
    return off;
}
