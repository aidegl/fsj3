# _archive —— 已废弃版本（2026-08-18 归档）

这里的文件**不再维护**，请勿修改，也不要再基于它们二次开发。
当前唯一主线：`build.py` → `index.html`（配合 `server/proxy.js` + `js/hap-client.js`）。

## 文件说明

| 文件 | 最后有效时间 | 作用 |
|---|---|---|
| `index0.html` | 2026-08-16 09:23 | 静态老版本，曾作为 index1 的源模板 |
| `index1.html` | 2026-08-17 19:27 | "HAP 实时版"，浏览器直连明道云 |
| `build_index1.py` | 2026-08-16 10:35 | 从 index0.html 字符串替换生成 index1.html |
| `start-index1.bat` | 2026-08-16 10:32 | 本地 8317 端口预览 index1 |

## 为什么废弃

1. **安全（致命）**：`index1.html` 把 `appKey` / `sign` 明文写死在前端 JS 里
   （原 `HAP_CFG`），浏览器 F12 即可读取，等于公开整个 HAP 应用的读写权限。
   → 新方案改为 `server/proxy.js` 代理，密钥只存服务端。
   > ⚠️ 该 appKey/sign 已随本文件公开在仓库历史中，**建议在 HAP 后台重新生成一对**。
2. **血统旧**：index1 由 8-16 的 index0 生成，之后 `build.py` 对 index.html
   的所有内容更新都没有回流。
3. **构建链不可维护**：`build_index1.py` 靠字节审计式字符串替换，源一改就得重跑，
   改动只能写在 Python 字符串里。

## 还有什么值得捞回来

`index1.html` 里真正连 HAP 的逻辑（`loadBackendTree` / `fetchChildren` /
表格版 `renderMarkdown`）是有效的，**待迁移到 `server/proxy.js` 后端**，
用来替换 proxy.js 里目前硬编码的 `DIMENSIONS`。迁移完成后本目录可整体删除。

—— 小风
