#!/usr/bin/env node                                                                                                     // Shebang：声明用 node 执行
/**
 * log-row.mjs — 流水即时直传（一条命令上云，无缓冲）
 *
 * 用法：node scripts/log-row.mjs <sew> <标题> [详情]
 * 行为：找/建当日小时节点（年→月→日→小时自动建链）→ addRow → 回读确认 → 输出 rowid
 * 失败：打印错误即止，零重试零留存——漏的/失败的靠复盘 skill / agent 复盘补
 * （2026-09-21 老板拍板：废除 buffer 攒批层，运输免费无需攒批）
 * （2026-10-24 别名英文化：controlId 全部换新英文别名——mingcheng→title / leixing→kind / sew→dimension /
 *   wznr→content / fu→parent / fabuzhe→publisher / shangjia2→org / shangjia1→is_published）
 */
import { join, dirname } from 'node:path';                                                                              // 路径工具（当前未直接用到，保留给将来扩展脚本内相对路径）
import { fileURLToPath } from 'node:url';                                                                               // 同上：ESM 下把 import.meta.url 转文件路径的配套

const WS = '6a03ceaa7e29abcb297cbdfc';                                                                                  // 内容元数据表（data 表）ID——用 UUID 抗表改名
const ME = 'a4501620-fff9-4780-a77c-c810a7f8d44e';                                                                      // 无名在成员表的 rowid（其他成员改成自己的；写入 publisher 字段用）
const SJ = 'f009cda3-cc49-400d-82cd-cbe79ee8892f';                                                                      // 所属商家（组织表 rowid，写入 org 字段用）
// 时间记事链根：⚠️ 占位——无名的「信息库→时间记事」链建成后改此常量
const TIME_ROOT = 'ddf79205-48a1-4af0-9b5d-d115bc25fe8e';                                                               // 年→月→日→小时链的根节点 rowid
const PROXY = 'https://100000whys.cn/mingdao';                                                                          // Node 代理：HAP 密钥服务端注入，脚本零密钥落地

// 通用 POST：把 {url, input} 转发给代理，由代理代调明道云 API 并原样返回 JSON
async function post(url, input) {
  const r = await fetch(PROXY, {                                                                                        // 请求代理
    method: 'POST', headers: { 'Content-Type': 'application/json' },                                                    // 固定 POST + JSON 头
    body: JSON.stringify({ url, input }),                                                                               // 代理约定：url=真实 API 地址，input=请求体
  });
  return await r.json();                                                                                                // 响应体转 JSON 返回
}
const pad = n => String(n).padStart(2, '0');                                                                            // 两位补零（时间格式化用）

// 新增一条记录：controls 传字段数组，成功返回新 rowid；失败直接抛错（本脚本零重试原则）
async function addRow(controls) {
  const r = await post('https://api.mingdao.com/v2/open/worksheet/addRow', {                                            // v2 addRow 写入
    worksheetId: WS, triggerWorkflow: true, getSystemControl: 'false', controls,                                        // 触发工作流（保持与原行为一致）；不要系统控件
  });
  if (!r.success) throw new Error('addRow 失败: ' + JSON.stringify(r).slice(0, 150));                                   // 失败带响应片段抛错（定位用）
  return r.data;                                                                                                        // data = 新记录 rowid
}
// 找某父节点（parent）下的子节点列表：只取 rowid+标题两个字段
async function kids(parent) {
  const r = await post('https://api.mingdao.com/v2/open/worksheet/getFilterRows', {                                     // v2 getFilterRows 查询
    worksheetId: WS, pageSize: 50, pageIndex: 1, listType: 0,                                                           // 每页 50 条（小时节点下的流水足够）
    controls: ['rowid', 'title'],                                                                                       // 响应键=当前英文别名（title 原名 mingcheng）
    filters: [{ controlId: 'parent', dataType: 29, spliceType: 1, filterType: 24, value: parent }],                     // parent 关联字段精确命中（原名 fu，2026-10-24 英文化）
  });
  return r.data?.rows ?? [];                                                                                            // 空响应兜底为空数组
}
// 找/建节点：父节点下找标题=name 的子节点，有则返回其 rowid，没有就建一条再返回新 rowid
async function findOrCreate(parent, name) {
  const hit = (await kids(parent)).find(r => (r.title || r.mingcheng) === name);                                        // 英文键优先、旧拼音键兜底（响应键=当前别名）
  if (hit) return hit.rowid;                                                                                            // 命中 → 直接复用，不重复建
  return await addRow([                                                                                                 // 没命中 → 建链上节点
    { controlId: 'title', value: name },                                                                                // 标题（原 mingcheng）
    { controlId: 'kind', value: '知识' },                                                                               // 类型=知识（原 leixing）
    { controlId: 'dimension', value: '9信息', valueType: 2 },                                                           // 12维=9信息（原 sew）
    { controlId: 'parent', value: parent, valueType: 2 },                                                               // 挂到父节点（原 fu）
    { controlId: 'publisher', value: ME, valueType: 2 },                                                                // 发布者=无名（原 fabuzhe）
    { controlId: 'org', value: SJ, valueType: 2 },                                                                      // 所属商家（原 shangjia2；2026-09-06 拍板创建必带）
    { controlId: 'is_published', value: '1', valueType: 2 },                                                            // 上架勾选（原 shangjia1）
  ]);
}

const [sew, mc, wznr = ''] = process.argv.slice(2);                                                                     // 解构参数：12维、标题、详情（可省）
if (!sew || !mc) { console.error('用法: node scripts/log-row.mjs <sew> <标题> [详情]'); process.exit(1); }               // 缺参 → 打印用法退出
try {                                                                                                                   // 主流程：任何一步失败打错误即止（零重试零留存）
  const dt = new Date();                                                                                                // 当前时间（年月日时从这取）
  const y = await findOrCreate(TIME_ROOT, `${dt.getFullYear()}-无名`);                                                  // 找/建「年-无名」节点
  const m = await findOrCreate(y, `${dt.getMonth() + 1}月-${dt.getFullYear()}年-无名`);                                 // 找/建「月-年-无名」节点
  const d = await findOrCreate(m, `${dt.getDate()}日-${dt.getMonth() + 1}月-${dt.getFullYear()}年-无名`);               // 找/建「日-月-年-无名」节点
  const h = await findOrCreate(d, `${dt.getHours()}点-${dt.getDate()}日-${dt.getMonth() + 1}月-${dt.getFullYear()}年-无名`);  // 找/建「时-日-月-年-无名」小时节点
  const rid = await addRow([                                                                                            // 真正的流水记录
    { controlId: 'title', value: `${pad(dt.getHours())}:${pad(dt.getMinutes())}-${dt.getDate()}日-${dt.getMonth() + 1}月-${dt.getFullYear()}年-${mc}` },  // 标题=时分-日期-标题（原名 mingcheng）
    { controlId: 'kind', value: '知识' },                                                                               // 类型=知识（原 leixing）
    { controlId: 'dimension', value: sew, valueType: 2 },                                                               // 12维=命令行传入（原 sew）
    { controlId: 'content', value: wznr },                                                                              // 正文=命令行传入详情（原 wznr）
    { controlId: 'parent', value: h, valueType: 2 },                                                                    // 挂到小时节点（原 fu）
    { controlId: 'publisher', value: ME, valueType: 2 },                                                                // 发布者=无名（原 fabuzhe）
    { controlId: 'org', value: SJ, valueType: 2 },                                                                      // 所属商家（原 shangjia2）
    { controlId: 'is_published', value: '1', valueType: 2 },                                                            // 上架勾选（原 shangjia1）
  ]);
  const back = await post('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost', { worksheetId: WS, rowId: rid });  // 回读确认：防止假成功
  if (!back.data?.rowid) throw new Error('回读确认失败');                                                               // 回读不到 rowid = 写入可疑 → 报错
  console.log(`✔ 已上云: ${rid}（${sew}）${mc}`);                                                                       // 成功输出 rowid + 维度 + 标题
} catch (e) {
  console.error('✘ 直传失败（不重试，靠复盘补）:', e.message);                                                          // 失败即止，漏的靠复盘补
  process.exit(1);                                                                                                      // 非零退出码
}
