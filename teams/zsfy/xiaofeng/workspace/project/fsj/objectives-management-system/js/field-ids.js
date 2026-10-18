/**
 * 字段 UUID 与项目常量（前端共享）
 * 来源：2026-08-18 hap-cli 验证 + 本会话调试验证
 */
window.FIELD_IDS = {
    mingcheng: '6a03ceaa7e29abcb297cbdfd',
    wznr: '6a223553a225020849c93059',
    sew: '6a376a7b9513239477b93e31',       // 12维 dropdown
    fu: '6a2cf9d5f06514e8747a64f0',          // 直接父
    fuyuan: '6a265b9c611b4ca5b182d854',      // 第一层祖先（永远=天根）
    zi: '6a265b9c611b4ca5b182d855',          // 直接子节点数
    zisuoyou: '6a2cf9d5f06514e8747a64f1',    // 全部后代数
    fabuzhe: '6a266179f24b2a6e0a66e1a5',     // 创建者
    fbsj: '6a369543012f3a4e6a11c96f',
    sjwcrq: '6a83599c1e7476f66a2e7bce',      // 实际完成日期
    shanchu: '6a2a2ecc837e93d36d79a621',     // 逻辑删除标记
    quanzhong: '6a051fd0f255b2b51491a981',   // 权重（拖动排序）
    zhixindu: '6a410730405fcd4e19424918',     // 置信度（0-10000，优先级）
    ptyh: '6a11531da47867dee8cda8cb',         // 参与用户（Relation）
    leixing: '6a0cf5be833ba98f954f93b6',     // 类型 dropdown
    ptrq: '6a11522486012aa0b85de2dc',        // 计划完成日期
    shenhe: '6a51da58bb6d417ebf9fe9aa',
    wancheng: '6a989704df6a1f4284e65f0b',    // 完成 checkbox（字符串 "1"=完成，2026-09-03 新增）
    shangjia1: '6a051fb0e05d33615bf3df3b',   // 上架 checkbox
    dianzan: '6a2a8e2e726568523d5113c8'
};

// 12维 dropdown key（UUID）
window.SEW_KEYS = {
    target: '2f48a1fc-cf2f-4194-b93f-5800b24cdfe7',     // 7目标
    plan: 'd0334a50-375b-426d-8898-af1973ade663',       // 8计划
    info: '8b61e3e5-7b3a-4f4d-b0e8-cf9d2f7b3d2e'        // 9信息 (ref)
};

// 「天」根 rowid（用户的层级树根）
window.ROOT_FUYUAN = '8efa9d4b-1759-464f-818b-813537c709ef';

// Agent 速查（用于切换过滤）
window.AGENTS = {
    dongcheng: { rowid: '2ab12bea-8db1-4b78-a955-3505d547fba7', name: '林东城' },
    xiaofeng:  { rowid: 'a8515e76-7b02-4baf-bedd-3ff011b1a9e5', name: '小风' },
    xiaozong:  { rowid: '1024efc4-27fd-4522-bf3c-e4ebc998393c', name: '小粽' },
    ashuo:     { rowid: 'ceaa79bf-f4d8-45ae-8e1e-a1c9a3ac1b7d', name: '阿说' },
    mengyao:   { rowid: '5b21306f-3be6-49fa-a6f6-2be311203c02', name: '梦瑶' },
    xiaoyun:   { rowid: '22ff1c1c-f1d0-4275-980b-803835504a90', name: '小云' },
    yeguo:     { rowid: '79e763bf-2a45-4377-9d1e-3fdf1d65da99', name: '椰果' }
};

// Agent → 「天」根 rowid 映射（按 fuyuan 过滤切换）
window.AGENT_TIAN_ROOT = {
    '2ab12bea-8db1-4b78-a955-3505d547fba7': '8efa9d4b-1759-464f-818b-813537c709ef', // 林东城 → 天
    'a8515e76-7b02-4baf-bedd-3ff011b1a9e5': '53c4f441-fdee-4431-9c3b-3edf18412a0f', // 小风 → 天
    // 其他 agent 待补
};

// 置信度 5 档映射（zhixindu → zone）
window.ZXD_ZONES = [
    { min: 8000, max: 10000, zone: 1, color: 'red',    label: '紧急且重要' },
    { min: 6000, max: 7999,  zone: 2, color: 'blue',   label: '重要不紧急' },
    { min: 4000, max: 5999,  zone: 3, color: 'yellow', label: '紧急不重要' },
    { min: 2000, max: 3999,  zone: 4, color: 'gray',   label: '不紧急不重要' },
    { min: 0,    max: 1999,  zone: 5, color: 'pending',label: '待思考' }
];

// 统一用 quanzhong 权重分区（东城 2026-08-18 改：弃用 zhixindu 分区）
window.zoneForQuanzhong = function(qz) {
    if (qz === '' || qz == null || qz == undefined || Number(qz) === 0) return 5; // 未设/0 → 待思考
    const n = Number(qz);
    for (const z of window.ZXD_ZONES) {
        if (n >= z.min && n <= z.max) return z.zone;
    }
    return 5;
};
// 兼容旧名
window.zoneForZxd = window.zoneForQuanzhong;

window.zoneLabel = function(zone) {
    return window.ZXD_ZONES.find(z => z.zone === zone)?.label || '?';
};

// API 端点（2026-09-03 起走服务器常驻代理，不再依赖本地 node proxy.js）
window.API_BASE = 'https://100000whys.cn/obj';