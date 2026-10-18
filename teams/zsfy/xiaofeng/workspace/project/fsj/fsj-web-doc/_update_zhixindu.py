# -*- coding: utf-8 -*-
"""重写 fsj-web-doc/检索机制/置信度 二级目录的 wznr。
根据 2026-08-27 用户解释的"父子汇聚"语义完整重写，废弃旧 221 字的
"Eisenhower 8000-10000 红/6000-7999 蓝"错误版本。
"""
import urllib.request, json, sys
sys.stdout.reconfigure(encoding='utf-8')

APPKEY = 'c156d7e78368cbc1'
SIGN    = 'NmM2NGE0ZTNlN2Y3NjU3ODY5MzMzOTk1NzBjMmMwMzNkNmE5NDU2MWZiYTg4ZWViNDk3MGE3MzU5MjcwNDU2MQ=='
WS      = '6a03ceaa7e29abcb297cbdfc'                # shangpin
ROWID   = '9e323e50-9b55-420a-8bf8-56963c7f0946'   # 置信度 二级目录

WznR = (
    '# 置信度（zhixindu）\n\n'
    '> 评估一条数据"可信度"的父子汇聚机制 —— 父级自动汇总，正/负双向计分。\n\n'
    '## 一、一句话理解\n\n'
    '**置信度 = 这条父数据下面，所有子证据有多值得信。**\n\n'
    '置信度不是单条数据自己填的，而是**子数据加减分汇总到父上得到的总分**——本质是一套"父子树状信任评估"机制：\n\n'
    '- **子数据**：根据内容质量填一个正向分（0-10000）或负向分（-10000 至 0）\n'
    '- **父数据**：HAP 系统自动把所有子的打分求和，得到"置信度正汇总 + 置信度负汇总"，再相加就是"置信度"\n\n'
    '叶子节点没有子数据，置信度恒为 0（字段保留但无意义）。\n\n'
    '---\n\n'
    '## 二、4+1 字段体系\n\n'
    'shangpin 表里实际有 **5 个置信度相关字段**，分两组：\n\n'
    '### 子数据填（2 个）\n\n'
    '| 别名 | controlId | 范围 | 含义 |\n'
    '|---|---|---|---|\n'
    '| **置信度正** | `zxdz` | 0 ~ 10000 | 这条子证据"加多少分"——支持这条父断言的强度 |\n'
    '| **置信度负** | `zxdf` | -10000 ~ 0 | 这条子证据"扣多少分"——反对/矛盾/不可靠的强度 |\n\n'
    '### 父数据自动算（3 个）\n\n'
    '| 别名 | controlId | 计算方式 | 含义 |\n'
    '|---|---|---|---|\n'
    '| **置信度正汇总** | `zxdzhz` | `= SUM(子.zxdz)` | 所有子正向分求和（HAP 自动 rollup） |\n'
    '| **置信度负汇总** | `zxdfhz` | `= SUM(子.zxdf)` | 所有子负向分求和（HAP 自动 rollup） |\n'
    '| **置信度** | `zhixindu` | `= zxdzhz + zxdfhz` | 正负总和，反映"子证据整体支撑度" |\n\n'
    '**写入要点**：\n\n'
    '- ✅ **子数据填 `zxdz` 和 `zxdf`**，由人或规则算\n'
    '- ❌ **父数据不用填那 3 个字段**，HAP 自动聚合，写了也会被覆盖\n'
    '- 🔁 **叶子节点** 3 个父字段都是 0，无意义但字段保留\n\n'
    '---\n\n'
    '## 三、计分规则——父定义、子打\n\n'
    '每个父数据**自己定义**对子数据的打分规则：\n\n'
    '### 正向加分（累加到 zxdz）\n\n'
    '- **一手 vs 二手**：一手记录 > 二手转述（最高 8000-10000）\n'
    '- **多源独立佐证**：被多条独立记录共同支持 > 单一来源\n'
    '- **验证模式**：`shangjia1=1`（验证） > `shangjia1=0`（推理）\n'
    '- **被引用**：被其他权威数据引用 > 无引用\n'
    '- **长期稳定**：数据稳定不变 > 频繁变动\n\n'
    '### 负向减分（累加到 zxdf）\n\n'
    '- **存在矛盾记录**：与其他独立记录明显冲突\n'
    '- **来源不可靠**：来自已知不可信渠道\n'
    '- **过期/证伪**：已被新数据覆盖或证明错误\n\n'
    '一个父节点可以同时有"多次佐证的高分孩子"和"被多次证伪的低分孩子"——最终 `zhixindu = 高分总和 - 低分总和`。\n\n'
    '---\n\n'
    '## 四、典型场景\n\n'
    '### 场景 1：知识档案\n\n'
    '```\n'
    '父：椰子档案（shangjia1=1 验证模式）\n'
    '  ├── 子1：椰子生日记录（zxdz=8000，一手多次确认）\n'
    '  ├── 子2：椰子 MBTI 测评（zxdz=5000，单次测评）\n'
    '  ├── 子3：网传"椰子是 ENFP"（zxdf=-3000，与档案矛盾）\n'
    '  └── 子4：旧版错误档案（zxdf=-2000，已被覆盖）\n\n'
    '汇总：\n'
    '  zxdzhz  = 8000 + 5000 + 0 + 0         = 13000\n'
    '  zxdfhz  = 0 + 0 + (-3000) + (-2000)  = -5000\n'
    '  zhixindu = 13000 + (-5000)           = 8000\n'
    '```\n\n'
    '### 场景 2：商品评价\n\n'
    '```\n'
    '父：某商品\n'
    '  ├── 子评价 1：5星好评 + 实拍图（zxdz=2000）\n'
    '  ├── 子评价 2：3星中评（zxdz=500）\n'
    '  ├── 子评价 3：1星差评，与体验严重不符（zxdf=-1500）\n'
    '  └── 子评价 4：刷评证据，已被举报（zxdf=-5000）\n\n'
    '汇总：zhixindu = 2000 + 500 + (-1500) + (-5000) = -4000\n'
    '```\n\n'
    '→ 负分主导，说明商品评价整体不可信。\n\n'
    '### 场景 3：子多 vs 子少\n\n'
    '| 父节点 | 子数 | 单条平均打分 | zhixindu |\n'
    '|---|---|---|---|\n'
    '| A. 子少+打分高 | 2 条 | zxdz=8000 | **16000** |\n'
    '| B. 子多+打分一般 | 20 条 | zxdz=1000 | **20000** |\n\n'
    'B 的 zhixindu 数值更高，但**单条证据强度**低于 A。置信度反映的是"总和"，不是"单条强度"。要看单条强度需要回到 `zxdz` 本身。\n\n'
    '---\n\n'
    '## 五、与权重（quanzhong）的区别\n\n'
    '| 维度 | 置信度 | 权重 |\n'
    '|---|---|---|\n'
    '| 含义 | 数据**有多可信** | 数据**有多重要** |\n'
    '| 谁填 | 子数据填 zxdz/zxdf；父自动汇总 | 任何节点都可手填 |\n'
    '| 范围 | zxdz∈[0,10000]、zxdf∈[-10000,0]；汇总无硬上限 | 0~1000 |\n'
    '| 排序场景 | "信不信得过"（过滤低质） | "排前面还是后面"（同级排序） |\n\n'
    '**一句话**：\n'
    '> 关键词决定"找不找得到"，置信度决定"信不信得过"，权重决定"排不排前面"。\n\n'
    '---\n\n'
    '## 六、写入接口\n\n'
    '- **子数据**：`POST /api/record-update`，写 `zxdz` + `zxdf`，HAP 后台自动触发父级 rollup\n'
    '- **父数据**：不要手动改 `zxdzhz`/`zxdfhz`/`zhixindu`，系统会覆盖\n'
    '- **批量重算**：HAP 后台定时任务全量重算所有父级（修复偏差）\n'
    '- **查询**：用 `filter` 拉 shangpin 时可直接过滤 `zhixindu >= 阈值`，排除低质父节点\n\n'
    '---\n\n'
    '## 七、字段 UUID（写代码用）\n\n'
    '| 字段 | controlId | UUID |\n'
    '|---|---|---|\n'
    '| 置信度 | `zhixindu` | `6a410730405fcd4e19424918` |\n'
    '| 置信度正 | `zxdz` | （待补） |\n'
    '| 置信度负 | `zxdf` | （待补） |\n'
    '| 置信度正汇总 | `zxdzhz` | （待补） |\n'
    '| 置信度负汇总 | `zxdfhz` | （待补） |\n\n'
    '> 注：`hap_data.json` 是过期快照，不含 `zxdz`/`zxdf`/`zxdzhz`/`zxdfhz` 这 4 个字段。补 UUID 后建议同时跑 `fetch_data.py`（待恢复）刷新本地快照。\n'
)

def post_req(ep, body):
    body = dict(body); body['appKey'] = APPKEY; body['sign'] = SIGN
    data = json.dumps(body, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request('https://api.mingdao.com' + ep, data=data,
        headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode('utf-8'))

# 1. 先把请求体写到 UTF-8 文件（CLAUDE.md Windows 中文编码硬规则）
body = {
    'worksheetId': WS,
    'rowId': ROWID,
    'triggerWorkflow': False,
    'getSystemControl': 'false',
    'controls': [
        {'controlId': 'wznr', 'value': WznR},
    ],
}
body_file = r'C:\Users\99739\AppData\Local\Temp\fsj_edit_zhixindu.json'
with open(body_file, 'w', encoding='utf-8') as f:
    json.dump(body, f, ensure_ascii=False, indent=2)
print(f'请求体已落盘: {body_file} ({len(json.dumps(body, ensure_ascii=False).encode("utf-8"))} bytes UTF-8)')

# 2. 验证当前 row 状态（防止改错对象）
check = post_req('/v2/open/worksheet/getRowByIdPost',
    {'worksheetId': WS, 'rowId': ROWID, 'getSystemControl': 'false'})
if not check.get('success'):
    print('!! 校验失败，无法读取 row 状态：', check)
    sys.exit(1)
cur = check['data']
print(f'当前 row: mingcheng={cur.get("mingcheng")}  wznr 字数={len(cur.get("wznr") or "")}  fu={cur.get("fu")}')
assert cur.get('mingcheng') == '置信度', f'!! row 不是 置信度，请确认 ROWID 是否正确'
assert (cur.get('wznr') or '').strip() != WznR.strip(), '!! 新内容与旧内容完全相同，跳过写入'

# 3. 读 UTF-8 文件发请求（中文安全传输）
with open(body_file, 'r', encoding='utf-8') as f:
    raw = f.read()
data = raw.encode('utf-8')
req = urllib.request.Request('https://api.mingdao.com/v2/open/worksheet/editRow',
    data=data,
    headers={'Content-Type': 'application/json; charset=utf-8'}, method='POST')
with urllib.request.urlopen(req, timeout=30) as r:
    resp = json.loads(r.read().decode('utf-8'))

print('editRow resp:', json.dumps(resp, ensure_ascii=False, indent=2)[:500])
if not resp.get('success'):
    print('!! 写入失败')
    sys.exit(2)

# 4. 回读校验
verify = post_req('/v2/open/worksheet/getRowByIdPost',
    {'worksheetId': WS, 'rowId': ROWID, 'getSystemControl': 'false'})
new_len = len(verify['data'].get('wznr') or '')
print(f'回读 wznr 字数: {new_len}（预期 {len(WznR)}）')
assert new_len == len(WznR), f'!! 字数不匹配，可能写入失败或被截断'

print('\n✅ 写入成功。下一步：重启 proxy.js（doctree 无 TTL）')
print('   powershell -c "Get-NetTCPConnection -LocalPort 3012 -State Listen | Stop-Process -Id $_.OwningProcess -Force"')