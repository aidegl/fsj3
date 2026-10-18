/** helper.mjs — 测试辅助：暴露分页请求 */
import { CONFIG } from '../js/config.js';

export async function postPageForTest(pageIndex) {
    const body = {
        appKey: CONFIG.APP_KEY,
        sign: CONFIG.SIGN,
        worksheetId: CONFIG.WORKSHEET_ID,
        pageSize: CONFIG.PAGE_SIZE,
        pageIndex,
        sortId: 'utime',
        sortAsc: false,
    };
    const res = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.error_code !== 1) throw new Error(`API ${json.error_code}: ${json.error_msg}`);
    return json.data;
}
