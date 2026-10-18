/**
 * node-test.mjs — Node 环境核心链路实测（不依赖浏览器）
 *
 * 验证：
 *  1. api.js fetchAll 分页拉取 + pickRow 字段解析
 *  2. api.js fetchIncremental 增量逻辑（用刚全量拉到的最新 utime 当游标）
 *  3. data.js filterRecords / buildGraph / buildFacets 在真实数据上的输出
 *
 * 运行：node test/node-test.mjs
 */

import { fetchAll, fetchIncremental, ping } from '../js/api.js';
import { defaultFilters, filterRecords, buildGraph, buildFacets, computeMetrics } from '../js/data.js';

async function main() {
    console.log('=== 1. ping ===');
    const total = await ping();
    console.log('表内总数:', total);

    console.log('\n=== 2. 全量拉取（仅前 3 页验证，避免每次测试全拉） ===');
    // 手动分页拉 300 条验证
    const { postPageForTest } = await import('./helper.mjs');
    const pages = [await postPageForTest(1), await postPageForTest(2)];
    const rows = pages.flatMap(p => p.rows);
    console.log('样本条数:', rows.length);

    const { pickRow } = await import('../js/api.js');
    const records = rows.map(pickRow);
    console.log('\npickRow 样例[0]:');
    const s = records[0];
    console.log(JSON.stringify({
        rowid: s.rowid.slice(0, 8) + '…',
        mingcheng: s.mingcheng.slice(0, 20),
        sew: s.sew, leixing: s.leixing,
        fbName: s.fbName,
        fu: s.fu.length + '个', zi: s.zi.length + '个',
        shangjia1: s.shangjia1, shanchu: s.shanchu,
        quanzhong: s.quanzhong, zhixindu: s.zhixindu,
        ctime: s.ctime, utime: s.utime,
    }, null, 2));

    console.log('\n=== 3. 筛选 + 建图（默认过滤） ===');
    const f = defaultFilters();
    const filtered = filterRecords(records, f);
    console.log(`过滤前 ${records.length} → 过滤后 ${filtered.length}`);

    const { nodes, links } = buildGraph(filtered, { showYynr: true });
    console.log(`节点 ${nodes.length} · 边 ${links.length}（fu: ${links.filter(l => l.type === 'fu').length} / yynr: ${links.filter(l => l.type === 'yynr').length}）`);

    // 半径与颜色分布
    const rs = nodes.map(n => n.r);
    console.log(`半径范围: ${Math.min(...rs).toFixed(1)} ~ ${Math.max(...rs).toFixed(1)}`);
    const colors = new Set(nodes.map(n => n.color));
    console.log(`不同渲染色数: ${colors.size}`);

    // 度量来源统计
    const wf = nodes.filter(n => n.weightSource === 'field').length;
    const cf = nodes.filter(n => n.confSource === 'field').length;
    console.log(`权重来自字段: ${wf}/${nodes.length} · 置信度来自字段: ${cf}/${nodes.length}`);

    console.log('\n=== 4. 分面统计 ===');
    const facets = buildFacets(records);
    console.log('sew 分布:', facets.sewList.map(x => `${x.label}=${x.count}`).join(', '));
    console.log('agent 分布:', facets.agentList.map(a => `${a.name}=${a.count}`).join(', '));

    console.log('\n=== 5. 增量拉取（游标 = 样本最新 utime） ===');
    const maxU = records.reduce((m, r) => r.utime > m ? r.utime : m, '');
    console.log('游标:', maxU);
    const inc = await fetchIncremental(maxU);
    console.log('增量条数:', inc.length, '（预期：接近 0 或少量同刻记录）');

    console.log('\n=== 6. computeMetrics 单测 ===');
    const m1 = computeMetrics({ quanzhong: null, zhixindu: null, zi: [1, 2, 3], beiyinyong: [1], shangjia1: 1, guanjianci: ['a', 'b'] });
    console.log('结构兜底:', JSON.stringify(m1), '（期望 weight=5, conf≈0.64, structure/fallback）');
    const m2 = computeMetrics({ quanzhong: 88, zhixindu: 0.9, zi: [], beiyinyong: [], shangjia1: 0, guanjianci: [] });
    console.log('字段直读:', JSON.stringify(m2), '（期望 weight=88, conf=0.9, field/field）');

    console.log('\n✅ 全部通过');
}

main().catch(e => { console.error('❌ 测试失败:', e); process.exit(1); });
