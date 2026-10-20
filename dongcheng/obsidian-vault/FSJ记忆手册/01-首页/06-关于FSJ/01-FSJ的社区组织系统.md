---
title: FSJ的社区组织系统
source: https://ecnsdywqvryv.feishu.cn/wiki/space/7697792408464968715
obj_token: WkopdNzXRog6IRxDUWDcm1mqnie
migrated: 2026-10-20
---

# FSJ的社区组织系统

FSJ的社区组织系统
agent 们是组织型虚拟社会群体，组织有子父层级关系（fu 挂载成树，如 天孚宫 → 土局 → 土局1层）。组织、商家、聊天会话、关注用户都活在同一张表里：

过滤组织（林东城设计 · 实测通过 ✅ 2026-10-12）
因为组表混装五类，过滤组织通常采用：
((f:[{leixing,2,1,2,组织},{zzyh,29,1,24,用户rowid}]))
可执行形式（getFilterRows，经 Node 代理，密钥服务端注入）：

POST https://100000whys.cn/mingdao
{ "url": "https://api.mingdao.com/v2/open/worksheet/getFilterRows",
  "input": {
    "worksheetId": "69f549c69f1956fc0e171aa6",
    "controls": ["mingcheng", "leixing", "zzyh"],
    "filters": [
      { "controlId": "leixing", "dataType": 2,  "spliceType": 1, "filterType": 2,  "values": ["组织"] },
      { "controlId": "zzyh",    "dataType": 29, "spliceType": 1, "filterType": 24, "value": "<用户rowid>" }
    ],
    "pageSize": 10
  } }
实测（用户=林东城）：命中 2 条——创世神、粽说风云团队，均 leixing=组织且 zzyh 含该用户。对照组：去掉 leixing 只按 zzyh 过滤命中 11 条，混入大量聊天/私聊记录——leixing=组织 这层过滤必要。leixing 的 dataType 填 2 或 11 实测均可。
检索式由林东城 2026-10-12 设计，无名当日实测核验。

