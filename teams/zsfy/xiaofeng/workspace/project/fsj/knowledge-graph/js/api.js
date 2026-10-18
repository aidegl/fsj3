/**
 * api.js — 明道云 v2 开放 API 封装
 *
 * 职责：
 *  1. 全量拉取（分页 + 并发，带进度回调）
 *  2. 增量拉取（按 utime 倒序翻页，遇到 <= lastSyncTime 停止）
 *  3. 原始行 → 精简记录（只留图谱需要的字段，节省 IndexedDB 空间）
 *
 * 关联字段（fu/zi/yynr/beiyinyci…）在 v2 返回里是 JSON 字符串：
 *  '[{"sid":"...","name":"...","link":"..."}]'  → 解析后取 sid
 */

import { CONFIG } from './config.js';

/* ---------------- 工具 ---------------- */

/** 解析关联字段 → rowid 数组（空/异常返回 []） */
function relSids(v) {
    if (!v || v === '[]' || v === '') return [];
    try {
        const arr = JSON.parse(v);
        return Array.isArray(arr) ? arr.map(x => x.sid).filter(Boolean) : [];
    } catch { return []; }
}

/** 解析 fabuzhe → {sid, name} */
function relFirst(v) {
    if (!v || v === '[]' || v === '') return null;
    try {
        const arr = JSON.parse(v);
        return Array.isArray(arr) && arr.length ? { sid: arr[0].sid, name: arr[0].name || '未知' } : null;
    } catch { return null; }
}

/** 数值字段（空串→null） */
function numOrNull(v) {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/**
 * 原始行 → 精简记录。
 * 保留字段最小集：身份 + 关系 + 度量 + 展示。
 */
export function pickRow(row) {
    const fb = relFirst(row.fabuzhe);
    return {
        rowid: row.rowid,
        zdbh: row.zdbh || '',
        mingcheng: row.mingcheng || '',
        wznr: (row.wznr || '').slice(0, 2000),   // 截断，防超大正文拖慢存储
        sew: row.sew || null,
        leixing: row.leixing || '',
        fbSid: fb ? fb.sid : null,
        fbName: fb ? fb.name : '未知',
        fu: relSids(row.fu),
        zi: relSids(row.zi),
        zisuoyou: relSids(row.zisuoyou),
        yynr: relSids(row.yynr),
        beiyinyong: relSids(row.beiyinyong),
        guanjianci: (() => {
            if (!row.guanjianci || row.guanjianci === '[]') return [];
            try {
                const arr = JSON.parse(row.guanjianci);
                return Array.isArray(arr) ? arr.map(x => x.name).filter(Boolean) : [];
            } catch { return []; }
        })(),
        shangjia1: row.shangjia1 === '1' ? 1 : 0,
        shanchu: row.shanchu === '1' ? 1 : 0,
        quanzhong: numOrNull(row.quanzhong),
        zhixindu: numOrNull(row.zhixindu),
        ctime: row.ctime || '',
        utime: row.utime || '',
    };
}

/* ---------------- 请求 ---------------- */

async function postPage(pageIndex, sortAsc = false) {
    const body = {
        appKey: CONFIG.APP_KEY,
        sign: CONFIG.SIGN,
        worksheetId: CONFIG.WORKSHEET_ID,
        pageSize: CONFIG.PAGE_SIZE,
        pageIndex,
        sortId: 'utime',
        sortAsc,
    };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONFIG.REQUEST_TIMEOUT);
    try {
        const res = await fetch(CONFIG.API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.error_code !== 1) {
            throw new Error(`API ${json.error_code}: ${json.error_msg || '未知错误'}`);
        }
        return json.data; // { total, rows }
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 全量拉取。并发 CONCURRENCY 路分页。
 * @param {function} onProgress (done, total)
 * @returns {Promise<Array>} 精简记录数组
 */
export async function fetchAll(onProgress) {
    const first = await postPage(1);
    const total = first.total;
    const pageCount = Math.ceil(total / CONFIG.PAGE_SIZE);
    const pages = new Array(pageCount);
    pages[0] = first.rows;

    let done = first.rows.length;
    onProgress && onProgress(done, total);

    // 页号 2..pageCount，并发池
    const queue = [];
    for (let p = 2; p <= pageCount; p++) queue.push(p);

    let cursor = 0;
    async function worker() {
        while (cursor < queue.length) {
            const p = queue[cursor++];
            let ok = false;
            for (let retry = 0; retry < 3 && !ok; retry++) {
                try {
                    const d = await postPage(p);
                    pages[p - 1] = d.rows;
                    done += d.rows.length;
                    onProgress && onProgress(done, total);
                    ok = true;
                } catch (e) {
                    if (retry === 2) throw e;
                    await new Promise(r => setTimeout(r, 800 * (retry + 1)));
                }
            }
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(CONFIG.CONCURRENCY, queue.length) }, worker)
    );

    const rows = pages.flat().filter(Boolean);
    return rows.map(pickRow);
}

/**
 * 增量拉取：按 utime 倒序翻页，遇到 utime <= lastSyncTime 即停。
 * 不带 shanchu 过滤 — 逻辑删除也会更新 utime，可捕获删除动作。
 * @param {string} lastSyncTime 'YYYY-MM-DD HH:mm:ss'
 * @returns {Promise<Array>} 有变化的精简记录（含新增/修改/删除标记）
 */
export async function fetchIncremental(lastSyncTime) {
    const out = [];
    let pageIndex = 1;
    // 安全上限：增量一般 1-2 页，超过 200 页说明 lastSyncTime 异常，直接转全量
    for (; pageIndex <= 200; pageIndex++) {
        const d = await postPage(pageIndex, false);
        if (!d.rows.length) break;
        let older = false;
        for (const r of d.rows) {
            if (r.utime && r.utime <= lastSyncTime) { older = true; break; }
        }
        // 本页整页保留（含边界记录，重复拉取幂等，合并时覆盖）
        const keep = d.rows.filter(r => r.utime > lastSyncTime);
        out.push(...keep.map(pickRow));
        // 页内已出现 <= lastSyncTime 的记录 → 增量结束
        if (older || d.rows.length < CONFIG.PAGE_SIZE) break;
    }
    return out;
}

/** 连通性 + 权限快速自检（拉 1 条） */
export async function ping() {
    const d = await postPage(1);
    return d.total;
}
