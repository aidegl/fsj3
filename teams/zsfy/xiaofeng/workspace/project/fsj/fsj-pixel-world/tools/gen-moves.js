/**
 * 生成一批角色移动指令 → assets/moves.json
 * 像素视界页面每 3 秒轮询该文件并驱动角色行走（loop 控制角色移动的数据通道）
 *
 * 规则：
 *   - 目标格必须在 tu 与 tianfugong 两张地图都可走（保证角色在任一场景时指令有效）
 *   - 玩家东城（demo-dongcheng）从随机/循环模式中剔除：位置由 HAP 用户表保存
 *     （didian + 像素坐标）+ 摇杆控制；需要主动移动玩家时用显式命令：
 *       node tools/gen-moves.js demo-dongcheng 10 15
 *
 * 用法：
 *   node tools/gen-moves.js                       # 随机生成 NPC 各 1 条（不含玩家）
 *   node tools/gen-moves.js --loop 60000          # 每 60 秒生成一轮（NPC only）
 *   node tools/gen-moves.js demo-dongcheng 10 15  # 给指定角色写一条到 (10,15)（含玩家）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ALL_CHARACTERS = [
    'demo-dongcheng',   // 林东城（玩家，位置由 HAP + 摇杆控制；不参与随机）
    'demo-xiaozong', 'demo-xiaofeng', 'demo-ashuo',
    'demo-mengyao', 'demo-xiaoyun'
];
// 随机 / 循环模式只生成 NPC，玩家位置走 HAP 通道
const RANDOM_CHARACTERS = ALL_CHARACTERS.filter(r => r !== 'demo-dongcheng');
const SCENES = ['tu', 'tianfugong'];
const MOVES_PATH = path.join(ROOT, 'assets/moves.json');

function loadWalkable(sceneId) {
    const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/scenes', sceneId + '.json'), 'utf8'));
    return { size: s.size, collision: s.layers.collision };
}

function walkableInAll(scenes, x, y) {
    return scenes.every(sc => {
        if (y < 0 || x < 0 || y >= sc.size || x >= sc.size) return false;
        return !sc.collision[y][x];
    });
}

function writeMoves(moves) {
    const payload = { ts: Date.now(), moves };
    fs.writeFileSync(MOVES_PATH, JSON.stringify(payload, null, 2), 'utf8');
    console.log('[', new Date().toISOString(), ']', '已写', moves.length, '条 →', MOVES_PATH);
    return payload;
}

function randomMoves(scenes) {
    const moves = [];
    for (const rowid of RANDOM_CHARACTERS) {
        for (let i = 0; i < 30; i++) {
            const x = 2 + Math.floor(Math.random() * (scenes[0].size - 4));
            const y = 2 + Math.floor(Math.random() * (scenes[0].size - 4));
            if (walkableInAll(scenes, x, y)) {
                moves.push({ rowid, tx: x, ty: y });
                break;
            }
        }
    }
    return moves;
}

// ---- CLI 解析 ----
const args = process.argv.slice(2);

// 模式 1：循环生成
const loopIdx = args.indexOf('--loop');
if (loopIdx >= 0) {
    const interval = parseInt(args[loopIdx + 1] || '60000', 10);
    const scenes = SCENES.map(loadWalkable);
    console.log('循环模式：每', interval, 'ms 生成一轮，Ctrl+C 停止');
    const tick = () => writeMoves(randomMoves(scenes));
    tick();
    setInterval(tick, interval);
    return;
}

// 模式 2：指定角色 + 坐标  (rowid tx ty)
if (args.length >= 3 && !args[0].startsWith('--')) {
    const [rowid, tx, ty] = args;
    const x = parseInt(tx, 10), y = parseInt(ty, 10);
    const scenes = SCENES.map(loadWalkable);
    if (!walkableInAll(scenes, x, y)) {
        console.error(`坐标 (${x},${y}) 在两图上都不可走，请换一个`);
        process.exit(1);
    }
    writeMoves([{ rowid, tx: x, ty: y }]);
    return;
}

// 模式 3：默认批量随机
const scenes = SCENES.map(loadWalkable);
writeMoves(randomMoves(scenes));
