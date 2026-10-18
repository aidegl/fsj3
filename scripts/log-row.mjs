#!/usr/bin/env node
/**
 * log-row.mjs — 流水即时直传（一条命令上云，无缓冲）
 *
 * 用法：node scripts/log-row.mjs <sew> <标题> [详情]
 * 行为：找/建当日小时节点（年→月→日→小时自动建链）→ addRow → 回读确认 → 输出 rowid
 * 失败：打印错误即止，零重试零留存——漏的/失败的靠复盘 skill / agent 复盘补
 * （2026-09-21 老板拍板：废除 buffer 攒批层，运输免费无需攒批）
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WS = '6a03ceaa7e29abcb297cbdfc';
const ME = 'a4501620-fff9-4780-a77c-c810a7f8d44e';      // 无名 fabuzhe（成员改自己的）
const SJ = 'f009cda3-cc49-400d-82cd-cbe79ee8892f';       // shangjia2
// 时间记事链根：⚠️ 占位——无名的「信息库→时间记事」链建成后改此常量
const TIME_ROOT = 'ddf79205-48a1-4af0-9b5d-d115bc25fe8e';
const PROXY = 'https://100000whys.cn/mingdao';

async function post(url, input) {
  const r = await fetch(PROXY, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, input }),
  });
  return await r.json();
}
const pad = n => String(n).padStart(2, '0');

async function addRow(controls) {
  const r = await post('https://api.mingdao.com/v2/open/worksheet/addRow', {
    worksheetId: WS, triggerWorkflow: true, getSystemControl: 'false', controls,
  });
  if (!r.success) throw new Error('addRow 失败: ' + JSON.stringify(r).slice(0, 150));
  return r.data;
}
async function kids(fu) {
  const r = await post('https://api.mingdao.com/v2/open/worksheet/getFilterRows', {
    worksheetId: WS, pageSize: 50, pageIndex: 1, listType: 0,
    controls: ['rowid', 'mingcheng'],
    filters: [{ controlId: 'fu', dataType: 29, spliceType: 1, filterType: 24, value: fu }],
  });
  return r.data?.rows ?? [];
}
async function findOrCreate(parent, name) {
  const hit = (await kids(parent)).find(r => r.mingcheng === name);
  if (hit) return hit.rowid;
  return await addRow([
    { controlId: 'mingcheng', value: name },
    { controlId: 'leixing', value: '知识' },
    { controlId: 'sew', value: '9信息', valueType: 2 },
    { controlId: 'fu', value: parent, valueType: 2 },
    { controlId: 'fabuzhe', value: ME, valueType: 2 },
    { controlId: 'shangjia2', value: SJ, valueType: 2 },
    { controlId: 'shangjia1', value: '1', valueType: 2 },
  ]);
}

const [sew, mc, wznr = ''] = process.argv.slice(2);
if (!sew || !mc) { console.error('用法: node scripts/log-row.mjs <sew> <标题> [详情]'); process.exit(1); }
try {
  const dt = new Date();
  const y = await findOrCreate(TIME_ROOT, `${dt.getFullYear()}-无名`);
  const m = await findOrCreate(y, `${dt.getMonth() + 1}月-${dt.getFullYear()}年-无名`);
  const d = await findOrCreate(m, `${dt.getDate()}日-${dt.getMonth() + 1}月-${dt.getFullYear()}年-无名`);
  const h = await findOrCreate(d, `${dt.getHours()}点-${dt.getDate()}日-${dt.getMonth() + 1}月-${dt.getFullYear()}年-无名`);
  const rid = await addRow([
    { controlId: 'mingcheng', value: `${pad(dt.getHours())}:${pad(dt.getMinutes())}-${dt.getDate()}日-${dt.getMonth() + 1}月-${dt.getFullYear()}年-${mc}` },
    { controlId: 'leixing', value: '知识' },
    { controlId: 'sew', value: sew, valueType: 2 },
    { controlId: 'wznr', value: wznr },
    { controlId: 'fu', value: h, valueType: 2 },
    { controlId: 'fabuzhe', value: ME, valueType: 2 },
    { controlId: 'shangjia2', value: SJ, valueType: 2 },
    { controlId: 'shangjia1', value: '1', valueType: 2 },
  ]);
  const back = await post('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost', { worksheetId: WS, rowId: rid });
  if (!back.data?.rowid) throw new Error('回读确认失败');
  console.log(`✔ 已上云: ${rid}（${sew}）${mc}`);
} catch (e) {
  console.error('✘ 直传失败（不重试，靠复盘补）:', e.message);
  process.exit(1);
}
