import { items as mockItems } from '../../mock/items.js';
import TuijianCard from '../../components/TuijianCard/index.js';
import ActionBar from '../../components/ActionBar/index.js';
import AuthorBar from '../../components/AuthorBar/index.js';
import CommentSheet from '../../components/CommentSheet/index.js';

/**
 * 推荐页 Page 类（抖音式竖滑）
 *
 * 状态：
 *  - items: 内容数组（mock 阶段，后续接 API）
 *  - currentIndex: 当前卡片索引
 *  - likedMap / collectedMap / followedSet / dislikedSet: 互动本地状态
 *
 * 生命周期：
 *  - init()    加载 HTML 模板、初始化子组件、绑定滑动
 *  - destroy() 清理资源
 */
class Page {
    constructor(container) {
        this.container = container;
        this.version = window.__VERSION__ || Date.now();

        // 数据
        this.items = mockItems;
        this.currentIndex = 0;

        // 互动状态
        this.likedMap = {};
        this.collectedMap = {};
        this.followedSet = new Set();
        this.dislikedSet = new Set();

        // 子组件引用
        this.card = null;
        this.actionBar = null;
        this.authorBar = null;
        this.commentSheet = null;

        // 滑动相关
        this.touchStartY = 0;
        this.touchCurrentY = 0;
        this.isDragging = false;
        this.SWIPE_THRESHOLD = 80;       // 触发阈值 px
        this.SWIPE_MAX_DRAG = 200;       // 最大拖拽距离 px
        this.SWIPE_DURATION = 300;       // 动画时长 ms
    }

    async init() {
        // 1. 加载 HTML 模板
        const html = await fetch(`./pages/tuijian/index.html?v=${this.version}`, {
            cache: 'no-store'
        }).then(r => r.text());
        this.container.innerHTML = html;

        // 2. 初始化卡片
        this.cardEl = this.container.querySelector('#card-container');
        this.card = new TuijianCard(this.cardEl, this.items[this.currentIndex]);
        this.card.onDoubleTap(() => this.handleDoubleTapLike());
        await this.card.init();

        // 3. 初始化操作栏
        this.actionBarEl = this.container.querySelector('#action-bar');
        this.actionBar = new ActionBar(this.actionBarEl, {
            item: this.items[this.currentIndex],
            liked: false,
            collected: false,
            onLike: () => this.handleLike(),
            onCollect: () => this.handleCollect(),
            onShare: () => this.handleShare(),
            onComment: () => this.handleComment(),
            onDislike: () => this.handleDislike()
        });
        await this.actionBar.init();

        // 4. 初始化作者栏
        this.authorBarEl = this.container.querySelector('#author-bar');
        this.authorBar = new AuthorBar(this.authorBarEl, {
            item: this.items[this.currentIndex],
            followed: false,
            onFollow: () => this.handleFollow()
        });
        await this.authorBar.init();

        // 5. 绑定滑动事件
        this.bindSwipe();

        // 6. 视频卡片自动播放
        this.maybeAutoPlay();
    }

    // ---------- 滑动逻辑 ----------
    bindSwipe() {
        const onStart = (e) => {
            if (this.cardEl.classList.contains('swipe-up') ||
                this.cardEl.classList.contains('swipe-down') ||
                this.cardEl.classList.contains('swipe-back')) {
                return;
            }
            this.touchStartY = e.touches[0].clientY;
            this.isDragging = true;
            this.touchCurrentY = 0;
            this.cardEl.style.transition = 'none';
            this.container.querySelector('.tuijian-page').classList.add('swiping');
        };

        const onMove = (e) => {
            if (!this.isDragging) return;
            const dy = e.touches[0].clientY - this.touchStartY;
            this.touchCurrentY = Math.max(-this.SWIPE_MAX_DRAG, Math.min(this.SWIPE_MAX_DRAG, dy));
            this.cardEl.style.transform = `translateY(${this.touchCurrentY}px)`;
        };

        const onEnd = () => {
            if (!this.isDragging) return;
            this.isDragging = false;
            this.container.querySelector('.tuijian-page').classList.remove('swiping');
            this.cardEl.style.transition = `transform ${this.SWIPE_DURATION}ms ease-out`;

            if (this.touchCurrentY < -this.SWIPE_THRESHOLD && this.currentIndex < this.items.length - 1) {
                this.currentIndex++;
                this.cardEl.style.transform = 'translateY(-100%)';
                setTimeout(() => this.swapCard('up'), this.SWIPE_DURATION);
            } else if (this.touchCurrentY > this.SWIPE_THRESHOLD && this.currentIndex > 0) {
                this.currentIndex--;
                this.cardEl.style.transform = 'translateY(100%)';
                setTimeout(() => this.swapCard('down'), this.SWIPE_DURATION);
            } else {
                this.cardEl.style.transform = 'translateY(0)';
            }
            this.touchCurrentY = 0;
        };

        this.cardEl.addEventListener('touchstart', onStart, { passive: true });
        this.cardEl.addEventListener('touchmove', onMove, { passive: true });
        this.cardEl.addEventListener('touchend', onEnd);
        this.cardEl.addEventListener('touchcancel', onEnd);

        // 鼠标拖拽（桌面端调试用）
        let mouseStartY = 0;
        let mouseDragging = false;
        this.cardEl.addEventListener('mousedown', (e) => {
            mouseStartY = e.clientY;
            mouseDragging = true;
            this.cardEl.style.transition = 'none';
        });
        this.cardEl.addEventListener('mousemove', (e) => {
            if (!mouseDragging) return;
            const dy = e.clientY - mouseStartY;
            this.touchCurrentY = Math.max(-this.SWIPE_MAX_DRAG, Math.min(this.SWIPE_MAX_DRAG, dy));
            this.cardEl.style.transform = `translateY(${this.touchCurrentY}px)`;
        });
        this.cardEl.addEventListener('mouseup', () => {
            if (!mouseDragging) return;
            mouseDragging = false;
            this.cardEl.style.transition = `transform ${this.SWIPE_DURATION}ms ease-out`;
            if (this.touchCurrentY < -this.SWIPE_THRESHOLD && this.currentIndex < this.items.length - 1) {
                this.currentIndex++;
                this.cardEl.style.transform = 'translateY(-100%)';
                setTimeout(() => this.swapCard('up'), this.SWIPE_DURATION);
            } else if (this.touchCurrentY > this.SWIPE_THRESHOLD && this.currentIndex > 0) {
                this.currentIndex--;
                this.cardEl.style.transform = 'translateY(100%)';
                setTimeout(() => this.swapCard('down'), this.SWIPE_DURATION);
            } else {
                this.cardEl.style.transform = 'translateY(0)';
            }
            this.touchCurrentY = 0;
        });
    }

    // 滑动后切换卡片数据
    swapCard(direction) {
        const item = this.items[this.currentIndex];
        // 暂停旧视频
        if (this.card.videoPlayer) this.card.videoPlayer.pause();

        // 重置 transform 准备渲染（无视觉跳动）
        this.cardEl.style.transition = 'none';
        this.cardEl.style.transform = direction === 'up' ? 'translateY(100%)' : 'translateY(-100%)';
        // 触发回流
        void this.cardEl.offsetHeight;

        // 渲染新卡片
        this.card.update(item);
        this.actionBar.update({
            item,
            liked: !!this.likedMap[item.id],
            collected: !!this.collectedMap[item.id]
        });
        this.authorBar.update({
            item,
            followed: this.followedSet.has(item.author.id)
        });

        // 复位（无动画）
        this.cardEl.style.transform = 'translateY(0)';
        requestAnimationFrame(() => {
            this.cardEl.style.transition = '';
        });

        // 自动播放新视频
        this.maybeAutoPlay();
    }

    maybeAutoPlay() {
        const item = this.items[this.currentIndex];
        if (item.type === 'video' && this.card.videoPlayer) {
            // 延迟 100ms 让切换动画稳定
            setTimeout(() => {
                this.card.videoPlayer.play().catch(() => {
                    // 自动播放被浏览器拦截，静默忽略（需用户单击触发）
                });
            }, 100);
        }
    }

    // ---------- 互动 ----------
    /** 双击视频 = 强制点赞 */
    handleDoubleTapLike() {
        const id = this.items[this.currentIndex].id;
        if (!this.likedMap[id]) {
            this.likedMap[id] = true;
            this.actionBar.update({
                item: this.items[this.currentIndex],
                liked: true,
                collected: !!this.collectedMap[id]
            });
        }
        this.actionBar.burst('like');
    }

    handleLike() {
        const id = this.items[this.currentIndex].id;
        this.likedMap[id] = !this.likedMap[id];
        this.actionBar.update({
            item: this.items[this.currentIndex],
            liked: !!this.likedMap[id],
            collected: !!this.collectedMap[id]
        });
        if (this.likedMap[id]) this.actionBar.burst('like');
    }

    handleCollect() {
        const id = this.items[this.currentIndex].id;
        this.collectedMap[id] = !this.collectedMap[id];
        this.actionBar.update({
            item: this.items[this.currentIndex],
            liked: !!this.likedMap[id],
            collected: !!this.collectedMap[id]
        });
        if (this.collectedMap[id]) this.actionBar.burst('collect');
    }

    handleShare() {
        const item = this.items[this.currentIndex];
        // Stage 1: mock toast；Stage 2: 接 share API
        if (navigator.share) {
            navigator.share({
                title: item.title,
                text: item.description,
                url: location.href
            }).catch(() => {});
        } else {
            alert(`分享（mock）：${item.title}`);
        }
    }

    handleComment() {
        const item = this.items[this.currentIndex];
        if (this.commentSheet) this.commentSheet.destroy();
        this.commentSheet = new CommentSheet(document.body, item);
        this.commentSheet.init();
    }

    handleDislike() {
        const id = this.items[this.currentIndex].id;
        this.dislikedSet.add(id);
        // 跳过到下一条
        if (this.currentIndex < this.items.length - 1) {
            this.cardEl.style.transition = `transform ${this.SWIPE_DURATION}ms ease-out`;
            this.cardEl.style.transform = 'translateY(-100%)';
            this.currentIndex++;
            setTimeout(() => this.swapCard('up'), this.SWIPE_DURATION);
        }
    }

    handleFollow() {
        const authorId = this.items[this.currentIndex].author.id;
        if (this.followedSet.has(authorId)) {
            this.followedSet.delete(authorId);
        } else {
            this.followedSet.add(authorId);
        }
        this.authorBar.update({
            item: this.items[this.currentIndex],
            followed: this.followedSet.has(authorId)
        });
    }

    destroy() {
        if (this.card) this.card.destroy();
        if (this.actionBar) this.actionBar.destroy();
        if (this.authorBar) this.authorBar.destroy();
        if (this.commentSheet) this.commentSheet.destroy();
        this.container.innerHTML = '';
    }
}

export default Page;