/**
 * 五事系统 · 数据过滤与树构建
 */
import { FIELD_IDS, SEW_DIMS, SEW_BY_KEY, SEW_BY_NAME } from './field-ids.js';

/** 按 fabuzhe 过滤（Relation 字段：normalizeRow 后为 [{sid, name}]） */
export function filterByAgent(records, fabuzheRowid) {
    return records.filter(r => {
        const fz = r[FIELD_IDS.fabuzhe];
        if (Array.isArray(fz)) return fz.some(x => x && x.sid === fabuzheRowid);
        if (typeof fz === 'string' && fz) {
            try { const a = JSON.parse(fz); return Array.isArray(a) && a.some(x => x && x.sid === fabuzheRowid); }
            catch (e) { return false; }
        }
        return false;
    });
}

/** 顶根 = fu 为空的记录（五事-<agent名>） */
export function buildTree(records) {
    const byId = new Map();
    records.forEach(r => {
        if (r.rowid) byId.set(r.rowid, { rec: r, rowid: r.rowid, children: [] });
    });
    const roots = [];
    for (const node of byId.values()) {
        const fu = node.rec[FIELD_IDS.fu];
        const fuSid = Array.isArray(fu) && fu[0] ? fu[0].sid : null;
        const parent = fuSid ? byId.get(fuSid) : null;
        if (parent) parent.children.push(node);
        else roots.push(node);
    }
    const q = n => { const v = Number(n.rec[FIELD_IDS.quanzhong]); return Number.isFinite(v) ? v : 0; };
    const sortRec = (arr) => {
        arr.sort((a, b) => q(b) - q(a));   // 权重高→低（2026-09-24 拍板；新节点权重 0 沉底）
        arr.forEach(n => sortRec(n.children));
    };
    sortRec(roots);
    return roots;
}

/** 父链 rowid 数组（不含自身） */
export function findAncestors(records, rowid) {
    const byId = new Map(records.map(r => [r.rowid, r]));
    const chain = [];
    let cur = byId.get(rowid);
    const guard = new Set();
    while (cur && !guard.has(cur.rowid)) {
        guard.add(cur.rowid);
        const fu = cur[FIELD_IDS.fu];
        const fuSid = Array.isArray(fu) && fu[0] ? fu[0].sid : null;
        if (!fuSid || !byId.has(fuSid)) break;
        chain.push(fuSid);
        cur = byId.get(fuSid);
    }
    return chain.reverse();
}

/** 兜底维度：9信息（不能用数组下标——0骨架插在队首会移位） */
const DEFAULT_DIM = SEW_BY_NAME['9信息'];

/** 节点的维度定义（按 sewKey → sewName 查，兜底 9信息） */
export function getDim(rec) {
    const sew = rec[FIELD_IDS.sew];
    if (Array.isArray(sew) && sew[0]) {
        return SEW_BY_KEY[sew[0].sid] || SEW_BY_NAME[sew[0].name] || DEFAULT_DIM;
    }
    if (typeof sew === 'string' && sew) return SEW_BY_NAME[sew] || DEFAULT_DIM;
    return DEFAULT_DIM;
}

/** 节点 sew 的显示名 */
export function getSewName(rec) {
    return getDim(rec).sew;
}

/** 骨架判定：顶根（五事根）或顶根的直接子节点（道天地将法/时间记事） */
export function isSkeleton(node, depth) {
    if (depth <= 1) return true;
    return false;
}

/** 取 Relation 首个 sid */
export function getFuSid(rec) {
    const fu = rec[FIELD_IDS.fu];
    return Array.isArray(fu) && fu[0] ? fu[0].sid : null;
}
