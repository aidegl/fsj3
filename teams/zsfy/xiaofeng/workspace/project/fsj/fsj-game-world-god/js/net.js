/**
 * Game World · WS 层（复用像素世界 ws-bus，同一管道）
 * 新消息类型 game.move 与 world.* 零干扰
 */
import { WsBus } from '../fsj-pixel-world/js/services/ws-bus.js';

export function initNet({ url, rowid, onRemoteMove }) {
    const bus = new WsBus({ url, rowid });
    bus.on('game.move', (body) => {
        if (!body || body.agentId === rowid) return;   // 自己的回声忽略
        onRemoteMove(body);
    });
    bus.connect();
    let lastSent = 0;
    return {
        bus,
        /** 移动广播（150ms 节流） */
        sendMove(x, y, facing, char, color, name) {
            const now = Date.now();
            if (now - lastSent < 150) return;
            lastSent = now;
            bus.send('game.move', { agentId: rowid, name, x: Math.round(x), y: Math.round(y), facing, char, color });
        }
    };
}
