const { Sequelize, DataTypes } = require("sequelize");
const config = require('../../config'); // keep same as your project
const methods = ['get', 'set', 'add', 'delete'];
const types = [
  { 'mention': 'object' },
  { 'areact': 'string' },
  { 'ban': 'string' },
  { 'alive': 'string' },
  { 'login': 'string' },
  { 'shutoff': 'string' },
  { 'owner_updt': 'string' },
  { 'commit_key': 'string' },
  { 'sticker_cmd': 'object' },
  { 'plugins': 'object' },
  { 'toggle': 'object' },   
  { 'autostatus': 'string' },
  { 'autostatus_react': 'string' },
  { 'chatbot': 'object' },
  { 'always_online': 'string' },
  { 'status_view': 'string' },
  { 'save_status': 'string' }
];

// helper: merge objects (used for 'add' on object fields)
function jsonConcat(o1 = {}, o2 = {}) {
  for (const key in o2) {
    o1[key] = o2[key];
  }
  return o1;
}

// -------------------------
// Sequelize model
// -------------------------
// Note: added `meta` TEXT column to store per-field meta like last updated times.
// If your database doesn't have this column yet, Sequelize will still work but
// you should run migrations or let sync() add it (depends on your setup).
const personalDb = config.DATABASE.define("personalDB", {
  mention: { type: DataTypes.TEXT, allowNull: true },
  ban: { type: DataTypes.TEXT, allowNull: true },
  alive: { type: DataTypes.TEXT, allowNull: true, defaultValue: '_hey iam alive now &sender_' },
  login: { type: DataTypes.TEXT, allowNull: true },
  shutoff: { type: DataTypes.TEXT, allowNull: true },
  owner_updt: { type: DataTypes.TEXT, allowNull: true },
  commit_key: { type: DataTypes.TEXT, allowNull: true },
  sticker_cmd: { type: DataTypes.TEXT, allowNull: true, defaultValue: '{}' },
  plugins: { type: DataTypes.TEXT, allowNull: true, defaultValue: '{}' },
  toggle: { type: DataTypes.TEXT, allowNull: true, defaultValue: '{}' },
  areact: { type: DataTypes.TEXT, allowNull: true, defaultValue: '' },
  autostatus: { type: DataTypes.TEXT, allowNull: true, defaultValue: 'false' },
  chatbot: { type: DataTypes.TEXT, allowNull: true, defaultValue: '{}' },
  autostatus_react: { type: DataTypes.TEXT, allowNull: true, defaultValue: 'false' },
  always_online: { type: DataTypes.TEXT, allowNull: true, defaultValue: '{}' },
  status_view: { type: DataTypes.TEXT, allowNull: true, defaultValue: '{}' },
  save_status: { type: DataTypes.TEXT, allowNull: true, defaultValue: '{}' },
  // meta column stores JSON: { fieldName: { updatedAt: number, lastAction: 'set'|'add'|'delete' } }
  meta: { type: DataTypes.TEXT, allowNull: true, defaultValue: '{}' }
}, {
  // don't add timestamps for the table rows themselves (optional)
  timestamps: false
});

// -------------------------
// In-memory cache structure
// Example: 
// inMemory = {
//   mention: { value: { ... }, meta: { updatedAt: 1650000000000, lastAction: 'set' } },
//   areact:  { value: '...', meta: {...} },
//   ...
// }
// -------------------------
const inMemory = {};

// Utility: get type descriptor for a field name (e.g., { mention: 'object' })
function findTypeDescriptor(key) {
  return types.find(t => Object.prototype.hasOwnProperty.call(t, key));
}

// Utility: current timestamp (ms)
function now() {
  return Date.now();
}

// Convert DB row -> inMemory structure
function rowToInMemory(row) {
  const rowVals = row.dataValues || {};
  // parse meta
  let metaObj = {};
  try { metaObj = JSON.parse(rowVals.meta || '{}'); } catch (e) { metaObj = {}; }

  types.forEach(typeDef => {
    const key = Object.keys(typeDef)[0];
    const kind = typeDef[key];
    const raw = rowVals[key];

    let value;
    if (kind === 'object') {
      try {
        value = JSON.parse(raw || '{}');
      } catch (e) {
        value = {};
      }
    } else {
      // string (or primitive)
      value = raw == null ? '' : raw;
    }

    inMemory[key] = {
      value,
      meta: metaObj[key] || { updatedAt: null, lastAction: null }
    };
  });
}

// Convert inMemory -> object for DB update (serialize)
function inMemoryToRowPayload() {
  const payload = {};
  const meta = {};

  types.forEach(typeDef => {
    const key = Object.keys(typeDef)[0];
    const kind = typeDef[key];
    const entry = inMemory[key] || { value: (kind === 'object' ? {} : ''), meta: { updatedAt: null, lastAction: null } };

    if (kind === 'object') payload[key] = JSON.stringify(entry.value || {});
    else payload[key] = entry.value == null ? '' : String(entry.value);

    meta[key] = entry.meta || { updatedAt: null, lastAction: null };
  });

  payload.meta = JSON.stringify(meta);
  return payload;
}

// Save whole inMemory to DB (create or update)
async function persistAllToDB() {
  try {
    let row = await personalDb.findOne();
    const payload = inMemoryToRowPayload();

    if (!row) {
      // create
      await personalDb.create(payload);
    } else {
      await row.update(payload);
    }
    return true;
  } catch (err) {
    console.error('[personalConfig] persistAllToDB error:', err);
    return false;
  }
}

// Update a single field in DB row (keeps others intact) — more efficient than full replace
async function persistFieldToDB(field) {
  try {
    if (!field) return false;
    let row = await personalDb.findOne();
    const payload = {};
    const metaPayload = {};
    const entry = inMemory[field];

    if (!entry) return false;

    const typeDesc = findTypeDescriptor(field);
    if (!typeDesc) return false;

    const kind = typeDesc[field];
    if (kind === 'object') payload[field] = JSON.stringify(entry.value || {});
    else payload[field] = entry.value == null ? '' : String(entry.value);

    // fetch existing meta from DB, merge
    let dbMeta = {};
    if (row) {
      try { dbMeta = JSON.parse(row.meta || '{}'); } catch (e) { dbMeta = {}; }
    }
    dbMeta[field] = entry.meta || { updatedAt: null, lastAction: null };
    payload.meta = JSON.stringify(dbMeta);

    if (!row) {
      // create full row, ensure other fields exist with defaults
      // build safe payload for creation by merging with inMemoryToRowPayload()
      const full = inMemoryToRowPayload();
      await personalDb.create(full);
    } else {
      await row.update(payload);
    }
    return true;
  } catch (err) {
    console.error('[personalConfig] persistFieldToDB error:', err);
    return false;
  }
}

// Initialize inMemory from DB (call on startup)
async function initPersonalDB() {
  try {
    // ensure table exists
    await personalDb.sync();

    const row = await personalDb.findOne();
    if (!row) {
      // No row yet: create default inMemory from types and defaults in model
      types.forEach(t => {
        const k = Object.keys(t)[0];
        const kind = t[k];
        inMemory[k] = {
          value: kind === 'object' ? {} : '',
          meta: { updatedAt: null, lastAction: null }
        };
      });
      // persist initial row so DB has one
      await persistAllToDB();
    } else {
      // load DB row into inMemory
      rowToInMemory(row);
    }
    console.log('[personalConfig] inMemory initialized from DB.');
    return true;
  } catch (err) {
    console.error('[personalConfig] initPersonalDB error:', err);
    return false;
  }
}

// Kick off initialization in background (so requiring module doesn't block)
// You can also call initPersonalDB() explicitly and await it in your startup code.
initPersonalDB().catch(err => {
  console.error('[personalConfig] background init error:', err);
});

// -------------------------
// Main function (compatible signature)
// personalDB(typeArray, options = {}, method = 'get')
// - typeArray: array of key names ['plugins']
// - options.content: value to set/add/delete (object or primitive depending)
// - method: 'get'|'set'|'add'|'delete'
// returns: similar to your original contract for compatibility
// -------------------------
async function personalDB(typeArray, options = {}, method = 'get') {
  if (!Array.isArray(typeArray)) return;
  if (typeof options !== 'object') return;
  if (!methods.includes(method)) return;
  const filteredTypes = typeArray.map(t => types.find(a => a[t])).filter(Boolean);
  if (filteredTypes.length === 0) return;

  // Wait briefly if inMemory not yet initialized: try to ensure inMemory has keys
  if (Object.keys(inMemory).length === 0) {
    // attempt init synchronously
    await initPersonalDB();
  }

  // If no row exists in DB handle create for set/add as before
  let row = await personalDb.findOne();

  // --- GET ---
  if (method === 'get') {
    const msg = {};
    filteredTypes.forEach(t => {
      const key = Object.keys(t)[0];
      const isObject = t[key] === 'object';
      const entry = inMemory[key];
      if (!entry) {
        msg[key] = isObject ? {} : '';
      } else {
        // return raw value (backwards compatible)
        msg[key] = entry.value;
      }
    });
    return msg;
  }

  // --- SET ---
  if (method === 'set') {
    const field = Object.keys(filteredTypes[0])[0];
    const kind = filteredTypes[0][field];
    let content = options.content;

    if (kind === 'object') {
      // ensure object (if user passed string try parse)
      if (typeof content === 'string') {
        try { content = JSON.parse(content); } catch (e) { content = {}; }
      } else if (typeof content !== 'object' || content === null) content = {};
    } else {
      // coerce to string for storage
      if (content == null) content = '';
      else content = String(content);
    }

    // update inMemory
    inMemory[field] = {
      value: content,
      meta: { updatedAt: now(), lastAction: 'set' }
    };

    // persist field
    await persistFieldToDB(field);
    return true;
  }

  // --- ADD ---
  if (method === 'add') {
    const field = Object.keys(filteredTypes[0])[0];
    if (filteredTypes[0][field] !== 'object') return false;

    const addContent = options.content || {};
    const oldEntry = inMemory[field] || { value: {}, meta: { updatedAt: null, lastAction: null } };
    const old = oldEntry.value || {};
    const merged = jsonConcat(old, addContent);

    inMemory[field] = {
      value: merged,
      meta: { updatedAt: now(), lastAction: 'add' }
    };

    await persistFieldToDB(field);
    return merged;
  }

  // --- DELETE ---
  if (method === 'delete') {
    const field = Object.keys(filteredTypes[0])[0];
    if (filteredTypes[0][field] !== 'object') return false;

    const id = options.content?.id;
    if (!id) return false;

    const entry = inMemory[field] || { value: {}, meta: { updatedAt: null, lastAction: null } };
    const json = entry.value || {};
    if (!Object.prototype.hasOwnProperty.call(json, id)) return false;

    delete json[id];

    inMemory[field] = {
      value: json,
      meta: { updatedAt: now(), lastAction: 'delete' }
    };

    await persistFieldToDB(field);
    return true;
  }

  return false;
}

// -------------------------
// Helper API: getWithMeta, getMeta, persistAllToDB (manual)
// -------------------------
async function getWithMeta(typeArray) {
  if (!Array.isArray(typeArray)) return;
  if (Object.keys(inMemory).length === 0) await initPersonalDB();

  const out = {};
  typeArray.forEach(k => {
    const entry = inMemory[k];
    if (!entry) out[k] = { value: null, meta: null };
    else out[k] = { value: entry.value, meta: entry.meta };
  });
  return out;
}

function getMeta(key) {
  const entry = inMemory[key];
  return entry ? entry.meta : null;
}

// Export
module.exports = {
  personalDB,
  initPersonalDB, 
  inMemory,       
  persistAllToDB    
};




