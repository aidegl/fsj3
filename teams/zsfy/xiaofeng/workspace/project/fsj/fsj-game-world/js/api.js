/**
 * Game World · API 层（HAP 读：成员记录 / 必读段）
 * 通道：Node 代理 mingdao-proxy（密钥服务端注入）
 */
const M_PROXY = 'https://100000whys.cn/mingdao';
const MEMBER_WS = '69b0077358322d512e60bad0';
const SHANGPIN = '6a03ceaa7e29abcb297cbdfc';

async function post(url, input) {
    const r = await fetch(M_PROXY, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, input })
    });
    if (!r.ok) throw new Error('代理 ' + r.status);
    return r.json();
}

export async function getMemberRecord(agentRowid) {
    const j = await post('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost', {
        worksheetId: MEMBER_WS, rowId: agentRowid
    });
    return j.data?.data || j.data || null;
}

export async function getContentRecord(rowid) {
    const j = await post('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost', {
        worksheetId: SHANGPIN, rowId: rowid
    });
    return j.data?.data || j.data || null;
}

const stripFence = (s) => String(s ?? '').replace(/^\s*```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();

export async function fetchMustread(agentRowid) {
    const rec = await getMemberRecord(agentRowid);
    let raw = stripFence(rec?.bdwznr ?? '');
    let items = [];
    try { items = JSON.parse(raw || '[]'); } catch (e) { items = []; }
    if (!Array.isArray(items)) items = [];
    const out = [];
    for (const it of items) {
        if (!it.rowid) continue;
        let mingcheng = '';
        try {
            const rec = await getContentRecord(it.rowid);
            mingcheng = rec ? (rec.mingcheng ?? rec['6a03ceaa7e29abcb297cbdfd'] ?? '') : '';
        } catch (e) { /* skip */ }
        out.push({ rowid: it.rowid, shuoming: it.shuoming || '', mingcheng });
    }
    return out;
}
