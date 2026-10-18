/**
 * 评论面板（Stage 1: 只读壳子）
 *
 * 后续 Stage 接真实评论数据 + 编辑器
 */
class CommentSheet {
    constructor(container, item) {
        this.container = container;
        this.item = item;
        this.el = null;
    }

    init() {
        this.render();
        this.bindEvents();
    }

    render() {
        const el = document.createElement('div');
        el.className = 'comment-sheet-mask';
        el.innerHTML = `
            <div class="comment-sheet">
                <div class="sheet-header">
                    <span class="sheet-title">${this.item.stats.commentCount} 条评论</span>
                    <button class="sheet-close" data-action="close" aria-label="关闭">
                        <i class="fa fa-times"></i>
                    </button>
                </div>
                <div class="sheet-body">
                    <div class="empty-tip">
                        <i class="fa fa-commenting-o"></i>
                        <p>暂无评论</p>
                        <small>Stage 1 仅占位 · Stage 2 接真实数据</small>
                    </div>
                </div>
                <div class="sheet-footer">
                    <input class="comment-input" type="text" placeholder="发条评论吧（mock）" disabled>
                    <button class="comment-send" disabled>发送</button>
                </div>
            </div>
        `;
        this.container.appendChild(el);
        this.el = el;
    }

    bindEvents() {
        const closeBtn = this.el.querySelector('[data-action="close"]');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.destroy();
            });
        }
        this.el.addEventListener('click', (e) => {
            if (e.target === this.el) this.destroy();
        });
    }

    destroy() {
        if (this.el && this.el.parentNode) {
            this.el.parentNode.removeChild(this.el);
        }
        this.el = null;
    }
}

export default CommentSheet;