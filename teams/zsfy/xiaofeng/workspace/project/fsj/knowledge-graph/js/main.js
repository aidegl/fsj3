/**
 * main.js — 入口：串联 同步 → 缓存 → 筛选 → 图渲染 → 交互
 *
 * 流程：
 *  1. 启动：打开 IndexedDB，读缓存记录 + lastSyncTime
 *  2. 有缓存 → 立即建图渲染（秒开）
 *  3. 点「同步数据」：
 *     - 无 lastSyncTime → 全量拉取（带进度）
 *     - 有 → 增量拉取（按 utime 倒序，遇到旧数据停）
 *     - upsert 缓存 → 更新 lastSyncTime → 重建图
 *  4. 筛选器变化 → filterRecords → buildGraph → setData（保留旧位置）
 */

import { ForceGraph } from './graph.js';
import { fetchAll, fetchIncremental, ping } from './api.js';
import * as cache from './cache.js';
import { defaultFilters, filterRecords, buildGraph, buildFacets } from './data.js';
import * as ui from './ui.js';

// 浏览器端自检模式：http://localhost:8765/?selftest=1
if (new URLSearchParams(location.search).has('selftest')) {
    import('../test/browser-selftest.mjs').then(m => m.runSelfTest()).catch(console.error);
}

/* ---------------- 状态 ---------------- */

let allRecords = [];                 // 缓存全量记录（内存）
let recMap = new Map();              // rowid → record（详情面板查关联名）
let filters = defaultFilters();
let graph = null;
let syncing = false;
let lastSync = null;

/* ---------------- 图谱刷新 ---------------- */

function rebuildGraph() {
    const filtered = filterRecords(allRecords, filters);
    // recMap 用「当前筛选集」建：详情面板的关联项只在可见范围内可点击定位
    recMap = new Map(filtered.map(r => [r.rowid, r]));

    const { nodes, links } = buildGraph(filtered, { showYynr: document.getElementById('chkYynr').checked });
    graph.showLabels = document.getElementById('chkLabel').checked;
    graph.setData(nodes, links);

    ui.renderStats({
        cached: allRecords.length,
        shown: nodes.length,
        links: links.length,
        agents: new Set(filtered.map(r => r.fbSid).filter(Boolean)).size,
    });
    ui.showEmptyHint(nodes.length === 0);
    if (nodes.length && links.length === 0 && nodes.length < 50) graph.zoomToFit();

    // 左侧分面（全量口径，不受筛选影响）
    const facets = buildFacets(allRecords);
    ui.renderSewLegend(facets.sewList, filters.sewOff, toggleSew);
    ui.renderAgentList(facets.agentList, filters.agentOff, toggleAgent);
}

function toggleSew(key) {
    if (filters.sewOff.has(key)) filters.sewOff.delete(key);
    else filters.sewOff.add(key);
    rebuildGraph();
}

function toggleAgent(sid) {
    if (filters.agentOff.has(sid)) filters.agentOff.delete(sid);
    else filters.agentOff.add(sid);
    rebuildGraph();
}

/* ---------------- 同步 ---------------- */

async function sync() {
    if (syncing) return;
    syncing = true;
    const btn = document.getElementById('btnSync');
    btn.disabled = true;
    ui.showSyncProgress(true);
    ui.setDbStatus('同步中…', 'busy');
    ui.setStatus('正在从明道云拉取数据…');

    try {
        const total = await ping();
        let newRecords;
        let mode;

        if (!lastSync) {
            mode = '全量';
            newRecords = await fetchAll((done, tot) => {
                ui.updateSyncProgress(done, tot, `全量同步 ${done} / ${tot}（${Math.round(done / tot * 100)}%）`);
            });
        } else {
            mode = '增量';
            ui.updateSyncProgress(0, 1, `增量同步（上次：${lastSync}）…`);
            newRecords = await fetchIncremental(lastSync);
        }

        // 合并内存 + 写库
        const map = new Map(allRecords.map(r => [r.rowid, r]));
        for (const r of newRecords) map.set(r.rowid, r);
        allRecords = [...map.values()];
        await cache.upsertRecords(newRecords);

        // 更新游标 = 本批最大 utime（记录级，防边界遗漏）
        let maxU = lastSync || '';
        for (const r of newRecords) if (r.utime > maxU) maxU = r.utime;
        lastSync = maxU;
        await cache.setMeta('lastSyncTime', lastSync);

        ui.updateSyncProgress(1, 1, `${mode}完成：${newRecords.length} 条更新 · ${new Date().toLocaleTimeString()}`);
        ui.setDbStatus(`已同步 ${allRecords.length} 条 · ${lastSync}`, 'ok');
        ui.setStatus(`${mode}同步完成`, `${total} 条在库`);
        rebuildGraph();
        graph.zoomToFit();

        setTimeout(() => ui.showSyncProgress(false), 3000);
    } catch (e) {
        console.error(e);
        ui.updateSyncProgress(0, 1, `同步失败：${e.message}`);
        ui.setDbStatus('同步失败', 'err');
        ui.setStatus(`同步失败：${e.message}`);
        setTimeout(() => ui.showSyncProgress(false), 5000);
    } finally {
        syncing = false;
        btn.disabled = false;
    }
}

/* ---------------- 初始化 ---------------- */

async function init() {
    graph = new ForceGraph(document.getElementById('graphCanvas'), {
        onHover: (node, sx, sy) => {
            if (node) ui.showTooltip(node, sx, sy);
            else ui.hideTooltip();
        },
        onClick: (node) => {
            if (node) ui.showDetail(node, recMap, (rowid) => graph.focusNode(rowid, 1.2));
            else ui.hideDetail();
        },
    });

    bindControls();

    // 读缓存
    const count = await cache.countRecords();
    if (count > 0) {
        allRecords = await cache.getAllRecords();
        lastSync = await cache.getLastSyncTime();
        ui.setDbStatus(`缓存 ${allRecords.length} 条 · ${lastSync || '无游标'}`, 'ok');
        rebuildGraph();
        graph.zoomToFit();
        ui.setStatus(`从本地缓存加载 ${allRecords.length} 条，点击「同步数据」获取增量`);
    } else {
        ui.setDbStatus('未同步（缓存为空）');
        ui.setStatus('就绪，点击「同步数据」开始全量拉取');
    }
}

/* ---------------- 控件绑定 ---------------- */

function bindControls() {
    document.getElementById('btnSync').onclick = sync;
    document.getElementById('btnFit').onclick = () => graph.zoomToFit();
    document.getElementById('btnDetailClose').onclick = () => ui.hideDetail();
    document.getElementById('btnSewAll').onclick = () => { filters.sewOff.clear(); rebuildGraph(); };
    document.getElementById('btnAgentAll').onclick = () => { filters.agentOff.clear(); rebuildGraph(); };

    // 搜索（300ms 防抖）
    let searchTimer = null;
    document.getElementById('searchInput').addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            filters.search = e.target.value;
            rebuildGraph();
        }, 300);
    });

    // 过滤开关
    document.getElementById('chkVerified').onchange = (e) => {
        filters.includeUnverified = e.target.checked; rebuildGraph();
    };
    document.getElementById('chkDeleted').onchange = (e) => {
        filters.includeDeleted = e.target.checked; rebuildGraph();
    };
    document.getElementById('chkChat').onchange = (e) => {
        filters.includeNonKnowledge = e.target.checked; rebuildGraph();
    };
    document.getElementById('chkYynr').onchange = () => rebuildGraph();
    document.getElementById('chkLabel').onchange = (e) => {
        graph.showLabels = e.target.checked; graph.redraw();
    };

    // 时间
    document.getElementById('dateFrom').onchange = (e) => {
        filters.dateFrom = e.target.value; rebuildGraph();
    };
    document.getElementById('dateTo').onchange = (e) => {
        filters.dateTo = e.target.value; rebuildGraph();
    };
    document.getElementById('btnDateClear').onclick = () => {
        filters.dateFrom = filters.dateTo = '';
        document.getElementById('dateFrom').value = '';
        document.getElementById('dateTo').value = '';
        rebuildGraph();
    };

    // 布局切换
    const btnF = document.getElementById('btnLayoutForce');
    const btnT = document.getElementById('btnLayoutTree');
    const markMode = () => {
        btnF.classList.toggle('active', graph.mode === 'force');
        btnT.classList.toggle('active', graph.mode === 'tree');
    };
    btnF.onclick = () => { graph.setMode('force'); markMode(); };
    btnT.onclick = () => { graph.setMode('tree'); markMode(); graph.zoomToFit(); };
    markMode();

    // tooltip 跟随鼠标
    document.getElementById('graphCanvas').addEventListener('mousemove', (e) => {
        if (!uiIsTooltipVisible()) return;
        ui.positionTooltip(e.offsetX, e.offsetY);
    });
}

function uiIsTooltipVisible() {
    return !document.getElementById('tooltip').hidden;
}

init().catch(e => {
    console.error(e);
    ui.setStatus('初始化失败：' + e.message);
});
