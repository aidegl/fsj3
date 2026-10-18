// fsj-web-doc 12 维页面动态填充（build.py 构建时内联进 index.html）
// 机制：Router 渲染完 dimensions 路由后派发 content-loaded 事件，本钩子接管填充
// 创建：2026-08-17（小风）

window.addEventListener('content-loaded', async (e) => {
  const h = location.hash.slice(1);
  if (!h.startsWith('dimensions')) return;
  const main = document.getElementById('main-content');
  if (!main) return;

  if (h.startsWith('dimensions/')) {
    // 详情页
    const slug = decodeURIComponent(h.slice('dimensions/'.length));
    let d = await HapClient.getDimension(slug);
    if (!d) {
      // slug 可能是标题（如旧导航「寅 · 1维技能」），按名称兜底匹配
      const dims = await HapClient.getDimensions();
      d = dims.find(x => slug.includes(x.id + ' ') || x.name === slug || (x.diZhi + ' · ' + x.name) === slug) || null;
    }
    if (d) {
      main.innerHTML = `
        <article>
          <div class="hero">
            <div class="hero-badge"><span>●</span> ${d.layer}层 · ${d.wuxing}行</div>
            <h1 class="hero-title">${d.diZhi} · ${d.name}</h1>
            <p class="hero-subtitle">${d.usage}</p>
          </div>
          <blockquote><strong>性格（指导思考方式）：</strong>${d.character}</blockquote>
          <h2>字段速查</h2>
          <p><code>${d.fields}</code></p>
          <h2>典型例子</h2>
          <blockquote>${d.example}</blockquote>
          <h2>常见错误 / 反平铺</h2>
          <blockquote>${d.antipattern}</blockquote>
          <h2>与其他维度的关系</h2>
          <p>${d.relations}</p>
          <p><a href="#dimensions">← 返回 12 维列表</a></p>
        </article>`;
    } else {
      main.innerHTML = `
        <article>
          <div class="hero">
            <div class="hero-badge"><span>●</span> 记忆系统</div>
            <h1 class="hero-title">维度「${slug}」未找到</h1>
            <p class="hero-subtitle">请确认代理服务已启动，或该维度 id 正确。</p>
          </div>
          <p><a href="#dimensions">← 返回 12 维列表</a></p>
        </article>`;
    }
    if (typeof TOC !== 'undefined' && TOC.build) TOC.build();
    return;
  }

  // 列表页
  const el = document.getElementById('dim-list');
  if (!el) return;
  const dims = await HapClient.getDimensions();
  if (!dims.length) {
    el.innerHTML = '<div class="card"><div class="card-title">无法连接代理服务</div>' +
      '<div class="card-desc">12 维数据从 HAP 实时拉取。请先启动：<code>node server/proxy.js</code>（端口 3012），然后刷新本页。</div></div>';
    return;
  }
  el.innerHTML = dims.map(d =>
    '<a class="card" href="#dimensions/' + d.id + '">' +
    '<div class="card-title">' + d.diZhi + ' · ' + d.name + '</div>' +
    '<div class="card-desc">' + d.usage + '</div>' +
    '</a>'
  ).join('');
});