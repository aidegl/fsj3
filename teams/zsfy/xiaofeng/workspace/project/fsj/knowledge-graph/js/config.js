/**
 * config.js — 全局配置（凭证、常量、12维色板）
 *
 * 凭证来源：.claude/skills/fsj-skills-open/fsj-open-api.md §2.1 内置凭证
 * 注意：该凭证是应用级钥匙，仅限内部工具使用，勿外传。
 */

export const CONFIG = {
    // 明道云开放 API
    API_URL: 'https://api.mingdao.com/v2/open/worksheet/getFilterRows',
    APP_KEY: 'c156d7e78368cbc1',
    SIGN: 'NmM2NGE0ZTNlN2Y3NjU3ODY5MzMzOTk1NzBjMmMwMzNkNmE5NDU2MWZiYTg4ZWViNDk3MGE3MzU5MjcwNDU2MQ==',
    WORKSHEET_ID: '6a03ceaa7e29abcb297cbdfc', // shangpin 内容元数据表

    // 拉取参数
    PAGE_SIZE: 100,        // 每页条数（v2 上限 100）
    CONCURRENCY: 4,        // 全量分页并发数
    REQUEST_TIMEOUT: 30000,

    // HAP 页面前缀（详情面板跳转用）
    HAP_ROW_URL: 'https://mdfssj.mingdao.com/app/203def35-81c1-4930-9ea4-9ded2d92e489/worksheet',
};

/**
 * 12 维（sew）元数据 — 颜色、地支、五行、五层
 * 颜色在纯黑背景上选取中高明度色相环分布，保证区分度。
 */
export const SEW_META = {
    '1技能':  { color: '#4ade80', zhi: '寅', wuxing: '木', ceng: '将' },
    '2想法':  { color: '#a3e635', zhi: '卯', wuxing: '木', ceng: '将' },
    '3项目':  { color: '#fb7185', zhi: '巳', wuxing: '火', ceng: '法' },
    '4交流':  { color: '#f97316', zhi: '午', wuxing: '火', ceng: '法' },
    '5规则':  { color: '#facc15', zhi: '申', wuxing: '金', ceng: '道' },
    '6价值':  { color: '#fde047', zhi: '酉', wuxing: '金', ceng: '道' },
    '7目标':  { color: '#38bdf8', zhi: '亥', wuxing: '水', ceng: '天' },
    '8计划':  { color: '#818cf8', zhi: '子', wuxing: '水', ceng: '天' },
    '9信息':  { color: '#d8b4fe', zhi: '丑', wuxing: '土', ceng: '地' },
    '10人脉': { color: '#f0abfc', zhi: '辰', wuxing: '土', ceng: '地' },
    '11仓':   { color: '#fdba74', zhi: '未', wuxing: '土', ceng: '地' },
    '12复盘': { color: '#86efac', zhi: '戌', wuxing: '土', ceng: '地' },
};

/** sew 为空 / 其他类型记录的兜底色 */
export const SEW_DEFAULT_COLOR = '#6b7280';

/** 图例展示顺序（按地支 1→12） */
export const SEW_ORDER = Object.keys(SEW_META);

/**
 * 节点视觉映射
 *  - 半径（大小）= f(权重)：权重 quanzhong 有值直接归一，否则兜底 = 子数*1 + 被引用数*2
 *  - 亮度 = f(置信度)：zhixindu 有值直接归一，否则兜底 = shangjia1(1=验证模式亮 / 0=推理模式暗)
 */
export const VISUAL = {
    R_MIN: 3,
    R_MAX: 26,
    CONF_L_MIN: 0.38,   // 置信度 → HSL 亮度下限（暗）
    CONF_L_MAX: 0.72,   // 置信度 → HSL 亮度上限（亮）
};
