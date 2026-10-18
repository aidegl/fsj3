/**
 * 世界服务 - 全景布局 + 场景数据加载
 * 场景地图优先级：明道云地点表 xsdt（动态 HAP 拉取 → 失败回退 assets/places.json）
 */
import { HapPlaces } from './hap-places.js';

const World = {
    config: null,
    scenes: {},
    emblems: null,
    places: null,
    placesSource: null,    // 'hap' | 'local' | 'empty' — 标记地点数据来源，便于调试

    async load() {
        if (this.config) return this.config;
        const res = await fetch('./assets/world.json?v=' + Date.now(), { cache: 'no-store' });
        this.config = await res.json();
        // 地点表：实时 HAP 拉取（无需跑 sync）；失败回退本地 places.json（旧的 sync 烤出来的文件）
        await this.loadPlaces();
        return this.config;
    },

    /**
     * 加载地点表：本地 places.json 优先（权威），HAP 实时增量补充
     * - 本地有完整 ground/tiles/spawns/entrances，保证世界页能跑
     * - HAP 拉到的数据只补充本地没有的 rowid（不覆盖本地）
     * - 原因：Dify 代理对大 payload（58KB xsdt）editRow 不稳定，HAP 曾被意外覆盖
     */
    async loadPlaces(force = false) {
        if (this.places && !force) return this.places;
        // 1) 本地优先
        try {
            const pres = await fetch('./assets/places.json?v=' + Date.now(), { cache: 'no-store' });
            const arr = await pres.json();
            this.places = new Map(arr.map(p => [p.rowid, p]));
            this.placesSource = 'local';
        } catch (e) {
            console.warn('[World] 本地 places.json 加载失败:', e.message);
            this.places = new Map();
            this.placesSource = 'empty';
        }
        // 2) HAP 增量补充（只加本地没有的 rowid）
        try {
            const live = await HapPlaces.fetchAll();
            let added = 0;
            for (const p of live) {
                if (p && p.rowid && !this.places.has(p.rowid)) {
                    this.places.set(p.rowid, p);
                    added++;
                }
            }
            if (added) console.log('[World] HAP 增量补充', added, '个新地点');
        } catch (e) {
            console.warn('[World] HAP 增量拉取失败（忽略）:', e.message);
        }
        return this.places;
    },

    /** 局图腾（16x16 像素徽章） */
    async getEmblems() {
        if (this.emblems) return this.emblems;
        const res = await fetch('./assets/emblems.json?v=' + Date.now(), { cache: 'no-store' });
        this.emblems = await res.json();
        return this.emblems;
    },

    async getScene(sceneId) {
        if (this.scenes[sceneId]) return this.scenes[sceneId];
        let scene = null;
        this.lastSource = 'local';
        // 明道云 xsdt 优先：world.json 场景声明 xsdt=rowid，places.json 里有对应像素地图
        const conf = (this.config.scenes || []).find(s => s.id === sceneId);
        if (conf && conf.xsdt && this.places && this.places.get(conf.xsdt)) {
            const map = this.places.get(conf.xsdt).xsdt;
            if (map && map.layers) {
                scene = { ...conf, ...map, id: sceneId, xsdtRowid: conf.xsdt };
                this.lastSource = 'xsdt';
            }
        }
        // 也可直接用地点 rowid 取图（如 75fdbe30 天孚宫）
        if (!scene && this.places && this.places.get(sceneId)) {
            const p = this.places.get(sceneId);
            if (p.xsdt && p.xsdt.layers) {
                scene = { ...p.xsdt, id: sceneId, name: p.mingcheng, xsdtRowid: sceneId };
                this.lastSource = 'xsdt-place';
            }
        }
        if (!scene) {
            const res = await fetch(`./assets/scenes/${sceneId}.json?v=` + Date.now(), { cache: 'no-store' });
            scene = await res.json();
        }
        this.scenes[sceneId] = scene;
        return scene;
    },

    /** 场景是否可进入（M1 只有 tu） */
    isReady(sceneId) {
        return !!this.scenes[sceneId] || sceneId === 'tu';
    },

    /**
     * 入口查询：当前场景 xsdt.entrances 中 (tx,ty) 命中的入口配置。
     * 每个入口：{ tx, ty, to: 目标 rowid, label, miaoshu }
     * 数据放在区/单元/层的 xsdt.entrances 里（任何有 xsdt 的地点都可挂入口）
     */
    entrancesAt(sceneId, tx, ty) {
        if (!this.places) return [];
        const p = this.places.get(sceneId);
        if (!p || !p.xsdt || !Array.isArray(p.xsdt.entrances)) return [];
        return p.xsdt.entrances.filter(e => e && e.tx === tx && e.ty === ty);
    }
};

export default World;
