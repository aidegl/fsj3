/**
 * 视频播放器封装
 *
 * 处理：自动播放（静音）、单击播放/暂停、销毁清理
 * 浏览器策略：自动播放必须静音，单击后才能带声
 */
class VideoPlayer {
    constructor(videoEl, opts) {
        this.videoEl = videoEl;
        this.opts = opts || {};
        this.isPlaying = false;
    }

    init() {
        this.videoEl.muted = true;
        this.videoEl.loop = true;
        this.videoEl.playsInline = true;
        this.bindEvents();
    }

    play() {
        const p = this.videoEl.play();
        if (p && typeof p.then === 'function') {
            return p.then(() => {
                this.isPlaying = true;
            }).catch((err) => {
                this.isPlaying = false;
                console.warn('[VideoPlayer] 自动播放失败:', err);
                throw err;
            });
        }
        this.isPlaying = true;
        return Promise.resolve();
    }

    pause() {
        this.videoEl.pause();
        this.isPlaying = false;
    }

    togglePlay() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play().catch(() => {});
        }
    }

    bindEvents() {
        this.videoEl.addEventListener('play', () => { this.isPlaying = true; });
        this.videoEl.addEventListener('pause', () => { this.isPlaying = false; });
        this.videoEl.addEventListener('error', (e) => {
            console.error('[VideoPlayer] 加载失败:', this.videoEl.src, e);
        });
    }

    destroy() {
        try {
            this.pause();
            this.videoEl.removeAttribute('src');
            this.videoEl.load();
        } catch (e) {
            // ignore
        }
        this.videoEl = null;
        this.opts = null;
    }
}

export default VideoPlayer;