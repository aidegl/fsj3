/**
 * 技能页 - 游戏风技能卡牌 + 指针拖拽排序（触屏/鼠标通用）
 * 数据：HAP 实时（hap-skills.js：骨架根 2 层内 sew=1技能；2026-09-07 东城批准算法）
 * 导航（2026-09-07 东城拍板·卡牌套卡牌）：点卡片 → 下一层子数据仍以同一套卡牌网格呈现，
 *       无限层级；顶栏下方有层级路径（面包屑）+ 返回；无子数据的卡为"末级卡"（无徽标）
 * 缓存：localStorage 按账号缓存根层（TTL 5 分钟）+ 进页后台静默刷新；层级 kids 内存缓存
 * 排序：localStorage 按账号+层级隔离
 * 入口：世界页左列「卡牌」（卡牌=能力=技能）→ ?page=skills
 */
import Members from '../../services/members.js';

// HapSkills 动态 import + 时间戳版本：防浏览器缓存老版服务（2026-09-07 bug：
// 静态 import 无版本参数，老板手机缓存了旧 hap-skills.js，怎么刷都换不掉）
let HapSkills = null;

const ORDER_KEY = 'pxw_skills_order_';
const RARITY = ['普通', '稀有', '史诗'];

function hash(s) {
    let h = 0;
    for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h;
}

export default class SkillsPage {
    constructor(container, params) {
        this.container = container;
        this.params = params;
        this.account = null;
        this.skills = [];         // 当前层的卡牌数据
        this.rootSkills = [];     // 根层（骨架 1、2 层内 1技能）
        this.hasSkeleton = false;
        this._path = [];          // 层级路径（[{rowid, mingcheng}]，空=根层）
        this._drag = null;
        this._toastTimer = 0;
        this._navLock = 0;        // 层级切换锁（防连点双触发）
    }

    async init() {
        await Members.load();
        this.account = Members.current();
        // 服务模块带时间戳版本拉新（页面 ES module 自身有 ?v=SESSION_V，services 静态 import 没有）
        if (!HapSkills) HapSkills = (await import('../../services/hap-skills.js?v=' + Date.now())).default;
        this.bindUI();
        // 缓存优先：TTL 内直接渲染，秒开
        const cached = await HapSkills.load(this.account.rowid);
        this.applyRoot(cached);
        // 后台静默刷新：强制拉新，有变化且在根层才重绘（防止刚发布的技能看不到）
        HapSkills.load(this.account.rowid, 0).then(fresh => {
            if (JSON.stringify(fresh) !== JSON.stringify(this._lastRoot) && !this._path.length) this.applyRoot(fresh);
        }).catch(err => console.warn('[skills] 静默刷新失败', err));
    }

    /** 应用根层数据（缓存或静默刷新结果）：恢复排序 → 渲染 */
    applyRoot(data) {
        this._lastRoot = data;
        this.hasSkeleton = data.hasSkeleton;
        const list = data.skills.slice();
        const byId = Object.fromEntries(list.map(s => [s.rowid, s]));
        const order = this.loadOrder([]);
        this.rootSkills = [
            ...order.map(id => byId[id]).filter(Boolean),
            ...list.filter(s => !order.includes(s.rowid))
        ];
        if (!this._path.length) this.renderLevel();
    }

    /** 读取某层保存的排序 */
    loadOrder(path) {
        const key = ORDER_KEY + this.account.rowid + (path.length ? ':' + path.map(p => p.rowid).join('+') : '');
        try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
    }

    saveOrder() {
        const key = ORDER_KEY + this.account.rowid + (this._path.length ? ':' + this._path.map(p => p.rowid).join('+') : '');
        try { localStorage.setItem(key, JSON.stringify([...this.container.querySelectorAll('.sk-card')].map(el => el.dataset.id))); } catch (e) { /* ignore */ }
    }

    /** 渲染当前层：层级路径 + 卡牌网格（根层/子层同一套卡牌样式） */
    async renderLevel() {
        const bar = this.container.querySelector('#skCrumbBar');
        const crumb = this.container.querySelector('#skCrumb');
        const depth = this._path.length;

        // 层级路径（顶栏下方，非根层显示）：点任一祖先直接跳回（内存缓存不重查）
        bar.style.display = depth > 0 ? 'flex' : 'none';
        crumb.innerHTML = '';
        if (depth > 0) {
            const segs = [{ mingcheng: '技能' }, ...this._path];
            segs.forEach((p, i) => {
                if (i > 0) {
                    const sep = document.createElement('span');
                    sep.className = 'sk-crumb-sep'; sep.textContent = '›';
                    crumb.appendChild(sep);
                }
                const isAncestor = i < segs.length - 1;
                const seg = document.createElement(isAncestor ? 'button' : 'span');
                seg.className = 'sk-crumb-item' + (isAncestor ? ' link' : ' cur');
                seg.textContent = p.mingcheng;
                if (isAncestor) seg.addEventListener('click', () => this.navTo(i));  // 点第 i 段 → 路径截到长度 i（segs[0]=根标记）
                crumb.appendChild(seg);
            });
        }

        if (depth === 0) {
            this.skills = this.rootSkills;
            this.renderGrid();
            return;
        }
        // 子层：内存缓存优先，否则异步拉（层级切换锁防连点）
        const cur = this._path[depth - 1];
        let kids = HapSkills.getCachedKids(cur.rowid);
        if (!kids) {
            this.skills = [];
            this.renderGrid('加载中…');
            try {
                kids = await HapSkills.children(cur.rowid);
                HapSkills.cacheKids(cur.rowid, kids);
            } catch (err) {
                this.skills = [];
                this.renderGrid('子数据加载失败：' + (err.message || err));
                return;
            }
            if (this._path[this._path.length - 1] !== cur) return;  // 异步竞态守卫：等待期间已切层
        }
        // 子层卡牌排序（按层隔离）
        const byId = Object.fromEntries(kids.map(k => [k.rowid, k]));
        const order = this.loadOrder(this._path);
        this.skills = [
            ...order.map(id => byId[id]).filter(Boolean),
            ...kids.filter(k => !order.includes(k.rowid))
        ];
        this.renderGrid();
    }

    /** 跳转到指定层深：>0 截断路径到该层；-1 回根层 */
    navTo(depth) {
        // 导航锁：吞掉同一次 tap 的尾随 click（点返回后面包屑已重排，杂散点击会误跳层）
        if (Date.now() < this._navLock) return;
        this._navLock = Date.now() + 400;
        this._path = depth < 0 ? [] : this._path.slice(0, depth);
        this.renderLevel();
    }

    /** 钻入一张卡（有子数据时）：压栈 + 渲染下一层卡牌 */
    drill(s) {
        if (Date.now() < this._navLock) return;
        this._navLock = Date.now() + 400;
        this._path.push({ rowid: s.rowid, mingcheng: s.mingcheng });
        this.renderLevel();
    }

    /** 卡牌数值：HAP 无此字段，按 rowid 稳定派生（同一技能每次刷新一致） */
    derive(id) {
        const h = hash(id);
        return { lv: 1 + h % 5, mastery: 15 + hash(id + 'm') % 80, r: h % 3 };
    }

    renderGrid(loadingText) {
        const grid = this.container.querySelector('#skGrid');
        grid.innerHTML = '';
        if (loadingText) {
            const el = document.createElement('div');
            el.className = 'sk-empty';
            el.textContent = loadingText;
            grid.appendChild(el);
            return;
        }
        if (!this.skills.length) {
            const empty = document.createElement('div');
            empty.className = 'sk-empty';
            empty.textContent = this._path.length
                ? '该技能下暂无子数据'
                : (this.hasSkeleton
                    ? this.account.mingcheng + ' 的五事骨架里还没有「1技能」记录'
                    : this.account.mingcheng + ' 还没有五事骨架——先在 HAP 建骨架，再把技能记录挂到「将」或「道→全局技能」下');
            grid.appendChild(empty);
            return;
        }
        for (const s of this.skills) {
            const { lv, mastery, r } = this.derive(s.rowid);
            const card = document.createElement('div');
            card.className = 'sk-card r' + r;
            card.dataset.id = s.rowid;
            const cv = document.createElement('canvas');
            cv.className = 'sk-glyph';
            // xstb 像素图标（二维数组，hex 字符串 / null）；无图标回退到首字
            if (Array.isArray(s.xstb) && s.xstb.length) {
                cv.width = s.xstb[0].length; cv.height = s.xstb.length;
                const ctx = cv.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                s.xstb.forEach((row, y) => (row || []).forEach((hex, x) => {
                    if (!hex) return;
                    ctx.fillStyle = '#' + String(hex).replace('#', '');
                    ctx.fillRect(x, y, 1, 1);
                }));
            } else {
                cv.width = 10; cv.height = 10;
                const ctx = cv.getContext('2d');
                ctx.fillStyle = '#d2d2d2';
                ctx.fillRect(0, 0, 10, 10);
                ctx.fillStyle = '#545454';
                ctx.font = '7px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText((s.mingcheng || '?')[0], 5, 8);
            }
            const info = document.createElement('div');
            info.className = 'sk-info';
            info.innerHTML = '<div class="sk-name"></div><div class="sk-meta"><span class="sk-lv"></span><span class="sk-rarity"></span></div><div class="sk-bar"><i></i></div>';
            info.querySelector('.sk-name').textContent = s.mingcheng;
            info.querySelector('.sk-lv').textContent = 'LV ' + lv;
            info.querySelector('.sk-rarity').textContent = RARITY[r];
            info.querySelector('.sk-bar i').style.width = mastery + '%';
            card.appendChild(cv);
            card.appendChild(info);
            // 右上角子数据数量徽标（>0 可钻入下一层卡牌；无则末级卡）
            if (s.ziCount > 0) {
                const b = document.createElement('span');
                b.className = 'sk-badge';
                b.textContent = s.ziCount;
                card.appendChild(b);
            }
            grid.appendChild(card);
        }
    }

    bindUI() {
        const grid = this.container.querySelector('#skGrid');
        this.container.querySelector('#skBack').addEventListener('click', () => window.PxNav('world'));
        this.container.querySelector('#skLevelBack').addEventListener('click', () => this.navTo(this._path.length - 1));

        grid.addEventListener('pointerdown', (e) => {
            const card = e.target.closest('.sk-card');
            if (!card) return;
            try { card.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            this._drag = { card, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
        });

        // move/up 挂在 window：即使指针拖出网格或捕获丢失也不会卡住
        this._onMove = (e) => {
            const d = this._drag;
            if (!d || e.pointerId !== d.id) return;
            const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
            if (!d.moved && Math.hypot(dx, dy) > 8) {
                d.moved = true;
                const r = d.card.getBoundingClientRect();
                d.ox = e.clientX - r.left; d.oy = e.clientY - r.top;
                d.card.classList.add('dragging');
            }
            if (!d.moved) return;
            d.card.style.transform = 'translate(' + (dx - d.ox) + 'px,' + (dy - d.oy) + 'px)';

            const cr = d.card.getBoundingClientRect();
            const px = cr.left + cr.width / 2, py = cr.top + cr.height / 2;
            let want = 0;
            for (const el of grid.children) {
                if (el === d.card) continue;
                const r = el.getBoundingClientRect();
                const cy = r.top + r.height / 2, cx = r.left + r.width / 2;
                if (cy < py || (Math.abs(cy - py) <= r.height / 2 && cx < px)) want++;
            }
            let cur = 0;
            for (const el of grid.children) { if (el === d.card) break; cur++; }
            if (want === cur) return;
            const others = [...grid.children].filter(el => el !== d.card);
            const ref = others[want] || null;
            const old = d.card.getBoundingClientRect();
            grid.insertBefore(d.card, ref);
            const now = d.card.getBoundingClientRect();
            d.sx += now.left - old.left;
            d.sy += now.top - old.top;
        };

        this._onUp = (e) => {
            const d = this._drag;
            if (!d || (e.pointerId !== undefined && e.pointerId !== d.id)) return;
            // 手机上浏览器可能把点按判成滚动起点而发 pointercancel：未移动的 cancel 也算 tap（2026-09-07 bug 修复）
            const isTap = e.type === 'pointerup' || (e.type === 'pointercancel' && !d.moved);
            if (d.moved) {
                d.card.classList.remove('dragging');
                d.card.style.transform = '';
                this.saveOrder();
            } else if (isTap) {
                const s = this.skills.find(x => x.rowid === d.card.dataset.id);
                if (s) {
                    // 根层含「造地皮技能」关键词 → 直接进地图编辑器
                    if (!this._path.length) {
                        const KW_BUILD_TILE = '765a08a1-ed14-44c0-9825-27e4b5ecd51e';
                        const gks = Array.isArray(s.guanjianci) ? s.guanjianci : [];
                        if (gks.includes(KW_BUILD_TILE)) {
                            // 默认编辑天孚宫（rowid 75fdbe30-...），后续可按角色当前位置
                            window.PxNav('map-editor', { sceneId: '75fdbe30-0dcb-47c8-90d2-7efd6a76df8d' });
                            return;
                        }
                    }
                    // 有子数据 → 钻入下一层卡牌；末级卡 → toast 详情
                    if (s.ziCount > 0) this.drill(s);
                    else {
                        const { lv, mastery } = this.derive(s.rowid);
                        this.toast('【' + s.mingcheng + '】LV ' + lv + ' · 熟练度 ' + mastery + '%');
                    }
                }
            }
            this._drag = null;
        };
        window.addEventListener('pointermove', this._onMove);
        window.addEventListener('pointerup', this._onUp);
        window.addEventListener('pointercancel', this._onUp);
    }

    toast(text) {
        const el = this.container.querySelector('#pxToast');
        el.textContent = text;
        el.style.display = 'block';
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2400);
    }

    destroy() {
        window.removeEventListener('pointermove', this._onMove);
        window.removeEventListener('pointerup', this._onUp);
        window.removeEventListener('pointercancel', this._onUp);
    }
}
