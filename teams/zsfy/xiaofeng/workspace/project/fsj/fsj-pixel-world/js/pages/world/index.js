/**
 * 世界页 - 两级视图（全景天界 / 场景内部）+ 角色交互 + 气泡对话
 */
import { SceneRenderer, drawPixels, drawOutline } from '../../core/renderer.js';
import Palette from '../../core/palette.js';
import World from '../../services/world.js';
import { Agent, loadAgents } from '../../services/agents.js';
import ChatStore from '../../services/chat-store.js';
import Members from '../../services/members.js';
import { WsBus } from '../../services/ws-bus.js';
import { FsjChat } from '../../services/fsj-chat.js';
import Level from '../../services/level.js';

const TILE = 48;               // 格尺寸（与场景 JSON tilesize 一致）

export default class WorldPage {
    constructor(container, params) {
        this.container = container;
        this.params = params;
        this.canvas = container.querySelector('#worldCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;

        this.mode = 'overview';          // overview | scene
        this.sceneRenderer = null;
        this.agents = [];                // 当前场景内 Agent 实体
        this.allAgentData = [];          // 全部角色数据
        this.selectedAgent = null;
        this.raf = 0;
        this.lastT = 0;

        // 聊天身份：URL ?use=<用户rowid>（真人身份，区别于世界里的分身）
        // 默认=林东城（真人），可通过 use 参数换成任何成员
        this.userRowid = (this.params && this.params.get('use')) || '183695fd-4e50-4b8b-8730-109e1aae6782';
        // 商家（组织）rowid：URL ?org=<商家rowid>，与 userRowid 一起查角色经验值（ptyh+shangjia2+关键词）
        this.orgRowid = (this.params && this.params.get('org')) || 'f009cda3-cc49-400d-82cd-cbe79ee8892f';
        this.playerExp = null;   // { szhz, jfhz, ... } 经验值账户（异步加载）
        this.userName = '林东城';
        this.conv = { agentId: null, convKey: null, msgs: [], source: '' };

        // 入口确认弹窗状态：玩家从 walk → idle（停在某格）且该格是入口 → 弹 confirm
        this._pendingEntry = null;       // 当前弹窗对应的入口配置
        this._askedEntries = new Set();  // 本场景已问过的格 key="tx,ty"
        this._lastPlayerState = null;    // 上一帧玩家状态（用于检测 walk→idle 转变）
        this._lastPlayerPos = '';        // 上一帧玩家坐标 key="tx,ty"

        // 拖动状态
        this.drag = { active: false, moved: false, sx: 0, sy: 0, camX: 0, camY: 0 };

        this._onResize = () => this.onResize();
        this._onKeyEsc = (e) => { if (e.key === 'Escape') this.closeAllPopups(); };
    }

    async init() {
        await Palette.load();
        this.world = await World.load();
        this.allAgentData = await loadAgents();
        await Members.load();
        Members.merge(this.allAgentData);
        ChatStore.ensureSeed(this.allAgentData);
        // 任务数据（tools/sync-hap-data.js 烘焙：zi 为空的最小可执行计划，按账号过滤）
        try {
            const res = await fetch(`./assets/tasks.json?v=${Date.now()}`, { cache: 'no-store' });
            this.taskDb = await res.json();
        } catch (e) { this.taskDb = {}; }
        // ws-bus 消息通道（透明广播管道，信封约定见 services/ws-bus.js）
        this.bus = new WsBus({ url: 'wss://100000whys.cn/ws', rowid: this.userRowid });
        this.bus.on('world.chat', (body) => this.onRemoteChat(body));
        this.bus.on('world.move', (body) => this.applyMove(body, 'ws-bus'));
        this.bus.on('world.presence', (body) => this.onPresence(body));
        this.bus.connect();
        // 在线心跳：宣告"我扮演着这个角色"（其他端冻结该角色日程，位置以我的广播为准）；心跳携带坐标兜底校正
        this._remotePlayed = new Map();   // agentId -> 最后心跳时间
        // 同角色多开互踢：instanceId 区分页面会话，bootTs 新者胜（后登录顶掉先登录）
        this.instanceId = Math.random().toString(36).slice(2, 10);
        this.bootTs = Date.now();
        this._eclipsed = false;           // 被更新的会话顶掉后：停止心跳/驱动/广播，原地旁观
        const beat = () => {
            if (this._eclipsed) return;
            const ag = this.player;
            if (!ag || !this.currentSceneId) return;
            this.bus.send('world.presence', { agentId: ag.data.rowid, online: true, tx: ag.tx, ty: ag.ty, scene: this.currentSceneId, instanceId: this.instanceId, bootTs: this.bootTs });
        };
        this._presenceTimer = setInterval(beat, 8000);
        this._presenceKick = setTimeout(beat, 1200);
        // 心跳超时扫描：20 秒无心跳 = 扮演者离线 → 角色原地待命（自动巡游已停用，移动只来自用户操作或 CLI 指令）
        this._presenceSweep = setInterval(() => {
            const now = Date.now();
            for (const [agentId, ts] of this._remotePlayed) {
                if (now - ts <= 20000) continue;
                this._remotePlayed.delete(agentId);
                const ag = this.agents && this.agents.find(a => a.data.rowid === agentId);
                if (ag && !ag.isPlayer) {
                    console.log(`[presence] ${ag.data.mingcheng} 的扮演者离线，原地待命`);
                }
            }
        }, 5000);
        // 移动指令通道：轮询 moves.json（外部 loop 写入的指令，3 秒一次）
        this.lastMoveTs = 0;
        this._moveTimer = setInterval(() => this.pollMoves(), 3000);
        // 用户昵称（异步补齐，用于会话命名）
        FsjChat.userName(this.userRowid, this.userName).then(n => { this.userName = n; });
        this.updateMsgBadge();
        this.initPlayerCard();
        this.sizeFnIcons();
        this.bindUI();
        this.bindJoystick();
        this.resizeCanvas();
        window.addEventListener('resize', this._onResize);
        window.addEventListener('keydown', this._onKeyEsc);
        // 入场：先读 HAP 上次保存的位置（didian + tx,ty），用它作为默认起点
        // ?scene=<rowid> 可临时指定进入某地点（覆盖默认，但不持久化——走完才保存）
        // ?use=<rowid> 显式指定身份时优先于本地缓存的当前账号（2026-09-02 对齐）
        const urlUse = this.params.get('use');
        if (urlUse) Members.setCurrent(urlUse);
        const acc = Members.current();
        let savedPos = null;
        try {
            savedPos = await FsjChat.playerState(this.userRowid);
        } catch (e) {
            console.warn('[init] 读取保存位置失败，用默认入口:', e.message);
        }
        const start = this.params.get('scene')
            || (savedPos && savedPos.didian)
            || acc.didian
            || '75fdbe30-0dcb-47c8-90d2-7efd6a76df8d';
        await this.enterScene(start).catch(async () => {
            try { await this.enterScene('75fdbe30-0dcb-47c8-90d2-7efd6a76df8d'); }
            catch (e2) { console.error('入场失败', e2); }
        });
        // 恢复上次保存的 tx,ty（仅在合法 + 可走 + 匹配当前场景时）
        if (savedPos && this.player && savedPos.x !== null && savedPos.y !== null) {
            const p = this.player;
            const col = p.scene && p.scene.layers && p.scene.layers.collision;
            const N = p.scene.size;
            const inb = savedPos.x >= 0 && savedPos.y >= 0 && savedPos.x < N && savedPos.y < N;
            if (inb && col && !col[savedPos.y][savedPos.x]) {
                p.tx = savedPos.x;
                p.ty = savedPos.y;
                p.wx = p.tx * TILE;
                p.wy = p.ty * TILE;
                this.updatePosHud();        // 同步 HUD
                // 镜头聚焦新位置
                if (this.sceneRenderer) {
                    this.sceneRenderer.camTarget = { agent: p };
                }
            } else {
                console.warn('[init] 保存的坐标 (' + savedPos.x + ',' + savedPos.y + ') 不可用，保持出生点');
            }
        }
        this.loop(performance.now());
        this.debug = this; // 调试钩子（控制台：PxWorld.agents 等）
        window.PxWorld = this;
    }

    // ==================== 主循环 ====================

    /** 左上角玩家信息卡：头像 + 等级 + 经验条（当前账号，来自 HAP 用户表） */
    initPlayerCard() {
        this.account = Members.current();
        // 等级曲线加载后渲染；经验值从 HAP 异步拉（ptyh+shangjia2+关键词 → szhz）
        Level.load()
            .then(() => FsjChat.loadExp(this.userRowid, this.orgRowid))
            .then(exp => {
                this.playerExp = exp;    // null = 无经验值账户
                this.renderPlayerCard();
            })
            .catch(e => {
                console.warn('[initPlayerCard] 经验值加载失败:', e.message);
                this.renderPlayerCard();
            });
    }

    /** 功能图标：按原始像素 1:1 对应系统级单位（屏幕宽/120 = 原始宽/16 rem），不同尺寸图标密度一致 */
    sizeFnIcons() {
        this.container.querySelectorAll('.fn-icon > img:first-child').forEach(img => {
            const fit = () => {
                if (!img.naturalWidth) return;
                img.style.width = (img.naturalWidth / 16) + 'rem';
                img.style.height = (img.naturalHeight / 16) + 'rem';
            };
            if (img.complete) fit();
            else img.addEventListener('load', fit, { once: true });
        });
    }

    renderPlayerCard() {
        const m = this.account;
        if (!m) return;
        // 等级换算：优先 HAP 经验值账户（URL 的 use+org → ptyh+shangjia2 → szhz），无则回退 0
        const exp = this.playerExp ? this.playerExp.szhz : 0;
        const info = Level.curve ? Level.fromExp(exp) : null;
        this.container.querySelector('#pcLv').textContent =
            info ? `LV ${info.level}` : `LV ${m.char?.dengji ?? '-'}`;
        this.container.querySelector('#pcExpText').textContent = info
            ? `经验值：${info.got}/${info.nextBase - info.curBase}`
            : `经验值：${exp}`;
        const fill = this.container.querySelector('#pcExpBarFill');
        if (fill) fill.style.width = ((info ? info.progress : 0) * 100).toFixed(1) + '%';
    }

    /** 拉取外部 loop 写入的移动指令（moves.json，3 秒一次） */
    pollMoves() {
        fetch('./assets/moves.json?v=' + Date.now(), { cache: 'no-store' })
            .then(r => r.ok ? r.json() : null)
            .then(j => {
                if (!j || !j.ts) return;
                if (j.ts <= this.lastMoveTs) {
                    console.log('[pollMoves] skip (ts ' + j.ts + ' <= last ' + this.lastMoveTs + ')');
                    return;
                }
                console.log('[pollMoves] NEW ts=' + j.ts + ' moves=' + (j.moves || []).length);
                this.lastMoveTs = j.ts;
                for (const mv of (j.moves || [])) this.applyMove(mv, 'pollMoves');
            })
            .catch(() => {});
    }

    /** 应用一条移动指令：rowid 角色 → BFS 寻路走到 (tx,ty)。玩家（林东城）也可被 loop 控制 */
    applyMove(m, source = 'unknown') {
        if (!m || this.mode !== 'scene') return;
        if (m.scene && this.currentSceneId && m.scene !== this.currentSceneId) return; // 跨场景指令忽略（防错场景串位）
        const agent = this.agents.find(a => a.data.rowid === m.rowid);
        if (!agent) { console.log('[applyMove] no agent for rowid=' + m.rowid, 'src=' + source); return; }
        if (agent.state !== 'idle' && agent.state !== 'wander' && agent.state !== 'walk') {
            console.log('[applyMove] skip (state=' + agent.state + ') rowid=' + m.rowid + ' src=' + source);
            return;
        }
        const col = agent.scene && agent.scene.layers && agent.scene.layers.collision;
        if (!col || !col[m.ty] || col[m.ty][m.tx]) {
            console.log('[applyMove] blocked by wall rowid=' + m.rowid + ' (' + m.tx + ',' + m.ty + ') src=' + source);
            return;
        }
        console.log('[applyMove] ✅ walkTo rowid=' + m.rowid + ' (' + m.tx + ',' + m.ty + ') src=' + source);
        // 仅 ws-bus 指令（外部指挥）到达后存 HAP；pollMoves 摆位/日程巡游不保存，避免静态数据污染云端
        if (source === 'ws-bus' && agent.walkTo(m.tx, m.ty)) {
            agent.onMoveDone = (ag) => {
                const mem = Members.members.find(mm => mm.agentId === ag.data.rowid);
                if (!mem || !this.currentSceneId) return;
                FsjChat.savePlayerState(mem.rowid, this.currentSceneId, ag.tx, ag.ty)
                    .then(() => console.log(`[applyMove] 💾 ${ag.data.mingcheng} 位置已存 HAP (${ag.tx},${ag.ty})`))
                    .catch(e => console.warn('[applyMove] 存 HAP 失败:', e.message));
            };
        }
    }

    /** ws 收到的一条移动指令 */
    onRemoteMove(body) { if (body) this.applyMove(body); }

    /** 收到在线心跳：该角色正被远程玩家扮演 → 本端冻结其日程；心跳带坐标时校正漂移 */
    onPresence(body) {
        if (!body || !body.agentId || !body.online) return;
        // 同角色多开互踢：另一个会话扮演着"我"且比我新 → 我让位旁观
        if (this.player && body.agentId === this.player.data.rowid && body.instanceId && body.instanceId !== this.instanceId) {
            if (body.bootTs > this.bootTs && !this._eclipsed) {
                this._eclipsed = true;
                this.toast('该角色已在其他窗口登录，本窗口转为旁观');
                console.warn('[presence] 同角色在更新的会话登录，本窗口停止扮演（互踢）');
            }
            return;
        }
        this._remotePlayed.set(body.agentId, Date.now());
        const ag = this.agents && this.agents.find(a => a.data.rowid === body.agentId);
        if (!ag || ag.isPlayer) return;
        if (!ag.freezeSchedule) {
            console.log(`[presence] ${ag.data.mingcheng} 正在被远程扮演，冻结本地日程（位置听扮演者的）`);
            ag.freezeSchedule = true;
            ag.path = null;
            ag.state = 'idle';
            ag.stateUntil = Infinity;
        }
        // 心跳携带坐标：同场景时校正漂移（巡游走偏 / 断线重连后的位置拉回）
        if (body.tx != null && body.ty != null && body.scene === this.currentSceneId) {
            const col = ag.scene && ag.scene.layers && ag.scene.layers.collision;
            const N = ag.scene ? ag.scene.size : 48;
            if (body.tx >= 0 && body.ty >= 0 && body.tx < N && body.ty < N && !(col && col[body.ty] && col[body.ty][body.tx])) {
                if (ag.tx !== body.tx || ag.ty !== body.ty) {
                    ag.tx = body.tx; ag.ty = body.ty;
                    ag.wx = ag.tx * TILE; ag.wy = ag.ty * TILE;
                    ag.path = null;
                }
            }
        }
    }

    /** 头像显示：优先 HAP avatar 图片，缺省回退像素 canvas */
    setAvatar(canvasEl, imgEl, px, avatarUrl) {
        if (avatarUrl) {
            imgEl.src = avatarUrl;
            imgEl.style.display = '';
            canvasEl.style.display = 'none';
            return;
        }
        imgEl.style.display = 'none';
        canvasEl.style.display = '';
        if (px) {
            canvasEl.width = px[0].length; canvasEl.height = px.length;
            const c = canvasEl.getContext('2d');
            c.imageSmoothingEnabled = false;
            c.clearRect(0, 0, canvasEl.width, canvasEl.height);
            drawPixels(c, px, 0, 0);
        }
    }

    // ==================== 账号（HAP 用户表成员） ====================

    /** 当前账号信息面板（点击左上角头像卡打开） */
    openAccountPanel() {
        const m = this.account;
        if (!m) return;
        this.panelMode = 'account';
        const mask = this.container.querySelector('#panelMask');
        mask.style.display = 'flex';
        this.container.querySelector('#btnSummon').style.display = 'none';
        this.container.querySelector('#btnHistory').style.display = 'none';
        this.container.querySelector('#btnSwitch').style.display = '';
        this.container.querySelector('#apName').textContent = m.mingcheng;
        this.container.querySelector('#apSub').textContent = `${m.leixing} · ${m.rowid.slice(0, 8)}`;
        this.setAvatar(
            this.container.querySelector('#apAvatar'),
            this.container.querySelector('#apAvatarImg'),
            m.char ? m.char.pixels_xiao[0] : null,
            m.avatar
        );
        const d = m.char || {};
        this.container.querySelector('#apWuxing').textContent = m.wuxing || d.wuxing || '-';
        this.container.querySelector('#apDizhi').textContent = d.dizhi || '-';
        this.container.querySelector('#apBiaoti').textContent = m.zhiwei || '-';
        this.container.querySelector('#apLocK').textContent = '性别';
        this.container.querySelector('#apLoc').textContent = m.gender || '-';
        this.container.querySelector('#apRenge').textContent =
            (m.mtbi ? `【${m.mtbi}】` : '') + (m.jianjie || d.renge || '-');
        const exp = (d.jingyan || 0) % 100 / 25;
        const segs = this.container.querySelector('#apExpBar').children;
        for (let i = 0; i < 4; i++) segs[i].style.opacity = exp > i ? '1' : '0.25';
        this.container.querySelector('#apExp').textContent = `LV ${d.dengji ?? '-'} · 经验 ${d.jingyan ?? 0}（示意）`;
    }

    /** 面板头像绘制（NPC 模式：无 HAP 头像，一律像素 canvas） */
    drawPanelAvatar(px) {
        this.setAvatar(
            this.container.querySelector('#apAvatar'),
            this.container.querySelector('#apAvatarImg'),
            px,
            null
        );
    }

    /** 切换账号弹层：列出 HAP 用户表全部成员 */
    openSwitch() {
        const list = this.container.querySelector('#swList');
        list.innerHTML = '';
        for (const m of Members.members) {
            const item = document.createElement('button');
            item.className = 'sw-item' + (m === this.account ? ' current' : '');
            const cv = document.createElement('canvas');
            cv.className = 'sw-avatar';
            const im = document.createElement('img');
            im.className = 'sw-avatar';
            im.alt = '';
            this.setAvatar(cv, im, m.char ? m.char.pixels_xiao[0] : null, m.avatar);
            const meta = document.createElement('div');
            meta.className = 'sw-meta';
            const nm = document.createElement('div');
            nm.className = 'sw-name';
            nm.textContent = m.mingcheng;
            const sub = document.createElement('div');
            sub.className = 'sw-sub';
            sub.textContent = `${m.zhiwei || ''} · 五行${m.wuxing || '-'}`;
            meta.appendChild(nm); meta.appendChild(sub);
            item.appendChild(cv); item.appendChild(im); item.appendChild(meta);
            if (m === this.account) {
                const tag = document.createElement('span');
                tag.className = 'sw-tag';
                tag.textContent = '当前';
                item.appendChild(tag);
            }
            item.addEventListener('click', () => this.switchAccount(m));
            list.appendChild(item);
        }
        this.container.querySelector('#switchMask').style.display = 'flex';
    }

    switchAccount(m) {
        Members.setCurrent(m.rowid);
        this.account = m;
        // URL 同步：地址栏 use 参数跟随当前身份（刷新/分享链接/恢复都与实际身份一致）
        try {
            const u = new URL(location.href);
            u.searchParams.set('use', m.rowid);
            history.replaceState(null, '', u);
        } catch (e) { /* URL 更新失败不影响切换 */ }
        // 玩家实体切换：旧玩家降级为 NPC（稍后恢复日程），新角色继承所在格与镜头
        if (this.player) {
            this.player.isPlayer = false;
            this.player.state = 'idle';
            this.player.stateUntil = performance.now() + 1200; // 让位后稍候恢复日程巡游
        }
        const target = this.agents && this.agents.find(a => a.data.rowid === m.agentId);
        if (target) {
            if (target !== this.player) {
                // 位置继承：新玩家出现在旧玩家所在格，镜头无缝切换
                target.tx = this.player.tx; target.ty = this.player.ty;
                target.wx = target.tx * TILE; target.wy = target.ty * TILE;
            }
            target.isPlayer = true;
            target.state = 'idle';
            target.stateUntil = Infinity;   // 玩家不受日程驱动（摇杆操控）
            target.path = null;
            target.summonTarget = null;
            this.player = target;
            if (this.sceneRenderer) this.sceneRenderer.camTarget = { agent: this.player };
        }
        // 身份同步：WS 广播 / 位置存档 / 聊天全部跟随新账号
        this.userRowid = m.rowid;
        if (this.bus) this.bus.rowid = m.rowid;
        // 从 HAP 读取该账号上次保存的位置（didian + xszb）：日志打印，场景匹配且坐标合法则传送
        FsjChat.playerState(m.rowid).then(saved => {
            const where = `场景=${saved.didian || '空'} 坐标=(${saved.x},${saved.y})`;
            if (saved.x === null || saved.y === null) {
                console.log(`[switchAccount] ${m.mingcheng} 的 HAP 位置未保存（${where}），保持当前位置`);
                return;
            }
            console.log(`[switchAccount] ${m.mingcheng} 的 HAP 位置：${where}`);
            if (saved.didian && saved.didian !== this.currentSceneId) {
                console.log(`[switchAccount] ${m.mingcheng} 在别的场景（${saved.didian.slice(0, 8)}…），当前场景不传送`);
                return;
            }
            if (!this.player || this.player !== target) return;
            const col = target.scene && target.scene.layers && target.scene.layers.collision;
            const N = target.scene ? target.scene.size : 48;
            if (saved.x < 0 || saved.y < 0 || saved.x >= N || saved.y >= N || (col && col[saved.y] && col[saved.y][saved.x])) {
                console.warn(`[switchAccount] HAP 坐标 (${saved.x},${saved.y}) 不可用（出界/碰撞），保持当前位置`);
                return;
            }
            target.tx = saved.x; target.ty = saved.y;
            target.wx = target.tx * TILE; target.wy = target.ty * TILE;
            target.path = null;
            if (this.sceneRenderer) this.sceneRenderer.camTarget = { agent: target };
            this.updatePosHud();
            console.log(`[switchAccount] ✅ ${m.mingcheng} 已传送到 HAP 坐标 (${saved.x},${saved.y})`);
        }).catch(e => console.warn('[switchAccount] 读 HAP 位置失败:', e.message));
        this.renderPlayerCard();
        this.closeSwitch();
        this.openAccountPanel();
        this.toast(`已切换为 ${m.mingcheng}`);
    }

    closeSwitch() {
        this.container.querySelector('#switchMask').style.display = 'none';
    }

    // ==================== 任务（最小可执行计划，来自 shangpin） ====================

    /** 置信度 → 四象限色（同 objectives-management-system 分区） */
    quadColor(z) {
        const n = Number(z) || 0;
        if (n >= 8000) return '#E83B3B';   // 紧急且重要
        if (n >= 6000) return '#00A2E8';   // 重要不紧急
        if (n >= 4000) return '#FFC229';   // 紧急不重要
        if (n >= 2000) return '#888888';   // 不紧急不重要
        return '#d2d2d2';                  // 待思考
    }

    /** 当前账号的最小可执行计划列表（zi 为空的真叶子，不展示层级） */
    openTasks() {
        const list = this.container.querySelector('#taskList');
        list.innerHTML = '';
        const tasks = this.taskDb ? (this.taskDb[this.account.rowid] || []) : [];
        this.container.querySelector('#taskCount').textContent = tasks.length ? `${tasks.length} 条` : '';
        if (!tasks.length) {
            const empty = document.createElement('div');
            empty.className = 'tk-empty';
            empty.textContent = `${this.account.mingcheng} 暂无最小可执行计划（shangpin：7目标/8计划 且 zi 为空）`;
            list.appendChild(empty);
        }
        for (const t of tasks) {
            const item = document.createElement('div');
            item.className = 'tk-item';
            const row1 = document.createElement('div');
            row1.className = 'tk-row1';
            row1.innerHTML = `<span class="tk-type"></span><span class="tk-name"></span><span class="tk-dot"></span>`;
            const type = row1.querySelector('.tk-type');
            type.textContent = t.sew === '8计划' ? '计划' : '目标';
            if (t.sew === '8计划') type.classList.add('plan');
            row1.querySelector('.tk-name').textContent = t.mingcheng;
            row1.querySelector('.tk-dot').style.background = this.quadColor(t.zhixindu);
            row1.querySelector('.tk-dot').title = `置信度 ${t.zhixindu || '未设'}`;
            item.appendChild(row1);
            if (t.wznr) {
                const desc = document.createElement('div');
                desc.className = 'tk-desc';
                desc.textContent = t.wznr;
                item.appendChild(desc);
            }
            item.addEventListener('click', () => this.toast(t.wznr ? `【${t.mingcheng}】${t.wznr}` : `【${t.mingcheng}】`));
            list.appendChild(item);
        }
        this.container.querySelector('#taskMask').style.display = 'flex';
    }

    closeTasks() {
        this.container.querySelector('#taskMask').style.display = 'none';
    }

    // ==================== 组织（当前角色已加入的组织，ORG_WS 表） ====================

    /** 拉取并展示该角色已加入的组织列表 */
    async openZuzhi() {
        const list = this.container.querySelector('#zuzhiList');
        list.innerHTML = '';
        // 加载态占位
        const loading = document.createElement('div');
        loading.className = 'tk-empty';
        loading.textContent = `正在读取 ${this.account.mingcheng} 的组织…`;
        list.appendChild(loading);
        this.container.querySelector('#zuzhiCount').textContent = '';
        this.container.querySelector('#zuzhiMask').style.display = 'flex';

        let orgs = [];
        try {
            orgs = await FsjChat.myOrganizations(this.account.rowid);
        } catch (e) {
            list.innerHTML = '';
            const err = document.createElement('div');
            err.className = 'tk-empty';
            err.textContent = '加载失败：' + e.message;
            list.appendChild(err);
            return;
        }

        list.innerHTML = '';
        this.container.querySelector('#zuzhiCount').textContent = orgs.length ? `${orgs.length} 个` : '';
        if (!orgs.length) {
            const empty = document.createElement('div');
            empty.className = 'tk-empty';
            empty.textContent = `${this.account.mingcheng} 暂未加入任何组织（leixing=组织 且 zzyh 含 ${this.account.rowid.slice(0,8)}…）`;
            list.appendChild(empty);
            return;
        }
        for (const o of orgs) {
            const item = document.createElement('div');
            item.className = 'tk-item';
            const row1 = document.createElement('div');
            row1.className = 'tk-row1';
            row1.innerHTML = `<span class="tk-type zz">组织</span><span class="tk-name"></span>`;
            row1.querySelector('.tk-name').textContent = o.mingcheng;
            item.appendChild(row1);
            const desc = document.createElement('div');
            desc.className = 'tk-desc';
            desc.textContent = `rowid: ${o.rowid}`;
            item.appendChild(desc);
            item.addEventListener('click', () => {
                this.closeZuzhi();
                window.PxNav('org', { orgId: o.rowid });
            });
            list.appendChild(item);
        }
    }

    closeZuzhi() {
        this.container.querySelector('#zuzhiMask').style.display = 'none';
    }

    loop = (t) => {
        const dt = Math.min(50, t - this.lastT);
        this.lastT = t;
        if (this.mode === 'scene') {
            this.drivePlayer();
            for (const a of this.agents) a.tick(dt, t);
            this.sceneRenderer.render(this.agents, t);
            this.drawTalkingBubbles();
            this._maybePromptEntry();
            this.updatePosHud();
            this._maybeSavePlayerPos();
        }
        this.raf = requestAnimationFrame(this.loop);
    };

    /** 位置坐标 HUD：玩家格坐标变化时才更新 DOM（地点名在 enterScene 时设置） */
    updatePosHud() {
        const p = this.player;
        if (!p) return;
        const pos = p.tx + ',' + p.ty;
        if (pos === this._posHudPos) return;
        this._posHudPos = pos;
        this.container.querySelector('#posXY').textContent = `(${p.tx},${p.ty})`;
    }

    /** 玩家位置防抖保存：停止移动 2 秒后写入 HAP（避免行走中每帧写云端） */
    _maybeSavePlayerPos() {
        const p = this.player;
        if (!p || !this.currentSceneId || !this.userRowid) return;
        const pos = p.tx + ',' + p.ty;
        if (pos === this._savePosCache) return;
        this._savePosCache = pos;
        clearTimeout(this._savePosTimer);
        this._savePosTimer = setTimeout(() => {
            if (!this.player || !this.userRowid || !this.currentSceneId) return;
            FsjChat.savePlayerState(this.userRowid, this.currentSceneId, this.player.tx, this.player.ty)
                .then(() => console.log(`[save] 💾 玩家位置已存 HAP (${this.player.tx},${this.player.ty})`))
                .catch(e => console.warn('[save] 玩家位置存 HAP 失败:', e.message));
        }, 2000);
    }

    /** 进场恢复全员位置（async）：HAP 有存的（didian 匹配当前场景）覆盖出生摆位；就位后驻留 60s 再恢复日程 */
    async _restoreTeamPositions() {
        if (!Members.members || !Members.members.length) return;
        await Promise.all(Members.members.map(async (m) => {
            try {
                const saved = await FsjChat.playerState(m.rowid);
                if (saved.x === null || saved.y === null) return;
                if (!saved.didian || saved.didian !== this.currentSceneId) return;
                const ag = this.agents && this.agents.find(a => a.data.rowid === m.agentId);
                if (!ag || ag.isPlayer) return;
                const col = ag.scene && ag.scene.layers && ag.scene.layers.collision;
                const N = ag.scene ? ag.scene.size : 48;
                if (saved.x < 0 || saved.y < 0 || saved.x >= N || saved.y >= N || (col && col[saved.y] && col[saved.y][saved.x])) return;
                ag.tx = saved.x; ag.ty = saved.y;
                ag.wx = ag.tx * TILE; ag.wy = ag.ty * TILE;
                ag.path = null;
                ag.state = 'idle';
                ag.stateUntil = performance.now() + 60000; // 就位驻留 60s（世界可预期），之后恢复日程巡游
                console.log(`[enter] ${(m.mingcheng || ag.data.mingcheng)} 就位 (${saved.x},${saved.y})（HAP 恢复，驻留 60s）`);
            } catch (e) { /* 单人失败不影响其他 */ }
        }));
    }

    // ==================== 第一人称：摇杆驱动东城 ====================

    /** 摇杆向量 → 东城移动（格间步进：每次走 1 格，按住持续走） */
    drivePlayer() {
        if (this._eclipsed) return; // 已被其他会话顶掉：禁止操作，原地旁观
        const p = this.player;
        if (!p) return;
        const j = this.joy;
        if (p.state === 'idle' && (Math.abs(j.x) > 0.35 || Math.abs(j.y) > 0.35)) {
            // 主轴方向决定步进格子
            let dx = 0, dy = 0;
            if (Math.abs(j.x) >= Math.abs(j.y)) dx = j.x > 0 ? 1 : -1;
            else dy = j.y > 0 ? 1 : -1;
            const nx = p.tx + dx, ny = p.ty + dy;
            const inb = nx >= 0 && ny >= 0 && nx < p.scene.size && ny < p.scene.size;
            const blocked = !inb || p.scene.layers.collision[ny][nx];
            // 朝向始终更新（撞墙也转身）
            p.facing = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
            if (!blocked) {
                p.stateUntil = 0;
                p.walkTo(nx, ny);
                // 多端同步：每走一格广播移动（其他页面让该角色走同一格；自己页面被 rowid 回声过滤）
                if (this.bus) this.bus.send('world.move', { rowid: p.data.rowid, tx: nx, ty: ny, scene: this.currentSceneId });
                // 行走中镜头持续跟随（第一人称）
                this.sceneRenderer.camTarget = { agent: p };
            } else {
                this.sceneRenderer.camTarget = { agent: p };
            }
        }
    }

    bindJoystick() {
        const joy = this.container.querySelector('#joy');
        const knob = this.container.querySelector('#joyKnob');
        this.joy = { x: 0, y: 0 };
        let joyId = null;
        const R = 60; // 摇杆半径（屏幕px）

        const setVec = (e) => {
            const rect = joy.getBoundingClientRect();
            const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
            let dx = e.clientX - cx, dy = e.clientY - cy;
            const len = Math.hypot(dx, dy);
            if (len > R) { dx = dx / len * R; dy = dy / len * R; }
            knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
            this.joy.x = dx / R;
            this.joy.y = dy / R;
        };
        const reset = () => {
            joyId = null;
            knob.style.transform = 'translate(-50%, -50%)';
            this.joy.x = 0; this.joy.y = 0;
        };
        joy.addEventListener('pointerdown', (e) => {
            joyId = e.pointerId;
            try { joy.setPointerCapture(e.pointerId); } catch (err) { }
            setVec(e);
        });
        joy.addEventListener('pointermove', (e) => {
            if (e.pointerId === joyId) setVec(e);
        });
        joy.addEventListener('pointerup', reset);
        joy.addEventListener('pointercancel', reset);
    }

    /** 正在对话的角色头顶冒"…"气泡（场景即表达） */
    drawTalkingBubbles() {
        const r = this.sceneRenderer;
        for (const a of this.agents) {
            if (!a.talking) continue;
            const lx = Math.round(a.wx + TILE / 2 - r.camera.x);
            const ly = Math.round(a.wy + a.drawOffY - r.camera.y - 8);
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(lx - 7, ly - 6, 14, 9);
            this.ctx.strokeStyle = '#181818';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(lx - 7.5, ly - 6.5, 15, 10);
            this.ctx.fillStyle = '#181818';
            this.ctx.fillRect(lx - 4, ly - 3, 2, 2);
            this.ctx.fillRect(lx - 1, ly - 3, 2, 2);
            this.ctx.fillRect(lx + 2, ly - 3, 2, 2);
        }
    }

    resizeCanvas() {
        // 视口逻辑宽固定 120（整体 2x 放大，约 2.5 格宽），CSS 满屏缩放
        this.scale = window.innerWidth / 120;
        const logicW = 120;
        const logicH = Math.ceil(window.innerHeight / this.scale);
        this.canvas.width = logicW;
        this.canvas.height = logicH;
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = (logicH * this.scale) + 'px';
        if (this.mode === 'scene' && this.sceneRenderer) {
            // 场景模式：重建渲染器并保留摄像机
            const cam = this.sceneRenderer.camera;
            this.sceneRenderer.resize();
            this.sceneRenderer.camera.x = cam.x; this.sceneRenderer.camera.y = cam.y;
            this.sceneRenderer.clampCamera();
        }
    }

    onResize() { this.resizeCanvas(); }

    // ==================== 场景视图 ====================

    async enterScene(sceneId) {
        let conf = this.world.scenes.find(s => s.id === sceneId);
        if (!conf) {
            // 地点表直接取景（如天孚宫）：无 world.json 场景表项也能进
            const p = World.places && World.places.get(sceneId);
            if (p && p.xsdt) conf = { id: sceneId, name: p.mingcheng, ready: true, zhushen: p.leixing || '' };
        }
        if (!conf) return;
        if (!conf.ready) {
            // 建设中的局：直接提供传音对话
            const agent = this.allAgentData.find(a => a.rowid === conf.agentId);
            if (agent) this.toast(`${conf.name}建设中，已为你传音给${conf.zhushen}`);
            window.PxNav('chat', { agentId: conf.agentId });
            return;
        }
        this.toast('加载场景…');
        const scene = await World.getScene(sceneId);
        this.currentSceneId = sceneId;
        this.sceneConf = conf;

        // 实例化角色：东城为第一人称玩家（摇杆操控），其余按日程（M1 全员在 tu 巡游）
        const spawnList = Object.values(scene.spawns).flat();
        this.agents = this.allAgentData.map((data, i) =>
            new Agent(data, scene, spawnList[i % spawnList.length]));
        // 互不重叠出生
        const taken = new Set();
        for (const a of this.agents) {
            let k = a.ty * scene.size + a.tx;
            while (taken.has(k)) {
                a.tx = (a.tx + 1) % scene.size;
                k = a.ty * scene.size + a.tx;
            }
            taken.add(k);
            a.wx = a.tx * TILE; a.wy = a.ty * TILE;
        }
        // 第一人称玩家：按当前账号的角色（account.agentId）确定，缺省回退东城；镜头常驻跟随
        const playerAgentId = (this.account && this.account.agentId) || 'demo-dongcheng';
        const player = this.agents.find(a => a.data.rowid === playerAgentId)
            || this.agents.find(a => a.data.rowid === 'demo-dongcheng');
        if (player) {
            player.isPlayer = true;
            player.state = 'idle';
            player.stateUntil = Infinity;
            const p0 = ((scene.spawns && (scene.spawns.nanmen || Object.values(scene.spawns)[0])) || [{ x: 23, y: 18 }])[0];
            player.tx = p0.x; player.ty = p0.y;
            player.wx = player.tx * TILE; player.wy = player.ty * TILE;
            this.player = player;
        }

        this.sceneRenderer = new SceneRenderer(this.canvas, scene);
        this.sceneRenderer.resize();
        // 摄像机初始：玩家位置居中（第一人称）
        const camFocus = this.player || { wx: 23 * TILE, wy: 10 * TILE };
        this.sceneRenderer.camera.x = Math.floor(camFocus.wx + TILE / 2 - this.sceneRenderer.viewW / 2);
        this.sceneRenderer.camera.y = Math.floor(camFocus.wy + TILE / 2 - this.sceneRenderer.viewH / 2);
        this.sceneRenderer.clampCamera();
        if (this.player) this.sceneRenderer.camTarget = { agent: this.player };

        // 全员位置恢复：等 HAP 响应后一次性就位再进场（此期间 mode 未到 scene，角色不会动，避免闪现；3 秒超时兜底）
        try {
            this.toast('同步世界状态…');
            await Promise.race([this._restoreTeamPositions(), new Promise(r => setTimeout(r, 3000))]);
        } catch (e) { /* 恢复失败用出生摆位进场 */ }
        this.mode = 'scene';
        this.container.querySelector('#joy').style.display = 'block';
        document.title = conf.name + ' · 像素视界';
        // 位置 HUD：地点名 + 坐标缓存重置（换场景后同坐标也要刷新）
        this.container.querySelector('#posName').textContent = conf.name;
        this._posHudPos = '';
        this.updatePosHud();
        // 切场景后重置入口询问状态：新场景没有"已问过"的历史
        this._pendingEntry = null;
        this._askedEntries = new Set();
        this._lastPlayerState = null;
        this._lastPlayerPos = '';
        const entryM = this.container.querySelector('#entryMask');
        if (entryM) entryM.style.display = 'none';
    }

    // ==================== 交互：拖动 / 点击 ====================

    bindUI() {
        const cv = this.canvas;
        cv.style.touchAction = 'none';
        cv.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        cv.addEventListener('pointermove', (e) => this.onPointerMove(e));
        cv.addEventListener('pointerup', (e) => this.onPointerUp(e));
        cv.addEventListener('pointercancel', () => { this.drag.active = false; });

        // 地图：打开导航面板（列出所有有像素地图的地点）
        this.container.querySelector('#btnMap').addEventListener('click', () => this.openMapPanel());
        this.container.querySelector('#btnMapClose').addEventListener('click', () => this.closeMapPanel());
        this.container.querySelector('#mapMask').addEventListener('click', (e) => {
            if (e.target === this.container.querySelector('#mapMask')) this.closeMapPanel();
        });
        // 入口确认弹窗
        this.container.querySelector('#btnEntryYes').addEventListener('click', () => this.confirmEntry());
        this.container.querySelector('#btnEntryNo').addEventListener('click', () => this.cancelEntry());
        this.container.querySelector('#entryMask').addEventListener('click', (e) => {
            if (e.target === this.container.querySelector('#entryMask')) this.cancelEntry();
        });
        // 玩家卡：打开当前账号的角色信息
        this.container.querySelector('#playerCard').addEventListener('click', () => this.openAccountPanel());
        // 切换账号
        this.container.querySelector('#btnSwitch').addEventListener('click', () => this.openSwitch());
        this.container.querySelector('#btnSwitchClose').addEventListener('click', () => this.closeSwitch());
        this.container.querySelector('#switchMask').addEventListener('click', (e) => {
            if (e.target === this.container.querySelector('#switchMask')) this.closeSwitch();
        });
        this.container.querySelector('#btnMessages').addEventListener('click', () => window.PxNav('messages'));
        // 功能组：画 → 像素编辑器（选中角色则直接编辑该角色）；其余为 M2 功能占位
        this.container.querySelector('#btnDraw').addEventListener('click', () => {
            if (this.selectedAgent) window.PxNav('editor', { agentId: this.selectedAgent.id });
            else window.PxNav('editor');
        });
        // 卡牌（=能力=技能）→ 技能页
        this.container.querySelector('#btnCards').addEventListener('click', () => window.PxNav('skills'));
        [['#btnShop', '商城'], ['#btnCharge', '充电'], ['#btnIdeas', '想法']]
            .forEach(([sel, name]) => {
                this.container.querySelector(sel).addEventListener('click', () => this.toast(`「${name}」建设中，敬请期待`));
            });
        // 组织：拉取当前角色已加入的组织列表
        this.container.querySelector('#btnZuzhi').addEventListener('click', () => this.openZuzhi());
        this.container.querySelector('#btnZuzhiClose').addEventListener('click', () => this.closeZuzhi());
        this.container.querySelector('#zuzhiMask').addEventListener('click', (e) => {
            if (e.target === this.container.querySelector('#zuzhiMask')) this.closeZuzhi();
        });
        // 任务弹窗
        this.container.querySelector('#btnTasks').addEventListener('click', () => this.openTasks());
        this.container.querySelector('#btnTaskClose').addEventListener('click', () => this.closeTasks());
        this.container.querySelector('#taskMask').addEventListener('click', (e) => {
            if (e.target === this.container.querySelector('#taskMask')) this.closeTasks();
        });
        this.container.querySelector('#btnSend').addEventListener('click', () => this.sendChat());
        this.container.querySelector('#chatInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.sendChat();
        });
        this.container.querySelector('#btnPanelClose').addEventListener('click', () => this.closePanel());
        this.container.querySelector('#panelMask').addEventListener('click', (e) => {
            if (e.target === this.container.querySelector('#panelMask')) this.closePanel();
        });
        this.container.querySelector('#btnSummon').addEventListener('click', () => this.summonSelected());
        this.container.querySelector('#btnHistory').addEventListener('click', () => {
            if (this.selectedAgent) window.PxNav('chat', { agentId: this.selectedAgent.id });
        });
        this.container.querySelector('#btnEditAvatar').addEventListener('click', () => {
            if (this.panelMode === 'account') {
                // 账号模式：编辑当前账号的像素形象
                if (this.account && this.account.char) {
                    window.PxNav('editor', { agentId: this.account.char.rowid });
                }
            } else if (this.selectedAgent) {
                window.PxNav('editor', { agentId: this.selectedAgent.id });
            }
        });
    }

    onPointerDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.drag = { active: true, moved: false, sx: e.clientX - rect.left, sy: e.clientY - rect.top,
            camX: this.sceneRenderer ? this.sceneRenderer.camera.x : 0,
            camY: this.sceneRenderer ? this.sceneRenderer.camera.y : 0 };
    }

    onPointerMove(e) {
        if (!this.drag.active || this.mode !== 'scene') return;
        const rect = this.canvas.getBoundingClientRect();
        const dx = (e.clientX - rect.left) - this.drag.sx;
        const dy = (e.clientY - rect.top) - this.drag.sy;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) this.drag.moved = true;
        if (this.drag.moved && this.sceneRenderer) {
            this.sceneRenderer.camTarget = null; // 手动拖动接管镜头
            this.sceneRenderer.camera.x = this.drag.camX - dx / this.scale;
            this.sceneRenderer.camera.y = this.drag.camY - dy / this.scale;
            this.sceneRenderer.clampCamera();
        }
    }

    onPointerUp(e) {
        const wasDrag = this.drag.moved;
        this.drag.active = false;
        if (wasDrag) {
            // 第一人称：拖动浏览后镜头回到玩家
            if (this.player && this.sceneRenderer) this.sceneRenderer.camTarget = { agent: this.player };
            return;
        }
        if (this.mode !== 'scene') return; // 全景点击由 DOM 节点处理
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
        this.tapScene(sx, sy);
    }

    tapScene(sx, sy) {
        if (!this.sceneRenderer) return;
        // sx/sy 为屏幕像素，screenToWorld 内部完成逻辑换算
        const world = this.sceneRenderer.screenToWorld(sx, sy);

        // 命中角色？
        let hit = null;
        for (const a of this.agents) {
            if (a.hitTest(world.x, world.y)) { hit = a; break; }
        }
        if (hit) {
            this.selectAgent(hit);
        } else {
            // 空地：取消选中
            this.deselect();
        }
    }

    // ==================== 选中 & 对话 ====================

    selectAgent(agent) {
        // 单选
        for (const a of this.agents) a.selected = (a === agent);
        const changed = this.selectedAgent !== agent;
        this.selectedAgent = agent;
        // 镜头平滑聚焦并跟随该角色（视觉中心居中）
        if (this.sceneRenderer && changed) {
            this.sceneRenderer.camTarget = { agent };
        }
        if (changed) {
            this.showChatBar(agent);
            this.loadConversation(agent);
            ChatStore.markRead(agent.id);
            this.updateMsgBadge();
        }
    }

    deselect() {
        for (const a of this.agents) a.selected = false;
        this.selectedAgent = null;
        this.hideChatBar();
        // 第一人称：取消选中后镜头回到玩家
        if (this.player && this.sceneRenderer) this.sceneRenderer.camTarget = { agent: this.player };
    }

    showChatBar(agent) {
        const bar = this.container.querySelector('#chatBar');
        bar.classList.add('show');
        bar.setAttribute('aria-hidden', 'false');
        // 对话时收起摇杆：把输入框和发送完整让出来
        this.container.querySelector('#joy').style.display = 'none';
    }

    hideChatBar() {
        const bar = this.container.querySelector('#chatBar');
        bar.classList.remove('show');
        bar.setAttribute('aria-hidden', 'true');
        // 场景内关闭对话则恢复摇杆（全景模式本就隐藏）
        if (this.mode === 'scene') this.container.querySelector('#joy').style.display = 'block';
    }

    /** 会话视图：HAP 历史（私聊协议 4交流）为权威，失败回退本地 ChatStore */
    async loadConversation(agent) {
        const agentId = agent.id;
        this.conv = { agentId, convKey: null, msgs: [], source: 'loading' };
        this.renderConversation('加载会话…');
        try {
            const peerRowid = this.hapPeerRowid(agent);
            if (!peerRowid) throw new Error('该角色无 HAP 身份映射');
            const convKey = await FsjChat.ensurePrivate(this.userRowid, this.userName, peerRowid, agent.data.mingcheng || '角色');
            if (this.conv.agentId !== agentId) return; // 用户已切换角色
            this.conv.convKey = convKey;
            this.conv.msgs = await FsjChat.history(convKey);
            this.conv.source = 'hap';
        } catch (e) {
            if (this.conv.agentId !== agentId) return;
            // 离线兜底：本地 ChatStore
            this.conv.msgs = ChatStore.getMessages(agentId).map(m => ({
                rowid: m.rowid, fasongzhe: m.fasongzhe, neirong: m.neirong, ctime: m.ctime
            }));
            this.conv.source = 'local';
        }
        if (!this.conv.msgs.length) {
            // 空会话：开场白占位（纯引导，不落库）
            this.conv.msgs = [{
                rowid: 'greet', fasongzhe: agentId, fasongzheName: agent.data.mingcheng,
                neirong: agent.data.kaichangbai || '……', ctime: ''
            }];
        }
        this.renderConversation();
    }

    /** 角色 → HAP 用户表 rowid（members.json 映射；无映射返回空） */
    hapPeerRowid(agent) {
        const m = (Members.members || []).find(x => x.agentId === agent.data.rowid);
        return m ? m.rowid : '';
    }

    /** 渲染会话（placeholder = 系统提示文字） */
    renderConversation(placeholder) {
        const el = this.container.querySelector('#chatBubble');
        if (placeholder) {
            el.innerHTML = '<div class="cb-sys"></div>';
            el.querySelector('.cb-sys').textContent = placeholder;
            el.scrollTop = el.scrollHeight;
            return;
        }
        if (!this.conv.msgs.length) {
            el.innerHTML = '<div class="cb-sys">打个招呼吧</div>';
            return;
        }
        el.innerHTML = this.conv.msgs.map(m => {
            const cls = (m.fasongzhe === this.userRowid ? 'me' : 'agent') +
                (m.pending ? ' pending' : '') + (m.failed ? ' failed' : '');
            return `<div class="cb-msg ${cls}"><div class="cb-text"></div></div>`;
        }).join('');
        const nodes = el.querySelectorAll('.cb-text');
        this.conv.msgs.forEach((m, i) => { nodes[i].textContent = m.neirong; });
        el.scrollTop = el.scrollHeight;
    }

    /** 流式更新最后一条消息的文本（AI 回复打字中） */
    updateLast(text) {
        const el = this.container.querySelector('#chatBubble');
        const nodes = el.querySelectorAll('.cb-text');
        if (nodes.length) nodes[nodes.length - 1].textContent = text;
        el.scrollTop = el.scrollHeight;
    }

    /** 收到别人的消息广播 → 若是当前会话则上屏 */
    onRemoteChat(body) {
        if (!body || !body.rowid || !this.conv.convKey) return;
        if (body.huiche !== this.conv.convKey) return;
        if (this.conv.msgs.some(m => m.rowid === body.rowid)) return; // 去重
        this.conv.msgs.push({
            rowid: body.rowid, fasongzhe: body.fasongzhe, fasongzheName: body.fasongzheName,
            neirong: body.neirong, ctime: body.ctime || ''
        });
        this.renderConversation();
    }

    async sendChat() {
        const input = this.container.querySelector('#chatInput');
        const content = input.value.trim();
        if (!content || !this.selectedAgent || this.sending) return;
        const agent = this.selectedAgent;
        this.sending = true;
        agent.talking = true;
        input.value = '';

        // 1) 乐观上屏（灰色待确认态）
        const mine = {
            rowid: 'pending-' + Date.now(), fasongzhe: this.userRowid, fasongzheName: this.userName,
            neirong: content, ctime: '', pending: true
        };
        this.conv.msgs.push(mine);
        this.renderConversation();

        // 2) 先存后发：写 HAP 4交流 → 成功后广播（存失败标红，不广播）
        try {
            const peerRowid = this.hapPeerRowid(agent);
            if (!peerRowid || this.conv.convKey === null) throw new Error('会话未就绪');
            const convKey = this.conv.convKey || await FsjChat.ensurePrivate(this.userRowid, this.userName, peerRowid, agent.data.mingcheng || '角色');
            this.conv.convKey = convKey;
            const saved = await FsjChat.send(convKey, content, this.userRowid, this.orgRowid);
            mine.rowid = saved.rowid;
            mine.pending = false;
            this.bus.send('world.chat', {
                huiche: convKey, rowid: saved.rowid, fasongzhe: this.userRowid,
                fasongzheName: this.userName, neirong: content, ctime: saved.ctime
            });
        } catch (e) {
            mine.pending = false;
            mine.failed = true;
            this.toast('上云失败，仅本地可见：' + e.message);
        }
        this.renderConversation();

        // 3) AI 流式回复（现有通道，同时写本地 ChatStore 供聊天页使用）
        const ai = {
            rowid: 'ai-' + Date.now(), fasongzhe: agent.id, fasongzheName: agent.data.mingcheng,
            neirong: '…', ctime: ''
        };
        this.conv.msgs.push(ai);
        this.renderConversation();
        try {
            await ChatStore.sendToAgent(agent.data, content, agent.locationContext(), (chunk) => {
                if (chunk.type === 'delta' || chunk.type === 'result') {
                    ai.neirong = chunk.content || '';
                    this.updateLast(ai.neirong);
                }
            });
        } catch (err) {
            ai.neirong = '（传音失败：' + err.message + '）';
            this.updateLast(ai.neirong);
        }

        // 4) AI 回复同样先存后发（fasongzhe = 角色的 HAP rowid）
        try {
            const peerRowid = this.hapPeerRowid(agent);
            const convKey = this.conv.convKey;
            if (peerRowid && convKey && ai.neirong && ai.rowid.startsWith('ai-')) {
                const saved = await FsjChat.send(convKey, ai.neirong, peerRowid, this.orgRowid);
                ai.rowid = saved.rowid;
                this.bus.send('world.chat', {
                    huiche: convKey, rowid: saved.rowid, fasongzhe: peerRowid,
                    fasongzheName: agent.data.mingcheng, neirong: ai.neirong, ctime: saved.ctime
                });
            }
        } catch (e) { /* 忽略 */ }
        this.renderConversation();

        this.sending = false;
        agent.talking = false;
        this.updateMsgBadge();
    }

    // ==================== 角色面板 ====================

    openPanel(agent = this.selectedAgent) {
        if (!agent) return;
        this.panelMode = 'agent';
        const d = agent.data;
        const mask = this.container.querySelector('#panelMask');
        mask.style.display = 'flex';
        // 玩家自己（东城）没有传呼；NPC 面板没有切换账号
        this.container.querySelector('#btnSummon').style.display = agent.isPlayer ? 'none' : '';
        this.container.querySelector('#btnSummon').style.flex = agent.isPlayer ? 'none' : '';
        this.container.querySelector('#btnHistory').style.display = '';
        this.container.querySelector('#btnSwitch').style.display = 'none';
        this.container.querySelector('#apLocK').textContent = '位置';
        this.container.querySelector('#apName').textContent = d.mingcheng;
        this.container.querySelector('#apSub').textContent = `${d.biaoti} · ${this.world.scenes.find(s => s.id === d.ju)?.name || d.ju}`;
        // 头像（1 数据像素 = 1 canvas 像素绘制，CSS 放大 pixelated）
        this.drawPanelAvatar(d.pixels_xiao[0]);
        this.container.querySelector('#apWuxing').textContent = d.wuxing;
        this.container.querySelector('#apWuxing').style.color = agent.getOutlineColor();
        this.container.querySelector('#apDizhi').textContent = d.dizhi;
        this.container.querySelector('#apBiaoti').textContent = d.biaoti;
        const wz = agent.locationContext();
        this.container.querySelector('#apLoc').textContent = `${this.sceneConf?.name || wz.changjing} (${wz.tx},${wz.ty})`;
        this.container.querySelector('#apRenge').textContent = d.renge;
        // 经验条（4 段）：按等级曲线真实进度填充（Level.fromExp）
        const info = Level.curve ? Level.fromExp(d.jingyan || 0) : null;
        const prog = info ? info.progress : 0;
        const segs = this.container.querySelector('#apExpBar').children;
        for (let i = 0; i < 4; i++) segs[i].style.opacity = (prog * 4) > i ? '1' : '0.25';
        this.container.querySelector('#apExp').textContent = info
            ? `LV ${info.level} · ${info.got}/${info.nextBase - info.curBase}${info.isMax ? '（满级）' : ''}`
            : `LV ${d.dengji} · 经验 ${d.jingyan}（示意）`;
    }

    closePanel(keepSelect = false) {
        this.container.querySelector('#panelMask').style.display = 'none';
        if (keepSelect && this.selectedAgent) {
            // 对话按钮：聚焦输入框
            this.container.querySelector('#chatInput').focus();
        }
    }

    closeAllPopups() {
        this.closePanel();
        this.closeSwitch();
        this.closeTasks();
        this.closeMapPanel();
        this.closeZuzhi();
        this.cancelEntry();
    }

    // ==================== 地图导航（区 / 单元 / 层 三级） ====================

    /** 类型 → 显示标签 */
    _mapTypeLabel(t) { return ({ zone: '区', unit: '单元', layer: '层' })[t] || ''; }

    /** 类型 → 占位图标底色（像素方块，按局色统一：区黄、单元蓝、层橙） */
    _mapTypeColor(t) { return ({ zone: '#FFC229', unit: '#00A2E8', layer: '#D38200' })[t] || '#888888'; }

    /** 类型 → 边框色（保持一致感） */
    _mapTypeBorder(t) { return ({ zone: '#D38200', unit: '#0088C2', layer: '#A05B00' })[t] || '#030303'; }

    /**
     * 打开地图导航弹层。规则（基于 places.json 的区/单元/层三级 + fu/zi 父子链）：
     *  - 当前在「层」：返回区 + 当前层（高亮） + 同单元其他层（兄弟）
     *  - 当前在「单元」：返回区 + 当前单元（高亮） + 同区其他单元 + 单元下的层
     *  - 当前在「区」：当前区（高亮） + 区下的单元
     *  - 当前所在项永远居首并 .current 蓝底高亮
     *  - 没有兄弟/子项时，仅展示返回区 + 当前项
     */
    openMapPanel() {
        const list = this.container.querySelector('#mapList');
        list.innerHTML = '';
        const place = World.places && World.places.get(this.currentSceneId);

        if (!place || !place.leixing) {
            const empty = document.createElement('div');
            empty.className = 'tk-empty';
            empty.textContent = '当前所在地暂无区/单元/层结构可导航';
            list.appendChild(empty);
            this.container.querySelector('#mapMask').style.display = 'flex';
            return;
        }

        const items = [];
        const addItem = (type, rowid, name, opts = {}) => {
            if (!rowid) return;
            items.push({ type, rowid, name, ...opts });
        };

        const typeOf = place.leixing;
        const fuFirst = (p) => (p && p.fu && p.fu[0]) || null;

        if (typeOf === '层') {
            const unitRowid = fuFirst(place);
            const unit = unitRowid ? World.places.get(unitRowid) : null;
            const zoneRowid = fuFirst(unit);
            const zone = zoneRowid ? World.places.get(zoneRowid) : null;
            // 当前层（高亮）
            addItem('layer', place.rowid, place.mingcheng, { current: true });
            // 同单元其他层（兄弟）
            if (unit && Array.isArray(unit.zi)) {
                for (const sib of unit.zi) {
                    if (!sib || sib === place.rowid) continue;
                    const sibP = World.places.get(sib);
                    if (sibP) addItem('layer', sibP.rowid, sibP.mingcheng);
                }
            }
            // 返回区
            if (zone) addItem('zone', zone.rowid, `返回 ${zone.mingcheng}`, { back: true });
        } else if (typeOf === '单元') {
            const zoneRowid = fuFirst(place);
            const zone = zoneRowid ? World.places.get(zoneRowid) : null;
            // 当前单元（高亮）
            addItem('unit', place.rowid, place.mingcheng, { current: true });
            // 同区其他单元（兄弟）
            if (zone && Array.isArray(zone.zi)) {
                for (const sib of zone.zi) {
                    if (!sib || sib === place.rowid) continue;
                    const sibP = World.places.get(sib);
                    if (sibP) addItem('unit', sibP.rowid, sibP.mingcheng);
                }
            }
            // 单元下的层
            if (Array.isArray(place.zi)) {
                for (const child of place.zi) {
                    if (!child) continue;
                    const cP = World.places.get(child);
                    if (cP) addItem('layer', cP.rowid, cP.mingcheng);
                }
            }
            // 返回区
            if (zone) addItem('zone', zone.rowid, `返回 ${zone.mingcheng}`, { back: true });
        } else if (typeOf === '区') {
            // 当前区（高亮）
            addItem('zone', place.rowid, place.mingcheng, { current: true });
            // 区下的单元
            if (Array.isArray(place.zi)) {
                for (const child of place.zi) {
                    if (!child) continue;
                    const cP = World.places.get(child);
                    if (cP) addItem('unit', cP.rowid, cP.mingcheng);
                }
            }
        } else {
            const empty = document.createElement('div');
            empty.className = 'tk-empty';
            empty.textContent = `未知地点类型「${typeOf}」`;
            list.appendChild(empty);
            this.container.querySelector('#mapMask').style.display = 'flex';
            return;
        }

        if (!items.length) {
            const empty = document.createElement('div');
            empty.className = 'tk-empty';
            empty.textContent = '暂无可导航的位置';
            list.appendChild(empty);
        } else {
            for (const it of items) {
                const row = document.createElement('div');
                row.className = 'map-item' + (it.current ? ' current' : '') + (it.back ? ' back' : '');

                // 像素方块占位图标（按类型着色，与局色统一）
                const icon = document.createElement('div');
                icon.className = 'mi-icon';
                icon.style.background = this._mapTypeColor(it.type);
                icon.style.borderColor = this._mapTypeBorder(it.type);
                row.appendChild(icon);

                const col = document.createElement('div');
                col.className = 'mi-col';
                const nm = document.createElement('div');
                nm.className = 'mi-name';
                nm.textContent = it.name;
                col.appendChild(nm);
                const sub = document.createElement('div');
                sub.className = 'mi-sub';
                sub.textContent = it.back ? '上一层' : (it.current ? '当前所在' : '可前往');
                col.appendChild(sub);
                row.appendChild(col);

                const tag = document.createElement('span');
                tag.className = 'mi-tag' + (it.current ? ' cur' : '') + ' map-' + it.type;
                tag.textContent = this._mapTypeLabel(it.type);
                row.appendChild(tag);

                row.addEventListener('click', () => {
                    if (it.rowid === this.currentSceneId) {
                        this.closeMapPanel();
                        return;
                    }
                    this.closeMapPanel();
                    this.enterScene(it.rowid);
                });
                list.appendChild(row);
            }
        }

        this.container.querySelector('#mapMask').style.display = 'flex';
    }

    closeMapPanel() {
        this.container.querySelector('#mapMask').style.display = 'none';
    }

    // ==================== 入口提示（区/单元/层 地图上的格子标记，走到即弹确认） ====================

    /**
     * 主循环里每帧检查：玩家从 walk 变 idle 且停在入口格 → 弹 confirm
     * 已问过的格不会重复弹；玩家离开再回到该格时清掉记录，可再次询问
     */
    _maybePromptEntry() {
        const p = this.player;
        if (!p || this._pendingEntry) {
            // 弹窗中：只追踪坐标，不再触发
            if (p) { this._lastPlayerState = p.state; this._lastPlayerPos = p.tx + ',' + p.ty; }
            return;
        }
        const wasMoving = (this._lastPlayerState === 'walk');
        const pos = p.tx + ',' + p.ty;
        const stopped = wasMoving && p.state === 'idle' && pos !== this._lastPlayerPos;
        this._lastPlayerState = p.state;
        this._lastPlayerPos = pos;

        // 玩家走完一步 → 自动保存位置到 HAP（用户表 didian + 像素坐标）
        if (wasMoving && p.state === 'idle') this.savePlayerPosition();

        // 玩家离开旧位置超过 1 格 → 清掉"已问过"（允许再问一次）
        for (const old of [...this._askedEntries]) {
            const [ox, oy] = old.split(',').map(Number);
            if (Math.abs(ox - p.tx) + Math.abs(oy - p.ty) > 1) this._askedEntries.delete(old);
        }

        if (!stopped) return;
        if (this._askedEntries.has(pos)) return;
        const ents = World.entrancesAt(this.currentSceneId, p.tx, p.ty);
        if (!ents.length) return;
        this._askedEntries.add(pos);
        this.promptEnter(ents[0]);
    }

    /** 把玩家当前位置（场景 rowid + tx, ty）写到 HAP 用户表（didian + 像素坐标） */
    async savePlayerPosition() {
        const p = this.player;
        if (!p || !this.currentSceneId || !this.userRowid) return;
        try {
            await FsjChat.savePlayerState(this.userRowid, this.currentSceneId, p.tx, p.ty);
        } catch (e) {
            console.warn('[savePlayerPosition] failed:', e.message);
        }
    }

    promptEnter(e) {
        if (!e || this.mode !== 'scene') return;
        const target = (World.places && World.places.get(e.to)) || null;
        const label = e.label || (target ? target.mingcheng : '目标地点');
        this._pendingEntry = e;
        this.container.querySelector('#entryText').textContent = `是否进入「${label}」？`;
        this.container.querySelector('#entrySub').textContent = e.miaoshu || '';
        this.container.querySelector('#entryMask').style.display = 'flex';
        // 入口询问时收起摇杆：避免确认期间继续走
        this.container.querySelector('#joy').style.display = 'none';
    }

    confirmEntry() {
        const e = this._pendingEntry;
        this.cancelEntry();
        if (e && e.to) {
            // 入新场景后保存位置（_lastPlayerState 被 reset，自动保存不会触发）
            this.enterScene(e.to).then(() => this.savePlayerPosition()).catch(() => {});
        }
    }

    cancelEntry() {
        this._pendingEntry = null;
        const m = this.container.querySelector('#entryMask');
        if (m) m.style.display = 'none';
        // 关闭后恢复摇杆（仅在场景内且没选中角色对话时）
        if (this.mode === 'scene' && !this.selectedAgent) {
            this.container.querySelector('#joy').style.display = 'block';
        }
    }

    /** 传呼：角色走到屏幕中心并精确居中（到达后镜头平滑对齐角色中心） */
    summonSelected() {
        const agent = this.selectedAgent;
        if (!agent || !this.sceneRenderer) return;
        const cam = this.sceneRenderer.camera;
        const cx = Math.floor((cam.x + this.sceneRenderer.viewW / 2) / TILE);
        const cy = Math.floor((cam.y + this.sceneRenderer.viewH / 2) / TILE);
        const r = this.sceneRenderer;
        agent.summon(cx, cy, () => {
            // 到达后镜头持续跟随（idle 时即稳定居中）
            r.camTarget = { agent };
        });
        this.closePanel();
        this.toast(`${agent.mingcheng}正在赶来…`);
    }

    // ==================== 消息徽标 ====================

    updateMsgBadge() {
        const convs = ChatStore.getConversations(this.allAgentData);
        const total = convs.reduce((s, c) => s + (c.unread || 0), 0);
        const badge = this.container.querySelector('#msgBadge');
        if (total > 0) {
            badge.style.display = 'flex';
            badge.textContent = total > 99 ? '99+' : total;
        } else {
            badge.style.display = 'none';
        }
    }

    // ==================== Toast ====================

    toast(text) {
        const el = this.container.querySelector('#pxToast');
        el.textContent = text;
        el.style.display = '';
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2600);
    }

        destroy() {
        cancelAnimationFrame(this.raf);
        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('keydown', this._onKeyEsc);
        clearTimeout(this._tipTimer);
        clearTimeout(this._toastTimer);
        clearInterval(this._moveTimer);      // moves.json 轮询
        if (this.bus) this.bus.close();      // ws-bus 连接（切回时 init 重建）
        this.agents = [];
        this.sceneRenderer = null;
    }

    /** 切走（keep-alive 隐藏）：停主循环 + 停轮询，省资源；状态全部保留 */
    onPause() {
        cancelAnimationFrame(this.raf);
        clearInterval(this._moveTimer);
    }

    /** 切回（keep-alive 显示）：恢复主循环 + 轮询，场景原样继续 */
    onResume() {
        this.lastT = performance.now();
        cancelAnimationFrame(this.raf);
        this.raf = requestAnimationFrame(this.loop);
        clearInterval(this._moveTimer);
        this._moveTimer = setInterval(() => this.pollMoves(), 3000);
        this.updateMsgBadge();
    }
}
