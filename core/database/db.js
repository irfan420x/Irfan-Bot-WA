'use strict';
/**
 * core/database/db.js — database layer (MongoDB with in-memory fallback).
 *
 * DB name comes from config.database.dbName (default "whatsapp").
 * If config.database.uri is empty/unset (or MongoDB is unreachable),
 * the bot falls back to an in-memory store WITH a loud console warning,
 * so it still runs for tests and local development — but data does not
 * survive a restart in that mode.
 *
 * Exports { usersData, threadsData, init, close }.
 * usersData / threadsData are async stores:
 *   get(id)         -> object (creates the default if missing)
 *                      default user:   { id, money: 0, exp: 0 }
 *                      default thread: { id, settings: {}, members: [] }
 *   set(id, value, path?) -> stores value; with a dot-path ('settings.x')
 *                      only that path is set on the stored object
 *   getAll()        -> array of all stored objects
 *
 * The backing store starts as in-memory and is swapped to MongoDB by
 * init(config) (called from WABOT.js). The exported objects keep working
 * either way, so commands and tests can use them without caring which
 * backend is active.
 */

const { MongoClient } = require('mongodb');

let client = null;
let mongoDb = null;

// --- In-memory backend ----------------------------------------------------
function createMemoryStore(kind) {
  const map = new Map();
  const defaultDoc = (id) => (kind === 'user'
    ? { id, money: 0, exp: 0 }
    : { id, settings: {}, members: [] });

  return {
    async get(id) {
      id = String(id);
      if (!map.has(id)) map.set(id, defaultDoc(id));
      return JSON.parse(JSON.stringify(map.get(id)));
    },
    async set(id, value, dotPath) {
      id = String(id);
      if (!map.has(id)) map.set(id, defaultDoc(id));
      const doc = map.get(id);
      if (dotPath) {
        setDeep(doc, dotPath, value);
      } else if (value && typeof value === 'object') {
        for (const k of Object.keys(value)) {
          if (k !== 'id') doc[k] = value[k];
        }
      }
      doc.id = id;
      return JSON.parse(JSON.stringify(doc));
    },
    async getAll() {
      return [...map.values()].map((d) => JSON.parse(JSON.stringify(d)));
    }
  };
}

// --- MongoDB backend ------------------------------------------------------
function createMongoStore(collectionName, kind) {
  const defaultDoc = (id) => (kind === 'user'
    ? { id, money: 0, exp: 0 }
    : { id, settings: {}, members: [] });

  const coll = () => mongoDb.collection(collectionName);

  return {
    async get(id) {
      id = String(id);
      const found = await coll().findOne({ id });
      if (found) {
        delete found._id;
        return found;
      }
      const doc = defaultDoc(id);
      await coll().insertOne({ ...doc });
      return JSON.parse(JSON.stringify(doc));
    },
    async set(id, value, dotPath) {
      id = String(id);
      if (dotPath) {
        await coll().updateOne(
          { id },
          { $set: { [dotPath]: value }, $setOnInsert: defaultDoc(id) },
          { upsert: true }
        );
      } else if (value && typeof value === 'object') {
        const { id: _ignored, ...fields } = value;
        await coll().updateOne(
          { id },
          { $set: fields, $setOnInsert: { id } },
          { upsert: true }
        );
      }
      return this.get(id);
    },
    async getAll() {
      const docs = await coll().find({}).toArray();
      for (const d of docs) delete d._id;
      return docs;
    }
  };
}

// --- Shared helpers -------------------------------------------------------
function setDeep(obj, dotPath, value) {
  const parts = String(dotPath).split('.').filter(Boolean);
  if (parts.length === 0) return;
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

// --- Public API -----------------------------------------------------------
const usersData = createMemoryStore('user');
const threadsData = createMemoryStore('thread');

let usingMongo = false;

/**
 * Connect to MongoDB from config (or stay in-memory with a loud warning).
 * Safe to call more than once — later calls are no-ops.
 */
async function init(config = {}) {
  if (usingMongo) return { usersData, threadsData };

  const dbCfg = config.database || {};
  const uri = (dbCfg.uri || '').trim();
  const dbName = (dbCfg.dbName || 'whatsapp').trim() || 'whatsapp';

  if (!uri) {
    console.warn('');
    console.warn('[WABOT] ========================================================');
    console.warn('[WABOT] WARNING: No MongoDB URI in config.database.uri.');
    console.warn('[WABOT] Using an IN-MEMORY database — user/thread data will');
    console.warn('[WABOT] be LOST when the bot restarts. Set a real URI to');
    console.warn('[WABOT] persist data.');
    console.warn('[WABOT] ========================================================');
    console.warn('');
    return { usersData, threadsData };
  }

  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
    await client.connect();
    mongoDb = client.db(dbName);
    // Swap the backing stores to MongoDB.
    Object.assign(usersData, createMongoStore('users', 'user'));
    Object.assign(threadsData, createMongoStore('threads', 'thread'));
    usingMongo = true;
    console.log(`[WABOT] Connected to MongoDB (db "${dbName}").`);
  } catch (err) {
    console.warn('');
    console.warn('[WABOT] ========================================================');
    console.warn(`[WABOT] WARNING: MongoDB connect failed: ${err.message}`);
    console.warn('[WABOT] Falling back to an IN-MEMORY database — data will be');
    console.warn('[WABOT] LOST on restart. Fix config.database.uri.');
    console.warn('[WABOT] ========================================================');
    console.warn('');
    try { if (client) await client.close(); } catch (_) { /* ignore */ }
    client = null;
    mongoDb = null;
  }
  return { usersData, threadsData };
}

async function close() {
  if (client) {
    try { await client.close(); } catch (_) { /* ignore */ }
    client = null;
    mongoDb = null;
    usingMongo = false;
  }
}

module.exports = { usersData, threadsData, init, close };
