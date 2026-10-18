# -*- coding: utf-8 -*-
"""把误建在林东城树里的「检索机制/权重/置信度」3 条迁到小风自己的树 (fsj-web-doc → 数据库)"""
import urllib.request, json, time, sys
sys.stdout.reconfigure(encoding='utf-8')

APPKEY = 'c156d7e78368cbc1'
SIGN = 'NmM2NGE0ZTNlN2Y3NjU3ODY5MzMzOTk1NzBjMmMwMzNkNmE5NDU2MWZiYTg4ZWViNDk3MGE3MzU5MjcwNDU2MQ=='
WS = '6a03ceaa7e29abcb297cbdfc'
XIAOFENG = 'a8515e76-7b02-4baf-bedd-3ff011b1a9e5'
TIAN = '8efa9d4b-1759-464f-818b-813537c709ef'  # 林东城的天根（不写）
DB = 'b3960cf0-c291-4c15-b8d1-c31f7489b1c7'    # 小风的数据库根（写入这里）

# 要清理的 3 条
OLD_ROWS = [
    '8a5d3a6a-362c-4694-9a90-263e6a248609',  # 检索机制 (误建)
    '931e1c6a-7970-4342-9b5e-75b676f70238',  # 权重
    '2ca38ee3-fc84-4102-9900-b142c0d73467',  # 置信度
]

WZNRS = {
    '权重': (
        '**字段 UUID**：`6a051fd0f255b2b51491a981`\n\n'
        '**触发动作**：同区域内拖动（不换区，只换位置）\n\n'
        '**作用**：控制**同一象限内**的显示顺序——同区域里 quanzhong 越大越靠前\n\n'
        '**写入接口**：`/api/record-update`，改该节点的 `quanzhong` 字段值'
    ),
    '置信度': (
        '**字段 UUID**：`6a410730405fcd4e19424918`\n\n'
        '**触发动作**：跨区域拖动（换区，从一象限到另一象限）\n\n'
        '**作用**：控制 **Eisenhower 四象限分区**（8000-10000 红 / 6000-7999 蓝 / 4000-5999 黄 / 2000-3999 灰 / 0-1999 半透明）\n\n'
        '**写入接口**：`/api/record-update`，改该节点的 `zhixindu` 字段值'
    ),
}

def post(ep, body):
    body = dict(body); body['appKey'] = APPKEY; body['sign'] = SIGN
    data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request('https://api.mingdao.com' + ep, data=data,
        headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode('utf-8'))

def add_row(controls):
    r = post('/v2/open/worksheet/addRow', {
        'appKey': APPKEY, 'sign': SIGN, 'worksheetId': WS,
        'triggerWorkflow': False, 'getSystemControl': 'false', 'controls': controls,
    })
    if not r.get('success'): raise RuntimeError(f'addRow fail: {str(r)[:300]}')
    return r['data']

def edit_row(rid, controls):
    r = post('/v2/open/worksheet/editRow', {
        'appKey': APPKEY, 'sign': SIGN, 'worksheetId': WS, 'rowId': rid,
        'triggerWorkflow': False, 'getSystemControl': 'false', 'controls': controls,
    })
    if not r.get('success'): raise RuntimeError(f'editRow fail: {str(r)[:300]}')

def get_row(rid):
    r = post('/v2/open/worksheet/getRowByIdPost', {
        'appKey': APPKEY, 'sign': SIGN, 'worksheetId': WS, 'rowId': rid, 'getSystemControl': 'false',
    })
    if not r.get('success'): raise RuntimeError(f'getRow fail: {str(r)[:200]}')
    return r['data']

def parse_rel(v):
    if not v: return []
    s = str(v).strip()
    if s.startswith('['):
        try: return [x.get('sid','') if isinstance(x,dict) else str(x) for x in json.loads(s) if x]
        except: pass
    return [p.strip() for p in s.split(',') if p.strip()]

def child_by_name(parent_rid, name):
    for c in parse_rel(get_row(parent_rid).get('zi') or ''):
        row = get_row(c)
        if row.get('mingcheng') == name and row.get('shanchu') != '1':
            return c
    return None

# ============ A. 逻辑删除林东城树里的 3 条 ============
print('=== A. 删林东城树 3 条 ===')
for rid in OLD_ROWS:
    row = get_row(rid)
    name = row.get('mingcheng', '?')
    if row.get('shanchu') == '1':
        print(f'  -{name} 已是 shanchu=1，跳过')
        continue
    edit_row(rid, [{'controlId': 'shanchu', 'value': '1'}])
    print(f'  -{name} ({rid[:8]}) shanchu=1')
    time.sleep(0.15)

# 从天根 zi 里剔除这 3 个
tian = get_row(TIAN)
zi = parse_rel(tian.get('zi') or '')
new_zi = [c for c in zi if c not in OLD_ROWS]
if new_zi != zi:
    edit_row(TIAN, [{'controlId': 'zi', 'value': ','.join(new_zi), 'valueType': 2}])
    print(f'  天根 zi 收敛: {len(zi)} → {len(new_zi)}')
else:
    print(f'  天根 zi 已不含旧 3 条（无需收敛）')

# ============ B. 在数据库 (b3960cf0) 下建 检索机制 + 权重 + 置信度 ============
print('\n=== B. 在数据库下建 检索机制/权重/置信度 ===')
cat = child_by_name(DB, '检索机制')
if not cat:
    cat = add_row([
        {'controlId':'mingcheng', 'value':'检索机制'},
        {'controlId':'leixing', 'value':'知识'},
        {'controlId':'sew', 'value':'9信息', 'valueType':2},
        {'controlId':'fabuzhe', 'value':XIAOFENG, 'valueType':2},
        {'controlId':'fu', 'value':DB, 'valueType':2},
        {'controlId':'wznr', 'value':'检索机制总览：权重（quanzhong）控同区域内排序，置信度（zhixindu）控跨区分布。详见子节点。'},
    ])
    print(f'  +[检索机制] 一级目录 -> {cat}')
    time.sleep(0.2)
else:
    print(f'  [检索机制] 已存在 -> {cat}')

leaf_ids = {}
for name in ['权重', '置信度']:
    rid = child_by_name(cat, name)
    if not rid:
        rid = add_row([
            {'controlId':'mingcheng', 'value':name},
            {'controlId':'leixing', 'value':'知识'},
            {'controlId':'sew', 'value':'9信息', 'valueType':2},
            {'controlId':'fabuzhe', 'value':XIAOFENG, 'valueType':2},
            {'controlId':'fu', 'value':cat, 'valueType':2},
            {'controlId':'wznr', 'value': WZNRS[name]},
        ])
        print(f'  +[{name}] 二级目录 -> {rid}')
        time.sleep(0.2)
    else:
        print(f'  [{name}] 已存在 -> {rid}')
    leaf_ids[name] = rid

# 收敛 zi
edit_row(cat, [{'controlId':'zi', 'value': ','.join(leaf_ids.values()), 'valueType': 2}])
print(f'  [检索机制] zi 收敛 -> 权重/置信度')

# 数据库 zi 加新一级目录（不剔除其他）
db = get_row(DB)
db_zi = parse_rel(db.get('zi') or [])
if cat not in db_zi:
    db_zi.append(cat)
    edit_row(DB, [{'controlId':'zi', 'value': ','.join(db_zi), 'valueType': 2}])
    print(f'  数据库 zi 加入 检索机制 -> 现在 {len(db_zi)} 个一级目录')

# ============ C. 更新 doc_tree_ids.json 的 pages 映射 ============
print('\n=== C. 更新 doc_tree_ids.json ===')
import os
mf = 'doc_tree_ids.json'
with open(mf, 'r', encoding='utf-8') as f:
    ids = json.load(f)
ids.setdefault('pages', {})['检索机制'] = {
    'rowid': cat,
    'leaves': leaf_ids,
}
with open(mf, 'w', encoding='utf-8') as f:
    json.dump(ids, f, ensure_ascii=False, indent=2)
print(f'  doc_tree_ids.json.pages.检索机制 已写入')

print('\n完成。')
print(f'下一步：重启 proxy.js（doctree 无 TTL，缓存需清）')
print(f'  powershell -c "Get-NetTCPConnection -LocalPort 3012 -State Listen | Stop-Process -Id \\$_.OwningProcess -Force"')
