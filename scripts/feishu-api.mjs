#!/usr/bin/env node
/**
 * feishu-api.mjs — 飞书 API 安全调用器（兜底脚本）
 * ============================================================
 * 为什么存在：内联中文/emoji 过 Windows bash 必乱码（2026-10-18 三次实证）。
 * 本脚本强制「请求体走文件（UTF-8）」+ 令牌自动刷新，是 MCP 覆盖不到时的安全通道。
 *
 * 用法: node feishu-api.mjs <METHOD> <path> <body.json>
 * 例:   node feishu-api.mjs POST /open-apis/docx/v1/documents/xxx/blocks/xxx/children body.json
 *       node feishu-api.mjs GET  /open-apis/wiki/v2/spaces -
 * 令牌: 自动读 .claude.json 里 feishu MCP 凭证，过期自动刷新
 */
import fs from 'node:fs';
const [, , METHOD = 'GET', PATH = '/', BODYFILE] = process.argv;
const cfg = JSON.parse(fs.readFileSync('C:/Users/99739/.claude.json', 'utf8'));
const fargs = (cfg.mcpServers.feishu || {}).args || [];
const APP_ID = fargs[fargs.indexOf('-a') + 1];
const APP_SECRET = fargs[fargs.indexOf('-s') + 1];
const TF = 'D:/Item/fsj/tmp-api/feishu-token.txt';
let TOKEN = fs.existsSync(TF) ? fs.readFileSync(TF, 'utf8').trim() : '';

async function refreshToken() {
  const r = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error('刷新令牌失败: ' + JSON.stringify(j).slice(0, 120));
  TOKEN = j.tenant_access_token;
  fs.writeFileSync(TF, TOKEN);
  console.error('↻ 令牌已刷新');
}
async function call() {
  const headers = { Authorization: 'Bearer ' + TOKEN, 'User-Agent': 'fsj-feishu-api/1.0' };
  let payload;
  if (BODYFILE && BODYFILE !== '-') {
    payload = fs.readFileSync(BODYFILE);           // UTF-8 文件体：中文/emoji 安全
    headers['Content-Type'] = 'application/json; charset=utf-8';
    headers['Content-Length'] = payload.length;
  }
  const r = await fetch('https://open.feishu.cn' + PATH, { method: METHOD, headers, body: payload });
  return { status: r.status, j: await r.json().catch(() => null) };
}
let res = await call();
if (res.j && (res.j.code === 99991663 || res.status === 401)) { await refreshToken(); res = await call(); }
console.log(JSON.stringify(res.j ?? { status: res.status }, null, 2));
if (res.j && res.j.code !== 0) process.exit(1);
