/**
 * cdp-debug.mjs — 用 Chrome DevTools Protocol 打开页面并收集 console/异常/最终状态
 * 用法：node test/cdp-debug.mjs [url]
 * 依赖 Node ≥ 22（原生 WebSocket）
 */

import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9333;
const URL_TO_OPEN = process.argv[2] || 'http://localhost:8765/?selftest=1';
const WAIT_MS = 15000;

const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=C:/Users/99739/AppData/Local/Temp/edge_cdp',
    'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
    // 等调试端口就绪
    let targets = null;
    for (let i = 0; i < 30; i++) {
        await sleep(500);
        try {
            const res = await fetch(`http://127.0.0.1:${PORT}/json`);
            targets = await res.json();
            break;
        } catch { }
    }
    if (!targets) { console.log('FAIL: 调试端口未就绪'); edge.kill(); return; }

    const page = targets.find(t => t.type === 'page');
    const wsUrl = page.webSocketDebuggerUrl;
    console.log('connected:', page.url);

    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const send = (method, params = {}) => new Promise(resolve => {
        const msgId = ++id;
        pending.set(msgId, resolve);
        ws.send(JSON.stringify({ id: msgId, method, params }));
    });

    ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) {
            pending.get(msg.id)(msg.result);
            pending.delete(msg.id);
        }
        if (msg.method === 'Runtime.consoleAPICalled') {
            const args = (msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' ');
            console.log(`[console.${msg.params.type}]`, args.slice(0, 300));
        }
        if (msg.method === 'Runtime.exceptionThrown') {
            const d = msg.params.exceptionDetails;
            console.log('[EXCEPTION]', (d.exception?.description || d.text || '').slice(0, 500));
        }
    };

    await new Promise(r => ws.onopen = r);
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: URL_TO_OPEN });
    console.log('navigated, waiting', WAIT_MS, 'ms ...');

    for (let waited = 0; waited < WAIT_MS; waited += 3000) {
        await sleep(3000);
        const title = await send('Runtime.evaluate', { expression: 'document.title' });
        const hasPre = await send('Runtime.evaluate', { expression: "!!document.getElementById('selftestResult')" });
        process.stdout.write(`  t=${waited + 3000}ms title="${title.result?.value}" pre=${hasPre.result?.value}\n`);
        if (hasPre.result?.value) break;
    }

    const result = await send('Runtime.evaluate', {
        expression: "document.getElementById('selftestResult')?.textContent || '(no result pre)'",
    });
    console.log('=== RESULT ===');
    console.log(result.result?.value);

    ws.close();
    edge.kill();
    process.exit(0);
}

main().catch(e => { console.error(e); edge.kill(); process.exit(1); });
