---
title: 飞书写入blocks生成器固化
source: https://ecnsdywqvryv.feishu.cn/wiki/space/7697792408464968715
obj_token: SXQwd1tZSobgEJxGt8AcDWW7n7d
migrated: 2026-10-20
---

# 飞书写入blocks生成器固化

飞书写入blocks生成器固化

feishu-write-docs：飞书文档写入核心
把「内容数组」翻译成飞书块结构并分批写入的固化工具——结构税一次付清，下次写飞书只产出内容文字。位置：fsj3/scripts/ 与 fsj/workspace/fsj-flow/ 双份。
生成器函数
T(s, bold)：文本运行
h1/h2/h3(s)：一二三级标题
p(s)：正文段落 · pB(s)：加粗段
b(s)：无序列表 · o(s)：有序列表
code(s)：代码块（block_type 14）
用法三步
改脚本末尾的 docX 内容数组（纯内容，无结构样板）
node feishu-write-docs.mjs——自动分批（≤40 块/批）POST
回读验证块数与首块内容
依赖与令牌
读 C:/Users/99739/.claude.json 里 feishu MCP 凭证，令牌缓存于 tmp-api/feishu-token.txt，过期自动刷新。请求体一律走文件（UTF-8），中文/emoji 零乱码。
踩坑史（四次实证，别再踩）
① 内联中文/emoji 必乱码
curl -d 内联带 emoji/中文过 Windows bash 必碎（emoji 4 字节 UTF-8 被切）——请求体必须走文件。
② updateRow 不存在
明道云改记录的端点是 editRow，不是 updateRow（后者 405）。
③ Git Bash 路径转换改坏域名
MSYS 把 /docx/... 开头的参数转成 C:/ 磁盘路径，拼出 open.feishu.cnc——API 路径参数要豁免（MSYS_NO_PATHCONV）且脚本/文件路径用 Windows 盘符形式。
④ node:fs 具名导入陷阱
并行改文件时 node:fs 被换成具名导入（import {readFileSync...}），fs.watch 里的 fs 变 undefined 被 try/catch 静默吞——watcher 从未挂载。修复：默认导入与具名导入并存。教训：改完必须跑挂载自证日志。
设计原则
结构税一次付清：内容（变）与结构（不变）分离——生成器吃下纯内容，吐出完整飞书块。写文档的成本从此趋近于纯内容本身。

