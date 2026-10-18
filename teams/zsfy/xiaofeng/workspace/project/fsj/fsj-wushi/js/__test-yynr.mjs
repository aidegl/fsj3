/**
 * 测试 yynr/引用字段的可写格式（诊断 500）
 * 用法：node js/__test-yynr.mjs
 */
const TARGET = 'd636b54b-1ea6-4232-88bd-0f6a1658c83f';   // 组织权限.md
const REF = 'c4d32eda-360a-4395-89b1-7cbcfa1cc07b';       // 私聊.md
const YYNR = '6a4727924e5ebdeabe82ebce';
const SOURCE = '6a4727924e5ebdeabe82ebcf';                // yynr 的 sourceField

async function tryUpdate(label, cid, value, valueType) {
    const c = { controlId: cid, value };
    if (valueType !== undefined) c.valueType = valueType;
    const res = await fetch('https://100000whys.cn/obj/api/record-update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowId: TARGET, controls: [c] })
    });
    const j = await res.json();
    console.log(label, '-> HTTP', res.status, '| success:', j.success, '| err:', (j.error_msg || j.error || '').slice(0, 90));
    return j.success;
}

async function readBack() {
    const res = await fetch('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            appKey: 'c156d7e78368cbc1',
            sign: 'NmM2NGE0ZTNlN2Y3NjU3ODY5MzMzOTk1NzBjMmMwMzNkNmE5NDU2MWZiYTg4ZWViNDk3MGE3MzU5MjcwNDU2MQ==',
            worksheetId: '6a03ceaa7e29abcb297cbdfc', rowId: TARGET,
            controls: [YYNR, SOURCE]
        })
    });
    const j = await res.json();
    const d = (j.data && j.data.data) || j.data;
    console.log('=== 回查 ===');
    console.log('yynr(ebce):', JSON.stringify(d[YYNR]));
    console.log('source(ebcf):', JSON.stringify(d[SOURCE]));
}

(async () => {
    console.log('--- A/B: sourceField 6a47...ebcf ---');
    await tryUpdate('A. source array+vt2', SOURCE, [REF], 2);
    await tryUpdate('B. source bare+vt2', SOURCE, REF, 2);
    console.log('--- C: yynr 6a47...ebce ---');
    await tryUpdate('C. yynr array+vt2', YYNR, [REF], 2);
    await readBack();
})();
