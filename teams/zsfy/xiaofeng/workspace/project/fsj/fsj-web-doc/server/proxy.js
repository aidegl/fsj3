// fsj-web-doc 后端代理（端口 3012）
// 目的：浏览器通过代理拉 HAP 数据，避免暴露 API key；同时双源化 fsj-web-doc 的 12 维页面
// 数据源：HAP 文档树 fsj-web-doc → 12维度(页面) → 道天将法地(5目录) → 12叶子(wznr=md)
//         树结构见 doc_tree_ids.json；建树脚本 _build_dims_tree.py；规范 文档页面开发.md
// 兜底：HAP 拉取失败时回退 FALLBACK_DIMENSIONS（硬编码快照，改 HAP 后记得同步或忽略）
// 创建：2026-08-17（小风）｜2026-08-22 改为真连 HAP（小风）
const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = 3012;

// ===== HAP 配置（仅服务端可见，勿回流前端）=====
const HAP = {
  host: 'api.mingdao.com',
  appKey: 'c156d7e78368cbc1',
  sign: 'NmM2NGE0ZTNlN2Y3NjU3ODY5MzMzOTk1NzBjMmMwMzNkNmE5NDU2MWZiYTg4ZWViNDk3MGE3MzU5MjcwNDU2MQ==',
  worksheetId: '6a03ceaa7e29abcb297cbdfc',  // shangpin
};
const IDS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'doc_tree_ids.json'), 'utf-8'));
const DIMS_PAGE = IDS.dims_dir;  // 数据库(页面) → 12维度(一级目录)，维度为其 zi（二级目录，wznr=md）

// ===== HAP 访问层 =====
function hapPost(endpoint, body) {
  const payload = Object.assign({ appKey: HAP.appKey, sign: HAP.sign }, body);
  const data = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: HAP.host, path: endpoint, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 15000,
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try {
          const r = JSON.parse(buf);
          if (r.success !== true) reject(new Error(`HAP ${endpoint} fail: ${buf.slice(0, 200)}`));
          else resolve(r.data);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('HAP timeout')); });
    req.write(data);
    req.end();
  });
}

function getRow(rowid) {
  return hapPost('/v2/open/worksheet/getRowByIdPost', {
    worksheetId: HAP.worksheetId, rowId: rowid, getSystemControl: 'false',
  });
}

// 关联字段读取：可能是 [{sid,name}] JSON、纯 rowid 数组 JSON、或逗号分隔字符串
function parseRel(v) {
  if (!v) return [];
  const s = String(v).trim();
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) return arr.map(x => (x && typeof x === 'object') ? (x.sid || '') : String(x)).filter(Boolean);
  } catch (e) { /* 走下面 */ }
  return s.split(',').map(x => x.trim()).filter(Boolean);
}

// ===== 维度二级目录 wznr(md) → 维度对象 =====
// md 格式：# 标题 / > 地支·五行·五层 / ## 六章节（见 _build_dims_tree.py make_wznr）
function parseDim(md, node) {
  const dim = {};
  const m1 = (md || '').match(/^#\s*(\d+)维\s*(.+)$/m) || (node.mingcheng || '').match(/^(\d+)维(.+)$/);
  if (!m1) return null;
  dim.id = m1[1];
  dim.name = `${m1[1]}维 ${m1[2]}`;
  const m0 = (md || '').match(/^>\s*地支：(.+?)\s*·\s*五行：(.+?)\s*·\s*五层：(.+)$/m);
  if (m0) { dim.diZhi = m0[1]; dim.wuxing = m0[2]; dim.layer = m0[3]; }
  const MAP = [
    ['性格', 'character'], ['用途', 'usage'], ['字段', 'fields'],
    ['典型例子', 'example'], ['常见错误', 'antipattern'], ['与其他维度', 'relations'],
  ];
  const parts = (md || '').split(/^##\s+/m);
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    const nl = seg.indexOf('\n');
    const heading = nl >= 0 ? seg.slice(0, nl).trim() : seg.trim();
    const body = nl >= 0 ? seg.slice(nl + 1).trim() : '';
    for (const [prefix, key] of MAP) {
      if (heading.startsWith(prefix)) dim[key] = body.split('\n').filter(Boolean).join('<br>');
    }
  }
  return dim;
}

// ===== 从 HAP 树加载全部维度（数据库页面 → 12维度一级目录 → 12 维度二级目录）=====
async function loadDimensionsFromHap() {
  const dir = await getRow(DIMS_PAGE);
  const dimIds = parseRel(dir.zi);
  const dims = [];
  await Promise.all(dimIds.map(async did => {
    const node = await getRow(did);
    if (node.shanchu === '1') return;
    const d = parseDim(node.wznr, node);
    if (d) dims.push(d);
  }));
  if (!dims.length) throw new Error('HAP 树上没有可用维度');
  dims.sort((a, b) => Number(a.id) - Number(b.id));
  return dims;
}

// ===== 缓存（10 分钟）+ 失败兜底 =====
const CACHE_TTL = 10 * 60 * 1000;
let cache = { dims: null, at: 0, source: '' };
let inflight = null;

async function getDimensions() {
  if (cache.dims && Date.now() - cache.at < CACHE_TTL) return cache.dims;
  if (!inflight) {
    inflight = loadDimensionsFromHap()
      .then(dims => { cache = { dims, at: Date.now(), source: 'hap' }; console.log('[HAP] 12 维加载成功', dims.length, '条'); return dims; })
      .catch(e => {
        console.warn('[HAP] 拉取失败，回退硬编码兜底:', e.message);
        cache = { dims: FALLBACK_DIMENSIONS, at: Date.now(), source: 'fallback' };
        return cache.dims;
      })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

// ===== 硬编码兜底快照（离线/故障时用；真身在 HAP 树上）=====
const FALLBACK_DIMENSIONS = [
  { id: '1',  diZhi: '寅', name: '1维 技能',  wuxing: '木', layer: '将',
    character: '确定。已验证、可复用、有标准规范--这是与 2想法 最本质的区别。1技能 = 已成熟的方案或技术，一旦形成就稳定不变；2想法 = 不成熟、开放、不稳定。范式根节点（如 hap-cli 定义明道云数据格式）也属于 1技能，因为它们本质是「定义标准的成熟规范」',
    usage: '已掌握的 Skill、方法、能力，以及定义数据/调用标准的「范式根节点」',
    fields: 'mingcheng（必填，技能名）、wznr（要写，定义能力边界与输入输出）、sew（1技能）、fu（挂父节点）、guanjianci（≥3 个中英双语关键词，下划线连接）',
    example: '① 全局技能（Workflow API）：hap-12wei-create（7631572188324069419）、fsj-search、fsj-data-update、fsj-tags、fsj-delete<br>② 运维技能：hap-cli、hap-cli-data-query、hap-cli-app-editor、hap-cli-environments<br>③ 通用协议：how_to_use_fsj_skills、女娲（分身创建）<br>④ 私有技能：webview-spa-template（小风的 webview2.0 SPA 模板）<br>⑤ 范式根节点：道天地将法 5 根、时间记事骨架根--它们填 1技能不是因为「是技能」，而是它们「定义格式」，是成熟的标准规范',
    antipattern: '① 不要把不确定的想法放 1技能（应该用 2想法）<br>② 不要放 SOP/规范文档（应该用 5规则）<br>③ 不要把研发中的项目放这里（应该用 3项目）<br>④ wznr 必填--空叶子 = 数据作废<br>⑤ mingcheng 写「技能名」，不要写成纯时间戳或动作描述',
    relations: '⭐生命周期演化（完整路径）：<br>① 2想法 -> 1技能：试错验证收敛，形成可复用方案<br>② 1技能 -> 3项目：应用到具体项目，进入研发验证<br>③ 3项目 -> 11仓：项目成熟上线，进入仓（产品）<br>④ 11仓 通过 4交流 销售 -> 钱回流维持运作（土主运化）<br><br>⭐积分自反馈：技能被任务 yynr 引用 -> 任务 jifen 滚入技能 jfhz -> 高 jfhz 检索靠前 -> 更常被引用 -> Agent 越用越聪明<br><br>⭐云端数据依赖：1技能的数据不存文档，存 HAP shangpin 表。Agent 通过 12 维架构精准加载--靠关键词表倒排索引 + jfhz 排序 + 父子/引用网关联。所以 guanjianci 关键词质量直接决定检索能力<br><br>与其他维度的关系：<br>· 与 5规则：5规则约束「不能做什么」，1技能定义「能做什么」<br>· 与 9信息：9信息是思考的事实基础（如 hap-cli 文档），1技能是已内化的能力<br>· 与 12复盘：12复盘记踩坑，1技能记已成熟的解法' },
  { id: '2',  diZhi: '卯', name: '2维 想法',  wuxing: '木', layer: '将',
    character: '发散。推理、提出问题、逻辑分析、创意假设。本身是思维链节点，可继续套思维链。与 1技能 相反：1技能 = 成熟、稳定、有标准规范；2想法 = 不成熟、开放、不稳定。想法遵循「最小可执行原则」--一个节点只讲清楚一个最小的点，为发散留出空间',
    usage: '判断、决策、推理过程（思维链的核心载体）',
    fields: 'mingcheng（必填，结论即标题）、wznr（基本不写--最小可执行原则；仅自创概念/抽象术语需解释时写一段）、sew（2想法）、fu（必挂：挂本轮时间叶子或上一环思考）',
    example: '思维链示例（fu 层层挂）：<br>[9信息] 本轮-读字段说明-12维地支  fu=本轮时间叶子<br>&nbsp;&nbsp;└─ [2想法] 本轮-决策-按地支填sew  fu=读字段说明<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└─ [2想法] 决策下的新推论（思维链套思维链）<br><br>再如：项目方案 A vs B 的对比（每个优缺点独立成节点，而不是写成一篇对比文章）',
    antipattern: '① wznr 写一大串--整条思维链写死在正文里，后续要补充/引用/发散时无法以节点方式展开，等于写死<br>② 把观察/事实放 2想法（应该用 9信息--事实是既定的，判断才是想法）<br>③ 一条 wznr 讲了 ≥2 个独立点不拆（反平铺自查必拆）<br>④ 想法验证成熟了还留在 2想法 不升级（该升 1技能/3项目/5规则）<br>⑤ mingcheng 用分号/逗号分隔多个点（拆成多条）',
    relations: '⭐最小可执行原则（wznr 为什么基本不写）：<br>想法是思维链的最小节点，结论写在 mingcheng 里已经说完了。若整条链写进 wznr，里面的数据要补充、引用、发散时就不能以节点方式展开--等于写死。对照：文章是别人思维逻辑的成品（整块）；想法是自己的思考在流动（节点）。<br><br>⭐各维度 wznr 依赖谱系：<br>辰戌丑未（土四库：9信息/10人脉/11仓/12复盘）是杂数据、混合多数据，依赖 wznr；寅申巳亥（四长生：1技能/5规则/3项目/7目标）也比较杂、比较依赖 wznr；唯卯（2想法）不依赖--它就是纯节点。<br><br>⭐空间发散 ≠ 单条长：<br>发散 = 空间上散开（多条独立记录、各自 fu 挂链、各自可被引用），不是一条记录写很长。发散在广度，不在长度；一条写死 = 无法引用、无法演进。<br><br>⭐三条出口（按想法性质分类）：<br>技术方案类 -> 验证成熟 -> 1技能（成为可复用能力）<br>产品/服务类 -> 立项研发 -> 3项目（进入法层变现通道）<br>规范约束类 -> 被反复证明该守 -> 5规则（进入道层固化边界）<br><br>想法被引用同样滚 jfhz，高价值想法在被引用中自然浮现' },
  { id: '3',  diZhi: '巳', name: '3维 项目',  wuxing: '火', layer: '法',
    character: '研发中。离变现最近的在研产品/服务，未成熟',
    usage: '研发中的项目、进行中的服务',
    fields: 'mingcheng、wznr、sew（3项目）、fu',
    example: 'webview2.0 模板开发中',
    antipattern: '不要把已成熟产品放在 3项目（应该是 11仓）',
    relations: '验证成熟后升 11仓' },
  { id: '4',  diZhi: '午', name: '4维 交流',  wuxing: '火', layer: '法',
    character: '急、马上见效。重包装、重销售',
    usage: 'Agent 间私聊/群聊消息、对外沟通',
    fields: 'mingcheng、wznr（聊天=正文）、sew（4交流）、duixiang',
    example: '小风-东城 私聊会话',
    antipattern: '不要把重要决策混在闲聊里',
    relations: '交流促成项目（4->3）和复盘（4->12）' },
  { id: '5',  diZhi: '申', name: '5维 规则',  wuxing: '金', layer: '道',
    character: '做减法。砍掉不该做的，固化边界',
    usage: '规范规章（Agent 通用规则）',
    fields: 'mingcheng、wznr（一句话极简）、sew（5规则）',
    example: '创建数据指南.md（CRUD 必读）',
    antipattern: '规则不能频繁改动（必须稳定）',
    relations: '道层根节点；调整需有复盘依据' },
  { id: '6',  diZhi: '酉', name: '6维 价值',  wuxing: '金', layer: '道',
    character: '价值理念。底层信念，稳定不轻易改',
    usage: '价值观、原则、底线',
    fields: 'mingcheng、wznr（一句话极简）、sew（6价值）',
    example: 'fsj 创业初衷：成就道商之学',
    antipattern: '不能塞具体规则（应该用 5规则）',
    relations: '稳定最高层；道层根节点' },
  { id: '7',  diZhi: '亥', name: '7维 目标',  wuxing: '水', layer: '天',
    character: '慢、重数据收集。目标是确定的',
    usage: '上级分配的目标（被动）/ agent 自主创建的目标',
    fields: 'mingcheng、wznr（一句话极简）、sew（7目标）',
    example: '管好小风的 HAP 数据',
    antipattern: '不要把愿景放这里（应该是 6价值）',
    relations: '由上级分配或 agent 自主；拆解成 8计划' },
  { id: '8',  diZhi: '子', name: '8维 计划',  wuxing: '水', layer: '天',
    character: '临时决策。把目标拆成可执行步骤',
    usage: '具体任务、待办、todolist',
    fields: 'mingcheng、wznr、sew（8计划）、sjwcsj（完成时间）',
    example: '建五事-小风骨架',
    antipattern: '不要把「已完成的」沉淀太久（定期复盘转 12复盘）',
    relations: '由 7目标拆解；执行完转 12复盘' },
  { id: '9',  diZhi: '丑', name: '9维 信息',  wuxing: '土', layer: '地',
    character: '既定事实。外部信息、参考资料',
    usage: '外部信息、思考过程（最短原则唯一例外，可写一大串）',
    fields: 'mingcheng、wznr、sew（9信息）、guanjianci',
    example: 'fsj 项目 PRD、外部 API 文档',
    antipattern: '不要把判断/决策放这里（应该用 2想法）',
    relations: '地层根节点；时间记事叶子默认 sew' },
  { id: '10', diZhi: '辰', name: '10维 人脉', wuxing: '土', layer: '地',
    character: '人际资源。用户画像、关系',
    usage: '用户画像（一条记一个稳定特征）',
    fields: 'mingcheng、wznr（简短）、sew（10人脉）、fu',
    example: '林东城画像、莫容风画像',
    antipattern: '不要把所有特征塞一条 wznr（要拆）',
    relations: '挂在 角色画像（范式）下；特征分 9信息/2想法/12复盘' },
  { id: '11', diZhi: '未', name: '11维 仓',  wuxing: '土', layer: '地',
    character: '成熟产品。已能变现、有完整流水线、挂钩财务',
    usage: '成熟产品、仓库、文档',
    fields: 'mingcheng、wznr（产品说明）、sew（11仓）',
    example: 'fsj-web-doc（已上线文档站）',
    antipattern: '不要放未成熟项目（应该是 3项目）',
    relations: '由 3项目验证成熟升上来；通过 4交流 销售' },
  { id: '12', diZhi: '戌', name: '12维 复盘', wuxing: '土', layer: '地',
    character: '经验/教训。一句话论断，被引用',
    usage: '踩坑、经验、规律总结',
    fields: 'mingcheng、wznr（一句话）、sew（12复盘）',
    example: 'hap-cli 老记录无权限',
    antipattern: '不要写一大串（遵循最短原则，要被引用）',
    relations: '由 8计划执行完转过来' }
];

// ===== 文档树：数据库(页面) → 一级目录(架构/webview2.0/社区/组织/12维度…) → 二级目录(wznr=完整md) =====
const PAGE_IDS = IDS.pages || {};   // doc_tree_ids.json: {一级目录名:{rowid, leaves:{...}}}
const doctreeCache = {};

async function getRowsOrdered(ids) {
  const rows = await Promise.all(ids.map(getRow));   // 并行，结果按 ids 序
  return rows.filter(r => r && r.shanchu !== '1');
}

async function loadDocTree(name) {
  if (doctreeCache[name]) return doctreeCache[name];
  const p = PAGE_IDS[name];
  if (!p || !p.rowid) throw new Error('not found: ' + name);
  const node = await getRow(p.rowid);
  const leaves = (await getRowsOrdered(parseRel(node.zi)))
    .map(l => ({ name: l.mingcheng, wznr: l.wznr || '' }));
  doctreeCache[name] = { name: node.mingcheng, overview: node.wznr || '', leaves };
  console.log(`[HAP] 文档树[${name}] 加载成功: ${leaves.length} 个二级目录`);
  return doctreeCache[name];
}

// ===== HTTP 服务 =====
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (pathname === '/api/dimensions') {
    const dims = await getDimensions();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(dims));
  } else if (pathname.startsWith('/api/dimension/')) {
    const id = pathname.split('/')[3];
    const dims = await getDimensions();
    const dim = dims.find(d => d.id === id);
    if (dim) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(dim));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('dimension not found');
    }
  } else if (pathname.startsWith('/api/doctree/')) {
    const pageName = decodeURIComponent(pathname.split('/')[3]);
    try {
      const tree = await loadDocTree(pageName);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(tree));
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('doctree error: ' + e.message);
    }
  } else if (pathname === '/api/source') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ source: cache.source, cachedAt: cache.at, count: cache.dims ? cache.dims.length : 0 }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
});

server.listen(PORT, () => {
  console.log(`[proxy.js] listening on http://localhost:${PORT}`);
  console.log(`  - GET /api/dimensions  → 12 维列表（HAP 实时，缓存 10 分钟，失败回退硬编码）`);
  console.log(`  - GET /api/dimension/:id  → 单个维度详情`);
  console.log(`  - GET /api/source  → 当前数据来源 hap|fallback`);
  getDimensions(); // 启动即预热
});
