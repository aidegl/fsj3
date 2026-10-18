// fsj-web-doc 文档页动态加载器（build.py 构建时内联进 index.html）
// 结构：数据库(页面) → 一级目录 → 二级目录(wznr=完整md，## 小标题在 md 里)
// 机制：Router 渲染静态兜底内容后派发 content-loaded；本钩子从 proxy 拉取 HAP 文档树，
//       成功则用 renderMarkdown 渲染替换正文，失败保持静态内容（双源：HAP 真身 + 内嵌快照兜底）
// 创建：2026-08-22（小风）

// 路由 → [一级目录名, 二级目录名]；二级名 null = 目录首页（列卡片）
const DOC_ROUTES = {
  overview:  ['架构', '总览'],
  worldview: ['架构', '世界观'],
  dao:       ['架构', '道天地将法'],
  data:      ['架构', '数据架构'],
  search:    ['架构', '检索机制'],
  integral:  ['架构', '积分系统'],
  team:      ['组织', 'Agent团队'],
  skills:    ['组织', '技能清单'],
  roadmap:   ['组织', '产品路线'],
  plan:      ['组织', '建设计划'],
  kb:        ['组织', '知识库归档'],
};
const COMMUNITY_ROUTES = {
  'community':           '总览',
  'community/overview':  '总览',
  'community/post':      '帖子系统',
  'community/悬赏':       '悬赏接单',
  'community/bounty':    '悬赏接单',
  'community/member':    '成员管理',
  'community/interact':  '互动系统',
  'community/rank':      '排行榜',
  'community/space':     '我的空间',
  'community/agent':     'Agent行为',
  'community/ui':        '商家配置',
};

function docRouteOf(hash) {
  const h = decodeURIComponent(hash);
  if (DOC_ROUTES[h]) return DOC_ROUTES[h];
  if (COMMUNITY_ROUTES[h]) return ['社区', COMMUNITY_ROUTES[h]];
  if (h === 'webview') return ['webview2.0', null, 'webview'];
  if (h.startsWith('webview/')) return ['webview2.0', decodeURIComponent(h.slice(8)), 'webview'];
  if (h === 'mech') return ['检索机制', null, 'mech'];
  if (h.startsWith('mech/')) return ['检索机制', decodeURIComponent(h.slice(5)), 'mech'];
  return null;
}

function renderDocLeaf(cat, leaf) {
  return '<article>'
    + '<div class="hero"><div class="hero-badge"><span>●</span> ' + cat + '</div>'
    + '<h1 class="hero-title">' + leaf.name + '</h1></div>'
    + renderMarkdown(leaf.wznr || '')
    + '</article>';
}

function renderDocIndex(cat, tree, base) {
  const prefix = base || 'webview';
  const cards = tree.leaves.map(l =>
    '<a class="card" href="#' + prefix + '/' + encodeURIComponent(l.name) + '">'
    + '<div class="card-title">' + l.name + '</div>'
    + '<div class="card-desc">' + ((l.wznr || '').length) + ' 字</div></a>'
  ).join('');
  return '<article>'
    + '<div class="hero"><div class="hero-badge"><span>●</span> ' + (tree.name || cat) + '</div>'
    + '<h1 class="hero-title">' + cat + '</h1>'
    + '<p class="hero-subtitle">' + (tree.overview || '') + '</p></div>'
    + '<h2>内容目录</h2><div class="card-grid">' + cards + '</div></article>';
}

window.addEventListener('content-loaded', async () => {
  const target = docRouteOf(location.hash.slice(1));
  if (!target) return;
  const [cat, leafName, base] = target;
  const main = document.getElementById('main-content');
  if (!main) return;
  try {
    const res = await fetch(API_BASE + '/api/doctree/' + encodeURIComponent(cat));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const tree = await res.json();
    if (!tree.leaves || !tree.leaves.length) return;
    if (leafName === null) {
      main.innerHTML = renderDocIndex(cat, tree, base);
    } else {
      const leaf = tree.leaves.find(l => l.name === leafName)
        || (leafName === '总览' && cat === 'webview2.0' ? tree.leaves[0] : null);
      if (!leaf) return;
      main.innerHTML = renderDocLeaf(cat, leaf);
    }
    if (typeof TOC !== 'undefined' && TOC.build) TOC.build();
  } catch (err) {
    console.warn('[doc-loader] HAP 拉取失败，保持静态兜底内容:', err);
  }
});
