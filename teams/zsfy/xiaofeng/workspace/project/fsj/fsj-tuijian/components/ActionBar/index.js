/**
 * 右侧悬浮操作栏
 *
 * props: { item, liked, collected, onLike, onCollect, onShare, onComment, onDislike }
 */
class ActionBar {
    constructor(container, opts) {
        this.container = container;
        this.opts = opts;
        this.item = opts.item;
        this.liked = !!opts.liked;
        this.collected = !!opts.collected;
    }

    async init() {
        this.render();
        this.bindEvents();
    }

    render() {
        this.container.innerHTML = this.template();
    }

    formatCount(n) {
        if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
        return String(n);
    }

    template() {
        const item = this.item;
        const heartClass = this.liked ? 'fa-heart' : 'fa-heart-o';
        const starClass = this.collected ? 'fa-star' : 'fa-star-o';
        return `
            <div class="action-bar">
                <button class="action-btn" data-action="like" aria-label="点赞">
                    <i class="fa ${heartClass}"></i>
                    <span class="action-count">${this.formatCount(item.stats.likeCount)}</span>
                </button>
                <button class="action-btn" data-action="comment" aria-label="评论">
                    <i class="fa fa-commenting-o"></i>
                    <span class="action-count">${this.formatCount(item.stats.commentCount)}</span>
                </button>
                <button class="action-btn" data-action="collect" aria-label="收藏">
                    <i class="fa ${starClass}"></i>
                    <span class="action-count">${this.formatCount(item.stats.collectCount)}</span>
                </button>
                <button class="action-btn" data-action="share" aria-label="分享">
                    <i class="fa fa-share"></i>
                    <span class="action-count">${this.formatCount(item.stats.shareCount)}</span>
                </button>
                <button class="action-btn action-btn-icon-only" data-action="dislike" aria-label="不感兴趣">
                    <i class="fa fa-times"></i>
                </button>
            </div>
        `;
    }

    bindEvents() {
        this.container.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const handler = this.opts['on' + action[0].toUpperCase() + action.slice(1)];
                if (handler) handler();
            });
        });
    }

    update(opts) {
        this.item = opts.item;
        this.liked = !!opts.liked;
        this.collected = !!opts.collected;
        this.render();
        this.bindEvents();
    }

    /** 点赞/收藏 burst 动画（切换后调用） */
    burst(action) {
        const btn = this.container.querySelector(`[data-action="${action}"]`);
        if (!btn) return;
        btn.classList.remove('liked-burst');
        void btn.offsetWidth; // 重置动画
        btn.classList.add('liked-burst');
    }

    destroy() {
        this.container.innerHTML = '';
    }
}

export default ActionBar;