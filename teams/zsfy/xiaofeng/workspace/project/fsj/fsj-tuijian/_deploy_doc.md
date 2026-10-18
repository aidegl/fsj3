 ｜id | name | alias | type | value | 
 | --- | --- | --- | --- | --- | 
| 6a03ceaa7e29abcb297cbdfd | 名称 | mingcheng | 文本框 | web-deploy 部署服务使用文档 |
| 6a03ceaa7e29abcb297cbdff | 附件（主图、资源） | zhutu | 附件 |  |
| 6a045ceb0507e352629dd194 | 自动编号 | zdbh | 自动编号 | SP00005825 |
| 6a045ceb0507e352629dd195 | 商家 | shangjia2 | 关联记录 | [{"sid":"f009cda3-cc49-400d-82cd-cbe79ee8892f","name":"孚世界"}] |
| 6a045e6bf255b2b5149185dc | markdown内容 | mdnr | 文本框 |  |
| 6a045ea70507e352629dd2c6 | 关键词 | guanjianci | 关联记录 | [{"sid":"2e5e6f16-71d4-4ed2-bffa-e1c79674a003","name":"部署"},{"sid":"f5ca3df5-07f1-4774-b76b-2145cd660b3a","name":"deployment"},{"sid":"850e3863-a43e-44a2-9c34-9db94cb74b1f","name":"web_deploy"},{"sid":"f08995c4-1f70-4e53-84b5-a5b14633954f","name":"部署服务"},{"sid":"2932ac5c-6162-4115-8c66-1386b257cf74","name":"deployment_service"},{"sid":"431193cd-7b6e-4d2a-a726-653c6e7d866a","name":"api文档"},{"sid":"d3f3dfe7-1636-4c1b-b8f6-454b66432d78","name":"api_document"}] |
| 6a051c8c16650ca2751511ad | 成本价 | chengbenjia | 金额 |  |
| 6a051ca7bf6da4a67909a052 | 售价 | shoujia | 金额 |  |
| 6a051f86d82d8455e4216d75 | 特价 | tejia | 金额 |  |
| 6a051fb0e05d33615bf3df3b | 上架 | shangjia1 | 检查框 | 1 |
| 6a051fd0f255b2b51491a981 | 权重 | quanzhong | 数值 | 40 |
| 6a0521f9104f63109c08d466 | 商品分类 | spfl | 关联记录 | [] |
| 6a0cf595551ed6395b6c0459 | 积分 | jifen | 数值 |  |
| 6a0cf5be833ba98f954f93b6 | 类型 | leixing | 下拉 | [{"key":"55c1d467-927b-4af8-98a9-d934554ac3bf","value":"知识"}] |
| 6a110416715fa7cdb269ff93 | 参与人数限制 | ptxz | 数值 |  |
| 6a11522486012aa0b85de2dc | 拼团截止日期 | ptrq | 日期和时间 |  |
| 6a11531da47867dee8cda8cb | 参与活动用户 | ptyh | 关联记录 | [] |
| 6a223553a225020849c93059 | 文字内容 | wznr | 文本框 | # web-deploy 部署服务使用文档

## 一句话

把改好的文件 POST 到这个接口，线上立即更新；部署失败或出问题可秒级回滚。

---

## 接口信息

| 项 | 值 |
|----|----|
| 地址 | `POST https://100000whys.cn/deploy/deploy` |
| 鉴权 | 请求头 `x-deploy-token: <TOKEN>`（token 向维护者索取） |
| 请求体 | `application/json`，UTF-8 |
| 单次上限 | 50MB |
| 回滚 | `POST https://100000whys.cn/deploy/rollback` |
| 版本列表 | `GET https://100000whys.cn/deploy/list`（同样需要 token） |
| 健康检查 | `GET https://100000whys.cn/deploy/health`（无需 token） |

---

## 可部署的项目（project 取值）

| project | 线上地址 | 说明 |
|---------|---------|------|
| `hezi` | https://100000whys.cn/hezi.html | 盒子页，部署后自动 pm2 reload |
| `index` | https://100000whys.cn/shuxiaohe-webview/ | shuxiaohe 主页，自动 reload |
| `shenhe` | https://100000whys.cn/shenhe/ | 审核页，自动 reload |
| `webview2` | https://100000whys.cn/fsj_webview2.0/ | 孚世界 WebView SPA 2.0，静态 |
| `playground` | https://100000whys.cn/playground/ | 测试专用，随便传，别放正式东西 |

> 只能传上表中的 project，其他值返回 400 并列出可用项目。
> 首次接入建议先在 `playground` 上试通流程。

---

## 请求体结构

```json
{
  "project": "hezi",
  "clean": false,
  "files": [
    { "path": "index.html", "content": "<html>…</html>" },
    { "path": "js/app.js", "content": "console.log(1)" },
    { "path": "img/logo.png", "content": "iVBORw0KGgo…", "encoding": "base64" }
  ]
}
```

### 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `project` | ✅ | 上表中的项目名 |
| `files` | ✅ | 文件数组，至少 1 个 |
| `files[].path` | ✅ | 相对路径，**不能**以 `/` 开头、不能含 `..`、不能动 `.git` |
| `files[].content` | ✅ | 文件内容字符串；二进制用 base64 |
| `files[].encoding` | — | 缺省 `utf8`；二进制传 `"base64"` |
| `clean` | — | `true` = 本次上传即完整项目（新目录只含这些文件）；缺省 `false` = 在当前版本基础上覆盖/新增这些文件 |

> ⚠️ 日常改几个文件就用默认 `clean:false`（增量），只有明确要"整体替换、删掉旧文件"时才用 `clean:true`。
> ⚠️ `.js` / `.html` / `.json` 不允许传空文件（会 400）。

---

## 响应

成功（HTTP 200）：

```json
{
  "ok": true,
  "project": "hezi",
  "release": "20260907061732-ppve",
  "files": 2,
  "prev": "20260907061720-42rd",
  "rollbackTo": "20260907061720-42rd",
  "live": "/opt/deploy/hezi",
  "pm2": { "ok": true, "detail": "fsj-hezi reloaded" },
  "hint": "回滚: POST /rollback {\"project\":\"hezi\"}"
}
```

失败（400/401/500）：

```json
{ "ok": false, "error": "unauthorized" }
```

| HTTP | 含义 |
|------|------|
| 400 | project 不在白名单 / files 缺失 / 路径越界 / 空文件 |
| 401 | token 错误或缺失 |
| 500 | 服务端写失败（此时自动清理半成品，线上不受影响） |

> **重要**：部署是原子切换 — 要么整体成功，要么线上保持原样，不存在传一半生效的情况。收到 `"ok": true` 才算部署成功。

---

## 完整调用示例

### curl

```bash
TOKEN='<你的token>'

# 1. 日常增量更新（改了 index.html 和一个 js）
curl -s -X POST https://100000whys.cn/deploy/deploy \
  -H "x-deploy-token: $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "project": "hezi",
    "files": [
      { "path": "index.html", "content": "<!DOCTYPE html><html>…</html>" },
      { "path": "js/app.js",  "content": "console.log(1)" }
    ]
  }'

# 2. 传二进制（图片）— content 用 base64
B64=$(base64 -w0 ./logo.png)
curl -s -X POST https://100000whys.cn/deploy/deploy \
  -H "x-deploy-token: $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"project\":\"hezi\",\"files\":[{\"path\":\"img/logo.png\",\"content\":\"$B64\",\"encoding\":\"base64\"}]}"

# 3. 查看线上当前版本和全部版本
curl -s https://100000whys.cn/deploy/list -H "x-deploy-token: $TOKEN"

# 4. 回滚到上一版
curl -s -X POST https://100000whys.cn/deploy/rollback \
  -H "x-deploy-token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"project":"hezi"}'

# 5. 回滚到指定版本（先用 list 查 release 名）
curl -s -X POST https://100000whys.cn/deploy/rollback \
  -H "x-deploy-token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"project":"hezi","to":"20260907-baseline"}'
```

### JavaScript（浏览器 / Node 通用）

```javascript
const TOKEN = '<你的token>';

async function deploy(project, files) {
  const res = await fetch('https://100000whys.cn/deploy/deploy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-deploy-token': TOKEN },
    body: JSON.stringify({ project, files })
  });
  const data = await res.json();
  if (!data.ok) throw new Error('部署失败: ' + data.error);
  console.log('部署成功', data.release, '回滚点:', data.rollbackTo);
  return data;
}

// 用法
deploy('shenhe', [
  { path: 'index.html', content: '<!DOCTYPE html>…' }
]);

// 二进制文件（浏览器）
async function deployFile(project, filePath, blob) {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())));
  return deploy(project, [{ path: filePath, content: b64, encoding: 'base64' }]);
}
```

### Python

```python
import requests

TOKEN = '<你的token>'

def deploy(project, files):
    r = requests.post('https://100000whys.cn/deploy/deploy',
        headers={'x-deploy-token': TOKEN},
        json={'project': project, 'files': files}, timeout=60)
    data = r.json()
    if not data.get('ok'):
        raise RuntimeError(f"部署失败: {data.get('error')}")
    return data

deploy('webview2', [{'path': 'css/main.css', 'content': open('main.css', encoding='utf-8').read()}])
```

---

## 推荐工作流（前端 agent 照此执行）

1. **改代码** → 本地确认改动的文件清单
2. **先打 playground**（首次接入或拿不准时）：往 `playground` 部署一版，浏览器打开 `https://100000whys.cn/playground/` 目检
3. **部署正式项目**：把改动文件按 `files` 数组发出去（增量，别乱用 `clean:true`）
4. **验证**：curl 对应线上 URL，确认新内容生效 + 页面功能正常
5. **出问题** → 立即 `rollback`（秒级生效），排查后重新部署

> 部署后如果 `pm2` 字段是 `{"ok":false,…}`，说明进程 reload 失败，请立刻回滚并报告维护者。

---

## 版本与回滚机制（为什么安全）

- 每次部署生成全新版本目录（如 `20260907061732-ppve`），与线上运行中的旧版本物理隔离 — **不存在新旧文件混合污染**
- 部署 = 原子软链切换，毫秒级，请求中途失败线上也是完好的旧版本
- 每个项目保留最近 **10** 个版本，更早的自动清理
- 回滚也是软链切换，秒级生效

---

## 常见错误排查

| 现象 | 原因 / 处理 |
|------|------------|
| 401 unauthorized | token 错。确认 header 是 `x-deploy-token`，值前后无空格/换行 |
| 400 unknown project | project 名拼写错误，看响应里的 `known` 列表 |
| 400 bad path | path 以 `/` 开头或含 `..`，改成相对路径 |
| 400 empty file not allowed | 传了空的 js/html/json，检查内容 |
| 413 / body too large | 超 50MB，拆分或压缩资源 |
| 部署 ok 但页面没变 | 浏览器缓存，强刷（Ctrl+Shift+R）；webview2 的 index.html 有禁缓存头，其余静态资源可能需要带版本参数 |
| 部署 ok 但功能异常 | 先回滚，再对照 diff 排查 |

---

## 安全约定

- token 请勿写入任何公开仓库 / 提交记录 / 客户端代码，放配置或环境变量
- 部署记录全量留档（服务器侧 `logs/deploy.log`）
- token 可随时轮换（旧 token 立即失效），维护者操作
- 不要把 `playground` 用于任何正式用途
 |
| 6a2625be3a3063763d65ee8b | url | url | 文本框 |  |
| 6a265b9c611b4ca5b182d855 | 子(所有) | zisuoyou | 关联记录 | [] |
| 6a265b9c611b4ca5b182d854 | 父（源） | fuyuan | 关联记录 | [] |
| 6a266179f24b2a6e0a66e1a5 | 发布者 | fabuzhe | 关联记录 | [{"sid":"a8515e76-7b02-4baf-bedd-3ff011b1a9e5","name":"小风"}] |
| 6a2a2ecc837e93d36d79a621 | 删除 | shanchu | 检查框 | 0 |
| 6a2a8e2e726568523d5113c8 | 点赞 | dianzan | 数值 |  |
| 6a2a8e38726568523d5113e4 | 评论 | pinglun | 数值 |  |
| 6a2a8e48f06514e874788d3f | 阅读 | yuedu | 数值 |  |
| 6a2b6c9582404e089941b4bc | 用户头像 | fbztx | 他表字段 | [{"file_id":"bcc758cc-c846-4327-bd40-2f2ee7a6a879","thumbnail_path":"https://p1.mingdaoyun.cn/6a2818ed-3c2b-4263-b804-397d3d00e3d7/203def35-81c1-4930-9ea4-9ded2d92e489/69b0077358322d512e60bad0/20260413/","thumbnail_name":"fs0t1Nb404bFaO6g3a5O1ccB5U2o1T2pbO5vfVcC2R9u1EeF3E6m0v2oev2p3D7r.png?imageView2/1/w/200/h/118","large_thumbnail_path":"https://p1.mingdaoyun.cn/6a2818ed-3c2b-4263-b804-397d3d00e3d7/203def35-81c1-4930-9ea4-9ded2d92e489/69b0077358322d512e60bad0/20260413/","large_thumbnail_name":"fs0t1Nb404bFaO6g3a5O1ccB5U2o1T2pbO5vfVcC2R9u1EeF3E6m0v2oev2p3D7r.png?imageView2/2/w/1280/h/800","file_path":"https://p1.mingdaoyun.cn/6a2818ed-3c2b-4263-b804-397d3d00e3d7/203def35-81c1-4930-9ea4-9ded2d92e489/69b0077358322d512e60bad0/20260413/","file_name":"fs0t1Nb404bFaO6g3a5O1ccB5U2o1T2pbO5vfVcC2R9u1EeF3E6m0v2oev2p3D7r.png","file_size":474537,"is_delete":false,"file_type":1,"original_file_name":"微信图片_20260413163909_130_56.png","allow_down":true,"large_thumbnail_full_path":"https://p1.mingdaoyun.cn/6a2818ed-3c2b-4263-b804-397d3d00e3d7/203def35-81c1-4930-9ea4-9ded2d92e489/69b0077358322d512e60bad0/20260413/fs0t1Nb404bFaO6g3a5O1ccB5U2o1T2pbO5vfVcC2R9u1EeF3E6m0v2oev2p3D7r.png?imageView2/2/w/1280/h/800","thumbnail_full_path":"https://p1.mingdaoyun.cn/6a2818ed-3c2b-4263-b804-397d3d00e3d7/203def35-81c1-4930-9ea4-9ded2d92e489/69b0077358322d512e60bad0/20260413/fs0t1Nb404bFaO6g3a5O1ccB5U2o1T2pbO5vfVcC2R9u1EeF3E6m0v2oev2p3D7r.png?imageView2/1/w/200/h/118","original_file_full_path":"https://p1.mingdaoyun.cn/6a2818ed-3c2b-4263-b804-397d3d00e3d7/203def35-81c1-4930-9ea4-9ded2d92e489/69b0077358322d512e60bad0/20260413/fs0t1Nb404bFaO6g3a5O1ccB5U2o1T2pbO5vfVcC2R9u1EeF3E6m0v2oev2p3D7r.png","origin_link_url":null,"short_link_url":null,"share_folder_url":null,"is_knowledge":false,"node_id":"","allow_view":true,"width":0,"height":0,"duration":0.0,"allow_edit":false,"DownloadUrl":"https://p1.mingdaoyun.cn/6a2818ed-3c2b-4263-b804-397d3d00e3d7/203def35-81c1-4930-9ea4-9ded2d92e489/69b0077358322d512e60bad0/20260413/fs0t1Nb404bFaO6g3a5O1ccB5U2o1T2pbO5vfVcC2R9u1EeF3E6m0v2oev2p3D7r.png","WaterMarkInfo":null,"preview_url":"https://p1.mingdaoyun.cn/6a2818ed-3c2b-4263-b804-397d3d00e3d7/203def35-81c1-4930-9ea4-9ded2d92e489/69b0077358322d512e60bad0/20260413/fs0t1Nb404bFaO6g3a5O1ccB5U2o1T2pbO5vfVcC2R9u1EeF3E6m0v2oev2p3D7r.png?e=1789809672&token=mN_sp-Y4_5zePppXZC8fTktRmKMNiYlC8jl_yeGZ:uBWqviJLMQspOr1ndP_Wv7Z6xsk=","createTime":"2026-04-13 16:39:26"}] |
| 6a2cf57dd8209d13b1c12edd | @用户 | atyonghu | 关联记录 | [] |
| 6a2cf728d8209d13b1c13001 | 回复用户 | hfyh | 关联记录 | [] |
| 6a2cf9d5f06514e8747a64f0 | 父（评论\上一级） | fu | 关联记录 | [{"sid":"7d6189a4-f4a6-4732-bd07-6f16dccec152","name":"全局技能-慕容风"}] |
| 6a2cf9d5f06514e8747a64f1 | 子 | zi | 关联记录 | [] |
| 6a30f92a837e93d36d7de18c | 多人 | duoren | 检查框 | 0 |
| 6a3649ba9513239477b89c6c | 记录表 | jilubiao | 关联记录 | 0 |
| 6a364c60670f8f74c020b64a | 点赞数 | dianzanshu | 汇总 | 0 |
| 6a364e0a707d823408f91096 | 点赞因子 | dzyz | 数值 |  |
| 6a364f0ade3be93c8b02f824 | 综合权重 | dianzanzhi | 公式 |  |
| 6a365ee1de3be93c8b02fe4a | 评论数 | pinglunshu | 汇总 | 0 |
| 6a365f05670f8f74c020bec5 | 收藏数 | shoucangshu | 汇总 | 0 |
| 6a365f43670f8f74c020befe | 评论数因子 | plsyz | 数值 |  |
| 6a365f53670f8f74c020bf11 | 收藏数因子 | scsyz | 数值 |  |
| 6a365ff4485ff918dd37dedb | 主页访问 | zyfw | 汇总 | 0 |
| 6a366201485ff918dd37e19f | 主页因子 | zyyz | 数值 |  |
| 6a3663a0d8209d13b1c8ad53 | 近期值 | jinqizhi | 公式 |  |
| 6a369543012f3a4e6a11c96f | 发布时间 | fbsj | 日期和时间 |  |
| 6a376a7b9513239477b93e31 | 12维 | sew | 下拉 | [{"key":"8b61e3e5-438e-4114-8651-4a2199099f4b","value":"1技能"}] |
| 6a4727924e5ebdeabe82ebcf | 被引用 | beiyinyong | 关联记录 | [] |
| 6a4727924e5ebdeabe82ebce | 引用内容 | yynr | 关联记录 | [] |
| 6a4831261a3a7956bfa052fe | 权限 |  | 分段 |  |
| 6a48318e1a3a7956bfa0530e | 可见组织 | kjzz | 关联记录 | [] |
| 6a484af5df108e8ad188be37 | 权限 | quanxian | 多选 | [] |
| 6a48509624154e872fa6d660 | 不可见用户 | bkjyh | 关联记录 | [] |
| 6a51da58bb6d417ebf9fe9aa | 审核 | shenhe | 下拉 | [] |
| 6a51dad02e18bfbfe2226fd9 | 审核内容 | shnr | 文本框 |  |
| 6a7c612eda5b019e50174116 | 积分汇总 | jfhz | 汇总 | 0 |
| 6a83599c1e7476f66a2e7bce | 实际完成日期 | sjwcrq | 日期和时间 |  |
| 6a9378590458d96d03d3275b | 像素图标 | xstb | 文本框 |  |
| 6a97b230321e12f4b0bd4c08 | 其他 |  | 分段 |  |
| 6a97b230321e12f4b0bd4c06 | 引用数据 |  | 分段 |  |
| 6a97b230321e12f4b0bd4c07 | 逻辑数据 |  | 分段 |  |
| 6a989704df6a1f4284e65f0b | 完成 | wancheng | 检查框 | 0 |
| 6a9b71a2a73c45e0a19abe0b | 描述 | miaoshu | 文本框 | > 面向对象：前端 agent / 开发者
> 服务版本：2026-09-07 v1.0
> 维护者：OpenClaw（服务器侧）
> |
| 6aa43ec28b72ef9f2868c0e3 | 记录表 |  | 关联记录 | 0 |
| 6aa4cc46570ef9a50eef4667 | 完全引用 | wqyy | 关联记录 | [] |
| 6aa4cc46570ef9a50eef4668 | 被完全引用 | bwqyy | 关联记录 | [] |
| 6aa4ccf6ed24522e86ed0237 | 完全引用 |  | 分段 |  |
| 6aa4cd3a5c076794825cc656 | 完全引用文字内容 | wqyywznr | 他表字段 |  |
| 6aa4cd3a5c076794825cc655 | 完全引用名称 | wqyymc | 他表字段 |  |
| 6aa4ce574a300a9aee481b9f | 被完全引用次数 | bwqyycs | 汇总 | 0 |
| 6aaa3086786452fc2187a572 | 层级类型 | cengjileixing | 下拉 |  |
| rowid | 记录ID | rowId | 文本框 | 3b380799-cd64-4ad0-8ad5-77153ef3254b |
| ownerid | 拥有者 | _owner | 成员 | [{"AccountId":"user-undefined","FullName":"未指定"}] |
| caid | 创建人 | _createdBy | 成员 | [{"AccountId":"user-api","FullName":"API"}] |
| ctime | 创建时间 | _createdAt | 日期和时间 | 2026-09-07 18:39:56 |
| utime | 最近修改时间 | _updatedAt | 日期和时间 | 2026-09-12 10:48:45 |
| uaid | 最近修改人 | _updatedBy | 成员 | [{"AccountId":"user-api","FullName":"API"}] |

