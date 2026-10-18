# 明道云HAP复杂过滤请求体指南

> 创建时间：2026-07-04
> 适用场景：使用API查询/过滤数据时的请求体构建

---

## 一、基本结构

```json
{
  "worksheetId": "表ID",
  "filters": [
    // 筛选条件数组
  ]
}
```

---

## 二、单个筛选器字段说明

| 参数 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `controlId` | 是 | string | 字段别名（如 `fabuzhe`、`kjzz`） |
| `dataType` | 是 | number | 控件类型编号（见附录） |
| `spliceType` | 是 | number | **拼接方式：1=且(AND), 2=或(OR)** |
| `filterType` | 是 | number | 筛选类型（见附录） |
| `value` | 否 | string | 单个值 |
| `values` | 否 | list[string] | 多个值 |
| `isGroup` | 否 | boolean | 是否是筛选组，true时需要传 `groupFilters` |
| `groupFilters` | 否 | list[object] | 筛选组内的条件列表 |

---

## 三、关键概念

### 3.1 格式区别：isGroup vs 非 isGroup

**不使用 isGroup（简单条件）：**
```json
{
  "filters": [
    {
      "controlId": "字段1",
      "dataType": 2,
      "spliceType": 1,
      "filterType": 2,
      "value": "值1"
    },
    {
      "controlId": "字段2",
      "dataType": 2,
      "spliceType": 2,
      "filterType": 2,
      "value": "值2"
    }
  ]
}
```

**使用 isGroup（嵌套条件）：**
```json
{
  "filters": [
    {
      "controlId": "字段1",
      "dataType": 2,
      "spliceType": 2,
      "filterType": 2,
      "value": "值1"
    },
    {
      "isGroup": true,
      "spliceType": 2,
      "groupFilters": [
        {
          "controlId": "字段2",
          "dataType": 2,
          "spliceType": 1,
          "filterType": 2,
          "value": "值2"
        },
        {
          "controlId": "字段3",
          "dataType": 2,
          "spliceType": 1,
          "filterType": 2,
          "value": "值3"
        }
      ]
    }
  ]
}
```

**规则：**
- 单条件 → 不用 isGroup
- 多个条件平级（AND/OR） → 不用 isGroup，spliceType 控制连接方式
- 需要嵌套（AND 嵌套在 OR 中） → 用 isGroup

### 3.2 spliceType - 拼接方式

| 值 | 含义 | 说明 |
|----|------|------|
| `1` | **且 (AND)** | 多个条件同时满足 |
| `2` | **或 (OR)** | 满足任一条件 |

### 3.3 filterType - 筛选类型（常用）

| 值 | 含义 | 适用类型 | 说明 |
|----|------|---------|------|
| `1` | Like (包含) | 文本(2) | 模糊匹配 |
| `2` | **Eq (等于)** | 文本/单选 | 精确匹配 |
| `5` | NContain (不包含) | 文本(2) | 文本排除 |
| `6` | Ne (不等于) | 文本/单选 | 排除某个值 |
| `7` | IsNull (为空) | 通用 | 空值判断 |
| `8` | HasValue (不为空) | 通用 | 非空判断 |
| `11` | **Between (在范围内)** | 数值(6)/日期(15,16) | 配合 minValue + maxValue |
| `12` | **NBetween (不在范围内)** | 数值(6)/日期(15,16) | 配合 minValue + maxValue |
| `13` | Gt (>) | 数值/日期 | 大于 |
| `14` | Gte (>=) | 数值/日期 | 大于等于 |
| `15` | Lt (<) | 数值/日期 | 小于 |
| `16` | Lte (<=) | 数值/日期 | 小于等于 |
| `24` | **RCEq (关联控件是)** | **关联记录(29)** | **在范围内/包含** ✅ |
| `25` | **RCNe (关联控件不是)** | **关联记录(29)** | **不在范围内/不包含** ✅ |
| `26` | ArrEq (数组等于) | 多选(10) | 数组完全相等 |
| `27` | ArrNe (数组不等于) | 多选(10) | 数组不相等 |

**⚠️ 重要区别（2026-07-04 测试验证）：**

| 字段类型 | dataType | "包含/在范围内" | "不包含/不在范围内" |
|---------|----------|----------------|-------------------|
| 文本 | 2 | filterType=1 (Like) | filterType=5 (NContain) |
| 数值/日期 | 6/15/16 | filterType=11 (Between) | filterType=12 (NBetween) |
| **关联记录** | **29** | **filterType=24 (RCEq)** | **filterType=25 (RCNe)** |

> **关键结论**：关联记录字段（如多选关联用户、关联组织）的"包含/不包含"判断，
> 用 filterType=24/25，不是 1/5 或 11/12。

**filterType 24/25 适用于单选和多选关联：**

| filterType | 说明 | 单选关联 | 多选关联 |
|------------|------|---------|---------|
| **24** (RCEq) | 关联字段**包含**指定值 | ✅ 匹配 | ✅ 只要有一个匹配就返回 |
| **25** (RCNe) | 关联字段**不包含**指定值 | ✅ 排除 | ✅ 只要包含就排除 |

**简单记忆：**
- 24 = "在列表中"（单选或多选，只要在范围内就匹配）
- 25 = "不在列表中"（单选或多选，只要在范围内就排除）

**多值传参：** 24/25 传多个 rowid 时用 `values: ["rowid1","rowid2",...]` 数组（OR 语义，命中任一即可），不要用 N 个 `value` 条件 OR 展开。详见 3.6 节。

### 3.4 dataType - 控件类型（常用）

| 值 | 控件类型 |
|----|---------|
| `2` | 文本（单行、多行） |
| `6` | 数值 |
| `9` | 单选（平铺） |
| `10` | 多选 |
| `11` | 单选（下拉） |
| `26` | 成员 |
| `29` | **关联记录** |
| `34` | 子表 |
| `36` | 检查框 |

### 3.5 特殊值

| 值 | 说明 |
|----|------|
| `user-self` | 当前用户 |
| `user-sub` | 下属 |
| `user-workflow` | 工作流 |
| `user-api` | API |

### 3.6 value vs values（单值 vs 多值）

| 字段 | 类型 | 语义 | 何时使用 |
|------|------|------|---------|
| `value` | string | **单值**匹配 | 只匹配一个目标 |
| `values` | list[string] | **多值**匹配（OR，命中任一即可） | 匹配多个目标中的任意一个 |

**规则：**
- 单值用 `value`，多值用 `values`，**二选一**（同一条件里不要同时传）
- `values` 的语义是"**是其中一个**"（OR），不是"同时包含"
- 同一个关联字段匹配多个 rowid，**用 `values` 一条搞定**，不要铺 N 个 `value` 条件做 OR 展开

**关联记录多值的正确写法（官方确认 + 实测验证 2026-07-04）：**

```json
{
  "controlId": "kjzz",
  "dataType": 29,
  "filterType": 24,
  "values": ["rowid1", "rowid2", "rowid3"]
}
```

含义：kjzz 关联了 rowid1 / rowid2 / rowid3 中的**任一个**。

> **官方依据**：明道云论坛张春泉（Team）回复 —— "关联控件如果传递多个值，不需要传 value 了，传 `values:["rowid1","rowid2",...]`"
> 参考：https://bbs.mingdao.net/topic/434 、 https://help.mingdao.com/worksheet/field-filter/

**⚠️ 踩坑提醒（2026-07-04）：**
- 关联记录多值用 **`filterType=24 (RCEq) + values`**
- **不要用 `filterType=11 (Between) + values`** —— 11 是数值/日期的"在范围内"，不是关联记录多值匹配
- 早期 ceshi5 草稿用过 `11 + values` 的错误组合，实测后已纠正为 `24 + values`

---

## 四、常见场景示例

### 4.1 简单等于查询

```json
{
  "worksheetId": "6a03ceaa7e29abcb297cbdfc",
  "filters": [
    {
      "controlId": "quanxian",
      "dataType": 9,
      "spliceType": 1,
      "filterType": 2,
      "value": "公开"
    }
  ]
}
```

### 4.2 AND 条件（且）

查询：权限=组织可见 **且** kjzz关联某组织

```json
{
  "worksheetId": "6a03ceaa7e29abcb297cbdfc",
  "filters": [
    {
      "controlId": "quanxian",
      "dataType": 9,
      "spliceType": 1,
      "filterType": 2,
      "value": "组织可见"
    },
    {
      "controlId": "kjzz",
      "dataType": 29,
      "spliceType": 1,
      "filterType": 24,
      "value": "组织rowid"
    }
  ]
}
```

### 4.3 OR 条件（或）

查询：kjzz关联org1 **或** kjzz关联org2 **或** kjzz关联org3

```json
{
  "worksheetId": "6a03ceaa7e29abcb297cbdfc",
  "filters": [
    {
      "controlId": "kjzz",
      "dataType": 29,
      "spliceType": 2,
      "filterType": 24,
      "value": "org1的rowid"
    },
    {
      "controlId": "kjzz",
      "dataType": 29,
      "spliceType": 2,
      "filterType": 24,
      "value": "org2的rowid"
    },
    {
      "controlId": "kjzz",
      "dataType": 29,
      "spliceType": 2,
      "filterType": 24,
      "value": "org3的rowid"
    }
  ]
}
```

> 注意：单个条件不需要 `isGroup`，直接在 filters 数组中即可

> 💡 **更优写法**：同一个关联字段匹配多个值（如上 kjzz 匹配 org1/org2/org3），
> 用 `filterType=24 + values` 一条条件即可，不用 OR 展开。详见 3.6 节。

### 4.4 数值/日期范围查询 (filterType 11/12)

**filterType=11 (Between) - 在范围内：**

```json
{
  "worksheetId": "shangpin",
  "filters": [
    {
      "controlId": "autoid",
      "dataType": 6,
      "spliceType": 1,
      "filterType": 11,
      "minValue": "0",
      "maxValue": "100"
    }
  ]
}
```

**filterType=12 (NBetween) - 不在范围内：**

```json
{
  "worksheetId": "shangpin",
  "filters": [
    {
      "controlId": "autoid",
      "dataType": 6,
      "spliceType": 1,
      "filterType": 12,
      "minValue": "0",
      "maxValue": "0"
    }
  ]
}
```

**⚠️ 测试验证（2026-07-04）：**
- 11/12 只适用于数值(dataType=6)和日期(dataType=15/16)
- 必须传 minValue 和 maxValue（字符串类型）
- 不适用于关联记录字段！

### 4.5 关联记录字段过滤 (filterType 24/25)

**场景：排除"不可见用户"字段中的某个用户**

```json
{
  "worksheetId": "shangpin",
  "filters": [
    {
      "controlId": "bkjyh",
      "dataType": 29,
      "spliceType": 1,
      "filterType": 25,
      "value": "用户rowid"
    }
  ]
}
```

**⚠️ 测试验证（2026-07-04）：**
- 关联记录字段必须用 dataType=29
- "包含"用 filterType=24 (RCEq)
- "不包含"用 filterType=25 (RCNe)
- 不要用 filterType=5 (NContain)，那是给文本用的！

### 4.6 复杂组合条件（非组 + 组）

查询：bkjyh不包含用户 **AND** (kjzz1 OR kjzz2 OR kjzz3 匹配用户组织)

```json
{
  "worksheetId": "shangpin",
  "filters": [
    {
      "controlId": "bkjyh",
      "dataType": 29,
      "spliceType": 1,
      "filterType": 25,
      "value": "用户rowid"
    },
    {
      "isGroup": true,
      "spliceType": 1,
      "groupFilters": [
        {
          "controlId": "kjzz1",
          "dataType": 29,
          "spliceType": 2,
          "filterType": 24,
          "value": "org1的rowid"
        },
        {
          "controlId": "kjzz2",
          "dataType": 29,
          "spliceType": 2,
          "filterType": 24,
          "value": "org2的rowid"
        },
        {
          "controlId": "kjzz3",
          "dataType": 29,
          "spliceType": 2,
          "filterType": 24,
          "value": "org3的rowid"
        }
      ]
    }
  ]
}
```

**结构说明：**
- 非组条件：bkjyh 不包含用户（dataType=29, filterType=25 RCNe）
- 组条件：kjzz1-20 任一匹配用户组织（isGroup + OR, filterType=24 RCEq）
- 两者关系：AND（spliceType=1）

**⚠️ 测试验证（2026-07-04）：**
- 关联记录字段排除用 filterType=25 (RCNe)，不是 filterType=5 (NContain)
- 关联记录字段匹配用 filterType=24 (RCEq)

---

## 五、注意事项

1. **controlId 填字段别名**，不是字段rowid
2. **spliceType 是条件连接符**：1=且，2=或
3. **isGroup 用于复杂组合**：当需要 (A AND B) OR (C AND D) 时使用
4. **关联记录字段**：dataType=29，filterType=24(RCEq)
5. **特殊用户ID**：`user-self` 表示当前用户

---

## 六、完整附录

### FilterTypeEnum 完整列表

| 值 | 枚举字符 | 说明 | 适用类型 |
|----|---------|------|---------|
| 1 | Like | 包含 | 文本 |
| 2 | Eq | 等于 | 文本/单选 |
| 3 | Start | 开头为 | 文本 |
| 4 | End | 结尾为 | 文本 |
| 5 | NContain | 不包含 | 文本 |
| 6 | Ne | 不等于 | 文本/单选 |
| 7 | IsNull | 为空 | 通用 |
| 8 | HasValue | 不为空 | 通用 |
| **11** | **Between** | **在范围内** | **数值/日期** ✅ |
| **12** | **NBetween** | **不在范围内** | **数值/日期** ✅ |
| 13 | Gt | > | 数值/日期 |
| 14 | Gte | >= | 数值/日期 |
| 15 | Lt | < | 数值/日期 |
| 16 | Lte | <= | 数值/日期 |
| **24** | **RCEq** | **关联控件是（包含）** | **关联记录** ✅ |
| **25** | **RCNe** | **关联控件不是（不包含）** | **关联记录** ✅ |
| 26 | ArrEq | 数组等于 | 多选 |
| 27 | ArrNe | 数组不等于 | 多选 |

### DataTypeEnum 完整列表

| 值 | 控件类型 |
|----|---------|
| 2 | 文本（单行、多行） |
| 3 | 电话（手机） |
| 4 | 电话（座机） |
| 5 | 邮箱 |
| 6 | 数值 |
| 7 | 证件 |
| 8 | 金额 |
| 9 | 单选（平铺） |
| 10 | 多选 |
| 11 | 单选（下拉） |
| 14 | 附件 |
| 15 | 日期（年月日） |
| 16 | 日期（年月日时分） |
| 26 | 成员 |
| 27 | 部门 |
| 29 | 关联记录 |
| 30 | 他表字段 |
| 34 | 子表 |
| 36 | 检查框 |
| 41 | 富文本 |

---

*文档版本：v2.1*
*更新时间：2026-07-04*
*更新内容：*
- *v2.0：添加 filterType 11/12/24/25 测试验证*
- *v2.1：新增 3.6 value vs values 小节；关联记录多值匹配正解为 `filterType=24 + values`（官方确认 + 实测），纠正 ceshi5 早期 `11 + values` 的错误写法*
