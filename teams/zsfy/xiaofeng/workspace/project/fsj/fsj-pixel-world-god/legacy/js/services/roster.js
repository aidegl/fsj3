/**
 * roster - 花名册 + 位置状态机（上帝端的核心状态）
 *
 * 每个角色一份位置记录：
 *   { sceneId, tx, ty, px, py,      // 当前渲染坐标（px/py 为插值中的像素位）
 *     source: 'snapshot'|'live',    // 快照位置（HAP）/ 实时位置（WS）
 *     lastWsTs,                     // 最近一次 WS 更新时间
 *     online }                      // presence 声明
 *
 * 铁律：上帝端只读 —— 本模块不发任何写请求，不发送任何 WS 业务消息。
 */
import { FsjChat } from '../../../fsj-pixel-world/js/services/fsj-chat.js';
import { GodWorld } from './god-world.js';

const MOBILE_ASSETS = '../fsj-pixel-world/assets';
const STALE_MS = 5 * 60 * 1000;      // 5 分钟无 WS 更新 → 降为"最后已知位置"

/** 并发池（快照限流） */
async function pool(items, limit, fn) {
    const results = new Array(items.length);
    let i = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (i < items.length) {
            const idx = i++;
            try { results[idx] = await fn(items[idx], idx); }
            catch (e) { results[idx] = null; }
        }
    });
    await Promise.all(workers);
    return results;
}

export const Roster = {
    members: [],        // 成员 + 角色 + 位置
    byRowid: new Map(),

    async load() {
        // 成员（HAP rowid ↔ 像素角色桥接表）
        const res = await fetch(`${MOBILE_ASSETS}/members.json?v=` + Date.now(), { cache: 'no-store' });
        const members = await res.json();
        // 角色卡（像素形象/等级/经验/五行/地支/人格）
        const chars = [];
        for (const f of ['xiaozong', 'xiaofeng', 'ashuo', 'mengyao', 'xiaoyun', 'dongcheng', 'biaozhun']) {
            try {
                const r = await fetch(`${MOBILE_ASSETS}/characters/${f}.json?v=` + Date.now(), { cache: 'no-store' });
                chars.push(await r.json());
            } catch (e) { /* 该角色无数据 */ }
        }
        this.members = members.map(m => {
            const char = chars.find(c => c.rowid === m.agentId) || null;
            return {
                ...m,
                char,                       // dengji/jingyan/wuxing/dizhi/renge/biaoti/pixels_xiao...
                pos: null,                  // 位置记录（snapshot 后才有）
                sceneId: null
            };
        });
        this.members.forEach(m => this.byRowid.set(m.rowid, m));
        return this.members;
    },

    /** 初始快照：并发 3 拉用户表 didian+xszb */
    async snapshot() {
        await pool(this.members, 3, async (m) => {
            try {
                const s = await FsjChat.playerState(m.rowid);
                m.staticDidian = s.didian || m.staticDidian || m.didian || '';
                if (s.didian && Number.isFinite(s.x) && Number.isFinite(s.y)) {
                    this.place(m, s.didian, s.x, s.y, 'snapshot');
                }
            } catch (e) { /* 单个失败不影响整体 */ }
        });
        return this.members;
    },

    /** 周期对账：拉 HAP 最新值覆盖（自愈 WS 漏消息） */
    async reconcile() {
        await this.snapshot();
    },

    /**
     * 归一化落位：placeRowid 兼容 场景id / 地点rowid 两种形态
     * @returns 命中的 sceneId 或 null（未入场/未知地点）
     */
    place(m, placeRowid, tx, ty, source) {
        const sceneId = GodWorld.sceneIdOfPlace(placeRowid) || (placeRowid === m.sceneId ? placeRowid : null);
        if (!sceneId) { m.sceneId = null; m.pos = null; return null; }
        m.sceneId = sceneId;
        if (!m.pos) m.pos = {};
        m.pos.sceneId = sceneId;
        m.pos.tx = tx; m.pos.ty = ty;
        m.pos.px = tx; m.pos.py = ty;       // 渲染用格坐标（插值由 renderer 按像素做）
        m.pos.source = source;
        m.pos.lastWsTs = source === 'live' ? Date.now() : (m.pos.lastWsTs || 0);
        return sceneId;
    },

    /** WS world.move → {rowid, tx, ty, scene} */
    applyMove(rowid, tx, ty, scene) {
        const m = this.byRowid.get(rowid);
        if (!m) return null;
        return this.place(m, scene, tx, ty, 'live');
    },

    /** WS world.presence → {agentId, online, tx, ty, scene} */
    applyPresence(agentId, body) {
        const m = this.byRowid.get(agentId) || this.byRowid.get(body.rowid);
        if (!m) return null;
        if (m.pos) m.pos.online = !!body.online;
        if (Number.isFinite(body.tx) && Number.isFinite(body.ty)) {
            return this.place(m, body.scene, body.tx, body.ty, 'live');
        }
        return m.sceneId;
    },

    /** 是否过期（stale：超时无 WS 更新 → 半透明"最后已知位置"） */
    isStale(m) {
        return !m.pos || (m.pos.source !== 'live' && Date.now() - (m.pos.lastWsTs || 0) > STALE_MS);
    },

    /** 按场景聚合在场角色 */
    byScene() {
        const map = {};      // sceneId -> [member]
        for (const m of this.members) {
            if (m.sceneId && m.pos) (map[m.sceneId] = (map[m.sceneId] || [])).push(m);
        }
        return map;
    },

    /** 未入场（无任何位置记录） */
    unplaced() { return this.members.filter(m => !m.sceneId || !m.pos); }
};
