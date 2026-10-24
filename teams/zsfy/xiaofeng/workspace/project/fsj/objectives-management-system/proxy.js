#!/usr/bin/env node
/**
 * objectives-management-system proxy.js
 * 端口 3014 — 把浏览器请求转发到 HAP v2 open API
 * 凭证：复用 appKey + sign（与 fsj-web-doc 同对）
 *
 * ⚠️ mingdao v2 open API 的 filter 失效（不论什么 filter 都返回全表），
 *    所以 /api/all-targets 拉全表，前端按 fuyuan + zi 客户端 filter。
 *
 * 端点：
 *   GET  /api/all-targets       拉全表 shangpin（fuyuan+zi 客户端过滤）
 *   POST /api/record-add        新增
 *   POST /api/record-update     修改
 *   POST /api/record-delete     物理删除（HAP deleteRow，不可恢复）
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// ===== HAP 凭证 =====
const APPKEY = 'c156d7e78368cbc1';
const SIGN = 'NmM2NGE0ZTNlN2Y3NjU3ODY5MzMzOTk1NzBjMmMwMzNkNmE5NDU2MWZiYTg4ZWViNDk3MGE3MzU5MjcwNDU2MQ==';
const WORKSHEET_ID = '6a03ceaa7e29abcb297cbdfc'; // shangpin
const HAP_BASE = 'https://api.mingdao.com/v2/open/worksheet';

const PORT = 3014;

// ===== HAP v3 令牌（个人级，启动时从 hap-cli 配置读取）=====
function loadV3Token() {
    try {
        const os = require('os');
        const pathMod = require('path');
        const fs = require('fs');
        const cfgPath = pathMod.join(os.homedir(), '.hap-cli', 'config.json');
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
        const token = cfg && cfg.profiles && cfg.profiles.prod && cfg.profiles.prod.auth_token;
        if (token && token.length > 20) {
            console.log('[proxy] v3 token loaded from hap-cli (' + token.length + ' chars)');
            return token;
        }
        console.warn('[proxy] WARN: v3 token not found, /api/targets disabled');
        return null;
    } catch (e) {
        console.warn('[proxy] WARN: cannot read hap-cli config:', e.message);
        return null;
    }
}
const V3_TOKEN = loadV3Token();
const HAP_V3_BASE = 'https://api.mingdao.com/v3/app/worksheets';

/** v3 端点调用（md_pss_id 个人令牌鉴权，filter 有效）*/
function hapPostV3(apiPath, body) {
    return new Promise((resolve, reject) => {
        if (!V3_TOKEN) return reject(new Error('v3 token unavailable'));
        const url = new URL(HAP_V3_BASE + apiPath);
        const data = JSON.stringify(body);
        const req = https.request({
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'md_pss_id ' + V3_TOKEN,
                'Content-Length': Buffer.byteLength(data)
            }
        }, (res) => {
            let chunks = '';
            res.on('data', (c) => chunks += c);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(chunks));
                } catch (e) {
                    reject(new Error('v3 JSON parse failed: ' + chunks.slice(0, 200)));
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// ===== HTTP 工具 =====
function hapPost(path, body) {
    return new Promise((resolve, reject) => {
        const url = new URL(HAP_BASE + path);
        const data = JSON.stringify(body);
        const req = https.request({
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        }, (res) => {
            let chunks = '';
            res.on('data', (c) => chunks += c);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(chunks));
                } catch (e) {
                    reject(new Error(`JSON parse failed: ${chunks.slice(0, 200)}`));
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let chunks = '';
        req.on('data', (c) => chunks += c);
        req.on('end', () => {
            try {
                resolve(JSON.parse(chunks || '{}'));
            } catch (e) {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}

function sendJson(res, status, payload) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(payload));
}

// ===== 业务端点 =====

/**
 * GET /api/targets?root=<tianRootRowid>
 * v3 服务端按 fuyuan 过滤，只拉该天根数据（快，几 KB）
 */
/**
 * GET /api/users?shangjia=<rowid>
 * 查用户表（69b0077358322d512e60bad0），按 shangjia Relation 包含指定 rowid 过滤
 * 返回 [{rowid, nickname, avatar}]（v2 filter 失效 -> 客户端过滤）
 */
async function handleUsers(req, res, url) {
    const t0 = Date.now();
    const shangjiaFilter = url.searchParams.get('shangjia') || '';
    try {
        const WS_USER = '69b0077358322d512e60bad0';
        const allRows = [];
        let pageIndex = 1;
        let total = 0;
        while (true) {
            const resp = await hapPost('/getFilterRows', {
                appKey: APPKEY, sign: SIGN,
                worksheetId: WS_USER,
                pageSize: 200, pageIndex,
                getSystemControl: false, controls: [], filters: []
            });
            if (!resp.success) return sendJson(res, 500, { error: 'HAP failed', detail: resp });
            total = resp.data?.total || 0;
            const rows = resp.data?.rows || [];
            allRows.push(...rows);
            if (allRows.length >= total || rows.length === 0 || pageIndex >= 20) break;
            pageIndex++;
        }
        // 客户端过滤：shangjia JSON 数组里包含目标 rowid
        const filtered = allRows.filter(r => {
            if (!shangjiaFilter) return true;
            const sj = r.shangjia;
            if (typeof sj !== 'string') return false;
            try {
                const parsed = JSON.parse(sj);
                return Array.isArray(parsed) && parsed.some(x => x && x.sid === shangjiaFilter);
            } catch (e) { return false; }
        }).map(r => ({
            rowid: r.rowid,
            nickname: r.nickname || '',
            ctime: r.ctime || '',
            // ⭐ avatar 是 JSON 数组，完整 URL = thumbnail_path + thumbnail_name（或 file_path + file_name）
            avatar: (function() {
                const av = r.avatar;
                if (typeof av === 'string' && av) {
                    try {
                        const parsed = JSON.parse(av);
                        if (Array.isArray(parsed) && parsed[0]) {
                            const f = parsed[0];
                            // 拼接完整 URL
                            if (f.thumbnail_path && f.thumbnail_name) return f.thumbnail_path + f.thumbnail_name;
                            if (f.file_path && f.file_name) return f.file_path + f.file_name;
                            if (f.url) return f.url;
                        }
                    } catch (e) {}
                }
                return '';
            })()
        }));
        // ⭐ 按 ctime 正序（创建时间从早到晚）
        filtered.sort((a, b) => (a.ctime || '').localeCompare(b.ctime || ''));
        console.log('[proxy /api/users] shangjia=' + shangjiaFilter.slice(0,8) + '.. matched ' + filtered.length + '/' + allRows.length + ' in ' + (Date.now()-t0) + 'ms');
        return sendJson(res, 200, { count: filtered.length, users: filtered });
    } catch (e) {
        return sendJson(res, 500, { error: e.message });
    }
}

async function handleTargetsByRoot(req, res, url) {
    // ⚠️ 2026-08-19：v3 端点（hap-cli list+get）频繁 500/超时/无输出
    // 改回 v2 拉全表（appKey+sign 凭证稳定）+ 客户端按 fuyuan 过滤
    const t0 = Date.now();
    const root = url.searchParams.get('root');
    if (!root) return sendJson(res, 400, { error: 'root param required' });
    try {
        const FUYUAN_FIELD = '6a265b9c611b4ca5b182d854';
        const PAGE_SIZE = 500;
        let pageIndex = 1;
        const allRows = [];
        let total = 0;
        while (true) {
            const resp = await hapPost('/getFilterRows', {
                appKey: APPKEY,
                sign: SIGN,
                worksheetId: WORKSHEET_ID,
                pageSize: PAGE_SIZE,
                pageIndex,
                getSystemControl: false,
                controls: [],
                filters: []
            });
            if (!resp.success) return sendJson(res, 500, { error: 'HAP v2 failed', detail: resp });
            total = resp.data?.total || 0;
            const rows = resp.data?.rows || [];
            allRows.push(...rows.map(normalizeRow));
            if (allRows.length >= total || rows.length === 0 || pageIndex >= 50) break;
            pageIndex++;
        }
        // 客户端按 fuyuan 过滤到目标天根
        const filtered = allRows.filter(r => {
            const v = r[FUYUAN_FIELD];
            if (Array.isArray(v) && v.length > 0) return v[0].sid === root;
            if (typeof v === 'object' && v && v.sid) return v.sid === root;
            return false;
        });
        console.log('[proxy /api/targets] root=' + root.slice(0,8) + '.. filtered ' + filtered.length + '/' + allRows.length + ' in ' + (Date.now() - t0) + 'ms (v2-full+client-filter)');
        return sendJson(res, 200, { total: filtered.length, count: filtered.length, rows: filtered, elapsed: Date.now() - t0, source: 'v2-full+filter' });
    } catch (e) {
        return sendJson(res, 500, { error: e.message });
    }
}

/**
 * GET /api/all-targets
 * NDJSON 流式：每页写一行进度 {"progress":{page,fetched,total}}，最后一行 {"done":true,rows:[...]}
 * 响应头 X-Accel-Buffering: no → Nginx 关闭缓冲，进度实时到达前端（2026-09-03）
 */
async function handleAllTargets(req, res) {
    res.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'X-Accel-Buffering': 'no',
        'Cache-Control': 'no-cache'
    });
    const send = (obj) => { try { res.write(JSON.stringify(obj) + '\n'); } catch (e) {} };
    try {
        const PAGE_SIZE = 500;
        let pageIndex = 1;
        let allRows = [];
        let total = 0;

        while (true) {
            const resp = await hapPost('/getFilterRows', {
                appKey: APPKEY,
                sign: SIGN,
                worksheetId: WORKSHEET_ID,
                pageSize: PAGE_SIZE,
                pageIndex,
                getSystemControl: false,
                controls: [],
                filters: []
            });
            if (!resp.success) {
                send({ error: 'HAP error', detail: resp });
                return res.end();
            }
            total = resp.data?.total || 0;
            const rows = resp.data?.rows || [];
            allRows = allRows.concat(rows.map(normalizeRow));
            send({ progress: { page: pageIndex, fetched: allRows.length, total } });
            if (allRows.length >= total || rows.length === 0) break;
            pageIndex++;
            if (pageIndex > 100) break; // 安全：防止无限循环
        }

        send({ done: true, total, count: allRows.length, rows: allRows });
        res.end();
    } catch (e) {
        send({ error: e.message });
        res.end();
    }
}

// ===== 字段别名 ↔ controlId 映射（与前端 field-ids.js 对应）=====
const FIELD_ALIASES = {
    mingcheng: '6a03ceaa7e29abcb297cbdfd',
    wznr: '6a223553a225020849c93059',
    sew: '6a376a7b9513239477b93e31',
    fu: '6a2cf9d5f06514e8747a64f0',
    fuyuan: '6a265b9c611b4ca5b182d854',
    zi: '6a265b9c611b4ca5b182d855',
    zisuoyou: '6a2cf9d5f06514e8747a64f1',
    fabuzhe: '6a266179f24b2a6e0a66e1a5',
    fbsj: '6a369543012f3a4e6a11c96f',
    sjwcrq: '6a83599c1e7476f66a2e7bce',
    shanchu: '6a2a2ecc837e93d36d79a621',
    wancheng: '6a989704df6a1f4284e65f0b',
    quanzhong: '6a051fd0f255b2b51491a981',
    zhixindu: '6a410730405fcd4e19424918',
    ptyh: '6a11531da47867dee8cda8cb',
    ptrq: '6a11522486012aa0b85de2dc',
    leixing: '6a0cf5be833ba98f954f93b6',
    shangjia2: '6a045ceb0507e352629dd195'   // 所属商家（2026-09-06 拍板：创建必带）
};

// shangjia2 解析：fabuzhe（成员表 rowid）→ 成员记录 shangjia 关联字段首元素 sid（2026-09-06 拍板）
const WS_USER_TABLE = '69b0077358322d512e60bad0';
const USER_SHANGJIA_FIELD = '69f55cde5d4f084515ced817';
const shangjia2Cache = {};
async function resolveShangjia2(fabuzheRowid) {
    if (!fabuzheRowid) return '';
    if (shangjia2Cache[fabuzheRowid] !== undefined) return shangjia2Cache[fabuzheRowid];
    let out = '';
    try {
        const resp = await hapPost('/getRowByIdPost', {
            appKey: APPKEY, sign: SIGN, worksheetId: WS_USER_TABLE, rowId: fabuzheRowid, getSystemControl: false
        });
        let raw = resp && resp.success && resp.data && resp.data[USER_SHANGJIA_FIELD];
        if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = []; } }
        if (Array.isArray(raw) && raw[0] && raw[0].sid) out = raw[0].sid;
    } catch (e) { console.warn('[proxy] shangjia2 解析失败，跳过：', e.message); }
    shangjia2Cache[fabuzheRowid] = out;
    return out;
}

/**
 * 把 mingdao 的原始 row 转换成"前端友好"格式：
 *  - key 改用 controlId（前端用 FIELD_IDS.xxx 访问）
 *  - fu/fuyuan/fabuzhe 等 Relation 字段从 JSON 字符串 → {sid, name} 对象
 *  - 空字符串统一为 ''
 */
// 2026-10-24 HAP 别名英文化：响应键=当前英文别名，raw[拼音] 失效——按此表兜底解析
const CURRENT_ALIASES = {
    mingcheng: 'title', wznr: 'content', sew: 'dimension', fu: 'parent',
    fuyuan: 'root', zi: 'child', zisuoyou: 'child_all', fabuzhe: 'publisher',
    fbsj: 'published_at', sjwcrq: 'completed_at', shanchu: 'is_deleted',
    wancheng: 'is_completed', quanzhong: 'weight', ptyh: 'participant',
    ptrq: 'group_expire_at', leixing: 'kind', shangjia2: 'org',
};

function normalizeRow(raw) {
    if (!raw) return raw;
    const out = { rowid: raw.rowid || raw.rowId || raw.rowID };
    // 拷贝系统字段
    if (raw._id) out._id = raw._id;
    if (raw.ctime) out.ctime = raw.ctime;
    if (raw.utime) out.utime = raw.utime;

    for (const [alias, cid] of Object.entries(FIELD_ALIASES)) {
        let v = raw[alias];
        if (v === undefined || v === null) v = raw[CURRENT_ALIASES[alias] || ''];
        if (v === undefined || v === null) continue;
        // Relation 字段：JSON 字符串解析（fu/fuyuan/fabuzhe/ptyh/zi 等）
        // ⚠️ Dropdown 字段（sew/leixing）单独处理：v2 返回纯文本字符串（如 "知识"），不能 JSON.parse！
        if (['sew', 'leixing'].includes(alias)) {
            if (typeof v === 'string') {
                // v2 显示文本（"7目标"/"知识"）原样保留
                out[cid] = v;
            } else if (Array.isArray(v)) {
                // v3 格式 [{key,value}] 或 [{sid,name}] 归一为 [{sid,name}]
                out[cid] = v.map(item => {
                    if (typeof item === 'object' && item !== null) {
                        if (item.sid) return { sid: item.sid, name: item.name };
                        if (item.key) return { sid: item.key, name: item.value };
                    }
                    return item;
                });
            } else {
                out[cid] = '';
            }
        } else if (['fu', 'fuyuan', 'fabuzhe', 'ptyh', 'zi', 'zisuoyou', 'yynr', 'beiyinyong'].includes(alias)) {
            if (typeof v === 'string') {
                try {
                    const parsed = JSON.parse(v);
                    if (Array.isArray(parsed)) {
                        // 数组 → 保留为数组（zi 是子 rowid 列表，需要长度判断）
                        out[cid] = parsed.map(item => {
                            if (typeof item === 'object' && item !== null && item.sid) {
                                return { sid: item.sid, name: item.name };
                            }
                            return item;
                        });
                    } else {
                        out[cid] = null;
                    }
                } catch (e) {
                    out[cid] = [];
                }
            } else if (Array.isArray(v)) {
                // 数组：v2 格式 [{sid, name}] / v3 格式 [{key, value}] 都归一为 [{sid, name}]
                out[cid] = v.map(item => {
                    if (typeof item === 'object' && item !== null) {
                        if (item.sid) return { sid: item.sid, name: item.name };
                        if (item.key) return { sid: item.key, name: item.value };
                    }
                    return item;
                });
            } else {
                out[cid] = [];
            }
        } else {
            // 其他字段：字符串原样转
            out[cid] = v === null ? '' : v;
        }
    }
    return out;
}

/**
 * POST /api/record-add
 * body: { controls: [{controlId, value, valueType?}, ...] }
 */
async function handleAdd(req, res) {
    try {
        const body = await readJsonBody(req);
        const controls = body.controls || [];
        // 2026-09-06 拍板：创建 shangpin 必带 shangjia2（前端没带时服务端按 fabuzhe 解析补上；解析不到跳过，HAP 工作流兜底）
        if (!controls.some(c => c.controlId === FIELD_ALIASES.shangjia2)) {
            const fbz = controls.find(c => c.controlId === FIELD_ALIASES.fabuzhe);
            const sj2 = await resolveShangjia2(fbz && fbz.value);
            if (sj2) controls.push({ controlId: FIELD_ALIASES.shangjia2, value: sj2, valueType: 2 });
        }
        const resp = await hapPost('/addRow', {
            appKey: APPKEY,
            sign: SIGN,
            worksheetId: WORKSHEET_ID,
            triggerWorkflow: false,
            getSystemControl: false,
            controls: controls
        });
        return sendJson(res, resp.success ? 200 : 500, resp);
    } catch (e) {
        return sendJson(res, 500, { error: e.message });
    }
}

/**
 * POST /api/record-update
 * body: { rowId, controls }
 */
async function handleUpdate(req, res) {
    try {
        const body = await readJsonBody(req);
        if (!body.rowId) return sendJson(res, 400, { error: 'rowId required' });
        const resp = await hapPost('/editRow', {
            appKey: APPKEY,
            sign: SIGN,
            worksheetId: WORKSHEET_ID,
            rowId: body.rowId,
            triggerWorkflow: false,
            controls: body.controls || []
        });
        return sendJson(res, resp.success ? 200 : 500, resp);
    } catch (e) {
        return sendJson(res, 500, { error: e.message });
    }
}

/**
 * POST /api/record-delete
 * body: { rowId }
 * 物理删除（2026-09-03 由逻辑删 shanchu=1 改为 HAP deleteRow，删除后不可恢复）
 */
async function handleDelete(req, res) {
    try {
        const body = await readJsonBody(req);
        if (!body.rowId) return sendJson(res, 400, { error: 'rowId required' });
        const resp = await hapPost('/deleteRow', {
            appKey: APPKEY,
            sign: SIGN,
            worksheetId: WORKSHEET_ID,
            rowId: body.rowId
        });
        return sendJson(res, resp.success ? 200 : 500, resp);
    } catch (e) {
        return sendJson(res, 500, { error: e.message });
    }
}

// ===== 路由 =====
const server = http.createServer(async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        return sendJson(res, 200, {});
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;

    try {
        if (req.method === 'GET' && path === '/api/targets') {
            return await handleTargetsByRoot(req, res, url);
        }
        if (req.method === 'GET' && path === '/api/users') {
            return await handleUsers(req, res, url);
        }
        if (req.method === 'GET' && path === '/api/all-targets') {
            return await handleAllTargets(req, res);
        }
        if (req.method === 'POST' && path === '/api/record-add') {
            return await handleAdd(req, res);
        }
        if (req.method === 'POST' && path === '/api/record-update') {
            return await handleUpdate(req, res);
        }
        if (req.method === 'POST' && path === '/api/record-delete') {
            return await handleDelete(req, res);
        }
        return sendJson(res, 404, { error: 'not found', path });
    } catch (e) {
        return sendJson(res, 500, { error: 'server error: ' + e.message });
    }
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`[objectives-management-system proxy] listening on http://127.0.0.1:${PORT} (仅本机，外网请走 Nginx 反代)`);
    console.log(`  - GET  /api/all-targets       拉全表 shangpin（fuyuan+zi 客户端过滤）`);
    console.log(`  - POST /api/record-add        新增`);
    console.log(`  - POST /api/record-update     修改`);
    console.log(`  - POST /api/record-delete     物理删除（HAP deleteRow，不可恢复）`);
});