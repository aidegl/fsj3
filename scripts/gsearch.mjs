#!/usr/bin/env node                                                                                                    // Shebang：声明用 node 执行（Unix 惯例，Windows 下无实际作用）
/**
 * gsearch.mjs — 全局关键词检索（HAP keyWords 全字段搜索）
 *
 * ⚠️ 定位（2026-09-21 老板拍板）：**最后手段**——所有字段（标题/描述/正文/维度）沾到就中，
 * 数据多、不精准，只在很难搜到数据时兜底。结果已按质量分排序（头部即精华）。
 *
 * 用法：
 *   node scripts/gsearch.mjs <关键词>
 *   node scripts/gsearch.mjs <关键词> --by <publisher的rowid>   # 只搜某人（2026-10-24 别名英文化：fabuzhe→publisher）
 *   node scripts/gsearch.mjs <关键词> --sew 1技能              # 只搜某维度（12维字段 dimension）
 *
 * 质量信号（越高越优质）：full_cited_by_total 被完全引用次数 / cited_by_total 被引用次数 / composite_rating 综合评分
 *   （2026-10-24 别名英文化前叫 bwqyycs / byycs / zhpf）
 * 时间维度过滤：ctime/utime 系统字段 filter 实测不生效，请拿回结果客户端筛。
 * 完整文档：云端「全局关键词检索-林东城」f7a2b65b-7aa0-4fe0-802c-57d6d6e9caa0
 */
const WS = '6a03ceaa7e29abcb297cbdfc';                                                                                 // 内容元数据表（data 表）ID——用 UUID，表别名再怎么改都不受影响
const PROXY = 'https://100000whys.cn/mingdao';                                                                         // Node 代理：HAP 密钥服务端注入，本脚本零密钥落地

// 通用 POST：把 {url, input} 转发给代理，由代理代调明道云 API 并原样返回 JSON
async function post(url, input) {
  const r = await fetch(PROXY, {                                                                                       // 请求代理
    method: 'POST', headers: { 'Content-Type': 'application/json' },                                                   // 固定 POST + JSON 头
    body: JSON.stringify({ url, input }),                                                                              // 代理约定：url=真实 API 地址，input=请求体
  });
  return await r.json();                                                                                               // 响应体转 JSON 返回
}
// 12维（dimension 下拉）显示值归一：数组→每项取 value 用 / 拼接；其他→转字符串；任何异常→空串
const sewText = x => { try { return Array.isArray(x) ? x.map(s => s.value ?? s).join('/') : String(x ?? ''); } catch { return ''; } };

const argv = process.argv.slice(2);                                                                                    // 命令行参数（去掉 node 路径和脚本路径两项）
const kw = argv[0];                                                                                                    // 第一个参数 = 检索关键词
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : ''; };                             // 读 "--名字 值" 形式的选项，没有给空串
if (!kw) { console.error('用法: gsearch <关键词> [--by <publisher的rowid>] [--sew <维度>]'); process.exit(1); }          // 缺关键词 → 打印用法并以失败码退出

const byMe = arg('--by'), bySew = arg('--sew');                                                                        // 两个可选过滤：按发布者 rowid / 按 12 维显示值
const filters = [];                                                                                                    // 服务端过滤器容器（不传 = 全表搜）
if (byMe) filters.push({ controlId: 'publisher', dataType: 29, spliceType: 1, filterType: 24, value: byMe });          // 发布者过滤：关联字段精确命中（filterType 24；原别名 fabuzhe，2026-10-24 英文化）
if (bySew) filters.push({ controlId: 'dimension', dataType: 11, spliceType: 1, filterType: 2, value: bySew });         // 12维过滤：下拉文本包含匹配（filterType 2；原别名 sew）

const r = await post('https://api.mingdao.com/v2/open/worksheet/getFilterRows', {                                      // 主查询：HAP v2 getFilterRows
  worksheetId: WS, pageSize: 50, pageIndex: 1, listType: 0,                                                            // 每页 50 条（兜底够用），第 1 页
  controls: ['rowid', 'title', 'dimension', 'full_cited_by_total', 'cited_by_total', 'composite_rating'],              // 只取展示+评分字段（响应键=当前英文别名；旧名 mingcheng/sew/bwqyycs/byycs/zhpf 已废）
  keyWords: kw,                                                                                                        // 全字段全文检索（HAP 内置 keyWords，实测可用）
  ...(filters.length ? { filters } : {}),                                                                              // 有可选过滤才带 filters 键（空数组别传，服务端可能挑刺）
});
const num = v => Number(v) || 0;                                                                                       // 安全转数字：空/非法一律 0
const zhpfNum = v => { try { const a = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(a) ? num(a[0]) : num(a); } catch { return 0; } };  // 综合评分解析：公式字段可能是 JSON串/数组/数字三种形态
const rows = (r.data?.rows ?? [])                                                                                      // 取结果行，空响应兜底为空数组
  .map(n => ({ ...n, _q: num(n.full_cited_by_total) + num(n.cited_by_total) + zhpfNum(n.composite_rating) }))          // 算质量分 _q = 被完全引用次数 + 被引用次数 + 综合评分
  .sort((a, b) => b._q - a._q);                                                                                        // 质量分降序：头部即精华
console.log(`全局搜索「${kw}」${byMe ? '+发布者 ' : ''}${bySew ? `+维度${bySew} ` : ''}命中 ${rows.length} 条（全字段，已按质量分排序）：`);  // 结果标题行（带生效的过滤条件回显）
for (const n of rows) console.log(`- [${sewText(n.dimension)}] ${n.title} (q=${n._q}, 完引${num(n.full_cited_by_total)}/引${num(n.cited_by_total)}/评${zhpfNum(n.composite_rating)}) (${n.rowid})`);  // 逐条输出：[12维] 标题 (质量分, 三信号明细) (rowid——拿它可继续查详情)
if (!rows.length) console.log('（无命中）');                                                                            // 零命中提示
