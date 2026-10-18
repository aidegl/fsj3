/**
 * stats - 世界统计（大地图角标 + 顶栏汇总）
 * P0：各局在场人数（从 roster 聚合）；活跃度滑动窗口（move/chat 事件计数，近 5 分钟）
 */
const WINDOW_MS = 5 * 60 * 1000;

export const Stats = {
    events: [],         // {ts, sceneId, kind: 'move'|'chat'|'presence'}

    /** 上帝端收到一条世界事件（只统计元数据，聊天不看内容） */
    record(sceneId, kind) {
        this.events.push({ ts: Date.now(), sceneId: sceneId || '', kind });
        if (this.events.length > 2000) this.events.splice(0, this.events.length - 2000);
    },

    /** 近 5 分钟各局活跃度（事件数） */
    activity(sceneId) {
        const cut = Date.now() - WINDOW_MS;
        let n = 0;
        for (let i = this.events.length - 1; i >= 0; i--) {
            const e = this.events[i];
            if (e.ts < cut) break;
            if (e.sceneId === sceneId) n++;
        }
        return n;
    },

    /** 汇总行：总在场 / 总活跃 */
    summary(roster, scenes) {
        const by = roster.byScene();
        let placed = 0;
        for (const s of scenes) placed += (by[s.id] || []).length;
        let act = 0;
        for (const s of scenes) act += this.activity(s.id);
        return { placed, total: roster.members.length, activity: act };
    }
};
