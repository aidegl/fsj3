/**
 * feishu-write-docs.mjs — 飞书文档写入核心（转正版）
 * 复用：T/h1/h2/h3/p/pB/b 生成器把内容变飞书块，分批≤40 POST
 * 用法：改文末三个 docX 内容数组（或照抄结构加新文档）→ node 本脚本
 * 依赖：feishu-token.txt（自动刷新见 feishu-api.mjs）
 */
import fs from 'node:fs';
const TOKEN = fs.readFileSync('D:/Item/fsj/tmp-api/feishu-token.txt', 'utf8').trim();
const BASE = 'https://open.feishu.cn/open-apis';
const api = (method, path, body) =>
  fetch(BASE + path, { method, headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json; charset=utf-8' }, body: body ? JSON.stringify(body) : undefined }).then(r => r.json());

const T = (s, bold) => ({ text_run: { content: s, text_element_style: bold ? { bold: true } : {} } });
const h1 = s => ({ block_type: 3, heading1: { elements: [T(s, true)], style: {} } });
const h2 = s => ({ block_type: 4, heading2: { elements: [T(s, true)], style: {} } });
const h3 = s => ({ block_type: 5, heading3: { elements: [T(s, true)], style: {} } });
const p = s => ({ block_type: 2, text: { elements: [T(s)], style: {} } });
const pB = s => ({ block_type: 2, text: { elements: [T(s, true)], style: {} } });
const b = s => ({ block_type: 12, bullet: { elements: [T(s)], style: {} } });
const o = s => ({ block_type: 13, ordered: { elements: [T(s)], style: {} } });

async function writeDoc(docId, children, label) {
  for (let i = 0; i < children.length; i += 40) {
    const chunk = children.slice(i, i + 40);
    const r = await api('POST', `/docx/v1/documents/${docId}/blocks/${docId}/children`, { children: chunk, index: -1 });
    if (r.code !== 0) { console.log('✗', label, 'chunk', i, JSON.stringify(r).slice(0, 140)); return false; }
    console.log('✓', label, 'chunk', i, '+' + chunk.length);
  }
  return true;
}

// ============ Doc1 计划流 ============
const doc1 = [
  h1('计划流是什么'),
  p('一句话：计划流 = agent 的执行队列——json 是唯一真相，agent 照它干活、干完即改状态，老板通过像素视界上帝端毫秒级看到全部过程。每一步「做了什么、为什么、检索策略是什么」全程可溯源，不像裸 CLI 执行完就删。'),
  h2('核心概念'),
  b('P = 拼图（7目标）：每块拼图是一个目标；任务列表里的每张卡都标注它服务的 P 几'),
  b('s = 拼图上的图案（8计划）：计划条目与流步骤统一用 s 编号，层级靠上下文区分'),
  b('module = 本步采用的荣格模块：Ti 逻辑校验 / Te 排程 / Si 翻旧例 / Se 现场直取 / Ni 看主线 / Fe 协作……agent 自定义设计'),
  b('status：todo → running → done；blocked = 困惑卡点（blockedOn 写清等谁等什么）'),
  b('decision = {chosen, why, alternatives[]}：溯源核心——做了什么/为什么/放弃了什么'),
  h2('实时闭环'),
  p('agent 写 json（任意工具调用）→ fs.watch 毫秒捕获 → WebSocket/SSE 推送 → 上帝端页面即时重绘。轮询已废除。'),
  h2('铁律五条'),
  o('step 只能一个个执行：同一时刻执行型 step 只有一个 running（持续观察型标 continuous，不受此限）'),
  o('卡住 ≠ 停工：blocked 后跳别的拼图继续干，链路不停'),
  o('每条对话即时入账：对话产生的新事项马上加进 plan/flow，不等收尾'),
  o('照 json 执行：json 是执行队列不是事后笔记——先改状态再干活，或同步改'),
  o('改完自检：语法检查 + 函数存在性对账，防静默死'),
  h2('权威文档'),
  b('语雀《计划流使用方法（决策流完整版）》·《计划流·决策流格式v1.0（含module扩展）》'),
  b('本知识库姊妹篇：《计划流的技术原理》《Agent如何使用计划流》'),
];

// ============ Doc2 计划流的技术原理 ============
const doc2 = [
  h1('技术原理：从 json 到像素的全链路'),
  p('四层：json 真相层 → fs.watch 采集层 → WebSocket/SSE 推送层 → 上帝端渲染层。每层可独立替换，接口不变。'),
  h2('① json 真相层'),
  p('flow-YYYYMMDD-<agent>-<序号>.json 是唯一真相：任务封面（task/status/strategyNote/goalRef）+ steps[]（每步 no/type/module/title/status/decision/output/note）。改文件 = 改状态，git 天然留痕。'),
  h2('② 采集层：fs.watch'),
  p('server 对 flows 目录挂 fs.watch——agent 每次写盘 150ms 去抖后触发。曾踩坑：并行会话把 node:fs 具名导入改掉导致 fs 未定义、watcher 静默失联——已加挂载日志自证。'),
  h2('③ 推送层：WebSocket + SSE 双通道'),
  p('WebSocket（ws 包，/ws 路径，断线自动重连）为主；SSE（/api/events）为备。服务端毫秒级 broadcast，页面 onmessage 即渲染。Cache-Control: no-store 全响应禁缓存——浏览器缓存旧 JS 曾是「改了没生效」的元凶。'),
  h2('④ 渲染层：上帝端页面'),
  p('左侧任务卡（P 号 = index+1 纯计算，永不手填）+ 底部流面板（状态 icon 唯一、聚焦指针唯一白色、未选中淡化）+ 右侧行动记录（命中率日志 feed）。确定性百分比六档上色——老板一眼看到哪些拼实了、哪些还困惑着。'),
  h2('稳定性防线：三 hook 生命周期注入'),
  b('UserPromptSubmit：每轮老板消息进来 → 注入当前流状态便签（几百 token）——agent 每轮开场自动知道在哪、该干嘛'),
  b('PostToolUse：每次工具调用后 → 心跳文件打点——agent loop 活跃的机制化证明'),
  b('Stop：收尾时对账流 mtime，超 15 分钟未更新 → block 打回强制写流——「忘记填流」机制性杜绝'),
  h2('PreToolUse：「正在执行」实时采集'),
  p('每次工具调用前捕获 tool_name + tool_input，翻译成动作描述（正在编辑 xxx / 正在执行命令…）写进 loopstate——页面把「⌨ 正在 coding…」升级为真实执行描述。agent loop 在干嘛，UI 一字不差。'),
  h2('情绪 → 做梦 → 情绪路由'),
  p('每步 note 写大白话情绪（情绪脸由页面按规则算）→ 0 点入睡收缓存 → 做梦重放归堆 → 整理进时间记事 → 形成情绪路由（潜意识层）。'),
];

// ============ Doc3 Agent如何使用计划流 ============
const doc3 = [
  h1('Agent 如何使用计划流：30 秒上手'),
  h2('① 建流（干活前）'),
  p('在 workspace/flows/ 下建 flow-YYYYMMDD-<agent>-<序号>.json，抄最小骨架：flowVersion 1.0 + task + strategyNote + steps[]。每步 module 标荣格模块，decision 三字段（chosen/why/alternatives）必填。'),
  h2('② 推进（干活中）'),
  p('每完成一个动作节点就改 step 状态：startedAt/endedAt/output/note。白三角会跟着 running 的步骤走。'),
  h2('③ 卡住（blocked）'),
  p('status 改 blocked + blockedOn 写清在等谁等什么——然后跳别的拼图继续干，链路不停。解除后改回 running。'),
  h2('④ 收尾（done）'),
  p('验收达标 → done + output 一句话产出。铁律：标 done 时必须同时确认下一步在 json 里已有意图，没有就先补写再结束——UI 永远知道下一步。'),
  h2('⑤ 每条对话即时入账'),
  p('老板每条对话产生的新事项，当场加进 plan/flow——老板要在页面上实时看见 agent 在干嘛。'),
  h2('验收器：ti-verify'),
  p('step 可声明 acceptCmd（机械验收命令）——ti-verify.mjs 跑命令：退出 0 = done，非 0 = blocked（最后一行输出变成困惑写进 blockedOn）。'),
  h2('五条铁律'),
  o('step 只能一个个执行（持续观察型标 continuous 不受此限）'),
  o('卡住 ≠ 停工'),
  o('每条对话即时入任务/流'),
  o('照 json 执行：先改状态再干活'),
  o('改完自检：语法 + 函数存在性对账（防静默死）'),
  h2('权威文档'),
  p('语雀《计划流使用方法（决策流完整版）》·《计划流·决策流格式v1.0（含module扩展）》·本库姊妹篇《计划流》《计划流的技术原理》'),
];

(async () => {
  const ok1 = true;
  // 逐文档写入（先清掉写入测试块——Doc1 的第一个子块）
  await writeDoc('MOeydZuvroU8ENxCqicclgxunfb', doc1, '计划流');
  await writeDoc('QAUEduYgdozYshxwfwecJkoknSg', doc2, '技术原理');
  await writeDoc('Ij42dRZuUo5TYjxxefFcw2hqnMf', doc3, 'Agent使用');
  console.log('三篇完成');
})();
