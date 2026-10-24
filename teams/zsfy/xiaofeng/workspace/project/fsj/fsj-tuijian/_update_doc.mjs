/**
 * 临时脚本：把 web-deploy 文档（3b380799）白名单表补上 tuijian 行
 * 根因修复：文档白名单滞后于服务端，导致「等白名单」信息差
 * 走 Node 代理调 HAP v2 open API（密钥服务端注入）
 */
import { writeFileSync } from 'fs';

const PROXY = 'https://100000whys.cn/mingdao';
const WS = '6a03ceaa7e29abcb297cbdfc';
const ROW = '3b380799-cd64-4ad0-8ad5-77153ef3254b';
const WZNR_CTRL = '6a223553a225020849c93059'; // 文字内容 wznr

async function call(url, input) {
  const res = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, input })
  });
  const data = await res.json();
  // 代理约定：{ data, success, error_code:1 } —— error_code:1 是成功标志，success===false 才是失败
  if (data.success === false) {
    throw new Error('API错误: ' + JSON.stringify(data).slice(0, 300));
  }
  return data;
}

// 1. 拿原文
const rec = await call('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost', {
  worksheetId: WS,
  rowId: ROW
});
const raw = rec.data || rec;
const wznr = raw.content || raw.wznr;   // 2026-10-24 别名英文化：wznr→content
if (!wznr) throw new Error('wznr 为空，结构: ' + JSON.stringify(rec).slice(0, 300));

// 2. 幂等插入 tuijian 行（紧跟 playground 行后）
if (wznr.includes('100000whys.cn/tuijian/')) {
  console.log('文档已含 tuijian 行，跳过（幂等）');
  process.exit(0);
}
const playgroundLine = wznr.split('\n').find(l => l.includes('`playground`') && l.includes('|'));
if (!playgroundLine) throw new Error('找不到 playground 白名单行');
const tuijianLine = '| `tuijian` | https://100000whys.cn/tuijian/ | fsj-tuijian 抖音式推荐页，静态（2026-09-18 服务端已加白名单） |';
const newWznr = wznr.replace(playgroundLine, playgroundLine + '\n' + tuijianLine);

// 3. 写回（备份到本地以防万一）
writeFileSync('_wznr_backup.md', wznr, 'utf8');
const r = await call('https://api.mingdao.com/v2/open/worksheet/editRow', {
  worksheetId: WS,
  rowId: ROW,
  controls: [{ controlId: WZNR_CTRL, value: newWznr }]
});
console.log('editRow 结果:', JSON.stringify(r).slice(0, 200));
console.log('✅ 文档白名单已补 tuijian 行（原文备份在 _wznr_backup.md）');