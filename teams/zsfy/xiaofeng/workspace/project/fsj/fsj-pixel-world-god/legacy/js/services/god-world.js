/**
 * god-world - 上帝端世界数据服务
 *
 * 场景清单与地图加载。注意：不能直接复用手机端 world.js —— 它内部 fetch('./assets/…')
 * 相对页面 URL 解析，上帝端页面在 /fsj-pixel-world-god/ 下会取错路径。
 * 本文件显式指向 ../fsj-pixel-world/assets/…，语义与手机端 world.js 对齐：
 *   场景地图优先级：HAP 地点表 xsdt（经 places）→ 手机端本地 assets/scenes/{id}.json 兜底
 */
import { HapPlaces } from '../../../fsj-pixel-world/js/services/hap-places.js';

const MOBILE_ASSETS = '../fsj-pixel-world/assets';

export const GodWorld = {
    config: null,       // world.json（场景声明）
    places: null,       // Map<rowid, place>（含 xsdt 像素地图）
    sceneMaps: {},      // sceneId -> scene（size/tilesize/tiles/layers）

    async load() {
        if (this.config) return this.config;
        const res = await fetch(`${MOBILE_ASSETS}/world.json?v=` + Date.now(), { cache: 'no-store' });
        this.config = await res.json();
        // 地点表：手机端本地 places.json 优先 + HAP 实时增量（与手机端同策略）
        try {
            const pres = await fetch(`${MOBILE_ASSETS}/places.json?v=` + Date.now(), { cache: 'no-store' });
            const arr = await pres.json();
            this.places = new Map(arr.map(p => [p.rowid, p]));
        } catch (e) {
            console.warn('[god-world] places.json 加载失败:', e.message);
            this.places = new Map();
        }
        try {
            const live = await HapPlaces.fetchAll();
            let added = 0;
            for (const p of live) {
                if (p && p.rowid && !this.places.has(p.rowid)) { this.places.set(p.rowid, p); added++; }
            }
            if (added) console.log('[god-world] HAP 增量补充', added, '个新地点');
        } catch (e) {
            console.warn('[god-world] HAP 地点拉取失败（忽略）:', e.message);
        }
        return this.config;
    },

    /** 全部场景声明 */
    scenes() { return (this.config && this.config.scenes) || []; },

    /** 地点 rowid → 场景 id（用户表 didian / WS move 的 scene 都可能是两种形态） */
    sceneIdOfPlace(placeRowid) {
        if (!placeRowid) return null;
        const hit = this.scenes().find(s => s.xsdt === placeRowid);
        if (hit) return hit.id;
        const hit2 = this.scenes().find(s => s.id === placeRowid);
        return hit2 ? hit2.id : null;
    },

    /**
     * 取场景渲染数据（size/tilesize/tiles/layers）。
     * 优先 HAP xsdt 活地图 → 手机端本地 scenes/{id}.json 兜底 → null（未开放）
     */
    async getSceneMap(sceneId) {
        if (this.sceneMaps[sceneId]) return this.sceneMaps[sceneId];
        const conf = this.scenes().find(s => s.id === sceneId);
        let scene = null;
        if (conf && conf.xsdt && this.places && this.places.get(conf.xsdt)) {
            const map = this.places.get(conf.xsdt).xsdt;
            if (map && map.layers) scene = { ...conf, ...map, id: sceneId };
        }
        if (!scene && this.places && this.places.get(sceneId)) {
            const p = this.places.get(sceneId);
            if (p.xsdt && p.xsdt.layers) scene = { ...p.xsdt, id: sceneId, name: p.mingcheng };
        }
        if (!scene) {
            try {
                const res = await fetch(`${MOBILE_ASSETS}/scenes/${sceneId}.json?v=` + Date.now(), { cache: 'no-store' });
                scene = await res.json();
            } catch (e) { /* 未开放 */ }
        }
        if (scene && scene.layers) this.sceneMaps[sceneId] = scene;
        return scene || null;
    }
};
