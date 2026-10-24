#!/usr/bin/env node                                                                                                     // Shebang：声明用 node 执行
/**
 * mustread.mjs — 必读段获取（轻架构 v3 · 替代 skeleton-cache/digest/load-always 三件套）
 *
 * 用法：node scripts/mustread.mjs [成员rowid]    # 默认无名 a4501620
 *
 * 流程：成员表记录 → bdwznr 字段（纯 JSON 数组 [{rowid, shuoming}]）
 *     → 逐条取内容元数据记录的 标题(title) + 正文(content)   ← 2026-10-24 别名英文化（原 mingcheng/wznr）
 *     → 输出即读入（零本地缓存、零落地文件）
 *
 * bdwznr 的维护入口：fsj-wushi 页面「权重必读」模式（格子板），或手改成员记录字段
 */
const MEMBER_WS = '69b0077358322d512e60bad0';                                                                           // 成员表 ID（每个 agent 一条成员记录）
const SHANGPIN = '6a03ceaa7e29abcb297cbdfc';                                                                            // 内容元数据表（data 表）ID——常量名沿用旧称，用 UUID 抗改名
const PROXY = 'https://100000whys.cn/mingdao';                                                                          // Node 代理：HAP 密钥服务端注入，脚本零密钥落地
const DEFAULT_ME = 'a4501620-fff9-4780-a77c-c810a7f8d44e';                                                              // 默认查无名的必读段
const WZNR_CAP = 4000;                                                                                                  // 单条正文超长截断保护（必读底牌一般远小于此）

// 通用 POST：把 {url, input} 转发给代理，由代理代调明道云 API 并原样返回 JSON
const post = async (url, input) => {
  const r = await fetch(PROXY, {                                                                                        // 请求代理
    method: 'POST', headers: { 'Content-Type': 'application/json' },                                                    // 固定 POST + JSON 头
    body: JSON.stringify({ url, input }),                                                                               // 代理约定：url=真实 API 地址，input=请求体
  });
  return await r.json();                                                                                                // 响应体转 JSON 返回
};
// 去掉 markdown 代码围栏（```xxx 开头与 ``` 结尾）并去首尾空白——bdwznr 里可能整段被围栏包住
const stripFence = (s) => String(s ?? '').replace(/^\s*```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
// 从记录对象里按候选名序列取第一个非空字符串：先精确匹配键名，再匹配「以候选名结尾」的键（兜底他表字段形态）
const pickText = (d, ...names) => {
  for (const n of names) { if (typeof d[n] === 'string' && d[n]) return d[n]; }                                         // 第一轮：键名精确相等
  const k = Object.keys(d).find(k => names.some(n => k === n || k.endsWith(n)));                                        // 第二轮：键名后缀匹配（如 controlId 变体）
  return k ? (typeof d[k] === 'string' ? d[k] : JSON.stringify(d[k])) : '';                                             // 命中的是非字符串（如关联数组）→ JSON 化输出
};

(async () => {                                                                                                          // 主流程（异步 IIFE，顶层直接跑）
  const me = process.argv[2] || DEFAULT_ME;                                                                             // 命令行指定成员 rowid，缺省无名
  // ① 成员记录 → bdwznr
  const m = await post('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost', {                                    // 按行id取成员记录
    worksheetId: MEMBER_WS, rowId: me,                                                                                  // 成员表 + 成员 rowid
  });
  const md = m.data?.data || m.data;                                                                                    // 兼容两种返回包裹层级
  if (!md) { console.error('✘ 成员记录取不到：' + me); process.exit(1); }                                               // 取不到 → 报错退出
  let raw = stripFence(md.bdwznr ?? '');                                                                                // 取 bdwznr（必读清单）并去围栏
  let items = [];                                                                                                       // 解析结果容器
  try { items = JSON.parse(raw || '[]'); } catch (e) {                                                                  // 必须是合法 JSON 数组
    console.error('✘ bdwznr 不是合法 JSON（去 wushi 页面或手改成员记录）'); process.exit(1);                            // 解析失败 → 报错指路
  }
  if (!Array.isArray(items) || items.length === 0) {                                                                    // 空清单 → 正常提示退出
    console.log('（必读段为空——去 fsj-wushi 页面「权重必读」模式置入）');
    process.exit(0);
  }
  // ② 逐条拉标题+正文，输出即读入
  console.log('════ 必读段 · ' + items.length + ' 条（' + (md.nickname || md.mingcheng || me) + '）════');               // 头部：条数 + 成员昵称（nickname/mingcheng 是成员表字段，不在改名范围）
  for (const it of items) {                                                                                             // 遍历必读清单
    if (!it.rowid) continue;                                                                                            // 没带 rowid 的条目跳过
    const r = await post('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost', {                                  // 按行id取内容元数据记录（data 表）
      worksheetId: SHANGPIN, rowId: it.rowid,                                                                           // UUID 表号 + 清单里的 rowid
    });
    const d = r.data?.data || r.data;                                                                                   // 兼容两种返回包裹层级
    const mc = d ? pickText(d, 'title', '6a03ceaa7e29abcb297cbdfd') : '';                                               // 标题：新别名 title 优先，UUID 键兜底（原 mingcheng）
    const wz = d ? pickText(d, 'content', '6a223553a225020849c93059') : '';                                             // 正文：新别名 content 优先，UUID 键兜底（原 wznr）
    console.log('\n━━ ' + (mc || '(取不到)') + ' ━━ ' + (it.shuoming ? '〔' + it.shuoming + '〕' : '') + ' [rowid: ' + it.rowid + ']');  // 条目标题行：标题 + 说明 + rowid
    const body = stripFence(wz);                                                                                        // 正文去围栏
    console.log(body.length > WZNR_CAP ? body.slice(0, WZNR_CAP) + '\n…(截断，全文 rowid 直取)' : (body || '(无正文)'));  // 超长截断输出（全文拿 rowid 另取）
  }
})().catch(e => { console.error('✘ ' + (e.message || e)); process.exit(1); });                                          // 顶层兜底：任何未捕获错误打出来并以失败码退出
