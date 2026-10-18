/**
 * 等级服务 - 经验值 → 等级/进度换算
 * 数据：assets/level-curve.json（从 HAP 等级表 69b00d47201491aa8156879b 烘焙）
 *
 * 用法：
 *   await Level.load();
 *   const info = Level.fromExp(280);
 *   // → { level: 8, exp: 280, curBase: 280, nextBase: 1160, need: 880, got: 0, progress: 0, isMax: false }
 *
 * 待接入：角色/组织经验值的真实来源（林东城后续告知），拿到后调 fromExp 即可
 */
const Level = {
    curve: null,      // { miaoshu, maxLevel, levels: [{level, exp, value}] }

    async load() {
        if (this.curve) return this.curve;
        const res = await fetch('./assets/level-curve.json?v=' + Date.now(), { cache: 'no-store' });
        this.curve = await res.json();
        // 按 level 升序保险
        this.curve.levels.sort((a, b) => a.level - b.level);
        return this.curve;
    },

    /**
     * 经验值 → 等级信息
     * @param {number} exp 累计经验值
     * @returns {{level, exp, curBase, nextBase, need, got, progress, isMax, value}}
     *   level     当前等级
     *   exp       传入的经验值（原样返回，便于链式用）
     *   curBase   当前等级所需累计经验
     *   nextBase  下一等级所需累计经验（满级 = curBase）
     *   need      升下一级还差多少（满级 = 0）
     *   got       当前等级内已积累（curBase 起算）
     *   progress  0~1 升级进度（满级 = 1）
     *   isMax     是否满级
     *   value     当前等级对应的 value 字段（含义待确认：奖励/能力值）
     */
    fromExp(exp) {
        if (!this.curve) return { level: 1, exp, curBase: 0, nextBase: 0, need: 0, got: 0, progress: 0, isMax: false, value: 0 };
        const e = Number(exp) || 0;
        const levels = this.curve.levels;
        // 找最后一个 exp >= level.exp 的档（= 当前等级）
        let cur = levels[0];
        for (const l of levels) {
            if (e >= l.exp) cur = l;
            else break;
        }
        const isMax = cur.level >= this.curve.maxLevel;
        const next = isMax ? cur : levels.find(l => l.level === cur.level + 1);
        const curBase = cur.exp;
        const nextBase = next ? next.exp : cur.exp;
        const need = Math.max(0, nextBase - e);
        const got = Math.max(0, e - curBase);
        const span = Math.max(1, nextBase - curBase);
        return {
            level: cur.level,
            exp: e,
            curBase,
            nextBase,
            need,
            got,
            progress: isMax ? 1 : Math.min(1, got / span),
            isMax,
            value: cur.value
        };
    }
};

export default Level;