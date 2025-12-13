/* lib/globalDB.js
   Global key-value DB with in-memory cache + Sequelize persistence.
   - single-row table: data (JSON string), meta (JSON string)
   - ultra-fast reads from memory
   - set/add/delete persist to DB immediately
   - exported helpers: globalDB(), initGlobalDB(), getWithMeta(), getMeta(), inMemory, persistAllToDB()

   Usage:
     const { globalDB, initGlobalDB } = require('./lib/globalDB');
     await initGlobalDB(); // optional (module auto-inits in background)
     await globalDB(['siteTitle'], { content: 'My Site' }, 'set');
     const v = await globalDB(['siteTitle'], {}, 'get');
*/

const { DataTypes } = require('sequelize');
const config = require('../../config'); // adjust path to your project config

// In-memory cache: { key: { value, meta } }
const inMemory = {};

// model: single-row store
const globalDb = config.DATABASE.define('globalDB', {
  // store all key-values in `data` JSON string and per-key meta in `meta`
  data: { type: DataTypes.TEXT, allowNull: true, defaultValue: '{}' },
  meta: { type: DataTypes.TEXT, allowNull: true, defaultValue: '{}' }
}, { timestamps: false });

// helpers
function now() { return Date.now(); }
function safeParse(s, fallback) {
  try { return JSON.parse(s); } catch (e) { return fallback; }
}

// Load DB row into inMemory
function rowToInMemory(row) {
  const rowVals = row && row.dataValues ? row.dataValues : {};
  const dataObj = safeParse(rowVals.data || '{}', {});
  const metaObj = safeParse(rowVals.meta || '{}', {});

  // populate inMemory
  for (const key of Object.keys(dataObj)) {
    inMemory[key] = {
      value: dataObj[key],
      meta: metaObj[key] || { updatedAt: null, lastAction: null }
    };
  }
}

// Convert inMemory -> DB payload
function inMemoryToPayload() {
  const data = {};
  const meta = {};
  for (const key of Object.keys(inMemory)) {
    data[key] = inMemory[key].value;
    meta[key] = inMemory[key].meta || { updatedAt: null, lastAction: null };
  }
  return { data: JSON.stringify(data), meta: JSON.stringify(meta) };
}

// Persist full payload (create or update single row)
async function persistAllToDB() {
  try {
    const payload = inMemoryToPayload();
    let row = await globalDb.findOne();
    if (!row) await globalDb.create(payload);
    else await row.update(payload);
    return true;
  } catch (err) {
    console.error('[globalDB] persistAllToDB error:', err);
    return false;
  }
}

// Persist only changed keys by writing full payload (single-row table)
async function persistKeysToDB(keys = []) {
  try {
    const row = await globalDb.findOne();
    const currentData = row ? safeParse(row.data || '{}', {}) : {};
    const currentMeta = row ? safeParse(row.meta || '{}', {}) : {};

    for (const k of keys) {
      currentData[k] = (inMemory[k] && inMemory[k].value !== undefined) ? inMemory[k].value : null;
      currentMeta[k] = (inMemory[k] && inMemory[k].meta) ? inMemory[k].meta : { updatedAt: null, lastAction: null };
    }

    const payload = { data: JSON.stringify(currentData), meta: JSON.stringify(currentMeta) };

    if (!row) await globalDb.create(payload);
    else await row.update(payload);

    return true;
  } catch (err) {
    console.error('[globalDB] persistKeysToDB error:', err);
    return false;
  }
}

// Initialize memory from DB (call at startup)
async function initGlobalDB() {
  try {
    await globalDb.sync(); // ensure table exists
    const row = await globalDb.findOne();
    if (!row) {
      // nothing in DB: leave inMemory empty until first write
      // but create an empty row so DB exists
      await globalDb.create({ data: '{}', meta: '{}' });
      return true;
    }
    rowToInMemory(row);
    return true;
  } catch (err) {
    console.error('[globalDB] initGlobalDB error:', err);
    return false;
  }
}

// auto init in background (optional)
initGlobalDB().catch(e => console.error('[globalDB] background init error:', e));

// Main API: globalDB(keysArray, options = {}, method = 'get')
// keysArray: ['key1','key2']
// options.content for set/add/delete
async function globalDB(keysArray, options = {}, method = 'get') {
  if (!Array.isArray(keysArray)) return;
  if (typeof options !== 'object') return;
  const methods = ['get', 'set', 'add', 'delete'];
  if (!methods.includes(method)) return;

  // ensure memory loaded
  if (Object.keys(inMemory).length === 0) {
    await initGlobalDB();
  }

  // GET: return values from memory
  if (method === 'get') {
    const out = {};
    keysArray.forEach(k => {
      if (Object.prototype.hasOwnProperty.call(inMemory, k)) out[k] = inMemory[k].value;
      else out[k] = null; // absent
    });
    return out;
  }

  // For set/add/delete we expect a single key
  const key = keysArray[0];
  if (!key) return;

  // SET: set any JSON-serializable value
  if (method === 'set') {
    let content = options.content;
    // if string that looks like JSON, try parse
    if (typeof content === 'string') {
      try { content = JSON.parse(content); } catch (e) { /* keep string */ }
    }

    inMemory[key] = {
      value: content,
      meta: { updatedAt: now(), lastAction: 'set' }
    };

    await persistKeysToDB([key]);
    return true;
  }

  // ADD: merge when existing value is object, or create object
  if (method === 'add') {
    const addContent = options.content || {};
    const existing = (inMemory[key] && inMemory[key].value) || {};
    const base = (typeof existing === 'object' && existing !== null) ? existing : {};
    const merged = Object.assign({}, base, addContent);

    inMemory[key] = {
      value: merged,
      meta: { updatedAt: now(), lastAction: 'add' }
    };

    await persistKeysToDB([key]);
    return merged;
  }

  // DELETE: if key points to object and content.id provided, delete that property
  if (method === 'delete') {
    const id = options.content?.id;
    if (!inMemory[key]) return false;

    const val = inMemory[key].value;
    if (typeof val === 'object' && val !== null) {
      if (!id) return false;
      if (!Object.prototype.hasOwnProperty.call(val, id)) return false;
      delete val[id];
      inMemory[key] = { value: val, meta: { updatedAt: now(), lastAction: 'delete' } };
      await persistKeysToDB([key]);
      return true;
    }

    // if not object, delete whole key when options.force === true
    if (options.force) {
      delete inMemory[key];
      await persistKeysToDB([key]);
      return true;
    }

    return false;
  }

  return false;
}

// get value + meta
async function getWithMeta(keysArray) {
  if (!Array.isArray(keysArray)) return;
  if (Object.keys(inMemory).length === 0) await initGlobalDB();
  const out = {};
  keysArray.forEach(k => {
    const entry = inMemory[k];
    out[k] = entry ? { value: entry.value, meta: entry.meta } : { value: null, meta: null };
  });
  return out;
}

function getMeta(key) {
  const e = inMemory[key];
  return e ? e.meta : null;
}

module.exports = {
  globalDB,
  initGlobalDB,
  getWithMeta,
  getMeta,
  inMemory,
  persistAllToDB
};
