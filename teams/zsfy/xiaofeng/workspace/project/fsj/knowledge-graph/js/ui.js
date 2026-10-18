/**
 * ui.js — 界面交互层：图例 / Agent 列表 / 统计 / tooltip / 详情面板
 *
 * 只操作 DOM，不直接碰图引擎；与 main.js 通过回调联动。
 */

import { SEW_META, SEW_DEFAULT_COLOR } from './config.js';
import { hapRowLink } from './data.js';

const $ = (id) => document.getElementById(id);

function sewColor(sew) {
    return (SEW_META[sew] && SEW_META[sew].color) || SEW_DEFAULT_COLOR;
}

function sewLabel(sew) {
    if (!sew) return '未设维度';
    const m = SEW_META[sew];
    return m ? `${sew}（${m.zhi}·${m.wuxing}·${m.ceng}）` : sew;
}

/* ============================================================
   图例 & Agent 列表
   ============================================================ */

/**
 * 渲染 12 维图例
 * @param {Array} sewList [{key,label,count}]  key 可能是 '_null'
 * @param {Set} sewOff 当前关闭集合
 * @param {Function} onToggle (key)
 */
export function renderSewLegend(sewList, sewOff, onToggle) {
    const box = $('sewLegend');
    box.innerHTML = '';
    for (const it of sewList) {
        const color = it.key === '_null' ? SEW_DEFAULT_COLOR : sewColor(it.key);
        const div = document.createElement('div');
        div.className = 'legend-item' + (sewOff.has(it.key) ? ' off' : '');
        div.innerHTML = `
            <span class="legend-dot" style="background:${color};box-shadow:0 0 6px ${color}"></span>
            <span class="legend-name">${it.label}</span>
            <span class="legend-count">${it.count}</span>`;
        div.onclick = () => onToggle(it.key);
        box.appendChild(div);
    }
}

/**
 * 渲染 Agent 列表
 * @param {Array} agentList [{sid,name,count}]
 * @param {Set} agentOff
 * @param {Function} onToggle (sid)
 */
export function renderAgentList(agentList, agentOff, onToggle) {
    const box = $('agentList');
    box.innerHTML = '';
    for (const a of agentList) {
        const div = document.createElement('div');
        div.className = 'agent-item' + (agentOff.has(a.sid) ? ' off' : '');
        div.innerHTML = `
            <span class="legend-dot" style="background:var(--accent)"></span>
            <span class="agent-name" title="${a.name}">${a.name}</span>
            <span class="agent-count">${a.count}</span>`;
        div.onclick = () => onToggle(a.sid);
        box.appendChild(div);
    }
}

/**
 * 底部统计条
 * @param {object} s {cached, shown, links, agents}
 */
export function renderStats(s) {
    $('stats').innerHTML = `
        缓存记录 <b>${s.cached}</b> 条<br>
        当前显示 <b class="hl">${s.shown}</b> 节点 / <b class="hl">${s.links}</b> 边<br>
        知识记忆 Agent <b>${s.agents}</b> 位`;
}

/* ============================================================
   Tooltip
   ============================================================ */

export function showTooltip(node, sx, sy) {
    const tip = $('tooltip');
    const meta = node.sew ? SEW_META[node.sew] : null;
    const dimmed = node.shanchu === 1 ? '<span style="color:var(--err)"> · 已删除</span>' : '';
    const mode = node.shangjia1 === 1
        ? '<span style="color:var(--ok)">验证模式</span>'
        : '<span style="color:var(--warn)">推理模式</span>';
    tip.innerHTML = `
        <div class="tt-title" style="color:${sewColor(node.sew)}">${esc(node.mingcheng)}</div>
        <div class="tt-row">${sewLabel(node.sew)}${dimmed}</div>
        <div class="tt-row">发布者 <b>${esc(node.fbName)}</b> · ${mode}</div>
        <div class="tt-row">权重 <b>${node.weight}</b>（${node.weightSource === 'field' ? '字段' : '结构'}）
             · 置信度 <b>${(node.conf * 100).toFixed(0)}%</b>（${node.confSource === 'field' ? '字段' : '兜底'}）</div>
        <div class="tt-row">子 <b>${node.childCount}</b> · 被引用 <b>${node.citedCount}</b> · ${node.ctime.slice(0, 10)}</div>
        ${node.wznr ? `<div class="tt-snippet">${esc(node.wznr.slice(0, 160))}</div>` : ''}`;
    tip.hidden = false;
    positionTooltip(sx, sy);
}

export function positionTooltip(sx, sy) {
    const tip = $('tooltip');
    if (tip.hidden) return;
    const wrap = $('canvasWrap');
    const r = tip.getBoundingClientRect();
    let x = sx + 16, y = sy + 14;
    if (x + r.width > wrap.clientWidth - 10) x = sx - r.width - 16;
    if (y + r.height > wrap.clientHeight - 10) y = sy - r.height - 14;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
}

export function hideTooltip() {
    $('tooltip').hidden = true;
}

/* ============================================================
   详情面板
   ============================================================ */

/**
 * @param {object} node 图节点
 * @param {Map} recMap rowid → 精简记录（查关联名字）
 * @param {Function} onJump (rowid) 点击关联项定位
 */
export function showDetail(node, recMap, onJump) {
    const panel = $('detailPanel');
    panel.hidden = false;

    // 头部色条标题
    $('detailTitle').innerHTML = `<span style="color:${sewColor(node.sew)}">●</span> ${esc(node.mingcheng)}`;

    const relItem = (rowid, tag) => {
        const rec = recMap.get(rowid);
        const name = rec ? (rec.mingcheng || rec.zdbh || rowid.slice(0, 8)) : rowid.slice(0, 8) + '…（不在当前筛选）';
        return `<div class="d-link-item" data-rowid="${rowid}" title="${esc(name)}"><span class="rel-tag">${tag}</span>${esc(name)}</div>`;
    };

    const fuHtml = node.fuIds.filter(id => recMap.has(id)).map(id => relItem(id, '父')).join('');
    const ziHtml = node.ziIds.filter(id => recMap.has(id)).map(id => relItem(id, '子')).join('');
    const yyHtml = node.yynrRefs.filter(id => recMap.has(id)).map(id => relItem(id, '引')).join('');
    const byHtml = node.beiyinyongIds.filter(id => recMap.has(id)).map(id => relItem(id, '被引')).join('');

    const kwHtml = node.guanjianci.length
        ? node.guanjianci.map(k => `<span class="badge">${esc(k)}</span>`).join('')
        : '<span style="color:var(--text-faint);font-size:12px">无</span>';

    $('detailBody').innerHTML = `
        <div class="d-badges">
            <span class="badge"><span class="dot" style="background:${sewColor(node.sew)}"></span>${esc(node.sew || '未设维度')}</span>
            <span class="badge">${esc(node.leixing || '—')}</span>
            <span class="badge">${esc(node.fbName)}</span>
            <span class="badge">${node.shangjia1 === 1 ? '✓ 验证模式' : '◌ 推理模式'}</span>
            ${node.shanchu === 1 ? '<span class="badge" style="color:var(--err);border-color:var(--err)">已删除</span>' : ''}
        </div>

        <div class="d-metric">
            <div class="d-metric-box">
                <div class="d-metric-num" style="color:${sewColor(node.sew)}">${node.weight}</div>
                <div class="d-metric-label">权重（节点大小）</div>
                <div class="d-metric-src">${node.weightSource === 'field' ? '来自 quanzhong 字段' : '兜底：子' + node.childCount + ' + 被引×2 ' + node.citedCount}</div>
            </div>
            <div class="d-metric-box">
                <div class="d-metric-num" style="color:${sewColor(node.sew)}">${(node.conf * 100).toFixed(0)}%</div>
                <div class="d-metric-label">置信度（亮度）</div>
                <div class="d-metric-src">${node.confSource === 'field' ? '来自 zhixindu 字段' : '兜底：' + (node.shangjia1 === 1 ? '验证模式' : '推理模式') + (node.guanjianci.length ? ' + 关键词' + node.guanjianci.length : '')}</div>
            </div>
        </div>

        <div class="d-field"><div class="d-label">创建 / 更新</div>
            <div class="d-value">${node.ctime || '—'}<br>${node.utime || '—'}</div></div>

        ${node.wznr ? `<div class="d-field"><div class="d-label">内容摘要</div><div class="d-value wznr">${esc(node.wznr)}</div></div>` : ''}

        <div class="d-field"><div class="d-label">关键词</div><div class="d-badges">${kwHtml}</div></div>

        ${fuHtml ? `<div class="d-field"><div class="d-label">父记录</div><div class="d-link-list">${fuHtml}</div></div>` : ''}
        ${ziHtml ? `<div class="d-field"><div class="d-label">子记录（${node.ziIds.length}）</div><div class="d-link-list">${ziHtml}</div></div>` : ''}
        ${yyHtml ? `<div class="d-field"><div class="d-label">引用了</div><div class="d-link-list">${yyHtml}</div></div>` : ''}
        ${byHtml ? `<div class="d-field"><div class="d-label">被引用（${node.beiyinyongIds.length}）</div><div class="d-link-list">${byHtml}</div></div>` : ''}

        <a class="d-jump" href="${hapRowLink(node.rowid)}" target="_blank">↗ 在明道云中打开</a>
    `;

    // 关联项点击 → 定位到该节点
    $('detailBody').querySelectorAll('.d-link-item').forEach(el => {
        el.onclick = () => onJump(el.dataset.rowid);
    });
}

export function hideDetail() {
    $('detailPanel').hidden = true;
}

/* ============================================================
   状态栏 / 同步进度
   ============================================================ */

export function setStatus(left, right) {
    if (left !== undefined) $('statusLeft').textContent = left;
    if (right !== undefined) $('statusRight').textContent = right;
}

export function setDbStatus(text, cls) {
    const el = $('dbStatus');
    el.textContent = text;
    el.style.color = cls === 'ok' ? 'var(--ok)' : cls === 'err' ? 'var(--err)' : cls === 'busy' ? 'var(--warn)' : 'var(--text-faint)';
}

export function showSyncProgress(visible) {
    $('syncProgress').hidden = !visible;
}

export function updateSyncProgress(done, total, text) {
    const pct = total ? Math.round(done / total * 100) : 0;
    $('syncProgressFill').style.width = pct + '%';
    $('syncProgressText').textContent = text || `同步中 ${done} / ${total}（${pct}%）`;
}

export function showEmptyHint(show) {
    $('emptyHint').hidden = !show;
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}
