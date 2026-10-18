/**
 * 推送像素三角度到 HAP 用户表（108龙虾世界1.0 / 用户 69b0077358322d512e60bad0）
 * 字段：像素正面 xszm(6a9367903e15666e14447fb3) / 像素背面 xsbm(…fb4) / 像素侧面 xscm(…fb5)
 *
 * 用法：node tools/push-pixels-to-hap.js [输出目录]
 * 生成每成员×每角度的 editRow 请求文件（单字段单文件），然后逐条推送：
 *   curl -s -X POST https://api.mingdao.com/v2/open/worksheet/editRow \
 *     -H "Content-Type: application/json" --data-binary @请求文件
 *
 * ⚠️ 不走 hap-cli --fields-json：其对超长字段值有 glob 误处理 bug（RecursionError），
 *    且 CLAUDE.md 规定 API 写入一律用文件方式（UTF-8 / --data-binary）。
 *
 * 数据源：assets/members.json（rowid 映射）+ assets/characters/<agentId>.json
 * （pixels_xiao[0]=正面，pixels_dir.up=背面，pixels_dir.left=侧面）
 */
const fs = require('fs');
const path = require('path');

const APP_KEY = 'c156d7e78368cbc1';
const SIGN = 'NmM2NGE0ZTNlN2Y3NjU3ODY5MzMzOTk1NzBjMmMwMzNkNmE5NDU2MWZiYTg4ZWViNDk3MGE3MzU5MjcwNDU2MQ==';
const WORKSHEET_ID = '69b0077358322d512e60bad0';
const FIELDS = {
    front: '6a9367903e15666e14447fb3', // 像素正面 xszm
    up: '6a9367903e15666e14447fb4',    // 像素背面 xsbm
    left: '6a9367903e15666e14447fb5'   // 像素侧面 xscm
};

const outDir = process.argv[2] || path.join(__dirname, '.hap-payloads');
const members = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/members.json'), 'utf8'));

fs.mkdirSync(outDir, { recursive: true });
let n = 0;
for (const m of members) {
    const charFile = m.agentId.replace(/^demo-/, '');
    const char = JSON.parse(fs.readFileSync(path.join(__dirname, `../assets/characters/${charFile}.json`), 'utf8'));
    const angles = {
        front: char.pixels_xiao && char.pixels_xiao[0],
        up: char.pixels_dir && char.pixels_dir.up,
        left: char.pixels_dir && char.pixels_dir.left
    };
    for (const [key, fieldId] of Object.entries(FIELDS)) {
        const px = angles[key];
        if (!px) { console.error(`⚠ ${m.mingcheng}(${m.agentId}) 缺少 ${key} 角度，跳过`); continue; }
        const body = {
            appKey: APP_KEY,
            sign: SIGN,
            worksheetId: WORKSHEET_ID,
            rowId: m.rowid,
            triggerWorkflow: true,
            controls: [{ controlId: fieldId, value: JSON.stringify(px) }]
        };
        fs.writeFileSync(path.join(outDir, `${m.rowid}-${key}.json`), JSON.stringify(body));
        n++;
    }
}
console.log(`已生成 ${n} 个 editRow 请求文件到 ${outDir}/（每文件 = 1 成员 × 1 角度）`);
