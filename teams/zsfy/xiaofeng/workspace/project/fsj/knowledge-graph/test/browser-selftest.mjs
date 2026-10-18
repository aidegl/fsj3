/**
 * browser-selftest.mjs — 浏览器端 E2E 自检（headless 可跑）
 *
 * 访问 http://localhost:8765/?selftest=1 触发。
 * 逐步验证：模块加载 → API ping → 分页拉取 → IndexedDB 读写 →
 *           筛选建图 → Canvas 渲染出像素。
 * 结果 JSON 写入 <pre id="selftestResult">，供 headless --dump-dom 抓取。
 */

import { ping, fetchAll, pickRow } from '../js/api.js';
import * as cache from '../js/cache.js';
import { defaultFilters, filterRecords, buildGraph } from '../js/data.js';
import { ForceGraph } from '../js/graph.js';

export async function runSelfTest() {
    // fast 模式（默认）：跳过网络请求，只测本地链路（headless 虚拟时间下网络不可靠）
    // net=1：含网络 ping（真人浏览器访问 ?selftest=1&net=1）
    const withNet = new URLSearchParams(location.search).has('net');
    const steps = [];
    const step = async (name, fn) => {
        try {
            const info = await fn();
            steps.push({ name, ok: true, info: info ?? '' });
        } catch (e) {
            steps.push({ name, ok: false, info: e.message });
        }
    };

    await step('ESM 模块加载', async () => 'config/api/cache/data/graph 全部 import 成功');

    if (withNet) {
        await step('API ping', async () => {
            const total = await ping();
            if (!total || total < 100) throw new Error(`total=${total} 异常`);
            return `表总数 ${total}`;
        });
    }

    let sample;

    await step('pickRow 解析', async () => {
        const fake = {
            rowid: 'test-row-0001', mingcheng: '测试', wznr: '正文'.repeat(10),
            sew: '9信息', leixing: '知识',
            fabuzhe: JSON.stringify([{ sid: 'fb-1', name: '小风' }]),
            fu: JSON.stringify([{ sid: 'parent-1' }]),
            zi: '[]', zisuoyou: '[]', yynr: '[]', beiyinyong: '[]',
            guanjianci: JSON.stringify([{ sid: 'k1', name: 'test_kw' }]),
            shangjia1: '1', shanchu: '0', quanzhong: '', zhixindu: '',
            ctime: '2026-08-15 10:00:00', utime: '2026-08-15 10:00:00', zdbh: 'SP00000001',
        };
        sample = pickRow(fake);
        if (sample.fbName !== '小风') throw new Error('fabuzhe 解析失败: ' + sample.fbName);
        if (sample.fu[0] !== 'parent-1') throw new Error('fu 解析失败');
        if (sample.guanjianci[0] !== 'test_kw') throw new Error('guanjianci 解析失败');
        return `fabuzhe/fu/guanjianci 关联解析正确，quanzhong=${sample.quanzhong}`;
    });

    await step('IndexedDB 写读', async () => {
        const rec = { ...sample, rowid: 'selftest-' + Date.now() };
        await cache.upsertRecords([rec]);
        const all = await cache.getAllRecords();
        const hit = all.find(r => r.rowid === rec.rowid);
        if (!hit) throw new Error('写后读不到');
        return `upsert + getAll 正常（当前缓存 ${all.length} 条）`;
    });

    await step('筛选 + 建图', async () => {
        const recs = await cache.getAllRecords();
        if (!recs.length) throw new Error('缓存为空');
        const f = defaultFilters();
        const filtered = filterRecords(recs, f);
        const { nodes, links } = buildGraph(filtered, { showYynr: true });
        if (!nodes.length) throw new Error('节点为 0');
        const anyNaN = nodes.some(n => !Number.isFinite(n.r) || !n.color);
        if (anyNaN) throw new Error('存在 r/color 未计算的节点');
        return `记录 ${recs.length} → 节点 ${nodes.length} · 边 ${links.length}`;
    });

    await step('Canvas 渲染出像素', async () => {
        const canvas = document.getElementById('graphCanvas');
        const g = new ForceGraph(canvas, {});
        const recs = await cache.getAllRecords();
        const filtered = filterRecords(recs, defaultFilters());
        const { nodes, links } = buildGraph(filtered, { showYynr: true });
        g.setData(nodes, links);
        g.zoomToFit();
        g.render();
        const ctx = canvas.getContext('2d');
        const img = ctx.getImageData(0, 0, canvas.width, Math.min(canvas.height, 400)).data;
        let lit = 0;
        for (let i = 3; i < img.length; i += 4) if (img[i] > 0) lit++;
        if (lit < 10) throw new Error(`画布像素几乎为空（lit=${lit}）`);
        return `渲染成功，非空像素采样 ${lit} 个`;
    });

    // 清理测试残留
    try {
        const all = await cache.getAllRecords();
        const junk = all.filter(r => r.rowid.startsWith('selftest-'));
        if (junk.length) {
            const db = await cache.openDB();
            await new Promise(res => {
                const t = db.transaction('records', 'readwrite');
                for (const j of junk) t.objectStore('records').delete(j.rowid);
                t.oncomplete = res;
            });
        }
    } catch { }

    const pass = steps.filter(s => s.ok).length;
    const result = {
        pass: `${pass}/${steps.length}`,
        allOk: pass === steps.length,
        time: new Date().toLocaleString(),
        steps,
    };
    // title 同步结果（headless dump 抓 <title> 更稳）
    document.title = `SELFTEST ${result.pass} ${result.allOk ? 'ALL-OK' : 'HAS-FAIL'}`;
    const pre = document.createElement('pre');
    pre.id = 'selftestResult';
    pre.style.cssText = 'color:#0f0;background:#000;padding:10px;font-size:12px;z-index:9999;position:relative;';
    pre.textContent = 'SELFTEST_RESULT: ' + JSON.stringify(result);
    document.body.appendChild(pre);
    return result;
}
