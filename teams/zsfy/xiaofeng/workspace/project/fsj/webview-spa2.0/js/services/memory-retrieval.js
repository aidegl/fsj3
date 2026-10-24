/**
 * memory-retrieval.js — 记忆三因子检索器（2026-09-09，小粽批准设计 v1）
 *
 * 论文《Generative Agents》三因子：score = w1·relevance + w2·importance + w3·recency
 * 数据源（零 schema 改动，全部现有字段）：
 *   relevance  = 命中查询词数 / 查询词数               （shangpin.guanjianci 关联反查，filterType 24）
 *   recency    = 0.995 ^ 距 ctime 的小时数，下限 0.001  （纯计算）
 *   importance = 命中关键词权表权重均值/10000 + min(jifen/10000, 0.2) （权表 6a90f29d 批量查）
 *
 * ⚠️ 已知取舍（小粽 2026-09-09 批准记录在案）：关键词预筛意味着"没挂关键词的记录检索不到"——
 *    检索覆盖率依赖写侧纪律：所有记忆记录必带 ≥3 双语关键词（数据规范红线）。
 *
 * 用法：
 *   import { retrieveMemories, todayImportanceSum } from './memory-retrieval.js';
 *   const top = await retrieveMemories({ keywords: ['微信登录', '检索'], N: 10 });
 */
const MINGDAO = 'https://100000whys.cn/mingdao';
const SHANGPIN = '6a03ceaa7e29abcb297cbdfc';   // 内容元数据表 UUID（原别名 shangpin）
const KW_WS = '69e04b28924f17c90a970f3d';
const WEIGHT_WS = '6a90f29daa38289b4e6e7386';
const KW_REL_FIELD = '6a045ea70507e352629dd2c6';       // shangpin.关键词 关联字段
const WEIGHT_KW_FIELD = '6a90f2ffaa38289b4e6e74a2';    // 权表.关键词 关联字段

async function callMingdao(action, worksheetId, input) {
  const r = await fetch(MINGDAO, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://api.mingdao.com/v2/open/worksheet/' + action,
      input: Object.assign({ worksheetId: worksheetId }, input) })
  });
  if (!r.ok) throw new Error('mingdao ' + r.status);
  return r.json();
}

function minMaxNorm(values) {
  if (!values.length) return values.map(function () { return 0; });
  var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
  if (max === min) return values.map(function () { return 1; });   // 全相同 → 全 1（不惩罚）
  return values.map(function (v) { return (v - min) / (max - min); });
}

function recencyOf(ctime) {
  if (!ctime) return 0.001;
  var hours = (Date.now() - new Date(ctime.replace(/-/g, '/')).getTime()) / 3600000;
  if (hours < 0) hours = 0;
  return Math.max(Math.pow(0.995, hours), 0.001);
}

function parseKwRowids(guanjianciJson, filterSids) {
  var out = [];
  try {
    var kws = JSON.parse(guanjianciJson || '[]');
    kws.forEach(function (k) {
      if (!filterSids || filterSids.indexOf(k.sid) >= 0) out.push(k.sid);
    });
  } catch (e) { /* 坏数据忽略 */ }
  return out;
}

/**
 * 主入口：三因子检索
 * @param {object} opts { keywords: string[1-4], N?: number=10, weights?: {rel,imp,rec} 默认各 1/3 }
 * @returns {Promise<Array>} [{ rowid, mingcheng, score, factors: {rel, imp, rec} }] 按 score 降序
 */
export async function retrieveMemories(opts) {
  var keywords = (opts.keywords || []).slice(0, 4);
  if (!keywords.length) return [];
  var N = opts.N || 10;
  var w = opts.weights || { rel: 1 / 3, imp: 1 / 3, rec: 1 / 3 };

  // ① 查询词 → 关键词 rowid
  var kwRes = await callMingdao('getFilterRows', KW_WS, {
    pageSize: 20, pageIndex: 1, listType: 0, controls: ['rowid', 'mingcheng'],
    filters: [{ controlId: 'mingcheng', dataType: 2, spliceType: 1, filterType: 2, values: keywords }]
  });
  var kwRowids = ((kwRes.data || {}).rows || []).map(function (r) { return r.rowid; });
  if (!kwRowids.length) return [];   // 查询词一个都不存在 → 空结果

  // ② 反查候选集（关联 24，values 多词 OR；guanjianci 一并取回用于精确计命中）
  var candRes = await callMingdao('getFilterRows', SHANGPIN, {
    pageSize: 200, pageIndex: 1, listType: 0,
    controls: ['rowid', 'title', 'tags', 'ctime', 'points'],
    filters: [{ controlId: KW_REL_FIELD, dataType: 29, spliceType: 2, filterType: 24, values: kwRowids }]
  });
  var candidates = ((candRes.data || {}).rows || []).map(function (r) {
    var kwRaw = r.tags || r.guanjianci || '[]';   // 别名英文化后响应键为 tags
    var hitSids = parseKwRowids(kwRaw, kwRowids);   // 候选实际命中的查询词（服务端 OR 命中可能含宽匹配，此处精确复核）
    return { rowid: r.rowid, mingcheng: r.title || r.mingcheng || '', ctime: r.ctime || '',
             jifen: Number(r.points || r.jifen) || 0, guanjianci: kwRaw,
             hitSids: hitSids, hits: hitSids.length };
  }).filter(function (c) { return c.hits > 0; });   // 精确复核后 0 命中的丢弃
  if (!candidates.length) return [];

  // ③ importance：收集全部命中关键词 rowid → 批量查权表基础权重（缺权表记录按默认 5000）
  var hitKwSet = {};
  candidates.forEach(function (c) { c.hitSids.forEach(function (s) { hitKwSet[s] = true; }); });
  var usedKw = Object.keys(hitKwSet);
  var kwWeight = {};
  if (usedKw.length) {
    var wtRes = await callMingdao('getFilterRows', WEIGHT_WS, {
      pageSize: 200, pageIndex: 1, listType: 0,
      controls: [WEIGHT_KW_FIELD],
      filters: [{ controlId: WEIGHT_KW_FIELD, dataType: 29, spliceType: 2, filterType: 24, values: usedKw }]
    });
    ((wtRes.data || {}).rows || []).forEach(function (r) {
      parseKwRowids(r[WEIGHT_KW_FIELD], null).forEach(function (sid) { kwWeight[sid] = Number(r[WEIGHT_BASE_FIELD]) || 5000; });
    });
  }

  // ④ 逐条三因子（原始值）→ 候选集内 min-max 归一化 → 加权
  var rels = [], imps = [], recs = [];
  candidates.forEach(function (c) {
    c._rel = c.hits / keywords.length;
    var hitWs = parseKwRowids(c.guanjianci, kwRowids).map(function (sid) { return kwWeight[sid] || 5000; });
    var avgW = hitWs.length ? hitWs.reduce(function (a, b) { return a + b; }, 0) / hitWs.length : 5000;
    c._imp = Math.min(avgW / 10000, 1) + Math.min(c.jifen / 10000, 0.2);
    c._rec = recencyOf(c.ctime);
    rels.push(c._rel); imps.push(c._imp); recs.push(c._rec);
  });
  var nRel = minMaxNorm(rels), nImp = minMaxNorm(imps), nRec = minMaxNorm(recs);
  candidates.forEach(function (c, i) {
    c.score = w.rel * nRel[i] + w.imp * nImp[i] + w.rec * nRec[i];
  });
  candidates.sort(function (a, b) { return b.score - a.score; });
  return candidates.slice(0, N).map(function (c) {
    return { rowid: c.rowid, mingcheng: c.mingcheng,
             score: Math.round(c.score * 1000) / 1000,
             factors: { rel: Math.round(c._rel * 100) / 100, imp: Math.round(c._imp * 100) / 100, rec: Math.round(c._rec * 100) / 100 } };
  });
}

/**
 * 反思触发器接口：当日新增记忆量是否达反思阈值
 * @returns {Promise<{todayCount: number, threshold: number, shouldReflect: boolean}>}
 * 注：v1 以"当日新增条数≥阈值"近似"importance 累计超阈值"（importance 字段未落地前的简化，小粽已批）
 */
export async function todayImportanceSum(threshold) {
  threshold = threshold || 100;
  var d = await callMingdao('getFilterRows', SHANGPIN, {
    pageSize: 200, pageIndex: 1, listType: 0, controls: ['rowid', 'ctime'],
    filters: [{ controlId: 'ctime', dataType: 16, spliceType: 1, filterType: 17, dateRange: 1 }]
  });
  var count = ((d.data || {}).rows || []).length;
  return { todayCount: count, threshold: threshold, shouldReflect: count >= threshold };
}
