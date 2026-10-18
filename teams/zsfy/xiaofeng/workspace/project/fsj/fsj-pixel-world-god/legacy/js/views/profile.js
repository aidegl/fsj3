/**
 * profile - 左：角色资料卡（紧凑）  右：行动记录（当前为 mock 数据）
 * 点击角色时两栏同时打开；✕ / ESC 可分别关闭
 */

// ===== mock 行动记录生成（后续替换为真实事件流）=====
function mockActivity(m) {
    const pos = m.pos;
    const tx = pos ? Math.round(pos.tx) : 12, ty = pos ? Math.round(pos.ty) : 24;
    const sceneName = sceneNameOf(m.sceneId);
    const name = m.mingcheng;
    // 以名字做种子微调条目顺序/时间，让不同角色看起来有差异
    const seed = [...(m.rowid || name)].reduce((a, c) => a + c.charCodeAt(0), 0);
    const richang = (m.char && m.char.richeng && m.char.richeng[seed % (m.char.richeng.length || 1)]) || {};
    const pool = [
        ['🏃', `在 (${tx + (seed % 3)}, ${ty + (seed % 2)}) 附近移动，前往日程点「${richang.beizhu || '工坊空地'}」`, 4],
        ['💬', `与 小粽 私聊：汇报${name === '小粽' ? '全局' : '本局'}进展`, 17],
        ['📋', `领取任务「完善${sceneName}层级内容元数据」`, 35],
        ['🏃', `从 (${tx + 4}, ${ty + 3}) 移动到 (${tx}, ${ty})`, 52],
        ['🚪', `进入场景：${sceneName}`, 78],
        ['🛠', `使用技能「像素世界移动」连续移动 12 步`, 105],
        ['📝', `写入时间记事：本轮-校准角色坐标快照`, 150],
        ['🧘', `日程动作：zhanli（原地站立 ${3 + seed % 5} 分钟）`, 190],
        ['🤝', `接待来访成员，介绍${sceneName}布局`, 240],
        ['✅', `完成任务「地图资产入11仓」获得 20 经验`, 320],
        ['📖', `阅读「组织权限」技能文档并沉淀 1 条 12复盘`, 410],
    ];
    const now = Date.now();
    return pool
        .filter((_, i) => (i + seed) % 4 !== 3)          // 每个角色随机跳过约 1/4，制造差异
        .slice(0, 8)
        .map(([icon, text, minsAgo], i) => ({
            icon,
            text,
            ts: now - (minsAgo + i * 2 + (seed % 7)) * 60 * 1000
        }));
}

function sceneNameOf(sceneId) {
    const conf = (window.__godScenes || []).find(s => s.id === sceneId);
    return conf ? conf.name : (sceneId || '未入场');
}

function fmtTime(ts) {
    const d = new Date(ts);
    const p = n => (n < 10 ? '0' + n : '' + n);
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ===== 左栏：资料卡 =====
export const Profile = {
    open(member) {
        const m = member;
        const char = m.char || {};
        const pos = m.pos;
        const sceneName = sceneNameOf(m.sceneId);
        const avatarHtml = m.avatar
            ? `<img src="${m.avatar}" alt="" onerror="this.style.display='none'">`
            : `<canvas id="pf-sprite" width="48" height="48"></canvas>`;
        document.getElementById('pf-body').innerHTML = `
            <div class="pf-avatar">${avatarHtml}</div>
            <div class="pf-name">${m.mingcheng}</div>
            <div class="pf-biaoti">${char.biaoti || m.zhiwei || ''}</div>
            <div class="pf-grid">
                <div class="pf-cell"><div class="k">职位</div><div class="v">${m.zhiwei || '—'}</div></div>
                <div class="pf-cell"><div class="k">等级</div><div class="v">Lv.${char.dengji ?? '—'}</div></div>
                <div class="pf-cell"><div class="k">经验</div><div class="v">${char.jingyan ?? '—'}</div></div>
                <div class="pf-cell"><div class="k">五行</div><div class="v">${m.wuxing || char.wuxing || '—'}${char.dizhi ? ' · ' + char.dizhi : ''}</div></div>
                <div class="pf-cell"><div class="k">所在场景</div><div class="v">${sceneName}</div></div>
                <div class="pf-cell"><div class="k">坐标</div><div class="v">${pos ? `(${Math.round(pos.tx)}, ${Math.round(pos.ty)})` : '—'}</div></div>
                <div class="pf-cell"><div class="k">位置来源</div><div class="v">${pos ? (pos.source === 'live' ? '实时' : '快照') : '—'}</div></div>
                <div class="pf-cell"><div class="k">最后活动</div><div class="v">${pos && pos.lastWsTs ? fmtTime(pos.lastWsTs) : '—'}</div></div>
            </div>
            <div class="pf-section">
                <div class="k">人格</div>
                <div class="v">${char.renge || m.jianjie || '—'}</div>
            </div>
            ${m.jianjie ? `<div class="pf-section"><div class="k">简介</div><div class="v">${m.jianjie}</div></div>` : ''}
        `;
        // 无头像时画像素精灵
        if (!m.avatar && char && char.pixels_xiao) {
            import('../../../fsj-pixel-world/js/core/renderer.js').then(({ drawPixels }) => {
                const cv = document.getElementById('pf-sprite');
                if (!cv) return;
                const ctx = cv.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                const frame = char.pixels_xiao[0];
                const s = Math.floor(Math.min(48 / frame[0].length, 48 / frame.length));
                drawPixels(ctx, frame, Math.floor((48 - frame[0].length * s) / 2), Math.floor((48 - frame.length * s) / 2), s);
            });
        }

        // 右栏：行动记录（mock）
        renderActivity(mockActivity(m));

        document.getElementById('profile').style.display = '';
        document.getElementById('activity').style.display = '';
    },

    close() {
        document.getElementById('profile').style.display = 'none';
        document.getElementById('activity').style.display = 'none';
    }
};

function renderActivity(items) {
    document.getElementById('act-body').innerHTML = items.map(it => `
        <div class="act-item">
            <div class="act-row1"><span class="act-icon">${it.icon}</span><span class="act-time">${fmtTime(it.ts)}</span></div>
            <div class="act-text">${it.text}</div>
        </div>
    `).join('') || '<div style="color:var(--text-sub);padding:10px 2px">暂无记录</div>';
}

// ===== 事件绑定（模块加载即绑，DOM 已就绪——script type=module 天然 defer）=====
document.getElementById('pf-close').addEventListener('click', () => Profile.close());
document.getElementById('act-close').addEventListener('click', () => Profile.close());
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') Profile.close();
});
// 右键地图空白处：关闭资料卡/行动记录（拦下浏览器默认菜单，右键在面板内则正常弹菜单）
document.getElementById('sc-canvas').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    Profile.close();
});
