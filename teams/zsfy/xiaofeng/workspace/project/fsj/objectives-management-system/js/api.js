/**
 * API 客户端 — 封装对 proxy.js 的 fetch 调用
 */
window.API = (function() {
    const BASE = window.API_BASE;

    async function handle(resp) {
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            const msg = data.error || `HTTP ${resp.status}`;
            throw new Error(msg);
        }
        return data;
    }

    return {
        /**
         * 拉全表 shangpin（NDJSON 流式：每页进度回调 onProgress({page,fetched,total})）
         * 返回 { total, count, rows: [...] }
         */
        async fetchAll(onProgress) {
            const resp = await fetch(`${BASE}/api/all-targets`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';
            let result = null;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                let idx;
                while ((idx = buf.indexOf('\n')) >= 0) {
                    const line = buf.slice(0, idx).trim();
                    buf = buf.slice(idx + 1);
                    if (!line) continue;
                    const obj = JSON.parse(line);
                    if (obj.progress && typeof onProgress === 'function') onProgress(obj.progress);
                    if (obj.done) result = { total: obj.total, count: obj.count, rows: obj.rows || [] };
                    if (obj.error) throw new Error(obj.error);
                }
            }
            if (!result) throw new Error('流式响应异常结束（无 done 帧）');
            return result;
        },

        /**
         * 按天根拉数据（v3 服务端过滤，快）
         * @param {string} root 天根 rowid
         */
        async fetchByRoot(root) {
            const resp = await fetch(`${BASE}/api/targets?root=${encodeURIComponent(root)}`);
            return handle(resp);
        },

        /**
         * 新增记录
         * @param {Array<{controlId, value, valueType?}>} controls
         */
        async addRecord(controls) {
            const resp = await fetch(`${BASE}/api/record-add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ controls })
            });
            return handle(resp);
        },

        /**
         * 修改记录
         * @param {string} rowId
         * @param {Array<{controlId, value, valueType?}>} controls
         */
        async updateRecord(rowId, controls) {
            const resp = await fetch(`${BASE}/api/record-update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rowId, controls })
            });
            return handle(resp);
        },

        /**
         * 逻辑删除（shanchu=1）
         */
        async deleteRecord(rowId) {
            const resp = await fetch(`${BASE}/api/record-delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rowId })
            });
            return handle(resp);
        }
    };
})();