/**
 * Game World · 手机版角色（本地玩家 + 远程 agent）
 * 圆标 + 首字 + 名牌 + 朝向点；支持 target 走向和键盘
 */
export const player = {
    agentId: '', name: '', char: '', color: '#1677ff',
    x: 480, y: 270, facing: 'down', speed: 3, target: null
};
export const remotes = new Map();

export function initPlayer(agentId, name, char, color) {
    player.agentId = agentId; player.name = name; player.char = char; player.color = color;
    player.x = 480; player.y = 270; player.facing = 'down'; player.target = null;
}

export function setTarget(x, y) {
    player.target = { x: Math.max(16, Math.min(944, x)), y: Math.max(16, Math.min(524, y)) };
}

export function update() {
    if (player.target) {
        const dx = player.target.x - player.x, dy = player.target.y - player.y;
        const d = Math.hypot(dx, dy);
        if (d < player.speed) { player.x = player.target.x; player.y = player.target.y; player.target = null; }
        else { player.x += (dx / d) * player.speed; player.y += (dy / d) * player.speed; }
    }
}

export function drawToken(ctx, x, y, char, color, name, isLocal) {
    const r = 16;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = isLocal ? 3 : 2;
    ctx.strokeStyle = isLocal ? '#e8d5a3' : 'rgba(255,255,255,0.5)';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '700 16px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(char, x, y + 1);
    ctx.font = '600 12px "Noto Sans SC", sans-serif';
    const label = (name || '') + (isLocal ? '（我）' : '');
    const w = ctx.measureText(label).width + 12;
    ctx.fillStyle = 'rgba(10,14,26,0.8)';
    ctx.fillRect(x - w / 2, y + r + 4, w, 18);
    ctx.fillStyle = '#e8ecf5'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(label, x, y + r + 8);
}

export function pruneRemotes() {
    const now = Date.now();
    for (const [id, r] of remotes) {
        if (now - r.lastSeen > 30000) remotes.delete(id);
    }
}
