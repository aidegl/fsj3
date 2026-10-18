/**
 * 全屏聊天页 - 与指定角色的完整对话（历史回看 + 流式发送）
 * 参数：?page=chat&agentId=demo-xxx
 */
import { drawPixels } from '../../core/renderer.js';
import Palette from '../../core/palette.js';
import World from '../../services/world.js';
import { loadAgents } from '../../services/agents.js';
import ChatStore from '../../services/chat-store.js';

export default class ChatPage {
    constructor(container, params) {
        this.container = container;
        this.agentId = params.get('agentId') || 'demo-xiaozong';
        this.agent = null;
        this.sending = false;
        this._onKey = (e) => { if (e.key === 'Enter' && !e.isComposing) this.send(); };
    }

    async init() {
        await Palette.load();
        await World.load();
        const all = await loadAgents();
        this.agent = all.find(a => a.rowid === this.agentId) || all[0];
        ChatStore.ensureSeed(all);
        ChatStore.markRead(this.agent.rowid);

        const d = this.agent; // loadAgents 返回原始数据对象（非 Agent 实例）
        this.container.querySelector('#cpName').textContent = d.mingcheng;
        const conf = World.config.scenes.find(s => s.id === d.ju);
        this.container.querySelector('#cpSub').textContent =
            `${conf ? conf.name : d.ju} · ${d.biaoti} · ${d.wuxing}·${d.dizhi}`;
        const av = this.container.querySelector('#cpAvatar');
        av.width = d.pixels_xiao[0][0].length; av.height = d.pixels_xiao[0].length;
        drawPixels(av.getContext('2d'), d.pixels_xiao[0], 0, 0);

        this.renderHistory();

        this.container.querySelector('#cpBack').addEventListener('click', () => window.PxNav('world'));
        this.container.querySelector('#cpSend').addEventListener('click', () => this.send());
        this.container.querySelector('#cpInput').addEventListener('keydown', this._onKey);
        this.container.querySelector('#cpClear').addEventListener('click', () => {
            if (confirm('清空与' + d.mingcheng + '的全部聊天记录？')) {
                ChatStore.clearConversation(this.agent.rowid);
                this.renderHistory();
            }
        });
    }

    /** 位置上下文：M1 用角色所属局的语义（全屏页无实时位置） */
    locationFallback() {
        const conf = World.config.scenes.find(s => s.id === this.agent.ju);
        return {
            changjing: this.agent.ju,
            changjing_miaoshu: conf ? conf.biaoyu : '',
            tx: null, ty: null
        };
    }

    renderHistory() {
        const list = this.container.querySelector('#cpList');
        const msgs = ChatStore.getMessages(this.agent.rowid);
        this.container.querySelector('#cpEmpty').style.display = msgs.length ? 'none' : '';
        list.querySelectorAll('.cp-row').forEach(el => el.remove());
        for (const m of msgs) this.appendRow(m, false);
        this.scrollBottom();
    }

    appendRow(m, animate = false) {
        const list = this.container.querySelector('#cpList');
        const isMe = m.leixing === '用户';
        const row = document.createElement('div');
        row.className = 'cp-row' + (isMe ? ' me' : '');
        const av = document.createElement('canvas');
        const pxs = isMe ? this.myAvatar() : this.agent.pixels_xiao[0];
        av.className = 'cp-av'; av.width = pxs[0].length; av.height = pxs.length;
        drawPixels(av.getContext('2d'), pxs, 0, 0);
        const col = document.createElement('div');
        col.className = 'cp-col';
        const msg = document.createElement('div');
        msg.className = 'cp-msg';
        msg.textContent = m.neirong + (animate ? '' : '');
        if (animate) msg.innerHTML = this.escapeHtml(m.neirong) + '<span class="cursor">▌</span>';
        const time = document.createElement('div');
        time.className = 'cp-time';
        time.textContent = (m.ctime || '').slice(5, 16);
        col.appendChild(msg);
        col.appendChild(time);
        if (m.weizhi && !isMe) {
            const wz = document.createElement('div');
            wz.className = 'cp-weizhi';
            wz.textContent = m.weizhi.changjing_miaoshu
                ? `${m.weizhi.changjing_miaoshu.split('：')[0]} (${m.weizhi.tx ?? ''},${m.weizhi.ty ?? ''})`
                : '位置上下文已携带';
            col.appendChild(wz);
        }
        row.appendChild(av);
        row.appendChild(col);
        list.appendChild(row);
        this.scrollBottom();
        return { row, msg };
    }

    myAvatar() {
        // M1 用户无像素分身：用程序生成的方脸（后续资产管线产出）
        if (this._myAv) return this._myAv;
        const px = Array.from({ length: 16 }, () => Array(16).fill(null));
        for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) px[y][x] = 'D38200';
        for (let y = 6; y < 8; y++) { px[y][6] = '181818'; px[y][9] = '181818'; }
        for (let x = 6; x < 10; x++) px[10][x] = 'FFC2C2';
        this._myAv = px;
        return px;
    }

    async send() {
        const input = this.container.querySelector('#cpInput');
        const content = input.value.trim();
        if (!content || this.sending) return;
        this.sending = true;
        input.value = '';
        // 乐观渲染用户行
        this.appendRow({ leixing: '用户', neirong: content, ctime: ChatStoreNow() }, false);
        // 发送 + 流式
        const rowRefs = this.appendRow({ leixing: '智能体', neirong: '', ctime: ChatStoreNow() }, true);
        let acc = '';
        try {
            await ChatStore.sendToAgent(this.agent, content, this.locationFallback(), (chunk) => {
                if (chunk.type === 'delta' || chunk.type === 'result') {
                    acc = chunk.content || acc;
                    rowRefs.msg.innerHTML = this.escapeHtml(acc) + '<span class="cursor">▌</span>';
                    this.scrollBottom();
                }
            });
            rowRefs.msg.textContent = acc;
        } catch (err) {
            rowRefs.msg.textContent = '（传音失败：' + err.message + '）';
        } finally {
            this.sending = false;
            ChatStore.markRead(this.agent.rowid);
        }
    }

    scrollBottom() {
        const list = this.container.querySelector('#cpList');
        list.scrollTop = list.scrollHeight;
    }

    escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    destroy() {
        this.container.querySelector('#cpInput').removeEventListener('keydown', this._onKey);
    }
}

function ChatStoreNow() {
    const d = new Date(), p = n => (n < 10 ? '0' + n : '' + n);
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
