/**
 * 角色服务 - Agent 实体 + 日程状态机 + BFS 寻路 + 传呼
 *
 * 实体坐标：wx/wy 为世界逻辑像素（左上角），占用 1 格（TILE=16）
 * 状态机：schedule 循环 → idle(停留) / wander(驻点徘徊) / walk(寻路行走) / summoned(被传呼)
 */
import Palette from '../core/palette.js';

const TILE = 48;               // 格尺寸（与场景 JSON tilesize 一致）
const WALK_SPEED = 96;        // 逻辑像素/秒（约 2 格/秒）        // 逻辑像素/秒（约 2 格/秒）
const IDLE_MS = 2600;         // 驻点停留
const WANDER_GAP_MS = 1500;   // 徘徊间隔
// 设计决策（2026-09-02，林东城拍板）：角色移动只来自「用户操作」和「CLI 指令」，
// 日程自动巡游停用。想恢复世界自主活动时改回 true 即可。
const AUTO_WANDER = false;

/** BFS 寻路（48x48 小图足够），返回格子路径（含起点不含终点方向相反处理） */
export function findPath(scene, sx, sy, tx, ty, occupied) {
    const N = scene.size;
    const blocked = scene.layers.collision;
    const key = (x, y) => y * N + x;
    if (!inScene(tx, ty, N) || blocked[ty][tx]) return null;
    if (sx === tx && sy === ty) return [];
    const prev = new Map();
    const queue = [[sx, sy]];
    const seen = new Set([key(sx, sy)]);
    while (queue.length) {
        const [x, y] = queue.shift();
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
            const nx = x + dx, ny = y + dy;
            if (!inScene(nx, ny, N)) continue;
            const k = key(nx, ny);
            if (seen.has(k) || blocked[ny][nx]) continue;
            // 目标格若被其他角色占用，允许抵达（重叠容忍），但路过时避开
            if (occupied && occupied.has(k) && !(nx === tx && ny === ty)) continue;
            seen.add(k);
            prev.set(k, [x, y]);
            if (nx === tx && ny === ty) {
                // 回溯
                const path = [];
                let cur = [nx, ny];
                while (!(cur[0] === sx && cur[1] === sy)) {
                    path.push(cur);
                    cur = prev.get(key(cur[0], cur[1]));
                }
                return path.reverse();
            }
            queue.push([nx, ny]);
        }
    }
    return null;
}
function inScene(x, y, N) { return x >= 0 && x < N && y >= 0 && y < N; }

export class Agent {
    /**
     * @param {Object} data  角色 JSON（assets/characters/*.json）
     * @param {Object} scene 当前场景
     * @param {Array}  others 同场景其他 Agent（用于避让）
     */
    constructor(data, scene, spawn) {
        this.data = data;
        this.scene = scene;
        this.tx = spawn.x; this.ty = spawn.y;        // 所在格
        this.wx = this.tx * TILE; this.wy = this.ty * TILE; // 像素位（脚底格左上）
        this.w = TILE; this.h = TILE;
        // 绘制锚点：像素画以脚底格为参照，水平垂直都居中（40px 在 48px 格中四周留 4px）
        const px0 = data.pixels_xiao[0];
        this.pw = px0[0].length; this.ph = px0.length;
        this.drawOffX = -(this.pw - TILE) / 2;
        this.drawOffY = -(this.ph - TILE) / 2;
        this.facing = 'down';       // 朝向：down/up/left/right
        this.isPlayer = false;      // 第一人称玩家角色（东城），不受日程驱动
        this.state = 'idle';
        this.stateUntil = performance.now() + 600 + Math.random() * 2000; // 错峰启动
        this.path = null;
        this.pathIndex = 0;
        this.stepFrom = null;
        this.selected = false;
        this.talking = false;
        this.summonTarget = null;   // 传呼目标格
        this.onArrive = null;       // 传呼到达回调
        this.scheduleIndex = Math.floor(Math.random() * 4); // 日程错峰
        this.freezeSchedule = false; // 被远程玩家扮演时冻结本地日程（位置由扮演者广播驱动）
        this.dongzuo = 'zhanli';
    }

    get id() { return this.data.rowid; }
    get mingcheng() { return this.data.mingcheng; }

    getOutlineColor() {
        const ui = Palette.WUXING_UI[this.data.wuxing];
        return ui ? ui.b : '#00C5E8';
    }

    /** 当前朝向精灵：down 用 pixels_xiao，其余用 pixels_dir（缺失回退正面） */
    currentFrame(t) {
        if (this.facing !== 'down' && this.data.pixels_dir) {
            return this.data.pixels_dir[this.facing] || this.data.pixels_xiao[0];
        }
        const blinkCycle = 3000 + (this.blinkSeed || (this.blinkSeed = Math.random() * 2000));
        const phase = t % blinkCycle;
        return phase < 280 ? this.data.pixels_xiao[1] : this.data.pixels_xiao[0];
    }

    /** 待机呼吸浮动（走路时不浮动；0/1px 两态交替） */
    bounceOffset(t) {
        if (this.state !== 'idle' && this.state !== 'wander') return 0;
        return ((t / 420 + (this.blinkSeed || 0)) % 2 < 1) ? 0 : 1;
    }

    /** 主循环 tick（dt 毫秒） */
    tick(dt, now) {
        if (this.isPlayer) {
            // 玩家角色：只处理行走，日程由摇杆输入驱动（world 页）
            if (this.state === 'walk') this.tickWalk(dt);
            return;
        }
        switch (this.state) {
            case 'idle':
                if (AUTO_WANDER && !this.freezeSchedule && now > this.stateUntil) this.decideNext(now);
                break;
            case 'wander':
                if (AUTO_WANDER && !this.freezeSchedule && now > this.stateUntil) this.decideNext(now);
                break;
            case 'walk':
                this.tickWalk(dt);
                break;
        }
    }

    /** 日程决策：传呼 > 日程表下一站 > 徘徊 */
    decideNext(now) {
        if (this.summonTarget) {
            this.walkTo(this.summonTarget.x, this.summonTarget.y);
            this.state = 'walk';
            return;
        }
        const schedule = this.data.richeng;
        if (schedule && schedule.length) {
            const item = schedule[this.scheduleIndex % schedule.length];
            // 日程项是驻点格子（M1：同场景内巡游；跨场景留 TODO）
            if (item.x !== this.tx || item.y !== this.ty) {
                if (this.walkTo(item.x, item.y)) {
                    this.dongzuo = item.dongzuo || 'zhanli';
                    return;
                }
            }
            // 已在驻点：按动作决定停留方式
            this.scheduleIndex++;
            if (item.dongzuo === 'paihuai') {
                this.state = 'wander';
                this.stateUntil = now + 5000 + Math.random() * 5000;
                // 徘徊：随机邻近可通行格
                const spot = this.randomNearbySpot();
                if (spot) this.walkTo(spot.x, spot.y);
            } else {
                this.state = 'idle';
                this.stateUntil = now + IDLE_MS + Math.random() * 2000;
            }
            return;
        }
        // 无日程：原地徘徊
        this.state = 'wander';
        this.stateUntil = now + WANDER_GAP_MS;
    }

    randomNearbySpot() {
        for (let i = 0; i < 8; i++) {
            const dx = Math.round((Math.random() * 6 - 3));
            const dy = Math.round((Math.random() * 6 - 3));
            const x = this.tx + dx, y = this.ty + dy;
            if (x < 0 || y < 0 || x >= this.scene.size || y >= this.scene.size) continue;
            if (!this.scene.layers.collision[y][x]) return { x, y };
        }
        return null;
    }

    /** 开始寻路行走（成功返回 true） */
    walkTo(tx, ty, occupied) {
        const path = findPath(this.scene, this.tx, this.ty, tx, ty, occupied);
        if (!path || !path.length) return false;
        this.path = path;
        this.pathIndex = 0;
        this.stepFrom = { x: this.tx, y: this.ty };
        this.state = 'walk';
        return true;
    }

    /** 传呼：打断当前行为，走到指定格；到达后触发 onArrive */
    summon(x, y, onArrive) {
        this.summonTarget = { x, y };
        this.onArrive = onArrive || null;
        this.scheduleIndex = 0;
        this.walkTo(x, y);
    }

    clearSummon() {
        this.summonTarget = null;
        this.onArrive = null;
    }

    tickWalk(dt) {
        if (!this.path || this.pathIndex >= this.path.length) {
            this.state = 'idle';
            this.stateUntil = performance.now() + IDLE_MS;
            return;
        }
        const target = this.path[this.pathIndex];
        const targetPx = { x: target[0] * TILE, y: target[1] * TILE };
        const speed = WALK_SPEED * dt / 1000;
        const dx = targetPx.x - this.wx, dy = targetPx.y - this.wy;
        const dist = Math.abs(dx) + Math.abs(dy);
        if (dist <= speed) {
            this.wx = targetPx.x; this.wy = targetPx.y;
            this.tx = target[0]; this.ty = target[1];
            this.pathIndex++;
            if (this.pathIndex >= this.path.length) {
                this.path = null;
                let summoned = false;
                if (this.onMoveDone) { const cb = this.onMoveDone; this.onMoveDone = null; cb(this); } // 外部指令移动完成（日程移动不设此回调）
                if (this.summonTarget && this.tx === this.summonTarget.x && this.ty === this.summonTarget.y) {
                    this.summonTarget = null;
                    const cb = this.onArrive;
                    this.onArrive = null;
                    if (cb) cb(this);
                    summoned = true;
                }
                this.state = 'idle';
                // 传呼到达后停留 15s（配合对话），日常到达按动作停留
                this.stateUntil = performance.now() + (summoned ? 15000
                    : (this.dongzuo === 'paihuai' ? WANDER_GAP_MS : IDLE_MS));
            }
        } else {
            // 朝向随移动方向改变（主轴优先）
            if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > 0.01) this.facing = dx > 0 ? 'right' : 'left';
            else if (Math.abs(dy) > 0.01) this.facing = dy > 0 ? 'down' : 'up';
            if (Math.abs(dx) > 0.01) this.wx += Math.sign(dx) * Math.min(speed, Math.abs(dx));
            else this.wy += Math.sign(dy) * Math.min(speed, Math.abs(dy));
        }
    }

    /** 当前位置上下文（对话请求携带） */
    locationContext() {
        return {
            changjing: this.scene.id,
            changjing_miaoshu: this.scene.miaoshu,
            tx: this.tx, ty: this.ty
        };
    }

    /** 点击拾取：世界逻辑坐标是否命中（覆盖整个绘制区域 + 容差） */
    hitTest(wx, wy) {
        const x0 = this.wx + this.drawOffX - 2, y0 = this.wy + this.drawOffY - 2;
        return wx >= x0 && wx <= x0 + this.pw + 4 &&
               wy >= y0 && wy <= y0 + this.ph + 6;
    }
}

const CHAR_OVERRIDE_KEY = 'fsj_px_char_';

const mirror = px => px.map(row => row.slice().reverse());

/** 眨眼帧派生：上半区（头部）眼色 → 闭眼色（自适应尺寸，与 gen-assets.js 同规则） */
export function deriveBlinkFrame(stand, blink) {
    const eye = (blink && blink.eye) || '181818';
    const closed = (blink && blink.closed) || 'FFC2C2';
    const headRows = Math.floor(stand.length / 2);
    return stand.map((row, y) => row.map(px => (y <= headRows && px === eye) ? closed : px));
}

/**
 * 编辑器保存的形象覆盖（localStorage 热替换资产）
 * @param surfaces {down, up, side} 三角度（side=左侧，右侧自动镜像）
 * 注：40x40 模板的眼睛色与描边色同为 181818，无法安全派生眨眼帧——双帧同图（不眨眼）
 */
export function saveCharacterOverride(rowid, surfaces, blink) {
    const data = {
        pixels_xiao: [surfaces.down.map(r => r.slice()), surfaces.down.map(r => r.slice())],
        pixels_dir: { up: surfaces.up, left: surfaces.side, right: mirror(surfaces.side) },
        blink,
        savedAt: Date.now()
    };
    try {
        localStorage.setItem(CHAR_OVERRIDE_KEY + rowid, JSON.stringify(data));
        return true;
    } catch (e) { return false; }
}

export function clearCharacterOverride(rowid) {
    localStorage.removeItem(CHAR_OVERRIDE_KEY + rowid);
}

export function getCharacterOverride(rowid) {
    try { return JSON.parse(localStorage.getItem(CHAR_OVERRIDE_KEY + rowid) || 'null'); } catch (e) { return null; }
}

/** 加载全部角色数据（应用编辑器覆盖） */
export async function loadAgents() {
    const ids = ['xiaozong', 'xiaofeng', 'ashuo', 'mengyao', 'xiaoyun', 'dongcheng', 'biaozhun'];
    const list = await Promise.all(ids.map(id =>
        fetch(`./assets/characters/${id}.json?v=` + Date.now(), { cache: 'no-store' }).then(r => r.json())
    ));
    for (const a of list) {
        const over = getCharacterOverride(a.rowid);
        const sameSize = over && over.pixels_xiao && over.pixels_xiao[0].length === a.pixels_xiao[0].length;
        if (sameSize) {
            a.pixels_xiao = over.pixels_xiao;
            // 眨眼帧统一同图化（旧数据的派生眨眼帧有误伤缺陷，且站立帧才是用户的编辑内容）
            a.pixels_xiao[1] = a.pixels_xiao[0];
        }
        if (sameSize && over.pixels_dir) a.pixels_dir = over.pixels_dir;
    }
    return list;
}
