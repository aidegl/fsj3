/**
 * Game World · 主流程
 * 启动：Canvas 地图 → 角色 → WS → 必读段面板 → 主循环
 */
import * as API from './api.js';
import { buildMap, WORLD_W, WORLD_H } from './map.js';
import * as Ch from './character.js';
import { initNet } from './net.js';
import { escapeHtml } from './ui.js';

const AGENTS = [
    { rowid: '2ab12bea-8db1-4b78-a955-3505d547fba7', name: '林东城' },
    { rowid: '1024efc4-27fd-4522-bf3c-e4ebc998393c', name: '小粽' },
    { rowid: 'a8515e76-7b02-4baf-bedd-3ff011b1a9e5', name: '小风' },
    { rowid: 'ceaa79bf-f4d8-45ae-8e1e-a1c9a3ac1b7d', name: '阿说' },
    { rowid: '5b21306f-3be6-49fa-a6f6-2be311203c02', name: '梦瑶' },
    { rowid: '22ff1c1c-f1d0-4275-980b-803835504a90', name: '小云' },
    { rowid: '79e763bf-2a45-4377-9d1e-3fdf1d65da99', name: '椰果' },
    { rowid: 'a4501620-fff9-4780-a77c-c810a7f8d44e', name: '无名' }
];
const WS_URL = 'wss://100000whys.cn/ws';

const $ = (id) => document.getElementById(id);
const keys = new Set();
let net = null;
let currentAgent = AGENTS.find(a => a.name === '无名');

// ===== 主循环 =====
function loop() {
    const moved = Ch.handleInput(keys);
    if (moved && net) net.sendMove(Ch.player.x, Ch.player.y, Ch.player.facing, Ch.player.char, Ch.player.color, Ch.player.name);
    const ctx = $('world').getContext('2d');
    ctx.clearRect(0, 0, WORLD_W, WORLD_H);
    ctx.drawImage(mapCanvas, 0, 0);
    for (const r of Ch.remotes.values()) Ch.drawAgent(ctx, { x: r.x, y: r.y, name: r.name, char: r.char, color: r.color, facing: r.facing }, false);
    Ch.drawAgent(ctx, Ch.player, true);
    Ch.pruneRemotes();
    requestAnimationFrame(loop);
}

let mapCanvas = null;

// ===== WS 状态徽标 =====
function startBadge(netObj) {
    setInterval(() => {
        const el = $('wsBadge');
        const open = netObj.bus.ws && netObj.bus.ws.readyState === 1;
        el.textContent = open ? '● 实时' : '● WS 断开';
        el.className = 'ws-badge ' + (open ? 'on' : 'off');
    }, 1000);
}

// ===== 必读段 =====
async function loadMustread(agentRowid) {
    const list = $('mustread-list');
    list.innerHTML = '<div class="mr-loading">加载必读段…</div>';
    try {
        const items = await API.fetchMustread(agentRowid);
        if (!items.length) { list.innerHTML = '<div class="mr-empty">必读段为空（去 wushi 页面「权重必读」置入）</div>'; return; }
        list.innerHTML = items.map(it => `
            <div class="mr-item">
                <div class="t">${escapeHtml(it.mingcheng || '(未命名)')}</div>
                ${it.shuoming ? `<div class="s">${escapeHtml(it.shuoming)}</div>` : ''}
                <div class="r">${escapeHtml(it.rowid)}</div>
            </div>`).join('');
    } catch (e) {
        list.innerHTML = '<div class="mr-empty">必读段加载失败：' + escapeHtml(e.message) + '</div>';
    }
}

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===== 启动 =====
function init() {
    const sel = $('agentSelect');
    AGENTS.forEach((a, i) => {
        const opt = document.createElement('option');
        opt.value = a.rowid; opt.textContent = a.name;
        if (a.name === '无名') opt.selected = true;
        sel.appendChild(opt);
    });
    currentAgent = AGENTS.find(a => a.name === '无名');
    sel.onchange = () => {
        currentAgent = AGENTS.find(a => a.rowid === sel.value) || AGENTS[0];
        Ch.initPlayer(currentAgent.rowid, currentAgent.name, currentAgent.name.charAt(0), '#1677ff');
        loadMustread(currentAgent.rowid);
    };

    const canvas = $('world');
    mapCanvas = buildMap();
    Ch.initPlayer(currentAgent.rowid, currentAgent.name, currentAgent.name.charAt(0), '#1677ff');

    net = initNet({
        url: WS_URL, rowid: currentAgent.rowid,
        onRemoteMove: (body) => {
            Ch.remotes.set(body.agentId, {
                x: body.x, y: body.y, name: body.name || body.agentId,
                char: body.char || '?', color: body.color || '#1677ff',
                facing: body.facing || 'down', lastSeen: Date.now()
            });
        }
    });
    startBadge(net);

    window.addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
            keys.add(e.code); e.preventDefault();
        }
    });
    window.addEventListener('keyup', (e) => keys.delete(e.code));
    window.addEventListener('blur', () => keys.clear());

    loadMustread(currentAgent.rowid);
    loop();
}

init();
