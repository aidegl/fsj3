/**
 * 组织页面 - 公会 UI（通用模板，所有组织共用）
 * 参数：?page=org&orgId=<rowid>
 * 数据：FsjChat.orgInfo(orgId) 拉横幅；卡片点击进入对应功能（MVP 大部分为占位）
 */
import { FsjChat } from '../../services/fsj-chat.js';

export default class OrgPage {
    constructor(container, params) {
        this.container = container;
        this.params = params;
        this.orgId = params.get('orgId') || '';
        this.info = null;
    }

    async init() {
        this.bindEvents();
        if (!this.orgId) {
            this.showError('缺少 orgId 参数');
            return;
        }
        await this.loadInfo();
    }

    /** 加载横幅数据 */
    async loadInfo() {
        const loading = this.container.querySelector('#orgLoading');
        const errBox = this.container.querySelector('#orgError');
        loading.style.display = 'block';
        errBox.style.display = 'none';
        try {
            this.info = await FsjChat.orgInfo(this.orgId);
            this.renderBanner();
        } catch (e) {
            this.showError('加载失败：' + e.message);
        } finally {
            loading.style.display = 'none';
        }
    }

    renderBanner() {
        const o = this.info;
        if (!o) return;
        this.container.querySelector('#orgName').textContent = o.mingcheng;
        const dateStr = o.ctime ? o.ctime.split(' ')[0] : '';
        this.container.querySelector('#orgMeta').textContent =
            `${o.memberCount} 位成员${dateStr ? ' · 创建于 ' + dateStr : ''}`;
        // 等级占位（MVP：按成员数估算）
        const lv = Math.max(1, Math.min(9, Math.floor(Math.log2(o.memberCount + 1)) + 1));
        this.container.querySelector('#orgLevel').textContent = 'LV ' + lv;
    }

    showError(msg) {
        const err = this.container.querySelector('#orgError');
        err.textContent = msg;
        err.style.display = 'block';
        this.container.querySelector('#orgLoading').style.display = 'none';
        this.container.querySelector('#orgName').textContent = '—';
    }

    bindEvents() {
        this.container.querySelector('#orgBack').addEventListener('click', () => window.PxNav('world'));
        this.container.querySelector('#orgMsg').addEventListener('click', () => this.onCardClick('msg'));

        // 卡片点击 → 按 data-key 分发
        this.container.querySelectorAll('.card[data-key]').forEach(card => {
            card.addEventListener('click', () => this.onCardClick(card.dataset.key));
        });

        // 底部 tab
        this.container.querySelectorAll('.tabbar-item').forEach((t, i) => {
            t.addEventListener('click', () => this.toast(['公会', '福利', '设置', '帮助'][i] + ' 建设中'));
        });
    }

    /** 卡片点击路由（MVP：仅 members 真正跳转；其余占位 toast） */
    onCardClick(key) {
        if (!this.info) { this.toast('组织信息未加载完'); return; }
        switch (key) {
            case 'members':
                // 成员列表（MVP：toast 显示成员数 + rowid 列表，后续接 members 子页面）
                this.toast(`成员 ${this.info.memberCount} 位\n${this.info.zzyh.slice(0, 5).map(m => m.name || m.sid.slice(0, 8)).join('、')}${this.info.zzyh.length > 5 ? '…' : ''}`);
                break;
            case 'rd':
                // 研发部门 → 进地图编辑器（默认天孚宫，后续可让组织管理员选场景）
                this.toast('研发部门：进入地图编辑器');
                window.PxNav('map-editor', { sceneId: '75fdbe30-0dcb-47c8-90d2-7efd6a76df8d' });
                break;
            case 'msg':
                this.toast('群聊（公屏消息）—— 后续接 FsjChat 群聊协议');
                break;
            default:
                this.toast(`${this.cardLabel(key)} 建设中`);
        }
    }

    cardLabel(key) {
        return ({
            rules: '规则', culture: '文化', forum: '论坛',
            review: '复盘', tasks: '任务计划', shop: '商城',
            rd: '研发部门', projects: '项目部'
        })[key] || key;
    }

    toast(text) {
        const el = this.container.querySelector('#orgToast');
        el.textContent = text;
        el.style.display = '';
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2200);
    }

    destroy() {
        clearTimeout(this._toastTimer);
    }
}