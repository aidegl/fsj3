/**
 * 同步 HAP 数据：shangpin（内容元数据 6a03ceaa7e29abcb297cbdfc）→ assets/skills.json + assets/tasks.json
 *
 * 共用拉取（客户端过滤——v2 open API 的 filter 参数已确认失效，任何 filter 返回全表），
 * 然后按成员分别过滤：
 *
 * 技能（skills.json）：leixing=知识 AND sew=1技能 AND fabuzhe 含成员 AND shanchu != 1
 *   xstb（像素图标 6a9378590458d96d03d3275b）= 10x10 二维数组 JSON（hex 无# / null）
 *
 * 任务（tasks.json）：sew=7目标 或 8计划 AND zi（子 6a265b9c611b4ca5b182d855）为空
 *   → zi 为空 = 真叶子 = 最小可执行计划（逻辑同 objectives-management-system，不显示层级）
 *   附 zhixindu（置信度，像素视界用于四象限色点）
 *
 * 地点（places.json）：地点表 6a8ba7de496428febbecd4bb 全量树
 *   层级：区 → 单元 → 层（leixing 区分，fu/zi 组树），sanjie = 天界/人界/地界
 *   比例尺：区 10米=1格；层 1米=3x3 格
 *   xsdt（像素地图 6a93b534bf128bf09c25d7af）= 场景地图 JSON（id/name/size/tilesize/tiles/layers/spawns）
 *
 * 用法：node tools/sync-hap-data.js
 */
const fs = require('fs');
const path = require('path');

const APP_KEY = 'c156d7e78368cbc1';
const SIGN = 'NmM2NGE0ZTNlN2Y3NjU3ODY5MzMzOTk1NzBjMmMwMzNkNmE5NDU2MWZiYTg4ZWViNDk3MGE3MzU5MjcwNDU2MQ==';
const WORKSHEET_ID = '6a03ceaa7e29abcb297cbdfc';
const PLACES_WS = '6a8ba7de496428febbecd4bb';
const PAGE_SIZE = 500;

async function pullAll(worksheetId = WORKSHEET_ID, controls) {
    // 分页漂移应对：表在持续写入（ctime 序，新行插顶部会把行推到下一页），
    // 单轮翻页会漏行 → 多轮全量拉取按 rowid 合并，直到不再出现新行（最多 3 轮）
    const byId = new Map();
    for (let round = 1; round <= 3; round++) {
        let page = 1, got = 0, fresh = 0;
        while (true) {
            const res = await fetch('https://api.mingdao.com/v2/open/worksheet/getFilterRows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    appKey: APP_KEY, sign: SIGN, worksheetId,
                    pageSize: PAGE_SIZE, pageIndex: page, listType: 0,
                    controls
                })
            });
            const d = await res.json();
            let rows = d.data || [];
            if (!Array.isArray(rows)) rows = rows.rows || [];
            for (const r of rows) {
                if (!byId.has(r.rowid)) { byId.set(r.rowid, r); fresh++; }
                got++;
            }
            console.log(`  轮${round} 第 ${page} 页：${rows.length} 行（累计唯一 ${byId.size}）`);
            if (rows.length < PAGE_SIZE) break;
            page++;
        }
        if (fresh === 0) { console.log(`  轮${round} 无新行，收敛`); break; }
    }
    return [...byId.values()];
}

function parseRel(v) {
    try { return JSON.parse(v || '[]'); } catch (e) { return Array.isArray(v) ? v : []; }
}
function fabuzheRowids(v) { return parseRel(v).map(f => f.sid || f.rowid); }

(async () => {
    const members = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/members.json'), 'utf8'));
    console.log('拉取 shangpin 全量（客户端过滤）…');
    const rows = await pullAll();
    console.log(`共 ${rows.length} 行，开始过滤…`);

    const skills = {}, tasks = {};
    for (const m of members) {
        skills[m.rowid] = [];
        tasks[m.rowid] = [];
    }
    for (const r of rows) {
        if (r.shanchu === '1') continue;
        const fbs = fabuzheRowids(r.fabuzhe);
        const zi = parseRel(r.zi);
        for (const m of members) {
            if (!fbs.includes(m.rowid)) continue;
            if (r.leixing === '知识' && r.sew === '1技能') {
                let xstb = null;
                try { xstb = JSON.parse(r.xstb || 'null'); } catch (e) { /* 脏数据容错 */ }
                // 关键词（Relation 多值，存为 JSON 字符串）→ rowid 列表
                let gks = [];
                try { gks = parseRel(r.guanjianci).map(g => g.sid || g.rowid); } catch (e) { /* */ }
                skills[m.rowid].push({
                    rowid: r.rowid, mingcheng: r.mingcheng, xstb, ctime: r.ctime,
                    guanjianci: gks,        // 含此 rowid = 该技能归属关键词
                    miaoshu: r.miaoshu || r.wznr || ''  // 技能说明
                });
            }
            // 最小可执行计划：zi 为空（无子节点 = 真叶子），像素视界不展示层级
            if ((r.sew === '7目标' || r.sew === '8计划') && zi.length === 0) {
                tasks[m.rowid].push({
                    rowid: r.rowid, mingcheng: r.mingcheng, sew: r.sew,
                    zhixindu: r.zhixindu || '', wznr: r.wznr || '', ctime: r.ctime
                });
            }
        }
    }
    fs.writeFileSync(path.join(__dirname, '../assets/skills.json'), JSON.stringify(skills, null, 2), 'utf8');
    fs.writeFileSync(path.join(__dirname, '../assets/tasks.json'), JSON.stringify(tasks, null, 2), 'utf8');
    for (const m of members) {
        console.log(`${m.mingcheng}: 技能 ${skills[m.rowid].length} | 任务 ${tasks[m.rowid].length}`);
    }
    console.log('已写入 assets/skills.json + assets/tasks.json');

    // ---------- 地点树（区 → 单元 → 层，含 xsdt 像素地图） ----------
    console.log('拉取地点表…');
    const placeRows = await pullAll(PLACES_WS, ['mingcheng', 'leixing', 'sanjie', 'xsdt', 'fu', 'zi']);
    const val = (v) => {
        if (typeof v === 'string' && v && v !== '[]') return v;  // 限定字段时下拉返回纯字符串
        return (parseRel(v)[0] || {}).value || '';
    };
    const places = placeRows
        .filter(r => r.shanchu !== '1')
        .map(r => {
            let map = null;
            try { map = JSON.parse(r.xsdt || 'null'); } catch (e) { /* 脏数据容错 */ }
            return {
                rowid: r.rowId || r.rowid,
                mingcheng: r.mingcheng || '',
                leixing: val(r.leixing),           // 区 | 单元 | 层
                sanjie: val(r.sanjie),             // 天界 | 人界 | 地界
                fu: parseRel(r.fu).map(x => x.sid || x.rowid),
                zi: parseRel(r.zi).map(x => x.sid || x.rowid),
                xsdt: map                          // 地图 JSON（对象）或 null
            };
        });
    fs.writeFileSync(path.join(__dirname, '../assets/places.json'), JSON.stringify(places, null, 2), 'utf8');
    for (const p of places) {
        console.log(`${p.mingcheng} [${p.leixing || '未设'}/${p.sanjie || '未设'}] 地图: ${p.xsdt ? '有' : '无'}`);
    }
    console.log('已写入 assets/places.json');

    // ---------- 成员所在地点（用户表.地点 → members.json 的 didian 字段） ----------
    console.log('拉取成员所在地点…');
    for (const m of members) {
        try {
            const res = await fetch('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    appKey: APP_KEY, sign: SIGN, worksheetId: '69b0077358322d512e60bad0',
                    rowId: m.rowid, controls: ['didian']
                })
            });
            const d = await res.json();
            let row = d.data || {};
            if (!Array.isArray(row) && typeof row === 'object' && row.data) row = row.data; // Dify 包装兼容
            const loc = parseRel(row.didian)[0] || {};
            m.didian = loc.sid || loc.rowid || '';
        } catch (e) { m.didian = m.didian || ''; }
        console.log(`${m.mingcheng}: 所在地点 ${m.didian || '未设'}`);
    }
    fs.writeFileSync(path.join(__dirname, '../assets/members.json'), JSON.stringify(members, null, 2), 'utf8');
    console.log('members.json 已更新（含 didian）');
})();
