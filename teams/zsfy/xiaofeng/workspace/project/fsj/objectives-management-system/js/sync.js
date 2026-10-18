/**
 * sync.js — 同步（HAP ↔ 本地缓存）
 *
 * 数据流：
  *   1. 启动时拉一次全量 → 本地缓存 = HAP
  *   2. 用户编辑/拖动 → 改本地缓存 + 同步到 HAP
  *   3. 用户点"同步"按钮 → 拉 HAP 最新 → 与本地 diff → 显示差异 → 确认 → 应用
  *   4. 每次变化（HAP 端 or 本地端）→ console.log 变更日志
 *
 * 简化：去掉"导出 JSON / 导入 JSON"概念，只保留"同步"。
 */

window.Sync = (function() {

    /** 应用本地 → HAP 变更（拖动/编辑/新增/删除） */
    async function pushLocal(localChange) {
        // localChange: { type: 'add'|'mod'|'del', rec, controls? }
        const log = {
            ts: new Date().toISOString(),
            type: localChange.type,
            rowid: localChange.rec?.rowid || localChange.newRowid,
            mingcheng: localChange.rec ? Filter.getMingcheng(localChange.rec) : localChange.json?.mingcheng
        };
        console.log('[Sync.push]', log, localChange);
        return log;
    }

    /** 应用 HAP → 本地 变更（拉取新数据后） */
    function applyRemote(rec) {
        if (!rec || !rec.rowid) return;
        const idx = allRecords.findIndex(r => r.rowid === rec.rowid);
        const log = {
            ts: new Date().toISOString(),
            type: idx === -1 ? 'remote-add' : 'remote-mod',
            rowid: rec.rowid,
            mingcheng: Filter.getMingcheng(rec)
        };
        if (idx === -1) {
            allRecords.push(rec);
            console.log('[Sync.remote-add]', log, rec);
        } else {
            allRecords[idx] = rec;
            console.log('[Sync.remote-mod]', log, rec);
        }
        return log;
    }

    /** 应用 HAP → 本地 删除 */
    function applyRemoteDelete(rowid) {
        const idx = allRecords.findIndex(r => r.rowid === rowid);
        const log = { ts: new Date().toISOString(), type: 'remote-del', rowid };
        if (idx !== -1) {
            const removed = allRecords.splice(idx, 1)[0];
            console.log('[Sync.remote-del]', log, removed);
        } else {
            console.log('[Sync.remote-del] (not in cache)', log);
        }
        return log;
    }

    /**
     * diff: 本地缓存 vs HAP 服务端返回
     * 返回 { newItems, modItems, delItems, sameItems }
     */
    function diff(localRecords, remoteRecords) {
        const localById = new Map();
        localRecords.forEach(r => localById.set(r.rowid, r));

        const remoteById = new Map();
        remoteRecords.forEach(r => remoteById.set(r.rowid, r));

        const result = { newItems: [], modItems: [], delItems: [], sameItems: [] };

        // 遍历 remote：找新增 + 修改
        for (const [rowid, remote] of remoteById) {
            const local = localById.get(rowid);
            if (!local) {
                result.newItems.push({ remote, local: null });
            } else if (isDifferent(local, remote)) {
                result.modItems.push({ remote, local });
            } else {
                result.sameItems.push({ remote, local });
            }
        }

        // local 有但 remote 没有 = 删除
        for (const [rowid, local] of localById) {
            if (!remoteById.has(rowid) && Filter.getFuyuanSid(local) === ROOT_FUYUAN && Filter.isTargetOrPlan(local)) {
                result.delItems.push({ remote: null, local });
            }
        }

        // 日志
        console.log('[Sync.diff]', {
            ts: new Date().toISOString(),
            newCount: result.newItems.length,
            modCount: result.modItems.length,
            delCount: result.delItems.length,
            sameCount: result.sameItems.length
        });

        return result;
    }

    /** 单条记录是否变化 */
    function isDifferent(a, b) {
        const fields = ['mingcheng', 'wznr', 'sew', 'quanzhong', 'zhixindu'];
        for (const f of fields) {
            const va = f === 'sew' ? Filter.getSewValue(a) :
                       f === 'mingcheng' ? Filter.getMingcheng(a) :
                       f === 'wznr' ? Filter.getWznr(a) :
                       f === 'quanzhong' ? Filter.getQuanzhong(a) :
                       Filter.getZhixindu(a);
            const vb = f === 'sew' ? Filter.getSewValue(b) :
                       f === 'mingcheng' ? Filter.getMingcheng(b) :
                       f === 'wznr' ? Filter.getWznr(b) :
                       f === 'quanzhong' ? Filter.getQuanzhong(b) :
                       Filter.getZhixindu(b);
            if (String(va == null ? '' : va) !== String(vb == null ? '' : vb)) return true;
        }
        return false;
    }

    /**
     * 同步：拉 HAP → diff 本地 → 显示 → 用户确认 → 应用
     * @param {Array} localScope 本地已过滤的"显示范围"（如 filterUnderTian 结果）
     * @param {Function} fetchHAP 异步拉 HAP 数据的函数
     * @param {string|null} tianRoot 当前显示的天根（用于过滤 remote 到同范围）
     */
    async function sync(localScope, fetchHAP, tianRoot) {
        const t0 = Date.now();
        const remote = await fetchHAP();
        // 把 remote 也限制到同一天根，避免"显示 vs 全表"的错位 diff
        const remoteScope = tianRoot
            ? remote.filter(r => Filter.getFuyuanSid(r) === tianRoot)
            : remote;
        console.log('[Sync.sync] localScope=' + localScope.length + ' remoteScope=' + remoteScope.length + ' (raw remote=' + remote.length + ')');
        const result = diff(localScope, remoteScope);

        if (result.newItems.length + result.modItems.length + result.delItems.length === 0) {
            UI.toast('✓ 已同步：本地与服务端一致', 'success');
            console.log('[Sync.complete] 无差异');
            return { applied: 0 };
        }

        // 显示 diff 弹窗让用户确认
        return new Promise((resolve) => {
            showDiffDialog(result, () => {
                // 应用：本地接受 remote
                for (const { remote } of result.newItems) applyRemote(remote);
                for (const { remote } of result.modItems) applyRemote(remote);
                for (const { local } of result.delItems) applyRemoteDelete(local.rowid);
                console.log('[Sync.complete]', {
                    applied: result.newItems.length + result.modItems.length + result.delItems.length
                });
                UI.toast(`✓ 同步完成：+${result.newItems.length} ~${result.modItems.length} -${result.delItems.length}`, 'success', 3000);
                resolve({ applied: result.newItems.length + result.modItems.length + result.delItems.length });
            });
        });
    }

    /**
     * 同步预览弹窗
     */
    function showDiffDialog(diffResult, onApply) {
        const { newItems, modItems, delItems, sameItems } = diffResult;
        const summary = `新增 ${newItems.length}，修改 ${modItems.length}，删除 ${delItems.length}，无变化 ${sameItems.length}`;

        const buildList = (items, type) => items.map(({ remote, local }) => {
            const rec = remote || local;
            const mc = Filter.getMingcheng(rec);
            const sew = Filter.getSewValue(rec);
            const fu = Filter.getFuName(rec) || '(顶级)';
            return `<div class="diff-item ${type}">
                <span class="badge ${type}">${type === 'new' ? '新增' : type === 'mod' ? '修改' : '删除'}</span>
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis">${escapeHtml(mc)}</span>
                <span style="font-size:11px;color:var(--text-muted)">${escapeHtml(sew)} · fu=${escapeHtml(fu.slice(0,8))} · ${escapeHtml(rec.rowid.slice(0,8))}</span>
            </div>`;
        }).join('');

        UI.showModal({
            title: `同步预览 — ${summary}`,
            bodyHTML: (newItems.length + modItems.length + delItems.length === 0
                ? '<p style="text-align:center;color:var(--text-muted);padding:20px">本地与服务端一致，无需同步</p>'
                : '<div class="diff-list">' + buildList(newItems, 'new') + buildList(modItems, 'mod') + buildList(delItems, 'del') + '</div>') +
                '<div style="margin-top:12px;font-size:12px;color:var(--text-muted);line-height:1.5">' +
                '<strong>方向：</strong> HAP → 本地（拉取服务端变更覆盖本地）<br>' +
                '<strong>字段对比：</strong>mingcheng / wznr / sew / quanzhong / zhixindu</div>',
            footerButtons: [
                { text: '取消', className: 'btn', onClick: () => UI.hideModal() },
                { text: '应用同步', className: 'btn btn-primary', onClick: () => {
                    UI.hideModal();
                    onApply();
                }}
            ]
        });
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }

    // 需要从外部注入 allRecords
    let allRecords = [];
    function setRecordsRef(arr) { allRecords = arr; }

    return {
        pushLocal,
        applyRemote,
        applyRemoteDelete,
        diff,
        sync,
        setRecordsRef
    };
})();