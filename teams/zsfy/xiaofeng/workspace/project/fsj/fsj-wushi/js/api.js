/**
 * 五事系统 · API 层
 * 读：Node 代理 mingdao-proxy（https://100000whys.cn/mingdao，快、零 DB 日志）→ 直连 HAP 兜底
 * 写/删：hap-proxy /obj（v2 editRow/addRow/deleteRow）——不走 /mingdao，因为该代理 editRow/addRow
 *        会强制追加 fbsj=当前时间并覆盖显式值（2026-09-04 实测），会污染五事的事件时间语义
 */
import { FIELD_IDS, QUANXIAN_BY_KEY, CURRENT_ALIASES } from './field-ids.js';

const API_BASE = 'https://100000whys.cn/obj';
const M_PROXY = 'https://100000whys.cn/mingdao';
const M_GETROWS = 'https://api.mingdao.com/v2/open/worksheet/getFilterRows';
const M_APP_KEY = 'c156d7e78368cbc1';
const M_SIGN = 'NmM2NGE0ZTNlN2Y3NjU3ODY5MzMzOTk1NzBjMmMwMzNkNmE5NDU2MWZiYTg4ZWViNDk3MGE3MzU5MjcwNDU2MQ==';

/** Node 代理 mingdao-proxy：直接返回明道云原始 JSON（无包裹，密钥服务端注入，~100-300ms） */
async function callMingdao(url, body) {
    const res = await fetch(M_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, input: body })
    });
    if (!res.ok) throw new Error('Node 代理 ' + res.status);
    return res.json();
}

/** 直连 HAP 兜底（2026-09-04 实测：v2 open API 的 filter 有效、CORS 放行浏览器直连） */
async function callDirect(body) {
    const res = await fetch(M_GETROWS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ appKey: M_APP_KEY, sign: M_SIGN }, body))
    });
    if (!res.ok) throw new Error('直连 HAP ' + res.status);
    return res.json();
}

/** 查询通道：Node 代理（快）→ 直连 HAP 兜底。1MB 超限也交给兜底（直连无限制），不再上抛降页 */
async function getRowsViaChannels(body) {
    try {
        return await callMingdao(M_GETROWS, body);
    } catch (e) {
        console.warn('[api] Node 代理失败，切换直连 HAP：', e.message);
        return await callDirect(body);
    }
}

/** 权限多选值归一 → [{sid: optionKey, name: label}]；兼容数组 / JSON 串 / 逗号分隔 / 显示值 */
function normalizeQuanxian(v) {
    if (!v) return [];
    let tokens;
    if (Array.isArray(v)) tokens = v;
    else if (typeof v === 'string') {
        const s = v.trim();
        if (!s) return [];
        try {
            const p = JSON.parse(s);
            tokens = Array.isArray(p) ? p : [s];
        } catch (e) { tokens = s.split(','); }
    } else return [];
    return tokens.map(t => {
        if (t && typeof t === 'object') return { sid: t.sid || t.key || '', name: t.name || t.value || '' };
        const s = String(t);
        if (QUANXIAN_BY_KEY[s]) return { sid: s, name: QUANXIAN_BY_KEY[s].label };
        const byLabel = Object.values(QUANXIAN_BY_KEY).find(o => o.label === s);
        return byLabel ? { sid: byLabel.key, name: byLabel.label } : { sid: s, name: s };
    }).filter(x => x.sid);
}

/** 别名 key → controlId key + Relation 字段 JSON 解析（对齐 proxy normalizeRow） */
function normalizeRow(raw) {
    if (!raw) return raw;
    const out = { rowid: raw.rowid, ctime: raw.ctime, utime: raw.utime };
    for (const [alias, cid] of Object.entries(FIELD_IDS)) {
        // 兼容三种返回键风格：mingdao 代理原样透传（controlId 键）/ 当前英文别名键 / 旧拼音别名键
        let v = raw[alias];
        if (v === undefined || v === null) v = raw[CURRENT_ALIASES[alias] || ''];
        if (v === undefined || v === null) v = raw[cid];
        if (v === undefined || v === null) continue;
        if (alias === 'fu' || alias === 'fabuzhe' || alias === 'fuyuan' || alias === 'ptyh' || alias === 'yynr' || alias === 'kjzz' || alias === 'wqyy') {
            // Relation：JSON 字符串 / 数组 → [{sid, name}]
            if (typeof v === 'string') {
                try { const a = JSON.parse(v); out[cid] = Array.isArray(a) ? a : []; }
                catch (e) { out[cid] = []; }
            } else if (Array.isArray(v)) out[cid] = v;
            else out[cid] = [];
        } else if (alias === 'quanxian') {
            // 权限多选：数组 / JSON 串 / 逗号分隔 → [{sid: optionKey, name: label}]
            out[cid] = normalizeQuanxian(v);
        } else if (alias === 'sew') {
            // Dropdown：文本原样 / 数组归一 [{sid, name}]
            if (typeof v === 'string') out[cid] = v;
            else if (Array.isArray(v)) out[cid] = v.map(it =>
                typeof it === 'object' && it !== null
                    ? { sid: it.sid || it.key, name: it.name || it.value } : it);
            else out[cid] = '';
        } else {
            out[cid] = v;
        }
    }
    return out;
}

/**
 * 拉某 agent 的全部 12 维数据（服务端按 fabuzhe 过滤 + 自适应分页）
 * 页大小 100 起，响应超限时自动减半重拉（最小 10）——保留兜底，代理正常时不会触发
 */
export async function fetchAgentRows(fabuzheRowid, onProgress) {
    // 列表只取树渲染 + 详情面板所需的小字段；wznr/mdnr/guanjianci 等大文本在打开详情时按需补拉
    // （椰果名下 3400+ 条，全字段拉取要几十秒——2026-09-05 实测）
    const LIST_CONTROLS = [
        FIELD_IDS.mingcheng, FIELD_IDS.sew, FIELD_IDS.fu, FIELD_IDS.zi,
        FIELD_IDS.quanzhong, FIELD_IDS.zhixindu, FIELD_IDS.wancheng,
        FIELD_IDS.fbsj, FIELD_IDS.miaoshu, FIELD_IDS.quanxian, FIELD_IDS.kjzz,
        FIELD_IDS.yynr, FIELD_IDS.leixing, FIELD_IDS.ptyh,
        FIELD_IDS.wqyy
    ];
    const base = {
        worksheetId: '6a03ceaa7e29abcb297cbdfc',   // 内容元数据表 UUID（原别名 shangpin，抗表改名）
        listType: 0,
        controls: LIST_CONTROLS,
        filters: [
            { controlId: FIELD_IDS.fabuzhe, dataType: 29, spliceType: 1, filterType: 24, value: fabuzheRowid },
            // 东城 2026-09-05：只取 leixing=知识（12 维记忆），服务端正向排除聊天消息等非知识类型
            // （dropdown"等于"实测可靠；"不等于"有 bug 不可用）
            { controlId: FIELD_IDS.leixing, dataType: 11, spliceType: 1, filterType: 1, value: '55c1d467-927b-4af8-98a9-d934554ac3bf' }
        ]
    };    let pageSize = 200;
    let all = [];
    let total = 0;
    let rawCount = 0;        // 服务端返回的原始条数（分页推进依据，不受客户端过滤影响）
    let emptyRetries = 0;
    while (true) {
        const pageIndex = Math.floor(rawCount / pageSize) + 1;
        let parsed;
        try {
            parsed = await getRowsViaChannels(Object.assign({}, base, { pageSize, pageIndex }));
            if (!parsed.success) throw new Error('HAP 查询失败');
        } catch (e) {
            if (/too large/i.test((e.message || '') + ' ' + (e.raw || '')) && pageSize > 10) {
                pageSize = Math.max(10, Math.floor(pageSize / 2));
                all = [];               // 页大小变了 → 从头对齐分页
                rawCount = 0;           // ⭐ 原始计数也必须清零（否则 pageIndex 跳页 + 提前终止，整块数据丢失——2026-09-05 椰果 3594 条树散架的根因）
                if (onProgress) onProgress({ fetched: 0, total, note: `单页过大，页大小降至 ${pageSize} 重拉` });
                continue;
            }
            throw e;
        }
        total = (parsed.data && parsed.data.total) || 0;
        const rows = (parsed.data && parsed.data.rows) || [];
        rawCount += rows.length;
        all.push(...rows.map(normalizeRow));
        emptyRetries = 0;
        if (onProgress) onProgress({ fetched: rawCount, total });
        if (rawCount >= total || pageIndex >= 100) break;
        // 空页防呆：rawCount < total 却收到空页 → 重试同一页（最多 2 次），防服务端抖动导致静默缺页
        if (rows.length === 0) {
            emptyRetries++;
            if (emptyRetries > 2) break;
        }
    }
    return all;
}

// ===== 写/删走 hap-proxy（无 filter 需求，直连 v2）=====

/**
 * 全字段关键词搜索 shangpin（跨 agent，body keyWords 实测可用，2026-09-03）
 * 返回 { rows: [{rowid, mingcheng, sew, fabuzhe}], total }，自适应分页（搜索结果可能上千）
 */
export async function searchByKeyword(keyword, pageSize = 20) {
    const rows = [];
    let pageIndex = 1;
    let total = 0;
    while (true) {
        const parsed = await getRowsViaChannels({
            worksheetId: '6a03ceaa7e29abcb297cbdfc',
            pageSize, pageIndex, listType: 0,
            keyWords: keyword, getSystemControl: false, controls: []
        });
        if (!parsed.success) throw new Error('搜索失败: ' + JSON.stringify(parsed).slice(0, 120));
        total = (parsed.data && parsed.data.total) || 0;
        const page = (parsed.data && parsed.data.rows) || [];
        page.forEach(r => {
            rows.push({
                rowid: r.rowid,
                mingcheng: r.title || r.mingcheng || '',
                sew: r.sew || '',
                fabuzhe: (() => { try { const a = typeof r.fabuzhe === 'string' ? JSON.parse(r.fabuzhe) : r.fabuzhe; return Array.isArray(a) && a[0] ? (a[0].name || a[0].sid) : ''; } catch (e) { return ''; } })()
            });
        });
        if (rows.length >= total || page.length === 0 || pageIndex >= 50) break;
        pageIndex++;
    }
    return { rows, total };
}

/**
 * 可见组织（kjzz）可选列表：群组表中 zzyh（组织用户）包含当前 agent 的组织（2026-09-06 东城拍板）
 * —— fabuzhe 是群主/创始人（可为空、且未必是发布者），发布资格看成员身份不看创建者
 * 经查询通道（Node 代理 → 直连兜底）服务端过滤，只取 rowid + mingcheng
 */
export async function fetchOrgs(fabuzheRowid) {
    const base = {
        worksheetId: '69f549c69f1956fc0e171aa6',   // 群组表
        listType: 0,
        controls: ['rowid', 'mingcheng'],
        filters: [{ controlId: 'zzyh', dataType: 29, spliceType: 1, filterType: 24, value: fabuzheRowid }]
    };
    const rows = [];
    let pageSize = 200;
    let total = 0;
    while (true) {
        const pageIndex = Math.floor(rows.length / pageSize) + 1;
        const parsed = await getRowsViaChannels(Object.assign({}, base, { pageSize, pageIndex }));
        if (!parsed.success) throw new Error('组织查询失败: ' + JSON.stringify(parsed).slice(0, 120));
        total = (parsed.data && parsed.data.total) || 0;
        const page = (parsed.data && parsed.data.rows) || [];
        page.forEach(r => rows.push({ rowid: r.rowid, mingcheng: r.mingcheng || '(未命名组织)' }));
        if (rows.length >= total || page.length === 0 || pageIndex >= 50) break;
    }
    return rows;
}

async function postJson(path, body) {
    const res = await fetch(API_BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* 非 JSON 响应体 */ }
    if (!res.ok) {
        // 500 等错误也把服务端 error_msg 带出来（之前只抛 HTTP 500，真实原因全被吞）
        const detail = data ? JSON.stringify(data).slice(0, 200) : '';
        throw new Error('HTTP ' + res.status + (detail ? '：' + detail : ''));
    }
    return data;
}

/** 新增记录 */
export async function addRecord(controls) {
    return postJson('/api/record-add', { controls });
}

/** fabuzhe（成员表 rowid）→ 所属商家 rowid（2026-09-06 拍板：创建 shangpin 必带 shangjia2）。
 *  取法：成员表 69b0077358322d512e60bad0 记录的 shangjia 关联字段（69f55cde5d4f084515ced817）首个元素 sid。
 *  shangjia 为空 → 返回 ''，调用方跳过该字段（HAP 工作流兜底）。按 fabuzhe 缓存。 */
const shangjia2Cache = {};
export async function getShangjia2(fabuzheRowid) {
    if (!fabuzheRowid) return '';
    if (shangjia2Cache[fabuzheRowid] !== undefined) return shangjia2Cache[fabuzheRowid];
    let out = '';
    try {
        const rec = await getRowById('69b0077358322d512e60bad0', fabuzheRowid);
        let raw = rec && rec['69f55cde5d4f084515ced817'];
        if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = []; } }
        if (Array.isArray(raw) && raw[0] && raw[0].sid) out = raw[0].sid;
    } catch (e) { console.warn('[api] shangjia2 解析失败，跳过：', e.message); }
    shangjia2Cache[fabuzheRowid] = out;
    return out;
}

/** 查单条完整记录（详情懒加载：列表不取 wznr 等大字段，打开详情时补齐）；返回已归一化的 rec */
/**
 * 通用查单条（任意 worksheetId）— 委派功能按任意表查群组/用户用
 */
export async function getRowById(worksheetId, rowId) {
    const body = { worksheetId, rowId, getSystemControl: 'false' };
    let parsed;
    try {
        parsed = await callMingdao('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost', body);
    } catch (e) {
        const res = await fetch('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ appKey: M_APP_KEY, sign: M_SIGN }, body))
        });
        if (!res.ok) throw new Error('getRowById 直连 ' + res.status);
        parsed = await res.json();
    }
    if (!parsed || !parsed.success) throw new Error('查询失败: ' + JSON.stringify(parsed).slice(0, 120));
    return parsed.data || null;
}

export async function getRecordDetail(rowId) {
    const body = { worksheetId: '6a03ceaa7e29abcb297cbdfc', rowId, getSystemControl: 'false' };
    let parsed;
    try {
        parsed = await callMingdao('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost', body);
    } catch (e) {
        console.warn('[api] 详情代理失败，直连兜底：', e.message);
        const res = await fetch('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ appKey: M_APP_KEY, sign: M_SIGN }, body))
        });
        if (!res.ok) throw new Error('详情直连 ' + res.status);
        parsed = await res.json();
    }
    if (!parsed || !parsed.success) throw new Error('详情拉取失败: ' + JSON.stringify(parsed).slice(0, 120));
    return normalizeRow(parsed.data);
}

/** 修改记录（500/502/504 自动重试一次：HAP 行刚建完工作流可能在跑，瞬时冲突；写幂等，安全） */
export async function updateRecord(rowId, controls) {
    try {
        return await postJson('/api/record-update', { rowId, controls });
    } catch (e) {
        if (/HTTP 5(00|02|04)/.test(e.message)) {
            await new Promise(r => setTimeout(r, 800));
            return postJson('/api/record-update', { rowId, controls });
        }
        throw e;
    }
}

/** 物理删除（不可恢复） */
export async function deleteRecord(rowId) {
    return postJson('/api/record-delete', { rowId });
}
