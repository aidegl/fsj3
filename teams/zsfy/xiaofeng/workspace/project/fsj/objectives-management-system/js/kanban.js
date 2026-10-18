/**
 * 5 区域看板（真叶子 + quanzhong 权重 5 档映射，2026-08-18 东城改：统一用权重）
 * 入口：renderKanban(leaves)
 */
window.Kanban = (function() {
    const container = document.getElementById('kanban-container');
    const zoneBodies = {}; // {1: div, 2: div, ...}

    // 回调
    let onCardClick = () => {};
    let onCardEdit = () => {};
    let onCardPromote = () => {};
    let onCardDelete = () => {};

    function setCallbacks(cb) {
        onCardClick = cb.onCardClick || (() => {});
        onCardEdit = cb.onCardEdit || (() => {});
        onCardPromote = cb.onCardPromote || (() => {});
        onCardDelete = cb.onCardDelete || (() => {});
    }

    /**
     * 渲染看板
     * @param {Array} leaves - 真叶子数组
     * @param {Array} leaves - 真叶子
     */
    function renderKanban(leaves) {
        // 清空 5 个区域
        for (let z = 1; z <= 5; z++) {
            if (!zoneBodies[z]) {
                zoneBodies[z] = container.querySelector(`[data-zone-body="${z}"]`);
            }
            zoneBodies[z].innerHTML = '';
        }

        // 按 zone 分组
        const byZone = { 1: [], 2: [], 3: [], 4: [], 5: [] };
        for (const leaf of leaves) {
            const qz = Filter.getQuanzhong(leaf);
            const zone = zoneForQuanzhong(qz);
            byZone[zone].push(leaf);
        }

        // 每个 zone 内按 quanzhong 倒序（值大在前）
        for (const z of [1, 2, 3, 4, 5]) {
            byZone[z].sort((a, b) => Filter.getQuanzhong(b) - Filter.getQuanzhong(a));
            for (const leaf of byZone[z]) {
                zoneBodies[z].appendChild(renderCard(leaf));
            }
            // 更新 zone 标题的计数
            const title = container.querySelector(`[data-zone="${z}"] .zone-count`);
            if (title) title.textContent = byZone[z].length;
        }

        // 设置拖放接收
        setupDropZones();
    }

    function renderCard(leaf) {
        const card = document.createElement('div');
        const qz = Filter.getQuanzhong(leaf);
        const zone = zoneForQuanzhong(qz);
        let diffClass = '';
        const diff = window.__currentDiff;
        if (diff) {
            for (const item of diff.modItems) {
                if (item.rec && item.rec.rowid === leaf.rowid) { diffClass = ' is-modified'; break; }
            }
            if (!diffClass) {
                for (const item of diff.newItems) {
                    if (item.json && item.json.rowid === leaf.rowid) { diffClass = ' is-new'; break; }
                }
            }
        }
        card.className = `kanban-card zone-${zone}${diffClass}`;
        card.dataset.rowid = leaf.rowid;
        card.draggable = true;

        // 变灰判断：叶子的 fu（直接父）是否在树的勾选集合里
                // leaf 的 fu 不在 checked → 灰（父未勾选或未显示）
        const leafFuSid = Filter.getFuSid(leaf);


        const mc = Filter.getMingcheng(leaf);
        const zxd = Filter.getZhixindu(leaf);

        card.innerHTML = `
            <div class="kanban-card-header">
                <span class="kanban-card-name${leaf[window.FIELD_IDS.wancheng] === '1' ? ' done' : ''}" title="${escapeHtml(mc)}">${escapeHtml(mc)}</span>
                <span class="kanban-card-actions">
                    <button class="kanban-card-action" data-act="edit" title="编辑">✏️</button>
                    <button class="kanban-card-action" data-act="promote" title="升级为目标">⬆</button>
                    <button class="kanban-card-action" data-act="del" title="删除">🗑</button>
                </span>
            </div>
            <div class="kanban-card-meta">
                <span>权重: ${qz == null ? '未设' : qz}</span>
                <span>置信度: ${zxd == null ? '未设' : zxd}</span>
            </div>
        `;

        // 点击卡片（非按钮）→ 选中 + 显示详情 + 高亮树上路径
        card.onclick = (e) => {
            if (e.target.closest('[data-act]')) return;
            document.querySelectorAll('.kanban-card.highlight').forEach(c => c.classList.remove('highlight'));
            card.classList.add('highlight');
            onCardClick(leaf);
        };

        // 操作按钮
        card.querySelectorAll('[data-act]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const act = btn.dataset.act;
                if (act === 'edit') onCardEdit(leaf);
                if (act === 'promote') onCardPromote(leaf);
                if (act === 'del') onCardDelete(leaf);
            };
        });

        // 拖拽开始
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', leaf.rowid);
            e.dataTransfer.effectAllowed = 'move';
            card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            // 清掉所有插入指示线
            document.querySelectorAll('.kanban-card.drop-before, .kanban-card.drop-after').forEach(c => {
                c.classList.remove('drop-before', 'drop-after');
            });
        });

        // 区域内排序：卡片自身也是 drop 目标（上半=插之前，下半=插之后）
        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            e.stopPropagation(); // 阻止冒泡到 zone-body 的 dragover
            const rect = card.getBoundingClientRect();
            const isTop = e.clientY < rect.top + rect.height / 2;
            // 清掉兄弟节点的指示线，只给自己加
            document.querySelectorAll('.kanban-card.drop-before, .kanban-card.drop-after').forEach(c => {
                if (c !== card) c.classList.remove('drop-before', 'drop-after');
            });
            card.classList.toggle('drop-before', isTop);
            card.classList.toggle('drop-after', !isTop);
        });
        card.addEventListener('dragleave', () => {
            card.classList.remove('drop-before', 'drop-after');
        });
        card.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            card.classList.remove('drop-before', 'drop-after');
            const rowid = e.dataTransfer.getData('text/plain');
            if (!rowid || rowid === leaf.rowid) return; // 拖到自己上面无操作
            const rect = card.getBoundingClientRect();
            const isTop = e.clientY < rect.top + rect.height / 2;
            // 插入位置：isTop ? 插到 leaf.rowid 前 : 插到 leaf.rowid 后
            handleDropAt(rowid, currentZoneOf(card), isTop ? leaf.rowid : nextSiblingRowid(card));
        });

        return card;
    }

    /** 卡片当前所在区域 */
    function currentZoneOf(card) {
        for (let z = 1; z <= 5; z++) {
            if (zoneBodies[z] && zoneBodies[z].contains(card)) return z;
        }
        return 5;
    }

    /** 卡片下一个兄弟的 rowid（无则 null = 追加到末尾）*/
    function nextSiblingRowid(card) {
        const next = card.nextElementSibling;
        return next ? next.dataset.rowid : null;
    }

    /**
     * 处理拖放（带插入位置）：
     *   跨区域 or 区域内排序统一入口
     * @param {string} rowid 被拖的卡片
     * @param {number} zone 目标区域
     * @param {string|null} beforeRowid 插到该 rowid 之前；null = 追加到末尾
     */
    async function handleDropAt(rowid, zone, beforeRowid) {
        const card = document.querySelector(`.kanban-card[data-rowid="${rowid}"]`);
        if (!card) return;
        const targetBody = zoneBodies[zone];
        if (!targetBody) return;

        // DOM 移动（乐观更新）
        if (beforeRowid) {
            const beforeCard = targetBody.querySelector(`.kanban-card[data-rowid="${beforeRowid}"]`);
            if (beforeCard && beforeCard !== card) {
                targetBody.insertBefore(card, beforeCard);
            } else if (beforeCard !== card) {
                targetBody.appendChild(card);
            }
        } else {
            targetBody.appendChild(card);
        }
        // 更新卡片的 zone class
        for (let z = 1; z <= 5; z++) card.classList.remove(`zone-${z}`);
        card.classList.add(`zone-${zone}`);

        // 整区域重算权重（位置决定权重）+ 批量写
        await recalcZoneWeights(zone);
        updateZoneCounts();
    }

    /**
     * 重算整个区域的权重（位置决定权重）并批量写 HAP
     * 公式：权重 = 区域基数 + round(1999 × (n-1-i)/(n-1))
     *   基数：Q1=8000, Q2=6000, Q3=4000, Q4=2000, Q5=0
     */
    async function recalcZoneWeights(zone) {
        const body = zoneBodies[zone];
        if (!body) return;
        const cards = [...body.children].filter(c => c.classList.contains('kanban-card'));
        const n = cards.length;
        const base = { 1: 8000, 2: 6000, 3: 4000, 4: 2000, 5: 0 }[zone];
        const t0 = Date.now();
        const updates = [];

        cards.forEach((card, i) => {
            const pos = n <= 1 ? 1999 : Math.round(1999 * (n - 1 - i) / (n - 1));
            const newQz = base + pos;
            const rowid = card.dataset.rowid;
            // 更新 DOM meta
            const meta = card.querySelector('.kanban-card-meta');
            if (meta) {
                const zxdSpan = meta.children[1];
                meta.innerHTML = `<span>权重: ${newQz}</span>${zxdSpan ? zxdSpan.outerHTML : '<span>置信度: 未设</span>'}`;
            }
            updates.push({ rowid, quanzhong: newQz });
        });

        console.log('[Kanban.recalc] zone=' + zone + ' n=' + n + ' updates:', updates);

        // 批量写 HAP（并发，不阻塞 UI）
        const results = await Promise.all(updates.map(u =>
            API.updateRecord(u.rowid, [
                { controlId: FIELD_IDS.quanzhong, value: String(u.quanzhong), valueType: 0 }
            ]).then(resp => ({ ...u, ok: resp.success })).catch(e => ({ ...u, ok: false, err: e.message }))
        ));

        // 同步内存（不 reload）
        if (window.App && window.App.patchRecord) {
            updates.forEach(u => window.App.patchRecord(u.quanzhong !== undefined ? u.rowid : u.rowid, { quanzhong: u.quanzhong }));
        }

        const okCount = results.filter(r => r.ok).length;
        const failCount = results.length - okCount;
        if (failCount === 0) {
            UI.toast(`✓ 区域${zone} 权重已按位置重算（${okCount} 条，${Date.now() - t0}ms）`, 'success', 1800);
        } else {
            UI.toast(`权重重算完成：成功 ${okCount}，失败 ${failCount}`, 'warn', 3000);
            console.error('[Kanban.recalc] failures:', results.filter(r => !r.ok));
        }
        Sync.pushLocal({ type: 'batch-mod', op: 'recalcWeights', zone, updates });
    }

    function setupDropZones() {
        for (let z = 1; z <= 5; z++) {
            const body = zoneBodies[z];
            if (!body) continue;
            body.ondragover = (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                body.classList.add('drag-over');
            };
            body.ondragleave = () => body.classList.remove('drag-over');
            body.ondrop = (e) => {
                e.preventDefault();
                body.classList.remove('drag-over');
                const rowid = e.dataTransfer.getData('text/plain');
                if (rowid) handleDropAt(rowid, z, null); // drop 到空白 = 追加到末尾
            };
        }
    }



    function updateZoneCounts() {
        for (let z = 1; z <= 5; z++) {
            const body = document.querySelector(`[data-zone-body="${z}"]`);
            const title = document.querySelector(`[data-zone="${z}"] .zone-count`);
            if (body && title) title.textContent = body.children.length;
        }
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }

    /** quanzhong 权重落入新区域的中位数 */
    function quanzhongForZone(zone) {
        const map = { 1: 9000, 2: 7000, 3: 5000, 4: 3000, 5: 1000 };
        return map[zone];
    }

    /** 根据 quanzhong 权重找区域（统一用权重，东城 2026-08-18 改） */
    function zoneForQuanzhong(qz) {
        if (qz == null || qz === 0) return 5;
        const n = Number(qz);
        if (n >= 8000) return 1;
        if (n >= 6000) return 2;
        if (n >= 4000) return 3;
        if (n >= 2000) return 4;
        return 5;
    }

    return {
        renderKanban,
        setCallbacks
    };
})();