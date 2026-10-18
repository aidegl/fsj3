/**
 * 五事系统 · UI 工具（toast/loading/confirm/escapeHtml）
 */
export function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function showLoading(text) {
    const el = document.getElementById('loading');
    document.getElementById('loadingText').textContent = text || '加载中…';
    el.style.display = 'flex';
}

export function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

export function toast(msg, type = 'info', duration = 2500) {
    const box = document.getElementById('toast-box');
    const div = document.createElement('div');
    div.className = 'toast ' + type;
    div.textContent = msg;
    box.appendChild(div);
    setTimeout(() => { div.classList.add('out'); setTimeout(() => div.remove(), 300); }, duration);
}

export function setStatus(text, duration = 2000) {
    toast(text, 'info', duration);
}

/** Promise 化确认框 */
export function confirm(text) {
    return new Promise((resolve) => {
        const mask = document.getElementById('confirm-mask');
        document.getElementById('confirmText').textContent = text;
        mask.style.display = 'flex';
        const done = (v) => { mask.style.display = 'none'; cleanup(); resolve(v); };
        const ok = () => done(true);
        const cancel = () => done(false);
        const onMask = (e) => { if (e.target === mask) cancel(); };
        const onEsc = (e) => { if (e.key === 'Escape') cancel(); };
        function cleanup() {
            document.getElementById('confirmOk').removeEventListener('click', ok);
            document.getElementById('confirmCancel').removeEventListener('click', cancel);
            mask.removeEventListener('click', onMask);
            document.removeEventListener('keydown', onEsc);
        }
        document.getElementById('confirmOk').addEventListener('click', ok);
        document.getElementById('confirmCancel').addEventListener('click', cancel);
        mask.addEventListener('click', onMask);
        document.addEventListener('keydown', onEsc);
    });
}
