# -*- coding: utf-8 -*-
"""build_index1.py — 从 index0.html 一次性生成 index1.html（HAP 动态版）
包含全部修复：v3 fetch / 正确的 loadBackendTree / 表格版 renderMarkdown / 错误显示
每步替换做字节审计，防误删
"""
import base64, sys
sys.stdout.reconfigure(encoding='utf-8')

def b64(s):
    return base64.b64encode(s.encode('utf-8')).decode('ascii')

APPKEY = 'c156d7e78368cbc1'
SIGN = 'NmM2NGE0ZTNlN2Y3NjU3ODY5MzMzOTk1NzBjMmMwMzNkNmE5NDU2MWZiYTg4ZWViNDk3MGE3MzU5MjcwNDU2MQ=='
DB_PAGE = 'b3960cf0-c291-4c15-b8d1-c31f7489b1c7'

GUIDE = b64('''<div class="hero"><div class="hero-badge"><span>●</span> 后端系统</div><h1 class="hero-title">孚世界后端数据字典</h1><p class="hero-subtitle">数据实时来自 HAP 文档树（fsj-web-doc → 数据库）。只用 HAP 的数据表能力（DIY 方便），不用它的组织角色/角色权限/工作流。</p></div>
<h2>字典使用说明（Agent 必读）</h2>
<h3>一、我们的架构原则</h3>
<ul><li><strong>只用 HAP 的数据表</strong>：把 HAP 当灵活的 DIY 数据库，所有业务存在工作表里</li>
<li><strong>不用 HAP 的组织角色功能</strong>：HAP 自带的组织架构、角色权限体系<strong>没有使用</strong></li>
<li><strong>角色体系自己建</strong>：角色 = <code>用户</code> 表（成员）+ <code>组织角色</code> 表（角色定义），都是普通数据表</li>
<li><strong>不用 HAP 工作流审批</strong>：流程/审批类系统字段全部闲置</li></ul>
<h3>二、系统字段已隐藏</h3>
<p>每张表都有 15 个 HAP 自动添加的系统字段，<strong>本字典已全部隐藏</strong>，只保留业务字段：</p>
<table><thead><tr><th>系统字段别名</th><th>说明</th></tr></thead><tbody>
<tr><td>rowId</td><td>记录ID（系统自动，API 返回 _id）</td></tr>
<tr><td>_owner / _createdBy / _updatedBy</td><td>拥有者 / 创建人 / 修改人</td></tr>
<tr><td>_createdAt / _updatedAt</td><td>创建时间 / 修改时间</td></tr>
<tr><td>_processName / _nodeAssignees 等 9 个</td><td>HAP 工作流审批字段，全部未使用</td></tr>
</tbody></table>
<h3>三、给 Agent 的重要提醒</h3>
<blockquote>使用 hap-cli 或 HAP API 时，返回字段里<strong>会包含上述系统字段</strong>，命令行帮助也可能引导你用 HAP 的组织/角色/权限功能。<br><br>
<strong>请记住：</strong><br>
① 不要把系统字段当业务字段写入<br>
② 不要调 <code>hap app role</code>（HAP 角色权限）——我们的角色在 <code>用户</code> 和 <code>组织角色</code> 表里<br>
③ 不要用 <code>hap department</code>（HAP 组织架构）——我们的组织在 <code>组织</code>、<code>商家/组织</code> 表里<br>
④ 读写一律用 <code>hap worksheet record</code>，字段以本字典为准</blockquote>
<h3>四、字段标识怎么用</h3>
<ul><li><strong>别名（alias）</strong>：拼音缩写，API 调用最常用</li>
<li><strong>字段 ID</strong>：24 位十六进制，筛选/排序时用</li>
<li><strong>★</strong>：该表的标题字段</li></ul>''')

META_NOTE = b64('''<strong>为什么叫「元」？</strong><br>① <strong>元 = 最小单元</strong>：所有信息性数据（商品、文章、评论、12维记忆、积分流水）都拆成最小元数据单元，统一存进一张表，靠 leixing + sew 区分类型。<br>② <strong>元 = 神经元</strong>：每个元数据像大脑神经元，通过 fu（父子）和 yynr（引用）互相连接织成网络——<strong>网的形态就是 Agent 的思维形态</strong>。''')

PART1 = f'''// ===== 后端数据字典（HAP 动态版 · index1 专属）=====
const HAP_CFG = {{
  base: 'https://api.mingdao.com',
  appKey: '{APPKEY}',
  sign: '{SIGN}',
  ws: '6a03ceaa7e29abcb297cbdfc',
  dbPageRowid: '{DB_PAGE}'
}};
const BACKEND_TREE = {{ loaded: false, loading: false, error: '', dirs: [] }};

function hapPost(path, body) {{
  return fetch(HAP_CFG.base + path, {{
    method: 'POST',
    headers: {{ 'Content-Type': 'application/json', 'HAP-Appkey': HAP_CFG.appKey, 'HAP-Sign': HAP_CFG.sign }},
    body: JSON.stringify(body)
  }}).then(r => r.json());
}}

function hapText(v) {{
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v.length) return (typeof v[0] === 'string') ? v[0] : (v[0].name || v[0].value || '');
  return '';
}}

function fetchChildren(parentRowid) {{
  return hapPost('/v3/app/worksheets/' + HAP_CFG.ws + '/rows/list', {{
    pageSize: 100, pageIndex: 1,
    fields: ['mingcheng', 'wznr'],
    filter: {{ type: 'group', logic: 'AND', children: [ {{ type: 'condition', field: 'fu', operator: 'eq', value: parentRowid }} ] }}
  }}).then(r => (r.data && r.data.rows) || []);
}}

function loadBackendTree() {{
  if (BACKEND_TREE.loaded || BACKEND_TREE.loading) return;
  BACKEND_TREE.loading = true;
  fetchChildren(HAP_CFG.dbPageRowid).then(dirs => {{
    const jobs = dirs.map(d =>
      fetchChildren(d.rowId).then(leaves => {{
        BACKEND_TREE.dirs.push({{
          rowid: d.rowId,
          name: hapText(d.mingcheng) || d.rowId,
          leaves: leaves.map(l => ({{
            rowid: l.rowId,
            name: hapText(l.mingcheng),
            wznr: hapText(l.wznr)
          }}))
        }});
      }}).catch(() => {{
        BACKEND_TREE.dirs.push({{ rowid: d.rowId, name: hapText(d.mingcheng) || d.rowId, leaves: [] }});
      }})
    );
    return Promise.all(jobs);
  }}).then(() => {{
    BACKEND_TREE.loaded = true;
    BACKEND_TREE.loading = false;
    const cur = location.hash.slice(1).split('/')[0];
    if (cur === 'hap') Router.handleRoute();
  }}).catch(e => {{
    BACKEND_TREE.loading = false;
    BACKEND_TREE.error = (e && e.message) ? e.message : String(e);
    console.error('[HAP] 文档树加载失败:', e);
    const cur = location.hash.slice(1).split('/')[0];
    if (cur === 'hap') Router.handleRoute();
  }});
}}'''

PART2 = f'''function HapPage() {{
  const h = location.hash.slice(1);
  if (h.startsWith('hap/')) return renderBackendGroup(decodeURIComponent(h.slice(4)));
  return renderBackendIndex();
}}

function renderBackendIndex() {{
  loadBackendTree();
  let cards;
  if (BACKEND_TREE.error) {{
    cards = '<div style="padding:24px 0;color:#e11d48"><b>HAP 加载失败：</b>' + BACKEND_TREE.error + '<br><br><span style="color:var(--text-tertiary);font-size:0.875em">排查：① 看 F12 Console 红色报错 ② 若被浏览器拦截，改用 start-index1.bat（本地 http 服务）打开 ③ appkey/sign 已内置 HAP_CFG</span></div>';
  }} else if (!BACKEND_TREE.loaded) {{
    cards = '<p style="color:var(--text-tertiary);padding:24px 0">⟳ 正在从 HAP 加载文档树…</p>';
  }} else if (!BACKEND_TREE.dirs.length) {{
    cards = '<p style="color:var(--text-tertiary);padding:24px 0">HAP 文档树为空（检查 fsj-web-doc → 数据库 页面的子记录）</p>';
  }} else {{
    cards = BACKEND_TREE.dirs.map(g =>
      '<a class="card" href="#hap/' + encodeURIComponent(g.name) + '"><div class="card-title">' + g.name + '</div><div class="card-desc">' + g.leaves.length + ' 张表 · HAP 实时</div></a>'
    ).join('');
  }}
  return '<article>' + b64u("{GUIDE}") + '<h2>分组目录（HAP 实时）</h2><div class="card-grid">' + cards + '</div></article>';
}}

function renderBackendGroup(gname) {{
  loadBackendTree();
  const g = BACKEND_TREE.dirs.find(x => x.name === gname);
  if (!g) {{
    if (!BACKEND_TREE.loaded) return '<article><h1>' + gname + '</h1><p style="color:var(--text-tertiary)">⟳ 正在从 HAP 加载…</p></article>';
    return renderBackendIndex();
  }}
  let html = '<article><div class="hero"><div class="hero-badge"><span>●</span> ' + g.name + '</div><h1 class="hero-title">' + g.name + '</h1><p class="hero-subtitle">' + g.leaves.length + ' 张表 · 数据来自 HAP 文档树（实时）</p></div><p><a href="#hap">← 返回全部分组</a></p>';
  if (g.name === '内容元数据') html += '<blockquote>' + b64u("{META_NOTE}") + '</blockquote>';
  g.leaves.forEach(l => {{ html += renderMarkdown(l.wznr || ('# ' + l.name)); }});
  return html + '</article>';
}}
'''

MD_NEW = '''function renderMarkdown(md) {
  const lines = md.split('\\n');
  let html = '', inCode = false, inList = false, code = '', items = [];
  const flush = () => { if (items.length) { html += '<ul>' + items.join('') + '</ul>'; items = []; } inList = false; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('\\u0060\\u0060\\u0060')) {
      if (inCode) { html += '<pre><code>' + escapeHtml(code) + '</code></pre>'; code = ''; inCode = false; }
      else { flush(); inCode = true; }
      continue;
    }
    if (inCode) { code += line + '\\n'; continue; }
    if (/^\\s*\\|/.test(line) && i + 1 < lines.length && /^\\s*\\|?[\\s:|-]*-+[\\s:|-]*\\|?\\s*$/.test(lines[i+1])) {
      const tbl = [];
      let k = i;
      while (k < lines.length && /^\\s*\\|/.test(lines[k])) { tbl.push(lines[k]); k++; }
      if (tbl.length >= 2) {
        const cells = r => r.replace(/^\\s*\\|/, '').replace(/\\|\\s*$/, '').split('|').map(c => formatInline(c.trim()));
        let t = '<table><thead><tr>' + cells(tbl[0]).map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>';
        for (let r = 2; r < tbl.length; r++) t += '<tr>' + cells(tbl[r]).map(c => '<td>' + c + '</td>').join('') + '</tr>';
        html += t + '</tbody></table>';
        i = k - 1;
        continue;
      }
    }
    if (line.startsWith('#### ')) { flush(); html += '<h4>' + formatInline(line.slice(5)) + '</h4>'; continue; }
    if (line.startsWith('### ')) { flush(); html += '<h3>' + formatInline(line.slice(4)) + '</h3>'; continue; }
    if (line.startsWith('## ')) { flush(); html += '<h2>' + formatInline(line.slice(3)) + '</h2>'; continue; }
    if (line.startsWith('# ')) { flush(); html += '<h1>' + formatInline(line.slice(2)) + '</h1>'; continue; }
    if (/^\\s*[-*]\\s/.test(line)) { inList = true; items.push('<li>' + formatInline(line.replace(/^\\s*[-*]\\s+/, '')) + '</li>'); continue; }
    if (/^\\s*\\d+\\.\\s/.test(line)) { inList = true; items.push('<li>' + formatInline(line.replace(/^\\s*\\d+\\.\\s+/, '')) + '</li>'); continue; }
    if (line.startsWith('> ')) { flush(); html += '<blockquote>' + formatInline(line.slice(2)) + '</blockquote>'; continue; }
    if (line.trim() === '') { flush(); continue; }
    flush(); html += '<p>' + formatInline(line) + '</p>';
  }
  flush();
  if (inCode) html += '<pre><code>' + escapeHtml(code) + '</code></pre>';
  return html;
}

'''

def audit(label, before, after, removed, inserted):
    print(f'  [{label}] {before} -> {after} bytes (删 {removed}, 增 {inserted})')
    if removed > before * 0.3:
        print(f'  ⚠️ 警告：删除量异常大！')
        return False
    return True

with open('index0.html', 'r', encoding='utf-8') as f:
    html = f.read()
print(f'读取 index0.html: {len(html)} bytes')

# 替换1：BACKEND_DATA → PART1
a = html.find('const BACKEND_DATA = ')
b = html.find(';\n', a)
removed = b + 2 - a
assert audit('BACKEND_DATA→PART1', len(html), len(html) - removed + len(PART1), removed, len(PART1))
html = html[:a] + PART1 + html[b+2:]

# 替换2：精确边界 [HAP渲染段注释, 社区块注释) → PART2（社区块完整保留！）
a2 = html.find('// ===== 后端数据字典路由渲染 =====')
b2 = html.find('// ===== 社区系统')
assert 0 < a2 < b2, f'HAP/社区锚点定位失败: a2={a2} b2={b2}'
removed2 = b2 - a2
assert audit('HapPage段→PART2(精确边界)', len(html), len(html) - removed2 + len(PART2), removed2, len(PART2))
html = html[:a2] + PART2 + html[b2:]

# 替换3：renderMarkdown → 表格版
a3 = html.find('function renderMarkdown(md)')
b3 = html.find('// ===== Router =====')
removed3 = b3 - a3
assert audit('renderMarkdown→表格版', len(html), len(html) - removed3 + len(MD_NEW), removed3, len(MD_NEW))
html = html[:a3] + MD_NEW + html[b3:]

# 替换4：标题
html = html.replace('<title>孚世界 - Agent 群架构</title>',
                    '<title>孚世界 - Agent 群架构（HAP 实时版）</title>')

with open('index1.html', 'w', encoding='utf-8') as f:
    f.write(html)
print(f'\n✓ index1.html 生成: {len(html)} bytes ({len(html)/1024:.1f} KB)')

# 完整性自检
checks = {
    'MD_B64': 'const MD_B64 = ',
    'COMMUNITY': 'const COMMUNITY = ',
    'WEBVIEW_B64': 'const WEBVIEW_B64 = ',
    'WorldviewPage': 'function WorldviewPage()',
    'WebviewPage': 'function WebviewPage()',
    'DocsPage': 'function DocsPage()',
    'loadBackendTree': 'function loadBackendTree()',
    'renderMarkdown(表格版)': 'cells(tbl[0])',
    'Router': 'const Router = ',
}
ok = True
for k, v in checks.items():
    found = v in html
    if not found: ok = False
    print(('  ✓' if found else '  ✗ 缺失'), k)
print('\n全部通过' if ok else '\n❌ 有缺失！')