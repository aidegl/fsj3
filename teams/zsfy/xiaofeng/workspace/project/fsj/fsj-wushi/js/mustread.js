/**
 * 五事系统 · 权重必读 100 格板
 * 职责：管理每个 agent 的必读段（load-always.mjs 的数据源）
 *
 * 数据链（读）：agentSelect 角色 → 成员表记录（MEMBER_WS）→ bidu 关联 sid
 *            → 内容元数据表「必读权重-<角色>」记录 → wznr JSON [{rowid, shuoming}]
 *            → 按 rowid 取 标题/正文/权重（本地 myRecords 优先，miss 走 API 单拉）
 * 保存（写）：① wznr JSON 写回该记录  ② 各置入节点 quanzhong = 格子权重（10000 起递减）
 *            被移除节点恢复 0；bdwznr 由 HAP 关联自动镜像——本模块绝不直写 bdwznr
 *
 * 交互（2026-10-04 老板拍板）：
 *   点格子选中（高亮）→ 点左树节点 → 格子旁出现「置入」→ 点击落下（覆盖式）
 *   拖到空格=移动；拖到有内容的格子=互换；选中后可 删除 / 查看详情（wznr 全文 + 备注编辑）
 */
import { FIELD_IDS, MEMBER_WS, BIDU_CID } from './field-ids.js';
import * as API from './api.js?v=30';
import { escapeHtml, toast, showLoading, hideLoading } from './ui.js';

const CELL_COUNT = 100;
// 三档必读内容（2026-10-11 老板拍板）：每档独立记录（名称=前缀+角色），格子权重 = 各档顶格递减
const TIERS = {
  weight: { label: '必读权重', prefix: '必读权重-', top: 10000 },
  cheat:  { label: '必读小抄', prefix: '必读小抄-', top: 9900 },
  temp:   { label: '临时小抄', prefix: '临时小抄-', top: 9000 },
};
let currentTier = localStorage.getItem('mr-tier') || 'weight';
const cellWeight = (idx) => TIERS[currentTier].top - idx;

let agent = null;          // 当前 AGENTS 项 {rowid, name}
let recordId = null;       // 「必读权重-<角色>」内容记录 rowid
let cells = [];            // 长度 100，元素 null 或 {rowid, shuoming}
let oldRowids = [];        // 载入时的 rowid 集合（保存时对比出"被移除"）
let dirty = false;
let selectedIdx = -1;      // 高亮格
let pendingNode = null;    // 左树选中的节点（等待置入）
let detailCache = {};      // rowid -> { mingcheng, wznr }（查看详情懒加载缓存）
let container = null;
let opts = { getLocalRec: () => null, onSaved: () => {} };

const emptyCells = () => new Array(CELL_COUNT).fill(null);
const stripFence = (s) => String(s ?? '').replace(/^\s*```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
const markDirty = () => { dirty = true; syncBeforeUnload(); };

function syncBeforeUnload() {
    window.onbeforeunload = dirty ? (e) => { e.preventDefault(); return ''; } : null;
}

// ===== 对外接口 =====
export function isDirty() { return dirty; }
export function discard() { dirty = false; selectedIdx = -1; pendingNode = null; syncBeforeUnload(); }
export function setOnSaved(cb) { onSavedCb = cb; }

/** 左树节点被点击（权重必读模式下由 app 转发）：记住它；已有选中格子则浮现「置入」 */
export function onTreeNodeClick(node) {
    pendingNode = node;
    const name = (node.rec && node.rec[FIELD_IDS.mingcheng]) || node.rowid.slice(0, 8) + '…';
    if (selectedIdx >= 0) render();
    else toast('先点选右侧一个格子，再置入「' + name + '」', 'info', 2500);
}

/** 载入并渲染（切到权重必读模式 / 换角色 / 树数据刷新后） */
export async function show(agentItem, options = {}) {
    agent = agentItem;
    opts = Object.assign({ getLocalRec: () => null, onSaved: () => {} }, options);
    container = document.getElementById('detail-body');
    const header = document.querySelector('.detail-pane .pane-header');
    if (header) header.textContent = '必读内容 · ' + TIERS[currentTier].label + ' · ' + agent.name;
    showLoading('拉取 ' + agent.name + ' 的必读清单…');
    try {
        await loadFromHap();
        dirty = false; selectedIdx = -1; pendingNode = null; syncBeforeUnload();
        await resolveTitles();
        render();
    } catch (e) {
        toast('必读加载失败：' + e.message, 'error', 5000);
        container.innerHTML = '<div class="empty-state">必读加载失败：' + escapeHtml(e.message) + '</div>';
    } finally { hideLoading(); }
}

/** 树数据刷新后重渲染（标题等本地信息更新） */
export async function onLocalRefresh() {
    if (!container || !agent) return;
    await resolveTitles();
    render();
}

// ===== 数据链 =====
async function findTierRecord(fullName) {
    try {
        const rows = await API.searchByKeyword(fullName, 20);
        return (rows || []).find(r => (r[FIELD_IDS.mingcheng] || r.mingcheng || '') === fullName) || null;
    } catch (e) { return null; }
}

async function loadFromHap() {
    const cfg = TIERS[currentTier];
    if (currentTier === 'weight') {
        // 权重档：沿用 bidu 关联（load-always.mjs 的数据源）
        const memberRec = await API.getRowById(MEMBER_WS, agent.rowid);
        let raw = memberRec[BIDU_CID] ?? memberRec['bidu'];
        if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = []; } }
        const sid = (Array.isArray(raw) && raw[0] && raw[0].sid) || '';
        recordId = sid || await createTierRecord();
        if (!sid) toast('已自动创建「' + cfg.label + '-' + agent.name + '」记录', 'success', 3000);
    } else {
        // 小抄/临时档：按名称找档位记录，没有则自动创建（不写 bidu）
        const rec = await findTierRecord(cfg.prefix + agent.name);
        recordId = rec ? rec.rowid : await createTierRecord();
        if (!rec) toast('已自动创建「' + cfg.label + '-' + agent.name + '」记录', 'success', 3000);
    }
    const rec = recordId ? await API.getRowById('shangpin', recordId) : null;
    let wz = rec ? (rec['wznr'] ?? rec[FIELD_IDS.wznr] ?? '') : '[]';
    wz = stripFence(wz);
    let items = [];
    try { items = JSON.parse(wz || '[]'); } catch (e) { toast('必读 JSON 解析失败，按空清单处理', 'error', 4000); }
    if (!Array.isArray(items)) items = [];
    oldRowids = items.map(it => it.rowid);
    cells = emptyCells();
    items.slice(0, CELL_COUNT).forEach((it, i) => { cells[i] = { rowid: it.rowid, shuoming: it.shuoming || '' }; });
}

/** 角色尚无该档记录 → 自动建「<档>-<角色>」；权重档额外写用户表 bidu 关联 */
async function createTierRecord() {
    const cfg = TIERS[currentTier];
    const controls = [
        { controlId: FIELD_IDS.mingcheng, value: cfg.prefix + agent.name },
        { controlId: FIELD_IDS.wznr, value: '[]' }
    ];
    const sj2 = await API.getShangjia2(agent.rowid);
    if (sj2) controls.push({ controlId: FIELD_IDS.shangjia2, value: sj2, valueType: 2 });
    const resp = await API.addRecord(controls);
    if (!resp.success) throw new Error('创建必读记录失败: ' + JSON.stringify(resp).slice(0, 120));
    const newRowid = typeof resp.data === 'string' ? resp.data : (resp.data && resp.data.rowid);
    if (currentTier === 'weight') {
        await API.updateRecord(agent.rowid, [{ controlId: BIDU_CID, value: newRowid, valueType: 2 }]);
    }
    return newRowid;
}

/** 补齐格子的标题/正文（本地优先，miss 走 API；结果进 detailCache） */
async function resolveTitles() {
    const jobs = [];
    cells.forEach((c) => {
        if (!c || detailCache[c.rowid]) return;
        const local = opts.getLocalRec(c.rowid);
        if (local && local[FIELD_IDS.mingcheng] !== undefined) {
            detailCache[c.rowid] = {
                mingcheng: local[FIELD_IDS.mingcheng] || '',
                wznr: local[FIELD_IDS.wznr] ?? '',
                _local: true
            };
        } else {
            jobs.push((async () => {
                try {
                    const full = await API.getRecordDetail(c.rowid);
                    detailCache[c.rowid] = { mingcheng: full[FIELD_IDS.mingcheng] || '', wznr: full[FIELD_IDS.wznr] || '' };
                } catch (e) { detailCache[c.rowid] = { mingcheng: c.rowid.slice(0, 8) + '…', wznr: '' }; }
            })());
        }
    });
    await Promise.all(jobs);
}

const nodeTitle = (rowid) => (detailCache[rowid] && detailCache[rowid].mingcheng) || rowid.slice(0, 8) + '…';

// ===== 渲染 =====
function render() {
    if (!container) return;
    const placed = cells.filter(Boolean).length;
    const cellHtml = cells.map((c, i) => {
        const sel = i === selectedIdx ? ' selected' : '';
        const w = cellWeight(i);
        if (c) {
            const btns = [];
            if (i === selectedIdx) {
                if (pendingNode) btns.push('<button class="mr-btn mr-place" data-act="place">置入</button>');
                btns.push('<button class="mr-btn" data-act="del">删除</button>');
                btns.push('<button class="mr-btn" data-act="view">详情</button>');
            }
            const title = nodeTitle(c.rowid);
            return `<div class="mr-cell filled${sel}" data-idx="${i}" draggable="true" title="${escapeHtml(c.shuoming || title)}">
                <span class="mr-w">${w}</span>
                <div class="mr-title">${escapeHtml(title)}</div>
                ${c.shuoming ? `<div class="mr-sub">${escapeHtml(c.shuoming)}</div>` : ''}
                <div class="mr-actions">${btns.join('')}</div>
            </div>`;
        }
        const placeBtn = (i === selectedIdx && pendingNode) ? '<button class="mr-btn mr-place" data-act="place">置入</button>' : '';
        return `<div class="mr-cell empty${sel}" data-idx="${i}">
            <span class="mr-w">${w}</span>
            <div class="mr-empty">${i + 1}</div>
            ${placeBtn}
        </div>`;
    }).join('');

    container.innerHTML = `
        <div class="mr-head">
            <span class="mr-tabs">${Object.entries(TIERS).map(([k, t]) =>
                `<button class="mr-tab${k === currentTier ? ' mr-tab-active' : ''}" data-tier="${k}" style="margin-right:6px;padding:3px 10px;border-radius:6px;border:1px solid ${k === currentTier ? '#10b981' : 'var(--line,#d1d5db)'};background:${k === currentTier ? '#ECFDF5' : '#fff'};color:${k === currentTier ? '#059669' : 'var(--muted,#6b7280)'};cursor:pointer;font-size:12px">${t.label}</button>`).join('')}
            <span class="mr-hint">点格子选中 → 点左树节点 → 点「置入」（覆盖式）｜拖格子换位（拖到有内容的格子=互换）</span>
            ${dirty ? '<span class="mr-dirty">● 未保存</span>' : '<span class="mr-clean">已保存</span>'}
        </div>
        <div class="mr-board" id="mr-board">${cellHtml}</div>
        <div class="mr-save-bar">
            <span class="mr-count">已置入 ${placed}/${CELL_COUNT} · 保存后各节点写入对应权重（load-always 数据源）</span>
            <button id="mr-save" class="btn btn-primary">💾 保存必读</button>
        </div>`;
    bindBoard();
}

document.addEventListener('click', (e) => {
    const tab = e.target.closest('.mr-tab');
    if (!tab) return;
    const tier = tab.dataset.tier;
    if (tier === currentTier) return;
    if (dirty && !confirm('当前档有未保存修改，切换将丢弃，确定？')) return;
    dirty = false; syncBeforeUnload();
    currentTier = tier;
    localStorage.setItem('mr-tier', tier);
    if (agent) show(agent, opts);
});

let dragSrcIdx = -1;
function bindBoard() {
    const board = document.getElementById('mr-board');
    if (!board) return;

    board.addEventListener('click', (e) => {
        const actBtn = e.target.closest('[data-act]');
        const cellEl = e.target.closest('.mr-cell');
        if (!cellEl) return;
        const idx = Number(cellEl.dataset.idx);
        if (actBtn) {
            const act = actBtn.dataset.act;
            if (act === 'place') placeAt(idx);
            else if (act === 'del') clearAt(idx);
            else if (act === 'view') openDetail(idx);
            return;
        }
        selectedIdx = idx;      // 选中/换选（重复点保持选中，便于看按钮）
        render();
    });

    board.addEventListener('dragstart', (e) => {
        const cellEl = e.target.closest('.mr-cell');
        if (!cellEl || !cellEl.classList.contains('filled')) { e.preventDefault(); return; }
        dragSrcIdx = Number(cellEl.dataset.idx);
        e.dataTransfer.setData('text/plain', String(dragSrcIdx));
        e.dataTransfer.effectAllowed = 'move';
    });
    board.addEventListener('dragover', (e) => {
        const cellEl = e.target.closest('.mr-cell');
        if (!cellEl) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        cellEl.classList.add('drag-over');
    });
    board.addEventListener('dragleave', (e) => {
        const cellEl = e.target.closest('.mr-cell');
        if (cellEl) cellEl.classList.remove('drag-over');
    });
    board.addEventListener('drop', (e) => {
        const cellEl = e.target.closest('.mr-cell');
        if (!cellEl) return;
        e.preventDefault();
        cellEl.classList.remove('drag-over');
        const tgt = Number(cellEl.dataset.idx);
        const src = Number(e.dataTransfer.getData('text/plain'));
        if (!Number.isFinite(src) || src === tgt || !cells[src]) return;
        if (!cells[tgt]) { cells[tgt] = cells[src]; cells[src] = null; }   // 移动
        else { const tmp = cells[tgt]; cells[tgt] = cells[src]; cells[src] = tmp; }   // 互换
        markDirty(); selectedIdx = -1; render();
    });

    const saveBtn = document.getElementById('mr-save');
    if (saveBtn) saveBtn.onclick = save;
}

// ===== 交互动作 =====
function placeAt(idx) {
    if (!pendingNode) return;
    const dup = cells.findIndex(c => c && c.rowid === pendingNode.rowid);
    if (dup >= 0) { toast('该节点已在第 ' + (dup + 1) + ' 格', 'warn'); pendingNode = null; render(); return; }
    cells[idx] = { rowid: pendingNode.rowid, shuoming: '' };
    markDirty(); pendingNode = null; selectedIdx = idx;
    render();
}
function clearAt(idx) {
    cells[idx] = null;
    markDirty(); if (selectedIdx === idx) selectedIdx = -1;
    render();
}

// ===== 查看详情悬浮窗（wznr 全文 + 备注编辑） =====
async function openDetail(idx) {
    const item = cells[idx];
    if (!item) return;
    if (!detailCache[item.rowid] || detailCache[item.rowid].wznr === undefined) {
        try { const full = await API.getRecordDetail(item.rowid); detailCache[item.rowid] = { mingcheng: full[FIELD_IDS.mingcheng] || '', wznr: full[FIELD_IDS.wznr] || '' }; }
        catch (e) { detailCache[item.rowid] = { mingcheng: nodeTitle(item.rowid), wznr: '(读取失败)' }; }
    }
    const info = detailCache[item.rowid] || {};
    const mask = document.createElement('div');
    mask.className = 'mr-modal-mask';
    mask.innerHTML = `
        <div class="mr-modal">
            <div class="mr-modal-title">
                <span>${escapeHtml(nodeTitle(item.rowid))}</span>
                <span class="mr-w">权重 ${cellWeight(idx)}</span>
            </div>
            <div class="mr-modal-body"><pre>${escapeHtml(info.wznr || '(无正文)')}</pre></div>
            <div class="mr-modal-note">
                备注（shuoming · 保存必读时一并写回）：
                <textarea id="mr-note-input" placeholder="一句话：这条为什么在必读里">${escapeHtml(item.shuoming || '')}</textarea>
            </div>
            <div class="mr-modal-actions">
                <button class="btn" id="mr-note-close">关闭</button>
                <button class="btn btn-primary" id="mr-note-save">保存备注</button>
            </div>
        </div>`;
    document.body.appendChild(mask);
    const close = () => mask.remove();
    mask.querySelector('#mr-note-close').onclick = close;
    mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
    mask.querySelector('#mr-note-save').onclick = () => {
        cells[idx].shuoming = mask.querySelector('#mr-note-input').value.trim();
        markDirty(); close(); render();
        toast('备注已记入格子（点「保存必读」写回 HAP）', 'info', 2500);
    };
}

// ===== 保存 =====
async function save() {
    if (!recordId) { toast('必读记录不存在', 'error'); return; }
    const items = cells.filter(Boolean).map(c => ({ rowid: c.rowid, shuoming: c.shuoming || '' }));
    const json = JSON.stringify(items, null, 2);
    showLoading('保存必读…');
    try {
        await API.updateRecord(recordId, [{ controlId: FIELD_IDS.wznr, value: json }]);
        // 权重写回：置入节点 = 格子权重；被移除节点恢复 0
        const placed = [];
        cells.forEach((c, idx) => { if (c) placed.push({ rowid: c.rowid, w: cellWeight(idx) }); });
        const newRowids = new Set(placed.map(p => p.rowid));
        const removed = oldRowids.filter(r => !newRowids.has(r));
        for (const p of placed) await API.updateRecord(p.rowid, [{ controlId: FIELD_IDS.quanzhong, value: String(p.w), valueType: 0 }]);
        for (const r of removed) await API.updateRecord(r, [{ controlId: FIELD_IDS.quanzhong, value: '0', valueType: 0 }]);
        oldRowids = placed.map(p => p.rowid);
        dirty = false; syncBeforeUnload();
        render();
        toast('✓ 必读已保存（' + placed.length + ' 条，含权重写回）', 'success', 3000);
        if (opts.onSaved) opts.onSaved();
    } catch (e) {
        toast('保存失败：' + e.message, 'error', 5000);
        console.error('[mustread save]', e);
    } finally { hideLoading(); }
}
