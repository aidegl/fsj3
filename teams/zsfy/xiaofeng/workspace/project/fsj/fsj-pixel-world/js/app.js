/**
 * 像素视界 - 应用入口（SPA 路由 + 页面保活）
 * 页面三分离：js/pages/{name}/index.html + index.css + index.js（默认导出类）
 * 页面类约定：constructor(container, params)；必须实现 destroy()
 *   可选实现：onPause()（切走时暂停动画/轮询）、onResume()（切回时恢复）
 *
 * 路由：SPA 内部切换 + keep-alive
 *   - 每个页面只加载/实例化一次，之后切走=隐藏 DOM + 调 onPause，切回=显示 + 调 onResume
 *   - 世界页状态（镜头/角色/对话）完整保留，切回秒开不重载
 *   - URL 参数变了才会销毁重建该页（保证新参数生效）
 *   - 持久化数据都在 HAP + localStorage，与切页方式无关
 */
const SESSION_V = Date.now();   // 会话级版本号（刷新页面才会变）

class App {
    constructor() {
        this.pages = new Map();        // pageName -> { host, inst, search }
        this.currentPageName = null;
        this.currentPage = null;
        this.initRem();
        this.start();
    }

    /** rem 适配：750 设计稿，1rem = 屏宽/7.5 */
    initRem() {
        const set = () => {
            document.documentElement.style.fontSize = (window.innerWidth / 7.5) + 'px';
        };
        set();
        window.addEventListener('resize', set);
    }

    getPageFromURL() {
        const params = new URLSearchParams(window.location.search);
        const page = params.get('page') || 'world';
        return { page, params };
    }

    async start() {
        const { page, params } = this.getPageFromURL();
        await this.navigate(page, params, { push: false });
        // 浏览器前进/后退 → 切到对应页面
        window.addEventListener('popstate', () => {
            const p = this.getPageFromURL();
            this.navigate(p.page, p.params, { push: false });
        });
    }

    /**
     * SPA 切换页面（keep-alive）：
     *  - 首次进入：加载模块/CSS/HTML → 实例化 → init()
     *  - 再次进入：显示旧 DOM → onResume()（页面状态原样保留）
     *  - 参数变化：销毁旧实例重建（保证新参数生效）
     */
    async navigate(page, params = {}, opts = {}) {
        const push = opts.push !== false;
        const p = params instanceof URLSearchParams ? params : new URLSearchParams(params);
        const search = new URLSearchParams({ page, ...Object.fromEntries(p.entries()) }).toString();

        // 已在目标页：只同步 URL
        if (this.currentPageName === page) {
            if (push && search !== window.location.search.slice(1)) history.replaceState({}, '', `?${search}`);
            return;
        }

        const container = document.getElementById('app');

        // 1) 旧页面：隐藏 + onPause（不销毁、不丢状态）
        if (this.currentPageName && this.pages.has(this.currentPageName)) {
            const old = this.pages.get(this.currentPageName);
            old.host.style.display = 'none';
            if (old.inst && typeof old.inst.onPause === 'function') {
                try { old.inst.onPause(); } catch (e) { console.warn('[nav] onPause 异常', e); }
            }
        }
        this.currentPage = null;
        this.currentPageName = null;

        const loading = document.createElement('div');
        loading.className = 'px-loading';
        loading.textContent = '像素视界加载中…';

        try {
            let entry = this.pages.get(page);
            const needRebuild = entry && entry.search !== search;   // 参数变了 → 重建

            if (!entry || needRebuild) {
                if (needRebuild) {
                    try { entry.inst.destroy && entry.inst.destroy(); } catch (e) { /* */ }
                    entry.host.remove();
                    this.pages.delete(page);
                }
                loading.style.display = 'flex';
                document.body.appendChild(loading);

                // 加载模块（会话级 V：同会话复用模块缓存，World 等单例不丢）
                const mod = await import(`./pages/${page}/index.js?v=${SESSION_V}`);
                // 样式去重注入
                if (!document.head.querySelector(`link[data-page="${page}"]`)) {
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = `./js/pages/${page}/index.css?v=${SESSION_V}`;
                    link.dataset.page = page;
                    document.head.appendChild(link);
                }
                // 页面宿主（保活容器）
                const host = document.createElement('div');
                host.className = 'page-host';
                host.dataset.page = page;
                container.appendChild(host);
                const htmlRes = await fetch(`./js/pages/${page}/index.html?v=${SESSION_V}`, { cache: 'no-store' });
                host.innerHTML = await htmlRes.text();
                const inst = new mod.default(host, p);
                if (inst.init) await inst.init();
                entry = { host, inst, search };
                this.pages.set(page, entry);
            } else {
                // 保活恢复：显示 + onResume
                entry.host.style.display = '';
                if (entry.inst && typeof entry.inst.onResume === 'function') {
                    try { await entry.inst.onResume(); } catch (e) { console.warn('[nav] onResume 异常', e); }
                }
            }

            this.currentPageName = page;
            this.currentPage = entry.inst;
            if (push && search !== window.location.search.slice(1)) {
                history.pushState({}, '', `?${search}`);
            }
        } catch (err) {
            console.error('页面加载失败:', err);
            container.innerHTML = `<div style="padding:.4rem;color:#ff7a7a;font-size:.28rem;line-height:1.6">
                页面加载失败：${err.message}<br>请通过 HTTP 服务器访问（npx http-server -p 8080 -c-1）
            </div>`;
        } finally {
            loading.remove();
        }
    }
}

// 暴露全局跳转（各页面使用；SPA 内部切换 + keep-alive，不整页刷新）
window.PxNav = function (page, params = {}) {
    if (window.PxApp) window.PxApp.navigate(page, params);
    else {
        // 兜底（PxApp 未就绪时极少发生）：退回整页跳转
        const qs = new URLSearchParams({ page, ...params }).toString();
        window.location.href = `${window.location.pathname}?${qs}`;
    }
};

const app = new App();
window.PxApp = app;