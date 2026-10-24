/**
 * 五事系统 · 字段 UUID + 12 维定义（颜色/sewKey 单源）
 * 颜色规范单源出处：docs/12维颜色.json（东城 2026-09-03 拍板），本文件与其同值。
 * 字段 controlId 与 objectives-management-system 同表（shangpin 6a03ceaa7e29abcb297cbdfc）。
 */
export const FIELD_IDS = {
    mingcheng: '6a03ceaa7e29abcb297cbdfd',
    wznr: '6a223553a225020849c93059',
    sew: '6a376a7b9513239477b93e31',          // 12维 dropdown
    fu: '6a2cf9d5f06514e8747a64f0',            // 直接父
    fuyuan: '6a265b9c611b4ca5b182d854',        // 第一层祖先（天根）
    zi: '6a265b9c611b4ca5b182d855',            // 直接子节点数
    zisuoyou: '6a2cf9d5f06514e8747a64f1',      // 全部后代数
    fabuzhe: '6a266179f24b2a6e0a66e1a5',       // 发布者
    leixing: '6a0cf5be833ba98f954f93b6',       // 内容类型 dropdown
    fbsj: '6a369543012f3a4e6a11c96f',          // 事件时间
    sjwcrq: '6a83599c1e7476f66a2e7bce',        // 实际完成日期
    shanchu: '6a2a2ecc837e93d36d79a621',       // （弃用：删除已走物理删）
    quanzhong: '6a051fd0f255b2b51491a981',     // 权重（拖动排序）
    zhixindu: '6a410730405fcd4e19424918',      // 置信度
    wancheng: '6a989704df6a1f4284e65f0b',      // 完成 checkbox（"1"=完成）
    yynr: '6a4727924e5ebdeabe82ebce',          // 引用内容（Relation 多选 → shangpin 自引用）
    shangjia1: '6a051fb0e05d33615bf3df3b',     // 上架
    quanxian: '6a484af5df108e8ad188be37',      // 权限（MultipleSelect，2026-09-04 实测）
    kjzz: '6a48318e1a3a7956bfa0530e',          // 可见组织（Relation → 群组表 69f549c69f1956fc0e171aa6，2026-09-04 实测）
    miaoshu: '6a9b71a2a73c45e0a19abe0b',       // 描述（Text，2026-09-05 实测；详情面板位于名称下、正文上）
    ptyh: '6a11531da47867dee8cda8cb',          // 委派成员（参与用户，Relation→用户表 69b00773…；2026-09-06 实测）
    shangjia2: '6a045ceb0507e352629dd195',     // 所属商家（Relation→商家/组织表 69f549c6…；2026-09-06 拍板：创建必带）
    wqyy: '6aa4cc46570ef9a50eef4667',          // 完全引用（Relation 单选→shangpin 自引用；非空=本记录是所引记录的零增量复制品，2026-09-21 接入）
    wqyywznr: '6aa4cd3a5c076794825cc656',      // 完全引用文字内容（他表字段，自动取所引记录的 wznr；只读）
    cjlx: '6aaa3086786452fc2187a572',          // 层级逻辑（Dropdown 单选，2026-09-21 实测；父子关系逻辑类型）
};

/**
 * 2026-10-24 HAP 别名英文化全量生效（67 字段清零）：逻辑名 → HAP 当前别名。
 * getFilterRows/getRowByIdPost 的响应键 = 当前别名，normalizeRow 读响应时按此表做
 * 「当前英文别名 → controlId UUID」兜底解析。
 */
export const CURRENT_ALIASES = {
    mingcheng: 'title',
    wznr: 'content',
    sew: 'dimension',
    fu: 'parent',
    fuyuan: 'root',
    zi: 'child',
    zisuoyou: 'child_all',
    fabuzhe: 'publisher',
    leixing: 'kind',
    fbsj: 'published_at',
    sjwcrq: 'completed_at',
    shanchu: 'is_deleted',
    quanzhong: 'weight',
    wancheng: 'is_completed',
    yynr: 'cite',
    shangjia1: 'is_published',
    quanxian: 'permission_tags',
    kjzz: 'visible_org',
    miaoshu: 'description',
    ptyh: 'participant',
    shangjia2: 'org',
    wqyy: 'full_cite',
    wqyywznr: 'full_cite_content',
    cjlx: 'hierarchy_kind',
};

// 层级逻辑（cjlx）选项：2026-09-21 getWorksheetInfo 实测
export const CJLX_OPTIONS = [
    { key: 'tuili',   label: '推理' },
    { key: 'yinguo',  label: '因果' },
    { key: 'shijian', label: '时间' },
    { key: 'baohan',  label: '归类' },
    { key: 'jieceng', label: '价格层级' },
    { key: 'qita',    label: '其他' },
];

// cjlx option key → 选项定义
export const CJLX_BY_KEY = {};
CJLX_OPTIONS.forEach(o => { CJLX_BY_KEY[o.key] = o; });

// 权限字段（quanxian）选项：key 为 HAP option key（2026-09-04 getWorksheetInfo 实测）
export const QUANXIAN_OPTIONS = [
    { key: 'e1d9b90b-cabe-4a6b-bb57-efb17c792bb8', label: '公开',       color: '#00c345' },
    { key: 'a133dc9e-68c8-463a-a898-a032665df194', label: '部分可见',   color: '#ff9300' },
    { key: 'c5d60028-eb38-4f18-97a8-e8b96270757e', label: '组织可见',   color: '#1677ff' },
    { key: '9184c671-e39e-4582-ac44-d9ad5411e3f4', label: '仅自己可见', color: '#f52222' },
    { key: 'b0c10a52-bbf8-4996-8313-92fae61d36e8', label: '部分不可见', color: '#2d46c4' },
    { key: '0c1d4e59-54f0-4039-807c-b5f092854c09', label: '粉丝可见',   color: '#7500ea' }
];

/** option key → 选项定义 */
export const QUANXIAN_BY_KEY = {};
QUANXIAN_OPTIONS.forEach(o => { QUANXIAN_BY_KEY[o.key] = o; });

// 群组表（可见组织 kjzz 的来源表）：可选列表 = zzyh（组织用户）包含当前 agent 的组织（2026-09-06 东城拍板，fabuzhe 仅是群主）
export const ZUBIAO_ID = '69f549c69f1956fc0e171aa6';

// 12+1 维定义：sew dropdown key（2026-09-03 从 HAP 实测）+ 颜色（东城拍板）
// 0骨架 = 骨架节点专用（白底黑字 1px 黑描边）；key 暂用显示值（v3 支持按显示值写入），读到真实 option key 后替换
export const SEW_DIMS = [
    { dim: 0,  sew: '0骨架',  color: '#ffffff', text: '#000000', border: '1px solid #000000', key: '0骨架', icon: '🦴' },
    { dim: 1,  sew: '1技能',  color: '#28894a', key: '8b61e3e5-438e-4114-8651-4a2199099f4b', icon: '🛠' },
    { dim: 2,  sew: '2想法',  color: '#00c345', key: '3b908884-cd15-46d5-b947-e9c41cabb94d', icon: '💡' },
    { dim: 3,  sew: '3项目',  color: '#f52222', key: 'a624fe06-6138-447f-b317-7da67f38035e', icon: '📁' },
    { dim: 4,  sew: '4交流',  color: '#ff9300', key: '222d8af1-022b-45d1-ab8c-3e1b78b8d479', icon: '💬' },
    { dim: 5,  sew: '5规则',  color: '#515151', key: '886116ff-b7ce-46ff-a14c-cc9923ad0fac', icon: '📏' },
    { dim: 6,  sew: '6价值',  color: '#9e9e9e', key: '978458ef-2780-472b-92fc-c401826dab43', icon: '⚖' },
    { dim: 7,  sew: '7目标',  color: '#1677ff', key: '2f48a1fc-cf2f-4194-b93f-5800b24cdfe7', icon: '🎯' },
    { dim: 8,  sew: '8计划',  color: '#08c9c9', key: 'd0334a50-375b-426d-8898-af1973ade663', icon: '⚡' },
    { dim: 9,  sew: '9信息',  color: '#0c3a76', key: 'c668915d-6cbe-4f33-8fb8-50ba5e22df31', icon: '📌' },
    { dim: 10, sew: '10人脉', color: '#06431a', key: 'b55dc371-7854-42b9-af28-b5c26883479f', icon: '🤝' },
    { dim: 11, sew: '11仓',   color: '#871010', key: '3eaf442f-e480-4ff9-928a-79964250ae1a', icon: '🏦' },
    { dim: 12, sew: '12复盘', color: '#151515', key: 'ff9a098c-ae72-4767-b29a-4975040851dc', icon: '🔄' }
];

/** sewKey → 维度定义 */
export const SEW_BY_KEY = {};
SEW_DIMS.forEach(d => { SEW_BY_KEY[d.key] = d; });

/** sew 显示文本 → 维度定义 */
export const SEW_BY_NAME = {};
SEW_DIMS.forEach(d => { SEW_BY_NAME[d.sew] = d; });

// Agent 速查（fabuzhe 过滤用）
export const AGENTS = [
    { rowid: '2ab12bea-8db1-4b78-a955-3505d547fba7', name: '林东城' },
    { rowid: '1024efc4-27fd-4522-bf3c-e4ebc998393c', name: '小粽' },
    { rowid: 'a8515e76-7b02-4baf-bedd-3ff011b1a9e5', name: '小风' },
    { rowid: 'ceaa79bf-f4d8-45ae-8e1e-a1c9a3ac1b7d', name: '阿说' },
    { rowid: '5b21306f-3be6-49fa-a6f6-2be311203c02', name: '梦瑶' },
    { rowid: '22ff1c1c-f1d0-4275-980b-803835504a90', name: '小云' },
    { rowid: '79e763bf-2a45-4377-9d1e-3fdf1d65da99', name: '椰果' },
    { rowid: 'a4501620-fff9-4780-a77c-c810a7f8d44e', name: '无名' }
];

// 五事骨架节点名（保护：禁止删除）
export const SKELETON_NAMES = ['道', '天', '地', '将', '法', '时间记事'];

// ===== 用户表（成员表）与必读（2026-10-04 实测） =====
export const MEMBER_WS = '69b0077358322d512e60bad0';   // 用户表（成员记录：bidu/bdwznr 等字段，每 agent 一条）
export const BIDU_CID = '6ac1b9601425aceab1a99d6c';    // 必读（Relation → shangpin「必读权重-<agent>」记录；取首元素 sid 即记录 rowid）
