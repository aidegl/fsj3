/**
 * 消息页 - 所有角色的会话列表（像微信）
 */
import { drawPixels } from '../../core/renderer.js';
import Palette from '../../core/palette.js';
import { loadAgents } from '../../services/agents.js';
import ChatStore from '../../services/chat-store.js';
import Members from '../../services/members.js';

export default class MessagesPage {
    constructor(container, params) {
        this.container = container;
        this.agents = [];
        this.memberByAgentId = new Map();
    }

    async init() {
        await Palette.load();
        this.agents = await loadAgents();
        await Members.load();
        this.memberByAgentId = new Map(Members.members.map(m => [m.agentId, m]));
        ChatStore.ensureSeed(this.agents);
        this.render();
        this.container.querySelector('#mpBack').addEventListener('click', () => window.PxNav('world'));
    }

    render() {
        const list = this.container.querySelector('#mpList');
        list.innerHTML = '';
        const convs = ChatStore.getConversations(this.agents);

        if (!convs.length) {
            list.innerHTML = '<div class="mp-empty">还没有会话</div>';
            return;
        }

        for (const c of convs) {
            const { agent, last, unread } = c;
            const item = document.createElement('div');
            item.className = 'mp-item';

            // 头像：优先 HAP avatar 图片，无则回退像素 canvas
            const member = this.memberByAgentId.get(agent.rowid);
            let av;
            if (member && member.avatar) {
                av = document.createElement('img');
                av.className = 'mp-av';
                av.src = member.avatar;
                av.alt = '';
            } else {
                av = document.createElement('canvas');
                av.className = 'mp-av';
                av.width = agent.pixels_xiao[0][0].length;
                av.height = agent.pixels_xiao[0].length;
                drawPixels(av.getContext('2d'), agent.pixels_xiao[0], 0, 0);
            }
            // 五行描边（像素环感）
            av.style.borderColor = this.wuxingColor(agent.wuxing);

            const col = document.createElement('div');
            col.className = 'mp-col';
            const l1 = document.createElement('div');
            l1.className = 'mp-line1';
            const name = document.createElement('div');
            name.className = 'mp-name';
            name.textContent = `${agent.mingcheng} · ${agent.biaoti}`;
            const time = document.createElement('div');
            time.className = 'mp-time';
            time.textContent = last ? (last.ctime || '').slice(5, 16) : '';
            l1.appendChild(name); l1.appendChild(time);

            const l2 = document.createElement('div');
            l2.className = 'mp-line2';
            const lastEl = document.createElement('div');
            lastEl.className = 'mp-last';
            const prefix = last ? (last.leixing === '用户' ? '我：' : '') : '（还没有对话，点击开始）';
            lastEl.textContent = last ? prefix + last.neirong : prefix;
            l2.appendChild(lastEl);
            if (unread > 0) {
                const badge = document.createElement('div');
                badge.className = 'mp-badge';
                badge.textContent = unread > 99 ? '99+' : unread;
                l2.appendChild(badge);
            }

            col.appendChild(l1); col.appendChild(l2);
            item.appendChild(av); item.appendChild(col);
            item.addEventListener('click', () => {
                ChatStore.markRead(agent.rowid);
                window.PxNav('chat', { agentId: agent.rowid });
            });
            list.appendChild(item);
        }
    }

    wuxingColor(w) {
        return (Palette.WUXING_UI[w] && Palette.WUXING_UI[w].b) || '#030303';
    }

    destroy() { }
}
