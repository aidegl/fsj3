/**
 * 底部作者栏
 *
 * props: { item, followed, onFollow }
 */
class AuthorBar {
    constructor(container, opts) {
        this.container = container;
        this.opts = opts;
        this.item = opts.item;
        this.followed = !!opts.followed;
    }

    async init() {
        this.render();
        this.bindEvents();
    }

    render() {
        this.container.innerHTML = this.template();
    }

    template() {
        const item = this.item;
        const verifiedBadge = item.author.verified
            ? '<i class="fa fa-check-circle"></i>'
            : '';
        const followBtnClass = this.followed ? 'followed' : '';
        const followBtnText = this.followed ? '已关注' : '+ 关注';
        const safeDesc = this.escape(item.description || '');
        const safeTitle = this.escape(item.title || '');
        const safeName = this.escape(item.author.name || '');
        return `
            <div class="author-bar">
                <div class="author-info">
                    <img class="author-avatar" src="${item.author.avatarUrl}" alt="${safeName}" data-action="goto-author">
                    <div class="author-meta">
                        <div class="author-name-row">
                            <span class="author-name">@${safeName}</span>
                            ${verifiedBadge}
                        </div>
                        <div class="author-desc">${safeDesc}</div>
                    </div>
                    <button class="follow-btn ${followBtnClass}" data-action="follow">${followBtnText}</button>
                </div>
                <div class="item-title">${safeTitle}</div>
                ${item.musicName ? `
                <div class="music-row">
                    <i class="fa fa-music"></i>
                    <span class="music-name">${this.escape(item.musicName)} · ${safeName}</span>
                </div>` : ''}
            </div>
        `;
    }

    escape(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    bindEvents() {
        const avatar = this.container.querySelector('[data-action="goto-author"]');
        if (avatar) {
            avatar.addEventListener('click', (e) => {
                e.stopPropagation();
                // Stage 1: mock toast；Stage 2: 跳作者主页
                alert(`跳作者主页（mock）：${this.item.author.name}`);
            });
        }
        const followBtn = this.container.querySelector('[data-action="follow"]');
        if (followBtn) {
            followBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.opts.onFollow) this.opts.onFollow();
            });
        }
    }

    update(opts) {
        this.item = opts.item;
        this.followed = !!opts.followed;
        this.render();
        this.bindEvents();
    }

    destroy() {
        this.container.innerHTML = '';
    }
}

export default AuthorBar;