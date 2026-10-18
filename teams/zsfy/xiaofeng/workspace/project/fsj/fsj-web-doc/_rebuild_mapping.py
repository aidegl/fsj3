# -*- coding: utf-8 -*-
"""重建 doc_tree_ids.json：从 HAP 实时 walk 数据库页面 b3960cf0 的整棵树
+HAP 写 12维度 dim_dir 真实 rowid（从 b3960cf0 的 zi 里找到 12维度 节点）"""
import urllib.request, json, sys
sys.stdout.reconfigure(encoding='utf-8')

APPKEY = 'c156d7e78368cbc1'
SIGN = 'NmM2NGE0ZTNlN2Y3NjU3ODY5MzMzOTk1NzBjMmMwMzNkNmE5NDU2MWZiYTg4ZWViNDk3MGE3MzU5MjcwNDU2MQ=='
WS = '6a03ceaa7e29abcb297cbdfc'
DB = 'b3960cf0-c291-4c15-b8d1-c31f7489b1c7'

def post(body):
    body = dict(body); body['appKey'] = APPKEY; body['sign'] = SIGN
    req = urllib.request.Request('https://api.mingdao.com/v2/open/worksheet/getRowByIdPost',
        data=json.dumps(body).encode('utf-8'),
        headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode('utf-8'))['data']

def parse_rel(v):
    if not v: return []
    s = str(v).strip()
    if s.startswith('['):
        try: return [x.get('sid','') if isinstance(x,dict) else str(x) for x in json.loads(s) if x]
        except: pass
    return [p.strip() for p in s.split(',') if p.strip()]

def alive(name_match=None, parent=None):
    for c in parse_rel(post({'worksheetId':WS,'rowId':parent})['zi']):
        row = post({'worksheetId':WS,'rowId':c})
        if row.get('shanchu') == '1': continue
        if name_match is None or row.get('mingcheng') == name_match:
            return c
    return None

# 1. 数据库下 一级目录
db_row = post({'worksheetId':WS,'rowId':DB})
print(f'数据库 page 现状: zi={len(parse_rel(db_row["zi"]))} 个')
all_dirs = []
for c in parse_rel(db_row['zi']):
    row = post({'worksheetId':WS,'rowId':c})
    if row.get('shanchu') == '1': continue
    all_dirs.append((row['mingcheng'], c, row.get('wznr','')[:30]))
print('一级目录:')
for n, r, w in all_dirs: print(f'  {n:>8}  {r}  wznr={w!r}')

# 2. 找 12维度 一级目录 → 它的叶子 = 12个维度
dim_dir = alive('12维度', DB)
print(f'\n12维度 dim_dir = {dim_dir}')
dim_leaves = {}
if dim_dir:
    for c in parse_rel(post({'worksheetId':WS,'rowId':dim_dir})['zi']):
        row = post({'worksheetId':WS,'rowId':c})
        if row.get('shanchu') == '1': continue
        dim_leaves[row['mingcheng']] = c
print(f'12 维度叶子: {len(dim_leaves)} 条')

# 3. 4 个新页面的叶子
pages = {}
for dir_name, dir_rid, _ in all_dirs:
    if dir_name == '12维度': continue
    leaves = {}
    for c in parse_rel(post({'worksheetId':WS,'rowId':dir_rid})['zi']):
        row = post({'worksheetId':WS,'rowId':c})
        if row.get('shanchu') == '1': continue
        leaves[row['mingcheng']] = c
    pages[dir_name] = {'rowid': dir_rid, 'leaves': leaves}
    print(f'{dir_name}: {len(leaves)} 个叶子')

# 4. 写映射
mapping = {
    'db_page': DB,
    'dirs': {n: r for n, r, _ in all_dirs if n not in ['内容元数据','电商业务表','组织与用户','地址表']},
    'leaves': {  # 老 4 组的表级叶子（如果还在）
        n: parse_rel(post({'worksheetId':WS,'rowId':r})['zi'])
        for n, r, _ in all_dirs if n not in ['12维度','架构','webview2.0','社区','组织']
    },
    'dims_dir': dim_dir,
    'dims_leaves': dim_leaves,
    'pages': pages,
}
with open('doc_tree_ids.json', 'w', encoding='utf-8') as f:
    json.dump(mapping, f, ensure_ascii=False, indent=2)
print(f'\n已写入 doc_tree_ids.json (pages: {len(pages)}, dims_leaves: {len(dim_leaves)})')
