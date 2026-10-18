/**
 * 聊天服务 - 私聊/群聊走 fsj 4交流协议，AI 助手走本地轻量通道
 *
 * 数据源（config.datasource）：
 *   'fsj'  → 真实协议（默认）：
 *     会话 = 组织表 69f549c69f1956fc0e171aa6 的记录（ltlx=私聊/群聊，zzyh=成员，fabuzhe=发起人/群主）
 *     消息 = 内容表 shangpin 的 sew=4交流 记录（mingcheng=正文，quanxian=组织可见，
 *            kjzz=会话id 权限锚定，fabuzhe=发送者，fbsj=时间）
 *     协议见 .claude/skills/fsj-skills-open/私聊.md、群聊.md
 *   'mock' → 本地演示数据（示例会话 + 拟真自动回复），不写真实表
 *
 * AI 助手会话：不落 4交流 表，消息存 MockStore（localStorage），回复走 AIService/模拟流式。
 *
 * 群聊 @ 占位（发送原文保留，渲染时替换）：
 *   @_<rowid>_user     → @人名
 *   @_<rowid>_content  → [引用内容]
 */
var ChatService = (function () {
  'use strict';

  var MOCK_DB_KEY = 'fsj_chat_mock_db';
  var READ_MAP_KEY = 'fsj_chat_readmap';

  var ORG_WS = '69f549c69f1956fc0e171aa6';   // 会话容器（组织表）
  var USER_WS = '69b0077358322d512e60bad0';  // 用户表（通讯录）
  var CONTENT_WS = 'shangpin';               // 消息（内容元数据表）
  var MINGDAO_API = 'https://api.mingdao.com/v2/open/worksheet/getFilterRows';
  var MINGDAO_ADD = 'https://api.mingdao.com/v2/open/worksheet/addRow';

  var config = {
    datasource: 'fsj',      // 'fsj' 真实协议 | 'mock' 演示数据
    viewAsUser: '',         // 开发调试视角：{rowid,name} 或 ''（走登录身份）
    pollInterval: 60000
  };

  function MINGDAO_API_call(url, body) {
    return FsjApi.callMingdaoAPI(url, body);
  }

  // ==================== 身份 ====================

  /**
   * 当前聊天身份；fsj 模式未登录返回 null（页面引导登录）
   */
  function getUser() {
    if (config.datasource === 'mock') {
      return { rowid: 'demo-user', name: '演示用户', agent: 'default', shangjia: '', isDemo: true };
    }
    if (config.viewAsUser && config.viewAsUser.rowid) {
      return {
        rowid: config.viewAsUser.rowid,
        name: config.viewAsUser.name || '用户',
        agent: localStorage.getItem('fsj_agent_id') || 'default',
        shangjia: FsjApi.getShangjiaRowid() || '',
        isDemo: true
      };
    }
    var info = null;
    try { info = JSON.parse(localStorage.getItem('fsj_user_info') || 'null'); } catch (e) { /* ignore */ }
    // 兼容多种存储结构：账号登录 {rowid, openid,…} / WechatLogin 刷新 {id,…}——有任一身份标识即算登录
    var rid = info && (info.rowid || info.id || info.openid);
    if (info && rid) {
      return {
        rowid: rid,
        name: info.name || '用户',
        agent: info.agent || localStorage.getItem('fsj_agent_id') || 'default',
        shangjia: FsjApi.getShangjiaRowid() || '',
        isDemo: false
      };
    }
    return null; // 未登录
  }

  // ==================== 会话键（AI 会话专用） ====================

  function agentKey(userRowid, agentId) {
    return 'a_' + userRowid + '_' + (agentId || 'default');
  }

  // ==================== 工具 ====================

  function parseTime(s) {
    if (!s) return 0;
    return new Date(String(s).replace(/-/g, '/')).getTime() || 0;
  }

  function fmtTime(d) {
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
      p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  /** 解析关联字段数组 → [{sid, name}] */
  function parseRelation(v) {
    if (!v) return [];
    try {
      var arr = typeof v === 'string' ? JSON.parse(v) : v;
      if (!Array.isArray(arr)) return [];
      return arr.map(function (x) { return { sid: x.sid || '', name: x.name || '' }; });
    } catch (e) { return []; }
  }

  // ==================== Mock 数据层（演示 + AI 会话存储） ====================

  var MockStore = {
    db: null,
    load: function () {
      if (this.db) return this.db;
      try { this.db = JSON.parse(localStorage.getItem(MOCK_DB_KEY) || 'null'); } catch (e) { this.db = null; }
      if (!this.db || !Array.isArray(this.db.messages)) {
        this.db = this.db && Array.isArray(this.db.messages) ? this.db : { messages: [], peers: {} };
        this.save();
      }
      return this.db;
    },
    save: function () {
      try { localStorage.setItem(MOCK_DB_KEY, JSON.stringify(this.db)); } catch (e) { /* ignore */ }
    },
    insert: function (msg) {
      var db = this.load();
      db.messages.push(msg);
      this.save();
      return msg;
    },
    queryConv: function (convKey) {
      var db = this.load();
      return db.messages.filter(function (m) { return m.huiche === convKey; })
        .sort(function (a, b) { return parseTime(a.ctime) - parseTime(b.ctime); });
    },
    clearConversation: function (convKey) {
      var db = this.load();
      db.messages = db.messages.filter(function (m) { return m.huiche !== convKey; });
      this.save();
    },
    resetDemo: function () {
      this.db = seedDemo();
      this.save();
    }
  };

  /** mock 演示种子（datasource=mock 时使用） */
  function seedDemo() {
    var now = Date.now();
    function t(minAgo) { return fmtTime(new Date(now - minAgo * 60000)); }
    function mk(huiche, leixing, neirong, from, to, ctime) {
      return {
        rowid: 'mock-' + Math.random().toString(36).slice(2, 10),
        huiche: huiche, leixing: leixing, neirong: neirong,
        fasongzhe: from, jieshouzhe: to, shangjia: '', shanchu: '', ctime: ctime
      };
    }
    var msgs = [
      mk('s_demo-merchant_demo-user', '用户', '你好，我昨天下的订单什么时候发货呀', 'demo-user', 'demo-merchant', t(600)),
      mk('s_demo-merchant_demo-user', '商家', '您好！订单已在打包中，48 小时内发出 📦', 'demo-merchant', 'demo-user', t(595)),
      mk('u_demo-user_peer-yeguo', '用户', '椰果你好，看你发的悬赏帖还在接吗？', 'demo-user', 'peer-yeguo', t(180)),
      mk('u_demo-user_peer-yeguo', '用户', '在的！还差 2 个人，你要参加吗？', 'peer-yeguo', 'demo-user', t(170))
    ];
    var peers = {
      's_demo-merchant_demo-user': { type: 'merchant', name: '粽说风云 · 客服', avatar: '', rowid: 'demo-merchant' },
      'u_demo-user_peer-yeguo': { type: 'user', name: '椰果', avatar: '', rowid: 'peer-yeguo' }
    };
    return { messages: msgs, peers: peers };
  }

  // ==================== fsj 协议：会话 ====================

  /** 查我在私聊/群聊会话（组织表 zzyh 包含我） */
  function fsjQueryConversations(user) {
    return MINGDAO_API_call(MINGDAO_API, {
      worksheetId: ORG_WS,
      pageSize: 50,
      pageIndex: 1,
      listType: 0,
      controls: ['mingcheng', 'leixing', 'ltlx', 'zzyh', 'fabuzhe', 'ctime'],
      filters: [
        { controlId: 'zzyh', dataType: 29, spliceType: 1, filterType: 24, value: user.rowid },
        { controlId: 'ltlx', dataType: 11, spliceType: 2, filterType: 1, values: ['私聊', '群聊'] }
      ]
    }).then(function (res) {
      var rows = (res.success && res.data && res.data.rows) || [];
      return rows.map(function (r) {
        var members = parseRelation(r.zzyh);
        var isGroup = r.ltlx === '群聊';
        var peer;
        if (isGroup) {
          peer = {
            type: 'group',
            name: r.mingcheng || '未命名群聊',
            avatar: '',
            rowid: r.rowid,
            members: members,
            ownerId: (parseRelation(r.fabuzhe)[0] || {}).sid || ''
          };
        } else {
          var other = members.find(function (m) { return m.sid !== user.rowid; }) ||
            members[0] || { sid: r.rowid, name: '会话' };
          peer = { type: 'user', name: other.name || '用户', avatar: '', rowid: other.sid };
        }
        return { key: r.rowid, type: peer.type, peer: peer, members: members };
      });
    });
  }

  /** 查会话消息（shangpin：kjzz=会话id AND sew=4交流）
   *  2026-09-05：去掉 leixing='交流' 条件——历史消息的 leixing 多为'知识'（写入时文本未选中下拉），
   *  组合条件会把大部分真实聊天漏掉；sew 用 option key 过滤（显示值/文本过滤实测不可靠） */
  var SEW_JIAOLIU_KEY = '222d8af1-022b-45d1-ab8c-3e1b78b8d479';   // 4交流 option key（HAP 实测）
  function fsjQueryMessages(convKey) {
    return MINGDAO_API_call(MINGDAO_API, {
      worksheetId: CONTENT_WS,
      pageSize: 200,
      pageIndex: 1,
      listType: 0,
      controls: ['mingcheng', 'leixing', 'sew', 'kjzz', 'fabuzhe', 'fbsj', 'ctime'],
      filters: [
        { controlId: 'kjzz', dataType: 29, spliceType: 1, filterType: 24, value: convKey },
        { controlId: 'sew', dataType: 11, spliceType: 1, filterType: 1, value: SEW_JIAOLIU_KEY }
      ]
    }).then(function (res) {
      var rows = (res.success && res.data && res.data.rows) || [];
      return rows.map(function (r) {
        var from = parseRelation(r.fabuzhe)[0] || { sid: '', name: '未知' };
        return {
          rowid: r.rowid,
          huiche: convKey,
          neirong: r.mingcheng || '',
          fasongzhe: from.sid,
          fasongzheName: from.name,
          ctime: r.fbsj || r.ctime || ''
        };
      }).sort(function (a, b) { return parseTime(a.ctime) - parseTime(b.ctime); });
    });
  }

  /** 发消息（shangpin addRow，4交流 + 组织可见 + kjzz 锚定）
   *  2026-09-05：下拉/关联写入改用 option key + valueType 2（传显示文本不会选中选项，实测）；
   *  成功后 WS 广播 chat.new 信号（body 只带会话id，不带内容） */
  var LEIXING_JIAOLIU_KEY = '5333d0ee-a459-4205-ad91-f66b056f5222';   // leixing=交流 option key
  var QUANXIAN_ZUZHI_KEY = 'c5d60028-eb38-4f18-97a8-e8b96270757e';    // quanxian=组织可见 option key
  function fsjSendMessage(convKey, text, user) {
    console.log('[发送调试] addRow 请求发出：conv=' + convKey + ' 发送者=' + user.rowid);
    var controls = [
        { controlId: 'mingcheng', value: text },
        { controlId: 'leixing', value: LEIXING_JIAOLIU_KEY, valueType: 2 },
        { controlId: 'sew', value: SEW_JIAOLIU_KEY, valueType: 2 },
        { controlId: 'quanxian', value: QUANXIAN_ZUZHI_KEY, valueType: 2 },
        { controlId: 'kjzz', value: convKey, valueType: 2 },
        { controlId: 'fabuzhe', value: user.rowid, valueType: 2 },
        { controlId: 'fbsj', value: fmtTime(new Date()) }
    ];
    // 所属商家（2026-09-06 拍板：创建必带；取不到则跳过，HAP 工作流兜底）
    var sj2 = FsjApi.getShangjiaRowid();
    if (sj2) controls.push({ controlId: 'shangjia2', value: sj2, valueType: 2 });
    return MINGDAO_API_call(MINGDAO_ADD, {
      worksheetId: CONTENT_WS,
      controls: controls
    }).then(function (res) {
      console.log('[发送调试] addRow 响应：success=' + res.success + (res.success ? ' rowid=' + String(res.data).slice(0, 8) : ' error=' + res.error_msg));
      if (!res.success) throw new Error(res.error_msg || '发送失败');
      // WS 推送信号：在线的会话参与方立即刷新（服务端纯广播，前端按会话成员过滤）
      notifyNewMessage(convKey, user.rowid);
      return {
        rowid: res.data || ('tmp-' + Date.now()),
        huiche: convKey,
        neirong: text,
        fasongzhe: user.rowid,
        fasongzheName: user.name,
        ctime: fmtTime(new Date())
      };
    });
  }

  /** 当前是否只读（调试视角禁止写真实表） */
  function isReadOnly() {
    var user = getUser();
    return !!(user && user.isDemo && config.datasource === 'fsj');
  }

  /** 找已有私聊会话（只查不建；创建延迟到首条消息发出时） */
  function fsjFindPrivate(peer) {
    var user = getUser();
    return MINGDAO_API_call(MINGDAO_API, {
      worksheetId: ORG_WS,
      pageSize: 1,
      pageIndex: 1,
      listType: 0,
      controls: ['mingcheng', 'ltlx', 'zzyh'],
      filters: [
        { controlId: 'zzyh', dataType: 29, spliceType: 1, filterType: 24, value: user.rowid },
        { controlId: 'zzyh', dataType: 29, spliceType: 1, filterType: 24, value: peer.rowid },
        { controlId: 'ltlx', dataType: 11, spliceType: 1, filterType: 1, value: '私聊' }
      ]
    }).then(function (res) {
      var rows = (res.success && res.data && res.data.rows) || [];
      return rows.length > 0 ? rows[0].rowid : null;
    });
  }

  /**
   * 确保私聊会话存在并返回会话 id（真正发消息时才调用）
   * 找不到已有会话 → 按协议创建「发起人-接收人-私聊」
   */
  function fsjEnsurePrivate(peer) {
    if (isReadOnly()) {
      return Promise.reject(new Error('调试视角只读，不能创建会话'));
    }
    return fsjFindPrivate(peer).then(function (existing) {
      if (existing) return existing;
      var user = getUser();
      var convName = (user.name || '我') + '-' + (peer.name || '对方') + '-私聊';
      return MINGDAO_API_call(MINGDAO_ADD, {
        worksheetId: ORG_WS,
        controls: [
          { controlId: 'mingcheng', value: convName },
          { controlId: 'leixing', value: '61221926-f9e6-4941-847a-5625538dc120', valueType: 2 },
          { controlId: 'ltlx', value: '私聊' },
          { controlId: 'zzyh', value: user.rowid + ',' + peer.rowid },
          { controlId: 'fabuzhe', value: user.rowid }
        ]
      }).then(function (res2) {
        if (!res2.success) throw new Error(res2.error_msg || '创建会话失败');
        return res2.data;
      });
    });
  }

  /** 建群（ltlx=群聊，mingcheng=群名，zzyh=全部成员） */
  function fsjCreateGroup(groupName, memberRowids) {
    if (isReadOnly()) {
      return Promise.reject(new Error('调试视角只读，不能建群'));
    }
    var user = getUser();
    var all = [user.rowid].concat(memberRowids.filter(function (r) { return r !== user.rowid; }));
    return MINGDAO_API_call(MINGDAO_ADD, {
      worksheetId: ORG_WS,
      controls: [
        { controlId: 'mingcheng', value: groupName },
        { controlId: 'leixing', value: '61221926-f9e6-4941-847a-5625538dc120', valueType: 2 },
        { controlId: 'ltlx', value: '群聊' },
        { controlId: 'zzyh', value: all.join(',') },
        { controlId: 'fabuzhe', value: user.rowid }
      ]
    }).then(function (res) {
      if (!res.success) throw new Error(res.error_msg || '建群失败');
      return res.data;
    });
  }

  // ==================== 通讯录 ====================

  /** 用户表联系人列表（排除自己） */
  function getChatableUsers() {
    var user = getUser();
    if (config.datasource === 'mock') {
      return Promise.resolve([
        { rowid: 'peer-yeguo', name: '椰果', avatar: '' },
        { rowid: 'peer-xiaofeng', name: '小风', avatar: '' },
        { rowid: 'peer-mengyao', name: '梦瑶', avatar: '' },
        { rowid: 'peer-xiaoyun', name: '小云', avatar: '' }
      ]);
    }
    return MINGDAO_API_call(MINGDAO_API, {
      worksheetId: USER_WS,
      pageSize: 100,
      pageIndex: 1,
      listType: 0,
      controls: ['rowid', 'nickname', 'avatar'],
      filters: []
    }).then(function (res) {
      var rows = (res.success && res.data && res.data.rows) || [];
      return rows
        .filter(function (r) { return r.rowid !== (user && user.rowid); })
        .map(function (r) {
          return {
            rowid: r.rowid,
            name: r.nickname || '用户',
            avatar: FsjApi.parseImage(r.avatar)
          };
        });
    });
  }

  /** 商家信息（mock 模式的客服入口用） */
  function getMerchantInfo() {
    var user = getUser();
    var rowid = (user && user.shangjia) || 'demo-merchant';
    return Promise.resolve({ rowid: rowid, name: '粽说风云' });
  }

  // ==================== AI 会话（本地轻量通道） ====================

  function agentMessages(user) {
    var key = agentKey(user.rowid, user.agent);
    return MockStore.queryConv(key);
  }

  function pickAgentReply(content) {
    var c = (content || '').toLowerCase();
    if (c.indexOf('新品') !== -1 || c.indexOf('商品') !== -1 || c.indexOf('买') !== -1) {
      return '最近上新的有：\n1. 手作陶瓷杯 —— 限量 20 个\n2. 赏金任务专区新玩法\n\n想看哪个的详情？';
    }
    if (c.indexOf('订单') !== -1 || c.indexOf('物流') !== -1 || c.indexOf('发货') !== -1) {
      return '我帮你查一下订单～请稍等\n你的订单已在打包中，48 小时内发出 📦';
    }
    if (c.indexOf('积分') !== -1) {
      return '当前积分规则：1 元 = 1 积分，签到、发帖、接单都能赚积分，可以在积分商城兑换好物～';
    }
    if (c.indexOf('你好') !== -1 || c.indexOf('在吗') !== -1) {
      return '你好呀！我在的，有什么可以帮你？😊';
    }
    var pool = [
      '收到！这个问题我记下了，稍后给你详细回复～',
      '好问题！简单说：社区发帖、接悬赏、攒积分都能玩起来，需要我展开讲哪一个？',
      '明白～我马上去查相关资料 😄'
    ];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function typeOut(text, onChunk) {
    return new Promise(function (resolve) {
      var i = 0;
      var step = Math.max(1, Math.ceil(text.length / 24));
      var timer = setInterval(function () {
        i += step;
        var partial = text.slice(0, i);
        if (onChunk) onChunk({ type: 'delta', delta: text.slice(i - step, i), content: partial });
        if (i >= text.length) {
          clearInterval(timer);
          if (onChunk) onChunk({ type: 'result', content: text });
          if (onChunk) onChunk({ type: 'done' });
          resolve(text);
        }
      }, 40);
    });
  }

  /**
   * AI 会话：用户消息 + AI 回复都存本地（不落 4交流 表）
   * 真实 AI 服务可用时走 AIService，否则模拟流式
   */
  function sendToAgent(content, onChunk) {
    var user = getUser();
    if (!user) return Promise.reject(new Error('未登录'));
    var key = agentKey(user.rowid, user.agent);
    MockStore.insert({
      rowid: 'tmp-u-' + Date.now(), huiche: key, leixing: '用户', neirong: content,
      fasongzhe: user.rowid, ctime: fmtTime(new Date())
    });

    var useRealAI = config.datasource === 'fsj' && window.AIService && user.isDemo !== true && user.rowid !== 'demo-user';
    var replyPromise;
    if (useRealAI) {
      replyPromise = new Promise(function (resolve) {
        var full = '';
        AIService.execute({ mode: '0', content: content, org: user.shangjia, rowid: user.rowid }, function (chunk) {
          if (chunk.type === 'result' && chunk.content) full = chunk.content;
          if (chunk.type === 'done') resolve(full);
          if (onChunk) onChunk(chunk);
        });
      });
    } else {
      replyPromise = typeOut(pickAgentReply(content), onChunk);
    }

    return replyPromise.then(function (full) {
      if (full) {
        MockStore.insert({
          rowid: 'tmp-a-' + Date.now(), huiche: key, leixing: '智能体', neirong: full,
          fasongzhe: 'agent', ctime: fmtTime(new Date())
        });
      }
      return full;
    });
  }

  // ==================== 会话聚合 ====================

  /**
   * 会话列表：AI（固定置顶）+ 真人会话（按最新消息时间倒序）
   * @returns {Promise<Array>} [{ key, type: ai|user|group|merchant, peer, last, time, unread }]
   */
  function getConversations() {
    var user = getUser();
    if (!user) return Promise.resolve([]);

    if (config.datasource === 'mock') {
      return getConversationsMock(user);
    }

    return fsjQueryConversations(user).then(function (convs) {
      // 每个会话取最新一条消息 + 未读（并发查太重，MVP：先展示会话，消息数懒加载）
      // 为了列表显示"最后一条"，拉一次我的全部交流消息（分页200）在本地分组
      return fsjQueryMessagesAll(user).then(function (allMsgs) {
        var byConv = {};
        allMsgs.forEach(function (m) {
          if (!byConv[m.huiche]) byConv[m.huiche] = [];
          byConv[m.huiche].push(m);
        });

        var result = convs.map(function (conv) {
          var list = byConv[conv.key] || [];
          var last = list.length ? list[list.length - 1] : null;
          return {
            key: conv.key,
            type: conv.type,
            peer: conv.peer,
            members: conv.members || [],
            last: last,
            time: last ? last.ctime : '',
            unread: countUnread(conv.key, list, user)
          };
        });

        // AI 会话固定置顶
        var aiKey = agentKey(user.rowid, user.agent);
        var aiList = MockStore.queryConv(aiKey);
        result.unshift({
          key: aiKey,
          type: 'ai',
          peer: { type: 'ai', name: 'AI 助手', avatar: '', rowid: user.agent || 'default' },
          last: aiList.length ? aiList[aiList.length - 1] : null,
          time: aiList.length ? aiList[aiList.length - 1].ctime : '',
          unread: countUnread(aiKey, aiList, user)
        });

        result.sort(function (a, b) {
          if (a.type === 'ai' && b.type !== 'ai') return -1;
          if (b.type === 'ai' && a.type !== 'ai') return 1;
          return parseTime(b.time) - parseTime(a.time);
        });
        return result;
      });
    });
  }

  /** 拉与我相关的全部交流消息（kjzz 命中我的会话集合），用于列表"最后一条" */
  function fsjQueryMessagesAll(user) {
    return fsjQueryConversations(user).then(function (convs) {
      if (convs.length === 0) return [];
      var promises = convs.map(function (c) { return fsjQueryMessages(c.key); });
      return Promise.all(promises).then(function (lists) {
        var all = [];
        lists.forEach(function (l) { all = all.concat(l); });
        return all;
      });
    });
  }

  function getConversationsMock(user) {
    var db = MockStore.load();
    var groups = {};
    db.messages.forEach(function (m) {
      if (!groups[m.huiche]) groups[m.huiche] = [];
      groups[m.huiche].push(m);
    });
    var convs = Object.keys(groups).map(function (key) {
      var list = groups[key].sort(function (a, b) { return parseTime(a.ctime) - parseTime(b.ctime); });
      var last = list[list.length - 1];
      var p = (db.peers || {})[key] ||
        (key.charAt(0) === 's'
          ? { type: 'merchant', name: '商家客服', avatar: '', rowid: 'demo-merchant' }
          : { type: 'user', name: '联系人', avatar: '', rowid: '' });
      return {
        key: key, type: p.type, peer: p, members: [],
        last: last, time: last.ctime, unread: countUnread(key, list, user)
      };
    });
    var aiKey = agentKey(user.rowid, user.agent);
    var aiList = MockStore.queryConv(aiKey);
    convs.unshift({
      key: aiKey, type: 'ai',
      peer: { type: 'ai', name: 'AI 助手', avatar: '', rowid: 'default' },
      last: aiList.length ? aiList[aiList.length - 1] : null,
      time: aiList.length ? aiList[aiList.length - 1].ctime : '',
      unread: countUnread(aiKey, aiList, user)
    });
    convs.sort(function (a, b) {
      if (a.type === 'ai' && b.type !== 'ai') return -1;
      if (b.type === 'ai' && a.type !== 'ai') return 1;
      return parseTime(b.time) - parseTime(a.time);
    });
    return Promise.resolve(convs);
  }

  /** 某会话的消息列表（AI 走本地，真人走协议） */
  function getConvMessages(convKey) {
    var user = getUser();
    if (!user) return Promise.resolve([]);
    if (convKey.slice(0, 2) === 'a_') {   // AI 会话 key 约定 'a_<rowid>_<agent>'；HAP rowid 也可能 a 开头（如 adb61013），必须精确匹配前缀
      return Promise.resolve(agentMessages(user));
    }
    if (config.datasource === 'mock') {
      return Promise.resolve(MockStore.queryConv(convKey));
    }
    return fsjQueryMessages(convKey);
  }

  /**
   * 发送消息（自动路由：AI 会话 → AI 通道；真人/群 → 4交流协议；mock → 本地）
   * @param {Object} conv - { key, type, peer }
   * @param {string} text
   * @returns {Promise<Object>} 落库后的消息行
   */
  function sendMessage(conv, text) {
    var user = getUser();
    if (!user) return Promise.reject(new Error('未登录'));

    if (conv.type === 'ai') {
      // AI 通道由页面流式处理（sendToAgent），这里不处理
      return Promise.reject(new Error('use sendToAgent'));
    }
    if (isReadOnly()) {
      return Promise.reject(new Error('调试视角只读，不能发送消息'));
    }
    if (config.datasource === 'mock') {
      var row = {
        rowid: 'mock-' + Date.now(), huiche: conv.key, leixing: '用户', neirong: text,
        fasongzhe: user.rowid, jieshouzhe: conv.peer.rowid, shangjia: '', shanchu: '',
        ctime: fmtTime(new Date())
      };
      MockStore.insert(row);
      scheduleMockAutoReply(conv);
      return Promise.resolve(row);
    }
    return fsjSendMessage(conv.key, text, user);
  }

  /** mock：对方延迟自动回复 */
  function scheduleMockAutoReply(conv) {
    var user = getUser();
    setTimeout(function () {
      var replies = conv.type === 'merchant'
        ? ['您好，客服小粽为您服务～', '收到！我们核实后马上给您答复 🙋', '感谢您的留言～']
        : ['好的 👌', '收到收到～', '哈哈哈可以的', '行，那就这么定了 😄'];
      MockStore.insert({
        rowid: 'mock-r-' + Date.now(), huiche: conv.key,
        leixing: conv.type === 'merchant' ? '商家' : '用户',
        neirong: replies[Math.floor(Math.random() * replies.length)],
        fasongzhe: conv.peer.rowid, jieshouzhe: user.rowid, ctime: fmtTime(new Date())
      });
      if (typeof ChatService.onPeerMessage === 'function') ChatService.onPeerMessage(conv.key);
    }, 1500 + Math.random() * 1500);
  }

  // ==================== 未读 ====================

  function readMap() {
    try { return JSON.parse(localStorage.getItem(READ_MAP_KEY) || '{}'); } catch (e) { return {}; }
  }

  function countUnread(key, list, user) {
    var lastRead = readMap()[key] || 0;
    var n = 0;
    list.forEach(function (m) {
      if (m.fasongzhe !== user.rowid && parseTime(m.ctime) > lastRead) n++;
    });
    return n;
  }

  function markRead(convKey) {
    var map = readMap();
    map[convKey] = Date.now();
    try { localStorage.setItem(READ_MAP_KEY, JSON.stringify(map)); } catch (e) { /* ignore */ }
  }

  // ==================== 轮询 ====================

  var pollTimer = null;

  function startPolling(callback) {
    stopPolling();
    pollTimer = setInterval(function () { if (callback) callback(); }, config.pollInterval);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // ==================== WS 推送（chat.new 信号，替代高频轮询）====================
  // 服务端为纯广播哑管道：信封 {type:'chat.new', from, to:'', body:{conv}, ts}
  // 鉴权边界（东城 2026-09-05 拍板）：前端按会话成员过滤；body 不带消息内容，内容收到信号后从 HAP 拉
  var bus = null;
  var pushHandlers = [];

  function getBus() {
    if (!bus && window.WsBus) {
      var user = getUser();
      bus = new WsBus({
        url: 'wss://100000whys.cn/ws',
        rowid: (user && user.rowid) || 'guest-' + Math.random().toString(36).slice(2, 8)
      });
      bus.on('chat.new', function (body) {
        pushHandlers.forEach(function (fn) {
          try { fn(body || {}); } catch (e) { console.error('[chat] push handler', e); }
        });
      });
      bus.connect();
    }
    return bus;
  }

  /** 订阅推送（message 页用）：handler(body) body={conv, from} */
  function subscribePush(fn) {
    pushHandlers.push(fn);
    getBus();   // 首次订阅时建立连接
  }

  /** 发送侧广播新消息信号 */
  function notifyNewMessage(convKey, fromRowid) {
    try {
      var b = getBus();
      if (b) b.send('chat.new', { conv: convKey, from: fromRowid || '' });
    } catch (e) { /* 推送失败不影响发送 */ }
  }

  // ==================== @ 占位解析 ====================

  /**
   * 渲染 @ 占位符（在 escapeHtml 之后调用，模式不含特殊字符）
   * @param {string} html - 已转义的正文
   * @param {Array} members - [{sid, name}] 会话成员（名字解析）
   */
  function renderMentions(html, members) {
    if (!html || html.indexOf('@_') === -1) return html;
    var map = {};
    (members || []).forEach(function (m) { map[m.sid] = m.name; });
    return html.replace(/@_([0-9a-f\-]{36})_user/g, function (_, rowid) {
      var name = map[rowid] || '成员';
      return '<span class="chat-mention">@' + escapeHtmlStr(name) + '</span>';
    }).replace(/@_([0-9a-f\-]{36})_content/g, function () {
      return '<span class="chat-mention chat-mention-quote">[引用内容]</span>';
    });
  }

  function escapeHtmlStr(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  return {
    config: config,
    getUser: getUser,
    agentKey: agentKey,
    getConversations: getConversations,
    getConvMessages: getConvMessages,
    sendMessage: sendMessage,
    sendToAgent: sendToAgent,
    fsjFindPrivate: fsjFindPrivate,
    fsjEnsurePrivate: fsjEnsurePrivate,
    fsjCreateGroup: fsjCreateGroup,
    isReadOnly: isReadOnly,
    getChatableUsers: getChatableUsers,
    getMerchantInfo: getMerchantInfo,
    markRead: markRead,
    startPolling: startPolling,
    stopPolling: stopPolling,
    subscribePush: subscribePush,
    notifyNewMessage: notifyNewMessage,
    renderMentions: renderMentions,
    clearMockConversation: function (key) { MockStore.clearConversation(key); },
    resetMock: function () { MockStore.resetDemo(); },
    isMock: function () { return config.datasource === 'mock'; },
    // 事件钩子
    onPeerMessage: null,
    onPeerResolved: null
  };
})();
