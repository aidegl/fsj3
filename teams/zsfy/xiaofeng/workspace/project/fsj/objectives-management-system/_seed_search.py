# -*- coding: utf-8 -*-
"""在 HAP shangpin 树里给 objectives-management-system 补「检索机制」一级目录
+ 权重/置信度 二级目录数据"""
import urllib.request, json, sys, time
sys.stdout.reconfigure(encoding='utf-8')

APPKEY = 'c156d7e78368cbc1'
SIGN = 'NmM2NGE0ZTNlN2Y3NjU3ODY5MzMzOTk1NzBjMmMwMzNkNmE5NDU2MWZiYTg4ZWViNDk3MGE3MzU5MjcwNDU2MQ=='
WS = '6a03ceaa7e29abcb297cbdfc'
XIAOFENG = 'a8515e76-7b02-4baf-bedd-3ff011b1a9e5'
TIAN = '8efa9d4b-1759-464f-818b-813537c709ef'  # 天根

# 二级目录的 wznr（与 README 检索机制小节对应，简洁版）
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
    data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request('https://api.mingdao.com' + ep, data=data,
        headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode('utf-8'))

def add_row(controls):
    # 2026-09-06 拍板：创建 shangpin 必带 shangjia2（按 fabuzhe 解析；解析不到跳过，HAP 工作流兜底）
    if not any(c.get('controlId') == 'shangjia2' for c in controls):
        fbz = next((c.get('value') for c in controls if c.get('controlId') == 'fabuzhe'), '')
        sj2 = resolve_shangjia2(fbz)
        if sj2:
            controls.append({'controlId': 'shangjia2', 'value': sj2, 'valueType': 2})
    r = post('/v2/open/worksheet/addRow', {
        'appKey': APPKEY, 'sign': SIGN, 'worksheetId': WS,
        'triggerWorkflow': False, 'getSystemControl': 'false', 'controls': controls,
    })
    if not r.get('success'): raise RuntimeError(f'addRow fail: {str(r)[:300]}')
    return r['data']

_SJ2_CACHE = {}
def resolve_shangjia2(fabuzhe_rowid):
    """fabuzhe（成员表 rowid）→ 成员记录 shangjia 关联字段首元素 sid = 所属商家 rowid"""
    if not fabuzhe_rowid: return ''
    if fabuzhe_rowid in _SJ2_CACHE: return _SJ2_CACHE[fabuzhe_rowid]
    out = ''
    try:
        r = post('/v2/open/worksheet/getRowByIdPost', {
            'appKey': APPKEY, 'sign': SIGN, 'worksheetId': '69b0077358322d512e60bad0',
            'rowId': fabuzhe_rowid, 'getSystemControl': 'false'})
        raw = (r.get('data') or {}).get('69f55cde5d4f084515ced817')
        if isinstance(raw, str):
            try: raw = json.loads(raw)
            except Exception: raw = []
        if isinstance(raw, list) and raw and raw[0].get('sid'): out = raw[0]['sid']
    except Exception as e:
        print(f'! shangjia2 解析失败跳过: {e}')
    _SJ2_CACHE[fabuzhe_rowid] = out
    return out

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

# 1. 检查「检索机制」一级目录是否已存在
def find_child(parent_rid, name):
    for c in parse_rel(get_row(parent_rid).get('zi') or ''):
        row = get_row(c)
        if row.get('mingcheng') == name and row.get('shanchu') != '1':
            return c
    return None

cat_rid = find_child(TIAN, '检索机制')
if not cat_rid:
    cat_rid = add_row([
        {'controlId':'mingcheng', 'value':'检索机制'},
        {'controlId':'leixing', 'value':'知识'},
        {'controlId':'sew', 'value':'7目标', 'valueType':2},
        {'controlId':'fabuzhe', 'value':XIAOFENG, 'valueType':2},
        {'controlId':'fu', 'value':TIAN, 'valueType':2},
        {'controlId':'wznr', 'value':'检索机制总览：权重（quanzhong）控同区域内排序，置信度（zhixindu）控跨区分布。详见子节点。'},
    ])
    print(f'+[检索机制] 一级目录 -> {cat_rid}')
    time.sleep(0.2)
else:
    print(f'[检索机制] 已存在 -> {cat_rid}')

# 2. 在「检索机制」下建两个二级目录：权重、置信度
for name in ['权重', '置信度']:
    rid = find_child(cat_rid, name)
    wznr = WZNRS[name]
    if not rid:
        rid = add_row([
            {'controlId':'mingcheng', 'value':name},
            {'controlId':'leixing', 'value':'知识'},
            {'controlId':'sew', 'value':'8计划', 'valueType':2},
            {'controlId':'fabuzhe', 'value':XIAOFENG, 'valueType':2},
            {'controlId':'fu', 'value':cat_rid, 'valueType':2},
            {'controlId':'wznr', 'value':wznr},
        ])
        print(f'  +[{name}] 二级目录 -> {rid}')
        time.sleep(0.2)
    else:
        print(f'  [{name}] 已存在 -> {rid}')

# 3. 把两个二级目录 rowid 写到「检索机制」zi
post('/v2/open/worksheet/editRow', {
    'appKey': APPKEY, 'sign': SIGN, 'worksheetId': WS, 'rowId': cat_rid,
    'triggerWorkflow': False, 'getSystemControl': 'false',
    'controls': [{'controlId':'zi', 'value': ','.join([find_child(cat_rid, n) for n in ['权重', '置信度']]), 'valueType':2}],
})
print('zi 收敛：检索机制 -> 权重/置信度')
