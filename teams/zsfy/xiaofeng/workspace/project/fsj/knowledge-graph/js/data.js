/**
 * data.js — 数据转换层：精简记录 → 图谱节点/边 + 视觉映射
 *
 * 视觉映射（东城 2026-08-15 确认）：
 *  - 节点大小 = 权重。优先读 quanzhong 字段；空则兜底
 *      weightStruct = 直接子数 + 被引用数 × 2
 *  - 节点亮度 = 置信度。优先读 zhixindu 字段；空则兜底
 *      confFallback = shangjia1(1=验证模式 → 亮 / 0=推理模式 → 暗) + 关键词数微调
 *  - 字段将来有真实值时自动覆盖兜底值，无需改代码。
 *
 * 颜色 = sew 12 维基色（色相固定）+ 置信度调亮度（HSL 的 L 通道）。
 */

import { SEW_META, SEW_DEFAULT_COLOR, SEW_ORDER, VISUAL, CONFIG } from './config.js';

/* ---------------- 颜色工具 ---------------- */

function hexToHsl(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let hue = 0, sat = 0;
    const lum = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        sat = lum > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: hue = ((g - b) / d + (g < b ? 6 : 0)); break;
            case g: hue = ((b - r) / d + 2); break;
            case b: hue = ((r - g) / d + 4); break;
        }
        hue *= 60;
    }
    return { h: hue, s: sat * 100, l: lum * 100 };
}

/** sew 基色 → 指定亮度（0~1）的 HSL 字符串 */
function sewColorAtL(sew, conf) {
    const base = SEW_META[sew] ? SEW_META[sew].color : SEW_DEFAULT_COLOR;
    const { h, s } = hexToHsl(base);
    const l = VISUAL.CONF_L_MIN + (VISUAL.CONF_L_MAX - VISUAL.CONF_L_MIN) * conf;
    return `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${(l * 100).toFixed(0)}%)`;
}

/* ---------------- 度量计算 ---------------- */

/**
 * 单条记录 → 权重/置信度（含来源标注）
 * @returns {{weight:number, weightSource:'field'|'structure', conf:number, confSource:'field'|'fallback'}}
 */
export function computeMetrics(rec) {
    // 权重：字段优先
    let weight, weightSource;
    if (rec.quanzhong !== null && rec.quanzhong !== undefined) {
        weight = Math.max(0, rec.quanzhong);
        weightSource = 'field';
    } else {
        // 结构兜底 = 关联度 + 内容充实度
        //   关联度：直接子数 + 被引用数×2（被引用 = 知识被复用，权重更高）
        //   充实度：有名称/有正文（按长度分档）/有关键词 —— 叶子记录也有区分度
        const rel = rec.zi.length + rec.beiyinyong.length * 2;
        const rich =
            (rec.mingcheng ? 1 : 0) +
            (rec.wznr ? 1 + Math.min(Math.floor(rec.wznr.length / 200), 3) : 0) +
            Math.min(rec.guanjianci.length, 3);
        weight = rel * 3 + rich;
        weightSource = 'structure';
    }

    // 置信度：字段优先（归一到 0~1）
    let conf, confSource;
    if (rec.zhixindu !== null && rec.zhixindu !== undefined) {
        conf = Math.min(1, Math.max(0, rec.zhixindu));
        confSource = 'field';
    } else {
        // 兜底：验证模式 0.60 起，推理模式 0.38 起；关键词数微调
        const base = rec.shangjia1 === 1 ? 0.60 : 0.38;
        conf = Math.min(VISUAL.CONF_L_MAX, base + Math.min(rec.guanjianci.length, 5) * 0.02);
        confSource = 'fallback';
    }

    return { weight, weightSource, conf, confSource };
}

/* ---------------- 筛选 ---------------- */

export function defaultFilters() {
    return {
        sewOff: new Set(),        // 关闭的 sew（'_null' 表示 sew 为空的记录）
        agentOff: new Set(),      // 关闭的 fbSid
        includeUnverified: true,  // 含推理模式（shangjia1=0）
        includeDeleted: false,    // 含已删除（shanchu=1）— 默认排除
        includeNonKnowledge: false, // 含非知识类型 — 默认排除
        dateFrom: '',             // ctime >= dateFrom
        dateTo: '',               // ctime <= dateTo（含当天）
        search: '',
    };
}

export function filterRecords(records, f) {
    const kw = f.search.trim().toLowerCase();
    return records.filter(r => {
        if (r.shanchu === 1 && !f.includeDeleted) return false;
        if (r.leixing !== '知识' && !f.includeNonKnowledge) return false;
        if (r.shangjia1 === 0 && !f.includeUnverified) return false;
        const sewKey = r.sew || '_null';
        if (f.sewOff.has(sewKey)) return false;
        if (r.fbSid && f.agentOff.has(r.fbSid)) return false;
        if (f.dateFrom && r.ctime.slice(0, 10) < f.dateFrom) return false;
        if (f.dateTo && r.ctime.slice(0, 10) > f.dateTo) return false;
        if (kw && !(r.mingcheng.toLowerCase().includes(kw) || r.wznr.toLowerCase().includes(kw))) return false;
        return true;
    });
}

/* ---------------- 建图 ---------------- */

/**
 * 过滤后的记录 → 节点/边
 * 边：
 *  - fu 边（父子，实线弧）：子 → 父，仅两端节点都在集合内才保留
 *  - yynr 边（引用，虚线）：引用方 → 被引用方
 * @param {Array} records 过滤后记录
 * @param {{showYynr:boolean}} opts
 */
export function buildGraph(records, opts = {}) {
    const showYynr = opts.showYynr !== false;
    const idSet = new Set(records.map(r => r.rowid));

    const nodes = records.map(r => {
        const m = computeMetrics(r);
        return {
            rowid: r.rowid,
            mingcheng: r.mingcheng || r.zdbh || r.rowid.slice(0, 8),
            wznr: r.wznr,
            sew: r.sew,
            leixing: r.leixing,
            fbSid: r.fbSid,
            fbName: r.fbName,
            guanjianci: r.guanjianci,
            shangjia1: r.shangjia1,
            shanchu: r.shanchu,
            ctime: r.ctime,
            utime: r.utime,
            // 度量
            weight: m.weight,
            weightSource: m.weightSource,
            conf: m.conf,
            confSource: m.confSource,
            childCount: r.zi.length,
            citedCount: r.beiyinyong.length,
            fuIds: r.fu,
            ziIds: r.zi,
            beiyinyongIds: r.beiyinyong,
            yynrRefs: r.yynr,
            // 力导向状态（初始 NaN，布局器赋值）
            x: NaN, y: NaN, vx: 0, vy: 0,
        };
    });

    // 半径归一（log 缩放抗长尾）
    const maxW = Math.max(1, ...nodes.map(n => n.weight));
    for (const n of nodes) {
        const t = Math.log1p(n.weight) / Math.log1p(maxW);
        n.r = VISUAL.R_MIN + (VISUAL.R_MAX - VISUAL.R_MIN) * t;
        n.color = sewColorAtL(n.sew, n.conf);
    }

    // 边
    const links = [];
    for (const n of nodes) {
        for (const pid of n.fuIds) {
            if (pid !== n.rowid && idSet.has(pid)) {
                links.push({ source: n.rowid, target: pid, type: 'fu' });
            }
        }
        if (showYynr) {
            for (const yid of (n.yynrRefs || [])) {
                if (yid !== n.rowid && idSet.has(yid)) {
                    links.push({ source: n.rowid, target: yid, type: 'yynr' });
            }
        }
        }
    }

    return { nodes, links };
}

/* ---------------- 全量分面统计（左侧面板用） ---------------- */

export function buildFacets(records) {
    const sewCounts = new Map();   // sew名(或'') → count
    const agentCounts = new Map(); // fbSid → {name, count}

    for (const r of records) {
        if (r.shanchu === 1) continue;               // 统计口径：默认排除已删除
        if (r.leixing !== '知识') continue;           // 只统计知识记忆
        const sewKey = r.sew || '_null';
        sewCounts.set(sewKey, (sewCounts.get(sewKey) || 0) + 1);
        if (r.fbSid) {
            const cur = agentCounts.get(r.fbSid) || { name: r.fbName, count: 0 };
            cur.count++;
            agentCounts.set(r.fbSid, cur);
        }
    }

    // 图例顺序：12维顺序 + 空值垫底
    const sewList = [
        ...SEW_ORDER.filter(k => sewCounts.has(k)),
        ...(sewCounts.has('_null') ? ['_null'] : []),
    ].map(k => ({
        key: k,
        label: k === '_null' ? '(未设维度)' : k,
        count: sewCounts.get(k) || 0,
    }));

    const agentList = [...agentCounts.entries()]
        .map(([sid, v]) => ({ sid, name: v.name, count: v.count }))
        .sort((a, b) => b.count - a.count);

    return { sewList, agentList };
}

/* ---------------- HAP 跳转链接 ---------------- */

export function hapRowLink(rowid) {
    return `${CONFIG.HAP_ROW_URL}/${CONFIG.WORKSHEET_ID}/row/${rowid}`;
}
