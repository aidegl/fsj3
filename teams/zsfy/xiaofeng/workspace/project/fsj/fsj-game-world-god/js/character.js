/**
 * Game World · 角色（本地玩家 + 远程 agent）
 * MVP：模式色圆标 + 首字 + 名牌 + 朝向点；三向立绘就绪后换帧渲染（接口不变）
 */
export const player = {
    agentId: '', name: '', x: 480, y: 270, facing: 'down',
    speed: 3, color: '#1677ff', char: '无', target: null
};
export const remotes = new Map();   // agentId -> {x, y, name, char, color, lastSeen}

export function initPlayer(agentId, name, char, color) {
    player.agentId = agentId; player.name = name; player.char = char; player.color = color;
    player.x = 480; player.y = 270; player.facing = 'down';
}

const FACING_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** 点哪走哪（触屏/鼠标通用）：设置移动目标 */
export function setTarget(x, y) {
    player.target = { x: Math.max(16, Math.min(960 - 16, x)), y: Math.max(16, Math.min(540 - 16, y)) };
}

const FACING_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** 键盘输入 → 移动 + 朝向；返回是否移动了（键盘优先，移动时清除点选目标） */
export function handleInput(keys) {
    let dx = 0, dy = 0;
    if (keys.has('ArrowUp') || keys.has('KeyW')) { dy -= 1; player.facing = 'up'; }
    if (keys.has('ArrowDown') || keys.has('KeyS')) { dy += 1; player.facing = 'down'; }
    if (keys.has('ArrowLeft') || keys.has('KeyA')) { dx -= 1; player.facing = 'left'; }
    if (keys.has('ArrowRight') || keys.has('KeyD')) { dx += 1; player.facing = 'right'; }
    if (dx === 0 && dy === 0) {
        if (player.target) {
            const tdx = player.target.x - player.x, tdy = player.target.y - player.y;
            const d = Math.hypot(tdx, tdy);
            if (d < player.speed) { player.x = player.target.x; player.y = player.target.y; player.target = null; }
            else { player.x += (tdx / d) * player.speed; player.y += (tdy / d) * player.speed; return true; }
        }
        return false;
    }
    player.target = null;   // 键盘移动优先，清除点选目标
    const len = Math.hypot(dx, dy);
    player.x += (dx / len) * player.speed;
    player.y += (dy / len) * player.speed;
    player.x = Math.max(16, Math.min(960 - 16, player.x));
    player.y = Math.max(16, Math.min(540 - 16, player.y));
    return true;
}

/** 绘制一个 agent（本地或远程通用） */
export function drawAgent(ctx, a, isLocal) {
    const r = 16;
    // 圆标
    ctx.beginPath();
    ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
    ctx.fillStyle = a.color || '#1677ff';
    ctx.fill();
    ctx.lineWidth = isLocal ? 3 : 2;
    ctx.strokeStyle = isLocal ? '#e8d5a3' : 'rgba(255,255,255,0.5)';
    ctx.stroke();
    // 首字
    ctx.fillStyle = '#fff';
    ctx.font = '700 16px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(a.char || '?', a.x, a.y + 1);
    // 名牌
    ctx.font = '600 12px "Noto Sans SC", sans-serif';
    const label = a.name || '';
    const w = ctx.measureText(label).width + 12;
    ctx.fillStyle = 'rgba(10,14,26,0.8)';
    ctx.fillRect(a.x - w / 2, a.y + r + 4, w, 18);
    ctx.fillStyle = '#e8ecf5'; ctx.textBaseline = 'top';
    ctx.fillText(label, a.x, a.y + r + 8);
    // 朝向点（本地玩家）
    if (isLocal) {
        const vec = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[a.facing] || [0, 0];
        ctx.beginPath();
        ctx.arc(a.x + vec[0] * (r + 5), a.y + vec[1] * (r + 5), 3, 0, Math.PI * 2);
        ctx.fillStyle = '#e8d5a3'; ctx.fill();
    }
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

/** 远程 agent 过期清理（>30s 无心跳） */
export function pruneRemotes() {
    const now = Date.now();
    for (const [id, r] of remotes) {
        if (now - r.lastSeen > 30000) remotes.delete(id);
    }
}
