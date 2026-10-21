#!/usr/bin/env node
/**
 * server.mjs — fsj-pixel-world-god v2 服务
 * 静态托管本项目 + /api/data（flow/计划/命中率日志聚合）+ COOP/COEP（Godot WASM 需要）
 * 用法: node server.mjs [端口=8321]
 */
import http from 'node:http';
import { WebSocketServer } from 'ws';
import fs, { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const sseClients = new Set();
function broadcast(type, data){
  const msg = `data: ${JSON.stringify({type, data})}`;
  for(const res of sseClients){ try{ res.write(msg); }catch{ sseClients.delete(res); } }
}
// fs.watch 计划流目录 + 计划文件：一变就推（去抖150ms合并连写）
let wDebounce;
function watchPush(){ console.log("[watchPush] 触发", new Date().toTimeString().slice(0,8)); clearTimeout(wDebounce); wDebounce = setTimeout(()=>{ const d=loadData(); broadcast('update', d); wsPush('update', d); }, 150); }
try{ fs.watch('D:/Item/fsj/workspace/wuming/flows', ()=>watchPush()); console.log('[watcher] flows目录已挂'); }catch(e){ console.log('[watcher] 挂载失败:', e.message); }
try{ fs.watch('D:/Item/fsj/workspace/wuming', (e,f)=>{ if(f&&f.startsWith('plan-')) watchPush(); }); }catch{}
const PORT = Number(process.argv[2]) || 8321;
const FLOWS_DIR = 'D:/Item/fsj/workspace/wuming/flows';
const SOURCES = {
  // flow 自动取 flows 目录下最新修改的 flow-*.json，避免硬编码过期
  get flow() { try { const f = readdirSync(FLOWS_DIR).filter(n => n.startsWith('flow-') && n.endsWith('.json')).map(n => ({ n, m: statSync(FLOWS_DIR + '/' + n).mtimeMs })).sort((a, b) => b.m - a.m)[0]; return f ? FLOWS_DIR + '/' + f.n : null; } catch { return null; } },
  plan: 'D:/Item/fsj/workspace/wuming/plan-2026-10-19.json',
  hits: 'D:/Item/fsj/tmp-api/retrieval-hit-log.jsonl',
};


// ===== HAP 真数据源（#5像素视界冲刺·方案A · 2026-10-22 无名按推荐默认实装，🔵待晨审）=====
// 🟣三拍板点全部收敛为下面 3 个常量，拍板后改一行即切换：
const HAP = {
  TABLE: '6a03ceaa7e29abcb297cbdfc', // 🟣拍板1·真相源表：默认=内容元数据表，改表只动这里
  SEW: '',                           // 🟣拍板1·维度过滤：默认空=不过滤取最新；要只看某维填如 '4交流'
  INTERVAL_MIN: 5,                   // 🟣拍板2·刷新频率：默认5分钟；要实时→拍板后升级方案B(webhook)
  MAX: 30,
  cache: { ts: 0, ok: false, rows: [], err: '' },
};
function hapPull() {
  try {
    const filter = HAP.SEW
      ? ' --filter-json \'{"type":"condition","field":"sew","operator":"eq","value":"' + HAP.SEW + '"}\''
      : '';
    const cmd = 'hap worksheet record list ' + HAP.TABLE + ' --page-size ' + HAP.MAX + filter;
    const raw = execSync(cmd, { encoding: 'utf8', timeout: 120000, shell: true });
    const j = JSON.parse(raw);
    const rows = (j.data && j.data.rows) || j.rows || [];
    HAP.cache = { ts: Date.now(), ok: rows.length > 0, rows, err: rows.length ? '' : '空表(过滤或表选错?)' };
    // 🟣拍板3·离线策略：拉取失败不清空 cache——保留旧值继续渲染，前端无数据才回退 plan
  } catch (e) {
    HAP.cache.ok = false; HAP.cache.err = String((e && e.message) || e).slice(0, 120);
  }
  console.log('[hapPull]', HAP.cache.ok ? 'ok ' + HAP.cache.rows.length + '条' : 'fail: ' + HAP.cache.err);
}
try { hapPull(); } catch {}
setInterval(hapPull, HAP.INTERVAL_MIN * 60 * 1000);

function loadData() {
  const out = { flow: null, flows: [], plan: null, hits: [], hapTasks: { ...HAP.cache } };
  try { out.flow = JSON.parse(readFileSync(SOURCES.flow, 'utf8')); } catch {}
  try { out.now = JSON.parse(readFileSync(FLOWS_DIR + '/.loopstate.json', 'utf8')); } catch {}
  try { out.flows = readdirSync(FLOWS_DIR).filter(f => f.startsWith('flow-') && f.endsWith('.json')).map(f => { try { return JSON.parse(readFileSync(FLOWS_DIR + '/' + f, 'utf8')); } catch { return null; } }).filter(Boolean); } catch {}
  try { out.plan = JSON.parse(readFileSync(SOURCES.plan, 'utf8')); } catch {}
  try {
    const lines = readFileSync(SOURCES.hits, 'utf8').trim().split('\n');
    out.hits = lines.slice(-50).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse();
  } catch {}
  return out;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.pck': 'application/octet-stream', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8' };

const wsClients = new Set();
const wss = new WebSocketServer({ noServer: true });
function wsPush(type, data){
  const msg = JSON.stringify({type, data});
  for(const c of wsClients){ try{ c.send(msg); }catch{ wsClients.delete(c); } }
}
const server = http.createServer((req, res) => {
  // Godot WASM 跨线程需要 COOP/COEP；全响应都带，无害
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cache-Control','no-store');
  if (req.url === '/api/events') {
    res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-store', 'Connection':'keep-alive' });
    res.write(`data: ${JSON.stringify({type:'init', data:loadData()})}`);
    sseClients.add(res);
    req.on('close', ()=>sseClients.delete(res));
    return;
  }
  if (req.url === '/api/data') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(loadData()));
  }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (file.startsWith(ROOT) && existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    return res.end(readFileSync(file));
  }
  res.writeHead(404); res.end('404');
});
server.on('upgrade', (req, sock, head) => {
  if (req.url === '/ws') {
    wss.handleUpgrade(req, sock, head, ws => {
      wsClients.add(ws);
      ws.send(JSON.stringify({type:'init', data:loadData()}));
      ws.on('close', ()=>wsClients.delete(ws));
    });
  } else sock.destroy();
});
server.listen(PORT, () => console.log(`fsj-pixel-world-god v2: http://localhost:${PORT} + ws`));
