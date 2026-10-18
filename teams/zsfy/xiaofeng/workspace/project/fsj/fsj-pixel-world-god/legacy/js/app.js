/**
 * 像素视界上帝端 · 主流程
 * 默认进入 天孚宫 地图；地图下拉切换；角色聚焦下拉；WS 实时订阅（只收不发）+ 60s 对账
 *
 * 铁律（PRD §五.4）：对 HAP 只读；WS 除心跳外不发送任何业务消息。
 */
import { WsBus } from '../../fsj-pixel-world/js/services/ws-bus.js';
import { GodWorld } from './services/god-world.js';
import { Roster } from './services/roster.js';
import { Stats } from './services/stats.js';
import { SceneView } from './views/scene.js';
import { Profile } from './views/profile.js';

const GOD_ROWID = '2ab12bea-8db1-4b78-a955-3505d547fba7';   // 林东城（真人）——只收不发
const DEFAULT_SCENE = 'tianfugong';                          // 默认加载 天孚宫
const RECONCILE_MS = 60 * 1000;

const $ = (id) => document.getElementById(id);

function setWs(on, text) {
    const el = $('tb-ws');
    el.className = 'tb-ws ' + (on ? 'tb-ws-on' : 'tb-ws-off');
    el.textContent = '● ' + text;
}

function toast(msg, ms = 3500) {
    const t = $('toast');
    t.textContent = msg;
    t.style.display = '';
    clearTimeout(toast._tm);
    toast._tm = setTimeout(() => { t.style.display = 'none'; }, ms);
}

/** 聚焦下拉：列出当前地图的全部角色 */
function refreshFocusSelect() {
    const sel = $('focus-select');
    const prev = sel.value;
    const list = Roster.members.filter(m => m.sceneId === SceneView.sceneId && m.pos);
    sel.innerHTML = '<option value="">— 聚焦角色（' + list.length + ' 人在图）—</option>';
    for (const m of list) {
        const opt = document.createElement('option');
        opt.value = m.rowid;
        opt.textContent = `${m.mingcheng} · ${m.zhiwei || ''} · Lv.${(m.char && m.char.dengji) || '?'}`;
        sel.appendChild(opt);
    }
    if (prev && list.some(m => m.rowid === prev)) sel.value = prev;
}

async function boot() {
    try {
        // 1) 世界 + 花名册
        await GodWorld.load();
        window.__godScenes = GodWorld.scenes();
        await Roster.load();

        // 2) 场景视图 + 地图下拉（默认 天孚宫）
        SceneView.init((m) => Profile.open(m), () => refreshFocusSelect());
        await SceneView.buildSceneSelect();
        const first = GodWorld.scenes().find(s => s.id === DEFAULT_SCENE && !document.querySelector(`#sc-select option[value="${s.id}"]`)?.disabled)
            || GodWorld.scenes().find(s => !document.querySelector(`#sc-select option[value="${s.id}"]`)?.disabled)
            || DEFAULT_SCENE;
        await SceneView.enter(first);

        // 聚焦下拉
        $('focus-select').onchange = (e) => { e.target.blur();
            if ($('focus-select').value) SceneView.focus($('focus-select').value);
        };

        // 3) WS 订阅（只收不发）
        const bus = new WsBus({ url: 'wss://100000whys.cn/ws', rowid: GOD_ROWID });
        bus.on('world.move', (body) => {
            const sceneId = Roster.applyMove(body.rowid, body.tx, body.ty, body.scene);
            if (sceneId) {
                Stats.record(sceneId, 'move');
                if (sceneId === SceneView.sceneId) refreshFocusSelect();
            }
        });
        bus.on('world.presence', (body) => {
            const sceneId = Roster.applyPresence(body.agentId, body);
            if (sceneId) {
                Stats.record(sceneId, 'presence');
                if (sceneId === SceneView.sceneId) refreshFocusSelect();
            }
        });
        bus.on('world.chat', (body) => {
            // 只统计活动，不看内容（PRD 非目标）
            const m = Roster.byRowid.get(body && (body.rowid || body.from));
            if (m && m.sceneId) Stats.record(m.sceneId, 'chat');
        });
        patchBusStatus(bus);
        bus.connect();

        // 4) 初始位置快照（WS 已在收，快照只兜底）
        await Roster.snapshot();
        refreshFocusSelect();
        toast('初始快照完成 · ' + Roster.members.length + ' 位居民', 2000);

        // 5) 60s 对账自愈
        setInterval(() => { Roster.reconcile().then(refreshFocusSelect); }, RECONCILE_MS);

        // 6) 主循环
        let last = performance.now();
        const loop = (t) => {
            const dtMs = Math.min(100, t - last);
            last = t;
            SceneView.loop(t, dtMs);
            topbarTick(t);
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    } catch (e) {
        console.error('[god] 启动失败', e);
        toast('启动失败：' + e.message, 8000);
    }
}

/** 连接状态展示（WsBus 无状态钩子，轮询 readyState；恢复瞬间触发对账补漏） */
function patchBusStatus(bus) {
    let wasOpen = false;
    setInterval(() => {
        const open = bus.ws && bus.ws.readyState === 1;
        setWs(!!open, open ? '实时' : (bus.ws && bus.ws.readyState === 0 ? '连接中…' : '已断开 · 最近已知位置'));
        if (open && !wasOpen) Roster.reconcile().then(refreshFocusSelect);
        wasOpen = !!open;
    }, 2000);
}

let lastClock = 0;
let lastStats = 0;
function topbarTick(t) {
    // 时钟（1s）
    if (t - lastClock > 1000) {
        lastClock = t;
        const d = new Date();
        const p = n => (n < 10 ? '0' + n : '' + n);
        $('tb-clock').textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    }
    // 顶栏统计（500ms 节流）
    if (t - lastStats > 500) {
        lastStats = t;
        const here = Roster.members.filter(m => m.sceneId === SceneView.sceneId && m.pos).length;
        const act = Stats.activity(SceneView.sceneId);
        const sum = Stats.summary(Roster, GodWorld.scenes());
        $('tb-stats').textContent =
            `${SceneView.sceneId ? '图内 ' + here + ' 人' : ''}${act ? ' · 近5分钟动 ' + act : ''} · 全服在场 ${sum.placed}/${sum.total}`;
    }
}

boot();
