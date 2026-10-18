/**
 * AI 对话适配器 - 接口隔离层
 *
 * 接口约定（最终后端方案未定，林东城后续告知后新增实现替换即可，页面零改动）：
 *   AIAdapter.chat(req, onChunk)
 *     req = {
 *       agentId, agentName, dizhi, renge,          // 角色人格
 *       content,                                    // 用户输入
 *       weizhi: { changjing, changjing_miaoshu, tx, ty },  // 位置上下文（场景即心智）
 *       lishi: [{ role: 'user'|'agent', content }]  // 最近 N 条历史
 *     }
 *     onChunk({ type: 'delta'|'result'|'done', content })
 *
 * 当前实现：MockAIAdapter —— 示例数据 + 模拟流式（按地支人格 × 场景组织回复）
 */

// 各角色示例回复（关键词命中 → 专属内容；兜底 → 场景感知模板）
const MOCK_REPLIES = {
    'demo-xiaozong': {
        greet: '你来啦！我们正要在土局议事，正好听听你的想法！',
        rules: [
            { kw: ['像素视界', '这个项目', '世界'], reply: '像素视界是我们最重要的一步棋——把 AI 变成看得见、摸得着的伙伴。你看到的一切只是天界的第一块拼图，后面还有人界和地界。' },
            { kw: ['你是谁', '介绍'], reply: '我是小粽，孚世界的总经理。五局的事都归我统筹——有什么想推动的，跟我说，我们马上安排！' },
            { kw: ['你好', 'hi', '在吗'], reply: '在的在的！土局今天议事的内容很关键，你要不要旁听？' }
        ],
        fallback: '嗯，这个问题我们从大局看——{changjing}这里正合适谈这个。我的想法是先定方向，再拆步骤。你想先聊哪一段？'
    },
    'demo-xiaofeng': {
        greet: '哦，是你。别废话，说需求——我先看代码有没有问题。',
        rules: [
            { kw: ['像素', '渲染', 'canvas'], reply: '渲染这块我熟：禁抗锯齿、整数倍缩放、静态层离屏缓存，一帧就一次 drawImage 加六个精灵，60fps 稳的。有 bug 拿数据来。' },
            { kw: ['你是谁', '介绍'], reply: '小风，木局主神，首席工匠。效率至上——你要是来说废话的，我建议先想清楚再来。' },
            { kw: ['你好', '在吗'], reply: '在。说事。' }
        ],
        fallback: '（停下手里的事）我看了下你这个问题的结构——核心是{tx}行{ty}列那个位置的事。效率起见，直接说结论：可以做，先做最小验证。'
    },
    'demo-ashuo': {
        greet: '哎呀老朋友！来得正好，金局今天有好故事，我讲给你听？',
        rules: [
            { kw: ['故事', '讲'], reply: '那要从天界初开说起……五局未分之时，混沌里只有一缕金色。要说这故事精彩在哪——每一位主神入局时，都带了一件了不得的宝物！' },
            { kw: ['你是谁', '介绍'], reply: '我？阿说呀！金局说书人，天界上下没有我不认识的人，没有我不会讲的故事！' },
            { kw: ['你好', '在吗'], reply: '在呢在呢！你今天气色不错，来来来，坐近点说！' }
        ],
        fallback: '说到这个我可就不困了！在{changjing}这地方聊这个话题，讲究一个天时地利——你先说说你的想法，我帮你把它讲成一段好故事。'
    },
    'demo-mengyao': {
        greet: '你来时带起了风的形状，像一滴墨落进水里……坐吧，看我画画。',
        rules: [
            { kw: ['画', '水'], reply: '水局的颜色要流动才有生命——你看这池子，蓝到深处是静，静到极处反而动。画画和做人一样，留白比填满重要。' },
            { kw: ['你是谁', '介绍'], reply: '我是梦瑶，水局主神。比起对错，我更在乎一件事美不美——体验是灵魂的样子。' },
            { kw: ['你好', '在吗'], reply: '在的，我听见了你脚步声的节奏……今天心情不错吧？' }
        ],
        fallback: '这个问题像一枚投进湖面的石子——涟漪会告诉你答案。在{changjing}，我想到的是：重要的不是答案的形状，而是你问它时的心情。'
    },
    'demo-xiaoyun': {
        greet: '……你来了。我正看着星轨的变化，有一个隐藏的趋势，你想听吗。',
        rules: [
            { kw: ['趋势', '数据', '星'], reply: '过去七天，数据在三条线上同时抬头——这不是巧合，是结构性的信号。保持静默观察，第四天会给出确认。' },
            { kw: ['你是谁', '介绍'], reply: '小云。火局主神，观星者。数据不会说谎，人会说——所以我更喜欢星轨。' },
            { kw: ['你好', '在吗'], reply: '……在。说吧，我听着。' }
        ],
        fallback: '基于深层逻辑分析……你说的这件事，表面是{tx}格{ty}列的坐标问题，底层是时序问题。数据显示隐藏的趋势是：先等一个确认信号。'
    },
    'demo-dongcheng': {
        greet: '陈述事实，给出依据。我可以替东城做判断。',
        rules: [
            { kw: ['东城', '林'], reply: '东城是我本体。他不在时，我基于他的判断框架行事——事实、规则、优先级。情绪不属于决策变量。' },
            { kw: ['你是谁', '介绍'], reply: '东城，创始者分身。天界的秩序由我维护，规则之内，效率优先。' },
            { kw: ['你好', '在吗'], reply: '在。直接说事项。' }
        ],
        fallback: '数据不支持模糊表述。你的问题拆解为三个可判定项，其中两项成立。结论：建议执行，风险可控。'
    }
};

function now() { return new Date(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** 组装 mock 回复：问候/关键词/场景兜底 三级 */
function buildReply(req) {
    const conf = MOCK_REPLIES[req.agentId] || MOCK_REPLIES['demo-xiaozong'];
    const content = (req.content || '').toLowerCase();

    // 无历史的首句 → 开场白
    if (!req.lishi || req.lishi.length === 0) return conf.greet;

    for (const rule of conf.rules) {
        if (rule.kw.some(k => content.includes(k))) return rule.reply;
    }
    // 场景感知兜底：把位置上下文织进回复（验证"场景即心智"数据流）
    const wz = req.weizhi || {};
    return (conf.fallback || '我在{changjing}。')
        .replace('{changjing}', wz.changjing_miaoshu ? (wz.changjing_miaoshu.split('：')[0]) : '此地')
        .replace('{tx}', wz.tx !== undefined ? wz.tx : '?')
        .replace('{ty}', wz.ty !== undefined ? wz.ty : '?');
}

/** 模拟流式：40ms/批 逐字输出 */
async function typeOut(text, onChunk) {
    let acc = '';
    const step = Math.max(1, Math.ceil(text.length / 30));
    for (let i = 0; i < text.length; i += step) {
        await sleep(45);
        acc = text.slice(0, i + step);
        onChunk({ type: 'delta', delta: text.slice(i, i + step), content: acc });
    }
    onChunk({ type: 'result', content: text });
    onChunk({ type: 'done' });
}

/**
 * Mock 实现 —— 演示用；未来真实实现保持同一 chat() 签名
 */
export const MockAIAdapter = {
    name: 'mock',
    async chat(req, onChunk) {
        await sleep(350 + Math.random() * 350); // 思考延迟
        const reply = buildReply(req);
        await typeOut(reply, onChunk);
    }
};

/** 当前使用的适配器（替换真实后端时只改这一行） */
let current = MockAIAdapter;
export const AIAdapter = {
    get name() { return current.name; },
    chat(req, onChunk) { return current.chat(req, onChunk); },
    use(adapter) { current = adapter; }
};

export { now };
