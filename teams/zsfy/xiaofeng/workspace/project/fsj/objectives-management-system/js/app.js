/**
 * App 主入口
 */
window.App = (function() {
    // 全局数据
    let allRecords = [];           // 全表
    let treeData = [];             // 树
    let leaves = [];               // 真叶子

    // 详情面板
    const detailPanel = document.getElementById('detail-panel');
    const detailPath = document.getElementById('detail-path');
    const detailFields = document.getElementById('detail-fields');
    // 详情/编辑按钮现在在右侧 panel 内部动态生成（renderDetail 中）
    // 不再需要绑定固定位置的 btnEdit/btnPromote/btnDelete
    const agentSelect = document.getElementById('agent-select');

    let currentSelectedLeaf = null;
    let reloadSeq = 0;  // 竞态保护：切换 agent 连续触发 reload 时，只有最新的才能更新 UI

    /** 初始化：拉数据 + 渲染 */
    async function init() {
        const t0 = Date.now();
        console.log('[App.init] start');
        bindCallbacks();
        Sync.setRecordsRef(allRecords);
        console.log('[App.init] callbacks bound, allRecords shared with Sync');

        await reload();

        // 顶部按钮
        document.getElementById('btn-refresh').onclick = () => reload();
        document.getElementById('btn-add-target').onclick = () => showAddTargetDialog();
        document.getElementById('btn-add-plan').onclick = () => showAddPlanDialog();

        // 同步按钮：从 HAP 拉当前天根最新 → diff 本地 → 预览 → 应用
        document.getElementById('btn-sync').onclick = async () => {
            const ts = Date.now();
            const selectedAgent = agentSelect ? agentSelect.value : 'all';
            const tianRoot = selectedAgent !== 'all' ? window.AGENT_TIAN_ROOT[selectedAgent] : null;
            console.log('[Sync.btn] clicked, agent=' + selectedAgent + ', tianRoot=' + (tianRoot ? tianRoot.slice(0,8) : 'all'));
            try {
                UI.showLoading('同步中…');
                // 同步拉取的 remote 范围必须与本地显示范围一致：当前 agent 天根
                const fetchRemote = async () => {
                    if (tianRoot) {
                        console.log('[Sync.btn] fetching v3 by root...');
                        const data = await API.fetchByRoot(tianRoot);
                        return data.rows || [];
                    } else {
                        console.log('[Sync.btn] fetching v2 full...');
                        const data = await API.fetchAll();
                        return data.rows || [];
                    }
                };
                // 同步对比的范围 = 本地显示的 underTian（不是全表）
                const localScope = Filter.filterUnderTian(allRecords);
                console.log('[Sync.btn] local scope: ' + localScope.length + ' 条, will compare with remote');
                await Sync.sync(localScope, fetchRemote, tianRoot);
                console.log('[Sync.btn] Sync.sync returned, re-rendering...');
                const underTian = Filter.filterUnderTian(allRecords);
                treeData = Filter.buildTree(underTian);
                leaves = Filter.collectLeaves(treeData);
                Tree.setTree(treeData);
                Tree.renderTree(treeData);
                Kanban.renderKanban(leaves);
                updateTitles(underTian, leaves);
                console.log('[Sync.btn] done in', Date.now() - ts, 'ms');
            } catch (e) {
                console.error('[Sync.btn] error:', e);
                UI.toast('同步失败：' + e.message, 'error');
            } finally {
                UI.hideLoading();
            }
        };

        // agent 切换
        agentSelect.onchange = () => {
            console.log('[Agent.switch] selected:', agentSelect.value, agentSelect.selectedOptions[0]?.text);
            reload();
        };

        // Delete 键 -> 删除当前选中的树节点（弹确认框）
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Delete') return;
            // 焦点在输入框/下拉时忽略（编辑中不误删）
            const tag = (document.activeElement || {}).tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            const sel = Tree.getSelectedRec && Tree.getSelectedRec();
            if (!sel) {
                UI.toast('先点选一个节点再按 Delete', 'warn');
                return;
            }
            e.preventDefault();
            confirmDelete(sel, null);
        });

        console.log('[App.init] done in', Date.now() - t0, 'ms');
    }

    function updateTitles(underTian, leafArr) {
        const maxDepth = computeMaxDepth(treeData);
        const treeTitle = document.querySelector('#tree-section .section-header h2');
        if (treeTitle) treeTitle.textContent = `层级树（${underTian.length} 条数据，最深 ${maxDepth} 层）`;
        const kanbanTitle = document.querySelector('#kanban-section .section-header h2');
        if (kanbanTitle) kanbanTitle.textContent = `最小可执行计划（真叶子 ${leafArr.length} 条）`;
    }

    function setDiff(diff) {
        window.__currentDiff = diff;
        Tree.setDiff(diff);
        // 更新 diff banner
        const banner = document.getElementById('diff-banner');
        if (!diff || (diff.newItems.length + diff.modItems.length + diff.delItems.length === 0)) {
            banner.classList.add('hidden');
            return;
        }
        banner.classList.remove('hidden');
        document.getElementById('diff-new-count').textContent = `新增 ${diff.newItems.length}`;
        document.getElementById('diff-mod-count').textContent = `修改 ${diff.modItems.length}`;
        document.getElementById('diff-del-count').textContent = `删除 ${diff.delItems.length}`;
    }

    function clearDiff() {
        window.__currentDiff = null;
        Tree.clearDiff();
        document.getElementById('diff-banner').classList.add('hidden');
        reload();
    }

    function bindCallbacks() {
        Tree.setCallbacks({
            onNodeClick: (rec) => {
                // 树节点点击 -> 单条高亮（清掉祖先链高亮）+ 取消看板选中 + 详情
                // 用户关注点转移到层级树，看板不再需要选中态
                renderDetail('view', rec);
                Tree.highlightSingle(rec.rowid);
                document.querySelectorAll('.kanban-card.highlight').forEach(c => c.classList.remove('highlight'));
            },
            onAddChild: async (parentRec, name) => {
                // ➕ inline 创建子项目（fu=parentRec）-> 乐观更新（不等 reload，立即显示）
                // ⭐ 2026-08-20 修复：fuyuan 用当前激活天根（之前硬编码 ROOT_FUYUAN 导致小风视图创建的数据挂错天根）
                const activeRoot = window.ACTIVE_TIAN_ROOT || ROOT_FUYUAN;
                try {
                    const controls = [
                        { controlId: FIELD_IDS.mingcheng, value: name },
                        { controlId: FIELD_IDS.wznr, value: '' },
                        { controlId: FIELD_IDS.sew, value: SEW_KEYS.plan, valueType: 2 },
                        { controlId: FIELD_IDS.leixing, value: '55c1d467-927b-4af8-98a9-d934554ac3bf', valueType: 2 },
                        { controlId: FIELD_IDS.fu, value: parentRec.rowid, valueType: 2 },
                        { controlId: FIELD_IDS.fuyuan, value: activeRoot, valueType: 2 },
                        { controlId: FIELD_IDS.fabuzhe, value: 'a8515e76-7b02-4baf-bedd-3ff011b1a9e5', valueType: 2 },
                        { controlId: FIELD_IDS.fbsj, value: nowStr() },
                        { controlId: FIELD_IDS.zhixindu, value: '5000', valueType: 0 },
                        { controlId: FIELD_IDS.quanzhong, value: '0', valueType: 0 }
                    ];
                    const resp = await API.addRecord(controls);
                    if (!resp.success) throw new Error(JSON.stringify(resp));
                    const newRowid = resp.data;
                    Sync.pushLocal({ type: 'add', newRowid, controls, op: 'addPlan', parentFu: parentRec.rowid });
                    UI.toast('创建成功：' + name, 'success');

                    // ⭐ 乐观更新：手动构造新 rec 插入 allRecords + 重建树/看板（不等 12 秒 reload）
                    const newRec = {};
                    newRec.rowid = newRowid;
                    newRec[FIELD_IDS.mingcheng] = name;
                    newRec[FIELD_IDS.wznr] = '';
                    newRec[FIELD_IDS.sew] = [{ sid: SEW_KEYS.plan, name: '8计划' }];
                    newRec[FIELD_IDS.fu] = [{ sid: parentRec.rowid, name: Filter.getMingcheng(parentRec) }];
                    newRec[FIELD_IDS.fuyuan] = [{ sid: activeRoot, name: '天' }];
                    newRec[FIELD_IDS.leixing] = [{ sid: '55c1d467-927b-4af8-98a9-d934554ac3bf', name: '知识' }];
                    newRec[FIELD_IDS.fabuzhe] = [{ sid: 'a8515e76-7b02-4baf-bedd-3ff011b1a9e5', name: '小风' }];
                    newRec[FIELD_IDS.zi] = [];
                    newRec[FIELD_IDS.quanzhong] = '0';
                    newRec[FIELD_IDS.zhixindu] = '5000';
                    newRec[FIELD_IDS.shanchu] = '0';
                    newRec[FIELD_IDS.fbsj] = nowStr();
                    allRecords.push(newRec);

                    // 重建树 + 看板（纯内存操作，<10ms）
                    const underTian = Filter.filterUnderTian(allRecords);
                    treeData = Filter.buildTree(underTian);
                    leaves = Filter.collectLeaves(treeData);
                    Tree.setTree(treeData);
                    Tree.renderTree(treeData);
                    Kanban.renderKanban(leaves);
                    console.log('[App.onAddChild] optimistic update: new node visible immediately');
                } catch (e) {
                    UI.toast('创建失败：' + e.message, 'error', 4000);
                }
            },
            onRename: async (rec, newName) => {
                // 双击改名
                UI.showLoading('改名中…');
                try {
                    const controls = [{ controlId: FIELD_IDS.mingcheng, value: newName }];
                    const resp = await API.updateRecord(rec.rowid, controls);
                    if (!resp.success) throw new Error(JSON.stringify(resp));
                    Sync.pushLocal({ type: 'mod', rowid: rec.rowid, controls, op: 'rename', newName });
                    UI.toast('改名成功：' + newName, 'success');
                    await reload();
                } catch (e) {
                    UI.toast('改名失败：' + e.message, 'error', 4000);
                } finally {
                    UI.hideLoading();
                }
            },
            onEdit: (rec) => showEditDialog(rec),
            onDelete: (rec, node) => confirmDelete(rec, node)
        });
        Kanban.setCallbacks({
            onCardClick: (leaf) => {
                // 看板选中卡片 -> 详情面板 + 树父链进入选中样式
                renderDetail('view', leaf);
                Tree.highlightAncestors(leaf.rowid);
            },
            onCardEdit: (leaf) => showEditDialog(leaf),
            onCardDelete: (leaf) => confirmDelete(leaf)
        });

        // 详情/编辑按钮在右侧 panel 内部动态生成（renderDetail 中），不再绑固定按钮
    }

    /** 拉数据 + 重渲染 */
    async function reload() {
        const t0 = Date.now();
        const seq = ++reloadSeq;  // 本次 reload 的序号
        console.log('[Reload] start #' + seq);
        try {
            console.log('[Reload.step] 1/5 UI.showLoading');
            UI.showLoading('拉数据中…');

            // 按 Agent 天根决定拉取策略：选定 agent → v3 快端点（只拉该天根）；全部 → v2 全表
            const selectedAgent = agentSelect ? agentSelect.value : 'all';
            const tianRoot = selectedAgent !== 'all' ? window.AGENT_TIAN_ROOT[selectedAgent] : null;

            let fetchMode, fetchMs, returnedCount;
            if (tianRoot) {
                console.log('[Reload.step] 2/5 API.fetchByRoot (v3 服务端过滤, root=' + tianRoot.slice(0, 8) + '..)');
                const tFetch = Date.now();
                try {
                    const data = await API.fetchByRoot(tianRoot);
                    // ⭐ fetch 返回后立即检查：abandon 时不污染 allRecords
                    if (seq !== reloadSeq) {
                        console.log('[Reload] #' + seq + ' ABANDONED before allRecords assign (newer #' + reloadSeq + ')');
                        return;
                    }
                    allRecords = data.rows || [];
                    fetchMode = 'v3-by-root';
                    fetchMs = Date.now() - tFetch;
                    returnedCount = allRecords.length;
                    console.log('[Reload.step] 2/5 v3 returned', returnedCount, 'rows in', fetchMs, 'ms (server total: ' + data.total + ')');
                } catch (e) {
                    console.warn('[Reload.step] 2/5 v3 failed, fallback to v2 full fetch:', e.message);
                    const t2 = Date.now();
                    const data = await API.fetchAll((p) => {
                        const pct = p.total ? Math.round(p.fetched / p.total * 100) : 0;
                        UI.showLoading(`拉全表中… ${pct}%（${p.fetched}/${p.total} 条，第 ${p.page} 页）`);
                    });
                    if (seq !== reloadSeq) {
                        console.log('[Reload] #' + seq + ' ABANDONED in v2 fallback (newer #' + reloadSeq + ')');
                        return;
                    }
                    allRecords = data.rows || [];
                    fetchMode = 'v2-fallback';
                    fetchMs = Date.now() - t2;
                    returnedCount = allRecords.length;
                    console.log('[Reload.step] 2/5 v2 fallback returned', returnedCount, 'rows in', fetchMs, 'ms');
                }
            } else {
                console.log('[Reload.step] 2/5 API.fetchAll (v2 拉全表，流式进度)');
                const tFetch = Date.now();
                const data = await API.fetchAll((p) => {
                    const pct = p.total ? Math.round(p.fetched / p.total * 100) : 0;
                    UI.showLoading(`拉全表中… ${pct}%（${p.fetched}/${p.total} 条，第 ${p.page} 页）`);
                });
                if (seq !== reloadSeq) {
                    console.log('[Reload] #' + seq + ' ABANDONED in v2 full (newer #' + reloadSeq + ')');
                    return;
                }
                allRecords = data.rows || [];
                fetchMode = 'v2-full';
                fetchMs = Date.now() - tFetch;
                returnedCount = allRecords.length;
                console.log('[Reload.step] 2/5 v2 returned', returnedCount, 'rows in', fetchMs, 'ms');
            }

            // ⭐ 渲染前最终竞态检查
            if (seq !== reloadSeq) {
                console.log('[Reload] #' + seq + ' ABANDONED before render (newer #' + reloadSeq + ')');
                return;
            }

            // 天下过滤（v3 模式下已经是精确数据，此步是二次保险）
            // 把当前 tianRoot 暴露给前端 filter（filterUnderTian 默认读 window.ACTIVE_TIAN_ROOT）
            window.ACTIVE_TIAN_ROOT = tianRoot || null;
            console.log('[Reload.step] 3/5 Filter.filterUnderTian (tianRoot=' + (tianRoot ? tianRoot.slice(0,8) : 'all') + ')');
            let underTian = Filter.filterUnderTian(allRecords, tianRoot);
            console.log('[Reload.step] 3/5 underTian: ' + underTian.length + ' 条 (fetch=' + fetchMode + ', 获取=' + returnedCount + ' 条, 耗时=' + fetchMs + 'ms)');

            // agent 天的二次过滤：v3 模式服务端已按 tianRoot 过滤，这里幂等再过滤一次
            if (tianRoot) {
                const before = underTian.length;
                underTian = underTian.filter(r => Filter.getFuyuanSid(r) === tianRoot);
                const agentName = agentSelect.selectedOptions[0]?.text || selectedAgent;
                console.log('[Reload.step] 3/5 agent filter: agent=' + agentName + ' tianRoot=' + tianRoot.slice(0, 8) + '.. before=' + before + ' after=' + underTian.length);
                if (before > 0 && underTian.length === 0) {
                    UI.toast(`${agentName} 的「天」下暂无数据（用「全部」看其他天根，或在 HAP 后台加数据）`, 'warn', 4000);
                }
            }

            console.log('[Reload.step] 4/5 buildTree + collectLeaves');
            treeData = Filter.buildTree(underTian);
            leaves = Filter.collectLeaves(treeData); // 叶子 = 树结构 children.length===0
            console.log('[Reload.step] 4/5 tree roots: ' + treeData.length + ' leaves: ' + leaves.length + ' max depth: ' + computeMaxDepth(treeData));

            Tree.setTree(treeData);
            console.log('[Reload.step] 5/5 Tree.renderTree + Kanban.renderKanban');
            Tree.renderTree(treeData);

            Kanban.renderKanban(leaves);

            // 动态更新 section 标题
            const maxDepth = computeMaxDepth(treeData);
            const treeTitle = document.querySelector('#tree-section .section-header h2');
            if (treeTitle) treeTitle.textContent = `层级树（${underTian.length} 条数据，最深 ${maxDepth} 层）`;
            const kanbanTitle = document.querySelector('#kanban-section .section-header h2');
            if (kanbanTitle) kanbanTitle.textContent = `最小可执行计划（真叶子 ${leaves.length} 条）`;

            console.log('[Reload.step] 5/5 done — 数据量: 获取 ' + returnedCount + ' → 过滤 ' + underTian.length + ' → 叶子 ' + leaves.length + ' (' + fetchMode + ')');
            UI.setStatus(`显示 ${underTian.length} 条 / 获取 ${returnedCount} 条 (${fetchMode}) / 真叶子 ${leaves.length} 条`);
        } catch (e) {
            console.error('[Reload.error]', e);
            UI.toast('加载失败：' + e.message, 'error');
        } finally {
            // 只有最新的 reload 才关 loading（abandon 的不能关掉新 reload 的指示器）
            if (seq === reloadSeq) {
                UI.hideLoading();
                console.log('[Reload] #' + seq + ' done in', Date.now() - t0, 'ms');
            } else {
                console.log('[Reload] #' + seq + ' abandoned (finally), loading kept for #' + reloadSeq);
            }
        }
    }

    function computeMaxDepth(tree) {
        function d(node) {
            if (!node.children || node.children.length === 0) return 1;
            return 1 + Math.max(...node.children.map(d));
        }
        if (!tree || tree.length === 0) return 0;
        return Math.max(...tree.map(d));
    }

    /** 显示叶子详情（路径 + 字段） */
    /**
     * 右侧详情 + 内联编辑（始终在 detail-panel 内渲染，不再弹窗）
     * @param {string} mode 'view' | 'edit' | 'add-target' | 'add-plan' | 'empty'
     * @param {object} rec 当前选中（编辑/查看时），null（empty/add）
     */
    // ===== 参与成员（ptyh 字段）辅助 =====
    const P_USER_AVATAR_FIELD = '69ad979f6a3532cabd764603';  // 用户表头像字段 controlId

    /** 从 ptyh 数组解析成员列表 [{sid, name, avatar}] */
    function getMembers(rec) {
        const p = rec[FIELD_IDS.ptyh] || rec.ptyh;
        if (!Array.isArray(p)) return [];
        return p.map(m => {
            if (typeof m !== 'object' || !m) return null;
            let avatar = null;
            if (m.avatar) {
                avatar = m.avatar;
            } else if (m.sourcevalue) {
                try {
                    const sv = JSON.parse(m.sourcevalue);
                    const av = sv[P_USER_AVATAR_FIELD];
                    if (Array.isArray(av) && av[0]) {
                        avatar = av[0].thumbnail_path || av[0].preview_url || av[0].url || null;
                    }
                } catch (e) {}
            }
            return { sid: m.sid || '', name: m.name || m.sid?.slice(0, 6) || '?', avatar };
        }).filter(m => m && m.sid);
    }

    /** 渲染成员条目（头像+昵称+可选删除） */
    function renderMembersHtml(members, editable) {
        if (!members.length) return '<span style="font-size:12px;color:var(--text-muted)">（无参与成员）</span>';
        return members.map(m => {
            const avatarInner = m.avatar
                ? `<img src="${m.avatar}" style="width:28px;height:28px;border-radius:50%;object-fit:cover">`
                : `<span style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:var(--accent-primary);color:#fff;font-size:12px;font-weight:600">${escapeHtml((m.name || '?').slice(0, 1))}</span>`;
            return `
                <div class="member-chip" data-sid="${m.sid}">
                    ${avatarInner}
                    <span style="font-size:12px;margin:0 6px">${escapeHtml(m.name)}</span>
                    ${editable ? `<button class="member-del" data-sid="${m.sid}" title="移除成员">×</button>` : ''}
                </div>
            `;
        }).join('');
    }

    /** 更新 ptyh 字段（添加/删除成员后写 HAP） */
    async function updateMembers(rec, newMembers) {
        UI.showLoading('更新成员…');
        try {
            const controls = [{ controlId: FIELD_IDS.ptyh, value: newMembers.map(m => m.sid).join(','), valueType: 2 }];
            const resp = await API.updateRecord(rec.rowid, controls);
            if (!resp.success) throw new Error(JSON.stringify(resp));
            Sync.pushLocal({ type: 'mod', rowid: rec.rowid, controls, op: 'updateMembers' });
            UI.toast('✓ 成员已更新', 'success');
            // 内存同步
            rec[FIELD_IDS.ptyh] = newMembers.map(m => ({ sid: m.sid, name: m.name }));
            renderDetail('view', rec);
        } catch (e) {
            UI.toast('更新成员失败：' + e.message, 'error', 4000);
        } finally {
            UI.hideLoading();
        }
    }

    /** 绑定成员区块交互（添加/删除） */
    function bindMemberEvents(body, rec, members) {
        // 删除
        body.querySelectorAll('.member-del').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const sid = btn.dataset.sid;
                const next = members.filter(m => m.sid !== sid);
                await updateMembers(rec, next);
            };
        });
        // 添加（弹成员列表选择器）
        const addBtn = body.querySelector('.member-add');
        if (addBtn) {
            addBtn.onclick = async () => {
                // 拉用户列表（按 shangjia 过滤）
                const modalBody = document.getElementById('modal-body');
                const modalFooter = document.getElementById('modal-footer');
                UI.showModal({ title: '添加参与成员' });
                modalBody.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px">加载成员列表中…</div>';
                modalFooter.innerHTML = '<button class="btn" onclick="UI.hideModal()">关闭</button>';
                try {
                    const resp = await fetch(window.API_BASE + '/api/users?shangjia=f009cda3-cc49-400d-82cd-cbe79ee8892f');
                    const data = await resp.json();
                    const users = data.users || [];
                    if (!users.length) {
                        modalBody.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px">没有符合条件的成员</div>' +
                            '<div class="form-group"><label>手动输入 rowid</label><input id="member-sid-input" placeholder="粘贴用户 rowid"></div>';
                        modalFooter.innerHTML = '<button class="btn" onclick="UI.hideModal()">关闭</button><button class="btn btn-primary" id="member-add-manual">添加</button>';
                        document.getElementById('member-add-manual').onclick = async () => {
                            const sid = (document.getElementById('member-sid-input').value || '').trim();
                            if (!sid) return;
                            UI.hideModal();
                            await updateMembers(rec, [...members, { sid, name: sid.slice(0,8), avatar: null }]);
                        };
                        return;
                    }
                    // 成员列表（头像+昵称，点击选中）
                    const listHtml = users.map(u => {
                        const av = u.avatar
                            ? `<img src="${u.avatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover">`
                            : `<span style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:var(--accent-primary);color:#fff;font-size:13px;font-weight:600">${escapeHtml((u.nickname||'?').slice(0,1))}</span>`;
                        const already = members.find(m => m.sid === u.rowid);
                        return `
                            <div class="user-pick-item ${already ? 'already' : ''}" data-sid="${u.rowid}" data-name="${escapeHtml(u.nickname)}" data-avatar="${u.avatar || ''}">
                                ${av}
                                <span style="flex:1;font-size:13px;margin-left:8px">${escapeHtml(u.nickname)}</span>
                                ${already ? '<span style="font-size:11px;color:var(--text-muted)">已添加</span>' : '<span style="font-size:16px;color:var(--accent-primary)">＋</span>'}
                            </div>
                        `;
                    }).join('');
                    modalBody.innerHTML = `
                        <div style="margin-bottom:8px;font-size:12px;color:var(--text-muted)">点击成员添加到参与列表（共 ${users.length} 人）</div>
                        <div style="max-height:350px;overflow-y:auto">${listHtml}</div>
                        <div style="margin-top:10px;font-size:12px;color:var(--text-muted)">── 或手动输入 rowid ──</div>
                        <div class="form-group" style="margin-top:6px">
                            <input id="member-sid-input" placeholder="粘贴用户 rowid（可选）">
                        </div>
                    `;
                    modalFooter.innerHTML = '<button class="btn" onclick="UI.hideModal()">关闭</button>';
                    // 点击成员 -> 添加
                    modalBody.querySelectorAll('.user-pick-item:not(.already)').forEach(item => {
                        item.onclick = async () => {
                            const sid = item.dataset.sid;
                            const name = item.dataset.name;
                            const avatar = item.dataset.avatar || null;
                            UI.hideModal();
                            await updateMembers(rec, [...members, { sid, name, avatar }]);
                        };
                    });
                } catch (e) {
                    modalBody.innerHTML = '<div style="text-align:center;color:var(--accent-red);padding:20px">加载失败：' + e.message + '</div>';
                }
            };
        }
    }

    function renderDetail(mode, rec) {
        const body = document.getElementById('detail-body');
        currentSelectedLeaf = (mode === 'view' || mode === 'edit') ? rec : null;

        if (mode === 'empty') {
            body.innerHTML = '<div class="empty-state">← 点选节点查看详情<br><br>或新建/编辑</div>';
            return;
        }

        if (mode === 'view') {
            // 路径
            const ancestors = Filter.findAncestors(treeData, rec.rowid);
            const pathRowids = [...ancestors, rec.rowid];
            const pathHtml = pathRowids.map(rid => {
                const r = allRecords.find(x => x.rowid === rid);
                if (!r) return rid;
                const icon = Filter.isTarget(r) ? '📌' : '⚡';
                return `<div class="detail-path-line"><span>${icon}</span> <span>${escapeHtml(Filter.getMingcheng(r))}</span></div>`;
            }).join('');

            // 字段（inline 编辑：直接是输入框/下拉框，失焦/改变自动保存，不需要编辑按钮）
            const currentSew = Filter.getSewValue(rec);
            const fieldsHtml = `
                <div class="detail-row">
                    <span class="label">完成</span>
                    <input type="checkbox" data-field="wancheng" ${rec[FIELD_IDS.wancheng] === '1' ? 'checked' : ''} style="width:auto">
                </div>
                <div class="detail-row">
                    <span class="label">类型 (sew)</span>
                    <select data-field="sew">
                        <option value="7目标" ${currentSew==='7目标'?'selected':''}>🎯 7目标</option>
                        <option value="8计划" ${currentSew==='8计划'?'selected':''}>⚡ 8计划</option>
                    </select>
                </div>
                <div class="detail-row">
                    <span class="label">置信度</span>
                    <input type="number" data-field="zhixindu" value="${Filter.getZhixindu(rec) ?? 0}">
                </div>
                <div class="detail-row">
                    <span class="label">权重</span>
                    <input type="number" data-field="quanzhong" value="${Filter.getQuanzhong(rec)}">
                </div>
            `;
            const wznrHtml = `
                <div class="detail-row" style="flex-direction:column;align-items:stretch">
                    <span class="label">描述 (wznr)</span>
                    <textarea data-field="wznr" rows="3">${escapeHtml(Filter.getWznr(rec) || '')}</textarea>
                </div>
            `;

            // 操作栏（无编辑按钮，字段直接改）
            const actions = `
                <div class="detail-actions-bar">
                    <button class="btn btn-danger" data-detail-act="delete">🗑 删除</button>
                </div>
            `;

            body.innerHTML = `
                <div class="detail-section">
                    <h3>所属路径</h3>
                    ${pathHtml}
                </div>
                <div class="detail-section">
                    <h3>字段</h3>
                    ${fieldsHtml}
                    ${wznrHtml}
                </div>
                <div class="detail-section">
                    <h3>参与成员（ptyh）</h3>
                    <div class="member-list" id="member-list-view">
                        ${renderMembersHtml(getMembers(rec), true)}
                    </div>
                    <div style="margin-top:8px">
                        <button class="btn btn-small member-add">＋ 添加成员</button>
                    </div>
                </div>
                <div class="detail-section">
                    <h3>操作</h3>
                    ${actions}
                </div>
            `;

            // 绑定操作按钮
            body.querySelectorAll('[data-detail-act]').forEach(btn => {
                btn.onclick = () => {
                    const act = btn.dataset.detailAct;
                    if (act === 'delete') confirmDelete(rec, null);
                };
            });

            // 绑定 inline 字段自动保存（失焦或值变化 -> debounce 写 HAP -> 乐观更新内存 -> 不刷新）
            let saveTimer = null;
            function scheduleSave() {
                clearTimeout(saveTimer);
                saveTimer = setTimeout(() => saveInlineFields(body, rec), 400);
            }
            body.querySelectorAll('[data-field]').forEach(el => {
                if (el.tagName === 'SELECT' || el.type === 'checkbox') el.onchange = scheduleSave;
                else el.onblur = scheduleSave;
            });

            // 绑定成员交互
            bindMemberEvents(body, rec, getMembers(rec));

            // 看板选中时由 onCardClick 驱动父链高亮；此处（树节点/编辑后 view）不高亮
            return;
        }

        if (mode === 'edit') {
            renderInlineForm(body, rec, async (formData) => {
                UI.showLoading('保存中…');
                try {
                    const controls = [
                        { controlId: FIELD_IDS.mingcheng, value: formData.mingcheng },
                        { controlId: FIELD_IDS.wznr, value: formData.wznr || '' },
                        { controlId: FIELD_IDS.zhixindu, value: String(formData.zhixindu || 0), valueType: 0 },
                        { controlId: FIELD_IDS.quanzhong, value: String(formData.quanzhong || 0), valueType: 0 }
                    ];
                    const resp = await API.updateRecord(rec.rowid, controls);
                    if (!resp.success) throw new Error(JSON.stringify(resp));
                    Sync.pushLocal({ type: 'mod', rec, controls, op: 'edit' });
                    UI.toast('✓ 保存成功', 'success');
                    await reload();
                    // 重新选回新 rec（reload 后 rec 已变）
                    const updated = allRecords.find(r => r.rowid === rec.rowid);
                    if (updated) renderDetail('view', updated);
                } catch (e) {
                    UI.toast('保存失败：' + e.message, 'error', 4000);
                    console.error('editForm err:', e);
                } finally {
                    UI.hideLoading();
                }
            }, () => renderDetail('view', rec));
            return;
        }

        if (mode === 'add-target') {
            renderInlineForm(body, {
                mingcheng: '',
                wznr: '',
                zhixindu: '5000',
                quanzhong: '0'
            }, async (formData) => {
                UI.showLoading('保存中…');
                try {
                    const controls = [
                        { controlId: FIELD_IDS.mingcheng, value: formData.mingcheng },
                        { controlId: FIELD_IDS.wznr, value: formData.wznr || '' },
                        { controlId: FIELD_IDS.sew, value: SEW_KEYS.target, valueType: 2 },
                        { controlId: FIELD_IDS.leixing, value: '55c1d467-927b-4af8-98a9-d934554ac3bf', valueType: 2 },
                        { controlId: FIELD_IDS.fabuzhe, value: 'a8515e76-7b02-4baf-bedd-3ff011b1a9e5', valueType: 2 },
                        { controlId: FIELD_IDS.fuyuan, value: window.ACTIVE_TIAN_ROOT || ROOT_FUYUAN, valueType: 2 },
                        { controlId: FIELD_IDS.fbsj, value: nowStr() },
                        { controlId: FIELD_IDS.zhixindu, value: formData.zhixindu || '5000', valueType: 0 },
                        { controlId: FIELD_IDS.quanzhong, value: formData.quanzhong || '0', valueType: 0 }
                    ];
                    const resp = await API.addRecord(controls);
                    if (!resp.success) throw new Error(JSON.stringify(resp));
                    Sync.pushLocal({ type: 'add', newRowid: resp.data, controls, op: 'addTarget' });
                    UI.toast('目标创建成功', 'success');
                    await reload();
                    const newRec = allRecords.find(r => r.rowid === resp.data);
                    if (newRec) renderDetail('view', newRec);
                    else renderDetail('empty');
                } catch (e) {
                    UI.toast('创建失败：' + e.message, 'error', 4000);
                } finally {
                    UI.hideLoading();
                }
            }, () => renderDetail('empty'), '新建目标（7目标）');
            return;
        }

        if (mode === 'add-plan') {
            // ⭐ 2026-08-20 修复：parentRec 已明确（点➕按钮传来）-> 直接用 parentRec.rowid 作 fu
            // 不需要再收集所有 7目标（避免误报"请先创建至少一个目标"）
            const parentRec = rec; // mode=add-plan 时 rec 就是 parentRec
            const hasParent = parentRec && parentRec.rowid;

            let fuOptions = [];
            let defaultFu;
            let title;
            if (hasParent) {
                // 树➕按钮：直接在 parentRec 下加子
                defaultFu = parentRec.rowid;
                title = `在 "${Filter.getMingcheng(parentRec)}" 下新建计划`;
                // 下拉选项只保留 parent（明确知道父是谁）
                fuOptions = [{ value: parentRec.rowid, label: Filter.getMingcheng(parentRec) }];
            } else {
                // 顶部「+ 添加计划」按钮（无指定父）-> 从所有 7目标里选
                const tianRoot = window.ACTIVE_TIAN_ROOT;
                const targets = allRecords.filter(r =>
                    !Filter.isDeleted(r) && Filter.isTarget(r) && (!tianRoot || Filter.getFuyuanSid(r) === tianRoot)
                );
                if (targets.length === 0) {
                    UI.toast('请先创建至少一个目标（当前天根下）', 'warn');
                    return;
                }
                fuOptions = targets.map(t => ({ value: t.rowid, label: Filter.getMingcheng(t) }));
                defaultFu = fuOptions[0]?.value || '';
                title = '新建计划（8计划）';
            }
            renderInlineForm(body, {
                mingcheng: '',
                wznr: '',
                zhixindu: '5000',
                quanzhong: '0',
                fu: defaultFu
            }, async (formData) => {
                UI.showLoading('保存中…');
                try {
                    const controls = [
                        { controlId: FIELD_IDS.mingcheng, value: formData.mingcheng },
                        { controlId: FIELD_IDS.wznr, value: formData.wznr || '' },
                        { controlId: FIELD_IDS.sew, value: SEW_KEYS.plan, valueType: 2 },
                        { controlId: FIELD_IDS.leixing, value: '55c1d467-927b-4af8-98a9-d934554ac3bf', valueType: 2 },
                        { controlId: FIELD_IDS.fu, value: formData.fu, valueType: 2 },
                        { controlId: FIELD_IDS.fuyuan, value: window.ACTIVE_TIAN_ROOT || ROOT_FUYUAN, valueType: 2 },
                        { controlId: FIELD_IDS.fabuzhe, value: 'a8515e76-7b02-4baf-bedd-3ff011b1a9e5', valueType: 2 },
                        { controlId: FIELD_IDS.fbsj, value: nowStr() },
                        { controlId: FIELD_IDS.zhixindu, value: formData.zhixindu || '5000', valueType: 0 },
                        { controlId: FIELD_IDS.quanzhong, value: formData.quanzhong || '0', valueType: 0 }
                    ];
                    const resp = await API.addRecord(controls);
                    if (!resp.success) throw new Error(JSON.stringify(resp));
                    Sync.pushLocal({ type: 'add', newRowid: resp.data, controls, op: 'addPlan', parentFu: formData.fu });
                    UI.toast('计划创建成功', 'success');
                    await reload();
                    const newRec = allRecords.find(r => r.rowid === resp.data);
                    if (newRec) renderDetail('view', newRec);
                    else renderDetail('empty');
                } catch (e) {
                    UI.toast('创建失败：' + e.message, 'error', 4000);
                } finally {
                    UI.hideLoading();
                }
            }, () => renderDetail('empty'), title, fuOptions, defaultFu);
            return;
        }
    }

    /**
     * 在右侧 panel 渲染内联编辑表单
     */
    function renderInlineForm(body, rec, onSave, onCancel, title, fuOptions, defaultFu) {
        const zhixindu = rec.zhixindu ?? rec[FIELD_IDS.zhixindu] ?? '';
        const quanzhong = rec.quanzhong ?? rec[FIELD_IDS.quanzhong] ?? '';

        const fuSelectHtml = fuOptions && fuOptions.length > 0 ? `
            <div class="detail-row" style="flex-direction:column;align-items:stretch">
                <span class="label">所属目标 (fu) <span style="color:var(--accent-red)">*</span></span>
                <select data-f="fu">
                    ${fuOptions.map(o => `<option value="${o.value}" ${(o.value === (defaultFu || rec.fu)) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
                </select>
            </div>
        ` : '';

        body.innerHTML = `
            <div class="detail-section">
                <h3>${escapeHtml(title || (rec.rowid ? '编辑' : '新建'))}</h3>
                <div class="detail-row" style="flex-direction:column;align-items:stretch">
                    <span class="label">标题 (mingcheng) <span style="color:var(--accent-red)">*</span></span>
                    <input data-f="mingcheng" value="${escapeHtml(rec.mingcheng || '')}" autofocus>
                </div>
                <div class="detail-row" style="flex-direction:column;align-items:stretch">
                    <span class="label">描述 (wznr)</span>
                    <textarea data-f="wznr" rows="3">${escapeHtml(rec.wznr || '')}</textarea>
                </div>
                ${fuSelectHtml}
                <div class="detail-row" style="flex-direction:column;align-items:stretch">
                    <span class="label">置信度 (zhixindu, 0-10000)</span>
                    <input data-f="zhixindu" type="number" min="0" max="10000" value="${zhixindu}">
                    <div class="form-hint">8000-10000 紧急+重要 | 6000-7999 重要不紧急 | 4000-5999 紧急不重要 | 2000-3999 不紧急不重要 | &lt;2000 待思考</div>
                </div>
                <div class="detail-row" style="flex-direction:column;align-items:stretch">
                    <span class="label">权重 (quanzhong)</span>
                    <input data-f="quanzhong" type="number" value="${quanzhong}">
                </div>
                <div class="detail-actions-bar">
                    <button class="btn btn-primary" data-form-act="save">${rec.rowid ? '💾 保存' : '✓ 创建'}</button>
                    <button class="btn" data-form-act="cancel">取消</button>
                </div>
            </div>
        `;

        body.querySelector('[data-form-act="save"]').onclick = async () => {
            const get = (name) => (body.querySelector(`[data-f="${name}"]`) || {}).value || '';
            const formData = {
                mingcheng: get('mingcheng').trim(),
                wznr: get('wznr').trim(),
                zhixindu: get('zhixindu'),
                quanzhong: get('quanzhong'),
                fu: get('fu')
            };
            if (!formData.mingcheng) {
                UI.toast('标题必填', 'warn');
                return;
            }
            // 目标改名校验
            if (rec.rowid && Filter.isTarget(allRecords.find(r => r.rowid === rec.rowid))) {
                const ok = await UI.confirm({
                    title: '编辑目标',
                    message: '<p style="color:var(--accent-orange)">这是深思熟虑后的目标，改名会影响子计划的归属。确认?</p>',
                    confirmText: '确认编辑',
                    cancelText: '取消'
                });
                if (!ok) return;
            }
            await onSave(formData);
        };
        body.querySelector('[data-form-act="cancel"]').onclick = onCancel || (() => renderDetail('empty'));
    }

    /**
     * inline 字段自动保存：读取 body 里所有 [data-field] 的值
     * 与内存 rec 比较 -> 只把变化了的字段写 HAP + 乐观更新内存
     * 不调 reload（保持 UI 不闪、焦点不丢）
     */
    async function saveInlineFields(body, rec) {
        const updates = [];
        const get = (name) => (body.querySelector(`[data-field="${name}"]`) || {}).value;
        const controls = [];

        // wancheng（完成 checkbox）：勾选 = "1"，取消 = "0"
        const wanchengEl = body.querySelector('[data-field="wancheng"]');
        if (wanchengEl) {
            const newWancheng = wanchengEl.checked ? '1' : '0';
            if (newWancheng !== (rec[FIELD_IDS.wancheng] || '0')) {
                controls.push({ controlId: FIELD_IDS.wancheng, value: newWancheng, valueType: 0 });
                rec[FIELD_IDS.wancheng] = newWancheng;
            }
        }
        // sew（类型）：7目标/8计划 切换
        const newSew = get('sew');
        if (newSew && newSew !== Filter.getSewValue(rec)) {
            controls.push({ controlId: FIELD_IDS.sew, value: newSew === '7目标' ? SEW_KEYS.target : SEW_KEYS.plan, valueType: 2 });
            rec[FIELD_IDS.sew] = [{ sid: newSew === '7目标' ? SEW_KEYS.target : SEW_KEYS.plan, name: newSew }];
        }
        // zhixindu（置信度）
        const newZxd = get('zhixindu');
        if (newZxd !== undefined && String(newZxd) !== String(Filter.getZhixindu(rec) ?? '')) {
            controls.push({ controlId: FIELD_IDS.zhixindu, value: String(newZxd || 0), valueType: 0 });
            rec[FIELD_IDS.zhixindu] = String(newZxd || 0);
        }
        // quanzhong（权重）
        const newQz = get('quanzhong');
        if (newQz !== undefined && String(newQz) !== String(Filter.getQuanzhong(rec))) {
            controls.push({ controlId: FIELD_IDS.quanzhong, value: String(newQz || 0), valueType: 0 });
            rec[FIELD_IDS.quanzhong] = String(newQz || 0);
        }
        // wznr（描述）
        const newWznr = get('wznr');
        if (newWznr !== undefined && newWznr !== (Filter.getWznr(rec) || '')) {
            controls.push({ controlId: FIELD_IDS.wznr, value: newWznr });
            rec[FIELD_IDS.wznr] = newWznr;
        }

        if (!controls.length) return; // 没变化

        try {
            const resp = await API.updateRecord(rec.rowid, controls);
            if (!resp.success) throw new Error(JSON.stringify(resp));
            Sync.pushLocal({ type: 'mod', rowid: rec.rowid, controls, op: 'inlineSave' });
            UI.setStatus('✓ 已自动保存', 1000);
            console.log('[saveInlineFields] saved:', controls.map(c => c.controlId).join(','));
            // sew 变了 -> 刷新树/看板显示（类型可能变了）；wancheng 变了 -> 刷新树划线
            if (controls.some(c => c.controlId === FIELD_IDS.sew || c.controlId === FIELD_IDS.wancheng)) {
                const underTian = Filter.filterUnderTian(allRecords);
                treeData = Filter.buildTree(underTian);
                leaves = Filter.collectLeaves(treeData);
                Tree.setTree(treeData);
                Tree.renderTree(treeData);
                Kanban.renderKanban(leaves);
            }
        } catch (e) {
            UI.toast('自动保存失败：' + e.message, 'error', 3000);
        }
    }

    // 兼容旧名（Kanban/Tree 还在调 showLeafDetail / showEditDialog）
    function showLeafDetail(leaf) { renderDetail('view', leaf); }
    function showEditDialog(rec) { renderDetail('edit', rec); }
    function showAddTargetDialog() { renderDetail('add-target'); }
    function showAddPlanDialog() { renderDetail('add-plan'); }

    // 详情编辑完成 → 切回 view
    function editForm(rec) { renderDetail('edit', rec); }

    /** 升级计划 → 目标 */

    /** 删除确认 */
    async function confirmDelete(rec, node) {
        // 中间节点（zi>0）拒绝
        const zi = Filter.getZi(rec);
        if (zi > 0) {
            UI.confirm({
                title: '无法删除中间节点',
                message: `「${Filter.getMingcheng(rec)}」有 ${zi} 个子节点，请先迁移子节点到其他父下。`,
                confirmText: '知道了',
                cancelText: '关闭'
            });
            return;
        }
        const ok = await UI.confirm({
            title: '删除',
            message: `确认删除「${Filter.getMingcheng(rec)}」？这是逻辑删（shanchu=1），可恢复。`,
            confirmText: '确认删除',
            danger: true
        });
        if (!ok) return;
        UI.showLoading('删除中…');
        try {
            const resp = await API.deleteRecord(rec.rowid);
            if (!resp.success) throw new Error(JSON.stringify(resp));
            Sync.pushLocal({ type: 'del', rowid: rec.rowid, rec, op: 'delete' });
            UI.toast('已删除', 'success');
            renderDetail('empty');

            // ⭐ 乐观更新：从 allRecords 移除 + 重建树/看板（不等 12 秒 reload）
            allRecords = allRecords.filter(r => r.rowid !== rec.rowid);
            const underTian = Filter.filterUnderTian(allRecords);
            treeData = Filter.buildTree(underTian);
            leaves = Filter.collectLeaves(treeData);
            Tree.setTree(treeData);
            Tree.renderTree(treeData);
            Kanban.renderKanban(leaves);
            updateTitles(underTian, leaves);
            console.log('[App.confirmDelete] optimistic update: node removed immediately');

            // 后台兜底 reload（仅后台异步跑，不阻塞 UI）
            reload().catch(e => console.warn('[App.confirmDelete] background reload failed:', e.message));
        } catch (e) {
            UI.toast('删除失败：' + e.message, 'error');
        } finally {
            UI.hideLoading();
        }
    }

    function nowStr() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }

    /** 单条 patch（拖动/编辑后即时更新，不重拉全表）
     * @param {string} rowid
     * @param {object} patch - { mingcheng?, wznr?, zhixindu?, quanzhong?, sew? }
     */
    function patchRecord(rowid, patch, changeType = 'mod') {
        const idx = allRecords.findIndex(r => r.rowid === rowid);
        if (idx === -1) return false;
        const oldRec = allRecords[idx];
        const changes = [];
        for (const [k, v] of Object.entries(patch)) {
            const cid = FIELD_IDS[k];
            if (cid && oldRec[cid] !== undefined) {
                const oldVal = k === 'mingcheng' ? Filter.getMingcheng(oldRec) :
                               k === 'zhixindu' ? Filter.getZhixindu(oldRec) :
                               k === 'quanzhong' ? Filter.getQuanzhong(oldRec) : oldRec[cid];
                if (String(oldVal) !== String(v)) {
                    changes.push({ field: k, from: oldVal, to: v });
                    allRecords[idx][cid] = v;
                }
            }
        }
        if (changes.length > 0) {
            Sync.pushLocal({ type: changeType, rec: allRecords[idx], changes });
        }
        // 重新计算 leaves 和 tree（局部更新）
        const underTian = Filter.filterUnderTian(allRecords);
        treeData = Filter.buildTree(underTian);
        leaves = Filter.collectLeaves(treeData);
        Tree.setTree(treeData);
        Tree.renderTree(treeData);
        Kanban.renderKanban(leaves);
        return true;
    }

    return { init, reload, setDiff, clearDiff, patchRecord, getAllRecords: () => allRecords };
})();

// DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.App.init);
} else {
    window.App.init();
}