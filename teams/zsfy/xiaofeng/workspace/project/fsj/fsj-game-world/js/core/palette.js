/**
 * 调色板服务 - 110 色统一色板（assets/color.json）
 * 行 0=灰度 1=红 2=橙 3=金黄(土) 4=黄 5=嫩绿 6=绿(木) 7=青 8=蓝(水) 9=靛 10=紫
 */
const Palette = {
    data: null,

    async load() {
        if (this.data) return this.data;
        const res = await fetch('./assets/color.json?v=' + Date.now(), { cache: 'no-store' });
        this.data = await res.json();
        return this.data;
    },

    /** 行号 → 该色系 10 阶（hex 数组，不带#） */
    row(rowIndex) {
        return this.data ? this.data[rowIndex] : [];
    },

    /** 数字索引（row*10+col）→ '#hex' */
    at(index) {
        const r = Math.floor(index / 10), c = index % 10;
        const hex = this.data && this.data[r] && this.data[r][c];
        return hex ? '#' + hex : null;
    },

    /** 五行 → UI 主题色（描边/点缀，非色板色，沿老项目 wuxingColors） */
    WUXING_UI: {
        '金': { a: '#b4b4b4', b: '#929292', c: '#727272', d: '#545454', pale: '#f2f2f2' },
        '木': { a: '#30ee73', b: '#2bd64f', c: '#1dbb59', d: '#00a555', pale: '#a6f7c2' },
        '水': { a: '#00C5E8', b: '#00A2E8', c: '#0087E8', d: '#0064E8', pale: '#a6ecf7' },
        '火': { a: '#ff7a7a', b: '#f35a5a', c: '#cf4e4e', d: '#bb3939', pale: '#ffdbeb' },
        '土': { a: '#ffc343', b: '#d9931a', c: '#ba7326', d: '#905322', pale: '#ffdc92' }
    }
}

export default Palette;
