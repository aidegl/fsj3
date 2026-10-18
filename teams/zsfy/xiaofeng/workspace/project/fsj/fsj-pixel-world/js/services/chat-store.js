/**
 * 聊天记录存储 - 双数据源设计（同 chat.js 模式）
 *
 * 行结构（与明道云消息表字段一一对应，v1.0 用本地示例数据，正式切换只换实现）：
 *   { rowid, huiche, leixing(用户/智能体), neirong, fasongzhe, jieshouzhe, shanchu, ctime, weizhi }
 * 会话键：a_<用户rowid>_<角色rowid>
 * weizhi：消息发生时的位置上下文 JSON（记录也带场景记忆）
 */
const DB_KEY = 'fsj_px_chat_db';
const READ_KEY = 'fsj_px_chat_read';

const CURRENT_USER = { rowid: 'user-lindongcheng', name: '林东城' };

function fmtTime(d) {
    const p = n => (n < 10 ? '0' + n : '' + n);
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function parseTime(s) { return s ? new Date(String(s).replace(/-/g, '/')).getTime() || 0 : 0; }

function agentKey(agentId) { return `a_${CURRENT_USER.rowid}_${agentId}`; }

/** 示例种子数据：每个角色 2-4 条历史（体现人格） */
function seedMessages(agentList) {
    const rows = [];
    const ago = (min) => fmtTime(new Date(Date.now() - min * 60000));
    const push = (agentId, leixing, neirong, minutesAgo, weizhi) => {
        rows.push({
            rowid: 'seed-' + agentId + '-' + rows.length,
            huiche: agentKey(agentId),
            leixing,
            neirong,
            fasongzhe: leixing === '用户' ? CURRENT_USER.rowid : agentId,
            jieshouzhe: leixing === '用户' ? agentId : CURRENT_USER.rowid,
            shanchu: '', ctime: ago(minutesAgo), weizhi: weizhi || null
        });
    };
    const wz = (ju, desc, x, y) => ({ changjing: ju, changjing_miaoshu: desc, tx: x, ty: y });

    push('demo-xiaozong', '用户', '小粽，五局的命名什么时候定下来？', 60 * 30,
        wz('tu', '土局·中枢大殿：庄重而承载决策的氛围', 23, 9));
    push('demo-xiaozong', '智能体', '正在推进！我让五局主神各提三个方案，这周内碰一次。命名要能承载三界的格局，急不得。', 60 * 30 - 1,
        wz('tu', '土局·中枢大殿', 23, 9));
    push('demo-xiaozong', '用户', '像素视界的 demo 我明天要看。', 60 * 4,
        wz('tu', '土局·中枢大殿', 19, 12));
    push('demo-xiaozong', '智能体', '没问题，明天这个时候，我带小风给你演示——世界、角色、对话，一个不少！', 60 * 4 - 1,
        wz('tu', '土局·中枢大殿', 19, 12));

    push('demo-xiaofeng', '用户', '渲染性能有把握吗？', 60 * 8,
        wz('mu', '木局·工坊：生长与建造的气息', 16, 7));
    push('demo-xiaofeng', '智能体', '地形离屏缓存一次 drawImage，六个精灵每帧百来个 fillRect——60fps 是底线，不是目标。别问这种问题。', 60 * 8 - 1,
        wz('mu', '木局·工坊', 16, 7));

    push('demo-ashuo', '智能体', '老朋友，三天没来了，金局的新故事攒了五个，随时开讲！', 60 * 26,
        wz('jin', '金局·书阁：金属般清亮的回声', 10, 24));

    push('demo-mengyao', '用户', '水池的颜色再调调？', 60 * 48,
        wz('shui', '水局·画境：流动与留白', 9, 38));
    push('demo-mengyao', '智能体', '好呀，我把它调成"黄昏最后一瞥"——蓝到深处带一点紫，像入梦前的那一刻。', 60 * 48 - 1,
        wz('shui', '水局·画境', 9, 38));

    return rows;
}

const ChatStore = {
    /** @type 'mock' | 'mingdao' */
    mode: 'mock',
    db: null,

    load() {
        if (this.db) return this.db;
        try { this.db = JSON.parse(localStorage.getItem(DB_KEY) || 'null'); } catch (e) { this.db = null; }
        if (!this.db || !Array.isArray(this.db.messages)) {
            this.db = { messages: [] };
        }
        return this.db;
    },

    save() {
        try { localStorage.setItem(DB_KEY, JSON.stringify(this.db)); } catch (e) { /* ignore */ }
    },

    /** 初始化种子（首次访问且指定了角色列表时） */
    ensureSeed(agentList) {
        const db = this.load();
        if (db.messages.length === 0 && agentList && agentList.length) {
            db.messages = seedMessages(agentList);
            this.save();
        }
    },

    /** 某角色的会话消息（时间正序） */
    getMessages(agentId) {
        const key = agentKey(agentId);
        return this.load().messages
            .filter(m => m.huiche === key && m.shanchu !== '1')
            .sort((a, b) => parseTime(a.ctime) - parseTime(b.ctime));
    },

    /** 写入一条消息 */
    append(agentId, leixing, neirong, weizhi) {
        const row = {
            rowid: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            huiche: agentKey(agentId),
            leixing,
            neirong,
            fasongzhe: leixing === '用户' ? CURRENT_USER.rowid : agentId,
            jieshouzhe: leixing === '用户' ? agentId : CURRENT_USER.rowid,
            shanchu: '',
            ctime: fmtTime(new Date()),
            weizhi: weizhi || null
        };
        this.load().messages.push(row);
        this.save();
        return row;
    },

    /** 会话列表（消息页）：每角色最新一条 + 未读数 */
    getConversations(agentList) {
        const readMap = this._reads();
        return agentList.map(a => {
            const list = this.getMessages(a.rowid);
            const last = list[list.length - 1] || null;
            const lastRead = readMap[a.rowid] || 0;
            const unread = list.filter(m => m.fasongzhe !== CURRENT_USER.rowid && parseTime(m.ctime) > lastRead).length;
            return { agent: a, last, unread };
        });
    },

    markRead(agentId) {
        const map = this._reads();
        map[agentId] = Date.now();
        try { localStorage.setItem(READ_KEY, JSON.stringify(map)); } catch (e) { /* ignore */ }
    },

    _reads() {
        try { return JSON.parse(localStorage.getItem(READ_KEY) || '{}'); } catch (e) { return {}; }
    },

    clearConversation(agentId) {
        const key = agentKey(agentId);
        this.load().messages = this.load().messages.filter(m => m.huiche !== key);
        this.save();
    },

    /** 发送并获取回复（串起 存储→AI→存储 全链路，位置上下文贯穿） */
    async sendToAgent(agent, content, weizhi, onChunk) {
        const { AIAdapter } = await import('./ai-adapter.js');
        const lishi = this.getMessages(agent.rowid).slice(-8)
            .map(m => ({ role: m.leixing === '用户' ? 'user' : 'agent', content: m.neirong }));
        this.append(agent.rowid, '用户', content, weizhi);
        let full = '';
        await new Promise((resolve) => {
            AIAdapter.chat({
                agentId: agent.rowid, agentName: agent.mingcheng,
                dizhi: agent.dizhi, renge: agent.renge,
                content, weizhi, lishi
            }, (chunk) => {
                if (chunk.type === 'result') full = chunk.content;
                if (onChunk) onChunk(chunk);
                if (chunk.type === 'done') resolve();
            });
        });
        if (full) this.append(agent.rowid, '智能体', full, weizhi);
        return full;
    }
};

export default ChatStore;
