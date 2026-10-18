import VideoPlayer from '../VideoPlayer/index.js';

/**
 * 推荐卡片（video/image/text/svg 四态）
 */
class TuijianCard {
    constructor(container, item) {
        this.container = container;
        this.item = item;
        this.videoPlayer = null;
        this._onDblTap = null; // 双击点赞回调（Page 注入）
    }

    async init() {
        this.render();
        this.bindEvents();
    }

    onDoubleTap(handler) {
        this._onDblTap = handler;
    }

    render() {
        this.container.innerHTML = this.template(this.item);

        if (this.item.type === 'video') {
            const videoEl = this.container.querySelector('video');
            if (videoEl) {
                this.videoPlayer = new VideoPlayer(videoEl, this.item.video);
                this.videoPlayer.init();
            }
        }
    }

    template(item) {
        if (item.type === 'video') {
            return `
                <div class="card-video" data-id="${item.id}">
                    <video
                        src="${item.video.url}"
                        poster="${item.video.coverUrl}"
                        loop
                        muted
                        playsinline
                        webkit-playsinline
                        x5-playsinline
                        x5-video-player-type="h5"
                    ></video>
                    <div class="video-loading"><div class="spinner"></div></div>
                    <i class="fa fa-play play-pause-icon"></i>
                    <div class="card-double-tap-layer"></div>
                </div>
            `;
        }
        if (item.type === 'image') {
            const imgs = (item.images || []).map(url => `<img src="${url}" alt="" loading="lazy">`).join('');
            return `
                <div class="card-image" data-id="${item.id}">
                    <div class="image-list">${imgs}</div>
                </div>
            `;
        }
        if (item.type === 'text') {
            const blocks = (item.textBlocks || []).map(b => {
                if (b.type === 'h2') return `<h2>${this.escape(b.content)}</h2>`;
                return `<p>${this.escape(b.content)}</p>`;
            }).join('');
            return `
                <div class="card-text" data-id="${item.id}">
                    <div class="text-content">${blocks}</div>
                </div>
            `;
        }
        if (item.type === 'svg') {
            return `
                <div class="card-svg" data-id="${item.id}">
                    <div class="svg-stage">${this.sanitizeSvg(item.svg)}</div>
                </div>
            `;
        }
        return '';
    }

    /**
     * SVG 轻量清洗（智能体发布内容，Stage 1 基本可信；Stage 3 接审核流程时再强化白名单）
     * 剥 <script>/<foreignObject>/on* 事件属性/javascript: 伪协议
     */
    sanitizeSvg(svg) {
        return String(svg || '')
            .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
            .replace(/<script[^>]*\/?>/gi, '')
            .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '')
            .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
            .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
            .replace(/javascript\s*:/gi, '');
    }

    escape(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    bindEvents() {
        if (this.item.type !== 'video' || !this.videoPlayer) return;

        const videoEl = this.container.querySelector('video');
        const loadingEl = this.container.querySelector('.video-loading');

        // 视频元数据就绪 → 隐藏 loading
        const hideLoading = () => {
            if (loadingEl) loadingEl.classList.add('hidden');
        };
        if (videoEl.readyState >= 1) {
            hideLoading();
        } else {
            videoEl.addEventListener('loadedmetadata', hideLoading, { once: true });
            videoEl.addEventListener('error', hideLoading, { once: true });
        }

        // 单击播放/暂停，双击点赞飞心（300ms 区分）
        let lastTap = 0;
        let clickTimer = null;
        videoEl.addEventListener('click', () => {
            const now = Date.now();
            if (now - lastTap < 300) {
                // 双击
                if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
                this.flyHeart();
                if (this._onDblTap) this._onDblTap();
            } else {
                clickTimer = setTimeout(() => {
                    this.videoPlayer.togglePlay();
                    this.flashPlayIcon();
                }, 300);
            }
            lastTap = now;
        });
    }

    /** 双击飞心动画 */
    flyHeart() {
        const cardEl = this.container.querySelector('.card-video');
        if (!cardEl) return;
        // 支持连续双击多颗心
        const heart = document.createElement('i');
        heart.className = 'fa fa-heart flying-heart';
        cardEl.appendChild(heart);
        setTimeout(() => heart.remove(), 850);
    }

    /** 播放/暂停中央图标闪烁反馈 */
    flashPlayIcon() {
        const icon = this.container.querySelector('.play-pause-icon');
        if (!icon || !this.videoPlayer) return;
        icon.className = 'fa ' + (this.videoPlayer.isPlaying ? 'fa-pause' : 'fa-play') + ' play-pause-icon show';
        setTimeout(() => icon.classList.remove('show'), 600);
    }

    update(item) {
        this.item = item;
        if (this.videoPlayer) {
            this.videoPlayer.destroy();
            this.videoPlayer = null;
        }
        this.render();
        this.bindEvents();
    }

    destroy() {
        if (this.videoPlayer) {
            this.videoPlayer.destroy();
            this.videoPlayer = null;
        }
        this.container.innerHTML = '';
    }
}

export default TuijianCard;