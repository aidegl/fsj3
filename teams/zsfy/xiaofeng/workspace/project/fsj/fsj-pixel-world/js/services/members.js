/**
 * 成员账号服务：HAP 成员 rowid ↔ 像素角色（demo-*）桥接 + 当前账号持久化
 * members.json 由 hap-cli 按成员 rowid 查询生成（重新生成：查询后覆盖该文件）
 * 当前账号存 sessionStorage（每个标签页独立）——多开同浏览器互不干扰（2026-09-02）
 */
const CURRENT_KEY = 'pxw_current_member';

export default {
    members: [],

    async load() {
        const res = await fetch(`./assets/members.json?v=${Date.now()}`, { cache: 'no-store' });
        this.members = await res.json();
        return this.members;
    },

    /** 合并像素角色数据（pixels/dengji/jingyan/wuxing/dizhi/renge 来自 assets/characters/*.json） */
    merge(agents) {
        for (const m of this.members) {
            m.char = agents.find(a => a.rowid === m.agentId) || null;
        }
        return this.members;
    },

    current() {
        const rowid = sessionStorage.getItem(CURRENT_KEY);
        return this.members.find(m => m.rowid === rowid) || this.members[0];
    },

    setCurrent(rowid) {
        sessionStorage.setItem(CURRENT_KEY, rowid);
    }
};
