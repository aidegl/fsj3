/**
 * 客户端 filter — mingdao v2 filter 失效，必须 verify
 *
 * 关键：
 *  - zi 字段是 mingdao 自动维护的子节点数
 *  - sew 字段返回 {key, value} 对象（key 是 UUID）
 *  - 树根的判定：fuyuan=ROOT_FUYUAN + fu=null（顶级目标）
 */

/** 记录是否 7目标/8计划（兼容显示文本 "7目标" 和 UUID key 两种格式） */
function isTargetOrPlan(rec) {
    const s = getSewValue(rec);
    return s === '7目标' || s === '8计划';
}

/** 记录是否 7目标 */
function isTarget(rec) {
    return getSewValue(rec) === '7目标';
}

/** 记录是否 8计划 */
function isPlan(rec) {
    return getSewValue(rec) === '8计划';
}

/**
 * 提取 sew 字段的统一值（显示文本）
 * 兼容三种格式：v2 显示文本字符串 / v3 [{key,value}] / v3 [{sid,name}] / get 单条 {key,value}
 */
function getSewValue(rec) {
    const sew = rec[FIELD_IDS.sew] || rec.sew;
    if (!sew) return '';
    if (typeof sew === 'string') return sew;
    if (Array.isArray(sew) && sew.length > 0) {
        const first = sew[0];
        if (typeof first === 'object') return first.value || first.name || '';
    }
    if (typeof sew === 'object') {
        if (Array.isArray(sew)) return sew.length > 0 ? (sew[0].value || sew[0].name || '') : '';
        return sew.value || sew.name || sew.key || '';
    }
    return '';
}

/** 兼容旧接口：getSewKey 返回 UUID（如 v3 get 单条返回）*/
function getSewKey(rec) {
    const sew = rec[FIELD_IDS.sew] || rec.sew;
    if (!sew) return '';
    if (typeof sew === 'object' && sew.key) return sew.key;
    if (typeof sew === 'string') {
        // 显示文本反向映射 UUID
        if (sew === '7目标') return SEW_KEYS.target;
        if (sew === '8计划') return SEW_KEYS.plan;
        return sew;
    }
    return '';
}

/** 提取 fu 字段的 sid（父 rowid）— 兼容 [{sid,name}] 数组 / JSON 字符串 / {sid,name} 对象 */
function getFuSid(rec) {
    const fu = rec[FIELD_IDS.fu] || rec.fu;
    if (!fu) return null;
    if (Array.isArray(fu) && fu.length > 0) return fu[0].sid || null;
    if (typeof fu === 'string') {
        try {
            const parsed = JSON.parse(fu);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].sid || null;
        } catch (e) { return null; }
        return null;
    }
    if (typeof fu === 'object' && fu.sid) return fu.sid;
    return null;
}

/** 提取 fu 的显示名 — 兼容数组 / JSON 字符串 / 对象 */
function getFuName(rec) {
    const fu = rec[FIELD_IDS.fu] || rec.fu;
    if (Array.isArray(fu) && fu.length > 0) return fu[0].name || null;
    if (typeof fu === 'string') {
        try {
            const parsed = JSON.parse(fu);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].name || null;
        } catch (e) { return null; }
        return null;
    }
    if (typeof fu === 'object' && fu.name) return fu.name;
    return null;
}

/** 提取 fuyuan 的 sid — proxy normalize 后是 [{sid,name}] 或 JSON 字符串（v2 fallback） */
function getFuyuanSid(rec) {
    const fy = rec[FIELD_IDS.fuyuan] || rec.fuyuan;
    if (!fy) return null;
    if (Array.isArray(fy) && fy.length > 0) return fy[0].sid || null;
    if (typeof fy === 'string') {
        try {
            const parsed = JSON.parse(fy);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].sid || null;
        } catch (e) { /* ignore */ }
        return null;
    }
    if (typeof fy === 'object' && fy.sid) return fy.sid;
    return null;
}

/** zi 字段（直接子节点数）—— v2 open API 返回 [] 数组或非空数组 */
function getZi(rec) {
    if (!rec) return 0;
    const zi = rec[FIELD_IDS.zi] || rec.zi;
    if (zi == null) return 0;
    if (Array.isArray(zi)) return zi.length;
    const n = Number(zi);
    return isNaN(n) ? 0 : n;
}

/** 提取 mingcheng */
function getMingcheng(rec) {
    return rec[FIELD_IDS.mingcheng] || rec.mingcheng || '(无标题)';
}

/** 提取 wznr */
function getWznr(rec) {
    return rec[FIELD_IDS.wznr] || rec.wznr || '';
}

/** 提取 zhixindu（数字） */
function getZhixindu(rec) {
    const v = rec[FIELD_IDS.zhixindu] || rec.zhixindu;
    if (v === '' || v == null) return null;
    return Number(v);
}

/** 提取 quanzhong（数字） */
function getQuanzhong(rec) {
    const v = rec[FIELD_IDS.quanzhong] || rec.quanzhong;
    return v === '' || v == null ? 0 : Number(v);
}

/** 提取 fabuzhe sid — 兼容数组 / JSON 字符串 / 对象 */
function getFabuzheSid(rec) {
    const f = rec[FIELD_IDS.fabuzhe] || rec.fabuzhe;
    if (Array.isArray(f) && f.length > 0) return f[0].sid || null;
    if (typeof f === 'string') {
        try {
            const parsed = JSON.parse(f);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].sid || null;
        } catch (e) { return null; }
        return null;
    }
    if (typeof f === 'object' && f.sid) return f.sid;
    return null;
}

/** 提取 fabuzhe 显示名 — 兼容数组 / JSON 字符串 / 对象 */
function getFabuzheName(rec) {
    const f = rec[FIELD_IDS.fabuzhe] || rec.fabuzhe;
    if (Array.isArray(f) && f.length > 0) return f[0].name || null;
    if (typeof f === 'string') {
        try {
            const parsed = JSON.parse(f);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].name || null;
        } catch (e) { return null; }
        return null;
    }
    if (typeof f === 'object' && f.name) return f.name;
    return null;
}

/** 是否被逻辑删除（mingdao 删除字段返回 1 表示已删） */
function isDeleted(rec) {
    const v = rec[FIELD_IDS.shanchu] || rec.shanchu;
    return v === '1' || v === 1;
}

/**
 * 过滤：在指定天根下的所有目标/计划（不含已删除）
 * 要求：fuyuan=天根 AND leixing=知识（缺类型的不显示）
 * leixing 兼容三种格式：v2 文本 "知识" / v3 数组 [{sid,name}] / [{key,value}]
 * @param {Array} records
 * @param {string} tianRoot 天根 rowid（默认读 window.ACTIVE_TIAN_ROOT，fallback ROOT_FUYUAN）
 */
const LEIXING_ZHISHI_SID = '55c1d467-927b-4af8-98a9-d934554ac3bf';
function getLeixingValue(rec) {
    const lx = rec[FIELD_IDS.leixing] || rec.leixing;
    if (!lx) return '';
    if (typeof lx === 'string') return lx;  // v2 文本："知识"
    if (Array.isArray(lx) && lx.length > 0) {
        const f = lx[0];
        if (typeof f === 'object') return f.name || f.value || f.sid || '';
        return String(f);
    }
    if (typeof lx === 'object' && !Array.isArray(lx)) return lx.name || lx.value || lx.sid || '';
    return '';
}
function filterUnderTian(records, tianRoot) {
    const root = tianRoot || (typeof window !== 'undefined' && window.ACTIVE_TIAN_ROOT) || ROOT_FUYUAN;
    return records.filter(rec => {
        if (isDeleted(rec)) return false;
        if (getFuyuanSid(rec) !== root) return false;
        // ⭐ leixing 严格=知识：null/空/其他值都不显示
        // 验证过：v2 对设置的返回 '知识' 文本，未设置的返回 null -> 可以区分
        const lxId = (function() {
            const lx = rec[FIELD_IDS.leixing] || rec.leixing;
            if (Array.isArray(lx) && lx.length > 0 && typeof lx[0] === 'object') return lx[0].sid || lx[0].key || null;
            if (typeof lx === 'object' && lx && !Array.isArray(lx)) return lx.sid || lx.key || null;
            return null;
        })();
        const lxVal = getLeixingValue(rec);
        if (lxVal !== '知识' && lxId !== LEIXING_ZHISHI_SID) return false;
        return true;
    });
}

/**
 * 真叶子：zi=0 + 是目标或计划
 */
/**
 * 从树结构收集所有叶子（最小可执行项）= children.length === 0 的节点
 * ⭐ 用树结构判定，不依赖 HAP 的 zi 字段（v3 get 返回空数组不可靠）
 * 树里显示非叶子 + 看板显示叶子 = 左+中 = 全部数据
 */
function collectLeaves(tree) {
    const result = [];
    (function walk(nodes) {
        for (const node of nodes) {
            if (!node || !node.rec) continue;
            if (!node.children || node.children.length === 0) {
                result.push(node.rec); // 叶子 -> 最小可执行项
            } else {
                walk(node.children);
            }
        }
    })(tree || []);
    return result;
}

/** 兼容旧接口：filterLeaves（保留，但推荐用 collectLeaves）*/
function filterLeaves(records) {
    return records.filter(rec => {
        if (!isTargetOrPlan(rec)) return false;
        if (getZi(rec) !== 0) return false;
        return true;
    });
}

/**
 * 递归构建树
 * 输入：records 数组（已 filterUnderTian）+ 根 rowid（ROOT_FUYUAN）
 * 返回：嵌套的树节点
 *
 * 根节点的判定：fuyuan=ROOT_FUYUAN 且 fu=null（即直接挂在「天」下）
 */
function buildTree(records) {
    const byParent = new Map(); // parentRowid → childRec[]
    for (const rec of records) {
        const fuSid = getFuSid(rec);
        if (fuSid) {
            if (!byParent.has(fuSid)) byParent.set(fuSid, []);
            byParent.get(fuSid).push(rec);
        }
    }

    const activeRoot = (typeof window !== 'undefined' && window.ACTIVE_TIAN_ROOT) || ROOT_FUYUAN;

    // 同层子节点按权重（quanzhong）倒序 -- 2026-08-19 东城要求：树也按权重排序
    function makeNode(rec, depth) {
        let children = (byParent.get(rec.rowid) || []).map(c => makeNode(c, depth + 1));
        children.sort((a, b) => {
            const qa = getQuanzhong(a.rec) || 0;
            const qb = getQuanzhong(b.rec) || 0;
            return qb - qa; // 权重大在前
        });
        return {
            rec,
            depth,
            children,
            rowid: rec.rowid
        };
    }

    const roots = records.filter(rec => getFuSid(rec) === activeRoot);
    roots.sort((a, b) => (getQuanzhong(b) || 0) - (getQuanzhong(a) || 0)); // 根层也按权重排
    return roots.map(r => makeNode(r, 1));
}

/**
 * 给定 rowid，从树里找到所有上级 rowid 链（不含自己）
 */
function findAncestors(tree, targetRowid) {
    function dfs(node, ancestors) {
        if (node.rowid === targetRowid) return ancestors;
        for (const child of node.children) {
            const found = dfs(child, [...ancestors, node.rowid]);
            if (found) return found;
        }
        return null;
    }
    for (const root of tree) {
        const r = dfs(root, []);
        if (r) return r;
    }
    return [];
}

/**
 * 给定 rowid，从树里找到所有子节点 rowid（含自己）
 */
function findDescendants(tree, targetRowid) {
    function dfs(node) {
        if (node.rowid === targetRowid) return [node.rowid];
        const all = [];
        for (const child of node.children) {
            all.push(...dfs(child));
        }
        return all;
    }
    for (const root of tree) {
        const r = dfs(root);
        if (r.length > 0 && r[0] === targetRowid) return r;
    }
    return [];
}

/** 暴露 */
window.Filter = {
    isTargetOrPlan,
    isTarget,
    isPlan,
    getSewValue,
    getSewKey,
    getFuSid,
    getFuName,
    getFuyuanSid,
    getZi,
    getMingcheng,
    getWznr,
    getZhixindu,
    getQuanzhong,
    getFabuzheSid,
    getFabuzheName,
    isDeleted,
    filterUnderTian,
    filterLeaves,
    collectLeaves,
    buildTree,
    findAncestors,
    findDescendants
};