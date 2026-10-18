/**
 * 通用 UI 工具 — Modal、Toast、Loading
 */
window.UI = (function() {
    const modalBackdrop = document.getElementById('modal-backdrop');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');
    const modalClose = document.getElementById('modal-close');
    const toastContainer = document.getElementById('toast-container');
    const loading = document.getElementById('loading-indicator');
    const statusText = document.getElementById('status-text');

    modalClose.onclick = () => hideModal();
    modalBackdrop.onclick = (e) => {
        if (e.target === modalBackdrop) hideModal();
    };

    function showLoading(msg) {
        loading.textContent = msg || '加载中…';
        loading.classList.remove('hidden');
    }
    function hideLoading() {
        loading.classList.add('hidden');
    }
    function setStatus(msg, timeout = 3000) {
        statusText.textContent = msg;
        statusText.classList.remove('hidden');
        if (timeout) {
            setTimeout(() => statusText.classList.add('hidden'), timeout);
        }
    }

    /**
     * 弹出 Modal
     * @param {object} opts
     *   - title: string
     *   - bodyHTML: string (HTML 片段)
     *   - footerButtons: [{text, className, onClick}]
     *   - onClose: callback
     */
    function showModal({ title, bodyHTML, footerButtons = [], onClose }) {
        modalTitle.textContent = title || '';
        modalBody.innerHTML = bodyHTML || '';
        modalFooter.innerHTML = '';
        for (const btn of footerButtons) {
            const b = document.createElement('button');
            b.className = btn.className || 'btn';
            b.textContent = btn.text;
            b.onclick = btn.onClick;
            modalFooter.appendChild(b);
        }
        modalBackdrop.classList.remove('hidden');
        modalBackdrop._onClose = onClose;
    }

    function hideModal() {
        modalBackdrop.classList.add('hidden');
        if (typeof modalBackdrop._onClose === 'function') {
            modalBackdrop._onClose();
            modalBackdrop._onClose = null;
        }
    }

    /**
     * 确认弹窗（promise 版）
     * 返回 true/false
     */
    function confirm({ title = '确认', message, confirmText = '确定', cancelText = '取消', danger = false }) {
        return new Promise((resolve) => {
            showModal({
                title,
                bodyHTML: `<p style="line-height:1.6">${message}</p>`,
                footerButtons: [
                    { text: cancelText, className: 'btn', onClick: () => { hideModal(); resolve(false); } },
                    { text: confirmText, className: danger ? 'btn btn-danger' : 'btn btn-primary', onClick: () => { hideModal(); resolve(true); } }
                ]
            });
        });
    }

    /**
     * Toast 提示
     */
    function toast(msg, type = 'success', duration = 2500) {
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.textContent = msg;
        toastContainer.appendChild(t);
        setTimeout(() => {
            t.style.transition = 'opacity 0.2s';
            t.style.opacity = '0';
            setTimeout(() => t.remove(), 200);
        }, duration);
    }

    /**
     * 编辑/新增 记录的表单 modal（带 mingcheng + wznr + 可选字段）
     * @param {object} opts
     *   - title: string
     *   - record: 编辑时为现有记录；新增时为 null
     *   - extraFields: [{name, label, type, value, options?}]
     *   - onSave: (formData) => Promise
     */
    function showForm({ title, record = null, extraFields = [], onSave }) {
        const fields = [
            { name: 'mingcheng', label: '标题', type: 'text', value: record ? getMingcheng(record) : '', required: true },
            { name: 'wznr', label: '描述', type: 'textarea', value: record ? getWznr(record) : '' },
            ...extraFields
        ];

        const bodyHTML = fields.map(f => {
            const v = (f.value || '').toString().replace(/"/g, '&quot;');
            const req = f.required ? 'required' : '';
            if (f.type === 'textarea') {
                return `<div class="form-group">
                    <label>${f.label}${f.required ? ' *' : ''}</label>
                    <textarea name="${f.name}" ${req}>${v}</textarea>
                </div>`;
            }
            if (f.type === 'select') {
                const opts = (f.options || []).map(o =>
                    `<option value="${o.value}" ${String(o.value) === v ? 'selected' : ''}>${o.label}</option>`
                ).join('');
                return `<div class="form-group">
                    <label>${f.label}${f.required ? ' *' : ''}</label>
                    <select name="${f.name}">${opts}</select>
                </div>`;
            }
            return `<div class="form-group">
                <label>${f.label}${f.required ? ' *' : ''}</label>
                <input type="${f.type || 'text'}" name="${f.name}" value="${v}" ${req}>
                ${f.hint ? `<div class="form-hint">${f.hint}</div>` : ''}
            </div>`;
        }).join('');

        showModal({
            title,
            bodyHTML,
            footerButtons: [
                { text: '取消', className: 'btn', onClick: hideModal },
                {
                    text: '保存',
                    className: 'btn btn-primary',
                    onClick: async () => {
                        const formData = {};
                        for (const f of fields) {
                            const el = modalBody.querySelector(`[name="${f.name}"]`);
                            formData[f.name] = el ? el.value : '';
                        }
                        // 必填校验
                        for (const f of fields) {
                            if (f.required && !formData[f.name]) {
                                toast(`${f.label} 必填`, 'error');
                                return;
                            }
                        }
                        try {
                            await onSave(formData);
                            hideModal();
                        } catch (e) {
                            toast('保存失败：' + e.message, 'error');
                        }
                    }
                }
            ]
        });
    }

    return { showLoading, hideLoading, setStatus, showModal, hideModal, confirm, toast, showForm };
})();

/**
 * 列宽拖动（三栏布局 resizer）
 * 用法：initColumnResizer('resizer-tree', '--col-tree', minWidth, maxWidth, isFromLeft)
 */
(function initColumnResizers() {
    function setup(resizerId, cssVar, min, max, anchor) {
        const resizer = document.getElementById(resizerId);
        if (!resizer) return;
        let dragging = false;

        resizer.addEventListener('mousedown', (e) => {
            dragging = true;
            resizer.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            let width;
            if (anchor === 'left') {
                // 左栏：宽度 = 鼠标 X - 容器左边缘
                width = e.clientX;
            } else {
                // 右栏：宽度 = 容器右边缘 - 鼠标 X
                width = window.innerWidth - e.clientX;
            }
            width = Math.max(min, Math.min(max, width));
            document.documentElement.style.setProperty(cssVar, width + 'px');
        });

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            resizer.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        });
    }

    function init() {
        // 左树栏：从左边算宽度，200~600px
        setup('resizer-tree', '--col-tree', 200, 600, 'left');
        // 右详情栏：从右边算宽度，260~700px
        setup('resizer-detail', '--col-detail', 260, 700, 'right');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();