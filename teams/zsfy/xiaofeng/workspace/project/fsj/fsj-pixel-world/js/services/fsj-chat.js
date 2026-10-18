/**
 * fsj 聊天持久化 —— 私聊协议（4交流）经 Node 代理（mingdao-proxy）调用明道云（appKey/sign 不落前端）
 *
 * 会话：组织表 69f549c69f1956fc0e171aa6（ltlx=私聊，zzyh=双方 rowid，fabuzhe=发起人）
 * 消息：shangpin 内容元数据表（sew=4交流，leixing=交流，quanxian=组织可见，
 *       kjzz=会话id，fabuzhe=发送者，fbsj=时间，mingcheng=正文）
 * 协议：.claude/skills/fsj-skills-open/私聊.md；调用模式同 webview-spa2.0/js/services/chat.js
 * 代理：2026-09-04 从 Dify 迁移至 Node 代理（业务字段代理不碰，fbsj 由本文件自己传）
 */
const MINGDAO_PROXY = 'https://100000whys.cn/mingdao';
const ORG_WS = '69f549c69f1956fc0e171aa6';
const USER_WS = '69b0077358322d512e60bad0';
const M_API = 'https://api.mingdao.com/v2/open/worksheet/getFilterRows';
const M_ADD = 'https://api.mingdao.com/v2/open/worksheet/addRow';
const M_GET = 'https://api.mingdao.com/v2/open/worksheet/getRowByIdPost';
const M_EDIT = 'https://api.mingdao.com/v2/open/worksheet/editRow';
const F_DIDIAN = '6a93cb7b3e15666e1444b990';    // 用户表.地点（Relation → 地点表）
const F_COORD = '6a9426fcf35a00559c4c4f5f';     // 用户表.像素坐标（Text："x,y"）

/** 经 Node 代理调明道云（响应即明道云原始 JSON，无包裹） */
async function call(url, body) {
    const res = await fetch(MINGDAO_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, input: body })
    });
    if (!res.ok) throw new Error('明道云代理 ' + res.status);
    return res.json();
}

function rel(v) {
    try { const a = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
}
function fmt(d) {
    const p = n => (n < 10 ? '0' + n : '' + n);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
        p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

export const FsjChat = {
    _conv: new Map(),   // 'user|peer' -> convKey（页面级缓存）
    _names: new Map(),

    /** 读玩家所在地点与像素坐标（用户表.地点 / .像素坐标）
     * 注意：HAP 返回的字段是拼音名 `xszb`（不是 controlId `6a9426fc...`），
     *       写入用 controlId，读取用字段名（API 设计如此） */
    async playerState(rowid) {
        const d = await call(M_GET, {
            worksheetId: USER_WS, rowId: rowid,
            controls: ['didian', 'xszb']
        });
        const row = (d && d.data) || d;
        const did = rel(row.didian)[0] || {};
        const coord = String(row.xszb || '');
        const [x, y] = coord.split(',').map(n => parseInt(n, 10));
        return {
            didian: did.sid || '',
            x: Number.isFinite(x) ? x : null,
            y: Number.isFinite(y) ? y : null
        };
    },

    /** 写玩家所在地点与像素坐标（编辑行，Node 代理通道） */
    async savePlayerState(rowid, placeRowid, x, y) {
        await call(M_EDIT, {
            worksheetId: USER_WS, rowId: rowid,
            controls: [
                { controlId: F_DIDIAN, value: placeRowid },
                { controlId: F_COORD, value: x + ',' + y }
            ]
        });
    },  // rowid -> 昵称

    /** 用户表昵称（失败回退 fallback）。注意：getRowByIdPost 的行嵌在 data 里 */
    async userName(rowid, fallback) {
        if (this._names.has(rowid)) return this._names.get(rowid);
        try {
            const d = await call(M_GET, { worksheetId: USER_WS, rowId: rowid, controls: ['nickname', 'name', 'mingcheng'] });
            const row = (d && d.data) || d;
            const name = row.nickname || row.name || row.mingcheng || fallback;
            this._names.set(rowid, name);
            return name;
        } catch (e) {
            this._names.set(rowid, fallback);
            return fallback;
        }
    },

    /** 确保私聊会话存在，返回 convKey（同一对成员整个页面生命周期只建/查一次） */
    async ensurePrivate(userRowid, userName, peerRowid, peerName) {
        const k = userRowid + '|' + peerRowid;
        if (this._conv.has(k)) return this._conv.get(k);

        const find = await call(M_API, {
            worksheetId: ORG_WS, pageSize: 1, pageIndex: 1, listType: 0,
            controls: ['mingcheng', 'ltlx', 'zzyh'],
            filters: [
                { controlId: 'zzyh', dataType: 29, spliceType: 1, filterType: 24, value: userRowid },
                { controlId: 'zzyh', dataType: 29, spliceType: 1, filterType: 24, value: peerRowid },
                { controlId: 'ltlx', dataType: 11, spliceType: 1, filterType: 1, value: '私聊' }
            ]
        });
        const rows = (find.data && find.data.rows) || [];
        const hit = rows.filter(r => r.ltlx === '私聊')[0];

        let convKey;
        if (hit) {
            convKey = hit.rowid;
        } else {
            const made = await call(M_ADD, {
                worksheetId: ORG_WS,
                controls: [
                    { controlId: 'mingcheng', value: userName + '-' + peerName + '-私聊' },
                    { controlId: 'leixing', value: '61221926-f9e6-4941-847a-5625538dc120', valueType: 2 },
                    { controlId: 'ltlx', value: '私聊' },
                    { controlId: 'zzyh', value: userRowid + ',' + peerRowid },
                    { controlId: 'fabuzhe', value: userRowid }
                ]
            });
            if (!made.success) throw new Error(made.error_msg || '创建会话失败');
            convKey = made.data;
        }
        this._conv.set(k, convKey);
        return convKey;
    },

    /** 写一条 4交流 消息，返回 {rowid, ctime}（先存后发的"存"）
     *  orgRowid：所属商家 rowid（2026-09-06 拍板：创建 shangpin 必带 shangjia2；不传则跳过，HAP 工作流兜底） */
    async send(convKey, text, fromRowid, orgRowid) {
        const controls = [
                { controlId: 'mingcheng', value: text },
                { controlId: 'leixing', value: '交流' },
                { controlId: 'sew', value: '4交流' },
                { controlId: 'quanxian', value: '组织可见' },
                { controlId: 'kjzz', value: convKey },
                { controlId: 'fabuzhe', value: fromRowid },
                { controlId: 'fbsj', value: fmt(new Date()) }
            ];
        if (orgRowid) controls.push({ controlId: 'shangjia2', value: orgRowid });
        const made = await call(M_ADD, {
            worksheetId: 'shangpin',
            controls: controls
        });
        if (!made.success) throw new Error(made.error_msg || '写入失败');
        return { rowid: made.data, ctime: fmt(new Date()) };
    },

    /** 拉某会话历史（接口侧过滤 + 客户端复核，双保险），按时间正序 */
    async history(convKey) {
        const d = await call(M_API, {
            worksheetId: 'shangpin', pageSize: 200, pageIndex: 1, listType: 0,
            controls: ['mingcheng', 'sew', 'kjzz', 'fabuzhe', 'fbsj', 'ctime'],
            filters: [
                { controlId: 'kjzz', dataType: 29, spliceType: 1, filterType: 24, value: convKey },
                { controlId: 'sew', dataType: 11, spliceType: 1, filterType: 1, value: '4交流' },
                { controlId: 'leixing', dataType: 11, spliceType: 1, filterType: 1, value: '交流' }
            ]
        });
        const rows = (d.data && d.data.rows) || [];
        return rows
            .filter(r => r.sew === '4交流' && JSON.stringify(rel(r.kjzz)).includes(convKey))
            .map(r => {
                const from = rel(r.fabuzhe)[0] || { sid: '', name: '' };
                return {
                    rowid: r.rowid, fasongzhe: from.sid, fasongzheName: from.name,
                    neirong: r.mingcheng || '', ctime: r.fbsj || r.ctime || ''
                };
            })
            .sort((a, b) => new Date(a.ctime.replace(/-/g, '/')) - new Date(b.ctime.replace(/-/g, '/')));
    },

    /**
     * 加载「该角色已加入的组织」：组织表 ORG_WS，zzyh 包含角色 rowid AND leixing=组织
     * 返回 [{rowid, mingcheng}]（接口侧过滤 + 客户端按 leixing 复核双保险）
     */
    async myOrganizations(rowid) {
        const d = await call(M_API, {
            worksheetId: ORG_WS, pageSize: 100, pageIndex: 1, listType: 0,
            controls: ['mingcheng', 'leixing', 'zzyh'],
            filters: [
                { controlId: 'zzyh', dataType: 29, spliceType: 1, filterType: 24, value: rowid },
                { controlId: 'leixing', dataType: 2, spliceType: 1, filterType: 2, value: '组织' }
            ]
        });
        const rows = (d.data && d.data.rows) || [];
        return rows
            .filter(r => r.leixing === '组织')
            .map(r => ({ rowid: r.rowid, mingcheng: r.mingcheng || '(未命名组织)' }));
    },

    /** 读组织详情（横幅用：mingcheng / zzyh 成员数 / ctime） */
    async orgInfo(orgId) {
        const d = await call(M_GET, {
            worksheetId: ORG_WS, rowId: orgId,
            controls: ['mingcheng', 'leixing', 'zzyh', 'fabuzhe', 'ctime']
        });
        const row = (d && d.data) || d;
        return {
            rowid: orgId,
            mingcheng: row.mingcheng || '(未命名组织)',
            leixing: row.leixing || '',
            zzyh: rel(row.zzyh),
            memberCount: rel(row.zzyh).length,
            ctime: row.ctime || ''
        };
    },

    /** 经验值关键词（像素视界-角色组织经验值） */
    EXP_KW: '69ed0120-5dae-458c-aeb4-df11830fb185',

    /**
     * 查角色在某个商家（组织）下的经验值账户
     * 条件：ptyh=用户rowid + shangjia2=商家rowid + guanjianci=经验值关键词
     * 返回 { rowid, mingcheng, szhz(累计经验), jfhz(积分汇总) } 或 null
     */
    async loadExp(userRowid, orgRowid) {
        const d = await call(M_API, {
            worksheetId: 'shangpin', pageSize: 5, pageIndex: 1, listType: 0,
            controls: ['mingcheng', 'szhz', 'jfhz', 'ptyh', 'shangjia2', 'guanjianci'],
            filters: [
                { controlId: 'ptyh', dataType: 29, spliceType: 1, filterType: 24, value: userRowid },
                { controlId: 'shangjia2', dataType: 29, spliceType: 1, filterType: 24, value: orgRowid },
                { controlId: 'guanjianci', dataType: 29, spliceType: 1, filterType: 24, value: this.EXP_KW }
            ]
        });
        const rows = (d.data && d.data.rows) || [];
        // 客户端复核（防接口侧过滤失效）
        const hit = rows.find(r => {
            const ids = v => rel(v).map(x => x.sid || x.rowid);
            return ids(r.ptyh).includes(userRowid)
                && ids(r.shangjia2).includes(orgRowid)
                && ids(r.guanjianci).includes(this.EXP_KW);
        });
        if (!hit) return null;
        return {
            rowid: hit.rowid,
            mingcheng: hit.mingcheng || '',
            szhz: Number(hit.szhz) || 0,   // 累计经验值
            jfhz: Number(hit.jfhz) || 0    // 积分汇总
        };
    }
};
