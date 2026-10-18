/**
 * Game World · 手机版 WS 轻客户端（重连/节流/收发 game.move）
 * 信封与像素世界/天道端一致：{type, from, to, body, ts}
 */
export function initNet({ url, agentId, onMove, onStatus }) {
    let ws = null, retry = 1000, lastSent = 0, stopped = false;
    const pending = [];

    function connect() {
        try { ws = new WebSocket(url); } catch (e) { return schedule(); }
        ws.onopen = () => {
            retry = 1000; onStatus(true);
            while (pending.length) { try { ws.send(JSON.stringify(pending.shift())); } catch (e) { break; } }
        };
        ws.onclose = () => { if (!stopped) schedule(); };
        ws.onerror = () => { try { ws.close(); } catch (e) { /* ignore */ } };
        ws.onmessage = () => { /* 手机版只发不收业务消息 */ };
    }
    function schedule() {
        if (stopped) return;
        setTimeout(connect, retry);
        retry = Math.min(retry * 2, 30000);
    }

    function sendRaw(envelope) {
        if (ws && ws.readyState === 1) {
            try { ws.send(JSON.stringify(envelope)); return true; } catch (e) { return false; }
        }
        return false;
    }

    return {
        connect,
        sendMove(body) {
            const env = { type: 'game.move', from: 'cli-' + agentId, to: '', body, ts: Date.now() };
            if (!sendRaw(env)) pending.push(env);
        },
        stop() { stopped = true; try { ws && ws.close(); } catch (e) { /* ignore */ } }
    };
}
