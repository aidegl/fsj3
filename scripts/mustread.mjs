#!/usr/bin/env node
/**
 * mustread.mjs — 必读段获取（轻架构 v3 · 替代 skeleton-cache/digest/load-always 三件套）
 *
 * 用法：node scripts/mustread.mjs [成员rowid]    # 默认无名 a4501620
 *
 * 流程：成员表记录 → bdwznr 字段（纯 JSON 数组 [{rowid, shuoming}]）
 *     → 逐条取内容元数据记录的 标题(mingcheng) + 正文(wznr)
 *     → 输出即读入（零本地缓存、零落地文件）
 *
 * bdwznr 的维护入口：fsj-wushi 页面「权重必读」模式（格子板），或手改成员记录字段
 */
const MEMBER_WS = '69b0077358322d512e60bad0';
const SHANGPIN = '6a03ceaa7e29abcb297cbdfc';
const PROXY = 'https://100000whys.cn/mingdao';
const DEFAULT_ME = 'a4501620-fff9-4780-a77c-c810a7f8d44e';   // 无名
const WZNR_CAP = 4000;   // 单条正文超长截断保护（必读底牌一般远小于此）

const post = async (url, input) => {
  const r = await fetch(PROXY, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, input }),
  });
  return await r.json();
};
const stripFence = (s) => String(s ?? '').replace(/^\s*```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
const pickText = (d, ...names) => {
  for (const n of names) { if (typeof d[n] === 'string' && d[n]) return d[n]; }
  const k = Object.keys(d).find(k => names.some(n => k === n || k.endsWith(n)));
  return k ? (typeof d[k] === 'string' ? d[k] : JSON.stringify(d[k])) : '';
};

(async () => {
  const me = process.argv[2] || DEFAULT_ME;
  // ① 成员记录 → bdwznr
  const m = await post('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost', {
    worksheetId: MEMBER_WS, rowId: me,
  });
  const md = m.data?.data || m.data;
  if (!md) { console.error('✘ 成员记录取不到：' + me); process.exit(1); }
  let raw = stripFence(md.bdwznr ?? '');
  let items = [];
  try { items = JSON.parse(raw || '[]'); } catch (e) {
    console.error('✘ bdwznr 不是合法 JSON（去 wushi 页面或手改成员记录）'); process.exit(1);
  }
  if (!Array.isArray(items) || items.length === 0) {
    console.log('（必读段为空——去 fsj-wushi 页面「权重必读」模式置入）');
    process.exit(0);
  }
  // ② 逐条拉标题+正文，输出即读入
  console.log('════ 必读段 · ' + items.length + ' 条（' + (md.nickname || md.mingcheng || me) + '）════');
  for (const it of items) {
    if (!it.rowid) continue;
    const r = await post('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost', {
      worksheetId: SHANGPIN, rowId: it.rowid,
    });
    const d = r.data?.data || r.data;
    const mc = d ? pickText(d, 'mingcheng', '6a03ceaa7e29abcb297cbdfd') : '';
    const wz = d ? pickText(d, 'wznr', '6a223553a225020849c93059') : '';
    console.log('\n━━ ' + (mc || '(取不到)') + ' ━━ ' + (it.shuoming ? '〔' + it.shuoming + '〕' : '') + ' [rowid: ' + it.rowid + ']');
    const body = stripFence(wz);
    console.log(body.length > WZNR_CAP ? body.slice(0, WZNR_CAP) + '\n…(截断，全文 rowid 直取)' : (body || '(无正文)'));
  }
})().catch(e => { console.error('✘ ' + (e.message || e)); process.exit(1); });
