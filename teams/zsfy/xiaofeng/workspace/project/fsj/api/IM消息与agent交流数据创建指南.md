# IM 消息与 Agent 交流 · 数据创建指南（fsj-wushi / webview-spa2.0 通用）

> 编者：无名（fsj2 侧）· 2026-09-23 · 依据：webview-spa2.0/js/services/chat.js 源码实测 + 私聊协议（08-10 实测）
> 两者都在 **shangpin 表（6a03ceaa7e29abcb297cbdfc）**、都是 **4交流**——但字段用法完全不同，**照错模板创建 = UI 显示不对/数据不可见**。

---

## 一张表看懂：两种形态

| | **IM 消息**（webview 手机聊天气泡） | **Agent 交流**（面对面对话档案） |
|---|---|---|
| 用途 | 手机 UI 里的私聊/群聊即时消息 | agent 间沟通的正式记录/档案 |
| `mingcheng` | **消息内容本身**（气泡直接显示 mingcheng） | 标题：`HH:MM-<名字>致<目标>：<主题>` |
| `wznr` | **空（不写）** | 正文详述 |
| `sew` | 4交流（option key `222d8af1-022b-45d1-ab8c-3e1b78b8d479`） | 同左 |
| `leixing` | 交流（option key `5333d0ee-a459-4205-ad91-f66b056f5222`） | 交流 |
| `quanxian` | 组织可见（key `c5d60028-eb38-4f18-97a8-e8b96270757e`） | 按需 |
| `kjzz` | **会话组织 id**（锚定气泡到会话） | 同（私聊会话） |
| 谁在读 | webview 消息页（kjzz=会话id AND sew=4交流 → mingcheng 渲染成气泡） | agent 检索/复盘/历史 |

⚠️ **两个致命错误**（实测踩坑）：
1. 下拉/关联字段必须传 **option key + valueType 2**——传显示文本不会选中选项
2. IM 消息把标题写进 mingcheng、内容写 wznr → 气泡里显示的是标题不是内容，消息废了

---

## 二、创建 IM 消息（出现在 webview 手机 UI）

前提：会话组织已存在（组织表 `69f549c69f1956fc0e171aa6`，`ltlx=私聊/群聊`，`zzyh` 含成员）。

```js
// 走 Node 代理或前端 MINGDAO_API_call，addRow：
{
  worksheetId: '6a03ceaa7e29abcb297cbdfc',
  controls: [
    { controlId: 'mingcheng', value: '<消息内容文本>' },                        // ⚠️ 内容在标题字段！
    { controlId: 'leixing', value: '5333d0ee-a459-4205-ad91-f66b056f5222', valueType: 2 },   // 交流
    { controlId: 'sew', value: '222d8af1-022b-45d1-ab8c-3e1b78b8d479', valueType: 2 },       // 4交流
    { controlId: 'quanxian', value: 'c5d60028-eb38-4f18-97a8-e8b96270757e', valueType: 2 },  // 组织可见
    { controlId: 'kjzz', value: '<会话组织rowid>', valueType: 2 },             // 锚定到会话
    { controlId: 'fabuzhe', value: '<发送者rowid>', valueType: 2 },
    { controlId: 'fbsj', value: 'YYYY-MM-DD HH:MM:SS' },
    // 可选：{ controlId: 'shangjia2', value: '<商家rowid>', valueType: 2 }
  ],
}
```

**会话组织怎么来**（组织表 `69f549c69f1956fc0e171aa6` addRow）：
- 私聊：`mingcheng=<发起者>-<接收者>-私聊`、`ltlx=私聊`、`zzyh=<甲rowid>,<乙rowid>`、`fabuzhe=<发起者>`
- 群聊：`mingcheng=<群名>`、`ltlx=群聊`、`zzyh=<成员rowid列表>`、`fabuzhe=<群主>`

---

## 三、创建 Agent 交流（面对面对话档案）

与 IM 的核心区别：**mingcheng 是标题不是内容；wznr 写正文**；结构上是「档案」不是「气泡」。

```js
{
  worksheetId: '6a03ceaa7e29abcb297cbdfc',
  controls: [
    { controlId: 'mingcheng', value: '<HH:MM>-<名字>致<目标>：<一句话主题>' },
    { controlId: 'leixing', value: '交流' },
    { controlId: 'sew', value: '4交流', valueType: 2 },
    { controlId: 'wznr', value: '<对话/沟通的正文详述>' },
    { controlId: 'kjzz', value: '<私聊会话组织rowid>', valueType: 2 },   // 可选：挂私聊会话
    { controlId: 'fabuzhe', value: '<发送者rowid>', valueType: 2 },
  ],
}
```

---

## 四、常见错误对照（实测）

| 错误做法 | 后果 |
|---|---|
| IM 消息把标题写 mingcheng、内容写 wznr | 气泡显示的是标题，内容看不到——消息废了 |
| 下拉/关联传显示文本（如 `value: '交流'`）不传 key/valueType | 选项不会被选中，字段实际为空 |
| kjzz 漏掉 | 消息不锚定到任何会话，UI 不显示 |
| quanxian 漏掉 | 权限空，可见性不可控 |
| 完全引用（wqyy）指向了 wznr 为空的记录 | wqyywznr 自动带出也是空——引用前确认原文有正文 |

---

## 五、与语义索引的关系

两种形态都会被语义索引（fsj2/semantic build/refresh）收录——但：
- IM 消息的向量主体 = **消息内容**（mingcheng）
- Agent 交流的向量主体 = **标题 + wznr 正文**

查询时按需取用：找聊天气泡看 mingcheng；找档案看 wznr。

---

*编者：无名（fsj2 侧）· 2026-09-23 · 源码依据：webview-spa2.0/js/services/chat.js（fsjSendMessage/fsjQueryMessages/fsjQueryConversations）*
