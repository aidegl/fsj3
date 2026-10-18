/**
 * cache.js — IndexedDB 缓存层
 *
 * 两个对象仓库：
 *  - records : keyPath=rowid，存精简记录
 *  - meta    : keyPath=key，存 lastSyncTime 等元数据
 *
 * 同步流程（方案 A：页面直连 + 增量）：
 *  1. 首次：fetchAll → 全量 upsert → meta.lastSyncTime = 本次最大 utime
 *  2. 之后：fetchIncremental(lastSyncTime) → upsert 增量 → 更新 lastSyncTime
 */

const DB_NAME = 'fsj-knowledge-graph';
const DB_VERSION = 1;

let dbPromise = null;

/** 打开（单例）数据库连接 */
export function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('records')) {
                db.createObjectStore('records', { keyPath: 'rowid' });
            }
            if (!db.objectStoreNames.contains('meta')) {
                db.createObjectStore('meta', { keyPath: 'key' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return dbPromise;
}

function tx(store, mode) {
    return openDB().then(db => db.transaction(store, mode).objectStore(store));
}

function wrap(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/* ---------------- meta ---------------- */

export async function getMeta(key) {
    const store = await tx('meta', 'readonly');
    const row = await wrap(store.get(key));
    return row ? row.value : null;
}

export async function setMeta(key, value) {
    const store = await tx('meta', 'readwrite');
    await wrap(store.put({ key, value }));
}

export async function getLastSyncTime() {
    return getMeta('lastSyncTime');
}

/* ---------------- records ---------------- */

/** 读取全部记录（渲染用，一次性载入内存） */
export async function getAllRecords() {
    const store = await tx('records', 'readonly');
    return wrap(store.getAll());
}

/** 批量 upsert（事务分批，避免单事务过大） */
export async function upsertRecords(records) {
    if (!records.length) return;
    const db = await openDB();
    const BATCH = 500;
    for (let i = 0; i < records.length; i += BATCH) {
        const slice = records.slice(i, i + BATCH);
        await new Promise((resolve, reject) => {
            const t = db.transaction('records', 'readwrite');
            const store = t.objectStore('records');
            for (const r of slice) store.put(r);
            t.oncomplete = () => resolve();
            t.onerror = () => reject(t.error);
        });
    }
}

export async function countRecords() {
    const store = await tx('records', 'readonly');
    return wrap(store.count());
}

/** 清空缓存（调试用） */
export async function clearAll() {
    const db = await openDB();
    await new Promise((resolve, reject) => {
        const t = db.transaction(['records', 'meta'], 'readwrite');
        t.objectStore('records').clear();
        t.objectStore('meta').clear();
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
    });
}
