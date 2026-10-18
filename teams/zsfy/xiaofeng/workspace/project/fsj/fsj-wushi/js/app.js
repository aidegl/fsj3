/**
 * 五事系统 · 主流程
 * agent 切换 → 拉数据 → 树渲染 → 详情行内编辑 → 新建/删除/拖动排序
 */
import { FIELD_IDS, SEW_DIMS, AGENTS, SKELETON_NAMES, QUANXIAN_OPTIONS, QUANXIAN_BY_KEY, CJLX_OPTIONS, CJLX_BY_KEY } from './field-ids.js';
import * as API from './api.js?v=30';
import { buildTree, findAncestors, getDim, isSkeleton } from './filter.js';
import * as Tree from './tree.js';
import * as MustRead from './mustread.js?v=31';
import { showLoading, hideLoading, toast, confirm, escapeHtml } from './ui.js';

// ===== 搜索定位（大树找单条：名称/rowid 模糊 → 展开祖先链 → 滚动高亮）=====
let searchTimer = null;
function initTreeSearch() {
    const input = $('tree-search');
    let box = $('search-results');
    if (!input || !box) return;
    // Portal：结果框挂到 body 用 fixed 定位，脱离树面板的层叠/裁剪上下文（避免被层级树遮挡）
    document.body.appendChild(box);
    const place = () => {
        const r = input.getBoundingClientRect();
        box.style.top = (r.bottom + 4) + 'px';
        box.style.left = r.left + 'px';
        box.style.width = r.width + 'px';
    };

    const hide = () => { box.style.display = 'none'; box.innerHTML = ''; };
    const run = () => {
        place();
        const q = input.value.trim().toLowerCase();
        if (!q) { hide(); return; }
        const matches = myRecords
            .filter(r => (r[FIELD_IDS.mingcheng] || '').toLowerCase().includes(q) || r.rowid.toLowerCase().startsWith(q))
            .slice(0, 20);
        if (!matches.length) {
            box.innerHTML = '<div class="sr-empty">无匹配（共 ' + myRecords.length + ' 条）</div>';
            box.style.display = '';
            return;
        }
        box.innerHTML = matches.map(r => {
            const sew = getDim(r).sew;
            return `<div class="sr-item" data-rid="${r.rowid}">
                <span class="sr-sew">${sew}</span>
                <span class="sr-name">${escapeHtml(r[FIELD_IDS.mingcheng] || '(未命名)')}</span>
                <span class="sr-rid">${r.rowid.slice(0, 8)}…</span>
            </div>`;
        }).join('');
        box.style.display = '';
        box.querySelectorAll('.sr-item').forEach(el => {
            el.onclick = () => {
                const rid = el.dataset.rid;
                const node = findNode(treeData, rid);
                if (!node) { toast('该记录不在当前树中（可能父链断裂）', 'warn'); return; }
                Tree.reveal(rid);
                Tree.setSelected(rid);
                selectedRowid = rid;
                const cur = findNode(treeData, rid);
                if (cur) renderDetailView(cur);
                hide();
                input.value = '';
            };
        });
    };
    input.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(run, 200); });
    input.addEventListener('focus', place);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { clearTimeout(searchTimer); run(); }
        if (e.key === 'Escape') { input.value = ''; hide(); input.blur(); }
    });
    // 滚动/缩放/点其他区域 → 收起
    $('tree').addEventListener('scroll', hide);
    window.addEventListener('resize', hide);
    document.querySelector('.tree-pane').addEventListener('click', (e) => {
        if (!e.target.closest('.tree-search-wrap') && !e.target.closest('#search-results')) hide();
    });
    // 调试钩子：#q=关键词 自动搜索（headless 截图用）
    const mq = location.hash.match(/^#q=([^@]+)(?:@(.+))?$/);
    if (mq) {
        window.__pendingQ = decodeURIComponent(mq[1]);
        if (mq[2]) {
            const sel = $('agentSelect');
            sel.value = mq[2];
            sel.dispatchEvent(new Event('change'));
        }
    }
}

// ===== 状态 =====
let myRecords = [];         // 当前 agent 的全部 12 维记录（服务端已按 fabuzhe 过滤）
let treeData = [];          // 树
let currentAgent = AGENTS[0];
let viewMode = 'detail';    // 视图：detail=编辑详情（默认）/ mustread=权重必读
let selectedRowid = null;   // 当前详情节点
let inlineSaveTimer = null; // 行内编辑防抖定时器（全局唯一：面板重渲染即作废）

// ===== 工具 =====
const $ = (id) => document.getElementById(id);

function findNode(nodes, rowid) {
    for (const n of nodes) {
        if (n.rowid === rowid) return n;
        const hit = findNode(n.children, rowid);
        if (hit) return hit;
    }
    return null;
}

/** v2 时间 'YYYY-MM-DD HH:MM:SS' ↔ datetime-local 'YYYY-MM-DDTHH:MM' */
function toLocalInput(v) {
    if (!v) return '';
    return String(v).slice(0, 16).replace(' ', 'T');
}
function fromLocalInput(v) {
    if (!v) return '';
    return v.replace('T', ' ') + (v.length === 16 ? ':00' : '');
}

function markdownToHtml(value) {
    const escaped = escapeHtml(value || '');
    if (!escaped.trim()) return '<span class="meta-line">暂无正文</span>';
    const lines = escaped.split('\n');
    const html = [];
    let listType = null;
    const closeList = () => {
        if (listType) html.push(`</${listType}>`);
        listType = null;
    };
    const inline = (line) => line
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_]+)__/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    for (const line of lines) {
        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        const unordered = line.match(/^\s*[-*]\s+(.+)$/);
        const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
        if (heading) {
            closeList();
            html.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
        } else if (unordered || ordered) {
            const type = unordered ? 'ul' : 'ol';
            if (listType !== type) { closeList(); listType = type; html.push(`<${type}>`); }
            html.push(`<li>${inline((unordered || ordered)[1])}</li>`);
        } else if (/^\s*>\s?/.test(line)) {
            closeList();
            html.push(`<blockquote>${inline(line.replace(/^\s*>\s?/, ''))}</blockquote>`);
        } else if (line.trim()) {
            closeList();
            html.push(`<p>${inline(line)}</p>`);
        } else closeList();
    }
    closeList();
    return html.join('');
}

function markdownFieldHtml(id, value, dataField = '', readonly = false) {
    return `<div class="markdown-field">
        <div class="markdown-toolbar">
            <span class="meta-line">支持 Markdown</span>
            <div class="markdown-tabs" role="tablist">
                <button type="button" class="btn btn-small markdown-tab active" data-markdown-mode="edit" data-markdown-id="${id}">编辑</button>
                <button type="button" class="btn btn-small markdown-tab" data-markdown-mode="preview" data-markdown-id="${id}">预览</button>
            </div>
        </div>
        <textarea id="${id}"${dataField ? ` data-f="${dataField}"` : ''}${readonly ? ' readonly title="完全引用内容为只读（随所引记录自动同步）"' : ''} rows="5" placeholder="正文（选填）">${escapeHtml(value || '')}</textarea>
        <div class="markdown-preview" data-markdown-preview="${id}" hidden></div>
    </div>`;
}

function setupMarkdownField(id) {
    const field = $(id);
    const preview = document.querySelector(`[data-markdown-preview="${id}"]`);
    const buttons = document.querySelectorAll(`[data-markdown-id="${id}"]`);
    if (!field || !preview) return;
    const setMode = (mode) => {
        const isPreview = mode === 'preview';
        field.hidden = isPreview;
        preview.hidden = !isPreview;
        preview.innerHTML = markdownToHtml(field.value);
        buttons.forEach(button => button.classList.toggle('active', button.dataset.markdownMode === mode));
    };
    buttons.forEach(button => button.onclick = () => setMode(button.dataset.markdownMode));
    field.oninput = () => { preview.innerHTML = markdownToHtml(field.value); };
}

// ===== 初始化 =====
function init() {
    const sel = $('agentSelect');
    AGENTS.forEach((a, i) => {
        const opt = document.createElement('option');
        opt.value = a.rowid;
        opt.textContent = a.name;
        if (i === 0) opt.selected = true;
        sel.appendChild(opt);
    });
    sel.onchange = async () => {
        if (viewMode === 'mustread' && MustRead.isDirty()) {
            const ok = await confirm('必读板有未保存改动，切换 Agent 将丢失，确定？');
            if (!ok) { sel.value = currentAgent.rowid; return; }
            MustRead.discard();
        }
        currentAgent = AGENTS.find(a => a.rowid === sel.value) || AGENTS[0];
        selectedRowid = null;
        Tree.resetExpand();
        if (viewMode === 'mustread') {
            MustRead.show(currentAgent, mustreadCallbacks());
            return;
        }
        renderDetailEmpty();
        reload('切换 Agent：' + currentAgent.name);
    };
    $('viewMode').onchange = async () => {
        const next = $('viewMode').value;
        if (next === viewMode) return;
        if (viewMode === 'mustread' && MustRead.isDirty()) {
            const ok = await confirm('必读板有未保存改动，离开将丢失，确定？');
            if (!ok) { $('viewMode').value = viewMode; return; }
            MustRead.discard();
        }
        viewMode = next;
        applyViewMode();
    };
    $('btnRefresh').onclick = () => reload('重新拉取最新数据…');
    Tree.initTree({
        onSelect: (node) => {
            selectedRowid = node.rowid; Tree.setSelected(node.rowid);
            if (viewMode === 'mustread') { MustRead.onTreeNodeClick(node); return; }
            renderDetailView(node); rerenderKeepState();
        },
        onAdd: (node) => renderAddForm(node),
        onDelete: (node) => confirmDelete(node),
        onDrop: (src, target, pos) => handleDrop(src, target, pos)
    });
    reload();  // 首次加载（Dify 服务端过滤，1-2 秒）
    initTreeSearch();
}

function rerenderKeepState() {
    Tree.mount($('tree'), treeData);
}

// ===== 数据加载（Dify 通道服务端按 fabuzhe 过滤：只拉当前 agent 数据，1-2 秒） =====
async function reload(loadingText) {
    showLoading(loadingText || `拉取 ${currentAgent.name} 的五事数据…`);
    try {
        myRecords = await API.fetchAgentRows(currentAgent.rowid, (p) => {
            showLoading(`拉取 ${currentAgent.name} 数据… ${p.fetched}/${p.total || '?'} 条${p.note ? '（' + p.note + '）' : ''}`);
        });
        treeData = buildTree(myRecords);
        renderStat();
        rerenderKeepState();
        // 调试钩子待执行的自动搜索（切 agent 后数据就位再搜）
        if (window.__pendingQ) {
            const input = $('tree-search');
            if (input) {
                input.value = window.__pendingQ;
                setTimeout(() => input.dispatchEvent(new Event('input')), 300);
            }
            window.__pendingQ = null;
        }
        // 恢复选中
        if (viewMode === 'mustread') { MustRead.onLocalRefresh(); return; }
        if (selectedRowid) {
            const node = findNode(treeData, selectedRowid);
            if (node) renderDetailView(node);
            else { selectedRowid = null; renderDetailEmpty(); }
        } else {
            renderDetailEmpty();
        }
    } catch (e) {
        toast('加载失败：' + e.message, 'error', 5000);
        console.error('[reload]', e);
    } finally {
        hideLoading();
    }
}

function renderStat() {
    const total = myRecords.length;
    const done = myRecords.filter(r => r[FIELD_IDS.wancheng] === '1').length;
    $('statBadge').textContent = `${total} 条 · 完成 ${done}`;
}

// ===== 视图模式（编辑详情 / 权重必读） =====
function mustreadCallbacks() {
    return {
        // 本地优先查节点详情（树/记录缓存），miss 由 mustread 自行走 API
        getLocalRec: (rowid) => {
            const n = findNode(treeData, rowid);
            return n ? n.rec : (myRecords.find(r => r.rowid === rowid) || null);
        },
        // 保存成功 → 刷新树（权重写回会改变树序/权重色）
        onSaved: () => { renderStat(); reload('必读已保存，刷新树…'); }
    };
}

function applyViewMode() {
    if (viewMode === 'mustread') {
        MustRead.show(currentAgent, mustreadCallbacks());
        return;
    }
    const header = document.querySelector('.detail-pane .pane-header');
    if (header) header.textContent = '详情';
    const node = selectedRowid ? findNode(treeData, selectedRowid) : null;
    if (node) renderDetailView(node); else renderDetailEmpty();
}

// ===== 详情：查看 =====
function renderDetailEmpty() {
    $('detail-body').innerHTML = '<div class="empty-state">← 点选节点查看详情</div>';
}

function renderDetailView(node) {
    const rec = node.rec;
    const body = $('detail-body');
    const dim = getDim(rec);

    // 大字段懒加载：列表为省流量不含 wznr/guanjianci，首次打开详情时补拉（椰果 3400+ 条场景）
    if (!rec._full && rec._lazyWznr === undefined) {
        rec._lazyWznr = true;
        API.getRecordDetail(rec.rowid).then(full => {
            // 只回填缺的字段，不覆盖面板上未保存的编辑
            for (const k of Object.keys(full)) {
                if (rec[k] === undefined || rec[k] === '' || rec[k] === null) rec[k] = full[k];
            }
            rec._full = true;
            // 不整面板重绘（会清掉用户正在输入的内容）——只回填当前未被编辑的字段值
            if (body.dataset.rid === node.rowid) {
                body.querySelectorAll('[data-f]').forEach(function (el) {
                    if (document.activeElement === el) return;   // 用户正在编辑，不打断
                    var k = el.dataset.f;
                    if (full[k] === undefined || document.getElementById('chat-input')) { /* noop */ }
                    var v = full[k];
                    if (v === undefined || v === null) v = '';
                    if (el.value !== String(v)) el.value = String(v);
                    if (el.dataset.markdownId && !el.hidden) {
                        var pv = document.querySelector('[data-markdown-preview="' + el.id + '"]');
                        if (pv && !pv.hidden) pv.innerHTML = markdownToHtml(el.value);
                    }
                });
            }
        }).catch(e => console.warn('[detail] 大字段补拉失败', e));
    }

    // 引用数据：懒初始化（节点对象上挂 refs 数组，MVP 不持久化，刷新即清零）
    if (!node.refs) node.refs = [];

    // 完全引用判断：wqyy（Relation 单选）非空 = 本记录正文即所引记录正文（展示 wqyywznr，只读）
    const wqyyRaw = rec[FIELD_IDS.wqyy];
    const isQuote = Array.isArray(wqyyRaw) ? wqyyRaw.length > 0 : !!(wqyyRaw && wqyyRaw !== '');
    const quoteName = (isQuote && Array.isArray(wqyyRaw) && wqyyRaw[0]) ? (wqyyRaw[0].name || wqyyRaw[0].sid || '') : '';

    // 路径面包屑
    const ancestors = findAncestors(myRecords, rec.rowid);
    const pathHtml = ancestors.map(rid => {
        const r = myRecords.find(x => x.rowid === rid);
        if (!r) return '';
        return `<div class="detail-path-line">${escapeHtml(r[FIELD_IDS.mingcheng] || '(未命名)')}</div>`;
    }).join('') + `<div class="detail-path-line">${escapeHtml(rec[FIELD_IDS.mingcheng] || '(未命名)')}</div>`;

    const skel = isSkeleton(node, nodeDepth(node));
    const wanchengVal = rec[FIELD_IDS.wancheng] === '1';
    const fbsjVal = toLocalInput(rec[FIELD_IDS.fbsj]);
    // 完成项仅 7目标/8计划 显示（2026-09-03）
    const isTaskOrTarget = dim.sew === '7目标' || dim.sew === '8计划';
    const wanchengHtml = isTaskOrTarget ? `
            <div class="detail-row">
                <span class="label">完成</span>
                <input type="checkbox" data-f="wancheng" ${wanchengVal ? 'checked' : ''} style="width:auto">
            </div>` : '';

    body.innerHTML = `
        <div class="detail-section">
            <div class="detail-row" style="margin-bottom:6px">
                <span class="dim-icon" style="background:${dim.color}1a;color:${dim.text || dim.color}${dim.border ? `;border:${dim.border}` : ''}">${dim.icon}</span>
                <span class="detail-dim-badge" style="background:${dim.color};${dim.text ? `color:${dim.text};` : ''}${dim.border ? `border:${dim.border};` : ''}">${dim.sew}</span>
            </div>
            ${pathHtml ? `<div style="margin-bottom:10px">${pathHtml}</div>` : ''}
        </div>
        <div class="detail-section">
            <h3>字段（行内编辑，自动保存）</h3>
            ${wanchengHtml}
            <div class="detail-row">
                <span class="label">维度 (sew)</span>
                <select data-f="sew">${SEW_DIMS.map(d =>
                    `<option value="${d.key}" ${d.key === dim.key ? 'selected' : ''} style="color:${d.text || d.color}">${d.sew}</option>`).join('')}
                </select>
            </div>
            <div class="detail-row">
                <span class="label">层级逻辑 (cjlx)</span>
                <select data-f="cjlx">
                    <option value="">（未设置）</option>
                    ${(() => {
                        const cur = Array.isArray(rec[FIELD_IDS.cjlx]) && rec[FIELD_IDS.cjlx][0] ? rec[FIELD_IDS.cjlx][0].sid : (rec[FIELD_IDS.cjlx] || '');
                        return CJLX_OPTIONS.map(o => `<option value="${o.key}" ${o.key === cur ? 'selected' : ''}>${o.label}</option>`).join('');
                    })()}
                </select>
            </div>

            <div class="detail-row">
                <span class="label">名称</span>
                ${isQuote ? `<span class="qx-dot" style="background:#722ed1;flex-shrink:0"></span>`
                    + `<span style="font-size:12px;color:#722ed1;flex-shrink:0;font-weight:600">⚡ 完全引用</span>` : ''}
                <input type="text" data-f="mingcheng" value="${escapeHtml(rec[FIELD_IDS.mingcheng] || '')}">
            </div>
            <div class="detail-row wznr-row miaoshu-row">
                <span class="label">描述 (miaoshu)</span>
                <textarea data-f="miaoshu" placeholder="描述（选填，可长文本）">${escapeHtml(rec[FIELD_IDS.miaoshu] || '')}</textarea>
            </div>
            <div class="detail-row wznr-row">
                <span class="label">${isQuote ? '正文（完全引用 · wqyywznr）' : '正文 (wznr)'}</span>
                ${isQuote
                    ? markdownFieldHtml('detail-wznr', rec[FIELD_IDS.wqyywznr] || '', 'wqyywznr', true)
                    : markdownFieldHtml('detail-wznr', rec[FIELD_IDS.wznr] || '', 'wznr')}
                ${isQuote ? `<div class="meta-line">🔗 完全引用${quoteName ? '自「' + escapeHtml(quoteName) + '」' : ''}：正文与所引记录保持一致，随其自动更新（只读）</div>` : ''}
            </div>
            <div class="detail-row">
                <span class="label">权重</span>
                <input type="number" data-f="quanzhong" value="${escapeHtml(rec[FIELD_IDS.quanzhong] ?? 0)}">
            </div>
            <div class="detail-row">
                <span class="label">事件时间</span>
                <input type="datetime-local" data-f="fbsj" value="${fbsjVal}">
            </div>
            <div class="detail-row">
                <span class="label">权限</span>
                <div class="qx-grid">
                    ${(() => {
                        const curQx = new Set((rec[FIELD_IDS.quanxian] || []).map(x => x.sid));
                        return QUANXIAN_OPTIONS.map(o => `
                            <label class="qx-opt" title="${o.label}">
                                <input type="checkbox" data-f="quanxian" value="${o.key}" ${curQx.has(o.key) ? 'checked' : ''}>
                                <span class="qx-dot" style="background:${o.color}"></span>${o.label}
                            </label>`).join('');
                    })()}
                </div>
            </div>
            ${(() => {
                const isTask = dim.sew === '7目标' || dim.sew === '8计划';
                const isPublic = (rec[FIELD_IDS.quanxian] || []).some(x => x.sid === 'e1d9b90b-cabe-4a6b-bb57-efb17c792bb8');
                if (!isTask || !isPublic) return '';
                const members = rec[FIELD_IDS.ptyh] || [];
                return `
            <div class="detail-row" style="align-items:flex-start">
                <span class="label">委派给</span>
                <div class="kjzz-wrap">
                    <div id="ptyh-list" class="ref-list">
                        ${members.map((k, i) => `
                            <div class="ref-item">
                                <span class="ref-item-text" title="${escapeHtml(k.sid)}">${escapeHtml(k.name || k.sid)}</span>
                                <button class="ref-del-btn" data-ptyh-i="${i}" title="移除委派">✕</button>
                            </div>
                        `).join('') || '<div class="meta-line" style="font-style:italic">未委派成员（公开任务可委派给组织内成员）</div>'}
                    </div>
                    <button class="btn btn-small" id="btnPickDelegate" style="margin-top:8px">＋ 委派成员</button>
                </div>
            </div>`;
            })()}
            <div class="detail-row">
                <span class="label">可见组织</span>
                <div class="kjzz-wrap">
                    <div id="kjzz-list" class="ref-list">
                        ${(rec[FIELD_IDS.kjzz] || []).map((k, i) => `
                            <div class="ref-item">
                                <span class="ref-item-text" title="${escapeHtml(k.sid)}">${escapeHtml(k.name || k.sid)}</span>
                                <button class="ref-del-btn" data-kjzz-i="${i}" title="移除组织">✕</button>
                            </div>
                        `).join('') || '<div class="meta-line" style="font-style:italic">未指定可见组织</div>'}
                    </div>
                    <button class="btn btn-small" id="btnPickKjzz" style="margin-top:8px">＋ 选择组织</button>
                </div>
            </div>
        </div>
        <div class="detail-section">
            <h3>元信息</h3>
            <div class="meta-line rowid-line">
                <span class="rowid-text">rowid: ${escapeHtml(rec.rowid || '')}</span>
                <button class="btn btn-small" id="btnCopyRowid">📋 复制 rowid</button>
            </div>
            <div class="meta-line">创建: ${escapeHtml(rec.ctime || '-')}</div>
            <div class="meta-line">更新: ${escapeHtml(rec.utime || '-')}</div>
        </div>
        <div class="detail-section">
            <h3>🔗 引用数据（${(rec[FIELD_IDS.yynr] || []).length}）</h3>
            <div id="refs-list" class="ref-list">
                ${(rec[FIELD_IDS.yynr] || []).map((r, i) => `
                    <div class="ref-item">
                        <span class="ref-item-text" title="${escapeHtml(r.sid)}">${escapeHtml(r.name || r.sid)}</span>
                        <button class="ref-del-btn" data-ref-i="${i}" title="移除引用">✕</button>
                    </div>
                `).join('') || '<div class="meta-line" style="font-style:italic">还没有引用</div>'}
            </div>
            <button class="btn btn-small" id="btnAddRef" style="margin-top:8px">＋ 添加引用</button>
        </div>
        <div class="detail-section">
            <h3>⚡ 完全引用${rec[FIELD_IDS.wqyy] && rec[FIELD_IDS.wqyy].length ? '（1）' : ''}</h3>
            <div id="wqyy-list" class="ref-list">
                ${(rec[FIELD_IDS.wqyy] || []).map(r => `
                    <div class="ref-item">
                        <span class="ref-item-text" title="${escapeHtml(r.sid)}">${escapeHtml(r.name || r.sid)}</span>
                        <button class="ref-del-btn" data-wqyy-del="1" title="移除完全引用">✕</button>
                    </div>
                `).join('') || '<div class="meta-line" style="font-style:italic">未设置完全引用（零增量复制品：正文自动同步所引原文，只读）</div>'}
            </div>
            <button class="btn btn-small" id="btnSetWqyy" style="margin-top:8px" ${rec[FIELD_IDS.wqyy] && rec[FIELD_IDS.wqyy].length ? 'disabled title="已有完全引用，先移除再重设"' : ''}>⚡ 完全引用</button>
            <div class="meta-line">与「引用数据」的区别：完全引用 = 零增量复制品（只能一条），正文自动同步所引原文</div>
        </div>

        <div class="detail-section">
            <div class="detail-actions-bar">
                <button class="btn btn-primary" id="btnAddChild">＋ 在此节点下新建</button>
                ${skel ? '' : '<button class="btn btn-danger" id="btnDel">🗑 物理删除</button>'}
            </div>
            ${skel ? '<div class="meta-line" style="margin-top:8px">骨架节点不可删除</div>' : '<div class="meta-line" style="margin-top:8px">物理删除不可恢复</div>'}
        </div>
    `;

    // 行内编辑绑定（timer 全局唯一：重渲染即作废待存定时器，防止旧节点的保存读到新节点的表单）
    clearTimeout(inlineSaveTimer);
    body.dataset.rid = node.rowid; // 面板当前归属节点（saveInline 防串门禁）
    const scheduleSave = () => {
        clearTimeout(inlineSaveTimer);
        inlineSaveTimer = setTimeout(() => saveInline(body, node), 400);
    };
    body.querySelectorAll('[data-f]').forEach(el => {
        if (el.tagName === 'SELECT' || el.type === 'checkbox') el.onchange = scheduleSave;
        else el.onblur = scheduleSave;
    });
    setupMarkdownField('detail-wznr');

    // 复制 rowid
    const copyBtn = $('btnCopyRowid');
    if (copyBtn) copyBtn.onclick = async () => {
        const text = rec.rowid || '';
        try {
            await navigator.clipboard.writeText(text);
            toast('✓ rowid 已复制', 'success', 1500);
        } catch (e) {
            // 非安全上下文兜底：临时 textarea + execCommand
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            toast('✓ rowid 已复制', 'success', 1500);
        }
    };

    $('btnAddChild').onclick = () => renderAddForm(node);
    const delBtn = $('btnDel');
    if (delBtn) delBtn.onclick = () => confirmDelete(node);

    // 引用数据：添加 + 删除（持久化到 HAP yynr 字段）
    const addRefBtn = $('btnAddRef');
    if (addRefBtn) addRefBtn.onclick = () => openRefModal(node);

    // 完全引用（wqyy 单选）：移除 + 设为完全引用
    body.querySelectorAll('[data-wqyy-del]').forEach(btn => {
        btn.onclick = async () => {
            console.log('[移除wqyy] click rowid=' + rec.rowid + ' dataset=' + JSON.stringify(btn.dataset));
            try {
                await API.updateRecord(rec.rowid, [
                    { controlId: FIELD_IDS.wqyy, value: '' }
                ]);
                rec[FIELD_IDS.wqyy] = [];
                renderDetailView(node);
                toast('已移除完全引用（正文恢复本地 wznr）', 'info', 2000);
            } catch (e) {
                console.error('[移除wqyy] API 失败:', e);
                toast('移除失败：' + e.message, 'error', 3000);
            }
        };
    });
    const wqyyBtn = $('btnSetWqyy');
    if (wqyyBtn) wqyyBtn.onclick = () => openRefModal(node, 'wqyy');

    body.querySelectorAll('[data-ref-i]').forEach(btn => {
        btn.onclick = async () => {
            const i = Number(btn.dataset.refI);
            const cur = rec[FIELD_IDS.yynr] || [];
            console.log('[移除yynr] click rowid=' + rec.rowid + ' i=' + i + ' curLen=' + cur.length + ' dataset=' + JSON.stringify(btn.dataset));
            if (!Number.isFinite(i) || i < 0 || i >= cur.length) { console.warn('[移除yynr] 越界/NaN，跳过'); return; }
            const removed = cur.splice(i, 1)[0];
            if (!removed) { console.warn('[移除yynr] removed falsy，跳过'); return; }
            try {
                await API.updateRecord(rec.rowid, [
                    { controlId: FIELD_IDS.yynr, value: cur.map(x => x.sid).join(',') }
                ]);
                renderDetailView(node);
                toast(`已移除「${removed.name || removed.sid.slice(0, 8)}」引用`, 'info', 1500);
            } catch (e) {
                console.error('[移除yynr] API 失败:', e);
                toast('移除失败：' + e.message, 'error', 3000);
            }
        };
    });

    // 可见组织（kjzz）：chip 移除 + 打开选择弹窗
    body.querySelectorAll('[data-kjzz-i]').forEach(btn => {
        btn.onclick = async () => {
            const i = Number(btn.dataset.kjzzI);
            const cur = rec[FIELD_IDS.kjzz] || [];
            console.log('[移除kjzz] click rowid=' + rec.rowid + ' i=' + i + ' curLen=' + cur.length + ' dataset=' + JSON.stringify(btn.dataset));
            if (!Number.isFinite(i) || i < 0 || i >= cur.length) { console.warn('[移除kjzz] 越界/NaN，跳过'); return; }
            const removed = cur.splice(i, 1)[0];
            if (!removed) { console.warn('[移除kjzz] removed falsy，跳过'); return; }
            try {
                await API.updateRecord(rec.rowid, [
                    { controlId: FIELD_IDS.kjzz, value: cur.map(x => x.sid).join(','), valueType: 2 }
                ]);
                renderDetailView(node);
                toast(`已移除组织「${removed.name || removed.sid.slice(0, 8)}」`, 'info', 1500);
            } catch (e) {
                console.error('[移除kjzz] API 失败:', e);
                toast('移除失败：' + e.message, 'error', 3000);
            }
        };
    });
    const kjzzBtn = $('btnPickKjzz');
    if (kjzzBtn) kjzzBtn.onclick = () => openKjzzModal(node);

    // 任务委派（ptyh）：chip 移除 + 打开选择弹窗（仅 公开的目标/计划）
    body.querySelectorAll('[data-ptyh-i]').forEach(btn => {
        btn.onclick = async () => {
            const i = Number(btn.dataset.ptyhI);
            const cur = rec[FIELD_IDS.ptyh] || [];
            console.log('[移除ptyh] click rowid=' + rec.rowid + ' i=' + i + ' curLen=' + cur.length + ' dataset=' + JSON.stringify(btn.dataset));
            if (!Number.isFinite(i) || i < 0 || i >= cur.length) { console.warn('[移除ptyh] 越界/NaN，跳过'); return; }
            const removed = cur.splice(i, 1)[0];
            if (!removed) { console.warn('[移除ptyh] removed falsy，跳过'); return; }
            try {
                const resp = await API.updateRecord(rec.rowid, [
                    { controlId: FIELD_IDS.ptyh, value: cur.map(x => x.sid).join(','), valueType: 2 }
                ]);
                if (!resp.success) throw new Error(JSON.stringify(resp).slice(0, 120));
                renderDetailView(node);
                toast(`已移除委派「${removed.name || removed.sid.slice(0, 8)}」`, 'info', 1500);
            } catch (e) {
                console.error('[移除ptyh] API 失败:', e);
                toast('移除失败：' + e.message, 'error', 3000);
            }
        };
    });
    const dlgBtn = $('btnPickDelegate');
    if (dlgBtn) dlgBtn.onclick = () => openDelegateModal(node);
}

/** 引用数据弹窗：实时全表搜索（Dify keyWords 全字段），点击写入 rec.yynr（HAP 持久化） */
let refSearchTimer = null;
let refCurrentNode = null;

function openRefModal(node, target) {
    target = target || 'yynr';   // 'yynr' 多选引用 | 'wqyy' 完全引用（单选）
    refCurrentNode = node;
    const modal = $('ref-modal');
    const input = $('ref-search-input');
    const results = $('ref-search-results');
    input.value = '';
    results.innerHTML = '<div class="ref-result-empty">输入关键词开始搜索</div>';
    modal.style.display = 'flex';
    setTimeout(() => input.focus(), 50);

    input.oninput = () => {
        clearTimeout(refSearchTimer);
        const q = input.value.trim();
        if (!q) { results.innerHTML = '<div class="ref-result-empty">输入关键词开始搜索</div>'; return; }
        results.innerHTML = '<div class="ref-result-empty">搜索中…</div>';
        refSearchTimer = setTimeout(async () => {
            try {
                const { rows } = await API.searchByKeyword(q, 20);
                // 过滤掉自己和已有的引用
                const existed = new Set((refCurrentNode.rec[FIELD_IDS.yynr] || []).map(r => r.sid));
                if (target === 'wqyy') { /* 完全引用单选：不排除 yynr 已引的，仅排除自身（下方已加） */ }
                existed.add(refCurrentNode.rowid);
                const filtered = rows.filter(r => !existed.has(r.rowid));
                if (!filtered.length) { results.innerHTML = '<div class="ref-result-empty">无匹配结果</div>'; return; }
                results.innerHTML = filtered.map(r => `
                    <div class="ref-result-item" data-rowid="${r.rowid}">
                        <div class="ref-result-mc">${escapeHtml(r.mingcheng || '(无)')}</div>
                        <div class="ref-result-meta">${escapeHtml(r.sew || '')} · ${escapeHtml(r.fabuzhe || '')} · ${r.rowid.slice(0, 8)}…</div>
                    </div>
                `).join('');
                results.querySelectorAll('.ref-result-item').forEach(item => {
                    item.onclick = async () => {
                        const rid = item.dataset.rowid;
                        const picked = filtered.find(r => r.rowid === rid);
                                                if (picked && refCurrentNode && target === 'wqyy') {
                            const rec = refCurrentNode.rec;
                            try {
                                // 完全引用：单选；若该条已在 yynr 里则同时摘除（避免双标）
                                const controls = [{ controlId: FIELD_IDS.wqyy, value: rid, valueType: 2 }];
                                const hadYynr = (rec[FIELD_IDS.yynr] || []).some(x => x.sid === rid);
                                if (hadYynr) controls.push({ controlId: FIELD_IDS.yynr, value: (rec[FIELD_IDS.yynr] || []).filter(x => x.sid !== rid).map(x => x.sid).join(',') });
                                await API.updateRecord(rec.rowid, controls);
                                rec[FIELD_IDS.wqyy] = [{ sid: rid, name: picked.mingcheng }];
                                if (hadYynr) rec[FIELD_IDS.yynr] = (rec[FIELD_IDS.yynr] || []).filter(x => x.sid !== rid);
                                renderDetailView(refCurrentNode);
                                closeRefModal();
                                toast(`⚡ 已完全引用「${picked.mingcheng}」（正文自动同步其原文）`, 'success', 2500);
                            } catch (e) {
                                toast('写入失败：' + e.message, 'error', 4000);
                            }
                            return;
                        }
                        if (picked && refCurrentNode) {
                            const rec = refCurrentNode.rec;
                            const curList = (rec[FIELD_IDS.yynr] || []).map(x => x.sid);
                            if (!curList.includes(rid)) curList.push(rid);
                            try {
                                // v2 正确格式：value = 逗号分隔的 rowid 字符串（东城 2026-09-04）
                                await API.updateRecord(rec.rowid, [
                                    { controlId: FIELD_IDS.yynr, value: curList.join(',') }
                                ]);
                                // 乐观更新本地 yynr（保留已有 name，新加的用 picked.mingcheng）
                                const nameMap = new Map((rec[FIELD_IDS.yynr] || []).map(x => [x.sid, x.name]));
                                nameMap.set(rid, picked.mingcheng);
                                rec[FIELD_IDS.yynr] = curList.map(sid => ({ sid, name: nameMap.get(sid) || '' }));
                                renderDetailView(refCurrentNode);
                                closeRefModal();
                                toast(`✓ 已引用「${picked.mingcheng}」`, 'success', 1500);
                            } catch (e) {
                                toast('写入失败：' + e.message, 'error', 4000);
                            }
                        }
                    };
                });
            } catch (e) {
                results.innerHTML = '<div class="ref-result-empty">搜索失败：' + escapeHtml(e.message) + '</div>';
            }
        }, 300);
    };

    // 关闭（背景点击 + 关闭按钮 + ESC）
    modal.querySelector('.ref-overlay').onclick = closeRefModal;
    $('ref-modal-close').onclick = closeRefModal;
    const escHandler = (e) => { if (e.key === 'Escape') { closeRefModal(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);
}

function closeRefModal() {
    $('ref-modal').style.display = 'none';
    clearTimeout(refSearchTimer);
    refCurrentNode = null;
}

/** 可见组织（kjzz）弹窗：列出群组表 fabuzhe=当前 agent 的组织，勾选写入 kjzz */
let kjzzCurrentNode = null;
const orgsCache = {};   // agentRowid → [{rowid, mingcheng}]（跨节点复用，切 agent 各自缓存）

async function openKjzzModal(node) {
    kjzzCurrentNode = node;
    const modal = $('kjzz-modal');
    const listBox = $('kjzz-pick-list');
    modal.style.display = 'flex';
    listBox.innerHTML = '<div class="ref-result-empty">加载组织列表…</div>';
    try {
        if (!orgsCache[currentAgent.rowid]) {
            orgsCache[currentAgent.rowid] = await API.fetchOrgs(currentAgent.rowid);
        }
        const orgs = orgsCache[currentAgent.rowid];
        const curSids = new Set((node.rec[FIELD_IDS.kjzz] || []).map(x => x.sid));
        listBox.innerHTML = orgs.length ? orgs.map(o => `
            <label class="kjzz-opt">
                <input type="checkbox" value="${o.rowid}" ${curSids.has(o.rowid) ? 'checked' : ''}>
                <span class="kjzz-opt-name">${escapeHtml(o.mingcheng)}</span>
                <span class="kjzz-opt-rid">${o.rowid.slice(0, 8)}…</span>
            </label>
        `).join('') : '<div class="ref-result-empty">你不是任何组织的成员（zzyh），先去 HAP 建组织并把自己加进组织用户</div>';
    } catch (e) {
        listBox.innerHTML = '<div class="ref-result-empty">组织列表加载失败：' + escapeHtml(e.message) + '</div>';
    }
}

async function saveKjzzFromModal() {
    const node = kjzzCurrentNode;
    if (!node) return;
    const listBox = $('kjzz-pick-list');
    const picked = Array.from(listBox.querySelectorAll('input[type="checkbox"]:checked')).map(el => el.value);
    const rec = node.rec;
    const curKeys = (rec[FIELD_IDS.kjzz] || []).map(x => x.sid).join(',');
    const newKeys = picked.join(',');
    if (newKeys === curKeys) { closeKjzzModal(); return; }
    try {
        const resp = await API.updateRecord(rec.rowid, [
            { controlId: FIELD_IDS.kjzz, value: newKeys, valueType: 2 }
        ]);
        if (!resp.success) throw new Error(JSON.stringify(resp).slice(0, 120));
        // 乐观更新本地（orgsCache 里有名字，兜底显示 rowid）
        const orgs = orgsCache[currentAgent.rowid] || [];
        rec[FIELD_IDS.kjzz] = picked.map(rid => ({
            sid: rid,
            name: (orgs.find(o => o.rowid === rid) || {}).mingcheng || rid
        }));
        renderDetailView(node);
        closeKjzzModal();
        toast('✓ 可见组织已保存', 'success', 1500);
    } catch (e) {
        toast('保存失败：' + e.message, 'error', 4000);
    }
}

function closeKjzzModal() {
    $('kjzz-modal').style.display = 'none';
    kjzzCurrentNode = null;
}

function initKjzzModal() {
    $('kjzz-modal').querySelector('.ref-overlay').onclick = closeKjzzModal;
    $('kjzz-modal-cancel').onclick = closeKjzzModal;
    $('kjzz-modal-ok').onclick = saveKjzzFromModal;
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && $('kjzz-modal').style.display === 'flex') closeKjzzModal();
    });
}

function nodeDepth(node) {
    // 从 treeData 算深度
    const walk = (nodes, d) => {
        for (const n of nodes) {
            if (n.rowid === node.rowid) return d;
            const hit = walk(n.children, d + 1);
            if (hit >= 0) return hit;
        }
        return -1;
    };
    return walk(treeData, 0);
}

/** 行内字段保存 */
async function saveInline(body, node) {
    // 门禁：定时器触发时面板可能已切到其他节点/新建表单——闭包里的 node 还是旧的，
    // 继续执行会把当前表单值整包写到旧节点上（"A 的信息全变 B"的根源），直接作废
    if (body.dataset.rid !== node.rowid) return;
    const rec = node.rec;
    const get = (name) => body.querySelector(`[data-f="${name}"]`);
    const controls = [];

    // wancheng（仅 7目标/8计划 详情有此勾选，其他维度无该元素）
    const wEl = get('wancheng');
    if (wEl) {
        const newW = wEl.checked ? '1' : '0';
        if (newW !== (rec[FIELD_IDS.wancheng] || '0')) {
            controls.push({ controlId: FIELD_IDS.wancheng, value: newW, valueType: 0 });
            rec[FIELD_IDS.wancheng] = newW;
        }
    }
    // sew
    const sEl = get('sew');
    if (sEl) {
        const newKey = sEl.value;
        const cur = Array.isArray(rec[FIELD_IDS.sew]) && rec[FIELD_IDS.sew][0] ? rec[FIELD_IDS.sew][0].sid : '';
        if (newKey !== cur) {
            controls.push({ controlId: FIELD_IDS.sew, value: newKey, valueType: 2 });
            rec[FIELD_IDS.sew] = [{ sid: newKey, name: (SEW_DIMS.find(d => d.key === newKey) || {}).sew || '' }];
        }
    }
    // cjlx（层级逻辑下拉；空=未设置）
    const cEl = get('cjlx');
    if (cEl) {
        const newKey = cEl.value;
        const curC = Array.isArray(rec[FIELD_IDS.cjlx]) && rec[FIELD_IDS.cjlx][0] ? rec[FIELD_IDS.cjlx][0].sid : (rec[FIELD_IDS.cjlx] || '');
        if (newKey !== curC) {
            if (newKey === '') { controls.push({ controlId: FIELD_IDS.cjlx, value: '' }); rec[FIELD_IDS.cjlx] = []; }
            else {
                controls.push({ controlId: FIELD_IDS.cjlx, value: newKey, valueType: 2 });
                rec[FIELD_IDS.cjlx] = [{ sid: newKey, name: (CJLX_BY_KEY[newKey] || {}).label || '' }];
            }
        }
    }

    // mingcheng
    const mEl = get('mingcheng');
    const newM = mEl.value.trim();
    if (newM && newM !== (rec[FIELD_IDS.mingcheng] || '')) {
        controls.push({ controlId: FIELD_IDS.mingcheng, value: newM });
        rec[FIELD_IDS.mingcheng] = newM;
    }
    // miaoshu（描述；可清空 → 传空串覆盖）
    const msEl = get('miaoshu');
    if (msEl) {
        const newMs = msEl.value.trim();
        if (newMs !== (rec[FIELD_IDS.miaoshu] || '')) {
            controls.push({ controlId: FIELD_IDS.miaoshu, value: newMs });
            rec[FIELD_IDS.miaoshu] = newMs;
        }
    }
    // wznr
    const wzEl = get('wznr');
    const newWz = wzEl.value;
    if (newWz !== (rec[FIELD_IDS.wznr] || '')) {
        controls.push({ controlId: FIELD_IDS.wznr, value: newWz });
        rec[FIELD_IDS.wznr] = newWz;
    }
    // quanzhong
    const qEl = get('quanzhong');
    const newQ = String(Number(qEl.value) || 0);
    if (newQ !== String(rec[FIELD_IDS.quanzhong] ?? '')) {
        controls.push({ controlId: FIELD_IDS.quanzhong, value: newQ, valueType: 0 });
        rec[FIELD_IDS.quanzhong] = newQ;
    }
    // fbsj
    const fEl = get('fbsj');
    const newF = fromLocalInput(fEl.value);
    if (newF !== (rec[FIELD_IDS.fbsj] || '')) {
        controls.push({ controlId: FIELD_IDS.fbsj, value: newF });
        rec[FIELD_IDS.fbsj] = newF;
    }
    // quanxian（权限多选：勾选集合变化才写；值为 option key 逗号串，valueType 2）
    const qxEls = body.querySelectorAll('[data-f="quanxian"]');
    if (qxEls.length) {
        const newKeys = Array.from(qxEls).filter(el => el.checked).map(el => el.value).join(',');
        const curKeys = (rec[FIELD_IDS.quanxian] || []).map(x => x.sid).join(',');
        if (newKeys !== curKeys) {
            controls.push({ controlId: FIELD_IDS.quanxian, value: newKeys, valueType: 2 });
            rec[FIELD_IDS.quanxian] = newKeys
                ? newKeys.split(',').map(k => ({ sid: k, name: (QUANXIAN_BY_KEY[k] || {}).label || k }))
                : [];
        }
    }

    if (!controls.length) return;
    try {
        const resp = await API.updateRecord(node.rowid, controls);
        if (!resp.success) throw new Error(JSON.stringify(resp).slice(0, 120));
        toast('✓ 已自动保存', 'success', 1200);
        // sew/wancheng 变化影响树展示 → 重渲染
        if (controls.some(c => c.controlId === FIELD_IDS.sew || c.controlId === FIELD_IDS.wancheng)) {
            rerenderKeepState();
        }
        renderStat();
    } catch (e) {
        toast('保存失败：' + e.message, 'error', 4000);
        console.error('[saveInline]', e);
    }
}

// ===== 新建 =====
function renderAddForm(parentNode) {
    const body = $('detail-body');
    delete body.dataset.rid; // 新建表单不属于任何节点：挂空的行内保存门禁一律作废
    const parentDim = getDim(parentNode.rec);
    // 常识默认：父是骨架「天」→ 默认 8计划；否则跟随父维度
    const parentSkelName = parentNode.rec[FIELD_IDS.mingcheng] || '';
    const defaultKey = parentSkelName === '天' ? (SEW_DIMS.find(d => d.sew === '8计划')).key : parentDim.key;

    body.innerHTML = `
        <div class="detail-section">
            <h3>新建节点</h3>
            <div class="meta-line">父节点：${escapeHtml(parentNode.rec[FIELD_IDS.mingcheng] || '(未命名)')}</div>
        </div>
        <div class="detail-section">
            <div class="detail-row">
                <span class="label">维度 (sew)</span>
                <select id="add-sew">${SEW_DIMS.map(d =>
                    `<option value="${d.key}" ${d.key === defaultKey ? 'selected' : ''}>${d.sew}</option>`).join('')}
                </select>
            </div>
            <div class="detail-row">
                <span class="label">名称 *</span>
                <input type="text" id="add-mingcheng" placeholder="短且有语义，禁止时间戳">
            </div>
            <div class="detail-row">
                <span class="label">描述</span>
                <textarea id="add-miaoshu" rows="3" placeholder="描述（选填，可长文本）" style="flex:1;"></textarea>
            </div>
            <div class="detail-row wznr-row">
                <span class="label">正文 (wznr) *</span>
                ${markdownFieldHtml('add-wznr', '')}
            </div>
            <div class="detail-row" id="add-wancheng-row">
                <span class="label">完成</span>
                <input type="checkbox" id="add-wancheng" style="width:auto">
            </div>
            <div class="detail-row">
                <span class="label">事件时间</span>
                <input type="datetime-local" id="add-fbsj">
            </div>
        </div>
        <div class="detail-section">
            <div class="detail-actions-bar">
                <button class="btn btn-primary" id="btnAddOk">创建</button>
                <button class="btn" id="btnAddCancel">取消</button>
            </div>
            <div class="meta-line" style="margin-top:8px">创建后 fu=${escapeHtml((parentNode.rowid || '').slice(0, 8))}…，fabuzhe=${escapeHtml(currentAgent.name)}</div>
        </div>
    `;

    // 完成项联动：仅 7目标/8计划 显示（与详情面板规则一致）
    const sewSel = $('add-sew');
    const syncWanchengRow = () => {
        const d = SEW_DIMS.find(x => x.key === sewSel.value);
        $('add-wancheng-row').style.display = (d && (d.sew === '7目标' || d.sew === '8计划')) ? '' : 'none';
    };
    sewSel.onchange = syncWanchengRow;
    syncWanchengRow();
    setupMarkdownField('add-wznr');

    $('btnAddCancel').onclick = () => {
        const node = selectedRowid ? findNode(treeData, selectedRowid) : parentNode;
        if (node) renderDetailView(node); else renderDetailEmpty();
    };
    $('btnAddOk').onclick = async () => {
        const sewKey = $('add-sew').value;
        const sewName = (SEW_DIMS.find(d => d.key === sewKey) || {}).sew || '';
        const mingcheng = $('add-mingcheng').value.trim();
        const wznr = $('add-wznr').value.trim();

        if (!mingcheng) { toast('名称必填', 'error'); return; }
        // wznr 前端不强制必填——"必填"是 agent 侧的创建纪律（见 fsj-skills-open 文档），UI 不拦

        const quanzhong = 0;   // 新节点默认权重 0（2026-09-24 拍板：降序展示下自然沉底，重要的手动调高权重）
        // 直连 v2 addRow 格式（2026-09-03 实测）：Relation/leixing 传 option key 裸值 + valueType 2
        // （leixing 传文本不会选中 dropdown 选项，必须传 key；「知识」= 55c1d467-927b-4af8-98a9-d934554ac3bf）
        // wancheng 仅 7目标/8计划 传（与详情面板显示规则一致）
        const LEIXING_ZHISHI = '55c1d467-927b-4af8-98a9-d934554ac3bf';
        const isTaskOrTarget = sewName === '7目标' || sewName === '8计划';
        const controls = [
            { controlId: FIELD_IDS.mingcheng, value: mingcheng },
            { controlId: FIELD_IDS.wznr, value: wznr },
            { controlId: FIELD_IDS.sew, value: sewKey, valueType: 2 },
            { controlId: FIELD_IDS.leixing, value: LEIXING_ZHISHI, valueType: 2 },
            { controlId: FIELD_IDS.fu, value: parentNode.rowid, valueType: 2 },
            { controlId: FIELD_IDS.fabuzhe, value: currentAgent.rowid, valueType: 2 },
            { controlId: FIELD_IDS.quanzhong, value: String(quanzhong), valueType: 0 }
        ];
        if (isTaskOrTarget) {
            controls.push({ controlId: FIELD_IDS.wancheng, value: $('add-wancheng').checked ? '1' : '0', valueType: 0 });
        }
        const fbsj = fromLocalInput($('add-fbsj').value);
        if (fbsj) controls.push({ controlId: FIELD_IDS.fbsj, value: fbsj });
        const miaoshu = $('add-miaoshu').value.trim();
        if (miaoshu) controls.push({ controlId: FIELD_IDS.miaoshu, value: miaoshu });
        // 所属商家（2026-09-06 拍板：创建必带；解析不到则跳过，HAP 工作流兜底）
        const sj2 = await API.getShangjia2(currentAgent.rowid);
        if (sj2) controls.push({ controlId: FIELD_IDS.shangjia2, value: sj2, valueType: 2 });

        showLoading('创建中…');
        try {
            const resp = await API.addRecord(controls);
            if (!resp.success) throw new Error(JSON.stringify(resp).slice(0, 120));
            // 乐观更新：HAP 已落盘，直接插本地树（不再全量重拉）
            const newId = typeof resp.data === 'string' ? resp.data : (resp.data && resp.data.rowid);
            const now = new Date().toLocaleString('sv-SE').replace('T', ' ');
            const newRec = { rowid: newId, ctime: now, utime: now };
            controls.forEach(c => {
                newRec[c.controlId] = c.valueType === 2
                    ? [{ sid: c.value, name: c.controlId === FIELD_IDS.sew ? sewName : (c.controlId === FIELD_IDS.fabuzhe ? currentAgent.name : '') }]
                    : c.value;
            });
            myRecords.push(newRec);
            const newNode = { rec: newRec, rowid: newId, children: [] };
            parentNode.children.push(newNode);
            // 展开父节点并选中新节点
            Tree.expandNode(parentNode.rowid);
            Tree.setSelected(newId);
            selectedRowid = newId;
            renderStat();
            rerenderKeepState();
            renderDetailView(newNode);
            toast('✓ 创建成功', 'success');
        } catch (e) {
            toast('创建失败：' + e.message, 'error', 5000);
            console.error('[add]', e);
        } finally {
            hideLoading();
        }
    };
}

// ===== 删除 =====
async function confirmDelete(node) {
    const name = node.rec[FIELD_IDS.mingcheng] || '(未命名)';
    if (node.children.length > 0) {
        toast('该节点有 ' + node.children.length + ' 个子节点，先删子节点', 'error', 4000);
        return;
    }
    const ok = await confirm(`「${name}」将被物理删除，不可恢复。确定？`);
    if (!ok) return;
    showLoading('删除中…');
    try {
        const resp = await API.deleteRecord(node.rowid);
        if (!resp.success) throw new Error(JSON.stringify(resp).slice(0, 120));
        // 乐观移除：本地树/记录直接删（HAP 已落盘）
        const parentNode = findParentNode(treeData, node.rowid);
        const arr = parentNode ? parentNode.children : treeData;
        const i = arr.indexOf(node);
        if (i >= 0) arr.splice(i, 1);
        myRecords = myRecords.filter(r => r.rowid !== node.rowid);
        selectedRowid = null;
        renderDetailEmpty();
        renderStat();
        rerenderKeepState();
        toast('✓ 已物理删除', 'success');
    } catch (e) {
        toast('删除失败：' + e.message, 'error', 5000);
        console.error('[delete]', e);
    } finally {
        hideLoading();
    }
}

// ===== 拖拽移动（同层排序 / 跨层移动 / 拖入成为子项，参考 objectives-management-system） =====

/** 在树中定位节点所在层：{arr, parentRowid}（根层 parentRowid=null） */
function findLayer(nodes, rowid, parentRowid) {
    for (const n of nodes) {
        if (n.rowid === rowid) return { arr: nodes, parentRowid: parentRowid || null };
        const hit = findLayer(n.children, rowid, n.rowid);
        if (hit) return hit;
    }
    return null;
}

/** targetRowid 是否在 node 的子孙里（防环） */
function isDescendantNode(node, targetRowid) {
    return node.children.some(c => c.rowid === targetRowid || isDescendantNode(c, targetRowid));
}

/** 按数组顺序归一层权重（显示第 i 位 → (n-1-i)*10，首位最高，配合降序展示），返回需要写库的 [{node, q}]（rec 不动，由调用方同步） */
function planWeights(arr) {
    const updates = [];
    arr.forEach((n, i) => {
        const q = String((arr.length - 1 - i) * 10);
        if (String(Number(n.rec[FIELD_IDS.quanzhong]) || 0) !== q) updates.push({ node: n, q });
    });
    return updates;
}

async function handleDrop(src, target, pos) {
    if (!src || !target || src.rowid === target.rowid) { rerenderKeepState(); return; }
    const dragLoc = findLayer(treeData, src.rowid, null);
    const tgtLoc = findLayer(treeData, target.rowid, null);
    if (!dragLoc || !tgtLoc) { rerenderKeepState(); return; }
    // 防环：不能拖进自己的子孙
    if (isDescendantNode(src, target.rowid)) {
        toast('不能拖到自己的子节点下', 'warn');
        rerenderKeepState();
        return;
    }
    const skelDrag = isSkeleton(src, nodeDepth(src));
    const sameLayer = dragLoc.arr === tgtLoc.arr;

    // 1) 内存树先挪出期望结构，记录拖动节点的 fu 变更
    let dragFu = null;
    if (pos === 'as-child') {
        if (skelDrag) { toast('骨架节点不能改为子项（结构保护）', 'warn'); rerenderKeepState(); return; }
        dragLoc.arr.splice(dragLoc.arr.indexOf(src), 1);
        target.children.push(src);
        src.rec[FIELD_IDS.fu] = [{ sid: target.rowid, name: target.rec[FIELD_IDS.mingcheng] || '' }];
        dragFu = { controlId: FIELD_IDS.fu, value: target.rowid, valueType: 2 };
    } else if (!sameLayer) {
        if (skelDrag) { toast('骨架节点只能在本层内排序（结构保护）', 'warn'); rerenderKeepState(); return; }
        if (!tgtLoc.parentRowid) { toast('不能移到根层（顶层是五事根）', 'warn'); rerenderKeepState(); return; }
        dragLoc.arr.splice(dragLoc.arr.indexOf(src), 1);
        const tIdx = tgtLoc.arr.indexOf(target);
        tgtLoc.arr.splice(pos === 'after' ? tIdx + 1 : tIdx, 0, src);
        const newParent = findNode(treeData, tgtLoc.parentRowid);
        src.rec[FIELD_IDS.fu] = [{ sid: tgtLoc.parentRowid, name: newParent ? (newParent.rec[FIELD_IDS.mingcheng] || '') : '' }];
        dragFu = { controlId: FIELD_IDS.fu, value: tgtLoc.parentRowid, valueType: 2 };
    } else {
        dragLoc.arr.splice(dragLoc.arr.indexOf(src), 1);
        const tIdx = dragLoc.arr.indexOf(target);
        dragLoc.arr.splice(pos === 'after' ? tIdx + 1 : tIdx, 0, src);
    }

    // 2) 受影响的层（旧层 + 新层）权重归一（首位最高，配合降序展示），先同步本地 rec
    const layers = new Set([dragLoc.arr, pos === 'as-child' ? target.children : tgtLoc.arr]);
    const updates = [];
    layers.forEach(arr => updates.push(...planWeights(arr)));
    updates.forEach(u => { u.node.rec[FIELD_IDS.quanzhong] = u.q; });

    // 3) 批量写 HAP：拖动节点（fu? + quanzhong?），被挤动的兄弟（quanzhong）
    const dragUpd = updates.find(u => u.node === src);
    const dragControls = dragFu ? [dragFu] : [];
    if (dragUpd) dragControls.push({ controlId: FIELD_IDS.quanzhong, value: dragUpd.q, valueType: 0 });
    const calls = [];
    if (dragControls.length) calls.push(API.updateRecord(src.rowid, dragControls));
    updates.filter(u => u.node !== src).forEach(u =>
        calls.push(API.updateRecord(u.node.rowid, [{ controlId: FIELD_IDS.quanzhong, value: u.q, valueType: 0 }])));
    if (calls.length) {
        showLoading('移动中…');
        try {
            const results = await Promise.all(calls);
            const bad = results.find(r => !r || !r.success);
            if (bad) throw new Error('部分记录保存失败');
            toast('✓ 已移动', 'success', 1200);
        } catch (e) {
            toast('移动保存失败：' + e.message + '，正在重拉数据回滚', 'error', 4000);
            console.error('[drop]', e);
            await reload();
            return;
        } finally {
            hideLoading();
        }
    }

    // 4) 重建树（rec 已同步，buildTree 按 fu/quanzhong 重组）+ 展开落点 + 保持选中
    treeData = buildTree(myRecords);
    if (pos === 'as-child') Tree.expandNode(target.rowid);
    else if (tgtLoc.parentRowid) Tree.expandNode(tgtLoc.parentRowid);
    Tree.setSelected(src.rowid);
    rerenderKeepState();
    if (selectedRowid === src.rowid) {
        const node = findNode(treeData, src.rowid);
        if (node) renderDetailView(node);
    }
}

function findParentNode(nodes, rowid) {
    for (const n of nodes) {
        if (n.children.some(c => c.rowid === rowid)) return n;
        const hit = findParentNode(n.children, rowid);
        if (hit) return hit;
    }
    return null;
}

// ===== 中缝拖动（左树/右详情宽度调整，25%-75%，记忆到 localStorage） =====
function initResizer() {
    const resizer = $('resizer');
    const pane = document.querySelector('.tree-pane');
    const rootStyle = document.documentElement.style;
    const saved = localStorage.getItem('wushi_tree_w');
    if (saved) rootStyle.setProperty('--tree-w', saved);

    let startX = 0, startW = 0;
    const onMove = (e) => {
        const w = startW + (e.clientX - startX);
        const pct = Math.min(75, Math.max(25, (w / window.innerWidth) * 100));
        rootStyle.setProperty('--tree-w', pct.toFixed(2) + '%');
    };
    const onUp = () => {
        document.body.classList.remove('resizing');
        resizer.classList.remove('active');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        localStorage.setItem('wushi_tree_w', rootStyle.getPropertyValue('--tree-w').trim());
    };
    resizer.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        startX = e.clientX;
        startW = pane.getBoundingClientRect().width;
        resizer.classList.add('active');
        document.body.classList.add('resizing');
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    });
}

// ===== 启动 =====
init();
initKjzzModal();
initDelegateModal();
initResizer();

/* ===== 任务委派弹窗（左：我加入的组织 / 右：组织成员多选）===== */
const QUANXIAN_GONGKAI_KEY = 'e1d9b90b-cabe-4a6b-bb57-efb17c792bb8';
let delegateNode = null;
let delegateOrgs = [];
let delegateSelOrgs = [];   // 勾选的组织 rowid 集合
const delegateMemberCache = {};   // userRowid → nickname

function canDelegateTask(rec) {
    const dim = getDim(rec);
    if (dim.sew !== '7目标' && dim.sew !== '8计划') return false;
    const qx = rec[FIELD_IDS.quanxian] || [];
    return qx.some(x => x.sid === QUANXIAN_GONGKAI_KEY);
}

async function openDelegateModal(node) {
    var dbg = function (m) { console.log('[委派调试] ' + m); };
    delegateNode = node;
    const modal = $('delegate-modal');
    const orgBox = $('dlg-org-list');
    const memBox = $('dlg-member-list');
    modal.style.display = 'flex';
    orgBox.innerHTML = '<div class="ref-result-empty">加载组织列表…</div>';
    memBox.innerHTML = '<div class="ref-result-empty">请选择左侧组织</div>';
    dbg('打开弹窗：agent=' + currentAgent.rowid + ' 任务=' + node.rec[FIELD_IDS.mingcheng]);
    try {
        if (!orgsCache[currentAgent.rowid]) {
            dbg('组织缓存为空，拉取 zzyh 含我的组织…');
            orgsCache[currentAgent.rowid] = await API.fetchOrgs(currentAgent.rowid);
            dbg('组织拉取成功：' + (orgsCache[currentAgent.rowid] || []).length + ' 个');
        } else {
            dbg('命中组织缓存：' + (orgsCache[currentAgent.rowid] || []).length + ' 个');
        }
        delegateOrgs = orgsCache[currentAgent.rowid] || [];
    } catch (e) {
        dbg('❌ 组织拉取失败：' + e.message);
        orgBox.innerHTML = '<div class="ref-result-empty">组织列表加载失败：' + escapeHtml(e.message) + '</div>';
        return;
    }
    delegateSelOrgs = [];   // 刚打开不选任何组织
    renderDelegateOrgList(delegateSelOrgs);
    // 右栏先显示当前已委派的成员（勾选组织后候选池才扩大）
    dbg('右栏显示已委派成员：' + ((delegateNode.rec[FIELD_IDS.ptyh] || []).length) + ' 个');
    renderDelegateMemberList((delegateNode.rec[FIELD_IDS.ptyh] || []).map(function (x) { return x.sid; }));
}

/** 汇聚勾选组织的成员并渲染（跨组织去重；已委派成员始终保留显示） */
async function refreshDelegateMembers() {
    if (!delegateNode) return;
    var existing = (delegateNode.rec[FIELD_IDS.ptyh] || []).map(function (x) { return x.sid; });
    var allIds = existing.slice();
    for (var oi = 0; oi < delegateSelOrgs.length; oi++) {
        try {
            var ids = await fetchOrgMemberIds(delegateSelOrgs[oi]);
            ids.forEach(function (rid) { if (allIds.indexOf(rid) === -1) allIds.push(rid); });
        } catch (e) { /* 单组织失败跳过 */ }
    }
    // 已委派成员的昵称也要确保拉到（他们可能不在勾选的组织里）
    await ensureMemberNames(existing);
    await ensureMemberNames(allIds);
    renderDelegateMemberList(allIds);
}

/** 汇聚勾选组织的成员并渲染（跨组织去重） */

/** 拉群组表某行的 zzyh 成员 rowid 列表 */
async function fetchOrgMemberIds(orgRowid) {
    var orgRow = await API.getRowById('69f549c69f1956fc0e171aa6', orgRowid);
    if (!orgRow) return [];
    var zzyh = orgRow.zzyh;
    if (typeof zzyh === 'string') { try { zzyh = JSON.parse(zzyh); } catch (e) { zzyh = []; } }
    return Array.isArray(zzyh) ? zzyh.map(function (x) { return x.sid || x; }).filter(Boolean) : [];
}

/** 确保成员昵称已缓存（并发 5） */
async function ensureMemberNames(rowids) {
    var need = rowids.filter(function (rid) { return !delegateMemberCache[rid]; });
    if (!need.length) return;
    var POOL = 5;
    for (var i = 0; i < need.length; i += POOL) {
        var batch = need.slice(i, i + POOL);
        await Promise.all(batch.map(async function (rid) {
            try {
                var u = await API.getRowById('69b0077358322d512e60bad0', rid);
                delegateMemberCache[rid] = (u && (u.nickname || u.mingcheng || u.name)) || '用户';
            } catch (e) { delegateMemberCache[rid] = '用户'; }
        }));
    }
}

/** 渲染汇聚后的成员勾选列表（跨组织去重） */
function renderDelegateMemberList(memberRowids) {
    var memBox = $('dlg-member-list');
    var curSids = new Set((delegateNode?.rec[FIELD_IDS.ptyh] || []).map(function (x) { return x.sid; }));
    if (!memberRowids.length) {
        memBox.innerHTML = '<div class="ref-result-empty">所选组织没有成员（zzyh 为空）</div>';
        return;
    }
    memBox.innerHTML = memberRowids.map(function (rid) {
        var name = delegateMemberCache[rid] || '加载中…';
        return '<label class="dlg-member-item">' +
            '<input type="checkbox" value="' + rid + '" ' + (curSids.has(rid) ? 'checked' : '') + '>' +
            '<span class="member-name" title="' + escapeHtml(rid) + '">' + escapeHtml(name) + '</span>' +
            '<span class="member-rid">' + rid.slice(0, 8) + '…</span>' +
            '</label>';
    }).join('');
}

function renderDelegateOrgList(selectedOrgRowids) {
    const orgBox = $('dlg-org-list');
    if (!delegateOrgs.length) {
        orgBox.innerHTML = '<div class="ref-result-empty">你不是任何组织的成员（zzyh 不含我）</div>';
        return;
    }
    const curSids = new Set((delegateNode?.rec[FIELD_IDS.ptyh] || []).map(x => x.sid));
    orgBox.innerHTML = delegateOrgs.map(o => `
        <label class="dlg-org-item">
            <input type="checkbox" value="${o.rowid}" ${selectedOrgRowids.includes(o.rowid) ? 'checked' : ''}>
            <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(o.mingcheng)}</span>
            <span style="font-size:10px;color:var(--text-sub)">${o.rowid.slice(0,8)}…</span>
        </label>
    `).join('');
    orgBox.querySelectorAll('input[type="checkbox"]').forEach(r => {
        r.onchange = () => {
            delegateSelOrgs = Array.from(orgBox.querySelectorAll('input[type="checkbox"]:checked')).map(el => el.value);
            refreshDelegateMembers();
        };
    });
}


async function saveDelegateFromModal() {
    const node = delegateNode;
    if (!node) return;
    const memBox = $('dlg-member-list');
    const picked = Array.from(memBox.querySelectorAll('input[type="checkbox"]:checked')).map(el => el.value);
    const rec = node.rec;
    const cur = (rec[FIELD_IDS.ptyh] || []).map(x => x.sid);
    const next = Array.from(new Set(picked));   // 去重
    const same = cur.length === next.length && cur.every((v, i) => v === next[i]);
    if (same) { closeDelegateModal(); return; }
    try {
        const resp = await API.updateRecord(rec.rowid, [
            { controlId: FIELD_IDS.ptyh, value: next.join(','), valueType: 2 }
        ]);
        if (!resp.success) throw new Error(JSON.stringify(resp).slice(0, 120));
        // 乐观更新本地（昵称走缓存）
        rec[FIELD_IDS.ptyh] = next.map(rid => ({
            sid: rid,
            name: delegateMemberCache[rid] || '用户'
        }));
        renderDetailView(node);
        closeDelegateModal();
        toast(`✓ 委派已保存（${next.length} 人）`, 'success', 1500);
    } catch (e) {
        toast('委派失败：' + e.message, 'error', 4000);
    }
}

function closeDelegateModal() {
    $('delegate-modal').style.display = 'none';
    delegateNode = null;
    delegateSelOrgs = [];
}

function initDelegateModal() {
    $('delegate-modal').querySelector('.ref-overlay').onclick = closeDelegateModal;
    $('dlg-cancel').onclick = closeDelegateModal;
    $('dlg-ok').onclick = saveDelegateFromModal;
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && $('delegate-modal').style.display === 'flex') closeDelegateModal();
    });
}
