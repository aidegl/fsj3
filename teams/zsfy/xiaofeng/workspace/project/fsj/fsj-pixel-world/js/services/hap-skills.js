/**
 * 技能服务 - 实时从 HAP 内容元数据表拉取角色技能（2026-09-07 东城批准算法）
 *
 * 卡片规则（不锁死「将」节点，统一算法）：
 *   卡片 = 角色五事骨架根往下 2 层内所有 sew=1技能 的节点（第1、2层都算）
 *   点击卡片 = 拉 fu=卡片rowid 的子数据展开（见 children()）
 *
 * 骨架发现（命名跟角色名不跟 agent 名，如小风的根是「五事-慕容风」，故不写死名字）：
 *   fabuzhe=<账号rowid> + fu为空 → mingcheng「五事-」前缀且 sew=0骨架 的顶根
 *
 * 查询一律走 Node 代理（键名必须是 filters；关联过滤 dataType 29 / filterType 24；
 * 多父 OR 用 values 数组；必带 shanchu≠1）。渐进式加载：列表只拉
 * rowid/mingcheng/sew/miaoshu/xstb/guanjianci/zi，不拉 wznr 全文。
 *
 * 缓存：localStorage 按账号隔离，TTL 5 分钟；页面每次进入后台静默刷新
 * （load(rowid, 0) 强制拉新），防止刚发布的技能看不到。
 *
 * 用法：
 *   import HapSkills from '../../services/hap-skills.js';
 *   const { skills, hasSkeleton } = await HapSkills.load(memberRowid);
 *   const children = await HapSkills.children(skillRowid);
 */
const MINGDAO_PROXY = 'https://100000whys.cn/mingdao';
const M_API = 'https://api.mingdao.com/v2/open/worksheet/getFilterRows';
const SHANGPIN_WS = 'shangpin';
const CACHE_PREFIX = 'pxw_hapskills_';
const TTL = 5 * 60 * 1000;

/** 子数据数量缓存（rowid -> count），跨面板返回/重开复用 */
const _countCache = new Map();

async function call(url, body) {
    const res = await fetch(MINGDAO_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, input: body })
    });
    if (!res.ok) throw new Error('MingDao proxy ' + res.status);
    return res.json();
}

function rel(v) {
    try { const a = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
}

function parseXstb(v) {
    if (!v) return null;
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') {
        try { return JSON.parse(v); } catch (e) { return null; }
    }
    return null;
}

/** fu 关联过滤（values 数组 = OR 语义）+ 必带的删除排除 */
function childFilters(parentIds) {
    return [
        { controlId: 'fu', dataType: 29, spliceType: 1, filterType: 24, values: parentIds.slice(0, 100) },
        { controlId: 'shanchu', dataType: 2, spliceType: 1, filterType: 6, value: '1' }
    ];
}

async function queryChildren(parentIds, controls) {
    if (!parentIds.length) return [];
    const d = await call(M_API, {
        worksheetId: SHANGPIN_WS,
        pageSize: 200, pageIndex: 1, listType: 0,
        controls: controls,
        filters: childFilters(parentIds)
    });
    return (d.data && d.data.rows) || [];
}

/** 骨架发现：账号 + fu为空 的顶根里找「五事-」前缀的 0骨架 节点 */
async function findSkeletonRoot(memberRowid) {
    const d = await call(M_API, {
        worksheetId: SHANGPIN_WS,
        pageSize: 100, pageIndex: 1, listType: 0,
        controls: ['rowid', 'mingcheng', 'sew'],
        filters: [
            { controlId: 'fabuzhe', dataType: 29, spliceType: 1, filterType: 24, value: memberRowid },
            { controlId: 'fu', dataType: 29, spliceType: 1, filterType: 7 }
        ]
    });
    const rows = (d.data && d.data.rows) || [];
    return rows.find(r => r.sew === '0骨架' && (r.mingcheng || '').startsWith('五事-')) || null;
}

const LIST_CONTROLS = ['rowid', 'mingcheng', 'sew', 'miaoshu', 'xstb', 'guanjianci', 'zi'];

function toSkill(r, layer) {
    return {
        rowid: r.rowid,
        mingcheng: r.mingcheng || '',
        miaoshu: r.miaoshu || '',
        xstb: parseXstb(r.xstb),
        guanjianci: rel(r.guanjianci).map(g => g.sid || g.rowid),
        ziCount: rel(r.zi).length,
        layer: layer   // 1=骨架根第1层（如将-XX直下），2=第2层（如道→全局技能直下）
    };
}

export default {
    /**
     * 加载角色技能卡片（骨架根 2 层内 sew=1技能）
     * @param {string} memberRowid 成员 rowid
     * @param {number} [maxAge]    缓存有效期 ms；传 0 强制拉新（后台静默刷新用）
     * @returns {Promise<{skills:Array, hasSkeleton:boolean}>}
     */
    async load(memberRowid, maxAge = TTL) {
        const ck = CACHE_PREFIX + memberRowid;
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem(ck) || 'null'); } catch (e) { /* ignore */ }
        if (cached && maxAge > 0 && Date.now() - cached.ts < maxAge) return cached.payload;

        const root = await findSkeletonRoot(memberRowid);
        let payload;
        if (!root) {
            payload = { skills: [], hasSkeleton: false };
        } else {
            const L1 = await queryChildren([root.rowid], LIST_CONTROLS);
            const L2 = await queryChildren(L1.map(r => r.rowid), LIST_CONTROLS);
            const skills = [];
            const seen = new Set();
            for (const r of L1) if (r.sew === '1技能' && !seen.has(r.rowid)) { skills.push(toSkill(r, 1)); seen.add(r.rowid); }
            for (const r of L2) if (r.sew === '1技能' && !seen.has(r.rowid)) { skills.push(toSkill(r, 2)); seen.add(r.rowid); }
            payload = { skills, hasSkeleton: true };
        }
        try { localStorage.setItem(ck, JSON.stringify({ ts: Date.now(), payload })); } catch (e) { /* 存不进就下次重拉 */ }
        return payload;
    },

    /**
     * 点击卡片/子条目：拉 fu=rowid 的子数据（层级树下一层），并批量算好每个子条目自己的子数据数量
     * （第二批查询 fu=各子条目rowid → 客户端按父分组计数，16 条子数据只需 1 次额外查询）
     * @returns {Promise<Array>} [{rowid, mingcheng, sew, miaoshu, ziCount}] ziCount=null 表示太多没算（懒加载兜底）
     */
    async children(rowid) {
        const rows = await queryChildren([rowid], ['rowid', 'mingcheng', 'sew', 'miaoshu']);
        const kids = rows.map(r => ({
            rowid: r.rowid,
            mingcheng: r.mingcheng || '',
            sew: r.sew || '',
            miaoshu: r.miaoshu || '',
            ziCount: null
        }));
        // 批量子计数：一批 fu OR 查询拉回所有孙条目的 fu，按父分组
        if (kids.length && kids.length <= 100) {
            try {
                const grand = await queryChildren(kids.map(k => k.rowid), ['fu']);
                const cnt = new Map();
                for (const g of grand) for (const p of rel(g.fu)) {
                    const pid = p.sid || p.rowid;
                    cnt.set(pid, (cnt.get(pid) || 0) + 1);
                }
                for (const k of kids) {
                    k.ziCount = cnt.get(k.rowid) || 0;
                    _countCache.set(k.rowid, k.ziCount);
                }
            } catch (e) { /* 计数失败不影响列表，走懒加载兜底 */ }
        }
        return kids;
    },

    /**
     * 单条目子数据数量（懒加载兜底，pageSize:1 只为拿 total）
     * 结果进 _countCache；已缓存直接返回
     */
    async countChildren(rowid) {
        if (_countCache.has(rowid)) return _countCache.get(rowid);
        const d = await call(M_API, {
            worksheetId: SHANGPIN_WS,
            pageSize: 1, pageIndex: 1, listType: 0,
            controls: ['rowid'],
            filters: childFilters([rowid])
        });
        const n = (d.data && d.data.total) || 0;
        _countCache.set(rowid, n);
        return n;
    },

    /** 层级内存缓存（面板返回时不重查）：rowid -> kids 数组 */
    _kidsCache: new Map(),
    cacheKids(rowid, kids) { this._kidsCache.set(rowid, kids); },
    getCachedKids(rowid) { return this._kidsCache.get(rowid) || null; },

    /** 清除指定账号缓存（调试/强刷用） */
    invalidate(memberRowid) {
        try { localStorage.removeItem(CACHE_PREFIX + memberRowid); } catch (e) { /* ignore */ }
    }
};
