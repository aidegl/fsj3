---
title: rowid检索
source: https://ecnsdywqvryv.feishu.cn/wiki/space/7697792408464968715
obj_token: XfcPdTAhVovswOxDjTNcg9kAnge
migrated: 2026-10-20
---

# rowid检索

rowid检索
按 rowid 直取一条，rowid 处填真实记录 id。已知 id 时直接拿全文：引用展开、验证落库、读消息原文。
范围参数（b / c）
挂在 k / v / g / r 后面（f: 不生效，见上），越搜越窄、还能当权限校验：

示例：(((r:rowid,b:B,c:C))) = 按 rowid 取数，限定组织 B、发布人 C（权限校验式读取）。
组合示例与使用纪律
((((k:A)((v:A)((f:[{mingcheng,2,1,2,技能},{sew,2,1,2,技能}]+control1+control2))((r:rowid,b:B,c:C))))
组合规则：条件从左往右包一层，返回满足全部条件的记录集。使用纪律：先小范围验证一条策略，确认命中合理后再复制扩展——盲写的复杂策略容易静默漏召。语法只是钥匙，入库时 mingcheng / miaoshu / 关键词 / 权重齐全，检索才打得开锁。
执行层：检索式 → getFilterRows
五式简写是 agent 面向的协议写法，真正执行要转成 getFilterRows 的 filters 数组。对照规则：


POST https://100000whys.cn/mingdao        # Node 代理，密钥服务端注入
{ "url": "https://api.mingdao.com/v2/open/worksheet/getFilterRows",
  "input": { "worksheetId": "<表id>",
    "controls": ["mingcheng", "control1", "control2"],
    "filters": [
      { "controlId": "leixing", "dataType": 2,  "spliceType": 1, "filterType": 2,  "values": ["组织"] },
      { "controlId": "zzyh",    "dataType": 29, "spliceType": 1, "filterType": 24, "value": "<用户rowid>" }
    ] } }
# 实测 ✅ 2026-10-12：组表命中 创世神、粽说风云团队（详见「社区组织体系」）
⚠ 键名必须 filters——写成 filterControls 平台不报错、静默忽略过滤返回全表。

