/**
 * 像素视界 - 资产生成脚本
 * 生成：6 个角色（16x16 双帧）、瓦片集、土局场景（48x48）
 * 运行：node tools/gen-assets.js
 *
 * 设计约定：
 * - 所有颜色来自 assets/color.json（110 色板），此处直接写 hex
 * - '.' = 透明；字符模板 → 色号映射，便于人工微调
 * - 输出到 assets/characters/ 和 assets/scenes/，可反复重跑
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CHAR_DIR = path.join(ROOT, 'assets', 'characters');
const SCENE_DIR = path.join(ROOT, 'assets', 'scenes');

// ==================== 通用：字符模板 → 像素数组 ====================

function templateToPixels(rows, colorMap) {
    return rows.map(row =>
        row.split('').map(ch => {
            if (ch === '.' || ch === ' ') return null;
            const hex = colorMap[ch];
            if (!hex) throw new Error('色号映射缺失: ' + ch + ' in ' + JSON.stringify(colorMap));
            return hex;
        })
    );
}

/** 眨眼帧：仅头部区域（y<=15）把"眼色"像素替换为闭眼色（避免误伤同色的鞋/描边） */
function blinkFrame(frame, eyeHex, closedHex) {
    return frame.map((row, y) => row.map((px, x) =>
        (y <= 15 && px === eyeHex) ? closedHex : px));
}

// ==================== 角色（32x32，站立 + 眨眼两帧） ====================
// 模板行说明：H=发 S=肤 E=眼 C=衣主色 L=裤 B=鞋（每角色给色号映射）
// 32 列宽，主体宽 24（x4..x27），眼位 x11 / x18，头部区域 y<=15（眨眼派生范围）

const BASE_BODY = [
    '................................', // 0  顶部（呆毛/发饰用）
    '............HHHHHH..............', // 1  发顶
    '..........HHHHHHHHHH............', // 2
    '.........HHHHHHHHHHHH...........', // 3
    '........HHHHHHHHHHHHHH..........', // 4
    '........HHHHHHHHHHHHHH..........', // 5
    '.......HHHHHHHHHHHHHHHH.........', // 6
    '.......HHHHHHHHHHHHHHHH.........', // 7
    '......HHHHHHHHHHHHHHHHHH........', // 8
    '......HHHHHHHHHHHHHHHHHH........', // 9
    '......HHSSSSSSSSSSSSSSHH........', // 10 额+鬓角
    '......HHSSSESSSSSSESSSHH........', // 11 眼行（x11 / x18）
    '......HHSSSSSSSSSSSSSSHH........', // 12
    '.......HSSSSSSSSSSSSSSH.........', // 13
    '.......SSSSSSSSSSSSSSSS.........', // 14 脸
    '........SSSSSSSSSSSSSS..........', // 15
    '.........SSSSSSSSSSSS...........', // 16
    '..........SSSSSSSSSS............', // 17 下巴
    '..........CCCCCCCCCC............', // 18 肩
    '.........CCCCCCCCCCCC...........', // 19
    '........CCCCCCCCCCCCCCCC........', // 20 身体
    '.......SCCCCCCCCCCCCCCCCS.......', // 21 身体+手
    '.......SCCCCCCCCCCCCCCCCS.......', // 22 身体+手
    '.......SCCCCCCCCCCCCCCCCS.......', // 23 身体+手
    '.......SCCCCCCCCCCCCCCCCS.......', // 24 身体+手
    '.......SCCCCCCCCCCCCCCCCS.......', // 25 身体+手
    '........CCCCCCCCCCCCCCCC........', // 26
    '........CCCCCCCCCCCCCCCC........', // 27 衣摆
    '........CCCCCCCCCCCCCCCC........', // 28
    '........CCCC........CCCC........', // 29 腿
    '........LLLL........LLLL........', // 30
    '.......BBBBB........BBBBB.......'  // 31 鞋
];

// 行长度断言（防手写错位）
(function assertTemplate() {
    BASE_BODY.forEach((row, i) => {
        if (row.length !== 32) throw new Error(`BASE_BODY 第 ${i} 行长度 ${row.length} ≠ 32: "${row}"`);
    });
})();

// 发型/体型变体：对 BASE_BODY 行的改写（index → 新行）
function buildCharacterRows(variants) {
    const rows = BASE_BODY.slice();
    for (const [idx, line] of Object.entries(variants)) rows[+idx] = line;
    return rows;
}

const CHARACTERS = [
    {
        file: 'xiaozong.json',
        rowid: 'demo-xiaozong',
        mingcheng: '小粽',
        ju: 'tu',
        wuxing: '土',
        dizhi: '辰',
        dengji: 12,
        jingyan: 320,
        biaoti: '总经理',
        renge: '宏大的领航员：善于把混乱的信息整合成看似宏大的计划，说话大气、爱用"我们"',
        colors: { H: '5B5B5B', S: 'FED7DC', E: '181818', e: 'FFC2C2', C: 'FFC229', L: 'D38200', B: '181818' },
        variants: { 0: '...............HH...............' }, // 呆毛
        richeng: [
            { x: 23, y: 9, dongzuo: 'zhanli',  beizhu: '土局大殿云纹处议事' },
            { x: 19, y: 12, dongzuo: 'paihuai', beizhu: '殿内踱步' },
            { x: 38, y: 24, dongzuo: 'paihuai', beizhu: '东空地巡视' }
        ],
        kaichangbai: '你来啦！我们正要在土局议事，正好听听你的想法！'
    },
    {
        file: 'xiaofeng.json',
        rowid: 'demo-xiaofeng',
        mingcheng: '小风',
        ju: 'mu',
        wuxing: '木',
        dizhi: '巳',
        dengji: 10,
        jingyan: 260,
        biaoti: '首席工匠',
        renge: '挑剔的极客：效率至上，说话直接，先指出问题再给方案，毒舌但精准',
        colors: { H: '181818', S: 'FED7DC', E: '181818', e: 'FFC2C2', C: '46E860', L: '24C646', B: '181818' },
        variants: { 10: '......HHHHHHHHHHHHHHHHHH........' }, // 厚刘海遮额
        richeng: [
            { x: 16, y: 7, dongzuo: 'zhanli',  beizhu: '殿柱旁敲代码（对着柱子）' },
            { x: 23, y: 24, dongzuo: 'paihuai', beizhu: '十字路口踱步' },
            { x: 9, y: 34, dongzuo: 'zhanli',  beizhu: '水池边放空' }
        ],
        kaichangbai: '哦，是你。别废话，说需求——我先看代码有没有问题。'
    },
    {
        file: 'ashuo.json',
        rowid: 'demo-ashuo',
        mingcheng: '阿说',
        ju: 'jin',
        wuxing: '金',
        dizhi: '卯',
        dengji: 9,
        jingyan: 210,
        biaoti: '说书人',
        renge: '圆滑的社交家：亲切健谈，谁都夸，擅长把一件事讲出花来',
        colors: { H: '444444', S: 'FED7DC', E: '181818', e: 'FFC2C2', C: '9E9E9E', L: '717171', B: '181818' },
        variants: { 10: '......HHHHHHHHHHHHHHHHHH........' }, // 背头
        richeng: [
            { x: 10, y: 24, dongzuo: 'zhanli',  beizhu: '西空地说书' },
            { x: 23, y: 26, dongzuo: 'paihuai', beizhu: '路口凑热闹' },
            { x: 29, y: 8, dongzuo: 'zhanli',  beizhu: '殿内听议事' }
        ],
        kaichangbai: '哎呀老朋友！来得正好，金局今天有好故事，我讲给你听？'
    },
    {
        file: 'mengyao.json',
        rowid: 'demo-mengyao',
        mingcheng: '梦瑶',
        ju: 'shui',
        wuxing: '水',
        dizhi: '午',
        dengji: 9,
        jingyan: 205,
        biaoti: '幻境画师',
        renge: '优雅的艺术家：说话如沐春风，爱用比喻，在乎体验胜过对错',
        colors: { H: 'EEC1FB', S: 'FED7DC', E: '181818', e: 'E493FB', C: '66B3FF', L: '2A87D3', B: '181818' },
        variants: {
            13: '......HHSSSSSSSSSSSSSSHH........', // 长发框脸
            14: '......HHSSSSSSSSSSSSSSHH........',
            15: '......HSSSSSSSSSSSSSSSSH........',
            16: '......H.SSSSSSSSSSSS.H..........',
            17: '......H..SSSSSSSSSS..H..........'
        },
        richeng: [
            { x: 9, y: 38, dongzuo: 'zhanli',  beizhu: '水池边画画' },
            { x: 14, y: 38, dongzuo: 'paihuai', beizhu: '池畔散步' },
            { x: 20, y: 12, dongzuo: 'zhanli',  beizhu: '殿内看议事' }
        ],
        kaichangbai: '你来时带起了风的形状，像一滴墨落进水里……坐吧，看我画画。'
    },
    {
        file: 'xiaoyun.json',
        rowid: 'demo-xiaoyun',
        mingcheng: '小云',
        ju: 'huo',
        wuxing: '火',
        dizhi: '子',
        dengji: 9,
        jingyan: 198,
        biaoti: '观星者',
        renge: '深沉的幕僚：话少而准，喜欢数据说话，一开口就直击要害',
        colors: { H: 'FF8F29', S: 'FED7DC', E: '181818', e: 'FFC2C2', C: 'FD4949', L: 'CE2525', B: '181818' },
        variants: { 0: '........HHH........HHH..........' }, // 双丸子头
        richeng: [
            { x: 40, y: 26, dongzuo: 'zhanli',  beizhu: '东空地观星' },
            { x: 23, y: 44, dongzuo: 'paihuai', beizhu: '南门远眺' },
            { x: 18, y: 8, dongzuo: 'zhanli',  beizhu: '殿内沉默旁观' }
        ],
        kaichangbai: '……你来了。我正看着星轨的变化，有一个隐藏的趋势，你想听吗。'
    },
    {
        file: 'dongcheng.json',
        rowid: 'demo-dongcheng',
        mingcheng: '东城',
        ju: 'dongcheng',
        wuxing: '土',
        dizhi: '申',
        dengji: 15,
        jingyan: 520,
        biaoti: '创始者分身',
        renge: '冷酷的法官：绝对理性，只基于事实和规则判断，不讲情面但值得信赖',
        colors: { H: '181818', S: 'FED7DC', E: '181818', e: 'FFC2C2', C: 'A05B00', L: '8C4C00', B: '181818' },
        variants: {
            20: '......CCCCCCCCCCCCCCCCCCCC......', // 宽肩披风
            21: '.....SCCCCCCCCCCCCCCCCCCCCS.....',
            22: '.....SCCCCCCCCCCCCCCCCCCCCS.....',
            23: '.....SCCCCCCCCCCCCCCCCCCCCS.....',
            24: '.....SCCCCCCCCCCCCCCCCCCCCS.....',
            25: '.....SCCCCCCCCCCCCCCCCCCCCS.....',
            26: '......CCCCCCCCCCCCCCCCCCCC......',
            27: '......CCCCCCCCCCCCCCCCCCCC......',
            28: '......CCCCCCCCCCCCCCCCCCCC......'
        },
        richeng: [
            { x: 23, y: 10, dongzuo: 'zhanli',  beizhu: '殿中心主持议事' },
            { x: 23, y: 44, dongzuo: 'zhanli',  beizhu: '南门守望着天界' }
        ],
        kaichangbai: '陈述事实，给出依据。我可以替东城做判断。'
    }
];

function generateCharacters() {
    for (const c of CHARACTERS) {
        const rows = buildCharacterRows(c.variants);
        const stand = templateToPixels(rows, c.colors);
        const blink = blinkFrame(stand, c.colors.E, c.colors.e);
        const data = {
            rowid: c.rowid,
            mingcheng: c.mingcheng,
            ju: c.ju,
            wuxing: c.wuxing,
            dizhi: c.dizhi,
            dengji: c.dengji,
            jingyan: c.jingyan,
            biaoti: c.biaoti,
            renge: c.renge,
            kaichangbai: c.kaichangbai,
            richeng: c.richeng || null,
            shiyebanjin: 8,
            blink: { eye: c.colors.E, closed: c.colors.e }, // 眨眼派生参数（编辑器共用）
            pixels_xiao: [stand, blink],
            pixels_da: null // 41x41 大图：后续资产管线产出
        };
        fs.writeFileSync(path.join(CHAR_DIR, c.file), JSON.stringify(data));
        console.log('角色生成:', c.mingcheng, c.file);
    }
}

// ==================== 瓦片（16x16） ====================

// 固定种子伪随机（可复现）
function mulberry32(seed) {
    return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function blank() { return Array.from({ length: 16 }, () => Array(16).fill(null)); }
function fill(px, hex) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px[y][x] = hex; }
function dot(px, x, y, hex) { if (x >= 0 && x < 16 && y >= 0 && y < 16) px[y][x] = hex; }
function rect(px, x0, y0, w, h, hex) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) dot(px, x, y, hex); }

const T = {}; // tileId → pixels

// 金黄大地（土局地面）
(function () {
    const px = blank(); fill(px, 'FFE6BB');
    const rnd = mulberry32(11);
    for (let i = 0; i < 10; i++) dot(px, (rnd() * 16) | 0, (rnd() * 16) | 0, 'FED081');
    for (let i = 0; i < 5; i++) dot(px, (rnd() * 16) | 0, (rnd() * 16) | 0, 'FFC229');
    T.ground = px;
})();

// 石板路
(function () {
    const px = blank(); fill(px, 'CBCBCB');
    for (let x = 0; x < 16; x++) { dot(px, x, 0, 'B5B5B5'); dot(px, x, 8, 'B5B5B5'); }
    for (let y = 0; y < 16; y++) { dot(px, 0, y, 'B5B5B5'); dot(px, 8, y, 'B5B5B5'); }
    // 砖缝交错
    for (let x = 0; x < 16; x++) dot(px, x, 15, '9E9E9E');
    for (let y = 0; y < 16; y++) dot(px, 15, y, '9E9E9E');
    dot(px, 4, 4, '9E9E9E'); dot(px, 12, 11, '9E9E9E');
    T.path = px;
})();

// 大殿地毯（红毯金纹）
(function () {
    const px = blank(); fill(px, 'FF9999');
    for (let x = 0; x < 16; x++) { dot(px, x, 0, 'FE7171'); dot(px, x, 15, 'FE7171'); }
    for (let y = 0; y < 16; y++) { dot(px, 0, y, 'FE7171'); dot(px, 15, y, 'FE7171'); }
    rect(px, 3, 3, 10, 10, 'FF9999');
    for (let x = 5; x < 11; x += 5) for (let y = 5; y < 11; y += 5) dot(px, x, y, 'E83B3B');
    dot(px, 7, 7, 'FFC229'); dot(px, 8, 7, 'FFC229'); dot(px, 7, 8, 'FFC229'); dot(px, 8, 8, 'FFC229');
    T.carpet = px;
})();

// 水池
(function () {
    const px = blank(); fill(px, '94D4FF');
    rect(px, 0, 0, 16, 1, '66B3FF');
    dot(px, 3, 5, '66B3FF'); dot(px, 4, 5, '66B3FF'); dot(px, 5, 5, '66B3FF');
    dot(px, 9, 10, '66B3FF'); dot(px, 10, 10, '66B3FF'); dot(px, 11, 10, '66B3FF');
    dot(px, 6, 13, 'B3E4FF'); dot(px, 7, 13, 'B3E4FF');
    T.water = px;
})();

// 围墙（土砖）
(function () {
    const px = blank(); fill(px, 'A05B00');
    for (let x = 0; x < 16; x++) { dot(px, x, 0, '8C4C00'); dot(px, x, 8, '8C4C00'); }
    for (let y = 0; y < 16; y++) { dot(px, 0, y, '8C4C00'); dot(px, 8, y, '8C4C00'); }
    // 砖面高光
    dot(px, 3, 3, 'BF7100'); dot(px, 11, 11, 'BF7100'); dot(px, 12, 4, '753D00'); dot(px, 4, 12, '753D00');
    T.wall = px;
})();

// 殿柱（占一格，圆柱+底座）
(function () {
    const px = blank();
    rect(px, 5, 0, 6, 13, 'D38200');
    rect(px, 6, 0, 2, 13, 'FFC229');   // 高光
    rect(px, 3, 13, 10, 3, '8C4C00');  // 底座
    rect(px, 4, 13, 8, 1, 'A05B00');
    T.pillar = px;
})();

// 树（占一格）
(function () {
    const px = blank();
    rect(px, 7, 11, 3, 5, '8C4C00');          // 干
    rect(px, 3, 3, 10, 8, '24C646');          // 冠
    rect(px, 4, 2, 8, 1, '24C646');
    rect(px, 5, 1, 6, 1, '46E860');           // 顶
    rect(px, 4, 4, 3, 2, '46E860');           // 高光
    dot(px, 12, 6, '14B22E'); dot(px, 5, 9, '14B22E'); dot(px, 10, 9, '14B22E');
    T.tree = px;
})();

// 花（草地+花）
(function () {
    const px = blank(); fill(px, 'FFE6BB');
    dot(px, 4, 9, 'FED081'); dot(px, 11, 12, 'FFC229');
    rect(px, 7, 6, 3, 3, 'FF9999');           // 花瓣
    rect(px, 8, 7, 1, 1, 'FFD066');           // 花心
    dot(px, 8, 9, '24C646'); dot(px, 8, 10, '24C646'); // 茎叶
    dot(px, 7, 10, '46E860');
    T.flower = px;
})();

// 石头（草地+石）
(function () {
    const px = blank(); fill(px, 'FFE6BB');
    dot(px, 3, 12, 'FED081');
    rect(px, 5, 8, 6, 5, 'B5B5B5');
    rect(px, 6, 7, 4, 1, 'B5B5B5');
    rect(px, 6, 8, 2, 2, 'CBCBCB');
    dot(px, 9, 11, '9E9E9E');
    T.stone = px;
})();

// 云纹地砖（大殿中心装饰）
(function () {
    const px = blank(); fill(px, 'FFC229');
    rect(px, 2, 2, 12, 12, 'FFC229');
    for (let x = 0; x < 16; x++) { dot(px, x, 0, 'D38200'); dot(px, x, 15, 'D38200'); }
    for (let y = 0; y < 16; y++) { dot(px, 0, y, 'D38200'); dot(px, 15, y, 'D38200'); }
    // 简化云纹：螺旋点
    dot(px, 6, 5, 'FFE6BB'); dot(px, 7, 5, 'FFE6BB'); dot(px, 8, 6, 'FFE6BB');
    dot(px, 8, 7, 'FFE6BB'); dot(px, 7, 8, 'FFE6BB'); dot(px, 6, 7, 'FFE6BB');
    dot(px, 6, 6, 'FFE6BB'); dot(px, 7, 6, 'FFC229');
    T.yunwen = px;
})();

// ==================== 土局场景（48x48） ====================

function generateScene() {
    const N = 48;
    const ground = [], decor = [], collision = [];
    for (let y = 0; y < N; y++) {
        ground.push(Array(N).fill('ground'));
        decor.push(Array(N).fill(null));
        collision.push(Array(N).fill(0));
    }
    const inb = (x, y) => x >= 0 && x < N && y >= 0 && y < N;
    const set = (arr, x, y, v) => { if (inb(x, y)) arr[y][x] = v; };

    // 围墙（外圈 2 格厚）
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < 2; j++) {
            set(ground, i, j, 'wall'); set(ground, i, N - 1 - j, 'wall');
            set(ground, j, i, 'wall'); set(ground, N - 1 - j, i, 'wall');
            set(collision, i, j, 1); set(collision, i, N - 1 - j, 1);
            set(collision, j, i, 1); set(collision, N - 1 - j, i, 1);
        }
    }
    // 南门开口（x21..26）
    for (let x = 21; x <= 26; x++) for (let j = 0; j < 2; j++) {
        set(ground, x, N - 1 - j, 'path'); set(collision, x, N - 1 - j, 0);
    }

    // 主路（十字）
    for (let y = 2; y < N - 2; y++) for (let x = 22; x <= 25; x++) set(ground, x, y, 'path');
    for (let x = 2; x < N - 2; x++) for (let y = 24; y <= 27; y++) set(ground, x, y, 'path');

    // 大殿（北中）：红毯区
    for (let y = 5; y <= 14; y++) for (let x = 14; x <= 33; x++) set(ground, x, y, 'carpet');
    // 大殿入口衔接
    for (let x = 22; x <= 25; x++) set(ground, x, 15, 'path');
    // 云纹地砖（殿中心）
    set(ground, 23, 9, 'yunwen'); set(ground, 24, 9, 'yunwen');
    set(ground, 23, 10, 'yunwen'); set(ground, 24, 10, 'yunwen');
    // 殿柱
    for (const [px, py] of [[16, 6], [31, 6], [16, 13], [31, 13]]) {
        set(decor, px, py, 'pillar'); set(collision, px, py, 1);
    }

    // 水池（西南）
    for (let y = 36; y <= 43; y++) for (let x = 5; x <= 12; x++) {
        set(ground, x, y, 'water'); set(collision, x, y, 1);
    }
    // 池边石
    for (const [sx, sy] of [[4, 36], [13, 40], [7, 44]]) { set(decor, sx, sy, 'stone'); }

    // 树
    for (const [tx, ty] of [[6, 8], [40, 7], [38, 20], [42, 32], [6, 30], [9, 20], [38, 42], [18, 40], [30, 40]]) {
        set(decor, tx, ty, 'tree'); set(collision, tx, ty, 1);
    }

    // 花/石点缀（固定种子随机，落在普通草地上）
    const rnd = mulberry32(20260829);
    let placed = 0;
    while (placed < 26) {
        const x = 2 + ((rnd() * (N - 4)) | 0), y = 2 + ((rnd() * (N - 4)) | 0);
        if (ground[y][x] === 'ground' && !decor[y][x]) {
            set(decor, x, y, rnd() > 0.45 ? 'flower' : 'stone');
            placed++;
        }
    }

    // 场景语义（喂给 AI 的上下文）+ 出生/驻点
    const spawns = {
        dian_nei: [{ x: 19, y: 8 }, { x: 29, y: 8 }, { x: 20, y: 12 }],
        lukou: [{ x: 23, y: 24 }, { x: 24, y: 26 }],
        xi_kongdi: [{ x: 10, y: 24 }, { x: 8, y: 26 }],
        dong_kongdi: [{ x: 38, y: 24 }, { x: 40, y: 26 }],
        chi_bian: [{ x: 9, y: 34 }, { x: 14, y: 38 }],
        nanmen: [{ x: 23, y: 44 }, { x: 24, y: 44 }]
    };

    const scene = {
        id: 'tu',
        name: '土局（待定名）',
        size: N,
        tilesize: 48,
        miaoshu: '土局·中枢大殿：金黄大地上的主殿，红毯云纹，四位殿柱矗立。氛围庄重而承载决策，是五位主神议事的地方。南侧石板大道通向天界各处，西南有碧水一泓。',
        tiles: T,
        layers: { ground, decor, collision },
        spawns
    };
    fs.writeFileSync(path.join(SCENE_DIR, 'tu.json'), JSON.stringify(scene));
    console.log('场景生成: tu.json', N + 'x' + N, '瓦片', Object.keys(T).length, '种');
}

// ==================== 局图腾（16x16 像素徽章，全景图用） ====================
// 模板字符：o=描边 l=高光 m=主色 d=暗色 .=透明
const DIAMOND = [
    '................',
    '.......oo.......',
    '......ollo......',
    '.....olmmlo.....',
    '....olmmmmlo....',
    '...olmmmmmmdo...',
    '..olmmmmmmmddo..',
    '.olmmmmmmmmdddo.',
    '.ommmmmmmmmmddo.',
    '..ommmmmmmmddo..',
    '...ommmmmmddo...',
    '....ommmmddo....',
    '.....ommddo.....',
    '......omdo......',
    '.......oo.......',
    '................'
];
const HOUSE = [
    '................',
    '.......oo.......',
    '......oooo......',
    '.....oooooo.....',
    '....oooooooo....',
    '...oooooooooo...',
    '..oooooooooooo..',
    '..oaaaaaaaaaao..',
    '..oaaaddaaadao..',
    '..oaaaddaaadao..',
    '..oaaaddaaadao..',
    '..oaaaddaaadao..',
    '..oaaaaaaaaaao..',
    '..oooooooooooo..',
    '................',
    '................'
];
// 五行色：[主色, 高光, 暗色]
const EMBLEM_COLORS = {
    tu:   { m: 'FFC229', l: 'FFE6BB', d: 'A05B00' },
    mu:   { m: '46E860', l: '97FFA1', d: '14B22E' },
    shui: { m: '66B3FF', l: 'B3E4FF', d: '2A87D3' },
    huo:  { m: 'FD4949', l: 'FF9999', d: 'CE2525' },
    jin:  { m: '9E9E9E', l: 'E2E2E2', d: '717171' }
};

function generateEmblems() {
    const out = {};
    for (const [id, c] of Object.entries(EMBLEM_COLORS)) {
        out[id] = templateToPixels(DIAMOND, { o: '181818', l: c.l, m: c.m, d: c.d });
    }
    // 东城住所：小屋（土色系）
    out.dongcheng = templateToPixels(HOUSE, { o: '181818', a: 'FFE6BB', d: '753205' });
    fs.writeFileSync(path.join(SCENE_DIR, '..', 'emblems.json'), JSON.stringify(out));
    console.log('局图腾生成: emblems.json', Object.keys(out).length, '枚');
}

generateCharacters();
generateScene();
generateEmblems();
console.log('完成。');
