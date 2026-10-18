/**
 * 实时拉取 HAP 地点表（替代 tools/sync-hap-data.js 烘焙 places.json 的步骤）
 *
 * 经 Node 代理通道（同 fsj-chat.js 的 call 模式）：
 *   浏览器 → mingdao-proxy → 明道云 API → 返回 JSON
 *
 * 用法：import { HapPlaces } from './hap-places.js'; const arr = await HapPlaces.fetchAll();
 */
const MINGDAO_PROXY = 'https://100000whys.cn/mingdao';
const M_API = 'https://api.mingdao.com/v2/open/worksheet/getFilterRows';
const PLACES_WS = '6a8ba7de496428febbecd4bb';

async function call(url, body) {
    const res = await fetch(MINGDAO_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, input: body })
    });
    if (!res.ok) throw new Error('明道云代理 ' + res.status);
    return res.json();
}

function rel(v) {
    try { const a = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
}

function parseXsdt(v) {
    if (!v) return null;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch (e) { return null; }
}

export const HapPlaces = {
    /**
     * 拉全部地点（不分页：HAP 单表通常 < 500 行；如有需要按 sync-hap-data.js 的多轮模式扩展）
     * 返回数组（与 places.json 形态一致），调用方自己组 Map
     */
    async fetchAll() {
        const d = await call(M_API, {
            worksheetId: PLACES_WS,
            pageSize: 500, pageIndex: 1, listType: 0,
            controls: ['mingcheng', 'leixing', 'sanjie', 'fu', 'zi', 'xsdt']
        });
        const rows = (d.data && d.data.rows) || [];
        return rows.map(r => ({
            rowid: r.rowid,
            mingcheng: r.mingcheng || '',
            leixing: r.leixing || '',
            sanjie: r.sanjie || '',
            fu: rel(r.fu).map(x => x.sid || x.rowid),
            zi: rel(r.zi).map(x => x.sid || x.rowid),
            xsdt: parseXsdt(r.xsdt)
        }));
    }
};