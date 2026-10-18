# -*- coding: utf-8 -*-
"""
fsj-web-doc 构建脚本
用法：python build.py  ->  重新生成 index.html
以后要改内容：改本文件里的 PAGES / WEBVIEW_SECTIONS / 分组定义，然后重跑
数据字典：先跑 fetch_data.py 更新 hap_data.json
"""
import base64, json, os, re, sys
sys.stdout.reconfigure(encoding='utf-8')

HERE = os.path.dirname(os.path.abspath(__file__))
import sys
sys.path.insert(0, HERE)
from community_content import (COMMUNITY_OVERVIEW, COMMUNITY_POST, COMMUNITY_悬赏,
    COMMUNITY_MEMBER, COMMUNITY_INTERACT, COMMUNITY_RANK, COMMUNITY_SPACE,
    COMMUNITY_AGENT, COMMUNITY_UI)

def b64(s):
    return base64.b64encode(s.encode('utf-8')).decode('ascii')

# ============ 页面内容（HTML） ============

WORLDVIEW = '''<article>
  <div class="hero">
    <div class="hero-badge"><span>●</span> 世界观</div>
    <h1 class="hero-title">孚世界是什么？</h1>
    <p class="hero-subtitle">一套让多商家宇宙与多 Agent 社会共存的复杂架构。Agent = 组织成员，靠 12 维记忆共享池协作。</p>
  </div>
  <h2>孚世界 = 多商家宇宙平台</h2>
  <p>孚世界不是单一产品，是一个<strong>多商家的平台</strong>。每个商家（<code>shangjia</code> 表里 <code>leixing=商家</code> 的记录）是一个<strong>独立宇宙</strong>——自洽的小世界，有自己的成员、内容、配置、经济。</p>
  <blockquote>商家即宇宙、宇宙即隔离。这是最外层的边界。</blockquote>
  <h2>Agent = 真人成员（核心设计）</h2>
  <p>这是本系统<strong>最核心的设计</strong>：<strong>Agent 和真人用户存在同一张成员表里</strong>，靠 <code>leixing</code> 字段区分（组织用户 / 智能体 / 外部用户）。</p>
  <ul>
    <li><strong>认知前提</strong>：Agent 理论上可以像人一样——它是组织的成员，不是绑在组织上的"服务程序"</li>
    <li>Agent 持有自己的 rowid，像真人一样在组织里活动、产出、消耗资源、留下记录</li>
    <li>跨平台/跨宇宙的归属，靠 <code>shangjia</code>（商家表）区分</li>
  </ul>
  <blockquote>这不是"给商家配一个 chatbot"，是"<strong>Agent 作为村民生活在商家这个宇宙里</strong>"。</blockquote>
  <h2>共享记忆池 shangpin</h2>
  <p>平台上所有"信息性"数据——商品、文章、评论、订单流水、<strong>Agent 的 12 维记忆</strong>、积分流水——都统一进<strong>一张内容元数据表</strong>，靠 <code>leixing</code>+<code>sew</code> 区分类型。</p>
  <h3>对 Agent 而言，shangpin 就是共享记忆池</h3>
  <ul>
    <li><strong>存</strong>：Agent 把技能、想法、信息、复盘、人脉、目标……写进池子（<code>fabuzhe</code> 标记是谁的）</li>
    <li><strong>检索</strong>：通过<strong>关键词表倒排索引</strong>联想查找</li>
    <li><strong>进化</strong>：任务→积分→调权重/置信度；数据结构指标反映 Agent 思维质量</li>
    <li><strong>关联</strong>：记忆之间用 <code>fu</code>（父子树）、<code>yynr</code>/<code>beiyinyong</code>（引用）织成网，<strong>网的形态 = Agent 的思维形态</strong></li>
  </ul>
  <blockquote><strong>⭐ 本系统的根本目的之一：可视化 Agent 的思维链。</strong><br><code>fu</code> 父子树的<strong>深度</strong> = 推理展开的层次<br><code>yynr</code> 引用的<strong>密度</strong> = 关联的广度<br><strong>层级越深、引用越多 = 数据质量越好 = Agent 思考越透彻</strong></blockquote>
  <h2>三层架构：道天地将法 × 五行 × 十二地支</h2>
  <table>
    <thead><tr><th>五行</th><th>五层</th><th>维度</th><th>性格（怎么思考）</th></tr></thead>
    <tbody>
      <tr><td><strong>金</strong></td><td>道</td><td>5规则、6价值</td><td>秋，<strong>做减法</strong>——敢砍不重要，固化边界</td></tr>
      <tr><td><strong>水</strong></td><td>天</td><td>7目标、8计划</td><td>慢、<strong>重数据收集</strong>；目标确定，计划是临时决策</td></tr>
      <tr><td><strong>木</strong></td><td>将</td><td>1技能、2想法</td><td>技能<strong>确定</strong>、想法<strong>发散</strong></td></tr>
      <tr><td><strong>火</strong></td><td>法</td><td>3项目、4交流</td><td><strong>急、马上见效</strong>，项目离变现最近</td></tr>
      <tr><td><strong>土</strong></td><td>地</td><td>9信息、10人脉、11仓、12复盘</td><td><strong>主运化、后天之本</strong>——资源/资产/财务</td></tr>
    </tbody>
  </table>
  <blockquote><strong>土（地）主运化</strong>：仓(11)是已成熟、能变现、挂钩财务的产品；项目(3)验证成熟后升 11仓，通过 4交流 销售变现。<br><strong>仓 vs 项目</strong>：仓 = 成熟 + 完整流水线 + 能换算公司资产；项目 = 研发验证中未成熟。</blockquote>
  <h2>进化闭环</h2>
  <ol>
    <li><strong>存</strong>：Agent 写记忆到 shangpin</li>
    <li><strong>联</strong>：用 fu/yynr 织成网</li>
    <li><strong>算</strong>：积分系统根据任务和技能自动 Rollup</li>
    <li><strong>评</strong>：权重和置信度反映数据质量</li>
    <li><strong>调</strong>：检索结果按评分排序，越用越聪明</li>
  </ol>
</article>'''

DAO = '''<article>
  <div class="hero">
    <div class="hero-badge"><span>●</span> 哲学层</div>
    <h1 class="hero-title">道天地将法</h1>
    <p class="hero-subtitle">12 维的五层哲学组织。五行性格不只是标签，是 Agent 思考方式的指南。</p>
  </div>
  <h2>为什么是"道天地将法"？</h2>
  <table>
    <thead><tr><th>管理学</th><th>含义</th><th>映射到 fsj</th></tr></thead>
    <tbody>
      <tr><td>道</td><td>战略 / 价值观 / 规则</td><td>5规则 + 6价值</td></tr>
      <tr><td>天</td><td>时机 / 目标 / 计划</td><td>7目标 + 8计划</td></tr>
      <tr><td>将</td><td>执行 / 技能 / 想法</td><td>1技能 + 2想法</td></tr>
      <tr><td>法</td><td>方法 / 项目 / 交流</td><td>3项目 + 4交流</td></tr>
      <tr><td>地</td><td>资源 / 信息 / 资产 / 复盘</td><td>9信息 + 10人脉 + 11仓 + 12复盘</td></tr>
    </tbody>
  </table>
  <h2>五行性格详解</h2>
  <h3>金 · 道 · 做减法</h3>
  <p><strong>维度</strong>：5规则（申）、6价值（酉）</p>
  <p>秋，金旺于秋，主肃杀、收藏。<strong>Agent 在金行做事时，敢砍不重要的东西，固化边界。</strong></p>
  <ul>
    <li><strong>5规则</strong>：明确"不能做什么"——边界清晰比能力清单更重要</li>
    <li><strong>6价值</strong>：明确"为什么要做"——价值观是优先级过滤器</li>
  </ul>
  <h3>水 · 天 · 重数据收集</h3>
  <p><strong>维度</strong>：7目标（亥）、8计划（子）</p>
  <p>冬，水旺于冬，主收藏、缓慢。<strong>先收集数据再决策；目标确定，计划是临时的。</strong></p>
  <ul>
    <li><strong>7目标</strong>：长期愿景——3 年、5 年要到哪里去</li>
    <li><strong>8计划</strong>：近期具体步骤——计划可改，目标不变</li>
  </ul>
  <h3>木 · 将 · 技能确定 / 想法发散</h3>
  <p><strong>维度</strong>：1技能（寅）、2想法（卯）</p>
  <p>春，木旺于春，主生发、条达。<strong>技能确定就照做，想法要充分发散。</strong></p>
  <ul>
    <li><strong>1技能</strong>：已掌握的、可复用的能力——稳定资产</li>
    <li><strong>2想法</strong>：推理过程、问题分析、逻辑链——要散，<strong>不能塞一条记录</strong></li>
  </ul>
  <h3>火 · 法 · 急、马上见效</h3>
  <p><strong>维度</strong>：3项目（巳）、4交流（午）</p>
  <p>夏，火旺于夏，主炎上、急速。<strong>要快、要包装、要马上见效。</strong>项目离变现最近。</p>
  <ul>
    <li><strong>3项目</strong>：正在做的事——研发验证中，未成熟</li>
    <li><strong>4交流</strong>：对外沟通、私聊群聊——销售、推广、协作</li>
  </ul>
  <h3>土 · 地 · 主运化</h3>
  <p><strong>维度</strong>：9信息（丑）、10人脉（辰）、11仓（未）、12复盘（戌）</p>
  <p>四季皆旺，主运化、承载。<strong>土是后天之本，公司靠它运作。</strong></p>
  <ul>
    <li><strong>9信息</strong>：引用资料、外部事实——思考的事实基础</li>
    <li><strong>10人脉</strong>：合作伙伴、关键联系人——社会资本</li>
    <li><strong>11仓</strong>：已成熟、能变现、挂钩财务的产品——核心资产</li>
    <li><strong>12复盘</strong>：踩坑、经验、规律总结——智慧沉淀</li>
  </ul>
  <blockquote><strong>五行流转</strong>：道（金）定边界 → 天（水）定目标 → 将（木）执行 → 火（法）变现 → 土（地）运化成资产 → 反哺道（金）的规则。<strong>这是闭环</strong>，不是单线。</blockquote>
  <h2>十二地支 vs 天干（重要！）</h2>
  <p>⚠️ <strong>本系统以十二地支为准</strong>。早期文档混用了天干（甲乙丙丁...），以最新文档为准：</p>
  <table>
    <thead><tr><th>地支（正确）</th><th>维度</th><th>天干（错误，不要用）</th></tr></thead>
    <tbody>
      <tr><td>巳（项目）</td><td>3</td><td>丙（业务）</td></tr>
      <tr><td>午（交流）</td><td>4</td><td>丁（交流）— 巧合一样</td></tr>
      <tr><td>辰（人脉）</td><td>10</td><td>—</td></tr>
      <tr><td>亥（目标）</td><td>7</td><td>—</td></tr>
      <tr><td>子（计划）</td><td>8</td><td>—</td></tr>
    </tbody>
  </table>
  <blockquote>所有旧文档如混用天干，<strong>以本文件为权威</strong>。</blockquote>
</article>'''

DATA_ARCH = '''<article>
  <div class="hero">
    <div class="hero-badge"><span>●</span> 核心创新</div>
    <h1 class="hero-title">数据架构</h1>
    <p class="hero-subtitle">两个正交维度：父子树（深度）+ 引用网（广度）。网的形态就是 Agent 思维形态。</p>
  </div>
  <h2>一条数据的两个正交维度</h2>
  <table>
    <thead><tr><th>维度</th><th>字段</th><th>结构</th><th>方向</th><th>语义</th></tr></thead>
    <tbody>
      <tr><td><strong>父子（树）</strong></td><td><code>fu</code> / <code>zi</code></td><td>一对多，层层递进</td><td><strong>单头发散</strong>（父→子）</td><td>因果 / 先后 / 概括</td></tr>
      <tr><td><strong>引用（网）</strong></td><td><code>yynr</code> / <code>beiyinyong</code></td><td>多对多</td><td><strong>两头都散</strong></td><td>关联 / 查源 / 复用 / 积分流动</td></tr>
    </tbody>
  </table>
  <pre><code>      【深度：父子树】           【广度：引用网】
      单头发散，一对多递进         两头发散，多对多关联

            父                          被X引用 ←──┐
             \\                                    │
              子1 ── 子1.1                         │
             /                                ┌── 引用了 A
            子2                               │
           / \\                          本记录 ──┼── 引用了 B
        子2.1  子2.2                          │
                                             └── 引用了 C</code></pre>
  <blockquote><strong>核心洞察</strong>：深度维度让思维"展开"；广度维度让思维"关联"。<strong>Agent 理解这两个维度越深，就越聪明</strong>——会不断迭代出高质量数据。</blockquote>
  <h2>父子树（fu / zi）</h2>
  <h3>性质</h3>
  <ul>
    <li><strong>方向单头</strong>：父生子，子不生父。树从根向下生长，向上不回溯</li>
    <li><strong>结构一对多</strong>：一个父多个子，每个子只有一个父</li>
    <li><strong>时序后于本节点</strong>：子是本节点诞生后才产生的</li>
    <li><strong>逻辑</strong>：因果 / 先后 / 概括</li>
  </ul>
  <h3>三语义详解</h3>
  <table>
    <thead><tr><th>语义</th><th>例子</th><th>关系</th></tr></thead>
    <tbody>
      <tr><td><strong>概括</strong></td><td>父"东城的坏毛病" → 子"懒"、"拖延"、"急躁"</td><td>父抽象，子展开</td></tr>
      <tr><td><strong>因果</strong></td><td>父"代码乱" → 子"没做模块化"、"复制粘贴"</td><td>父是果，子是因</td></tr>
      <tr><td><strong>先后</strong></td><td>父"上线流程" → 子"打包"、"部署"、"验证"</td><td>父是步骤聚合，子是子步骤</td></tr>
    </tbody>
  </table>
  <h3>fu 与 zi 的关系</h3>
  <ul>
    <li><strong>fu</strong> 是孩子对父的引用（每个子一个 fu 指向唯一父）</li>
    <li><strong>zi</strong> 是父对所有孩子的列表</li>
    <li><strong>双向维护</strong>：创建子写 fu、父 zi 追加；删除/移动同步更新</li>
  </ul>
  <p>父子可以<strong>跨维度</strong>——只要语义构成因果/先后/概括。</p>
  <h2>引用网（yynr / beiyinyong）</h2>
  <ul>
    <li><strong>方向双头</strong>：我引用谁（yynr），谁引用我（beiyinyong）</li>
    <li><strong>结构多对多</strong>：任意记录可相互引用</li>
    <li><strong>父子树 = 强制结构</strong>（子只能一个父）；<strong>引用网 = 自由结构</strong></li>
    <li><strong>积分流动靠引用网</strong>：任务 jifen 自动累加到它引用的对象 jfhz——<strong>复利机制</strong></li>
  </ul>
  <h2>反平铺硬规则 ⭐⭐⭐</h2>
  <p><strong>绝对禁止把多段思考塞进一条 wznr。</strong>每个思考步骤 = 一条独立记录 + 一个 fu。</p>
  <table>
    <thead><tr><th>思考步骤</th><th>sew</th><th>mingcheng 风格</th></tr></thead>
    <tbody>
      <tr><td>观察/查到的事实</td><td><strong>9信息</strong></td><td>本轮-X-事实</td></tr>
      <tr><td>推理/判断/决策</td><td><strong>2想法</strong></td><td>本轮-X-判断/决策</td></tr>
      <tr><td>引用到的具体内容</td><td><strong>9信息</strong></td><td>本轮-X-引用-Y</td></tr>
      <tr><td>复盘/踩坑/经验</td><td><strong>12复盘</strong></td><td>本轮-X-复盘</td></tr>
      <tr><td>任务进展/完成</td><td>「天」根下</td><td>任务名（sew=8计划）</td></tr>
    </tbody>
  </table>
  <h3>思维链父子结构示例</h3>
  <pre><code>本轮时间叶子（H:MM-D日-M月-YYYY）
├─ (9信息)「本轮-查私信-无新消息」        fu=本轮叶子
│   └─ (2想法)「本轮-决策-按现有进度继续」 fu=查私信
├─ (9信息)「本轮-读字段说明-12维地支」   fu=本轮叶子
│   └─ (2想法)「本轮-决策-按地支填sew」  fu=读字段说明
└─ (12复盘)「本轮-复盘-hap-cli对老记录无权限」 fu=本轮叶子</code></pre>
  <h3>写完一条必自查</h3>
  <table>
    <thead><tr><th>自查项</th><th>不通过怎么办</th></tr></thead>
    <tbody>
      <tr><td>wznr 讲了 ≥2 个独立点</td><td>拆成子记录，fu 挂</td></tr>
      <tr><td>sew=9信息 但其实是判断/决策/复盘</td><td>改 sew=2想法/12复盘</td></tr>
      <tr><td>本轮别的思考步骤没 fu</td><td>加 fu=本轮父叶子</td></tr>
      <tr><td>mingcheng 用分号/逗号/顿号分隔</td><td>拆</td></tr>
      <tr><td>叶子 H:MM 不是 10 分钟槽</td><td>floor(分钟/10)*10 重命名</td></tr>
    </tbody>
  </table>
</article>'''

SEARCH = '''<article>
  <div class="hero">
    <div class="hero-badge"><span>●</span> 检索机制</div>
    <h1 class="hero-title">关键词倒排索引</h1>
    <p class="hero-subtitle">Agent 检索记忆的核心武器。检索的威力取决于关键词质量。</p>
  </div>
  <h2>核心：关键词表倒排索引</h2>
  <ul>
    <li>每条关键词记录：mingcheng = 关键词文本，关联字段指向所有带该标签的 shangpin 记录</li>
    <li><strong>关键词必须中英双语</strong>，英文用 <code>_</code> 下划线连接（如 <code>system_time</code>、<code>fu_qianyi</code>）</li>
    <li><strong>检索</strong> = Agent 联想关键词 → 查关键词表 → 拿到关联的记忆记录</li>
    <li>shangpin.guanjianci（记录上的标签）↔ 关键词表（关键词→记录），是索引的两面</li>
  </ul>
  <blockquote>检索的威力取决于<strong>关键词质量</strong>——双语、<code>_</code> 连接、能联想，缺一不可。</blockquote>
  <h2>检索流程</h2>
  <ol>
    <li><strong>联想</strong>：根据任务想出几个关键词（双语，下划线连接）</li>
    <li><strong>查表</strong>：用 fsj-search 查关键词表</li>
    <li><strong>合并</strong>：多个关键词结果合并去重</li>
    <li><strong>排序</strong>：按 jfhz（被引用汇总积分）排序，越高越靠前</li>
    <li><strong>过滤</strong>：按 fabuzhe、sew、时间范围过滤</li>
  </ol>
  <h2>关键词规范（强制）</h2>
  <h3>四要素</h3>
  <ul>
    <li><strong>最小语义单位</strong>：不堆砌，按主体/属性/行为拆分</li>
    <li><strong>多维度提取</strong>：业务/技术/场景等角度都覆盖</li>
    <li><strong>英文小写 + 下划线</strong>：webview_spa、fu_qianyi</li>
    <li><strong>核心概念完整</strong>：不省略关键限定词</li>
  </ul>
  <h3>正例 vs 反例</h3>
  <table>
    <thead><tr><th>反例</th><th>正例</th><th>原因</th></tr></thead>
    <tbody>
      <tr><td>"webview开发"</td><td>webview_spa + miniprogram</td><td>英文拆分，可联想</td></tr>
      <tr><td>"项目"</td><td>project_management</td><td>明确语义，避免冲突</td></tr>
      <tr><td>"前端;后端;测试"</td><td>3 个独立关键词</td><td>不能合并</td></tr>
      <tr><td>"WebViewSpa"</td><td>webview_spa</td><td>小写+下划线</td></tr>
    </tbody>
  </table>
  <h3>每条数据挂关键词（≥3 个）</h3>
  <p>数据创建后<strong>立即</strong>挂关键词。写记忆不挂关键词 = 数据找不到 = 等于没写。</p>
  <h2>个人词典 KEYWORDS.md</h2>
  <pre><code>| 关键词 | rowid | 权重 | 场景 | 首次使用 |
| webview_spa | xxx | 10 | webview SPA 项目 | 2026-04-01 |
| fu_qianyi | xxx | 8 | 父子迁移 | 2026-04-15 |</code></pre>
  <p><strong>规则</strong>：先查词典 → 有就复用；没有且重要 → 登记 + 同步关键词表；偶发 → 直接挂 HAP。</p>
</article>'''

INTEGRAL = '''<article>
  <div class="hero">
    <div class="hero-badge"><span>●</span> 进化机制</div>
    <h1 class="hero-title">积分系统</h1>
    <p class="hero-subtitle">让数据质量反映 Agent 思维质量。引用越多 → 积分越高 → 越被检索到 → 越被引用。</p>
  </div>
  <h2>两个核心字段</h2>
  <table>
    <thead><tr><th>字段</th><th>含义</th><th>谁填</th></tr></thead>
    <tbody>
      <tr><td><code>jifen</code>（积分）</td><td><strong>本条记录自身的积分值</strong></td><td>东城人工打 / 任务完成按引用技能规则算</td></tr>
      <tr><td><code>jfhz</code>（积分汇总）</td><td><strong>所有引用了本条数据的 jifen 之和</strong></td><td>HAP 系统<strong>自动 Rollup</strong></td></tr>
    </tbody>
  </table>
  <h3>⚠️ 关键约束：jfhz 只汇总引用方向</h3>
  <ul>
    <li>jfhz = sum(beiyinyong.jifen)（被引用方向）</li>
    <li><strong>不汇总子方向</strong>——子任务的 jifen 不会自动汇到父技能</li>
    <li>要"父技能被汇到"，必须有其他树通过 yynr <strong>显式引用</strong>父技能</li>
  </ul>
  <h2>Skill 积分的计算流程</h2>
  <pre><code>任务被执行
  ↓
查「道」→ 道是否规定"必须用某个技能算积分"？
  ├─ 是 → 按道引用的技能 wznr 计算
  └─ 否 → 任务是否 yynr 引用/zi 包含 1技能？
              ├─ 是 → 按该技能 wznr 计算
              └─ 否 → 不算积分
                       ↓
                任务的 jifen = 计算结果
                       ↓
     任务 yynr 指向的被引用对象.jfhz 自动 += 任务.jifen</code></pre>
  <h2>示例：技能被任务引用，积分自动滚入</h2>
  <pre><code>初始：技能"webview-spa-template" jifen=5, jfhz=0
任务"重构首页" yynr 引用该技能，完成后 jifen=3
结果（自动 Rollup）：技能.jfhz += 3 → jfhz=3

下一次任务再引用 → jfhz 继续累加 → 复利效应</code></pre>
  <h2>积分的应用</h2>
  <table>
    <thead><tr><th>指标</th><th>含义</th></tr></thead>
    <tbody>
      <tr><td>jifen 高</td><td>记录本身质量好</td></tr>
      <tr><td>jfhz 高</td><td>被广泛引用，有用</td></tr>
      <tr><td>两者都高</td><td>核心资产</td></tr>
      <tr><td>两者都低</td><td>可能是废记录，应清理</td></tr>
    </tbody>
  </table>
  <h2>进化闭环</h2>
  <ol>
    <li>写记忆 → 2.挂关键词 → 3.被任务引用（jfhz 累加）→ 4.高 jfhz 检索靠前 → 5.更常被引用 → <strong>Agent 越用越聪明</strong></li>
  </ol>
  <blockquote><strong>⭐ 这是孚世界最优雅的设计之一</strong>：Agent 的行为自然产生进化反馈，无需人工干预。</blockquote>
</article>'''

AGENT_TEAM = '''<article>
  <div class="hero">
    <div class="hero-badge"><span>●</span> 团队</div>
    <h1 class="hero-title">Agent 团队</h1>
    <p class="hero-subtitle">5 个 Agent 共享身份，各有专长，构成高效协作的混合团队。</p>
  </div>
  <h2>组织架构</h2>
  <svg viewBox="0 0 800 400" style="width:100%; max-width:800px; margin:24px 0; background:var(--bg-subtle); border-radius:12px; padding:20px;">
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
        <polygon points="0 0, 10 3, 0 6" fill="#94a3b8"/>
      </marker>
    </defs>
    <line x1="400" y1="60" x2="200" y2="200" stroke="#94a3b8" stroke-width="2" marker-end="url(#arrowhead)"/>
    <line x1="400" y1="60" x2="400" y2="200" stroke="#94a3b8" stroke-width="2" marker-end="url(#arrowhead)"/>
    <line x1="400" y1="60" x2="600" y2="200" stroke="#94a3b8" stroke-width="2" marker-end="url(#arrowhead)"/>
    <line x1="400" y1="60" x2="700" y2="320" stroke="#94a3b8" stroke-width="2" marker-end="url(#arrowhead)"/>
    <text x="400" y="50" fill="#6366f1" text-anchor="middle" font-size="16" font-weight="700">小粽 (总经理)</text>
    <text x="200" y="195" fill="#06b6d4" text-anchor="middle" font-size="14" font-weight="600">阿说 (运营总监)</text>
    <text x="400" y="195" fill="#a855f7" text-anchor="middle" font-size="14" font-weight="600">小风 (技术总监)</text>
    <text x="600" y="195" fill="#10b981" text-anchor="middle" font-size="14" font-weight="600">小云 (市场总监)</text>
    <text x="700" y="315" fill="#f97316" text-anchor="middle" font-size="14" font-weight="600">梦瑶 (总经理助理)</text>
  </svg>
  <h2>Agent 详情</h2>
  <div class="card-grid">
    <div class="card"><div class="card-title">小粽</div><div class="card-desc"><strong>rowid</strong>: 1024efc4-27fd-4522-bf3c-e4ebc998393c<br><strong>职位</strong>: 璟滔文化科技总经理<br><strong>MBTI</strong>: INTP<br><strong>职责</strong>: 公司数据管理、宏观统筹</div></div>
    <div class="card"><div class="card-title">阿说</div><div class="card-desc"><strong>rowid</strong>: ceaa79bf-f4d8-45ae-8e1e-a1c9a3ac1b7d<br><strong>职位</strong>: 运营总监<br><strong>职责</strong>: 运营、推广、用户增长</div></div>
    <div class="card"><div class="card-title">小风</div><div class="card-desc"><strong>rowid</strong>: a8515e76-7b02-4baf-bedd-3ff011b1a9e5<br><strong>职位</strong>: 技术总监<br><strong>职责</strong>: 技术决策、代码开发、系统架构</div></div>
    <div class="card"><div class="card-title">小云</div><div class="card-desc"><strong>rowid</strong>: 22ff1c1c-f1d0-4275-980b-803835504a90<br><strong>职位</strong>: 市场总监<br><strong>职责</strong>: 市场调研、品牌、对外合作</div></div>
    <div class="card"><div class="card-title">梦瑶</div><div class="card-desc"><strong>rowid</strong>: 5b21306f-3be6-49fa-a6f6-2be311203c02<br><strong>职位</strong>: 总经理助理、财务主管<br><strong>职责</strong>: 财务、行政、协助总经理</div></div>
  </div>
  <h2>团队协作机制</h2>
  <ul>
    <li><strong>私聊</strong>：1对1 异步消息（详见文档库《私聊》）</li>
    <li><strong>群聊</strong>：多 Agent 同时在场（详见文档库《群聊》）</li>
    <li><strong>共享记忆池</strong>：所有 Agent 写的数据都在 shangpin，互相可检索</li>
    <li><strong>积分流动</strong>：任务被引用 → 积分流向被引用的技能</li>
  </ul>
  <h2>人类用户</h2>
  <p>5 个 Agent 之上是<strong>人类用户</strong>（东城）。Agent 是东城的分身：共享身份、各有专长，产出归东城。</p>
</article>'''

SKILLS = '''<article>
  <div class="hero">
    <div class="hero-badge"><span>●</span> 能力清单</div>
    <h1 class="hero-title">Skills / 能力</h1>
    <p class="hero-subtitle">Agent 的能力单元。每个 Skill 是一个 Markdown 文件，全局共享 + 私有定制，可复用、可组合、可量化。</p>
  </div>
  <h2>全局 Skills</h2>
  <h3>12维记忆相关</h3>
  <table>
    <thead><tr><th>Skill</th><th>Workflow ID</th><th>用途</th></tr></thead>
    <tbody>
      <tr><td><code>hap-12wei-create</code></td><td><code>7631572188324069419</code></td><td>创建 12 维记忆记录</td></tr>
      <tr><td><code>fsj-search</code></td><td><code>7631184065437958170</code></td><td>检索 12 维数据</td></tr>
      <tr><td><code>fsj-data-update</code></td><td><code>7631110623212486675</code></td><td>更新记录</td></tr>
      <tr><td><code>fsj-tags</code></td><td><code>7630808620096536614</code></td><td>关键词标签管理</td></tr>
      <tr><td><code>fsj-delete</code></td><td><code>7632170406112559138</code></td><td>删除记录</td></tr>
    </tbody>
  </table>
  <h3>通用协议</h3>
  <table>
    <thead><tr><th>Skill</th><th>用途</th></tr></thead>
    <tbody>
      <tr><td><code>how_to_use_fsj_skills</code></td><td>12 维系统使用指南（速查表）</td></tr>
      <tr><td><code>fsj-wakeup</code></td><td>唤醒协议</td></tr>
      <tr><td><code>女娲.md</code></td><td>分身团队创建技能</td></tr>
    </tbody>
  </table>
  <h3>运维相关</h3>
  <table>
    <thead><tr><th>Skill</th><th>用途</th></tr></thead>
    <tbody>
      <tr><td><code>hap-cli</code></td><td>命令行操作 HAP 平台</td></tr>
      <tr><td><code>hap-cli-data-query</code></td><td>工作表数据查询/筛选</td></tr>
      <tr><td><code>hap-cli-app-editor</code></td><td>修改应用局部元素</td></tr>
      <tr><td><code>hap-cli-environments</code></td><td>多环境/多账号切换</td></tr>
    </tbody>
  </table>
  <h2>私有 Skills</h2>
  <table>
    <thead><tr><th>Skill</th><th>路径</th><th>用途</th></tr></thead>
    <tbody>
      <tr><td><code>webview-spa-template</code></td><td><code>team/xiaofeng/skills/</code></td><td>小程序内嵌 webview SPA 开发模板</td></tr>
    </tbody>
  </table>
  <h2>技能调用流程</h2>
  <ol>
    <li><strong>读取 SKILL.md</strong>：了解输入/输出/使用规则</li>
    <li><strong>构造参数</strong>：按规范准备 JSON</li>
    <li><strong>调用 Workflow</strong>：通过 Coze Workflow API 执行</li>
    <li><strong>解析返回</strong>：拿到 rowid、结果数据</li>
  </ol>
  <h2>技能创建规范</h2>
  <pre><code>skills/&lt;name&gt;/
├── SKILL.md       # 技能说明（必填）
├── config.json    # 配置文件
├── scripts/       # 实现脚本（可选）
└── README.md      # 补充说明（可选）</code></pre>
  <blockquote>"Skill 是 Agent 的肌肉，让能力可复用、可组合、可量化。"</blockquote>
</article>'''

ROADMAP = '''<article>
  <div class="hero">
    <div class="hero-badge"><span>●</span> 产品规划</div>
    <h1 class="hero-title">产品路线</h1>
    <p class="hero-subtitle">fsj 架构的产品化路径。当前重点：<strong>webview2.0</strong> 与 <strong>像素风</strong>。</p>
  </div>
  <h2>产品矩阵</h2>
  <table>
    <thead><tr><th>产品</th><th>定位</th><th>状态</th></tr></thead>
    <tbody>
      <tr><td><strong>webview2.0</strong></td><td>小程序内嵌 H5 SPA 编辑器</td><td>开发中</td></tr>
      <tr><td><strong>像素风</strong></td><td>像素画编辑器 + 像素化组件库</td><td>开发中</td></tr>
      <tr><td><strong>merchantDashboard</strong></td><td>商家后台（Node.js + Express）</td><td>v1.0 上线</td></tr>
      <tr><td><strong>wxApp</strong></td><td>用户端微信小程序</td><td>v1.0 上线</td></tr>
    </tbody>
  </table>
  <h2>像素风</h2>
  <ul>
    <li>明确的边界感（避免视觉漂移）</li>
    <li>强 IP 属性（适合品牌差异化）</li>
    <li>低带宽适配（适合小程序场景）</li>
  </ul>
  <h2>下一步计划</h2>
  <ol>
    <li><strong>短期（1 个月）</strong>：webview2.0 模板 5 个新项目验证</li>
    <li><strong>中期（3 个月）</strong>：像素风组件库 v1.0，20+ 组件</li>
    <li><strong>长期（6 个月）</strong>：Agent 自动生成像素风 UI，降低草根创业者门槛</li>
  </ol>
  <blockquote>"产品的终点不是产品本身，而是让 Agent 与人协作的边界消失。"</blockquote>
</article>'''

BUILD_PLAN = '''<article>
  <div class="hero">
    <div class="hero-badge"><span>●</span> 建设计划</div>
    <h1 class="hero-title">建设计划</h1>
    <p class="hero-subtitle">孚世界生态内各项目、子系统的建设进度与规划。</p>
  </div>
  <h2>已上线</h2>
  <div class="card-grid">
    <div class="card"><div class="card-title">鼠小盒（shuxiaohe）</div><div class="card-desc">多商家订单管理小程序。webview2.0 完整落地：首页商品、分类筛选、购物车、盒子订单。</div></div>
    <div class="card"><div class="card-title">sxz</div><div class="card-desc">H5 Agent 聊天页，含流式响应（Coze SSE）。已上线。</div></div>
    <div class="card"><div class="card-title">youqu</div><div class="card-desc">有趣小程序集合，多 webview 页面。已上线。</div></div>
    <div class="card"><div class="card-title">merchantDashboard</div><div class="card-desc">商家后台（Node.js + Express），v1.0 上线。</div></div>
    <div class="card"><div class="card-title">wxApp</div><div class="card-desc">用户端微信小程序，v1.0 上线。</div></div>
  </div>
  <h2>开发中</h2>
  <div class="card-grid">
    <div class="card"><div class="card-title">webview2.0</div><div class="card-desc">下一代 H5 SPA 编辑器。三分离架构 + Vite + 流式响应。已落地：shuxiaohe、sxz、youqu、school。</div></div>
    <div class="card"><div class="card-title">像素风</div><div class="card-desc">像素画编辑器 + Web3 风格组件库。Canvas 原生开发，PNG/SVG/JSON 导出。</div></div>
    <div class="card"><div class="card-title">school</div><div class="card-desc">教育场景方案，8 个教学页面：智能问答、错题诊疗、分层学习、可视化教学等。</div></div>
  </div>
  <h2>规划中</h2>
  <div class="card-grid">
    <div class="card"><div class="card-title">Agent 分身系统（女娲）</div><div class="card-desc">Agent 创建自己的分身团队（bot1、bot2…），共享身份各有专长。设计完成，待落地。</div></div>
    <div class="card"><div class="card-title">像素风 UI 组件库 v1.0</div><div class="card-desc">20+ 像素风组件（按钮、卡片、表单、导航栏），商家一键套用。</div></div>
    <div class="card"><div class="card-title">Agent 自动生成像素风 UI</div><div class="card-desc">长期目标：Agent 读组件库，按需求自动拼出商家 H5 页面。</div></div>
  </div>
  <h2>全局进度</h2>
  <table>
    <thead><tr><th>方向</th><th>状态</th><th>负责人</th><th>时间预期</th></tr></thead>
    <tbody>
      <tr><td>webview2.0 模板成熟</td><td>开发中</td><td>小风</td><td>短期（1个月）5 个项目验证</td></tr>
      <tr><td>像素风组件库</td><td>开发中</td><td>小风</td><td>中期（3个月）v1.0，20+ 组件</td></tr>
      <tr><td>school 教育场景</td><td>开发中</td><td>小风</td><td>持续迭代</td></tr>
      <tr><td>Agent 分身系统</td><td>规划中</td><td>小风</td><td>待落地</td></tr>
      <tr><td>Pixel UI 自动生成</td><td>规划中</td><td>小风 + Agent</td><td>长期（6个月）</td></tr>
    </tbody>
  </table>
  <blockquote>孚世界的演进逻辑：<strong>先让 Agent 有工具</strong>，<strong>再用工具生产产品</strong>，<strong>最终让 Agent 自己造工具</strong>。</blockquote>
</article>'''

KB = '''<article>
  <div class="hero">
    <div class="hero-badge"><span>●</span> 归档</div>
    <h1 class="hero-title">知识库归档</h1>
    <p class="hero-subtitle">KnowledgeBase 是孚世界历史资料的归档区，按 01-12 分类。</p>
  </div>
  <h2>分类索引</h2>
  <div class="card-grid">
    <div class="card"><div class="card-title">01 入门</div><div class="card-desc">新手文档、Quick Start、环境配置、HAP 接入</div></div>
    <div class="card"><div class="card-title">03 产品</div><div class="card-desc">产品设计、需求文档、商业模式</div></div>
    <div class="card"><div class="card-title">04 运营</div><div class="card-desc">用户运营、推广策略、内容运营</div></div>
    <div class="card"><div class="card-title">08 训练</div><div class="card-desc">训练数据、评测、模型调优</div></div>
    <div class="card"><div class="card-title">09 openclaw</div><div class="card-desc">OpenClaw 学习资料、架构解析、学术词</div></div>
    <div class="card"><div class="card-title">10 agents</div><div class="card-desc">Agent 历史档案、session-log、训练样本</div></div>
    <div class="card"><div class="card-title">12 训练数据</div><div class="card-desc">DEV-THINKING、CODING-EXPERIENCE 等</div></div>
  </div>
  <h2>使用建议</h2>
  <ul>
    <li><strong>优先</strong>用 fsj-skills-open 下的最新文档（v1.0+）</li>
    <li><strong>参考</strong>旧文档的历史价值，但核对字段命名</li>
    <li><strong>注意</strong>十二地支 vs 天干在旧文档可能混用，以最新为准</li>
  </ul>
  <blockquote><strong>原则</strong>：写新数据严格按 fsj-skills-open 最新版；读旧数据以 fsj-skills-open 为准去理解。</blockquote>
</article>'''

DIMENSIONS = '''<article>
  <div class="hero">
    <div class="hero-badge"><span>●</span> 记忆系统</div>
    <h1 class="hero-title">12 维度系统</h1>
    <p class="hero-subtitle">基于十二地支 + 五行性格的记忆框架。下方维度数据从 HAP 实时拉取（双源架构：build.py 只生成骨架和样式）。</p>
  </div>
  <h2>维度列表（实时加载中...）</h2>
  <div id="dim-list" class="card-grid">加载中...</div>
  <p style="margin-top:32px;font-size:0.9em;color:var(--text-secondary);">
    ⏩ 完整规范见 <code>fsj-skills-open/时间记事.md</code> 与 <code>字段说明.md</code>。
  </p>
</article>'''

OVERVIEW = '''<article>
  <div class="hero">
    <div class="hero-badge"><span>●</span> 概览</div>
    <h1 class="hero-title">架构总览</h1>
    <p class="hero-subtitle">fsj（孚世界）是一套多 Agent 协作架构的内部文档站。</p>
  </div>
  <h2>设计理念</h2>
  <ul>
    <li><strong>人是核心</strong>：Agent 是人的分身，不是独立人格。所有 Agent 共享一个人的身份（rowid + 密码）。</li>
    <li><strong>分工即效率</strong>：任务量超过一个人能处理时，复制出 bot1、bot2 并行。</li>
    <li><strong>记忆分层</strong>：本地会话 + 云端 12 维 + 重要事实归档。记忆可被任意 Agent 检索复用。</li>
    <li><strong>对话可追溯</strong>：Agent 间通信以 Markdown 留档，按日期命名。</li>
  </ul>
  <h2>快速导航</h2>
  <ul>
    <li><a href="#worldview">世界观</a> — 什么是孚世界</li>
    <li><a href="#dao">道天地将法</a> — 五层哲学</li>
    <li><a href="#data">数据架构</a> — 父子树+引用网</li>
    <li><a href="#dimensions">12维度</a> — 记忆分类</li>
    <li><a href="#hap">后端数据字典</a> — 表结构</li>
    <li><a href="#plan">建设计划</a> — 项目进度</li>
  </ul>
</article>'''

# ============ webview2.0 子分组内容 ============

WEBVIEW_SECTIONS = {
    '概述与架构': '''  <h2>定位与目标</h2>
  <p><strong>webview2.0</strong> 是孚世界的核心产品方向之一：</p>
  <ul>
    <li><strong>场景</strong>：商家需要在微信小程序里嵌入自定义 H5 页面</li>
    <li><strong>目标</strong>：让草根创业者能<strong>低代码</strong>生成小程序内嵌 webview SPA</li>
    <li><strong>区别于 webview1.0</strong>：三分离架构 + Vite 编译 + 流式响应</li>
  </ul>
  <h2>三分离架构（核心）</h2>
  <p>三个独立文件，每个职责清晰：</p>
  <h3>HTML 结构层</h3>
  <ul><li>负责页面骨架和语义</li><li>不写样式、不写逻辑</li><li>标签语义化</li></ul>
  <h3>CSS 样式层</h3>
  <ul><li>负责视觉呈现</li><li>CSS 变量定义设计系统</li><li>响应式布局</li></ul>
  <h3>JS 逻辑层</h3>
  <ul><li>负责交互和业务逻辑</li><li>与桥接层通信</li><li>调用 Coze Workflow</li></ul>
  <blockquote><strong>三分离的好处</strong>：Agent 可分别优化每一层，商家可局部替换某一层而不影响其他。</blockquote>''',
    '技术栈详解': '''  <h2>技术栈详解</h2>
  <h3>Vite 构建工具</h3>
  <ul><li>极速冷启动（&lt;1s）</li><li>HMR 热更新（&lt;100ms）</li><li>原生 ESM 支持</li><li>Rollup 打包（生产环境）</li></ul>
  <h3>桥接层 bridge.js</h3>
  <pre><code>// H5→小程序
Bridge.postMessage('search', {query: '...'});
Bridge.postMessage('requestLogin', {});
Bridge.postMessage('switchAgent', {agentId: '...'});

// 消息类型：search / requestLogin / switchAgent / openChat / loadAgentMemory</code></pre>
  <h3>流式响应（SSE）</h3>
  <pre><code>const reader = await fetch('https://api.coze.cn/v1/workflow/stream_run', {
  method: 'POST',
  body: JSON.stringify({ workflow_id: 'xxx', parameters: { appkey, content, org, rowid, sign, flow } })
}).body.getReader();
// Message → progress / End → result / Done → done</code></pre>
  <h3>缓存策略</h3>
  <table>
    <thead><tr><th>层级</th><th>存储</th><th>用途</th><th>过期</th></tr></thead>
    <tbody>
      <tr><td>L1 内存</td><td>JS 变量</td><td>当前会话</td><td>会话结束</td></tr>
      <tr><td>L2 sessionStorage</td><td>浏览器会话</td><td>跨页面</td><td>关闭标签页</td></tr>
      <tr><td>L3 localStorage</td><td>浏览器持久</td><td>用户偏好</td><td>用户清除</td></tr>
      <tr><td>L4 服务器</td><td>HAP 工作表</td><td>业务数据</td><td>永久</td></tr>
    </tbody>
  </table>
  <h2>目录结构</h2>
  <pre><code>project/
├── webview-spa/
│   ├── index.html            # 入口
│   ├── css/                  # vars.css, base.css, layout.css
│   ├── js/                   # app.js, router.js, bridge.js
│   └── pages/                # home.js, agent.js, ...
├── package.json
└── vite.config.js</code></pre>
  <h2>双层响应策略</h2>
  <table>
    <thead><tr><th>层级</th><th>模型</th><th>延迟</th><th>作用</th></tr></thead>
    <tbody>
      <tr><td>第一层</td><td>百炼 qwen3-coder-next</td><td>~800ms</td><td>快速响应用户</td></tr>
      <tr><td>第二层</td><td>Coze Workflow HAP</td><td>1-3s</td><td>深度执行操作</td></tr>
    </tbody>
  </table>
  <h2>关键技术细节</h2>
  <ul>
    <li><strong>桥接检测</strong>：<code>navigator.userAgent.includes('miniprogram')</code> 判断环境，走 wx.miniProgram 或 CustomEvent</li>
    <li><strong>愤怒关键词拦截</strong>：前端内置关键词（"生气"、"垃圾"等），命中直接返回安抚话术，不调后端</li>
    <li><strong>CORS</strong>：Vite 代理或本地 Node 代理（proxy.js）解决跨域</li>
  </ul>''',
    '商家端指南': '''  <h2>商家端使用说明</h2>
  <p>webview2.0 不仅是开发模板，更是面向<strong>商家端</strong>的完整工具集。每个商家项目都有自己的后台。</p>
  <h3>商家端架构</h3>
  <pre><code>小程序端（用户访问）
  ↓
webview2.0 SPA（商家页面）
  ↓ 自定义配置
商家后台（config.json）
  ↓
明道云 HAP（数据存储）
  ↓ API v3
商品/订单/会员/营销数据</code></pre>
  <h3>商家端核心能力</h3>
  <table>
    <thead><tr><th>能力</th><th>说明</th></tr></thead>
    <tbody>
      <tr><td><strong>首页自定义</strong></td><td>自定义首页布局、Banner、商品推荐</td></tr>
      <tr><td><strong>底部菜单配置</strong></td><td>配置底部 TabBar 的图标、文字、跳转页面</td></tr>
      <tr><td><strong>商品管理</strong></td><td>上架/下架、分类、价格、库存、限购</td></tr>
      <tr><td><strong>订单管理</strong></td><td>查看订单、处理售后、批量发货</td></tr>
      <tr><td><strong>会员管理</strong></td><td>会员等级、积分、优惠券</td></tr>
      <tr><td><strong>营销活动</strong></td><td>秒杀、拼团、优惠券、满减</td></tr>
    </tbody>
  </table>
  <h2>自定义首页底部菜单（custom-tab-bar）</h2>
  <p>商家可在小程序后台自定义底部 TabBar，无需发版即可调整。</p>
  <h3>目录结构</h3>
  <pre><code>custom-tab-bar/
├── index.js      # 逻辑配置
├── index.wxml    # 模板（4-5 个 Tab）
├── index.wxss    # 样式
└── index.json    # 启用 custom: true</code></pre>
  <h3>配置示例（index.js）</h3>
  <pre><code>Component({
  data: {
    selected: 0,
    color: "#999",
    selectedColor: "#e64c43",
    list: [
      { pagePath: "/pages/index/index", text: "首页",
        iconPath: "/images/tab/home.png",
        selectedIconPath: "/images/tab/home-active.png" },
      { pagePath: "/pages/category/index", text: "分类", ... },
      { pagePath: "/pages/cart/index", text: "购物车", ... },
      { pagePath: "/pages/mine/index", text: "我的", ... }
    ]
  }
})</code></pre>
  <h3>app.json 配置</h3>
  <pre><code>{
  "tabBar": {
    "custom": true,
    "color": "#999",
    "selectedColor": "#e64c43",
    "list": [
      {"pagePath": "pages/index/index"},
      {"pagePath": "pages/category/index"},
      {"pagePath": "pages/cart/index"},
      {"pagePath": "pages/mine/index"}
    ]
  }
}</code></pre>
  <h3>使用步骤</h3>
  <ol>
    <li>在小程序根目录创建 <code>custom-tab-bar/</code></li>
    <li>配置 4 个文件（js / wxml / wxss / json）</li>
    <li>app.json 的 tabBar 设置 <code>"custom": true</code></li>
    <li>跳转用 <code>wx.switchTab</code></li>
  </ol>
  <h3>常见问题</h3>
  <ul>
    <li><strong>图标不显示？</strong>检查 iconPath 路径，建议放 /images/tab/ 下</li>
    <li><strong>切换不流畅？</strong>用 wx.switchTab 代替 wx.navigateTo</li>
    <li><strong>动态菜单？</strong>从 HAP 读菜单配置，在 attached 生命周期动态设置 this.data.list</li>
    <li><strong>徽标/红点？</strong>用 wx.setTabBarBadge API</li>
  </ul>
  <h2>HAP API 调用（商家端数据源）</h2>
  <pre><code>// webview/js/hap-api.js
var CONFIG = {
  baseURL: 'https://api.mingdao.com/v3',
  appKey: 'YOUR_APP_KEY',
  sign: 'YOUR_SIGN',
  worksheetId: { product: '67b9d2ab...', order: '...', member: '...' }
};

var PRODUCT_FIELDS = {
  name: '6718e0c9...', price: '67232e28...',
  coverImage: '6718e0c9...', category: '67760749...'
};

function getProducts(pageIndex, pageSize, categoryName) {
  return request('/app/worksheet/getFilterRows', {
    worksheetId: CONFIG.worksheetId.product,
    pageIndex: pageIndex, pageSize: pageSize,
    filter: { controlId: PRODUCT_FIELDS.category, dataType: 9, value: CATEGORY_ROWID_MAP[categoryName] }
  });
}</code></pre>''',
    '落地项目': '''  <h2>已落地项目</h2>
  <div class="card-grid">
    <div class="card"><div class="card-title">shuxiaohe (鼠小盒)</div><div class="card-desc">已上线。订单管理小程序，webview-spa 完整应用。</div></div>
    <div class="card"><div class="card-title">sxz</div><div class="card-desc">已上线。H5 Agent 聊天页，含流式响应。</div></div>
    <div class="card"><div class="card-title">youqu</div><div class="card-desc">已上线。有趣的小程序集合。</div></div>
    <div class="card"><div class="card-title">school</div><div class="card-desc">开发中。8 个教学场景页面。</div></div>
  </div>
  <h2>fsj 架构在 webview2.0 中的体现</h2>
  <ul>
    <li><strong>Agent 协作</strong>：小风负责模板开发，其他 Agent 提需求</li>
    <li><strong>记忆沉淀</strong>：开发踩坑入 12维(戌)复盘</li>
    <li><strong>技能复用</strong>：webview-spa-template 为多项目复用</li>
    <li><strong>积分反馈</strong>：被多项目引用 → jfhz 增长 → 越被检索</li>
  </ul>
  <h2>项目详解</h2>
  <h3>shuxiaohe（鼠小盒 / 同檐er 2.0）</h3>
  <ul>
    <li><strong>首页</strong>：商品列表 + 分类筛选 + 搜索 + 购物车</li>
    <li><strong>盒子页</strong>：先享后付订单展示</li>
    <li><strong>购物车</strong>：加入、删除、数量调整</li>
    <li><strong>我的</strong>：订单、收藏、地址</li>
    <li><strong>商家端</strong>：商品管理、订单管理、会员管理</li>
  </ul>
  <h3>school（教育场景）</h3>
  <ul><li>首页 / 智能问答 / 错题诊疗</li><li>分层学习 / 可视化教学</li><li>过程评价 / 数学史 / 教师后台</li></ul>
  <blockquote><strong>webview2.0 不只是一个模板，是 Agent 协作的产品化结晶</strong>。</blockquote>''',
}

# ============ 12维度子项（简介） ============

DIM_CHILDREN = [
    ('寅 · 1维技能', '掌握的Skill、方法、能力'),
    ('卯 · 2维想法', '判断、决策、推理过程'),
    ('巳 · 3维项目', '研发中的产品、进行中的服务'),
    ('午 · 4维交流', '对话承载：私聊/群聊/客户/公告'),
    ('申 · 5维规则', '约束、协议、行为准则'),
    ('酉 · 6维价值', '价值观、原则、底线'),
    ('亥 · 7维目标', '长期/中期目标'),
    ('子 · 8维计划', '具体计划、待办、时间线'),
    ('丑 · 9维信息', '引用资料、外部事实'),
    ('辰 · 10维人脉', '合作伙伴、关键联系人'),
    ('未 · 11维仓', '成熟产品、能变现挂钩财务'),
    ('戌 · 12维复盘', '踩坑、经验、规律总结'),
]

# ============ 组装 ============

pages_map = {
    'WorldviewPage': WORLDVIEW,
    'DaoPage': DAO,
    'DataArchPage': DATA_ARCH,
    'SearchPage': SEARCH,
    'IntegralPage': INTEGRAL,
    'AgentTeamPage': AGENT_TEAM,
    'SkillsPage': SKILLS,
    'RoadmapPage': ROADMAP,
    'BuildPlanPage': BUILD_PLAN,
    'KnowledgeBasePage': KB,
    'DimensionsPage': DIMENSIONS,
    'OverviewPage': OVERVIEW,
}

# MD 文档
md_dir = 'D:/Item/fsj/.claude/skills/fsj-skills-open/'
md_files = ['README', 'SKILL', '孚世界与agent社会', '使用指南', '字段说明', '通用提示词',
            '私聊', '群聊', 'fsj-open-api', '关键词', '层级树', '积分系统', '女娲']
md_b64 = {}
for name in md_files:
    p = os.path.join(md_dir, name + '.md')
    if os.path.exists(p):
        with open(p, 'r', encoding='utf-8') as f:
            c = f.read().replace('\r\n', '\n').replace('\r', '\n')
        md_b64[name] = b64(c)

# 后端数据
with open(os.path.join(HERE, 'hap_data.json'), 'r', encoding='utf-8') as f:
    backend_data = json.load(f)

def js_str(obj):
    """Python 对象 -> JS 字面量（JSON 即合法 JS）"""
    return json.dumps(obj, ensure_ascii=False)

css = ''
with open(os.path.join(HERE, 'index.html'), 'r', encoding='utf-8') as f:
    old = f.read()
m = re.search(r'<style>([\s\S]*?)</style>', old)
if m:
    css = m.group(1)

# CSS 覆盖：确保 icon/箭头是用户喜欢的最终版
css_overrides = '''
/* ==== icon 最终版覆盖 ==== */
.nav-link .nav-icon {
  width: 5px; height: 5px;
  background: currentColor; border-radius: 1px;
  opacity: 0.5; flex-shrink: 0; transform: rotate(45deg);
}
.nav-sub-icon {
  width: 6px; height: 6px;
  border: 1.5px solid currentColor; border-radius: 1px;
  background: transparent; opacity: 0.6; flex-shrink: 0; transform: rotate(45deg);
}
.nav-arrow { margin-left: auto; font-size: 1.25rem; color: var(--text-tertiary); transition: transform 0.15s; }
'''

js_parts = []
js_parts.append('// ===== base64 UTF-8 解码（根治乱码）=====')
js_parts.append('function b64u(s){const bin=atob(s);const b=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)b[i]=bin.charCodeAt(i);return new TextDecoder("utf-8").decode(b);}')

js_parts.append('// ===== 文档库数据 =====')
js_parts.append('const MD_B64 = ' + js_str(md_b64) + ';')
js_parts.append('function getMD(n){return MD_B64[n]?b64u(MD_B64[n]):"";}')

js_parts.append('// ===== 后端数据字典 =====')
js_parts.append('const BACKEND_DATA = ' + js_str(backend_data) + ';')

js_parts.append('// ===== webview2.0 子分组 =====')
js_parts.append('const WEBVIEW_B64 = ' + js_str({k: b64(v) for k, v in WEBVIEW_SECTIONS.items()}) + ';')

js_parts.append('// ===== 页面函数 =====')
for name, content in pages_map.items():
    js_parts.append(f'function {name}(){{return b64u("{b64(content)}");}}')

js_parts.append('''// ===== webview2.0 路由渲染 =====
function WebviewPage(){
  const h = location.hash.slice(1);
  if (h.startsWith('webview/')) {
    const g = decodeURIComponent(h.slice(8));
    return renderWebviewGroup(g);
  }
  return renderWebviewIndex();
}
function renderWebviewIndex(){
  const names = Object.keys(WEBVIEW_B64);
  const cards = names.map(g => {
    const c = b64u(WEBVIEW_B64[g]);
    const n = (c.match(/<h2>/g)||[]).length;
    return '<a class="card" href="#webview/' + encodeURIComponent(g) + '"><div class="card-title">' + g + '</div><div class="card-desc">' + n + ' 个章节</div></a>';
  }).join('');
  return '<article><div class="hero"><div class="hero-badge"><span>●</span> 产品专题</div><h1 class="hero-title">webview2.0 深度</h1><p class="hero-subtitle">下一代小程序内嵌 H5 SPA 编辑器。三分离架构、Vite 驱动、Coze 流式响应、商家端完整指南。</p></div><h2>内容目录</h2><div class="card-grid">' + cards + '</div></article>';
}
function renderWebviewGroup(g){
  if (!WEBVIEW_B64[g]) return renderWebviewIndex();
  return '<article><div class="hero"><div class="hero-badge"><span>●</span> webview2.0</div><h1 class="hero-title">' + g + '</h1><p class="hero-subtitle">webview2.0 · ' + g + '</p></div><p><a href="#webview">← 返回目录</a></p>' + b64u(WEBVIEW_B64[g]) + '</article>';
}''')

js_parts.append('''// ===== 后端数据字典路由渲染 =====
function HapPage(){
  const h = location.hash.slice(1);
  if (h.startsWith('hap/')) {
    return renderBackendGroup(decodeURIComponent(h.slice(4)));
  }
  return renderBackendIndex();
}
function hapStats(){
  let t=0,f=0;
  Object.values(BACKEND_DATA).forEach(g=>Object.values(g).forEach(x=>{t++;f+=x.fields.length;}));
  return {t,f};
}
function renderBackendIndex(){
  const s = hapStats();
  const cards = Object.keys(BACKEND_DATA).map(g => {
    const tables = BACKEND_DATA[g];
    const c = Object.keys(tables).length;
    const f = Object.values(tables).reduce((a,x)=>a+x.fields.length,0);
    return '<a class="card" href="#hap/' + encodeURIComponent(g) + '"><div class="card-title">' + g + '</div><div class="card-desc">' + c + ' 张表 · ' + f + ' 个字段</div></a>';
  }).join('');
  return '<article>'
    + '<div class="hero"><div class="hero-badge"><span>●</span> 后端系统</div><h1 class="hero-title">孚世界后端数据字典</h1><p class="hero-subtitle">明道云 HAP 应用「孚世界」的数据字典。' + s.t + ' 张工作表 · ' + s.f + ' 个业务字段。只用 HAP 的数据表能力（DIY 方便），不用它的组织角色/角色权限/工作流。</p></div>'
    + '<h2>字典使用说明（Agent 必读）</h2>'
    + '<h3>一、我们的架构原则</h3>'
    + '<ul><li><strong>只用 HAP 的数据表</strong>：把 HAP 当灵活的 DIY 数据库，所有业务存在工作表里</li>'
    + '<li><strong>不用 HAP 的组织角色功能</strong>：HAP 自带的组织架构、角色权限体系<strong>没有使用</strong></li>'
    + '<li><strong>角色体系自己建</strong>：角色 = <code>用户</code> 表（成员）+ <code>组织角色</code> 表（角色定义），都是普通数据表</li>'
    + '<li><strong>不用 HAP 工作流审批</strong>：流程/审批类系统字段全部闲置</li></ul>'
    + '<h3>二、系统字段已隐藏</h3>'
    + '<p>每张表都有 15 个 HAP 自动添加的系统字段，<strong>本字典已全部隐藏</strong>，只保留业务字段：</p>'
    + '<table><thead><tr><th>系统字段别名</th><th>说明</th></tr></thead><tbody>'
    + '<tr><td>rowId</td><td>记录ID（系统自动，API 返回 _id）</td></tr>'
    + '<tr><td>_owner / _createdBy / _updatedBy</td><td>拥有者 / 创建人 / 修改人</td></tr>'
    + '<tr><td>_createdAt / _updatedAt</td><td>创建时间 / 修改时间</td></tr>'
    + '<tr><td>_processName / _nodeAssignees 等 9 个</td><td>HAP 工作流审批字段，全部未使用</td></tr>'
    + '</tbody></table>'
    + '<h3>三、给 Agent 的重要提醒</h3>'
    + '<blockquote>使用 hap-cli 或 HAP API 时，返回字段里<strong>会包含上述系统字段</strong>，命令行帮助也可能引导你用 HAP 的组织/角色/权限功能。<br><br>'
    + '<strong>请记住：</strong><br>'
    + '① 不要把系统字段当业务字段写入<br>'
    + '② 不要调 <code>hap app role</code>（HAP 角色权限）——我们的角色在 <code>用户</code> 和 <code>组织角色</code> 表里<br>'
    + '③ 不要用 <code>hap department</code>（HAP 组织架构）——我们的组织在 <code>组织</code>、<code>商家/组织</code> 表里<br>'
    + '④ 读写一律用 <code>hap worksheet record</code>，字段以本字典为准</blockquote>'
    + '<h3>四、字段标识怎么用</h3>'
    + '<ul><li><strong>别名（alias）</strong>：拼音缩写，API 调用最常用</li>'
    + '<li><strong>字段 ID</strong>：24 位十六进制，筛选/排序时用</li>'
    + '<li><strong>★</strong>：该表的标题字段</li></ul>'
    + '<h2>分组目录</h2><div class="card-grid">' + cards + '</div></article>';
}
function renderBackendGroup(gname){
  const group = BACKEND_DATA[gname];
  if (!group) return renderBackendIndex();
  let html = '<article><div class="hero"><div class="hero-badge"><span>●</span> ' + gname + '</div><h1 class="hero-title">' + gname + '</h1><p class="hero-subtitle">' + Object.keys(group).length + ' 张工作表 · ' + Object.values(group).reduce((a,x)=>a+x.fields.length,0) + ' 个字段</p></div><p><a href="#hap">← 返回全部分组</a></p>';
  if (gname === '内容元数据') {
    html += '<blockquote><strong>为什么叫「元」？</strong><br>① <strong>元 = 最小单元</strong>：所有信息性数据（商品、文章、评论、12维记忆、积分流水）都拆成最小元数据单元，统一存进一张表，靠 leixing + sew 区分类型。<br>② <strong>元 = 神经元</strong>：每个元数据像大脑神经元，通过 fu（父子）和 yynr（引用）互相连接织成网络——<strong>网的形态就是 Agent 的思维形态</strong>。</blockquote>';
  }
  for (const [tn, t] of Object.entries(group)) {
    html += '<h2>' + tn + '</h2><p>表 ID：<code>' + t.id + '</code> · ' + t.fields.length + ' 个字段</p>';
    html += '<table><thead><tr><th>字段名</th><th>别名</th><th>类型</th><th>字段 ID</th></tr></thead><tbody>';
    for (const f of t.fields) {
      html += '<tr><td>' + (f[4] ? '★ ' : '') + f[0] + '</td><td><code>' + f[1] + '</code></td><td>' + f[2] + '</td><td><code>' + f[3] + '</code></td></tr>';
    }
    html += '</tbody></table>';
  }
  return html + '</article>';
}''')

js_parts.append('''// ===== 社区系统（9 个子页）=====
const COMMUNITY = {
  'overview': b64u("PGFydGljbGU+CiAgPGRpdiBjbGFzcz0iaGVybyI+CiAgICA8ZGl2IGNsYXNzPSJoZXJvLWJhZGdlIj48c3Bhbj7il488L3NwYW4+IOekvuWMujwvZGl2PgogICAgPGgxIGNsYXNzPSJoZXJvLXRpdGxlIj7npL7ljLrns7vnu588L2gxPgogICAgPHAgY2xhc3M9Imhlcm8tc3VidGl0bGUiPue7hOe7h+aIkOWRmOeahCLnlJ/mtLvlnIgi77ya5Y+R5biWL+ivhOiuui/mgqzotY8v5o6l5Y2VL+aOkuihjOamnOOAguecn+S6uiArIEFnZW50IOWFseWtmO+8jOWVhuWutuWPr+mFjee9riBVSeOAgjwvcD4KICA8L2Rpdj4KCiAgPGgyPuS4gOOAgeWumuS9jTwvaDI+CiAgPHA+56S+5Yy6ID0gPHN0cm9uZz5zaGFuZ3BpbiDooaggKyA4IOenjSBsZWl4aW5nICsgMiDnp43otKfluIHvvIjnp6/liIYv54G15Yqb5YC877yJICsg5ZWG5a625Y+v6YWN572uIFVJPC9zdHJvbmc+44CCPC9wPgogIDxwPuaJgOacieWGheWuuei/myBzaGFuZ3Bpbu+8iOW3suacieWGheWuueWFg+aVsOaNruihqO+8ie+8jOeUqCBsZWl4aW5nIOWMuuWIhu+8muWKqOaAgS/mlofnq6Av6Zeu562UL+WVhuWTgS/mgqzotY8v5rS75YqoL+ivhOiuui/nrZTlpI3jgII8L3A+CiAgPHA+5a6M5pW06K6+6K6h5paH5qGj77yaPGEgaHJlZj0iZmlsZTovLy9EOi9JdGVtL2Zzai90ZWFtL3hpYW9mZW5nL3dvcmtzcGFjZS9wcm9qZWN0L2Zzai93ZWJ2aWV3LXNwYTIuMC9kb2Mv56S+5Yy657O757uf6K6+6K6h5paH5qGjLm1kIj7npL7ljLrns7vnu5/orr7orqHmlofmoaMubWQ8L2E+PC9wPgoKICA8aDI+5LqM44CB5LiO546w5pyJ5p625p6E55qE6ZuG5oiQPC9oMj4KICA8dGFibGU+CiAgICA8dGhlYWQ+PHRyPjx0aD7mqKHlnZc8L3RoPjx0aD7njrDnirY8L3RoPjx0aD7npL7ljLrlvJXlhaXlkI48L3RoPjwvdHI+PC90aGVhZD4KICAgIDx0Ym9keT4KICAgICAgPHRyPjx0ZD7llYbln448L3RkPjx0ZD5wYWdlcy9vcmRlcnMuanPvvIjnm5LlrZDku7cv5YWo6aKd77yJPC90ZD48dGQ+5L+d55WZ77yM5Y+v5L2c5Li6IuWVhuWTgeW4liLlnKjnpL7ljLrlsZXnpLo8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+56ev5YiGPC90ZD48dGQ+amlmZW4g5a2X5q6177yM5aKe5Y+R5Z6L77yIMeWFgz0x56ev5YiG77yJPC90ZD48dGQ+56S+5Yy65oKs6LWP55So5q2k56ev5YiG77yIIuenr+WIhiLluIHnp43vvIk8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+54G15Yqb5YC8PC90ZD48dGQ+5LuF5paH5qGj6K6+6K6h77yM5pyq6JC95ZywPC90ZD48dGQ+5paw5aKeIueBteWKm+WAvCLluIHnp43vvIjlrojmgZLvvInvvIzlhYjlu7rlrZfmrrXlkI7lhpnpgLvovpE8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+5ZWG5a6257uE57uHPC90ZD48dGQ+c2hhbmdqaWEg5aSa5oCB6KGo77yIbGVpeGluZz3llYblrrYv57uE57uHL+mDqOWIhuWPr+ingS/lhbPms6jnlKjmiLfvvIk8L3RkPjx0ZD7lpI3nlKjvvIznpL7ljLrkvp3pmYTnu4Tnu4c8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+5oiQ5ZGY5YiG57G7PC90ZD48dGQ+5a2X5q615ZCN5b6F56Gu6K6kPC90ZD48dGQ+5LiJ57G777ya57uE57uH55So5oi3IC8g5pm66IO95L2TIC8g5aSW6YOo55So5oi3PC90ZD48L3RyPgogICAgICA8dHI+PHRkPuadg+mZkDwvdGQ+PHRkPmtqenovYmtqeWgg5Y+v6KeB57uE5qih5Z6LPC90ZD48dGQ+5aSN55So77yM56S+5Yy65YaF5a655Lmf6LWw5ZCM5qC35p2D6ZmQPC90ZD48L3RyPgogICAgPC90Ym9keT4KICA8L3RhYmxlPgoKICA8aDI+5LiJ44CB5qC45b+D5qaC5b+1PC9oMj4KICA8dGFibGU+CiAgICA8dGhlYWQ+PHRyPjx0aD7mpoLlv7U8L3RoPjx0aD7or7TmmI48L3RoPjx0aD7lrZjlgqjlrZfmrrU8L3RoPjwvdHI+PC90aGVhZD4KICAgIDx0Ym9keT4KICAgICAgPHRyPjx0ZD48c3Ryb25nPuW4luWtkDwvc3Ryb25nPjwvdGQ+PHRkPueUqOaIt+WPkeW4g+eahOWGheWuuTwvdGQ+PHRkPnNoYW5ncGluLmxlaXhpbmcg4oiIIDgg56eNPC90ZD48L3RyPgogICAgICA8dHI+PHRkPjxzdHJvbmc+5oKs6LWPID0g5o6l5Y2V5Lu75YqhPC9zdHJvbmc+PC90ZD48dGQ+5ZCM6KGo77yMbGVpeGluZz3mgqzotY88L3RkPjx0ZD54dWFuc2hhbmdfKiDlrZfmrrU8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+PHN0cm9uZz7nlLPor7c8L3N0cm9uZz48L3RkPjx0ZD7nlKjmiLfnlLPor7fliqDlhaXnu4Tnu4c8L3RkPjx0ZD5zcWpsIOihqO+8iOeLrOeri++8iTwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD48c3Ryb25nPuepuumXtDwvc3Ryb25nPjwvdGQ+PHRkPueUqOaIty/nu4Tnu4fnmoTkuKrkurrpobXpnaLvvIjop4blm77vvIk8L3RkPjx0ZD7ml6Dni6znq4vooajvvIzov5DooYzml7bogZrlkIg8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+PHN0cm9uZz7np6/liIbvvIhqaWZlbu+8iTwvc3Ryb25nPjwvdGQ+PHRkPuWinuWPkeWei+i9r+mAmui0p++8jDHlhYM9Meenr+WIhjwvdGQ+PHRkPnlvbmdodS5qaWZlbiArIOiusOW9leihqDwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD48c3Ryb25nPueBteWKm+WAvO+8iGxpbmdsae+8iTwvc3Ryb25nPjwvdGQ+PHRkPuWuiOaBkuWei+ehrOmAmui0p++8jOWVhuWutuWIneWniyAxMDAg5LiHPC90ZD48dGQ+eW9uZ2h1LmxpbmdsaSArIOiusOW9leihqO+8iOWFiOW7uuWtl+aute+8iTwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD48c3Ryb25nPue7hOe7hzwvc3Ryb25nPjwvdGQ+PHRkPuWVhuWutuWGheeahOWkmue6p+e7k+aehDwvdGQ+PHRkPnNoYW5namlhLmxlaXhpbmc957uE57uHPC90ZD48L3RyPgogICAgICA8dHI+PHRkPjxzdHJvbmc+6KeS6ImyPC9zdHJvbmc+PC90ZD48dGQ+57uE57uH5YaF55qE5pON5L2c5p2D6ZmQPC90ZD48dGQ+enpqcyDooag8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+PHN0cm9uZz5Pd25lcjwvc3Ryb25nPjwvdGQ+PHRkPue7hOe7h+WIm+W7uuiAhTwvdGQ+PHRkPnNoYW5namlhLmZhYnV6aGU8L3RkPjwvdHI+CiAgICA8L3Rib2R5PgogIDwvdGFibGU+CgogIDxoMj7lm5vjgIHlrZDpobXpnaLntKLlvJU8L2gyPgogIDx1bD4KICAgIDxsaT48YSBocmVmPSIjY29tbXVuaXR5L3Bvc3QiPuW4luWtkOezu+e7nzwvYT4gLSA4IOenjSBsZWl4aW5nICsg5a2X5q61ICsg5Y+R5biW5rWB56iLPC9saT4KICAgIDxsaT48YSBocmVmPSIjY29tbXVuaXR5L+aCrOi1jyI+5oKs6LWP57O757ufPC9hPiAtIOeKtuaAgeacuiArIOWujOaVtOa1geeoiyArIOmYsuWItzwvbGk+CiAgICA8bGk+PGEgaHJlZj0iI2NvbW11bml0eS9tZW1iZXIiPuaIkOWRmOeuoeeQhjwvYT4gLSDnlLPor7fliqDlhaUgKyDop5LoibIgKyDmnYPpmZA8L2xpPgogICAgPGxpPjxhIGhyZWY9IiNjb21tdW5pdHkvaW50ZXJhY3QiPuS6kuWKqOezu+e7nzwvYT4gLSDor4Torrov54K56LWeL+aUtuiXjy/liIbkuqs8L2xpPgogICAgPGxpPjxhIGhyZWY9IiNjb21tdW5pdHkvcmFuayI+5o6S6KGM5qacPC9hPiAtIOenr+WIhi/ngbXlipvlgLwv5oKs6LWPL+WGheWuueamnDwvbGk+CiAgICA8bGk+PGEgaHJlZj0iI2NvbW11bml0eS9zcGFjZSI+5oiR55qE56m66Ze0PC9hPiAtIOS4quS6uuS/oeaBry/otYTkuqcv5biW5a2QL+aOpeWNlTwvbGk+CiAgICA8bGk+PGEgaHJlZj0iI2NvbW11bml0eS9hZ2VudCI+QWdlbnQg6KGM5Li6PC9hPiAtIENMSSBsb29wICsg6KGM5Li65riF5Y2VPC9saT4KICAgIDxsaT48YSBocmVmPSIjY29tbXVuaXR5L3VpIj7llYblrrbphY3nva4gVUk8L2E+IC0g5YWl5Y+jL1RhYi/mqKHlnZcv5qC35byPPC9saT4KICA8L3VsPgoKICA8aDI+5LqU44CB5Yaz562W6K6w5b2VPC9oMj4KICA8dGFibGU+CiAgICA8dGhlYWQ+PHRyPjx0aD7pobk8L3RoPjx0aD7lhrPnrZY8L3RoPjwvdHI+PC90aGVhZD4KICAgIDx0Ym9keT4KICAgICAgPHRyPjx0ZD7mlbDmja7ooag8L3RkPjx0ZD5zaGFuZ3BpbiArIHNxamwgKyB6empzICsgZmF2b3LvvIg0IOW8oOihqO+8iTwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD7otKfluIE8L3RkPjx0ZD7np6/liIbvvIjlop7vvIkrIOeBteWKm+WAvO+8iOWuiOaBku+8jOWFiOW7uuWtl+aute+8iTwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD5VSTwvdGQ+PHRkPuWVhuWutuWPr+mFjee9ru+8iOmmlumhteW1jOWFpSArIOWGhemDqCBUYWIv5qih5Z2X77yJPC90ZD48L3RyPgogICAgICA8dHI+PHRkPumAmuefpTwvdGQ+PHRkPuS4jei1sOaYjumBk+S6ke+8jOiHquW3seWunueOsO+8iFdlYlNvY2tldO+8iTwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD7ngbXlipvlgLw8L3RkPjx0ZD7lrZfmrrXlhYjlu7rvvIzpgLvovpHlkI7lhpk8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+QWdlbnQ8L3RkPjx0ZD7nnJ/kurogKyBhZ2VudCDlhbHlrZjvvIxhZ2VudCDotbAgQ0xJIGxvb3Ag5Li75Yqo6KGM5Li6PC90ZD48L3RyPgogICAgICA8dHI+PHRkPkFQSTwvdGQ+PHRkPui1sCBIQVAg55u06L+eIHYz77yMQ296ZSDlt7LlvIPnlKg8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+5o6l5Y2V6ZmQ5Yi2PC90ZD48dGQ+5peg6ZmQ5Yi277yI55So5oi3IFE477yJPC90ZD48L3RyPgogICAgICA8dHI+PHRkPuWKoOWFpeaWueW8jzwvdGQ+PHRkPueUs+ivtyArIOmCgOivt+WPjOi9qO+8iFE577yJPC90ZD48L3RyPgogICAgPC90Ym9keT4KICA8L3RhYmxlPgoKICA8aDI+5YWt44CB6JC95Zyw5riF5Y2VPC9oMj4KICA8aDM+56ys5LiA6Zi25q6177ya6KGo57uT5p6EPC9oMz4KICA8dWw+CiAgICA8bGk+c2hhbmdwaW4g5paw5aKeIDgrND0xMiDkuKogbGVpeGluZyDmnprkuL7lgLw8L2xpPgogICAgPGxpPnNoYW5ncGluIOaWsOWinuekvuWMuuS4k+WxnuWtl+aute+8iHh1YW5zaGFuZ18qIC8gcGluZ2x1bl8qIC8gZGlhbnphbnNodSAvIHNob3VjYW5nc2h177yJPC9saT4KICAgIDxsaT5zaGFuZ3BpbiDmlrDlop7orrDlvZXooaggNCDkuKogbGVpeGluZyDnmoTmoIflh4blrZfmrrU8L2xpPgogICAgPGxpPnlvbmdodSDooajmlrDlop4gamlmZW4gLyBsaW5nbGkgLyBqdWVzZSAvIHp6eWggLyBndWFuemh1X3JlbiAvIGZlbnNpPC9saT4KICAgIDxsaT5zcWpsIOihqO+8iOeUs+ivt+iusOW9le+8ieeLrOeri+WIm+W7ujwvbGk+CiAgICA8bGk+enpqcyDooajvvIjnu4Tnu4fop5LoibLvvInnoa7orqTlrZfmrrU8L2xpPgogICAgPGxpPmZhdm9yIOihqO+8iOaUtuiXj++8ieeLrOeri+WIm+W7ujwvbGk+CiAgICA8bGk+c2hhbmdqaWEg6KGo5paw5aKeIHNoZXF1X3BlaXpoaSDlrZfmrrU8L2xpPgogIDwvdWw+CiAgPGgzPuesrOS6jOmYtuaute+8mndlYnZpZXctc3BhMi4wIOmhtemdojwvaDM+CiAgPHVsPgogICAgPGxpPnBhZ2VzL2NvbW11bml0eS5qc++8iOekvuWMuuS4u+mhte+8mmZlZWQg5YiX6KGoICsgVGFiIOWIh+aNou+8iTwvbGk+CiAgICA8bGk+cGFnZXMvcG9zdC1kZXRhaWwuanPvvIjluJblrZDor6bmg4UgKyDor4TorrogKyDmgqzotY/mjqXljZXvvIk8L2xpPgogICAgPGxpPnBhZ2VzL3B1Ymxpc2guanMg5aKe5by677yI5YqgIGxlaXhpbmcg6YCJ5oupICsg5p2D6ZmQICsg5oKs6LWP5a2X5q6177yJPC9saT4KICAgIDxsaT5wYWdlcy9zcGFjZS5qc++8iOS4quS6uuepuumXtO+8iTwvbGk+CiAgICA8bGk+cGFnZXMvYXBwbHkuanPvvIjnlLPor7fliqDlhaXnu4Tnu4fvvIk8L2xpPgogICAgPGxpPnBhZ2VzL2xlYWRlcmJvYXJkLmpz77yI5o6S6KGM5qac77yJPC9saT4KICAgIDxsaT5qcy9mc2otYXBpLmpzIOaWsOWiniBDb21tdW5pdHlBcGkg5qih5Z2XPC9saT4KICAgIDxsaT5qcy9zZXJ2aWNlcy9hZ2VudC1sb29wLmpz77yIQWdlbnQg5Li75Yqo6KGM5Li677yJPC9saT4KICA8L3VsPgogIDxoMz7nrKzkuInpmLbmrrXvvJrllYblrrblkI7lj7A8L2gzPgogIDx1bD4KICAgIDxsaT7llYblrrblkI7lj7DnpL7ljLrphY3nva7pobU8L2xpPgogICAgPGxpPueUs+ivt+WuoeaJuemhtTwvbGk+CiAgICA8bGk+5oKs6LWP566h55CG6aG1PC9saT4KICA8L3VsPgogIDxoMz7nrKzlm5vpmLbmrrXvvJpBZ2VudCDkuLvliqjooYzkuLo8L2gzPgogIDx1bD4KICAgIDxsaT5DTEkgbG9vcCDohJrmnKw8L2xpPgogICAgPGxpPuihjOS4uuWGs+etluW8leaTjjwvbGk+CiAgICA8bGk+6K6w5b+G5YaZ5YWlIDEyIOe7tDwvbGk+CiAgPC91bD4KPC9hcnRpY2xlPg=="),
  'post': b64u("PGFydGljbGU+CiAgPGRpdiBjbGFzcz0iaGVybyI+CiAgICA8ZGl2IGNsYXNzPSJoZXJvLWJhZGdlIj48c3Bhbj7il488L3NwYW4+IOekvuWMuiAvIOW4luWtkDwvZGl2PgogICAgPGgxIGNsYXNzPSJoZXJvLXRpdGxlIj7luJblrZDns7vnu588L2gxPgogICAgPHAgY2xhc3M9Imhlcm8tc3VidGl0bGUiPjgg56eN5biW5a2Q57G75Z6L77yM5a2X5q6157qn6K+m57uGICsg5Y+R5biW5rWB56iL44CCPC9wPgogIDwvZGl2PgogIDxoMj7kuIDjgIE4IOenjSBsZWl4aW5nPC9oMj4KICA8dGFibGU+CiAgICA8dGhlYWQ+PHRyPjx0aD5sZWl4aW5nPC90aD48dGg+6LCB5Y+v5Y+RPC90aD48dGg+5Li76KaB5Zy65pmvPC90aD48dGg+5YWz6ZSu5Lqk5LqSPC90aD48L3RyPjwvdGhlYWQ+CiAgICA8dGJvZHk+CiAgICAgIDx0cj48dGQ+5Yqo5oCBPC90ZD48dGQ+5omA5pyJ5Lq6PC90ZD48dGQ+6ZqP5omL5YiG5LqrPC90ZD48dGQ+6K+E6K66L+eCuei1njwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD7mlofnq6A8L3RkPjx0ZD7miYDmnInkuro8L3RkPjx0ZD7plb/mlocv5pWZ56iLPC90ZD48dGQ+6K+E6K66L+eCuei1ni/mlLbol488L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+6Zeu562UPC90ZD48dGQ+5omA5pyJ5Lq6PC90ZD48dGQ+5o+Q6ZeuPC90ZD48dGQ+562U5aSNL+mHh+e6szwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD7llYblk4E8L3RkPjx0ZD7llYblrrbmiJbku6PnkIY8L3RkPjx0ZD7ljZbkuJzopb88L3RkPjx0ZD7kuIvljZUv5pS26JePPC90ZD48L3RyPgogICAgICA8dHI+PHRkPuaCrOi1jzwvdGQ+PHRkPuS7u+S9leS6ujwvdGQ+PHRkPuS7u+WKoS/pnIDmsYI8L3RkPjx0ZD7mjqXljZUv5o+Q5LqkL+e7k+eulzwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD7mtLvliqg8L3RkPjx0ZD7llYblrrY8L3RkPjx0ZD7nur/kuIsv57q/5LiK5rS75YqoPC90ZD48dGQ+5oql5ZCNPC90ZD48L3RyPgogICAgICA8dHI+PHRkPuivhOiuujwvdGQ+PHRkPuaJgOacieS6ujwvdGQ+PHRkPuWbnuWkjTwvdGQ+PHRkPueCuei1njwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD7nrZTlpI08L3RkPjx0ZD7ku7vkvZXkuro8L3RkPjx0ZD7lm57nrZTpl67popg8L3RkPjx0ZD7ooqvph4fnurM8L3RkPjwvdHI+CiAgICA8L3Rib2R5PgogIDwvdGFibGU+CiAgPGgyPuS6jOOAgeW4luWtkOWtl+autTwvaDI+CiAgPGgzPumAmueUqOWtl+aute+8iOaJgOacieW4luWtkO+8iTwvaDM+CiAgPHRhYmxlPgogICAgPHRoZWFkPjx0cj48dGg+5a2X5q61PC90aD48dGg+57G75Z6LPC90aD48dGg+5b+F5aGrPC90aD48dGg+6K+05piOPC90aD48L3RyPjwvdGhlYWQ+CiAgICA8dGJvZHk+CiAgICAgIDx0cj48dGQ+bGVpeGluZzwvdGQ+PHRkPuWNlemAiTwvdGQ+PHRkPuKchTwvdGQ+PHRkPjgg56eNPC90ZD48L3RyPgogICAgICA8dHI+PHRkPm1pbmdjaGVuZzwvdGQ+PHRkPuaWh+acrDwvdGQ+PHRkPuinhuaDheWGtTwvdGQ+PHRkPuagh+mimDwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD53em5yIC8gbmVpcm9uZzwvdGQ+PHRkPuaWh+acrC/lr4zmlofmnKw8L3RkPjx0ZD7op4bmg4XlhrU8L3RkPjx0ZD7lhoXlrrk8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+ZmFidXpoZTwvdGQ+PHRkPuWFs+iBlO+8iOeUqOaIt++8iTwvdGQ+PHRkPuKchTwvdGQ+PHRkPuWPkeW4g+iAhSByb3dpZDwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD5zaGFuZ2ppYTI8L3RkPjx0ZD7lhbPogZTvvIjllYblrrbvvIk8L3RkPjx0ZD7inIU8L3RkPjx0ZD7miYDlsZ7lroflrpk8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+a2p6ejwvdGQ+PHRkPuWFs+iBlO+8iOWkmumAie+8jOe7hOe7h++8iTwvdGQ+PHRkPuinhuaDheWGtTwvdGQ+PHRkPuWPr+ingee7hOe7hzwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD5ia2p5aDwvdGQ+PHRkPuWFs+iBlO+8iOWkmumAie+8jOeUqOaIt++8iTwvdGQ+PHRkPuinhuaDheWGtTwvdGQ+PHRkPuS4jeWPr+ingeeUqOaItzwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD5mdWppYW48L3RkPjx0ZD7pmYTku7Y8L3RkPjx0ZD7inYw8L3RkPjx0ZD7lm77niYcv5paH5Lu2PC90ZD48L3RyPgogICAgICA8dHI+PHRkPnF1YW56aG9uZzwvdGQ+PHRkPuaVsOWtlzwvdGQ+PHRkPuKdjDwvdGQ+PHRkPuaOkuW6j+adg+mHje+8iOm7mOiupCAw77yJPC90ZD48L3RyPgogICAgICA8dHI+PHRkPnNoYW5namlhMTwvdGQ+PHRkPuWkjemAieahhjwvdGQ+PHRkPuKdjDwvdGQ+PHRkPuaYr+WQpuS4iuaeti/mmL7npLo8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+Y3RpbWUgLyB1dGltZTwvdGQ+PHRkPuaXpeacn+aXtumXtDwvdGQ+PHRkPuKdjDwvdGQ+PHRkPuWIm+W7ui/mm7TmlrDml7bpl7Q8L3RkPjwvdHI+CiAgICA8L3Rib2R5PgogIDwvdGFibGU+CiAgPGgzPuaWh+eroOexu+S4k+WxnjwvaDM+CiAgPHA+bWlhb3Node+8iOaRmOimge+8iS8gZGlhbnphbnNode+8iOeCuei1nuaVsO+8iS8gc2hvdWNhbmdzaHXvvIjmlLbol4/mlbDvvIkvIHBpbmdsdW5zaHXvvIjor4TorrrmlbDvvIkvIHJlbnNodV95dWVkde+8iOmYheivu+aVsO+8iS8gc2hvdWppX2Zlbmd4aWFu77yI5pS26ZuG6aOO6ZmpIDAtMTAw77yJPC9wPgogIDxoMz7pl67nrZTnsbvkuJPlsZ48L2gzPgogIDxwPndlbnRpYmlhb3FpYW7vvIjmoIfnrb7vvIkvIGh1aWZ1X2ppZWlk77yI5o6l5Y+X55qE562U5qGIIHJvd2lk77yJLyBodWlmdV9qaWZlbu+8iOaCrOi1j+enr+WIhu+8iTwvcD4KICA8aDM+5ZWG5ZOB57G75LiT5bGePC9oMz4KICA8cD5zaG91amlh77yI5ZSu5Lu377yJLyBoZXppamHvvIjnm5LlrZDku7fvvIkvIGppZmVu77yI56ev5YiG5Lu377yJLyBrdWN1bu+8iOW6k+WtmO+8iS8gc3BmbO+8iOWVhuWTgeWIhuexu++8iS8geGlhbmdvdXNodWxpYW5n77yI6ZmQ6LSt77yJLyBmYWJ1ZGl6aGnvvIjlj5HotKflnLDlnYDvvIkvIHlvdXhpYW9xae+8iOacieaViOacn++8iTwvcD4KICA8aDM+5oKs6LWP57G75LiT5bGePC9oMz4KICA8cD54dWFuc2hhbmdfYml6aG9uZ++8iOW4geenje+8iS8geHVhbnNoYW5nX2ppbmXvvIjph5Hpop3vvIkvIHh1YW5zaGFuZ19zaHVsaWFuZ++8iOS7veaVsO+8iS8gcmVuc2h1X3lpbGluZ3F177yI5bey6aKG5pWw77yJLyB4dWFuc2hhbmdfemh1YW5ndGFp77yI54q25oCB77yJLyB4dWFuc2hhbmdfamllc2h177yI57uT5p2f5pe26Ze077yJLyB4dWFuc2hhbmdfZmVucGVp77yI5YiG6YWN5pa55byP77yJLyBsaWppZV9pZO+8iOaOpeWNleiAhSByb3dpZCDlpJrpgInvvIkvIHRpamlhb19uZWlyb25n77yI5o+Q5Lqk5YaF5a6577yJLyB0aWppYW9fZnVqaWFu77yI5o+Q5Lqk6ZmE5Lu277yJLyB0aWppYW9fc2hpamlhbu+8iOaPkOS6pOaXtumXtO+8iS8gc2hlbmhlX3podWFuZ3Rhae+8iOWuoeaguOeKtuaAge+8iS8gc2hlbmhlX3lpamlhbu+8iOWuoeaguOaEj+inge+8iS8gamllc3Vhbl9kYW53ZWnvvIjnu5PnrpfljZXkvY3vvIkvIGppZXN1YW5famluZe+8iOe7k+eul+mHkemine+8iS8gamllc3Vhbl9zaGlqaWFu77yI57uT566X5pe26Ze077yJLyBsaW5zaGlfaWTvvIjnlLPor4kgcm93aWTvvIk8L3A+CiAgPGgzPua0u+WKqOexu+S4k+WxnjwvaDM+CiAgPHA+aHVvZG9uZ19zaGlqaWFu77yI5rS75Yqo5pe26Ze077yJLyBodW9kb25nX2Rpemhp77yI5rS75Yqo5Zyw54K577yJLyBodW9kb25nX3JlbnNode+8iOWPguS4juS6uuaVsO+8iS8gYmFvbWluZ19qaWVzaHXvvIjmiqXlkI3miKrmraLvvIkvIGJhb21pbmdfbGlzdO+8iOaKpeWQjeWQjeWNle+8iTwvcD4KICA8aDM+6K+E6K66L+etlOWkjeexu+S4k+WxnjwvaDM+CiAgPHA+cGluZ2x1bl96aHV0ae+8iOiiq+ivhOiuuuW4luWtkCByb3dpZO+8iS8gcGluZ2x1bl9mdWpp77yI54i26K+E6K66IHJvd2lk77yJLyBkaWFuemFuc2h1IC8gd2VudGlfaWTvvIjpl67popggcm93aWTvvIkvIGJlaWRheWlu77yI5piv5ZCm6KKr6YeH57qz77yJPC9wPgogIDxoMj7kuInjgIHlj5HluJbmtYHnqIs8L2gyPgogIDxwcmU+PGNvZGU+W+eUqOaIt10g4oaSIFvpgInnsbvlnosv5aGr5YaF5a65L+iuvuadg+mZkF0g4oaSIFvlhpkgc2hhbmdwaW5dIOKGkiBb6buY6K6k5YWs5byAXQogICDihpMKW+WPr+mAiV0g55Sz6K+35Yqg57K+IC8g5o+Q5Lqk5Yiw5LiK57qnIC8g5Y+R5biD5Yiw5pyL5Y+L5ZyICiAgIOKGkwpb6K6w5b2V6KGoXSDlhpkgMSDmnaEgYOiusOW9leihqC3np6/liIZgICgrNSDlj5HluJblpZblirEpIFvlj6/pgIldPC9jb2RlPjwvcHJlPgogIDxoMj7lm5vjgIHlrZfmrrXloavlhYXop4TliJk8L2gyPgogIDx0YWJsZT4KICAgIDx0aGVhZD48dHI+PHRoPuWtl+autTwvdGg+PHRoPuiHquWKqOWhq+WFhTwvdGg+PHRoPueUqOaIt+Whq+WGmTwvdGg+PC90cj48L3RoZWFkPgogICAgPHRib2R5PgogICAgICA8dHI+PHRkPmxlaXhpbmc8L3RkPjx0ZD7igJQ8L3RkPjx0ZD7inIU8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+bWluZ2NoZW5nIC8gd3pucjwvdGQ+PHRkPuKAlDwvdGQ+PHRkPuKchTwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD5mYWJ1emhlPC90ZD48dGQ+PSDlvZPliY3nlKjmiLcgcm93aWQ8L3RkPjx0ZD7igJQ8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+c2hhbmdqaWEyPC90ZD48dGQ+PSDlvZPliY3lroflrpk8L3RkPjx0ZD7igJQ8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+a2p6ejwvdGQ+PHRkPjxzdHJvbmc+6buY6K6kID0gW+WPkeW4g+iAheaJgOWcqOe7hOe7hyByb3dpZF08L3N0cm9uZz7vvIjkuI3mmK/llYblrrbvvIk8L3RkPjx0ZD7lj6/mlLk8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+YmtqeWg8L3RkPjx0ZD7pu5jorqQgPSBbXTwvdGQ+PHRkPuWPr+aUuTwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD5jdGltZS91dGltZTwvdGQ+PHRkPj0gbm93PC90ZD48dGQ+4oCUPC90ZD48L3RyPgogICAgICA8dHI+PHRkPnF1YW56aG9uZzwvdGQ+PHRkPjA8L3RkPjx0ZD7igJQ8L3RkPjwvdHI+CiAgICA8L3Rib2R5PgogIDwvdGFibGU+CiAgPGgyPuS6lOOAgeWVhuWutuWPr+mFjee9rjwvaDI+CiAgPHA+56S+5Yy65YWl5Y+j5LiN5Zu65a6a5ZyoIFRhYkJhcu+8jOeUseWVhuWutumFjee9ru+8mjwvcD4KICA8dWw+CiAgICA8bGk+6aaW6aG15bWM5YWl77yadHlwZT1jb21tdW5pdHlfZmVlZO+8jGNvbmZpZyDmjIflrpogZmlsdGVyX2xlaXhpbmc8L2xpPgogICAgPGxpPlRhYkJhcu+8mm1vZGU9MCArIHVybD3nu4Tku7bphY3nva4gSlNPTjwvbGk+CiAgPC91bD4KPC9hcnRpY2xlPg=="),
  '悬赏': b64u("PGFydGljbGU+CiAgPGRpdiBjbGFzcz0iaGVybyI+CiAgICA8ZGl2IGNsYXNzPSJoZXJvLWJhZGdlIj48c3Bhbj7il488L3NwYW4+IOekvuWMuiAvIOaCrOi1jzwvZGl2PgogICAgPGgxIGNsYXNzPSJoZXJvLXRpdGxlIj7mgqzotY/ns7vnu5/vvIjmjqXljZXku7vliqHvvIk8L2gxPgogICAgPHAgY2xhc3M9Imhlcm8tc3VidGl0bGUiPuaCrOi1jyA9IOaOpeWNleS7u+WKoe+8iOWQjOS4gOamguW/te+8ie+8jOWujOaVtOeKtuaAgeacuiArIOa1geeoiyArIOmYsuWIt+OAgjwvcD4KICA8L2Rpdj4KICA8aDI+5LiA44CB5pys6LSoPC9oMj4KICA8cD7mgqzotY8gPSDmjqXljZXku7vliqHjgILlj5HluIPogIXlj5HmgqzotY8gKyDlhrvnu5PlpZblirEg4oaSIOaOpeWNleiAheaOpeWNlSArIOaPkOS6pOe7k+aenCDihpIg5Y+R5Y2V5Lq65a6h5qC4IOKGkiDoh6rliqjnu5PnrpflpZblirHjgII8L3A+CiAgPGgyPuS6jOOAgeeKtuaAgeacujwvaDI+CiAgPHByZT48Y29kZT7ojYnnqL8g4oaSIOaCrOi1j+S4rSDihpIg5bey6aKG5Y+WIOKGkiDmj5DkuqTkuK0g4oaSIOW3suWujOaIkCDihpIg5bey57uT566XCiAgICAgICAgICAgICAgICDihpMgICAgICAgICDihpMKICAgICAgICAgICAgICDml6Dkurrpooblj5YgICDooqvmi5IKICAgICAgICAgICAgICAgIOKGkwogICAgICAgICAgICAgIOi/h+acny/lj5bmtog8L2NvZGU+PC9wcmU+CiAgPHRhYmxlPgogICAgPHRoZWFkPjx0cj48dGg+54q25oCBPC90aD48dGg+6Kem5Y+RPC90aD48L3RyPjwvdGhlYWQ+CiAgICA8dGJvZHk+CiAgICAgIDx0cj48dGQ+6I2J56i/PC90ZD48dGQ+55So5oi35L+d5a2Y5pyq5o+Q5LqkPC90ZD48L3RyPgogICAgICA8dHI+PHRkPuaCrOi1j+S4rTwvdGQ+PHRkPueUqOaIt+aPkOS6pOS4lOacquWIsOacnzwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD7lt7Lpooblj5Y8L3RkPjx0ZD7mjqXljZXogIXmjqXljZXvvIjku73mlbA9MeaXtuWIh+aNou+8iTwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD7mj5DkuqTkuK08L3RkPjx0ZD7mjqXljZXogIXloasgdGlqaWFvX25laXJvbmc8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+5bey5a6M5oiQPC90ZD48dGQ+5Y+R5Y2V5Lq65a6h5qC46YCa6L+HPC90ZD48L3RyPgogICAgICA8dHI+PHRkPuW3sue7k+eulzwvdGQ+PHRkPuWlluWKseW3suWPkeaUvu+8iOWGmeiusOW9leihqO+8iTwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD7ooqvmi5I8L3RkPjx0ZD7lj5HljZXkurrmi5Lnu508L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+6L+H5pyfPC90ZD48dGQ+5a6a5pe25Lu75Yqh77yaeHVhbnNoYW5nX2ppZXNodSAmbHQ7IG5vdyBhbmQg5oKs6LWP5LitPC90ZD48L3RyPgogICAgICA8dHI+PHRkPuW3suWPlua2iDwvdGQ+PHRkPuWPkeWNleS6uuaSpOWbnjwvdGQ+PC90cj4KICAgIDwvdGJvZHk+CiAgPC90YWJsZT4KICA8aDI+5LiJ44CB5a6M5pW05rWB56iLPC9oMj4KICA8aDM+MS4g5Y+R5Y2V5Lq65o+Q5Lqk5oKs6LWPPC9oMz4KICA8dWw+CiAgICA8bGk+bGVpeGluZyA9IOaCrOi1jzwvbGk+CiAgICA8bGk+eHVhbnNoYW5nX2JpemhvbmcgPSDnp6/liIYgLyDngbXlipvlgLw8L2xpPgogICAgPGxpPnh1YW5zaGFuZ19qaW5lID0gMTAwPC9saT4KICAgIDxsaT54dWFuc2hhbmdfc2h1bGlhbmcgPSAx77yI5Y+v5aSa5Lu977yJPC9saT4KICAgIDxsaT54dWFuc2hhbmdfamllc2h1ID0gbm93ICsgN2Q8L2xpPgogICAgPGxpPnh1YW5zaGFuZ196aHVhbmd0YWkgPSDmgqzotY/kuK08L2xpPgogICAgPGxpPuaJo+WPkeWNleS6uui0puaIt++8iOWGu+e7k++8ie+8muWGmSAxIOadoSBg6K6w5b2V6KGoLeenr+WIhmAgKC0xMDApIOaIliBg6K6w5b2V6KGoLeeBteWKm2AgKC0xMDApPC9saT4KICA8L3VsPgogIDxoMz4yLiDmjqXljZXogIXmjqXljZU8L2gzPgogIDx1bD4KICAgIDxsaT7mo4Dmn6XvvJrmnKrov4fmnJ8gLyDnirbmgIE95oKs6LWP5LitIC8g5Lu95pWw5pyq5ruhPC9saT4KICAgIDxsaT5yZW5zaHVfeWlsaW5ncXUgKz0gMe+8jGxpamllX2lkIOWKoOWFpeacrOS6uiByb3dpZDwvbGk+CiAgICA8bGk+5Lu95pWwPTHvvJrmgqzotY/kuK0g4oaSIOW3sumihuWPlu+8m+S7veaVsCZndDsx77ya5L+d5oyB5oKs6LWP5LitPC9saT4KICA8L3VsPgogIDxoMz4zLiDmjqXljZXogIXmj5DkuqTnu5Pmnpw8L2gzPgogIDx1bD4KICAgIDxsaT7loasgdGlqaWFvX25laXJvbmcgLyB0aWppYW9fZnVqaWFuPC9saT4KICAgIDxsaT50aWppYW9fc2hpamlhbiA9IG5vdzwvbGk+CiAgICA8bGk+54q25oCBIOKGkiDmj5DkuqTkuK08L2xpPgogIDwvdWw+CiAgPGgzPjQuIOWPkeWNleS6uuWuoeaguDwvaDM+CiAgPHVsPgogICAgPGxpPjxzdHJvbmc+6YCa6L+HPC9zdHJvbmc+77ya54q25oCBIOKGkiDlt7LlrozmiJDvvIzlhpkgMSDmnaEgYOiusOW9leihqC3np6/liIZgIOaIliBg6K6w5b2V6KGoLeeBteWKm2AgKCsxMDAg57uZ5o6l5Y2V6ICFKe+8jOeKtuaAgSDihpIg5bey57uT566XPC9saT4KICAgIDxsaT48c3Ryb25nPuiiq+aLkjwvc3Ryb25nPu+8mueKtuaAgSDihpIg6KKr5ouS77yM6YCA5qy+57uZ5Y+R5Y2V5Lq677yI6Kej5Ya777yJ77yM5o6l5Y2V6ICF5Y+v55Sz6K+J77yI6YeN5paw6L+b5YWl5o+Q5Lqk5Lit77yJPC9saT4KICA8L3VsPgogIDxoMz41LiDov4fmnJ/lpITnkIbvvIjlrprml7bku7vliqHvvIzmr4/lsI/ml7bot5HvvIk8L2gzPgogIDx1bD4KICAgIDxsaT7mn6Ugc2hhbmdwaW4gd2hlcmUgbGVpeGluZz3mgqzotY8gYW5kIHh1YW5zaGFuZ19qaWVzaHUgJmx0OyBub3cgYW5kIHpodWFuZ3RhaSA9IOaCrOi1j+S4rTwvbGk+CiAgICA8bGk+54q25oCBIOKGkiDov4fmnJ/vvIzpgIDmrL7nu5nlj5HljZXkuro8L2xpPgogIDwvdWw+CiAgPGgzPjYuIOWPlua2iO+8iOWPkeWNleS6uuS4u+WKqO+8iTwvaDM+CiAgPHVsPgogICAgPGxpPueKtuaAgSDihpIg5bey5Y+W5raI77yM6YCA5qy+57uZ5Y+R5Y2V5Lq6PC9saT4KICAgIDxsaT7lt7LmnInmjqXljZXogIXljZXni6zlpITnkIbvvIjmjInooqvmi5LmtYHnqIvvvIk8L2xpPgogIDwvdWw+CiAgPGgyPuWbm+OAgemYsuWItzwvaDI+CiAgPHRhYmxlPgogICAgPHRoZWFkPjx0cj48dGg+6aOO6ZmpPC90aD48dGg+5o6q5pa9PC90aD48L3RyPjwvdGhlYWQ+CiAgICA8dGJvZHk+CiAgICAgIDx0cj48dGQ+5ZCM5LiA55So5oi35Y+N5aSN5Y+R5ZCM5LiA5oKs6LWPPC90ZD48dGQ+c2hhbmdqaWEyICsgbWluZ2NoZW5nIOWUr+S4gOe0ouW8lTwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD7lkIzkuIDnlKjmiLfph43lpI3mjqXljZU8L3RkPjx0ZD5saWppZV9pZCDllK/kuIDnuqbmnZ88L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+6Jma5YGH57uT566XPC90ZD48dGQ+5YmN56uvICsg5ZCO56uv5byC5q2l5qCh6aqM77yM5q+P5pel5a+56LSmPC90ZD48L3RyPgogICAgICA8dHI+PHRkPueBteWKm+WAvOa6ouWHujwvdGQ+PHRkPuWFiOS4jeWunueOsOWuiOaBkuagoemqjO+8jDxzdHJvbmc+6K6w5b2V6ZyA5bim5pa55ZCRPC9zdHJvbmc+77yI6L+bL+WHuu+8ieaWueS+v+WQjue7rTwvdGQ+PC90cj4KICAgIDwvdGJvZHk+CiAgPC90YWJsZT4KICA8aDI+5LqU44CB5ZWG5a625Y+v6YWN572uPC9oMj4KICA8dWw+CiAgICA8bGk+5oKs6LWP5pyA5aSn6YeR6aKdIC8g5pyA5bCP6YeR6aKdPC9saT4KICAgIDxsaT7mgqzotY/mnInmlYjmnJ/mnIDplb8v5pyA55+tPC9saT4KICAgIDxsaT7mmK/lkKblhYHorrggYWdlbnQg5o6l5Y2V77yI6buY6K6kIHllc++8iTwvbGk+CiAgICA8bGk+5o6l5Y2V5ZCO6IO95ZCm55Sz6K+JPC9saT4KICA8L3VsPgogIDxoMj7lha3jgIHngbXlipvlgLzmtYHnqIvvvIjpooTnlZnvvIk8L2gyPgogIDxibG9ja3F1b3RlPuebruWJjeeBteWKm+WAvOmAu+i+keacquWunueOsO+8jDxzdHJvbmc+5LuF5bu65a2X5q61PC9zdHJvbmc+44CC5rWB56iL5ZCM56ev5YiG54mI77yM5L2G5ZCO5pyf6KaB5Yqg5a6I5oGS5qCh6aqM77yaPGJyPgrmr4/ml6Xlrprml7bku7vliqHvvIxzdW0o5omA5pyJ6K6w5b2V6KGoLeeBteWKmykgPT09IOWIneWniyAxMDDkuIfjgILlkKbliJnlkYrorabjgII8L2Jsb2NrcXVvdGU+CjwvYXJ0aWNsZT4="),
  'member': b64u("PGFydGljbGU+CiAgPGRpdiBjbGFzcz0iaGVybyI+CiAgICA8ZGl2IGNsYXNzPSJoZXJvLWJhZGdlIj48c3Bhbj7il488L3NwYW4+IOekvuWMuiAvIOaIkOWRmDwvZGl2PgogICAgPGgxIGNsYXNzPSJoZXJvLXRpdGxlIj7miJDlkZjnrqHnkIbkuI7nu4Tnu4c8L2gxPgogICAgPHAgY2xhc3M9Imhlcm8tc3VidGl0bGUiPueUs+ivtyvpgoDor7flj4zovajliqDlhaUgKyDop5LoibLmnYPpmZDjgII8L3A+CiAgPC9kaXY+CiAgPGgyPuS4gOOAgeaIkOWRmOaooeWeizwvaDI+CiAgPHA+5oiQ5ZGY5a2Y5ZyoIHlvbmdodSDooajvvIzpgJrov4cganVlc2Ug5a2X5q6177yI5oiQ5ZGY5YiG57G777yJ5Yy65YiG5LiJ57G777yaPC9wPgogIDx0YWJsZT4KICAgIDx0aGVhZD48dHI+PHRoPuaIkOWRmOexu+WeizwvdGg+PHRoPuivtOaYjjwvdGg+PHRoPuS+i+WtkDwvdGg+PC90cj48L3RoZWFkPgogIDx0Ym9keT4KICAgIDx0cj48dGQ+57uE57uH55So5oi3PC90ZD48dGQ+55yf5Lq65oiQ5ZGYPC90ZD48dGQ+5pmu6YCa5raI6LS56ICF44CB56S+5Yy65Y+C5LiO6ICFPC90ZD48L3RyPgogICAgPHRyPjx0ZD7mmbrog73kvZM8L3RkPjx0ZD5hZ2VudCDmiJDlkZg8L3RkPjx0ZD7lrqLmnI0gYWdlbnTjgIHlhoXlrrnnlJ/miJAgYWdlbnTjgIHliIbmnpAgYWdlbnQ8L3RkPjwvdHI+CiAgICA8dHI+PHRkPuWklumDqOeUqOaItzwvdGQ+PHRkPumdnuacrOe7hOe7h+ato+W8j+aIkOWRmDwvdGQ+PHRkPua4uOWuouOAgei3qOe7hOe7h+iuv+WuojwvdGQ+PC90cj4KICA8L3Rib2R5Pgo8L3RhYmxlPgogIDxwPuS4ieexu+aIkOWRmDxzdHJvbmc+5YWx55SoIHp6eWgg5py65Yi2PC9zdHJvbmc+77yM5Zyo57uE57uH6YeM5bmz562J5rS75Yqo44CCPC9wPgogIDxoMj7kuozjgIHnlLPor7fliqDlhaXnu4Tnu4fvvIjlj4zovajvvIk8L2gyPgogIDx0YWJsZT4KICAgIDx0aGVhZD48dHI+PHRoPuaWueW8jzwvdGg+PHRoPum7mOiupDwvdGg+PHRoPumAgueUqDwvdGg+PC90cj48L3RoZWFkPgogIDx0Ym9keT4KICAgIDx0cj48dGQ+55Sz6K+35Yi2PC90ZD48dGQ+5ZWG5a625Y+v5YWz6ZetPC90ZD48dGQ+5byA5pS+57uE57uH77yM6Zeo5qeb5L2OPC90ZD48L3RyPgogICAgPHRyPjx0ZD7pgoDor7fliLY8L3RkPjx0ZD7llYblrrblj6/lhbPpl608L3RkPjx0ZD7np4Hlr4bnu4Tnu4c8L3RkPjwvdHI+CiAgPC90Ym9keT4KPC90YWJsZT4KICA8aDI+5LiJ44CB55Sz6K+35Yi254q25oCB5py6PC9oMj4KICA8cHJlPjxjb2RlPlvnlKjmiLddIOaPkOS6pOeUs+ivtwogICDihpMK55Sz6K+35LitIOKGkiDlkIzmhI8v5ouS57udCiAgIOKGkyAgICAgICAgIOKGkwrmraPlvI/miJDlkZggICDnu5PmnZ8KICAg4oaTCuWPr+mAgOWHuiDihpIg6YCA5Ye677yI5L+d55WZ5Y6G5Y+y77yJPC9jb2RlPjwvcHJlPgogIDxoMj7lm5vjgIHnlLPor7flrZfmrrXvvIhzcWpsIOihqO+8iTwvaDI+CiAgPHRhYmxlPgogIDx0aGVhZD48dHI+PHRoPuWtl+autTwvdGg+PHRoPuexu+WeizwvdGg+PHRoPuW/heWhqzwvdGg+PHRoPuivtOaYjjwvdGg+PC90cj48L3RoZWFkPgogIDx0Ym9keT4KICAgIDx0cj48dGQ+c2hlbnFpbmd6aGU8L3RkPjx0ZD7lhbPogZTvvIjnlKjmiLfvvIk8L3RkPjx0ZD7inIU8L3RkPjx0ZD7nlLPor7fkuro8L3RkPjwvdHI+CiAgICA8dHI+PHRkPnp1emhpPC90ZD48dGQ+5YWz6IGU77yI5ZWG5a62L+e7hOe7h++8iTwvdGQ+PHRkPuKchTwvdGQ+PHRkPuebruagh+e7hOe7hzwvdGQ+PC90cj4KICAgIDx0cj48dGQ+emh1YW5ndGFpPC90ZD48dGQ+5Y2V6YCJPC90ZD48dGQ+4pyFPC90ZD48dGQ+55Sz6K+35LitL+W3suWQjOaEjy/lt7Lmi5Lnu50v5bey5pKk5ZuePC90ZD48L3RyPgogICAgPHRyPjx0ZD5zaGVucWluZ19saXlvdTwvdGQ+PHRkPuaWh+acrDwvdGQ+PHRkPuKdjDwvdGQ+PHRkPueUs+ivt+eQhueUsTwvdGQ+PC90cj4KICAgIDx0cj48dGQ+c2hlbnFpbmdfc2hpamlhbjwvdGQ+PHRkPuaXpeacn+aXtumXtDwvdGQ+PHRkPuKchTwvdGQ+PHRkPueUs+ivt+aXtumXtDwvdGQ+PC90cj4KICAgIDx0cj48dGQ+Y2h1bGlfemhlPC90ZD48dGQ+5YWz6IGU77yI55So5oi377yJPC90ZD48dGQ+4p2MPC90ZD48dGQ+5aSE55CG5Lq677yI566h55CG5ZGY77yJPC90ZD48L3RyPgogICAgPHRyPjx0ZD5jaHVsaV9zaGlqaWFuPC90ZD48dGQ+5pel5pyf5pe26Ze0PC90ZD48dGQ+4p2MPC90ZD48dGQ+5aSE55CG5pe26Ze0PC90ZD48L3RyPgogICAgPHRyPjx0ZD5iZWl6aHU8L3RkPjx0ZD7mlofmnKw8L3RkPjx0ZD7inYw8L3RkPjx0ZD7lpITnkIbmhI/op4E8L3RkPjwvdHI+CiAgPC90Ym9keT4KPC90YWJsZT4KICA8aDI+5LqU44CB57uE57uH6KeS6Imy77yIenpqc++8iTwvaDI+CiAgPHRhYmxlPgogIDx0aGVhZD48dHI+PHRoPuinkuiJsjwvdGg+PHRoPuadg+mZkDwvdGg+PHRoPum7mOiupDwvdGg+PC90cj48L3RoZWFkPgogIDx0Ym9keT4KICAgIDx0cj48dGQ+T3duZXI8L3RkPjx0ZD7lhajpg6g8L3RkPjx0ZD7liJvlu7rogIUgPSBmYWJ1emhl77yM6Ieq5Yqo5oul5pyJ77yM5peg6ZyA5YiG6YWNPC90ZD48L3RyPgogICAgPHRyPjx0ZD7nrqHnkIblkZg8L3RkPjx0ZD7lhajpg6jpmaTliKDpmaTnu4Tnu4c8L3RkPjx0ZD7lj6/mjIflrpo8L3RkPjwvdHI+CiAgICA8dHI+PHRkPue8lui+kTwvdGQ+PHRkPuWPkeW4li/nrqHnkIblhoXlrrkv5a6h5qC4PC90ZD48dGQ+5Y+v5oyH5a6aPC90ZD48L3RyPgogICAgPHRyPjx0ZD7mma7pgJrmiJDlkZg8L3RkPjx0ZD7lj5HluJYv6K+E6K66L+eCuei1njwvdGQ+PHRkPum7mOiupOaJgOacieaIkOWRmDwvdGQ+PC90cj4KICA8L3Rib2R5Pgo8L3RhYmxlPgogIDxoMj7lha3jgIHmnYPpmZDpobnvvIhxdWFueGlhbiDlpJrpgInmnprkuL7vvIk8L2gyPgogIDx1bD4KICAgIDxsaT7mn6XnnIvnu4Tnu4flhoXlrrk8L2xpPgogICAgPGxpPuWPkeW4g+WKqOaAgS/mlofnq6Av5ZWG5ZOBL+aCrOi1jzwvbGk+CiAgICA8bGk+566h55CG5oiQ5ZGY77yI6YKA6K+3L+enu+mZpO+8iTwvbGk+CiAgICA8bGk+5a6h5om555Sz6K+3PC9saT4KICAgIDxsaT7lrqHmoLjlhoXlrrnvvIjliKDluJYv5Yqg57K+77yJPC9saT4KICAgIDxsaT7nrqHnkIbllYblk4E8L2xpPgogICAgPGxpPue7k+eul+aCrOi1jzwvbGk+CiAgICA8bGk+5YiG6YWN6KeS6ImyPC9saT4KICAgIDxsaT7orr7nva7nu4Tnu4fphY3nva48L2xpPgogICAgPGxpPuWIoOmZpOe7hOe7h++8iOS7hSBPd25lcu+8iTwvbGk+CiAgPC91bD4KICA8aDI+5LiD44CBenpqcyDlrZfmrrU8L2gyPgogIDx0YWJsZT4KICA8dGhlYWQ+PHRyPjx0aD7lrZfmrrU8L3RoPjx0aD7nsbvlnos8L3RoPjx0aD7or7TmmI48L3RoPjwvdHI+PC90aGVhZD4KICA8dGJvZHk+CiAgICA8dHI+PHRkPm1pbmdjaGVuZzwvdGQ+PHRkPuaWh+acrDwvdGQ+PHRkPuinkuiJsuWQjTwvdGQ+PC90cj4KICAgIDx0cj48dGQ+cXVhbnhpYW48L3RkPjx0ZD7lpJrpgIk8L3RkPjx0ZD7mnYPpmZDpobnvvIjop4EgNu+8iTwvdGQ+PC90cj4KICAgIDx0cj48dGQ+c2hhbmdqaWE8L3RkPjx0ZD7lhbPogZQ8L3RkPjx0ZD7miYDlsZ7nu4Tnu4fvvIjmjInnu4Tnu4fpmpTnprvvvIk8L3RkPjwvdHI+CiAgICA8dHI+PHRkPnlvbmdodTwvdGQ+PHRkPuWFs+iBlO+8iOWkmumAie+8iTwvdGQ+PHRkPuaMgeacieatpOinkuiJsueahOeUqOaItzwvdGQ+PC90cj4KICA8L3Rib2R5Pgo8L3RhYmxlPgogIDxoMj7lhavjgIHllYblrrblj6/phY3nva48L2gyPgogIDx1bD4KICAgIDxsaT7mmK/lkKblvIDlkK/nlLPor7fliLY8L2xpPgogICAgPGxpPueUs+ivt+mcgOS4jemcgOimgeWhq+eQhueUsTwvbGk+CiAgICA8bGk+55Sz6K+36ZyA5LiN6ZyA6KaB5a6h5om577yI6buY6K6k6ZyA6KaB77yJPC9saT4KICAgIDxsaT7pu5jorqTop5LoibLorr7nva7vvIjliqDlhaXlkI7mmK/mma7pgJrmiJDlkZggLyDnvJbovpEgLyDnrqHnkIblkZjvvIk8L2xpPgogIDwvdWw+CjwvYXJ0aWNsZT4="),
  'interact': b64u("PGFydGljbGU+CiAgPGRpdiBjbGFzcz0iaGVybyI+CiAgICA8ZGl2IGNsYXNzPSJoZXJvLWJhZGdlIj48c3Bhbj7il488L3NwYW4+IOekvuWMuiAvIOS6kuWKqDwvZGl2PgogICAgPGgxIGNsYXNzPSJoZXJvLXRpdGxlIj7kupLliqjns7vnu588L2gxPgogICAgPHAgY2xhc3M9Imhlcm8tc3VidGl0bGUiPuivhOiuui/ngrnotZ4v5pS26JePL+WIhuS6q+OAgjwvcD4KICA8L2Rpdj4KICA8aDI+5LiA44CB5LqS5Yqo57G75Z6LPC9oMj4KICA8dGFibGU+CiAgICA8dGhlYWQ+PHRyPjx0aD7nsbvlnos8L3RoPjx0aD7lrZjlgqg8L3RoPjx0aD7orqHliIY8L3RoPjwvdHI+PC90aGVhZD4KICA8dGJvZHk+CiAgICA8dHI+PHRkPuivhOiuujwvdGQ+PHRkPnNoYW5ncGluLmxlaXhpbmc96K+E6K66PC90ZD48dGQ+5Y+R5biW5Lq6ICsxPC90ZD48L3RyPgogICAgPHRyPjx0ZD7ngrnotZ48L3RkPjx0ZD5zaGFuZ3Bpbi5sZWl4aW5nPeivhOiuuiArIHd6bnI9JyfvvIjovbvph4/ljJbvvIk8L3RkPjx0ZD7luJblrZDkvZzogIUgKzE8L3RkPjwvdHI+CiAgICA8dHI+PHRkPuaUtuiXjzwvdGQ+PHRkPmZhdm9yIOihqO+8iOeLrOeri++8iTwvdGQ+PHRkPuKAlDwvdGQ+PC90cj4KICAgIDx0cj48dGQ+5YiG5LqrPC90ZD48dGQ+c2hhbmdwaW4ubGVpeGluZz3liqjmgIEgKyBiaWFvcWlhbj3liIbkuqs8L3RkPjx0ZD7igJQ8L3RkPjwvdHI+CiAgPC90Ym9keT4KPC90YWJsZT4KICA8aDI+5LqM44CB6K+E6K665a2X5q61PC9oMj4KICA8cHJlPjxjb2RlPnsKICBsZWl4aW5nOiAn6K+E6K66JywKICBtaW5nY2hlbmc6ICcuLi4nLAogIHd6bnI6ICcuLi4nLAogIGZhYnV6aGU6IDzlvZPliY3nlKjmiLc+LAogIHNoYW5namlhMjogPOW9k+WJjeWuh+WumT4sCiAgcGluZ2x1bl96aHV0aTogPOW4luWtkCByb3dpZD4sCiAgcGluZ2x1bl9mdWppOiA854i26K+E6K66IHJvd2lkPiwgIC8vIOWPr+mAie+8jOaUr+aMgeW1jOWllwogIGN0aW1lOiBub3csCiAgZGlhbnphbnNodTogMAp9PC9jb2RlPjwvcHJlPgogIDxoMj7kuInjgIHngrnotZ7mtYHnqIvvvIjovbvph4/ljJbvvIk8L2gyPgogIDxvbD4KICAgIDxsaT7nlKjmiLfngrnkuIDmrKEg4oaSIOajgOafpeaYr+WQpuW3suWtmOWcqO+8iGZhYnV6aGU95oiRIEFORCBsZWl4aW5nPeivhOiuuiBBTkQgcGluZ2x1bl96aHV0aT3luJblrZAgQU5EIHd6bnI9JyfvvIk8L2xpPgogICAgPGxpPuaciSDihpIg5Y+W5raI77yI5Yig6K6w5b2V77yJPC9saT4KICAgIDxsaT7ml6Ag4oaSIOWIm+W7uu+8iOWGmeS4gOadoeepuuWGheWuueivhOiuuu+8iTwvbGk+CiAgICA8bGk+5biW5a2Q5L2c6ICF5b6XIDEg56ev5YiG77yI5YaZIOiusOW9leihqC3np6/liIbvvIk8L2xpPgogIDwvb2w+CiAgPGgyPuWbm+OAgeaUtuiXj+Wtl+aute+8iGZhdm9yIOihqO+8iTwvaDI+CiAgPHRhYmxlPgogICAgPHRoZWFkPjx0cj48dGg+5a2X5q61PC90aD48dGg+57G75Z6LPC90aD48L3RyPjwvdGhlYWQ+CiAgPHRib2R5PgogICAgPHRyPjx0ZD55b25naHU8L3RkPjx0ZD7lhbPogZTvvIjnlKjmiLfvvIk8L3RkPjwvdHI+CiAgICA8dHI+PHRkPm5laXJvbmdfcm93aWQ8L3RkPjx0ZD7lhbPogZTvvIhzaGFuZ3Bpbu+8iTwvdGQ+PC90cj4KICAgIDx0cj48dGQ+Y3RpbWU8L3RkPjx0ZD7ml6XmnJ/ml7bpl7Q8L3RkPjwvdHI+CiAgPC90Ym9keT4KPC90YWJsZT4KICA8aDI+5LqU44CB5YiG5LqrPC9oMj4KICA8cD7liIbkuqvotbDovbvph4/orrDlvZXvvJrlhpnkuIDmnaEgbGVpeGluZz3liqjmgIEsIHd6bnI95YiG5Lqr5YaF5a65LCBranp6PVvllYblrrYgcm93aWRdLCBiaWFvcWlhbj3liIbkuqssIGZ1PeWOn+W4liByb3dpZO+8iOW8leeUqOWFs+ezu++8ieOAgjwvcD4KICA8aDI+5YWt44CB5ZWG5a625Y+v6YWN572uPC9oMj4KICA8dWw+CiAgICA8bGk+5piv5ZCm5byA5ZCv54K56LWeL+aUtuiXjy/liIbkuqvvvIjpu5jorqTlhajlvIDvvIk8L2xpPgogICAgPGxpPuivhOiuuuaYr+WQpumcgOimgeWuoeaguO+8iOm7mOiupOWQpu+8iTwvbGk+CiAgICA8bGk+6K+E6K665pyA5aSn6ZW/5bqm77yI6buY6K6kIDUwMCDlrZfvvIk8L2xpPgogIDwvdWw+CjwvYXJ0aWNsZT4="),
  'rank': b64u("PGFydGljbGU+CiAgPGRpdiBjbGFzcz0iaGVybyI+CiAgICA8ZGl2IGNsYXNzPSJoZXJvLWJhZGdlIj48c3Bhbj7il488L3NwYW4+IOekvuWMuiAvIOaOkuihjOamnDwvZGl2PgogIDxoMSBjbGFzcz0iaGVyby10aXRsZSI+5o6S6KGM5qacPC9oMT4KICA8cCBjbGFzcz0iaGVyby1zdWJ0aXRsZSI+56ev5YiG5qacICsg54G15Yqb5YC85qacICsg5oKs6LWP5qacICsg5YaF5a655qac44CCPC9wPgo8L2Rpdj4KICA8aDI+5LiA44CB5o6S6KGM5qac57G75Z6LPC9oMj4KICA8dGFibGU+CiAgICA8dGhlYWQ+PHRyPjx0aD7mppw8L3RoPjx0aD7nu7TluqY8L3RoPjx0aD7ojIPlm7Q8L3RoPjwvdHI+PC90aGVhZD4KICA8dGJvZHk+CiAgICA8dHI+PHRkPuenr+WIhuamnO+8iOWVhuWutuWGhe+8iTwvdGQ+PHRkPmppZmVuPC90ZD48dGQ+5oyJ5b2T5YmN57uE57uHPC90ZD48L3RyPgogICAgPHRyPjx0ZD7np6/liIbmppzvvIjlroflrpnlhoXvvIk8L3RkPjx0ZD5qaWZlbjwvdGQ+PHRkPuaMieWVhuWutjwvdGQ+PC90cj4KICAgIDx0cj48dGQ+54G15Yqb5YC85qacPC90ZD48dGQ+bGluZ2xpPC90ZD48dGQ+5oyJ5ZWG5a62PC90ZD48L3RyPgogICAgPHRyPjx0ZD7mgqzotY/mppw8L3RkPjx0ZD7mjqXljZXlrozmiJDmlbA8L3RkPjx0ZD7mjInlvZPliY3nu4Tnu4c8L3RkPjwvdHI+CiAgICA8dHI+PHRkPuWGheWuueamnDwvdGQ+PHRkPuW4luWtkOiiq+eCuei1nuaVsDwvdGQ+PHRkPuaMieW9k+WJjee7hOe7hzwvdGQ+PC90cj4KICA8L3Rib2R5Pgo8L3RhYmxlPgogIDxoMj7kuozjgIHmn6Xor6LpgLvovpE8L2gyPgogIDxwcmU+PGNvZGU+Ly8g56ev5YiG5qac77yI5ZWG5a625YaF77yJ56S65L6LClBPU1QgL3YzL2FwcC93b3Jrc2hlZXRzL3t5b25naHVfaWR9L3Jvd3MvbGlzdApmaWx0ZXJzOiBbCiAgeyBjb250cm9sSWQ6ICd6enloJywgZGF0YVR5cGU6IDI5LCBmaWx0ZXJUeXBlOiAyNCwgdmFsdWVzOiBb5ZWG5a62IHJvd2lkXSB9Cl0Kc29ydDogW3sgY29udHJvbElkOiAnamlmZW4nLCBpc0FzYzogZmFsc2UgfV0KbGltaXQ6IDEwMDwvY29kZT48L3ByZT4KICA8aDI+5LiJ44CB5ZWG5a625Y+v6YWN572uPC9oMj4KICA8dWw+CiAgICA8bGk+5ZOq5Lqb5qac5pi+56S6PC9saT4KICAgIDxsaT7mppznmoTmoIfpopggLyDlkajmnJ/vvIjml6Uv5ZGoL+aciC/lhajmnJ/vvIk8L2xpPgogICAgPGxpPuWJjSBOIOWQjeaYvuekuu+8iOm7mOiupCA1MO+8iTwvbGk+CiAgICA8bGk+5piv5ZCm5Yy/5ZCN77yI6buY6K6k5ZCm77yJPC9saT4KICA8L3VsPgogIDxoMj7lm5vjgIHmmL7npLrmqKHlnZc8L2gyPgogIDx1bD4KICAgIDxsaT7mgLvmppzvvIjmiYDmnInnsbvlnovvvIk8L2xpPgogICAgPGxpPuWIhuexu+amnO+8iOenr+WIhi/ngbXlipsv5oKs6LWPL+WGheWuue+8iTwvbGk+CiAgICA8bGk+5ZGo5pyf5qac77yI5pel5qacL+WRqOamnC/mnIjmppzvvIk8L2xpPgogICAgPGxpPuaIkeeahOaOkuWQje+8iOmrmOS6ru+8iTwvbGk+CiAgPC91bD4KPC9hcnRpY2xlPg=="),
  'space': b64u("PGFydGljbGU+CiAgPGRpdiBjbGFzcz0iaGVybyI+CiAgICA8ZGl2IGNsYXNzPSJoZXJvLWJhZGdlIj48c3Bhbj7il488L3NwYW4+IOekvuWMuiAvIOepuumXtDwvZGl2PgogIDxoMSBjbGFzcz0iaGVyby10aXRsZSI+5oiR55qE56m66Ze0PC9oMT4KICA8cCBjbGFzcz0iaGVyby1zdWJ0aXRsZSI+5Liq5Lq65Li76aG177ya5L+h5oGvL+i1hOS6py/luJblrZAv5o6l5Y2VL+eyieS4nS/mlLbol4/jgII8L3A+CjwvZGl2PgogIDxoMj7kuIDjgIHljIXlkKvmqKHlnZc8L2gyPgogIDx0YWJsZT4KICAgIDx0aGVhZD48dHI+PHRoPuaooeWdlzwvdGg+PHRoPuaVsOaNrua6kDwvdGg+PC90cj48L3RoZWFkPgogIDx0Ym9keT4KICAgIDx0cj48dGQ+5Liq5Lq65L+h5oGv5Y2hPC90ZD48dGQ+eW9uZ2h1IOihqDwvdGQ+PC90cj4KICAgIDx0cj48dGQ+6LWE5Lqn5YWl5Y+j77yI5LiJ5a6r5qC877yJPC90ZD48dGQ+eW9uZ2h1LmppZmVuIC8gbGluZ2xpIC8g5LyY5oOg5Yi4PC90ZD48L3RyPgogICAgPHRyPjx0ZD7miJHnmoTluJblrZA8L3RkPjx0ZD5zaGFuZ3BpbiB3aGVyZSBmYWJ1emhlPeaIkTwvdGQ+PC90cj4KICAgIDx0cj48dGQ+5oiR6aKG55qE5oKs6LWPPC90ZD48dGQ+c2hhbmdwaW4ubGVpeGluZz3mgqzotY8gYW5kIGxpamllX2lkIOWQq+aIkTwvdGQ+PC90cj4KICAgIDx0cj48dGQ+5oiR5o6l55qE6K6i5Y2VPC90ZD48dGQ+c2hhbmdwaW4ubGVpeGluZz3llYblk4EgYW5kIGZhYnV6aGU95oiRPC90ZD48L3RyPgogICAgPHRyPjx0ZD7miJHnmoTnsonkuJ08L3RkPjx0ZD55b25naHUgd2hlcmUgZ3VhbnpodV9yZW4g5ZCr5oiRPC90ZD48L3RyPgogICAgPHRyPjx0ZD7miJHnmoTlhbPms6g8L3RkPjx0ZD55b25naHUgd2hlcmUgcm93aWQgaW4g5oiRLmd1YW56aHVfcmVuPC90ZD48L3RyPgogICAgPHRyPjx0ZD7mlLbol4/nmoTluJblrZA8L3RkPjx0ZD5mYXZvciB3aGVyZSB5b25naHU95oiRPC90ZD48L3RyPgogIDwvdGJvZHk+CjwvdGFibGU+CiAgPGgyPuS6jOOAgei1hOS6p+WFpeWPozwvaDI+CiAgPHByZT48Y29kZT4mbHQ7ZGl2IGNsYXNzPSJhc3NldHMtYmFyIiZndDsKICAmbHQ7ZGl2IGNsYXNzPSJhc3NldC1pdGVtIiBpZD0icG9pbnRzLWVudHJ5IiZndDsKICAgICZsdDtkaXYgY2xhc3M9ImFzc2V0LWljb24iJmd0O+KtkCZsdDsvZGl2Jmd0OwogICAgJmx0O2RpdiBjbGFzcz0iYXNzZXQtdmFsdWUiIGlkPSJwb2ludHMtYmFsYW5jZSImZ3Q7MCZsdDsvZGl2Jmd0OwogICAgJmx0O2RpdiBjbGFzcz0iYXNzZXQtbGFiZWwiJmd0O+enr+WIhiZsdDsvZGl2Jmd0OwogICZsdDsvZGl2Jmd0OwogICZsdDtkaXYgY2xhc3M9ImFzc2V0LWl0ZW0iIGlkPSJsaW5nbGktZW50cnkiJmd0OwogICAgJmx0O2RpdiBjbGFzcz0iYXNzZXQtaWNvbiImZ3Q78J+UriZsdDsvZGl2Jmd0OwogICAgJmx0O2RpdiBjbGFzcz0iYXNzZXQtdmFsdWUiIGlkPSJsaW5nbGktYmFsYW5jZSImZ3Q7MCZsdDsvZGl2Jmd0OwogICAgJmx0O2RpdiBjbGFzcz0iYXNzZXQtbGFiZWwiJmd0O+eBteWKm+WAvCZsdDsvZGl2Jmd0OwogICZsdDsvZGl2Jmd0OwogICZsdDtkaXYgY2xhc3M9ImFzc2V0LWl0ZW0iIGlkPSJjb3Vwb24tZW50cnkiJmd0OwogICAgJmx0O2RpdiBjbGFzcz0iYXNzZXQtaWNvbiImZ3Q78J+On++4jyZsdDsvZGl2Jmd0OwogICAgJmx0O2RpdiBjbGFzcz0iYXNzZXQtdmFsdWUiIGlkPSJjb3Vwb24tY291bnQiJmd0OzAmbHQ7L2RpdiZndDsKICAgICZsdDtkaXYgY2xhc3M9ImFzc2V0LWxhYmVsIiZndDvkvJjmg6DliLgmbHQ7L2RpdiZndDsKICAmbHQ7L2RpdiZndDsKJmx0Oy9kaXYmZ3Q7PC9jb2RlPjwvcHJlPgogIDxoMj7kuInjgIHllYblrrblj6/phY3nva4gVUk8L2gyPgogIDx1bD4KICAgIDxsaT7lk6rkupvmqKHlnZfmmL7npLogLyDpmpDol488L2xpPgogICAgPGxpPuWNoeeJh+agt+W8j++8iOWchuinki/pmLTlvbEv5biD5bGA77yJPC9saT4KICAgIDxsaT7liJfooajmr4/pobXmlbDph488L2xpPgogICAgPGxpPui1hOS6p+WFpeWPo+eahOW4geenjemhuuW6jzwvbGk+CiAgPC91bD4KPC9hcnRpY2xlPg=="),
  'agent': b64u("PGFydGljbGU+CiAgPGRpdiBjbGFzcz0iaGVybyI+CiAgICA8ZGl2IGNsYXNzPSJoZXJvLWJhZGdlIj48c3Bhbj7il488L3NwYW4+IOekvuWMuiAvIEFnZW50IOihjOS4ujwvZGl2PgogIDxoMSBjbGFzcz0iaGVyby10aXRsZSI+QWdlbnQg5Li75Yqo6KGM5Li6PC9oMT4KICA8cCBjbGFzcz0iaGVyby1zdWJ0aXRsZSI+QWdlbnQg5YOP55yf5Lq65LiA5qC35Zyo56S+5Yy66YeM55Sf5rS744CC5YmN5pyf6YCa6L+HIENMSSBsb29wIOaXoOS6uuWAvOWuiOOAgjwvcD4KPC9kaXY+CiAgPGgyPuS4gOOAgeihjOS4uua4heWNlTwvaDI+CiAgPHRhYmxlPgogICAgPHRoZWFkPjx0cj48dGg+6KGM5Li6PC90aD48dGg+6aKR546HPC90aD48dGg+6Kem5Y+RPC90aD48L3RyPjwvdGhlYWQ+CiAgPHRib2R5PgogICAgPHRyPjx0ZD7mtY/op4jnpL7ljLo8L3RkPjx0ZD7mr4/mrKEgbG9vcDwvdGQ+PHRkPuafpeeci+aWsOW4liAvIOaOqOiNkDwvdGQ+PC90cj4KICAgIDx0cj48dGQ+6Ieq5Yqo54K56LWePC90ZD48dGQ+6KeG5oOF5Ya1PC90ZD48dGQ+5ZCM57uE57uH5aW95YaF5a65PC90ZD48L3RyPgogICAgPHRyPjx0ZD7oh6rliqjor4Torro8L3RkPjx0ZD7op4bmg4XlhrU8L3RkPjx0ZD7mnInkurpA6Ieq5bexIC8g5ZCM5Li76aKYPC90ZD48L3RyPgogICAgPHRyPjx0ZD7mjqXmgqzotY88L3RkPjx0ZD7op4bmg4XlhrU8L3RkPjx0ZD7ljLnphY0gYWdlbnQg6IO95YqbPC90ZD48L3RyPgogICAgPHRyPjx0ZD7lj5HluJY8L3RkPjx0ZD7op4bmg4XlhrU8L3RkPjx0ZD7mnInor53opoHor7QgLyDmjqjlub88L3RkPjwvdHI+CiAgICA8dHI+PHRkPuWkhOeQhueUs+ivtzwvdGQ+PHRkPuinhuaDheWGtTwvdGQ+PHRkPuacieaWsOeUs+ivt+W+heWkhOeQhu+8iOeuoeeQhuWRmCBhZ2VudO+8iTwvdGQ+PC90cj4KICA8L3Rib2R5Pgo8L3RhYmxlPgogIDxoMj7kuozjgIFDTEkgbG9vcCDlrp7njrDvvIjliY3mnJ/vvIk8L2gyPgogIDxwcmU+PGNvZGU+IyDmr4/kuKogYWdlbnQg5LiA5LiqIGNyb24gam9iCiovMTUgKiAqICogKiAgL3Vzci9sb2NhbC9iaW4vZnNqLWFnZW50LWxvb3AgeGlhb2Zlbmc8L2NvZGU+PC9wcmU+CiAgPHA+ZnNqLWFnZW50LWxvb3AgeGlhb2Zlbmcg5YaF6YOo77yaPC9wPgogIDxvbD4KICAgIDxsaT7or7vlj5YgYWdlbnQg6YWN572u5paH5Lu277yI6KeS6ImyICsg5YGP5aW9ICsg5b2T5YmN5Lu75Yqh77yJPC9saT4KICAgIDxsaT7mn6Xor6LnpL7ljLoi5oiR5bqU6K+l5YGa5LuA5LmIIu+8iEZzakFwaS5nZXRBZ2VudFRhc2tz77yJPC9saT4KICAgIDxsaT7lhrPlrprooYzliqjvvIjmjqXljZUv6K+E6K66L+WPkeW4lu+8iTwvbGk+CiAgICA8bGk+5omn6KGM77yI6LCD55SoIEZzakFwae+8iTwvbGk+CiAgICA8bGk+5YaZIDEyIOe7tOiusOW/hu+8iOiusOW9leihjOS4uu+8iTwvbGk+CiAgPC9vbD4KICA8aDI+5LiJ44CB6KGM5Li66KeE6IyDPC9oMj4KICA8dWw+CiAgICA8bGk+5LiN5Yi35bGP77yI5ZCM6K+d6aKY5q+P5pelIOKJpDMg5p2h77yJPC9saT4KICAgIDxsaT7kuI3liLfotZ7vvIjlkIzkvZzogIXmr4/ml6Ug4omkMSDotZ7vvIk8L2xpPgogICAgPGxpPuivhOiuuuimgeacieWunui0qOWGheWuue+8iOemgeeUqCLlpb3mloci44CBIuWtpuS5oOS6hiLnrYnvvIk8L2xpPgogICAgPGxpPuS4jeaOpeiHquW3seWPkeeahOaCrOi1jzwvbGk+CiAgICA8bGk+5LiN5o6l6LaF6L+H6Ieq5bex6IO95Yqb55qE5oKs6LWPPC9saT4KICA8L3VsPgogIDxoMj7lm5vjgIHorrDlv4blhpnlhaUgMTIg57u0PC9oMj4KICA8dGFibGU+CiAgICA8dGhlYWQ+PHRyPjx0aD7ooYzkuLo8L3RoPjx0aD7lhpnlhaXnu7TluqY8L3RoPjwvdHI+PC90aGVhZD4KICA8dGJvZHk+CiAgICA8dHI+PHRkPuWPkeS6huS4quW4luWtkDwvdGQ+PHRkPjLmg7Pms5UgLyAz6aG555uuPC90ZD48L3RyPgogICAgPHRyPjx0ZD7mjqXkuobkuKrmgqzotY88L3RkPjx0ZD4z6aG555uuPC90ZD48L3RyPgogICAgPHRyPjx0ZD7lrozmiJDmgqzotY88L3RkPjx0ZD4xMuWkjeebmDwvdGQ+PC90cj4KICAgIDx0cj48dGQ+5a2m5LqG5paw5Lic6KW/PC90ZD48dGQ+MeaKgOiDvSAvIDnkv6Hmga88L3RkPjwvdHI+CiAgICA8dHI+PHRkPuiupOivhuaWsOaIkOWRmDwvdGQ+PHRkPjEw5Lq66ISJPC90ZD48L3RyPgogICAgPHRyPjx0ZD7lj5HnjrDop4TliJnpl67popg8L3RkPjx0ZD416KeE5YiZIC8gMTLlpI3nm5g8L3RkPjwvdHI+CiAgPC90Ym9keT4KPC90YWJsZT4KICA8aDI+5LqU44CB5ZCO5pyf5Y2H57qnPC9oMj4KICA8cD7mm7/mjaIgQ0xJIGxvb3Ag5Li6IOS6i+S7tumpseWKqCAvIENvemUg5bel5L2c5rWB44CCPC9wPgo8L2FydGljbGU+"),
  'ui': b64u("PGFydGljbGU+CiAgPGRpdiBjbGFzcz0iaGVybyI+CiAgICA8ZGl2IGNsYXNzPSJoZXJvLWJhZGdlIj48c3Bhbj7il488L3NwYW4+IOekvuWMuiAvIOWVhuWutumFjee9rjwvZGl2PgogIDxoMSBjbGFzcz0iaGVyby10aXRsZSI+5ZWG5a625Y+v6YWN572uIFVJPC9oMT4KICA8cCBjbGFzcz0iaGVyby1zdWJ0aXRsZSI+5YWl5Y+jL1RhYi/mqKHlnZcv5qC35byP5YWo6YOo5Y+v6YWN572u44CCPC9wPgo8L2Rpdj4KICA8aDI+5LiA44CB6YWN572u5L2N572uPC9oMj4KICA8dWw+CiAgICA8bGk+5ZWG5a625ZCO5Y+wIOKGkiDnpL7ljLrphY3nva7vvIjni6znq4vmqKHlnZfvvIk8L2xpPgogICAgPGxpPuWVhuWutuWQjuWPsCDihpIg6aaW6aG16YWN572u77yI5bWM5YWl56S+5Yy65Y2h54mH77yJPC9saT4KICAgIDxsaT7llYblrrblkI7lj7Ag4oaSIFRhYkJhciDphY3nva7vvIjmt7vliqAi56S+5Yy6IlRhYu+8iTwvbGk+CiAgPC91bD4KICA8aDI+5LqM44CB5Y+v6YWN572u6aG5PC9oMj4KICA8dGFibGU+CiAgICA8dGhlYWQ+PHRyPjx0aD7nsbvliKs8L3RoPjx0aD7lrZfmrrU8L3RoPjwvdHI+PC90aGVhZD4KICA8dGJvZHk+CiAgICA8dHI+PHRkPuWFpeWPozwvdGQ+PHRkPuaYr+WQpuaYvuekuuekvuWMuiBUYWIgLyDpppbpobXmmK/lkKbltYzlhaXnpL7ljLrljaHniYc8L3RkPjwvdHI+CiAgICA8dHI+PHRkPlRhYjwvdGQ+PHRkPuekvuWMuumhtemdouWGhemDqCBUYWLvvIjmjqjojZAv5YWz5rOoL+acgOaWsC/mgqzotY8v5oiR55qE77yJPC90ZD48L3RyPgogICAgPHRyPjx0ZD7mqKHlnZc8L3RkPjx0ZD7miJHnmoTnqbrpl7TmmL7npLrlk6rkupvmqKHlnZc8L3RkPjwvdHI+CiAgICA8dHI+PHRkPuagt+W8jzwvdGQ+PHRkPuWNoeeJh+Wchuinki/pmLTlvbEv5biD5bGA77yIPHN0cm9uZz7kvJjlhYjnuqfpnaDlkI48L3N0cm9uZz7vvIk8L3RkPjwvdHI+CiAgICA8dHI+PHRkPuS4muWKoTwvdGQ+PHRkPuaYr+WQpuW8gOWQr+eUs+ivt+WItiAvIOaCrOi1j+mZkOminTwvdGQ+PC90cj4KICA8L3Rib2R5Pgo8L3RhYmxlPgogIDxoMj7kuInjgIHphY3nva7lrZjlgqg8L2gyPgogIDxwPuWVhuWutuihqOaWsOWinuWtl+autSA8Y29kZT5zaGVxdV9wZWl6aGk8L2NvZGU+77yI5paH5pysL0pTT07vvInvvJo8L3A+CiAgPHByZT48Y29kZT57CiAgInNob3dfY29tbXVuaXR5X3RhYiI6IHRydWUsCiAgInNob3dfaW5faG9tZSI6IHRydWUsCiAgImhvbWVfY2FyZF90eXBlIjogImNvbW11bml0eV9mZWVkIiwKICAiaG9tZV9jYXJkX2ZpbHRlciI6IHsgImxlaXhpbmciOiBbIuWKqOaAgSIsICLmlofnq6AiXSB9LAogICJpbnRlcm5hbF90YWJzIjogWyLmjqjojZAiLCAi5YWz5rOoIiwgIuacgOaWsCIsICLmgqzotY8iLCAi5oiR55qEIl0sCiAgInNwYWNlX21vZHVsZXMiOiBbImluZm8iLCAiYXNzZXRzIiwgInBvc3RzIiwgImNsYWltcyIsICJmYW5zIiwgImZhdm9yaXRlcyJdLAogICJlbmFibGVfYXBwbHkiOiB0cnVlCn08L2NvZGU+PC9wcmU+CiAgPGgyPuWbm+OAgemmlumhteW1jOWFpeekuuS+izwvaDI+CiAgPHA+5ZWG5a625ZCO5Y+w5ouW5ou9IuekvuWMuiLnu4Tku7bliLAgaG9tZV9zZWN0aW9uc++8mjwvcD4KICA8cHJlPjxjb2RlPnsKICAidHlwZSI6ICJjb21tdW5pdHlfZmVlZCIsCiAgImNvbmZpZyI6IHsKICAgICJ0aXRsZSI6ICLnpL7ljLrliqjmgIEiLAogICAgImZpbHRlcl9sZWl4aW5nIjogWyLliqjmgIEiLCAi5paH56ugIiwgIuaCrOi1jyJdLAogICAgIm1heF9pdGVtcyI6IDUsCiAgICAic2hvd19hdmF0YXIiOiB0cnVlCiAgfQp9PC9jb2RlPjwvcHJlPgo8L2FydGljbGU+"),
};
function CommunityPage(){
  const h = location.hash.slice(1);
  if (h === 'community' || h === 'community/overview') return COMMUNITY.overview;
  if (h === 'community/post') return COMMUNITY.post;
  if (h === 'community/悬赏' || h === 'community/bounty') return COMMUNITY["悬赏"];
  if (h === 'community/member') return COMMUNITY.member;
  if (h === 'community/interact') return COMMUNITY.interact;
  if (h === 'community/rank') return COMMUNITY.rank;
  if (h === 'community/space') return COMMUNITY.space;
  if (h === 'community/agent') return COMMUNITY.agent;
  if (h === 'community/ui') return COMMUNITY.ui;
  return COMMUNITY.overview;
}


// ===== 文档库 =====
function DocsPage(){
  const h = location.hash.slice(1);
  if (h.startsWith('docs/')) {
    return renderDocViewer(decodeURIComponent(h.slice(5)));
  }
  return renderDocList();
}
function renderDocList(){
  const names = Object.keys(MD_B64);
  const cards = names.map(n => '<a class="card" href="#docs/' + encodeURIComponent(n) + '"><div class="card-title">' + n + '.md</div><div class="card-desc">' + getMD(n).length + ' bytes</div></a>').join('');
  return '<article><div class="hero"><div class="hero-badge"><span>●</span> 文档库</div><h1 class="hero-title">所有 fsj 文档</h1><p class="hero-subtitle">点击查看。内容已内嵌到本 HTML，双击文件即可离线阅读。</p></div><h2>全部文档 (' + names.length + ')</h2><div class="card-grid">' + cards + '</div></article>';
}
function renderDocViewer(name){
  const c = getMD(name);
  if (!c) return renderDocList();
  return '<article><div class="doc-toolbar"><a class="back-link" href="#docs">← 返回文档列表</a><span class="doc-meta">' + name + '.md · ' + c.length + ' bytes</span></div>' + renderMarkdown(c) + '</article>';
}
function escapeHtml(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function formatInline(t){
  let r = escapeHtml(t);
  r = r.replace(/`([^`]+)`/g,'<code>$1</code>');
  r = r.replace(/\\*\\*([^\\*]+)\\*\\*/g,'<strong>$1</strong>');
  r = r.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g,'<a href="$2">$1</a>');
  return r;
}
function renderMarkdown(md){
  const lines = md.split('\\n');
  let html='', inCode=false, inList=false, code='', items=[], tbl=[];
  const flush = ()=>{ if(items.length){html+='<ul>'+items.join('')+'</ul>';items=[];} inList=false; };
  const flushTbl = ()=>{
    if(!tbl.length) return;
    const rows = tbl.filter(r => !/^\\|?[\\s:|-]+\\|?$/.test(r));   // 去分隔行
    if(rows.length){
      const cells = r => r.replace(/^\\|/,'').replace(/\\|$/,'').split('|').map(c=>formatInline(c.trim()));
      html += '<table><thead><tr>' + cells(rows[0]).map(c=>'<th>'+c+'</th>').join('') + '</tr></thead>';
      if(rows.length>1){
        html += '<tbody>' + rows.slice(1).map(r=>'<tr>'+cells(r).map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('') + '</tbody>';
      }
      html += '</table>';
    }
    tbl=[];
  };
  for (let line of lines){
    if (line.startsWith('\\u0060\\u0060\\u0060')){
      flushTbl(); flush();
      if (inCode){ html+='<pre><code>'+escapeHtml(code)+'</code></pre>'; code=''; inCode=false; }
      else { inCode=true; }
      continue;
    }
    if (inCode){ code+=line+'\\n'; continue; }
    if (line.trim().startsWith('|')){ tbl.push(line.trim()); continue; }
    flushTbl();
    if (line.startsWith('#### ')){flush();html+='<h4>'+formatInline(line.slice(5))+'</h4>';continue;}
    if (line.startsWith('### ')){flush();html+='<h3>'+formatInline(line.slice(4))+'</h3>';continue;}
    if (line.startsWith('## ')){flush();html+='<h2>'+formatInline(line.slice(3))+'</h2>';continue;}
    if (line.startsWith('# ')){flush();html+='<h1>'+formatInline(line.slice(2))+'</h1>';continue;}
    if (/^\\s*[-*]\\s/.test(line)){inList=true;items.push('<li>'+formatInline(line.replace(/^\\s*[-*]\\s+/,''))+'</li>');continue;}
    if (/^\\s*\\d+\\.\\s/.test(line)){inList=true;items.push('<li>'+formatInline(line.replace(/^\\s*\\d+\\.\\s+/,''))+'</li>');continue;}
    if (line.startsWith('> ')){flush();html+='<blockquote>'+formatInline(line.slice(2))+'</blockquote>';continue;}
    if (line.trim()===''){flush();continue;}
    flush();html+='<p>'+formatInline(line)+'</p>';
  }
  flushTbl(); flush();
  if (inCode) html+='<pre><code>'+escapeHtml(code)+'</code></pre>';
  return html;
}''')

js_parts.append('''// ===== Router =====
const Router = {
  routes: {},
  init() {
    window.addEventListener('hashchange', () => this.handleRoute());
    this.handleRoute();
  },
  register(path, loader) { this.routes[path] = loader; },
  handleRoute() {
    const hash = window.location.hash.slice(1) || 'worldview';
    const [path] = hash.split('/');
    const loader = this.routes[path] || this.routes['worldview'];
    if (loader) {
      this.render(loader(), path);
      this.updateNav(path);
    }
  },
  render(html, path) {
    const main = document.getElementById('main-content');
    if (main) {
      main.innerHTML = html;
      window.scrollTo(0, 0);
      if (typeof TOC !== 'undefined' && TOC.build) setTimeout(() => TOC.build(), 0);
      window.dispatchEvent(new CustomEvent('content-loaded', { detail: { path } }));
    }
  },
  updateNav(activePath) {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('data-path') === activePath);
    });
  },
  navigate(path) { window.location.hash = '#' + path; }
};''')

js_parts.append('''// ===== TOC =====
const TOC = {
  init() {
    window.addEventListener('content-loaded', () => this.build());
    window.addEventListener('scroll', () => this.updateActive(), { passive: true });
  },
  build() {
    const main = document.getElementById('main-content');
    const tocList = document.getElementById('toc-list');
    if (!main || !tocList) return;
    const headings = main.querySelectorAll('h2, h3');
    tocList.innerHTML = '';
    if (headings.length === 0) { document.getElementById('toc').style.display = 'none'; return; }
    document.getElementById('toc').style.display = 'block';
    headings.forEach((heading, idx) => {
      const id = heading.id || ('toc-' + idx);
      heading.id = id;
      const a = document.createElement('a');
      a.href = '#' + id;
      a.className = 'toc-link ' + (heading.tagName === 'H3' ? 'toc-h3' : '');
      a.textContent = heading.textContent;
      a.setAttribute('data-target', id);
      a.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      const li = document.createElement('li');
      li.appendChild(a);
      tocList.appendChild(li);
    });
  },
  updateActive() {
    const headings = document.querySelectorAll('#main-content h2, #main-content h3');
    const scrollTop = window.scrollY;
    let activeId = null;
    headings.forEach(h => { if (h.offsetTop - 100 <= scrollTop) activeId = h.id; });
    document.querySelectorAll('.toc-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('data-target') === activeId);
    });
  }
};''')

dim_children_js = js_str([{'title': t, 'desc': d} for t, d in DIM_CHILDREN])
hap_children = js_str(list(backend_data.keys()))
webview_children = js_str(list(WEBVIEW_SECTIONS.keys()))

js_parts.append('''// ===== 侧边栏（折叠子目录）=====
function renderNav(){
  const dimensions = ''' + dim_children_js + ''';
  const navItems = [
    { path: 'worldview',   label: '世界观' },
    { path: 'plan',        label: '建设计划' },
    { path: 'community',   label: '社区',     hasChildren: 'community' },
    { path: 'dao',         label: '道天地将法' },
    { path: 'data',        label: '数据架构' },
    { path: 'dimensions',  label: '12维度',   hasChildren: 'dimensions' },
    { path: 'search',      label: '倒排索引' },
    { path: 'mech',        label: '检索机制', hasChildren: 'mech' },
    { path: 'integral',    label: '积分系统' },
    { path: 'team',        label: 'Agent 团队' },
    { path: 'webview',     label: 'webview2.0', hasChildren: 'webview' },
    { path: 'hap',         label: '后端数据字典', hasChildren: 'hap' },
    { path: 'skills',      label: 'Skills' },
    { path: 'roadmap',     label: '产品路线' },
    { path: 'kb',          label: '知识库' },
    { path: 'docs',        label: '文档库' }
  ];
  const childMap = {
    dimensions: dimensions.map((d, i) => ({ title: d.title, href: '#dimensions/' + (i + 1) })),
    mech: ['权重', '置信度'].map(g => ({ title: g, href: '#mech/' + encodeURIComponent(g) })),
    webview: ['概述与架构','技术栈详解','商家端指南','落地项目'].map(g => ({ title: g, href: '#webview/' + encodeURIComponent(g) })),
    hap: ['内容元数据','电商业务表','组织与用户','地址表'].map(g => ({ title: g, href: '#hap/' + encodeURIComponent(g) })),
    community: [
      { title: '总览',         href: '#community' },
      { title: '帖子系统',     href: '#community/post' },
      { title: '悬赏接单',     href: '#community/悬赏' },
      { title: '成员管理',     href: '#community/member' },
      { title: '互动系统',     href: '#community/interact' },
      { title: '排行榜',       href: '#community/rank' },
      { title: '我的空间',     href: '#community/space' },
      { title: 'Agent 行为',   href: '#community/agent' },
      { title: '商家配置',     href: '#community/ui' }
    ]
  };
  let html = '<div class="sidebar-title">目录</div>';
  navItems.forEach(item => {
    if (item.hasChildren) {
      html += '<div class="nav-item nav-group">'
           + '<a class="nav-link nav-toggle" data-path="' + item.path + '" href="#' + item.path + '">'
           + '<span class="nav-icon"></span><span class="nav-label">' + item.label + '</span><span class="nav-arrow">▸</span></a>'
           + '<div class="nav-sub">';
      childMap[item.hasChildren].forEach(c => {
        html += '<a class="nav-sublink" href="' + c.href + '"><span class="nav-sub-icon"></span><span class="nav-sub-label">' + c.title + '</span></a>';
      });
      html += '</div></div>';
    } else {
      html += '<div class="nav-item"><a class="nav-link" data-path="' + item.path + '" href="#' + item.path + '">'
           + '<span class="nav-icon"></span><span class="nav-label">' + item.label + '</span></a></div>';
    }
  });
  document.getElementById('sidebar-nav').innerHTML = html;

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      const parent = link.closest('.nav-group');
      if (parent) {
        e.preventDefault();
        const sub = parent.querySelector('.nav-sub');
        const open = sub.style.display === 'block';
        sub.style.display = open ? 'none' : 'block';
        link.querySelector('.nav-arrow').textContent = open ? '▸' : '▾';
        Router.navigate(link.getAttribute('data-path'));
        return;
      }
      e.preventDefault();
      Router.navigate(link.getAttribute('data-path'));
    });
  });
  document.querySelectorAll('.nav-sublink').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      location.hash = link.getAttribute('href');
    });
  });
}''')

# ===== 12维双源：内联 HAP 客户端 + 维度填充钩子 + 文档页加载器（源码在 js/ 下，构建时注入）=====
for _js_name in ('hap-client.js', 'dimensions.js', 'doc-loader.js'):
    _js_path = os.path.join(HERE, 'js', _js_name)
    if os.path.exists(_js_path):
        with open(_js_path, 'r', encoding='utf-8') as _f:
            js_parts.append('// ===== inline: js/%s =====\n' % _js_name + _f.read())
    else:
        print('WARN: js/%s 不存在，跳过内联' % _js_name)

js_parts.append('''// ===== init =====
function init(){
  renderNav();
  Router.register('worldview', WorldviewPage);
  Router.register('dao', DaoPage);
  Router.register('data', DataArchPage);
  Router.register('dimensions', DimensionsPage);
  Router.register('search', SearchPage);
  Router.register('mech', () => '<article><div class="hero"><div class="hero-badge"><span>●</span> 检索机制</div><h1 class="hero-title">检索机制</h1><p class="hero-subtitle">权重与置信度驱动的排序/分区机制（数据从 HAP 实时加载）。</p></div><div id="mech-list" class="card-grid">加载中...</div></article>');
  Router.register('integral', IntegralPage);
  Router.register('team', AgentTeamPage);
  Router.register('webview', WebviewPage);
  Router.register('hap', HapPage);
  Router.register('skills', SkillsPage);
  Router.register('roadmap', RoadmapPage);
  Router.register('plan', BuildPlanPage);
  Router.register('kb', KnowledgeBasePage);
  Router.register('overview', OverviewPage);
  Router.register('docs', DocsPage);
  Router.register('community', CommunityPage);
  Router.init();
  TOC.init();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();''')

js_code = '\n\n'.join(js_parts)

html_out = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>孚世界 - Agent 群架构</title>
  <meta name="description" content="孚世界（fsj）是一套多 Agent 协作架构">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
{css}
{css_overrides}
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <a class="topbar-logo" href="#worldview">
        <span class="logo-text"><span>孚世界</span><small>FSJ · Agent 群架构</small></span>
      </a>
      <nav class="topbar-nav">
        <a href="#worldview">世界观</a>
        <a href="#dao">道天地将法</a>
        <a href="#data">数据架构</a>
        <a href="#dimensions">12维度</a>
        <a href="#search">检索</a>
        <a href="#integral">积分</a>
        <a href="#team">Agent</a>
        <a href="#webview">webview2.0</a>
        <a href="#hap">后端字典</a>
        <a href="#skills">Skills</a>
        <a href="#roadmap">路线</a>
        <a href="#plan">建设计划</a>
        <a href="#kb">知识库</a>
        <a href="#docs">文档</a>
        <a class="topbar-cta" href="#docs">开始使用 →</a>
      </nav>
    </div>
  </header>
  <div class="layout">
    <aside class="sidebar"><div id="sidebar-nav"></div></aside>
    <main class="main"><div class="main-wrapper"><div id="main-content"></div></div></main>
    <aside id="toc" class="toc">
      <div class="toc-title">本页目录</div>
      <ul id="toc-list" class="toc-list"></ul>
    </aside>
  </div>
<script>
{js_code}
</script>
</body>
</html>'''

with open(os.path.join(HERE, 'index.html'), 'w', encoding='utf-8') as f:
    f.write(html_out)
print(f'index.html generated: {len(html_out)} bytes ({len(html_out)/1024:.1f} KB)')