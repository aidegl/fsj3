#!/usr/bin/env node
/**
 * ttm.mjs · 记忆三剑客（必读权重 / 必读小抄 / 临时小抄）
 * ------------------------------------------------
 * 统一入口：agent 通过本模块读取三档必读内容，铁律内置（防压缩重载/命中率记录/flow 留痕/编码处理）
 *
 * 用法：
 *   node ttm.mjs weight                          # ① 必读权重（9901~10000 全量 + wznr）
 *   node ttm.mjs cheat                           # ② 必读小抄（9001~9900 全量）
 *   node ttm.mjs temp [--scene 场景] [--task 任务]  # ③ 临时小抄（8001~9000，miaoshu 匹配过滤）
 *   node ttm.mjs weight --agent xiaozong         # 指定 agent 名（默认 wuming）
 *
 * 每次调用自动：
 *   1. 追加命中率记录 tmp-api/retrieval-hit-log.jsonl
 *   2. flow 留痕：workspace/flows/flow-<日期>-<agent>-ttm.json 追加步骤（决策流 v1.1）
 *   3. 防压缩检查：上下文压缩后重跑本命令即完成"再加载一次"
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------- 配置 ----------
const CFG = {
  proxy: 'https://100000whys.cn/mingdao',
  api: 'https://api.mingdao.com/v2/open/worksheet/getFilterRows',
  worksheetId: '6a03ceaa7e29abcb297cbdfc',            // 元表
  controls: ['rowid', 'mingcheng', 'miaoshu', 'wznr', 'leixing', 'quanzhong'],
  tierField: 'quanzhong',                              // 权重分值字段（实际字段名不同改这里）
  hitLog: 'D:/Item/fsj/tmp-api/retrieval-hit-log.jsonl',
  flowsDir: 'D:/Item/fsj3/teams/zsfy/xiaofeng/workspace/project/fsj/fsj-pixel-world2/workspace/flows',
  agent: process.env.TTM_AGENT || 'wuming'
};
const TIERS = {
  weight: { min: 9901, max: 10000, name: '必读权重', withWznr: true },
  cheat:  { min: 9001, max: 9900,  name: '必读小抄', withWznr: false },
  temp:   { min: 8001, max: 9000,  name: '临时小抄', withWznr: false }
};

// ---------- 工具 ----------
const now = () => new Date();
const ts = () => now().toLocaleTimeString('zh-CN', { hour12: false });
const today = () => now().toISOString().slice(0, 10).replace(/-/g, '');

function parseArgs(argv) {
  const op = argv[0] || 'help';
  const opts = {};
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--agent') opts.agent = argv[++i];
    else if (argv[i] === '--scene') opts.scene = argv[++i];
    else if (argv[i] === '--task') opts.task = argv[++i];
  }
  return { op, opts };
}

async function proxyFetch(body) {
  const res = await fetch(CFG.proxy, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: CFG.api, input: body })
  });
  if (!res.ok) throw new Error('明道云代理 ' + res.status);
  return res.json();
}

async function fetchMetaRows() {
  const d = await proxyFetch({
    worksheetId: CFG.worksheetId,
    pageSize: 500, pageIndex: 1, listType: 0,
    controls: CFG.controls
  });
  if (d.msg && d.msg !== '成功' && !d.data) throw new Error('代理返回异常: ' + (d.msg || JSON.stringify(d).slice(0, 120)));
  return (d.data && d.data.rows) || [];
}

function tierOf(row) {
  const v = row[CFG.tierField];
  const n = parseInt(v, 10);
  if (!Number.isNaN(n) && n > 0) return n;
  // 兜底：按 leixing 名称分档
  const lx = row.leixing || '';
  if (lx.includes('必读权重')) return 9950;
  if (lx.includes('必读小抄')) return 9500;
  if (lx.includes('临时小抄')) return 8500;
  return 0;
}

function pickTier(rows, op) {
  const t = TIERS[op];
  return rows
    .map(r => ({ ...r, _tier: tierOf(r) }))
    .filter(r => r._tier >= t.min && r._tier <= t.max)
    .map(({ _tier, ...r }) => ({ ...r, tier: _tier }))
    .sort((a, b) => (b.tier || 0) - (a.tier || 0));
}

function matchTemp(row, opts) {
  const m = row.miaoshu || '';
  const okScene = !opts.scene || m.includes(opts.scene);
  const okTask = !opts.task || m.includes(opts.task);
  return okScene || okTask;   // 场景或任务任一匹配即视为匹配
}

// ---------- flow 留痕（决策流 v1.1）----------
function flowFile(agent) {
  const dir = CFG.flowsDir;
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `flow-${today()}-${agent}-ttm.json`);
}
function flowUpdate(agent, patch) {
  const f = flowFile(agent);
  let flow = {
    flowVersion: '1.1', id: path.basename(f, '.json'), agent,
    dim: 2, task: 'ttm 记忆三剑客调用', status: 'running',
    startedAt: now().toISOString(), finishedAt: null,
    strategyNote: 'ttm 统一入口：必读权重/必读小抄/临时小抄 的读写留痕',
    steps: [], revisions: []
  };
  if (fs.existsSync(f)) { try { flow = { ...flow, ...JSON.parse(fs.readFileSync(f, 'utf-8')) }; } catch {} }
  Object.assign(flow, patch);
  if (patch.stepDelta) {
    flow.steps.push({ no: flow.steps.length + 1, ...patch.stepDelta });
  }
  fs.writeFileSync(f, JSON.stringify(flow, null, 2));
  return f;
}

// ---------- 命中率 ----------
function hitLog(op, count, top1) {
  try {
    const line = JSON.stringify({
      t: ts(), agent: CFG.agent, q: `ttm ${op}`, way: '路由',
      hits: count, top1: top1 || '', rel: 5, miss: false, 歪排: false
    });
    fs.mkdirSync(path.dirname(CFG.hitLog), { recursive: true });
    fs.appendFileSync(CFG.hitLog, line + '\n');
  } catch {}
}

// ---------- 主逻辑 ----------
async function main() {
  const { op, opts } = parseArgs(process.argv.slice(2));
  if (opts.agent) CFG.agent = opts.agent;

  if (op === 'help' || !TIERS[op]) {
    console.log('用法: node ttm.mjs <weight|cheat|temp> [--agent 名] [--scene 场景] [--task 任务]');
    process.exit(op === 'help' ? 0 : 1);
  }

  const t0 = Date.now();
  const all = await fetchMetaRows();
  let rows = pickTier(all, op);

  if (op === 'temp') {
    rows = rows.filter(r => matchTemp(r, opts));
    rows.sort((a, b) => (b.miaoshu || '').includes(opts.task || '') - (a.miaoshu || '').includes(opts.task || ''));
  }

  const out = {
    tier: TIERS[op].name,
    range: `${TIERS[op].min}~${TIERS[op].max}`,
    fanzhayasuo: '防压缩内容：上下文压缩后重跑本命令即完成再加载',
    count: rows.length,
    rows: rows.map(r => ({
      rowid: r.rowid, mingcheng: r.mingcheng || '', miaoshu: r.miaoshu || '',
      ...(TIERS[op].withWznr ? { wznr: r.wznr || '' } : {})
    }))
  };
  console.log(JSON.stringify(out, null, 2));

  hitLog(op, rows.length, rows[0] ? rows[0].mingcheng : '');
  flowUpdate(CFG.agent, {
    stepDelta: {
      type: 'execute', title: `ttm.${op}`, status: 'done',
      startedAt: ts(), endedAt: ts(),
      decision: { chosen: `读取${TIERS[op].name}`, why: '按必读内容防压缩规则加载', alternatives: [] },
      output: `${rows.length} 条`
    },
    ttm: { op, count: rows.length, at: now().toISOString() }
  });
  console.error(`[ttm] ${op} 完成 ${rows.length} 条 · ${(Date.now() - t0)}ms · flow 已留痕`);
}

main().catch(err => {
  console.error('[ttm] 失败:', err.message);
  process.exit(1);
});
