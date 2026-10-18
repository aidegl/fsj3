#!/usr/bin/env node
/**
 * gsearch.mjs — 全局关键词检索（HAP keyWords 全字段搜索）
 *
 * ⚠️ 定位（2026-09-21 老板拍板）：**最后手段**——所有字段（标题/描述/正文/sew）沾到就中，
 * 数据多、不精准，只在很难搜到数据时兜底。结果已按质量分排序（头部即精华）。
 *
 * 用法：
 *   node scripts/gsearch.mjs <关键词>
 *   node scripts/gsearch.mjs <关键词> --by <fabuzhe的rowid>   # 只搜某人
 *   node scripts/gsearch.mjs <关键词> --sew 1技能              # 只搜某维度
 *
 * 质量信号（越高越优质）：bwqyycs 被完全引用次数 / byycs 被引用次数 / zhpf 组织评分
 * 时间维度过滤：ctime/utime 系统字段 filter 实测不生效，请拿回结果客户端筛。
 * 完整文档：云端「全局关键词检索-林东城」f7a2b65b-7aa0-4fe0-802c-57d6d6e9caa0
 */
const WS = '6a03ceaa7e29abcb297cbdfc';
const PROXY = 'https://100000whys.cn/mingdao';

async function post(url, input) {
  const r = await fetch(PROXY, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, input }),
  });
  return await r.json();
}
const sewText = x => { try { return Array.isArray(x) ? x.map(s => s.value ?? s).join('/') : String(x ?? ''); } catch { return ''; } };

const argv = process.argv.slice(2);
const kw = argv[0];
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : ''; };
if (!kw) { console.error('用法: gsearch <关键词> [--by <fabuzhe的rowid>] [--sew <维度>]'); process.exit(1); }

const byMe = arg('--by'), bySew = arg('--sew');
const filters = [];
if (byMe) filters.push({ controlId: 'fabuzhe', dataType: 29, spliceType: 1, filterType: 24, value: byMe });
if (bySew) filters.push({ controlId: 'sew', dataType: 11, spliceType: 1, filterType: 2, value: bySew });

const r = await post('https://api.mingdao.com/v2/open/worksheet/getFilterRows', {
  worksheetId: WS, pageSize: 50, pageIndex: 1, listType: 0,
  controls: ['rowid', 'mingcheng', 'sew', 'bwqyycs', 'byycs', 'zhpf'],
  keyWords: kw,
  ...(filters.length ? { filters } : {}),
});
const num = v => Number(v) || 0;
const zhpfNum = v => { try { const a = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(a) ? num(a[0]) : num(a); } catch { return 0; } };
const rows = (r.data?.rows ?? [])
  .map(n => ({ ...n, _q: num(n.bwqyycs) + num(n.byycs) + zhpfNum(n.zhpf) }))
  .sort((a, b) => b._q - a._q);
console.log(`全局搜索「${kw}」${byMe ? '+发布者 ' : ''}${bySew ? `+维度${bySew} ` : ''}命中 ${rows.length} 条（全字段，已按质量分排序）：`);
for (const n of rows) console.log(`- [${sewText(n.sew)}] ${n.mingcheng} (q=${n._q}, 完引${num(n.bwqyycs)}/引${num(n.byycs)}/评${zhpfNum(n.zhpf)}) (${n.rowid})`);
if (!rows.length) console.log('（无命中）');
