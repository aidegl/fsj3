/**
 * 树视图渲染
 * 入口：renderTree(tree) — tree 由 Filter.buildTree() 生成
 */
window.Tree = (function() {
    const container = document.getElementById('tree-container');
    const btnExpandAll = document.getElementById('btn-expand-all');
    const btnCollapseAll = document.getElementById('btn-collapse-all');
    const btnCheckAll = document.getElementById('btn-check-all');
    const btnUncheckAll = document.getElementById('btn-uncheck-all');

    // 状态：哪些被勾选/展开/高亮/选中
    const state = {
        expanded: new Set(),   // 展开的 rowid
        highlighted: new Set(), // 高亮的 rowid
        selected: null         // 当前选中（详情面板联动）
    };

    // 回调（app.js 设置）
    let onNodeClick = () => {};      // 节点点击 → 详情面板
    let onAddChild = () => {};       // ➕ 在该节点下创建子项目
    let onEdit = () => {};
    let onDelete = () => {};

    let onRename = () => {};       // 双击改名
    function setCallbacks(cb) {
        onNodeClick = cb.onNodeClick || (() => {});
        onAddChild = cb.onAddChild || (() => {});
        onRename = cb.onRename || (() => {});
        onEdit = cb.onEdit || (() => {});
        onDelete = cb.onDelete || (() => {});
    }

    /**
     * 渲染整棵树
     * 默认全展开到第 8 层，全选中
     * **不显示真叶子**（zi=0 的节点）—— 叶子只出现在中间看板
     */
    function renderTree(tree) {
        state.highlighted.clear();
        state.selected = null;
        const MAX_AUTO_EXPAND = 8;

        // 递归收集所有节点（含叶子）-> 全选 + 展开（2026-08-20 树里也显示叶子方便编辑）
        (function walk(nodes, depth) {
            for (const node of nodes) {
                if (!node || !node.rec) continue;
                if (depth <= MAX_AUTO_EXPAND) state.expanded.add(node.rowid);
                walk(node.children, depth + 1);
            }
        })(tree, 1);

        // debug log
        function depthOf(n) { return (!n.children || n.children.length === 0) ? 1 : 1 + Math.max(...n.children.map(depthOf)); }
        const visibleRoots = tree.filter(n => n.children && n.children.length > 0);
        const hiddenLeaves = countAll(tree, n => !n.children || n.children.length === 0);
        console.log('[Tree.renderTree] visibleRoots=' + visibleRoots.length + ' hiddenLeaves=' + hiddenLeaves + ' maxDepth=' + (tree.length > 0 ? Math.max(...tree.map(depthOf)) : 0));
        visibleRoots.forEach(r => console.log('  root: ' + Filter.getMingcheng(r.rec).slice(0, 30) + ' (' + r.children.length + ' children)'));

        container.innerHTML = '';
        if (!tree || tree.length === 0) {
            container.innerHTML = '<div class="empty-state">「天」下暂无目标/计划数据<br><br>点上方「+ 添加目标」创建第一个</div>';
            return;
        }
        // 显示所有节点（含叶子）—— 逐节点容错：某条挂了不影响其他
        let rendered = 0, failed = 0;
        for (const root of tree) {
            try {
                container.appendChild(renderNode(root));
                rendered++;
            } catch (err) {
                failed++;
                console.error('[renderAll] ⚠️ renderNode failed for:', (root.rec && (root.rec.rowid || root.rec._id)) || '?', Filter.getMingcheng(root.rec), err);
            }
        }
        // ⭐ 渲染结果诊断：DOM 数量 + 容器几何尺寸（排查 CSS 布局挤压）
        const rect = container.getBoundingClientRect();
        console.log('[renderAll] RESULT: rendered=' + rendered + ' failed=' + failed +
            ' | DOM children=' + container.children.length +
            ' | container w=' + Math.round(rect.width) + 'px h=' + Math.round(rect.height) + 'px' +
            ' | scrollH=' + container.scrollHeight + 'px' +
            ' | display=' + getComputedStyle(container).display +
            ' | visible=' + (rect.width > 0 && rect.height > 0 ? 'YES' : 'NO ⚠️'));
        // 容器空白 drop = 追加到根层末尾
        container.ondragover = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
        container.ondrop = (e) => {
            // 空白处 drop：目标是 container 自身或结构性子元素（tree-children/tree-node wrap），不是节点 content
            const t = e.target;
            if (t.closest && t.closest('.tree-node-content')) return; // 在节点上 -> 节点自己处理
            e.preventDefault();
            const raw = e.dataTransfer.getData('text/plain');
            if (!raw || !raw.startsWith('tree:')) return;
            handleTreeDrop(raw.slice(5), null, 'end');
        };
    }

    /**
     * ===== 树拖拽排序核心 =====
     * @param dragRowid 被拖节点
     * @param targetRowid 目标节点（null = 追加根层末尾）
     * @param position 'before' | 'after' | 'end'
     * 逻辑：同层重排 or 跨层移动（fu 变更），按新位置重新分配权重（值池降序分配），批量写 HAP
     */
    async function handleTreeDrop(dragRowid, targetRowid, position) {
        const t0 = Date.now();
        const tree = window.__tree || [];
        handleTreeDrop._callCount = (handleTreeDrop._callCount || 0) + 1;
        console.log('[Tree.drop] call#' + handleTreeDrop._callCount + ' drag=' + dragRowid.slice(0,8) + ' target=' + (targetRowid ? targetRowid.slice(0,8) : 'root-end') + ' pos=' + position);
        // 防重入：500ms 内同一 drag 的重复调用忽略
        const now = Date.now();
        if (handleTreeDrop._lastCall && (now - handleTreeDrop._lastCall.ts < 500) && handleTreeDrop._lastCall.drag === dragRowid) {
            console.log('[Tree.drop] DUPLICATE CALL BLOCKED (within 500ms)');
            return;
        }
        handleTreeDrop._lastCall = { ts: now, drag: dragRowid };
        // 检测树里是否已有重复 rowid（诊断）
        (function checkDup() {
            const seen = new Set();
            const dups = [];
            (function walk(nodes) {
                for (const n of nodes) {
                    if (seen.has(n.rowid)) dups.push(n.rowid);
                    seen.add(n.rowid);
                    walk(n.children || []);
                }
            })(tree);
            if (dups.length) console.warn('[Tree.drop] ⚠️ tree already has DUPLICATE rowids:', dups);
        })();

        // 找 drag 和 target 所在的兄弟数组 + 各自父 rowid
        function findLayer(nodes, rowid, parentRowid) {
            for (const n of nodes) {
                if (n.rowid === rowid) return { arr: nodes, parentRowid };
                const found = findLayer(n.children || [], rowid, n.rowid);
                if (found) return found;
            }
            return null;
        }
        const dragLayer = findLayer(tree, dragRowid, null);
        if (!dragLayer) { UI.toast('找不到被拖节点', 'error'); return; }

        let targetLayer = null;
        if (targetRowid) {
            targetLayer = findLayer(tree, targetRowid, null);
            if (!targetLayer) { UI.toast('找不到目标节点', 'error'); return; }
        }

        const sameLayer = targetRowid && dragLayer.arr === targetLayer.arr;

        // 防止拖到自己的子孙（会造成环）
        function isDescendant(rootRowid, maybeChildRowid) {
            function find(nodes) {
                for (const n of nodes) {
                    if (n.rowid === maybeChildRowid) return true;
                    if (find(n.children || [])) return true;
                }
                return false;
            }
            const dragNode = dragLayer.arr.find(n => n.rowid === rootRowid);
            return dragNode ? find(dragNode.children || []) : false;
        }
        if (targetRowid && isDescendant(dragRowid, targetRowid)) {
            UI.toast('不能拖到自己的子节点下', 'warn');
            return;
        }

        // DOM/数据操作
        const dragNode = dragLayer.arr.find(n => n.rowid === dragRowid);
        const updates = []; // { rowid, quanzhong?, fu? }

        if (position === 'as-child') {
            // ⭐ as-child 优先级最高（即使同层也是"变成子"而不是重排）
            // 遍历整棵树找 targetNode
            const targetNode = (function find(nodes, id) {
                for (const n of nodes) {
                    if (n.rowid === id) return n;
                    const f = find(n.children || [], id);
                    if (f) return f;
                }
                return null;
            })(tree, targetRowid);
            if (!targetNode) { UI.toast('目标节点无效', 'error'); return; }
            // 防自己拖自己
            if (dragRowid === targetRowid) return;
            // 从原层移除（⭐验证 splice 真的移除了）
            const beforeSplice = dragLayer.arr.length;
            const removedIdx = dragLayer.arr.indexOf(dragNode);
            dragLayer.arr.splice(removedIdx, 1);
            if (dragLayer.arr.length !== beforeSplice - 1) {
                console.error('[Tree.drop] ⚠️ SPLICE FAILED! idx=' + removedIdx + ' before=' + beforeSplice + ' after=' + dragLayer.arr.length);
            } else {
                console.log('[Tree.drop] splice OK: removed from parent layer (' + beforeSplice + ' -> ' + dragLayer.arr.length + ')');
            }
            // 加为 targetNode 的子
            targetNode.children = targetNode.children || [];
            targetNode.children.push(dragNode);
            updates.push({ rowid: dragRowid, fu: targetRowid });
            // 重算原层 + 新子层
            redistributeWeights(dragLayer.arr, updates);
            redistributeWeights(targetNode.children, updates);
            console.log('[Tree.drop] AS-CHILD done. targetNode.children now has ' + targetNode.children.length + ' items. dragNode.parent now=' + (targetNode.children[targetNode.children.length-1] === dragNode ? 'targetNode' : 'WRONG'));
            // 同层重排
            const arr = dragLayer.arr;
            arr.splice(arr.indexOf(dragNode), 1);
            if (position === 'end') arr.push(dragNode);
            else {
                const tIdx = arr.findIndex(n => n.rowid === targetRowid);
                arr.splice(position === 'before' ? tIdx : tIdx + 1, 0, dragNode);
            }
            // 重算该层权重
            redistributeWeights(arr, updates);
        } else {
            // 跨层移动（before/after 到目标层）
            // ⭐ 2026-08-19 修复：target 在根层时 parentRowid=null，但 fu 必须写天根 rowid（写空会导致刷新后节点消失/重复）
            const newFuSid = targetRowid
                ? (targetLayer.parentRowid || window.ACTIVE_TIAN_ROOT || ROOT_FUYUAN)
                : (window.ACTIVE_TIAN_ROOT || ROOT_FUYUAN);
            // 从原层移除
            dragLayer.arr.splice(dragLayer.arr.indexOf(dragNode), 1);
            // 改 fu
            if (!targetRowid) {
                // 追加到根层末尾
                tree.push(dragNode);
                updates.push({ rowid: dragRowid, fu: window.ACTIVE_TIAN_ROOT || ROOT_FUYUAN });
            } else {
                const arr = targetLayer.arr;
                const tIdx = arr.findIndex(n => n.rowid === targetRowid);
                arr.splice(position === 'before' ? tIdx : tIdx + 1, 0, dragNode);
                updates.push({ rowid: dragRowid, fu: newFuSid });
            }
            // 重算两层权重
            redistributeWeights(dragLayer.arr, updates);
            redistributeWeights(targetRowid ? targetLayer.arr : tree, updates);
        }

        console.log('[Tree.drop] updates:', updates);

        // 批量写 HAP（每个 update 可能含 fu + quanzhong）
        const results = await Promise.all(updates.map(u => {
            const controls = [];
            if (u.fu !== undefined) controls.push({ controlId: FIELD_IDS.fu, value: u.fu || '', valueType: 2 });
            if (u.quanzhong !== undefined) controls.push({ controlId: FIELD_IDS.quanzhong, value: String(u.quanzhong), valueType: 0 });
            return API.updateRecord(u.rowid, controls)
                .then(resp => ({ ...u, ok: resp.success }))
                .catch(e => ({ ...u, ok: false, err: e.message }));
        }));

        // ⭐ 2026-08-19 内存同步：直接改 window.__tree 里 rec 的字段（不走 patchRecord）
        // patchRecord 内部 buildTree(allRecords) 会重建树，覆盖 handleTreeDrop 手动调整的结构（之前的 bug）
        // 这里 window.__tree 的结构已手动改好（数组移动），只需同步 rec 字段值
        (function syncMemory() {
            function findAll(nodes) {
                const map = new Map();
                (function walk(ns) {
                    for (const n of ns) {
                        map.set(n.rowid, n);
                        walk(n.children || []);
                    }
                })(nodes);
                return map;
            }
            const nodeMap = findAll(window.__tree || []);
            const FU_CID = '6a2cf9d5f06514e8747a64f0';
            const QZ_CID = '6a051fd0f255b2b51491a981';
            updates.forEach(u => {
                const node = nodeMap.get(u.rowid);
                if (!node) return;
                if (u.quanzhong !== undefined) node.rec[QZ_CID] = String(u.quanzhong);
                if (u.fu !== undefined) {
                    const parentNode = nodeMap.get(u.fu);
                    const parentName = parentNode ? Filter.getMingcheng(parentNode.rec) : '';
                    node.rec[FU_CID] = u.fu ? [{ sid: u.fu, name: parentName }] : [];
                }
            });
            // 同步 allRecords（reload 数据源）里的 rec 就是同一引用，改 node.rec 即改 allRecords 元素
            console.log('[Tree.drop] memory synced in-place, skipping patchRecord/buildTree');
        })();

        console.log('[Tree.drop] done. dragRowid=' + dragRowid.slice(0,8) + ' target=' + (targetRowid ? targetRowid.slice(0,8) : 'root') + ' pos=' + position + ' updates=' + updates.length);
        // ⭐ 2026-08-19 修复：手动 splice 累积 bug 导致 in-memory 树有重复
        // 改用最新 allRecords 重建 window.__tree（不依赖网络，1ms 完成）
        // App 暴露 getAllRecords() 让 Tree 能拿到底层缓存
        const allRecords = window.App && window.App.getAllRecords ? window.App.getAllRecords() : null;
        if (allRecords) {
            const underTian = Filter.filterUnderTian(allRecords);
            window.__tree = Filter.buildTree(underTian);
        }
        if (targetRowid) state.expanded.add(targetRowid);
        renderAll();

        const okCount = results.filter(r => r.ok).length;
        UI.toast(okCount === results.length ? '✓ 树排序已保存（' + results.length + ' 条，' + (Date.now() - t0) + 'ms）' : '部分失败：' + okCount + '/' + results.length, results.length === okCount ? 'success' : 'warn');
        Sync.pushLocal({ type: 'batch-mod', op: 'treeDrop', updates });
    }

    /**
     * 权重值池分配：该层所有节点的原有权重值降序排列，按新位置依次赋值
     * （排序即权重：位置 0 拿最大值，位置 1 拿次大值...值池不变）
     */
    function redistributeWeights(arr, updates) {
        const qzValues = arr.map(n => Filter.getQuanzhong(n.rec) || 0).sort((a, b) => b - a);
        arr.forEach((n, i) => {
            const newQz = qzValues[i];
            const oldQz = Filter.getQuanzhong(n.rec) || 0;
            if (newQz !== oldQz) {
                n.rec[FILTER_IDS_ALIAS.quanzhong] = String(newQz); // 更新内存 rec
                const exist = updates.find(u => u.rowid === n.rowid);
                if (exist) exist.quanzhong = newQz;
                else updates.push({ rowid: n.rowid, quanzhong: newQz });
            }
        });
    }

    // quanzhong 字段别名映射（redistributeWeights 更新内存用）
    const FILTER_IDS_ALIAS = { quanzhong: '6a051fd0f255b2b51491a981' };

    function countAll(node, predicate) {
        // 支持数组输入（tree 根数组）
        if (Array.isArray(node)) return node.reduce((s, n) => s + countAll(n, predicate), 0);
        const pred = predicate || (() => true);
        if (!node || !node.rec) return 0; // 防御：rec 缺省时当 0
        let n = pred(node) ? 1 : 0;
        for (const c of (node.children || [])) n += countAll(c, predicate);
        return n;
    }

    function traverse(tree, fn) {
        for (const node of tree) {
            fn(node, node.depth);
            traverse(node.children, fn);
        }
    }

    /**
     * ===== 内联编辑（不打断心流）=====
     * 2026-08-20 用户要求：点➕按钮在该节点下出现输入框；双击节点变输入框改名
     */

    /** 双击节点名称 -> inline 编辑框 */
    function startEditInline(rec, nameEl) {
        const input = document.createElement('input');
        input.className = 'tree-inline-input';
        input.value = Filter.getMingcheng(rec);
        nameEl.replaceWith(input);
        input.focus();
        input.select();
        let done = false;
        const finish = (commit) => {
            if (done) return;
            done = true;
            const newName = input.value.trim();
            if (commit && newName && newName !== Filter.getMingcheng(rec)) {
                // ⭐ 立即恢复 span（不等 reload），避免输入框停留
                const span = document.createElement('span');
                span.className = 'tree-name';
                span.textContent = newName;
                input.replaceWith(span);
                onRename(rec, newName);  // app.js 调 API + reload
            } else {
                // 恢复 span 原名
                const span = document.createElement('span');
                span.className = 'tree-name';
                span.textContent = Filter.getMingcheng(rec);
                input.replaceWith(span);
            }
        };
        input.onkeydown = (e) => {
            if (e.key === 'Enter') finish(true);
            else if (e.key === 'Escape') finish(false);
        };
        input.onblur = () => finish(true); // 失焦也提交
    }

    /** 点➕按钮 -> 在该节点下显示创建输入框 */
    function showCreateInput(node, wrap) {
        let childWrap = wrap.querySelector('.tree-children');
        if (!childWrap) {
            childWrap = document.createElement('div');
            childWrap.className = 'tree-children';
            wrap.appendChild(childWrap);
        }
        const inputWrap = document.createElement('div');
        inputWrap.className = 'tree-node-content creating';
        const input = document.createElement('input');
        input.className = 'tree-inline-input';
        input.placeholder = '输入名称...';
        inputWrap.appendChild(input);
        childWrap.appendChild(inputWrap);
        input.focus();
        let done = false;
        const finish = (commit) => {
            if (done) return;
            done = true;
            const name = input.value.trim();
            if (commit && name) {
                inputWrap.remove();           // ⭐ 立即移除输入框（不等 reload）
                onAddChild(node.rec, name);   // app.js 创建 8计划 + reload
            } else {
                inputWrap.remove();
            }
        };
        input.onkeydown = (e) => {
            if (e.key === 'Enter') finish(true);
            else if (e.key === 'Escape') finish(false);
        };
        input.onblur = () => finish(true);
    }

    /**
     * 渲染单个节点
     */
    function renderNode(node) {
        const wrap = document.createElement('div');
        wrap.className = 'tree-node';
        wrap.dataset.rowid = node.rowid;

        const content = document.createElement('div');
        const isTarget = Filter.isTarget(node.rec);
        let diffClass = '';
        const action = getDiffAction(node.rowid);
        if (action === 'new') diffClass = ' is-new';
        else if (action === 'mod') diffClass = ' is-modified';
        else if (action === 'del') diffClass = ' is-deleted';
        content.className = `tree-node-content ${isTarget ? 'is-target' : 'is-plan'}${diffClass}`;
        // 父链高亮（看板选中卡片时联动）
        if (state.highlighted.has(node.rowid)) content.classList.add('highlight');

        // 展开/折叠按钮（有子节点就显示箭头）
        const visibleCount = node.children ? node.children.length : 0;
        const toggle = document.createElement('span');
        toggle.className = 'tree-toggle';
        if (visibleCount > 0) {
            toggle.textContent = state.expanded.has(node.rowid) ? '▼' : '▶';
            toggle.onclick = (e) => {
                e.stopPropagation();
                if (state.expanded.has(node.rowid)) {
                    state.expanded.delete(node.rowid);
                } else {
                    state.expanded.add(node.rowid);
                }
                renderNodeInto(wrap, node);
            };
        } else {
            toggle.classList.add('empty');
        }

        // （2026-08-22 用户要求：树不再有 checkbox 勾选）

        // 图标
        const icon = document.createElement('span');
        icon.className = 'tree-icon';
        icon.textContent = isTarget ? '🎯' : '⚡';

        // 名称（双击由 content.ondblclick 统一处理）；wancheng="1" 名称划线（2026-09-03）
        const name = document.createElement('span');
        name.className = 'tree-name' + (node.rec[window.FIELD_IDS.wancheng] === '1' ? ' done' : '');
        name.textContent = Filter.getMingcheng(node.rec);

        // diff 徽标
        let badge = '';
        if (action === 'new') badge = '<span class="tree-badge new">新增</span>';
        else if (action === 'mod') badge = '<span class="tree-badge mod">修改</span>';
        else if (action === 'del') badge = '<span class="tree-badge del">删除</span>';

        // meta
        // meta 只放 diff 徽标；不再显示 sew 的 7/8 数字（图标 🎯/⚡ 已足够直观，2026-08-27 小风要求）
        const meta = document.createElement('span');
        meta.className = 'tree-meta';
        meta.innerHTML = badge;

        // 操作按钮：只保留 ➕（在该节点下创建子项目 = fu=该节点）
        const actions = document.createElement('span');
        actions.className = 'tree-actions';
        actions.innerHTML = `
            <button class="tree-action-btn" title="在该节点下创建子项目" data-act="add">➕</button>
        `;
        actions.onclick = (e) => {
            e.stopPropagation();
            showCreateInput(node, wrap);
        };

        content.appendChild(toggle);

        content.appendChild(icon);
        content.appendChild(name);
        content.appendChild(meta);
        content.appendChild(actions);

        // 点击/双击区分：单击延迟 250ms，期间双击则取消单击改编辑
        let clickTimer = null;
        content.onclick = (e) => {
            if (e.target.tagName === 'INPUT') return;
            if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return; } // 第二次点击 = 双击
            clickTimer = setTimeout(() => {
                clickTimer = null;
                onNodeClick(node.rec);
            }, 250);
        };
        content.ondblclick = (e) => {
            if (e.target.tagName === 'INPUT') return;
            if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
            startEditInline(node.rec, name);
        };

        // ===== 拖拽排序（2026-08-19）：拖动改变顺序/层级，按位置重新分配权重 =====
        content.draggable = true;
        content.addEventListener('dragstart', (e) => {
            if (e.target.tagName === 'INPUT') { e.preventDefault(); return; }
            e.dataTransfer.setData('text/plain', 'tree:' + node.rowid);
            e.dataTransfer.effectAllowed = 'move';
            content.classList.add('dragging');
        });
        content.addEventListener('dragend', () => {
            content.classList.remove('dragging');
            document.querySelectorAll('.tree-node-content.drop-before, .tree-node-content.drop-after').forEach(c => {
                c.classList.remove('drop-before', 'drop-after');
            });
        });
        content.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            e.stopPropagation();
            const rect = content.getBoundingClientRect();
            const relY = (e.clientY - rect.top) / rect.height; // 0=顶 1=底
            // 清掉兄弟节点的指示线
            document.querySelectorAll('.tree-node-content.drop-before, .tree-node-content.drop-after, .tree-node-content.drop-as-child').forEach(c => {
                if (c !== content) c.classList.remove('drop-before', 'drop-after', 'drop-as-child');
            });
            let position;
            if (relY < 0.33) position = 'before';
            else if (relY < 0.66) position = 'as-child';
            else position = 'after';
            content.classList.toggle('drop-before', position === 'before');
            content.classList.toggle('drop-after', position === 'after');
            content.classList.toggle('drop-as-child', position === 'as-child');
        });
        content.addEventListener('dragleave', () => {
            content.classList.remove('drop-before', 'drop-after', 'drop-as-child', 'drop-disabled');
        });
        content.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            content.classList.remove('drop-before', 'drop-after', 'drop-as-child', 'drop-disabled');
            const raw = e.dataTransfer.getData('text/plain');
            if (!raw || !raw.startsWith('tree:')) return;
            const dragRowid = raw.slice(5);
            if (dragRowid === node.rowid) return;
            // 叶子目标：不能拖入，禁止 drop
            const rect = content.getBoundingClientRect();
            const relY = (e.clientY - rect.top) / rect.height;
            let position;
            if (relY < 0.33) position = 'before';
            else if (relY < 0.66) position = 'as-child';
            else position = 'after';
            console.log('[Tree.drop] drop: drag=' + dragRowid.slice(0,8) + ' target=' + node.rowid.slice(0,8) + ' relY=' + relY.toFixed(2) + ' -> position=' + position);
            handleTreeDrop(dragRowid, node.rowid, position);
        });

        wrap.appendChild(content);

        // 子节点：显示全部（2026-08-20 含叶子/最小可执行项）
        if (node.children && node.children.length > 0) {
            const childWrap = document.createElement('div');
            childWrap.className = 'tree-children';
            if (!state.expanded.has(node.rowid)) childWrap.classList.add('collapsed');
            for (const child of node.children) {
                childWrap.appendChild(renderNode(child));
            }
            wrap.appendChild(childWrap);
        }

        return wrap;
    }

    /**
     * 查给定 rowid 的 diff 动作（new/mod/del/null）
     */
    function getDiffAction(rowid) {
        const diff = (window.__currentDiff) || null;
        if (!diff) return null;
        for (const item of diff.newItems) {
            if (item.json && item.json.rowid === rowid) return 'new';
        }
        for (const item of diff.modItems) {
            if (item.rec && item.rec.rowid === rowid) return 'mod';
        }
        for (const item of diff.delItems) {
            if (item.rec && item.rec.rowid === rowid) return 'del';
        }
        return null;
    }

    function setDiff(diff) {
        window.__currentDiff = diff;
    }

    function clearDiff() {
        window.__currentDiff = null;
    }

    function renderNodeInto(wrap, node) {
        const fresh = renderNode(node);
        wrap.replaceWith(fresh);
    }

    /**
     * 重绘 DOM（⭐保留 state：highlighted/selected/expanded 不清空）
     * 用于 highlightAncestors 等局部刷新 -- 避免 renderTree 清状态自踩
     */
    function renderAll() {
        const tree = window.__tree || [];
        // 诊断 dump
        (function dumpTree() {
            const seen = new Set();
            const lines = [];
            (function walk(nodes, prefix) {
                for (const n of nodes) {
                    const mark = seen.has(n.rowid) ? ' ⚠️DUP' : '';
                    seen.add(n.rowid);
                    lines.push(prefix + Filter.getMingcheng(n.rec).slice(0, 20) + ' (' + (n.children||[]).length + ')' + mark);
                    walk(n.children || [], prefix + '  ');
                }
            })(tree, '');
            console.log('[renderAll] tree:\n' + lines.join('\n'));
        })();
        container.innerHTML = '';
        if (!tree || tree.length === 0) {
            container.innerHTML = '<div class="empty-state">「天」下暂无目标/计划数据</div>';
            return;
        }
        // ⭐ 2026-08-20 修复：显示所有节点（含叶子根）——之前留了旧的"跳过叶子根"逻辑，
        // 导致小风（11 个根全是叶子）点击节点后 renderAll 清空容器但一个都不渲染 = 树消失
        let rendered = 0;
        for (const root of tree) {
            try {
                container.appendChild(renderNode(root));
                rendered++;
            } catch (err) {
                console.error('[renderAll] renderNode failed:', Filter.getMingcheng(root.rec), err);
            }
        }
        const rect = container.getBoundingClientRect();
        console.log('[renderAll] RESULT: rendered=' + rendered + '/' + tree.length + ' | w=' + Math.round(rect.width) + ' h=' + Math.round(rect.height) + ' visible=' + (rect.width > 0 ? 'YES' : 'NO'));
        // 容器空白 drop = 追加到根层末尾
        container.ondragover = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
        container.ondrop = (e) => {
            const t = e.target;
            if (t.closest && t.closest('.tree-node-content')) return;
            e.preventDefault();
            const raw = e.dataTransfer.getData('text/plain');
            if (!raw || !raw.startsWith('tree:')) return;
            handleTreeDrop(raw.slice(5), null, 'end');
        };
    }

    /**
     * 高亮给定 rowid 的父链（父 + 父的父 + ... 直至根）
     * 用于看板选中卡片时联动树：卡片自身是叶子不在树里，只高亮它的祖先链
     */
    function highlightAncestors(targetRowid) {
        const tree = window.__tree || [];
        const ancestors = Filter.findAncestors(tree, targetRowid);
        state.highlighted.clear();
        // ⭐ 2026-08-20 含自己（看板选中卡片 -> 树高亮祖先链 + 自己共多条）
        state.highlighted.add(targetRowid);
        ancestors.forEach(rid => {
            state.highlighted.add(rid);
            state.expanded.add(rid); // 展开可见
        });
        console.log('[Tree.highlightAncestors] rowid=' + targetRowid.slice(0,8) + ' ancestors=' + ancestors.length + ' (+self)');
        renderAll();
    }

    /**
     * 单选高亮（树内点击某节点）：
     * 清掉所有高亮 -> 只高亮当前一条
     * 用户此时关注的是层级树，看板选中态由 app.js 取消
     */
    function highlightSingle(targetRowid) {
        state.highlighted.clear();
        state.highlighted.add(targetRowid);
        console.log('[Tree.highlightSingle] rowid=' + targetRowid.slice(0,8));
        renderAll();
    }

    /** 全展开/全折叠 */
    btnExpandAll.onclick = () => {
        state.expanded.clear();
        traverse(window.__tree || [], node => state.expanded.add(node.rowid));
        renderAll();
    };
    btnCollapseAll.onclick = () => {
        state.expanded.clear();
        renderAll();
    };

    return {
        renderTree,
        setCallbacks,
        highlightAncestors,

        getExpandedRowids: () => Array.from(state.expanded),
        setTree: (tree) => { window.__tree = tree; },
        setDiff,
        clearDiff,
        highlightSingle,
        setSelected: (rowid) => { state.selected = rowid; renderAll(); },
        /** 当前高亮/选中的节点 rec（取 highlighted 第一条）-- Delete 键删除用 */
        getSelectedRec: () => {
            const first = [...state.highlighted][0];
            if (!first) return null;
            const tree = window.__tree || [];
            return (function find(nodes) {
                for (const n of nodes) {
                    if (n.rowid === first) return n.rec;
                    const r = find(n.children || []);
                    if (r) return r;
                }
                return null;
            })(tree);
        },
        getSelected: () => state.selected
    };
})();