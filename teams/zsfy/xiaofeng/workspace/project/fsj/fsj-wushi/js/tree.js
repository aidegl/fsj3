/**
 * 五事系统 · 层级树渲染 + 拖动排序（同层排序，P0）
 * 颜色：节点色条/图标用节点自身维度色（docs/12维颜色.json）
 */
import { FIELD_IDS } from './field-ids.js';
import { getDim, isSkeleton } from './filter.js';
import { escapeHtml } from './ui.js';

const expanded = new Set();     // 展开的节点 rowid
let inited = false;
let selectedRowid = null;
let dragSrc = null;
let callbacks = {};             // { onSelect(node), onAdd(node), onDelete(node), onDrop(srcNode, targetNode, pos) }

export function initTree(cb) { callbacks = cb; }
export function setSelected(rowid) {
    selectedRowid = rowid;
    if (rowid) expanded.add(rowid); // 选中即展开其容器链（父级由 buildTree 层级保证可见）
}
/** 展开指定节点（如插入子节点后展开父） */
export function expandNode(rowid) { expanded.add(rowid); }
export function resetExpand() { expanded.clear(); inited = false; selectedRowid = null; }

/** 渲染整棵树 */
export function renderTree(container, roots) {
    // 首次渲染：默认展开顶层两层（五事根 + 骨架）
    if (!inited) {
        const walk = (nodes, depth) => {
            nodes.forEach(n => {
                if (depth <= 1) expanded.add(n.rowid);
                walk(n.children, depth + 1);
            });
        };
        walk(roots, 0);
        inited = true;
    }
    container.innerHTML = '';
    if (!roots.length) {
        container.innerHTML = '<div class="empty-state">该 Agent 暂无五事数据<br><br>（需要 agent 在 HAP 侧先建立五事骨架）</div>';
        return;
    }
    roots.forEach(root => container.appendChild(renderNode(root, 0)));
}

function renderNode(node, depth) {
    const wrap = document.createElement('div');
    wrap.className = 'tree-node';

    const content = document.createElement('div');
    // 权重色（2026-09-22）：按字段 quanzhong 值 0-5 着色，空/0=无色 1蓝 2绿 3黄 4橙 5红（>5 归 5），选中/悬停加深，见 style.css
    const weight = Math.min(Math.max(parseInt(node.rec[FIELD_IDS.quanzhong], 10) || 0, 0), 5);
    content.className = 'node-content' + (weight > 0 ? ' weight-' + weight : '') + (node.rowid === selectedRowid ? ' selected' : '');
    content.dataset.rowid = node.rowid;

    const dim = getDim(node.rec);

    // 维度图标（实色底 + 白字，2026-09-03 替代原细色条；0骨架 白底黑字黑描边 1px）
    const icon = document.createElement('span');
    icon.className = 'dim-icon';
    icon.style.background = dim.color;
    icon.style.color = dim.text || '#ffffff';
    icon.style.fontWeight = '600';
    if (dim.border) icon.style.border = dim.border;
    icon.textContent = dim.sew.replace(/^\d+/, ''); // 技能/想法/项目/交流/规则/价值/目标/计划/信息/人脉/仓/复盘（整条）
    icon.title = dim.sew;

    // 折叠开关
    const hasChildren = node.children.length > 0;
    const toggle = document.createElement('button');
    toggle.className = 'tree-toggle' + (hasChildren ? '' : ' empty');
    toggle.textContent = hasChildren ? (expanded.has(node.rowid) ? '▾' : '▸') : '·';
    toggle.onclick = (e) => {
        e.stopPropagation();
        if (!hasChildren) return;
        if (expanded.has(node.rowid)) expanded.delete(node.rowid);
        else expanded.add(node.rowid);
        rerender();
    };

    // 完全引用标记（wqyy 非空 = 内容与所引记录完全一致，标题左侧「引」徽标）
    const wqyy = node.rec[FIELD_IDS.wqyy];
    const isQuote = Array.isArray(wqyy) ? wqyy.length > 0 : !!(wqyy && wqyy !== '');
    let quoteFlag = null;
    if (isQuote) {
        quoteFlag = document.createElement('span');
        quoteFlag.className = 'quote-flag';
        quoteFlag.textContent = '引';
        quoteFlag.title = '完全引用：正文与所引记录保持一致';
    }

    // 名称（wancheng="1" 划线）
    const name = document.createElement('span');
    name.className = 'tree-name' + (node.rec[FIELD_IDS.wancheng] === '1' ? ' done' : '');
    name.textContent = node.rec[FIELD_IDS.mingcheng] || '(未命名)';
    name.title = dim.sew + ' · ' + (node.rec[FIELD_IDS.mingcheng] || '');

    // 子节点数（元素先建，组装时放最右侧）
    let count = null;
    if (hasChildren) {
        count = document.createElement('span');
        count.className = 'node-count';
        count.textContent = node.children.length;
    }

    // 操作按钮：➕ 新建子节点；🗑 删除（骨架不可删）
    const actions = document.createElement('span');
    actions.className = 'tree-actions';
    actions.innerHTML = `
        <button class="tree-action-btn" data-act="add" title="在该节点下新建">➕</button>
        ${isSkeleton(node, depth) ? '' : '<button class="tree-action-btn" data-act="del" title="物理删除">🗑</button>'}
    `;
    actions.style.display = 'flex';
    actions.onclick = (e) => e.stopPropagation();
    actions.querySelector('[data-act="add"]').onclick = (e) => {
        e.stopPropagation();
        callbacks.onAdd(node);
    };
    const delBtn = actions.querySelector('[data-act="del"]');
    if (delBtn) delBtn.onclick = (e) => {
        e.stopPropagation();
        callbacks.onDelete(node);
    };

    // 组装（顺序：toggle 维度图标 引用徽标 名称 计数(靠右) 操作）
    content.appendChild(toggle);
    content.appendChild(icon);
    if (quoteFlag) content.appendChild(quoteFlag);
    content.appendChild(name);
    if (count) content.appendChild(count);
    content.appendChild(actions);

    // 交互
    content.onclick = () => callbacks.onSelect(node);

    // 拖拽移动（三分区：上=插前 中=拖入为子 高亮 下=插后，参考 objectives-management-system）
    content.draggable = true;
    content.addEventListener('dragstart', (e) => {
        dragSrc = node;
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', node.rowid); } catch (err) {}
        content.classList.add('dragging');
    });
    content.addEventListener('dragend', () => {
        content.classList.remove('dragging');
        document.querySelectorAll('.node-content.drop-before, .node-content.drop-after, .node-content.drop-as-child').forEach(el => el.classList.remove('drop-before', 'drop-after', 'drop-as-child'));
    });
    content.addEventListener('dragover', (e) => {
        if (!dragSrc || dragSrc.rowid === node.rowid) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        const rect = content.getBoundingClientRect();
        const relY = (e.clientY - rect.top) / rect.height; // 0=顶 1=底
        const pos = relY < 0.34 ? 'before' : (relY < 0.67 ? 'as-child' : 'after');
        document.querySelectorAll('.node-content.drop-before, .node-content.drop-after, .node-content.drop-as-child').forEach(c => {
            if (c !== content) c.classList.remove('drop-before', 'drop-after', 'drop-as-child');
        });
        content.classList.toggle('drop-before', pos === 'before');
        content.classList.toggle('drop-after', pos === 'after');
        content.classList.toggle('drop-as-child', pos === 'as-child');
    });
    content.addEventListener('dragleave', () => content.classList.remove('drop-before', 'drop-after', 'drop-as-child'));
    content.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = content.getBoundingClientRect();
        const relY = (e.clientY - rect.top) / rect.height;
        const pos = relY < 0.34 ? 'before' : (relY < 0.67 ? 'as-child' : 'after');
        content.classList.remove('drop-before', 'drop-after', 'drop-as-child');
        if (dragSrc && dragSrc.rowid !== node.rowid) {
            callbacks.onDrop(dragSrc, node, pos);
        }
        dragSrc = null;
    });

    wrap.appendChild(content);

    // 子节点容器
    if (hasChildren) {
        const childrenWrap = document.createElement('div');
        childrenWrap.className = 'tree-children' + (expanded.has(node.rowid) ? '' : ' collapsed');
        node.children.forEach(ch => childrenWrap.appendChild(renderNode(ch, depth + 1)));
        wrap.appendChild(childrenWrap);
    }
    return wrap;
}

/** 重渲染（app.js 持有 roots 引用传入） */
let _container = null, _roots = [];
function rerender() {
    if (_container) renderTree(_container, _roots);
}
export function mount(container, roots) {
    _container = container;
    _roots = roots;
    renderTree(container, roots);
}

/**
 * 定位节点：展开其全部祖先 → 重渲染 → 滚动到可见 + 高亮闪烁（2026-09-05，大树找单条用）
 */
export function reveal(rowid) {
    if (!_roots.length) return;
    const parentMap = new Map();
    const walk = (nodes, parent) => nodes.forEach(n => {
        parentMap.set(n.rowid, parent);
        walk(n.children, n);
    });
    walk(_roots, null);
    expanded.add(rowid);
    let cur = parentMap.get(rowid);
    while (cur) { expanded.add(cur.rowid); cur = parentMap.get(cur.rowid); }
    rerender();
    const el = _container.querySelector(`[data-rowid="${rowid}"]`);
    if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.remove('revealed');
        void el.offsetWidth;    // 重启动画
        el.classList.add('revealed');
        setTimeout(() => el.classList.remove('revealed'), 2400);
    }
}
