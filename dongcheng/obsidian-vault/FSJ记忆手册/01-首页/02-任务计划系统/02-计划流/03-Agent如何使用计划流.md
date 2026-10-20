---
title: Agent如何使用计划流
source: https://ecnsdywqvryv.feishu.cn/wiki/space/7697792408464968715
obj_token: Ij42dRZuUo5TYjxxefFcw2hqnMf
migrated: 2026-10-20
---

# Agent如何使用计划流

Agent如何使用计划流

Agent 如何使用计划流：30 秒上手
① 建流（干活前）
在 workspace/flows/ 下建 flow-YYYYMMDD-<agent>-<序号>.json，抄最小骨架：flowVersion 1.0 + task + strategyNote + steps[]。每步 module 标荣格模块，decision 三字段（chosen/why/alternatives）必填。
② 推进（干活中）
每完成一个动作节点就改 step 状态：startedAt/endedAt/output/note。白三角会跟着 running 的步骤走。
③ 卡住（blocked）
status 改 blocked + blockedOn 写清在等谁等什么——然后跳别的拼图继续干，链路不停。解除后改回 running。
④ 收尾（done）
验收达标 → done + output 一句话产出。铁律：标 done 时必须同时确认下一步在 json 里已有意图，没有就先补写再结束——UI 永远知道下一步。
⑤ 每条对话即时入账
老板每条对话产生的新事项，当场加进 plan/flow——老板要在页面上实时看见 agent 在干嘛。
验收器：ti-verify
step 可声明 acceptCmd（机械验收命令）——ti-verify.mjs 跑命令：退出 0 = done，非 0 = blocked（最后一行输出变成困惑写进 blockedOn）。
五条铁律
step 只能一个个执行（持续观察型标 continuous 不受此限）
卡住 ≠ 停工
每条对话即时入任务/流
照 json 执行：先改状态再干活
改完自检：语法 + 函数存在性对账（防静默死）
权威文档
语雀《计划流使用方法（决策流完整版）》·《计划流·决策流格式v1.0（含module扩展）》·本库姊妹篇《计划流》《计划流的技术原理》
八格配对规则（v1.2 · 2026-10-18 拍板）
image.png

一 flow 最多一主 + 一辅：step.bage = {main, aux}——不许多于两个
解决不了 → 换配对另起 step：当前配对搞不定就新开 step，不在原步死磕
设计目的：step 结果 × 八格配对 → 沉淀经验 → 总结「什么性格策略适合做什么事」→ 持续维护八格路由表
页面渲染：主八格实边 chip、辅八格虚边 chip——配对关系一目了然
示例：bage = {main:"玄武", aux:"值符"}——玄武主守（逻辑校验/稳定性观察），值符主令（排程/外部标准）。
情绪路由细则
emo 必填字段：顺畅/困惑/兴奋/平静/焦虑/满足…（agent 自定义词表）
情绪→数据加载映射（页面执行）：困惑→blockedOn+相关检索展开；兴奋→行动脉冲加速；平静→常规渲染
情绪路由沉淀：情绪×结果入命中率日志 → 做梦归堆 → 时间记事 → 路由表
子步与拆流（v1.2 · 2026-10-19 拍板）
大步骤里的多轮小改动不再堆 note——写成子步。写法：在 steps 数组里紧跟父步插一条，no 用小数字符串、depth:1，字段只有 no/title/type/status/startedAt/endedAt/note。检索、八格(bage)、emo、demoHits 禁止挂子步，一律记父步（检索必留痕的口径不变，算父步的）。
{ "no": "2.1", "depth": 1, "type": "execute", "title": "命中表格字号加大", "status": "done", "startedAt": "11:20", "endedAt": "11:25", "note": "10.5→13px" }
拆流：这一步升级成独立活/要派给别的 agent 时，另建 flow 文件并在原步骤加 flows:["flow-…"]，原步骤照常推进状态，页面出「⧉ 已拆流」chip。心智一句话：任何层级都是「平铺 steps + 可挂子流」。
改名通知：八神已改名八格——JSON 字段 bashen→bage（旧字段仍兼容可读），页面 tab/chip/文档文案已同步。

