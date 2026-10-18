/**
 * cdp-perf.mjs — 全量同步性能实测
 * 打开页面 → 点击「同步数据」→ 轮询进度直到完成 → 输出耗时与最终统计
 * 用法：node test/cdp-perf.mjs
 */

import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9334;

const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=C:/Users/99739/AppData/Local/Temp/edge_cdp',
    'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
    let targets = null;
    for (let i = 0; i < 30; i++) {
        await sleep(500);
        try {
            targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
            break;
        } catch { }
    }
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    const send = (method, params = {}) => new Promise(resolve => {
        const msgId = ++id;
        pending.set(msgId, resolve);
        ws.send(JSON.stringify({ id: msgId, method, params }));
    });
    ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
    };
    await new Promise(r => ws.onopen = r);
    await send('Runtime.enable');

    console.log('打开页面…');
    await send('Page.navigate', { url: 'http://localhost:8765/' });
    await sleep(2500);

    console.log('点击「同步数据」…');
    const t0 = Date.now();
    await send('Runtime.evaluate', { expression: "document.getElementById('btnSync').click()" });

    let last = '';
    for (;;) {
        await sleep(2000);
        const r = await send('Runtime.evaluate', {
            expression: `document.getElementById('syncProgressText').textContent + ' ||| ' + document.getElementById('statusLeft').textContent`,
        });
        const txt = r.result?.value || '';
        if (txt !== last) { console.log(`  [${((Date.now() - t0) / 1000).toFixed(0)}s]`, txt.split('|||')[0].trim()); last = txt; }
        const status = txt.split('|||')[1] || '';
        if (status.includes('完成') || status.includes('失败')) {
            console.log(`  → ${status.trim()}`);
            break;
        }
        if (Date.now() - t0 > 240000) { console.log('超时（240s）'); break; }
    }
    console.log(`总耗时: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    await sleep(4000); // 等渲染稳定
    const stats = await send('Runtime.evaluate', {
        expression: "document.getElementById('stats').innerText + ' @@@ ' + document.getElementById('dbStatus').textContent",
    });
    console.log('=== 最终统计 ===');
    console.log(stats.result?.value?.replace('@@@', '\n'));

    // 帧率粗测：连续 rAF 30 帧
    const fps = await send('Runtime.evaluate', {
        expression: `(new Promise(res => {
            let n = 0; const t0 = performance.now();
            const loop = () => { n++; if (n < 30) requestAnimationFrame(loop); else res((30 / ((performance.now() - t0) / 1000)).toFixed(1)); };
            requestAnimationFrame(loop);
        }))`,
        awaitPromise: true,
    });
    console.log('空闲帧率(rAF):', fps.result?.value, 'fps');

    ws.close(); edge.kill(); process.exit(0);
}

main().catch(e => { console.error(e); edge.kill(); process.exit(1); });
