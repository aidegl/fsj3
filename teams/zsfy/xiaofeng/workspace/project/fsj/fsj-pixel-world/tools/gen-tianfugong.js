/**
 * 天孚宫生成器 —— 天界区级地图（地点表 75fdbe30，土局的 fu）
 *
 * 比例尺：区 1格 = 10米 → 48×48 = 480米见方的宫城
 * 布局：宫墙环围，南天门入；云纹广场居中，主道北通土局（单元）；
 *       五局环拱（土北/木西北/水东北/火西南/金东南，各为单元，图上为其院墙投影）；
 *       西侧瑶池，东侧御花园。
 *
 * 用法：node tools/gen-tianfugong.js
 * 产出：assets/scenes/tianfugong.json（本地兜底）+ os.tmpdir()/xsdt-tianfugong.json（推 HAP 载荷）
 * 推送：curl -s -X POST https://api.mingdao.com/v2/open/worksheet/editRow \
 *        -H "Content-Type: application/json" --data-binary @载荷文件
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const S = 48;
const TIANFUGONG_ROWID = '75fdbe30-0dcb-47c8-90d2-7efd6a76df8d';
const XSDT_FIELD = '6a93b534bf128bf09c25d7af';

// 图块模板全部复用土局的美术（天界宫城同风格）
const tu = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/scenes/tu.json'), 'utf8'));
const tiles = tu.tiles;

const ground = [...Array(S)].map(() => Array(S).fill('ground'));
const decor = [...Array(S)].map(() => Array(S).fill(null));
const collision = [...Array(S)].map(() => Array(S).fill(0));
const put = (x, y, t) => { ground[y][x] = t; };
const deco = (x, y, t) => { decor[y][x] = t; };
/** 开一块矩形区域：地形铺 tile，碰撞置 0 */
function carve(x0, y0, x1, y1, tile) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { put(x, y, tile); collision[y][x] = 0; }
}
/** 围一圈墙（碰撞 1） */
function wallRing(x0, y0, x1, y1) {
    for (let x = x0; x <= x1; x++) { put(x, y0, 'wall'); collision[y0][x] = 1; put(x, y1, 'wall'); collision[y1][x] = 1; }
    for (let y = y0; y <= y1; y++) { put(x0, y, 'wall'); collision[y][x0] = 1; put(x1, y, 'wall'); collision[y][x1] = 1; }
}
const spawns = {};

// ---------- 宫墙 + 南天门 ----------
wallRing(0, 0, S - 1, S - 1);
carve(22, S - 1, 25, S - 1, 'path');            // 南天门缺口
deco(21, S - 2, 'pillar'); deco(26, S - 2, 'pillar');   // 门侧柱
spawns.nanmen = [{ x: 23, y: S - 2 }, { x: 24, y: S - 2 }];

// ---------- 主道 + 云纹广场 ----------
carve(22, 10, 25, 18, 'path');                  // 北段：广场 → 土局门
carve(22, 31, 25, S - 2, 'path');               // 南段：广场 → 南天门
carve(18, 19, 29, 30, 'carpet');                // 云纹广场
put(23, 24, 'yunwen'); put(24, 24, 'yunwen'); put(23, 25, 'yunwen'); put(24, 25, 'yunwen');
deco(18, 19, 'pillar'); deco(29, 19, 'pillar'); deco(18, 30, 'pillar'); deco(29, 30, 'pillar');
spawns.guangchang = [{ x: 23, y: 27 }, { x: 24, y: 27 }];

// ---------- 横向大道 ----------
carve(2, 23, 45, 26, 'path');

// ---------- 五局院落 ----------
function juCompound(x0, y0, x1, y1, gateX0, gateY, gateDir) {
    wallRing(x0, y0, x1, y1);
    carve(x0 + 1, y0 + 1, x1 - 1, y1 - 1, 'carpet');
    if (gateDir === 'S') { carve(gateX0, y1, gateX0 + 1, y1, 'path'); deco(gateX0 - 1, y1 - 1, 'pillar'); deco(gateX0 + 2, y1 - 1, 'pillar'); }
    if (gateDir === 'N') { carve(gateX0, y0, gateX0 + 1, y0, 'path'); deco(gateX0 - 1, y0 + 1, 'pillar'); deco(gateX0 + 2, y0 + 1, 'pillar'); }
}
juCompound(19, 2, 28, 9, 23, 9, 'S');    spawnGate('tujugate', 23, 10, 24, 10);
juCompound(3, 3, 12, 10, 7, 10, 'S');    spawnGate('mugate', 7, 11, 8, 11);
juCompound(35, 3, 44, 10, 40, 10, 'S');  spawnGate('shuigate', 40, 11, 41, 11);
juCompound(13, 37, 22, 44, 17, 37, 'N'); spawnGate('huogate', 17, 36, 18, 36);
juCompound(25, 37, 34, 44, 29, 37, 'N'); spawnGate('jingate', 29, 36, 30, 36);

function spawnGate(key, x0, y0, x1, y1) {
    spawns[key] = [{ x: x0, y: y0 }, { x: x1, y: y1 }];
}

// ---------- 连接道 ----------
carve(7, 11, 8, 22, 'path');      // 木局 → 横道
carve(40, 11, 41, 22, 'path');    // 水局 → 横道
carve(17, 31, 18, 36, 'path');    // 横道 → 火局
carve(29, 31, 30, 36, 'path');    // 横道 → 金局

// ---------- 瑶池（西） ----------
for (let y = 27; y <= 34; y++) for (let x = 4; x <= 13; x++) put(x, y, 'stone');
for (let y = 28; y <= 33; y++) for (let x = 5; x <= 12; x++) { put(x, y, 'water'); collision[y][x] = 1; }

// ---------- 御花园（东） ----------
carve(33, 27, 44, 34, 'ground');
deco(34, 28, 'tree'); deco(43, 29, 'tree'); deco(35, 33, 'flower'); deco(42, 33, 'flower');
deco(38, 28, 'stone'); deco(40, 32, 'tree');

// ---------- 道旁绿化 ----------
for (let y = 33; y <= 45; y += 4) { deco(20, y, 'tree'); deco(27, y, 'tree'); }
deco(19, 15, 'flower'); deco(28, 13, 'flower'); deco(12, 24, 'flower'); deco(35, 24, 'flower');

// ---------- 组装场景 ----------
const scene = {
    id: 'tianfugong',
    name: '天孚宫',
    size: S,
    tilesize: 48,               // 与土局一致：渲染层每格再 3x3 细分（=层比例尺）；区级语义为 1格=10米
    miaoshu: '天孚宫·天界宫城（1格=10米）：五局环拱，云纹广场居中。南天门入，主道北通土局中枢；西侧瑶池，东侧御花园。',
    tiles,
    layers: { ground, decor, collision },
    spawns
};

// ---------- 产出 ----------
const outDir = path.join(__dirname, '../assets/scenes');
fs.writeFileSync(path.join(outDir, 'tianfugong.json'), JSON.stringify(scene));
const payloadPath = path.join(process.env.TEMP || os.tmpdir(), 'xsdt-tianfugong.json');
fs.writeFileSync(payloadPath, JSON.stringify({
    appKey: 'c156d7e78368cbc1',
    sign: 'NmM2NGE0ZTNlN2Y3NjU3ODY5MzMzOTk1NzBjMmMwMzNkNmE5NDU2MWZiYTg4ZWViNDk3MGE3MzU5MjcwNDU2MQ==',
    worksheetId: '6a8ba7de496428febbecd4bb',
    rowId: TIANFUGONG_ROWID,
    triggerWorkflow: true,
    controls: [{ controlId: XSDT_FIELD, value: JSON.stringify(scene) }]
}));
console.log('场景已生成 assets/scenes/tianfugong.json（' + JSON.stringify(scene).length + ' 字节）');
console.log('HAP 载荷: ' + payloadPath);
