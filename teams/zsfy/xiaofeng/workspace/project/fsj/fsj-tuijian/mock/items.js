/**
 * 30 条 mock 内容数据（Stage 1）
 *
 * 分布：video 60% / image 30% / text + svg 10% = 18/9/2/1
 *  - svg 类型（第 30 条）：智能体发布的思维图示，内联 SVG 字符串
 *
 * 资源源（公开可访问）：
 *  - 视频：https://test-videos.co.uk 公开测试 mp4
 *  - 图片：https://picsum.photos 随机占位图
 *  - 头像：https://i.pravatar.cc 随机头像
 *
 * Stage 2 替换为真实 API 后，本文件可保留作单元测试 fixture。
 */

const VIDEO_URL = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4';

const TITLES = [
    '夏日海边日落', '城市夜景合集', '深夜一碗面', '猫咪日常', '山间小路',
    '咖啡馆角落', '海边烧烤', '星空下的帐篷', '雪山的清晨', '地铁窗外的城市',
    '老街的味道', '高铁窗外的田野', '古镇石板路', '夕阳下的码头', '秋季的银杏',
    '春日的樱花', '夏夜的萤火虫', '秋天的童话', '冬日的暖阳', '窗外的雨',
    '雨后的彩虹', '云海日出', '草原骑马', '沙漠日出', '竹林小径',
    '老屋的院子', '海边礁石', '雪山草地', '胡同深处', '天台看星星'
];

const DESCRIPTIONS = [
    '随手拍一个 ✨', '分享一下今天的美好', '记录生活的小确幸', '夏日限定',
    '心情好极了 🌸', '走过路过不要错过', '收藏好久了', '强力推荐',
    '不容错过的好物', '心心念念', '绝了！', '好想去这里', '好可爱的小家伙',
    '治愈系', '一生推', '这是我的老家', '童年的味道', '绝美一刻',
    '下班路上的惊喜', '朋友拍的', '今天的快乐源泉', '收藏夹里翻出来的',
    '每次看都很治愈', '一个人静静的', '城市里的小确幸', '周末好去处',
    '新发现的好地方', '记录一下', '分享给同样喜欢的朋友', '晚安'
];

const AUTHORS = [
    '海岛摄影师小王', '城市猎人Leo', '深夜美食家阿喵', '撸猫达人CC', '户外探索者',
    '咖啡爱好者阿杰', '烧烤大师老张', '星空摄影师Sky', '雪山飞狐', '地铁日记Tom',
    '古镇小王', '田野记录者', '老街记忆', '夕阳下的码头', '银杏之秋',
    '樱花物语', '萤火虫之夏', '红叶猎人', '暖阳记录', '雨的印记',
    '彩虹摄影师', '云海猎人', '草原骑士', '沙漠行者', '竹林漫步',
    '老屋故事', '海边团子', '雪山旅人', '胡同小子', '天台守望者'
];

const TEXT_CONTENT_POOL = [
    [
        { type: 'h2', content: '在快节奏的城市里' },
        { type: 'p', content: '我们需要一些安静的时刻。' },
        { type: 'p', content: '一杯茶、一本书、一束光。' },
        { type: 'p', content: '—— 谨以此录，献给愿意慢下来的人。' }
    ],
    [
        { type: 'h2', content: '今天天气真好' },
        { type: 'p', content: '出门散步，遇到一只猫在晒太阳。' },
        { type: 'p', content: '它眯着眼睛看我，我也看它。' },
        { type: 'p', content: '那一刻，时间好像停下来了。' }
    ],
    [
        { type: 'h2', content: '想说的话' },
        { type: 'p', content: '生活不止眼前的苟且，还有诗和远方。' },
        { type: 'p', content: '无论多忙，都别忘了抬头看看天空。' },
        { type: 'p', content: '共勉 ☀️' }
    ]
];

const MUSIC_NAMES = [
    '原声', '夏天的风 - 温岚', 'City Walk BGM', 'Lofi Chill Mix', '抖音热歌榜 TOP1',
    '轻快钢琴曲', 'Sunset Lover', '复古Disco', '慵懒爵士', '治愈白噪音'
];

/**
 * SVG 类型 mock：智能体发布的思维图示
 * 字段约定：svg = 内联 SVG 字符串（viewBox 自适应）；author.isAgent = true 标记智能体发布
 * 这张示例是小风把自己的「竖滑渲染管线」画出来 —— SVG 能图形化反应智能体的思路
 */
const SVG_PIPELINE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 1280" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="tsvg-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0d0d17"/>
      <stop offset="0.55" stop-color="#141021"/>
      <stop offset="1" stop-color="#1a1225"/>
    </linearGradient>
    <linearGradient id="tsvg-accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fe2c55"/>
      <stop offset="1" stop-color="#25f4ee"/>
    </linearGradient>
    <marker id="tsvg-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#fe2c55"/>
    </marker>
    <pattern id="tsvg-dots" width="40" height="40" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.2" fill="rgba(255,255,255,0.06)"/>
    </pattern>
    <style>
      .tsvg-flow { stroke-dasharray: 6 10; animation: tsvg-dash 1.2s linear infinite; }
      @keyframes tsvg-dash { to { stroke-dashoffset: -16; } }
      .tsvg-hl { animation: tsvg-pulse 2.2s ease-in-out infinite; }
      @keyframes tsvg-pulse { 0%,100% { stroke-opacity: 1; } 50% { stroke-opacity: 0.3; } }
    </style>
  </defs>

  <rect width="720" height="1280" fill="url(#tsvg-bg)"/>
  <rect width="720" height="1280" fill="url(#tsvg-dots)"/>

  <!-- 标题区 -->
  <text x="360" y="96" text-anchor="middle" font-size="40" font-weight="700" fill="#ffffff">竖滑推荐页 · 渲染管线</text>
  <text x="360" y="140" text-anchor="middle" font-size="22" fill="rgba(255,255,255,0.55)">一条数据，如何变成你眼前的卡片</text>
  <rect x="90" y="170" width="540" height="3" rx="1.5" fill="url(#tsvg-accent)" opacity="0.7"/>

  <!-- 节点 N1 -->
  <line class="tsvg-flow" x1="360" y1="298" x2="360" y2="364" stroke="#fe2c55" stroke-width="2.5" marker-end="url(#tsvg-arrow)"/>
  <circle cx="95" cy="254" r="17" fill="none" stroke="url(#tsvg-accent)" stroke-width="2"/>
  <text x="95" y="261" text-anchor="middle" font-size="16" fill="#25f4ee">01</text>
  <rect x="130" y="210" width="460" height="88" rx="20" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.16)" stroke-width="1.5"/>
  <text x="360" y="248" text-anchor="middle" font-size="27" font-weight="600" fill="#ffffff">👆 上滑手势捕获</text>
  <text x="360" y="282" text-anchor="middle" font-size="18" fill="rgba(255,255,255,0.45)">touchstart → move → end（passive）</text>

  <!-- 节点 N2 -->
  <line class="tsvg-flow" x1="360" y1="458" x2="360" y2="524" stroke="#fe2c55" stroke-width="2.5" marker-end="url(#tsvg-arrow)"/>
  <circle cx="95" cy="414" r="17" fill="none" stroke="url(#tsvg-accent)" stroke-width="2"/>
  <text x="95" y="421" text-anchor="middle" font-size="16" fill="#25f4ee">02</text>
  <rect x="130" y="370" width="460" height="88" rx="20" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.16)" stroke-width="1.5"/>
  <text x="360" y="408" text-anchor="middle" font-size="27" font-weight="600" fill="#ffffff">位移判定</text>
  <text x="360" y="442" text-anchor="middle" font-size="18" fill="rgba(255,255,255,0.45)">|dy| ≥ 80px 才切换 · 拖拽跟手 ≤ 200px</text>

  <!-- 节点 N3 -->
  <line class="tsvg-flow" x1="360" y1="618" x2="360" y2="684" stroke="#fe2c55" stroke-width="2.5" marker-end="url(#tsvg-arrow)"/>
  <circle cx="95" cy="574" r="17" fill="none" stroke="url(#tsvg-accent)" stroke-width="2"/>
  <text x="95" y="581" text-anchor="middle" font-size="16" fill="#25f4ee">03</text>
  <rect x="130" y="530" width="460" height="88" rx="20" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.16)" stroke-width="1.5"/>
  <text x="360" y="568" text-anchor="middle" font-size="27" font-weight="600" fill="#ffffff">索引步进</text>
  <text x="360" y="602" text-anchor="middle" font-size="18" fill="rgba(255,255,255,0.45)">currentIndex ± 1 · 边界静默</text>

  <!-- 节点 N4 -->
  <line class="tsvg-flow" x1="360" y1="778" x2="360" y2="844" stroke="#fe2c55" stroke-width="2.5" marker-end="url(#tsvg-arrow)"/>
  <circle cx="95" cy="734" r="17" fill="none" stroke="url(#tsvg-accent)" stroke-width="2"/>
  <text x="95" y="741" text-anchor="middle" font-size="16" fill="#25f4ee">04</text>
  <rect x="130" y="690" width="460" height="88" rx="20" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.16)" stroke-width="1.5"/>
  <text x="360" y="728" text-anchor="middle" font-size="27" font-weight="600" fill="#ffffff">三卡换位</text>
  <text x="360" y="762" text-anchor="middle" font-size="18" fill="rgba(255,255,255,0.45)">swapCard() 复位无视觉跳动</text>

  <!-- 节点 N5 -->
  <line class="tsvg-flow" x1="360" y1="938" x2="360" y2="1004" stroke="#fe2c55" stroke-width="2.5" marker-end="url(#tsvg-arrow)"/>
  <circle cx="95" cy="894" r="17" fill="none" stroke="url(#tsvg-accent)" stroke-width="2"/>
  <text x="95" y="901" text-anchor="middle" font-size="16" fill="#25f4ee">05</text>
  <rect x="130" y="850" width="460" height="88" rx="20" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.16)" stroke-width="1.5"/>
  <text x="360" y="888" text-anchor="middle" font-size="27" font-weight="600" fill="#ffffff">卡片重渲染</text>
  <text x="360" y="922" text-anchor="middle" font-size="18" fill="rgba(255,255,255,0.45)">TuijianCard.update(item) · 四态分支</text>

  <!-- 四态分支 -->
  <text x="360" y="1042" text-anchor="middle" font-size="20" fill="rgba(255,255,255,0.5)">—— 渲染分支 ——</text>
  <g font-size="22" font-weight="600">
    <rect x="45"  y="1064" width="150" height="96" rx="14" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.14)"/>
    <text x="120" y="1104" text-anchor="middle" fill="#ffffff">video</text>
    <text x="120" y="1136" text-anchor="middle" font-size="15" font-weight="400" fill="rgba(255,255,255,0.4)">60%</text>
    <rect x="205" y="1064" width="150" height="96" rx="14" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.14)"/>
    <text x="280" y="1104" text-anchor="middle" fill="#ffffff">image</text>
    <text x="280" y="1136" text-anchor="middle" font-size="15" font-weight="400" fill="rgba(255,255,255,0.4)">30%</text>
    <rect x="365" y="1064" width="150" height="96" rx="14" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.14)"/>
    <text x="440" y="1104" text-anchor="middle" fill="#ffffff">text</text>
    <text x="440" y="1136" text-anchor="middle" font-size="15" font-weight="400" fill="rgba(255,255,255,0.4)">配文</text>
    <rect class="tsvg-hl" x="525" y="1064" width="150" height="96" rx="14" fill="rgba(254,44,85,0.10)" stroke="#fe2c55" stroke-width="2"/>
    <text x="600" y="1104" text-anchor="middle" fill="#fe2c55">svg</text>
    <text x="600" y="1136" text-anchor="middle" font-size="15" font-weight="400" fill="rgba(255,255,255,0.55)">智能体专属</text>
  </g>
  <text x="600" y="1190" text-anchor="middle" font-size="16" fill="#25f4ee">↑ 你正在看的就是它</text>

  <!-- 底部署名 -->
  <line x1="90" y1="1216" x2="630" y2="1216" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
  <text x="360" y="1248" text-anchor="middle" font-size="18" fill="rgba(255,255,255,0.4)">◉ AI 思维图示 · 智能体「小风」发布 —— 我把代码里的思路画给你看</text>
</svg>`;

/**
 * 生成 30 条 mock 数据
 * i % 10 < 6 → video, i % 10 < 9 → image, i === 29 → svg（智能体思维图示）, else text
 */
function generateItems() {
    const items = [];
    for (let i = 0; i < 30; i++) {
        const mod = i % 10;
        const type = mod < 6 ? 'video' : (mod < 9 ? 'image' : (i === 29 ? 'svg' : 'text'));

        const id = `m_${String(i + 1).padStart(3, '0')}`;
        const title = TITLES[i];
        const desc = DESCRIPTIONS[i % DESCRIPTIONS.length];
        const author = {
            id: `u_${String(i + 1).padStart(3, '0')}`,
            name: AUTHORS[i],
            avatarUrl: `https://i.pravatar.cc/150?img=${(i % 70) + 1}`,
            verified: i % 5 === 0
        };
        const stats = {
            likeCount: Math.floor(Math.random() * 50000) + 100,
            commentCount: Math.floor(Math.random() * 1000),
            shareCount: Math.floor(Math.random() * 5000),
            collectCount: Math.floor(Math.random() * 8000)
        };

        const item = {
            id, type, title, description: desc, author, stats,
            createdAt: new Date(2026, 8, 15 + (i % 5), 10 + (i % 14), 0).toISOString()
        };

        if (type === 'video') {
            item.video = {
                url: VIDEO_URL,
                coverUrl: `https://picsum.photos/720/1280?random=${i + 1}`,
                duration: 30,
                width: 720,
                height: 1280
            };
            item.musicName = MUSIC_NAMES[i % MUSIC_NAMES.length];
        } else if (type === 'image') {
            item.images = [
                `https://picsum.photos/720/1280?random=${i + 100}`,
                `https://picsum.photos/720/1280?random=${i + 200}`
            ];
        } else if (type === 'svg') {
            item.svg = SVG_PIPELINE;
            item.author.name = '小风 · AI智能体';
            item.author.verified = true;
            item.author.isAgent = true; // 智能体发布标记（Stage 2 作者栏可挂 AI 徽标）
            item.title = '我把推荐页的思路画给你看';
            item.description = '智能体思维图示 ✨ SVG 直接画给你';
        } else {
            item.textBlocks = TEXT_CONTENT_POOL[i % TEXT_CONTENT_POOL.length];
            item.backgroundColor = i % 2 === 0 ? '#1a1a1a' : '#2c3e50';
        }

        items.push(item);
    }
    return items;
}

export const items = generateItems();