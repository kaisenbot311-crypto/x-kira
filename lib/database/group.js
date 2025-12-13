// lib/groupConfig.js
const { Sequelize, DataTypes } = require("sequelize");
const config = require('../../config'); // adjust path as needed

const methods = ['get', 'set', 'add', 'delete'];
const types = [
  { bot: 'object' }, { delete: 'string' }, { fake: 'object' },
  { link: 'object' }, { word: 'object' }, { demote: 'string' },
  { promote: 'string' }, { filter: 'object' }, { warn: 'object' },
  { welcome: 'object' }, { exit: 'object' }, { pdm: 'string' }, { chatbot: 'object' }
];

function jsonConcat(o1 = {}, o2 = {}) {
  for (const key in o2) o1[key] = o2[key];
  return o1;
}

const groupDb = config.DATABASE.define("groupDB", {
  jid: { type: DataTypes.STRING, allowNull: false, unique: true },
  bot: { type: DataTypes.TEXT, allowNull: true, defaultValue: 'false' },
  delete: { type: DataTypes.TEXT, allowNull: true, defaultValue: 'false' },
  fake: { type: DataTypes.TEXT, allowNull: true, defaultValue: '{}' },
  link: { type: DataTypes.TEXT, allowNull: true, defaultValue: 'false' },
  word: { type: DataTypes.TEXT, allowNull: true, defaultValue: '{}' },
  demote: { type: DataTypes.TEXT, allowNull: true, defaultValue: 'false' },
  promote: { type: DataTypes.TEXT, allowNull: true, defaultValue: 'false' },
  filter: { type: DataTypes.TEXT, allowNull: true, defaultValue: '{}' },
  warn: { type: DataTypes.TEXT, allowNull: true, defaultValue: '{}' },
  welcome: { type: DataTypes.TEXT, allowNull: true, defaultValue: '{}' },
  chatbot: { type: DataTypes.TEXT, allowNull: true, defaultValue: '{}' },
  exit: { type: DataTypes.TEXT, allowNull: true, defaultValue: '{}' },
  pdm: { type: DataTypes.TEXT, allowNull: true, defaultValue: 'false' },
  meta: { type: DataTypes.TEXT, allowNull: true, defaultValue: '{}' }
}, {
  timestamps: false
});

// inMemory store: { [jid]: { fields: { key: { value, meta } } } }
const inMemory = {};

// helpers
function findTypeDescriptor(key) {
  return types.find(t => Object.prototype.hasOwnProperty.call(t, key));
}
function now() { return Date.now(); }

// Convert DB row -> inMemory for a single row
function rowToInMemory(row) {
  const rowVals = row.dataValues || {};
  let metaObj = {};
  try { metaObj = JSON.parse(rowVals.meta || '{}'); } catch (e) { metaObj = {}; }

  const jid = rowVals.jid;
  inMemory[jid] = { fields: {} };

  types.forEach(typeDef => {
    const key = Object.keys(typeDef)[0];
    const kind = typeDef[key];
    const raw = rowVals[key];

    let value;
    if (kind === 'object') {
      try { value = JSON.parse(raw || '{}'); } catch (e) { value = {}; }
    } else {
      value = raw == null ? (kind === 'string' ? '' : raw) : raw;
    }

    inMemory[jid].fields[key] = {
      value,
      meta: metaObj[key] || { updatedAt: null, lastAction: null }
    };
  });
}

// Build a full DB payload for a given jid from inMemory
function inMemoryToRowPayload(jid) {
  const payload = {};
  const meta = {};
  const entry = inMemory[jid] || { fields: {} };

  types.forEach(typeDef => {
    const key = Object.keys(typeDef)[0];
    const kind = typeDef[key];
    const fld = entry.fields[key] || { value: (kind === 'object' ? {} : ''), meta: { updatedAt: null, lastAction: null } };

    if (kind === 'object') payload[key] = JSON.stringify(fld.value || {});
    else payload[key] = fld.value == null ? '' : String(fld.value);

    meta[key] = fld.meta || { updatedAt: null, lastAction: null };
  });

  payload.meta = JSON.stringify(meta);
  payload.jid = jid;
  return payload;
}

// Persist a single field for a jid
async function persistFieldToDB(jid, field) {
  try {
    if (!jid || !field) return false;
    const row = await groupDb.findOne({ where: { jid } });
    const entry = inMemory[jid];
    if (!entry || !entry.fields[field]) return false;

    // prepare payload for update
    const typeDesc = findTypeDescriptor(field);
    if (!typeDesc) return false;
    const kind = typeDesc[field];
    const payload = {};
    payload[field] = kind === 'object' ? JSON.stringify(entry.fields[field].value || {}) : String(entry.fields[field].value == null ? '' : entry.fields[field].value);

    // merge meta
    let dbMeta = {};
    if (row) {
      try { dbMeta = JSON.parse(row.meta || '{}'); } catch (e) { dbMeta = {}; }
    }
    dbMeta[field] = entry.fields[field].meta || { updatedAt: null, lastAction: null };
    payload.meta = JSON.stringify(dbMeta);

    if (!row) {
      // create a full row (fill other fields from memory or defaults)
      const fullPayload = inMemoryToRowPayload(jid);
      await groupDb.create(fullPayload);
    } else {
      await row.update(payload);
    }
    return true;
  } catch (err) {
    console.error('[groupConfig] persistFieldToDB error:', err);
    return false;
  }
}

// Persist all inMemory to DB (full flush)
async function persistAllToDB() {
  try {
    const jids = Object.keys(inMemory);
    for (const jid of jids) {
      const payload = inMemoryToRowPayload(jid);
      const row = await groupDb.findOne({ where: { jid } });
      if (!row) await groupDb.create(payload);
      else await row.update(payload);
    }
    return true;
  } catch (err) {
    console.error('[groupConfig] persistAllToDB error:', err);
    return false;
  }
}

// Initialize: load all rows into memory
async function initGroupDB() {
  try {
    // Ensure table exists
    await groupDb.sync();
    const rows = await groupDb.findAll();
    if (!rows || rows.length === 0) {
      // No rows: inMemory remains empty until creation on first write
      console.log('[groupConfig] no group rows found; memory empty.');
      return true;
    }
    rows.forEach(row => rowToInMemory(row));
    console.log(`[groupConfig] loaded ${rows.length} group rows into memory.`);
    return true;
  } catch (err) {
    console.error('[groupConfig] initGroupDB error:', err);
    return false;
  }
}

// Kick off background init so module require doesn't block (optional)
initGroupDB().catch(e => console.error('[groupConfig] background init error:', e));

// Main API: groupDB(typeArray, options, method)
async function groupDB(typeArray, options = {}, method = 'get') {
  if (!Array.isArray(typeArray)) return;
  if (typeof options !== 'object' || !options.jid) return;
  if (!methods.includes(method)) return;

  const filter = typeArray.map(t => types.find(a => a[t])).filter(Boolean);
  if (!filter.length) return;

  // For set/add/delete we expect one type only (same as your original)
  let singleTypeDef = null;
  let fieldName = null;
  if (['set', 'add', 'delete'].includes(method)) {
    singleTypeDef = filter[0];
    fieldName = Object.keys(singleTypeDef)[0];
  }

  const jid = options.jid;

  // Ensure memory entry for jid exists; if not, initialize from DB or defaults
  if (!inMemory[jid]) {
    const row = await groupDb.findOne({ where: { jid } });
    if (row) {
      rowToInMemory(row);
    } else {
      // create default fields in memory for this jid
      inMemory[jid] = { fields: {} };
      types.forEach(t => {
        const k = Object.keys(t)[0];
        const kind = t[k];
        inMemory[jid].fields[k] = {
          value: kind === 'object' ? {} : (kind === 'string' ? '' : null),
          meta: { updatedAt: null, lastAction: null }
        };
      });
      // do NOT auto-persist here; persist when user does set/add or use persistFieldToDB if desired
    }
  }

  // ------------- GET -------------
  if (method === 'get') {
    const out = {};
    filter.forEach(f => {
      const k = Object.keys(f)[0];
      const kind = f[k];
      const entry = inMemory[jid].fields[k];
      if (!entry) out[k] = kind === 'object' ? {} : '';
      else out[k] = entry.value;
    });
    return out;
  }

  // ------------- SET -------------
  if (method === 'set') {
    const kind = singleTypeDef[fieldName];
    let content = options.content;

    if (kind === 'object') {
      if (typeof content === 'string') {
        try { content = JSON.parse(content); } catch (e) { content = {}; }
      } else if (typeof content !== 'object' || content === null) content = {};
    } else {
      if (content == null) content = '';
      else content = String(content);
    }

    inMemory[jid].fields[fieldName] = {
      value: content,
      meta: { updatedAt: now(), lastAction: 'set' }
    };

    await persistFieldToDB(jid, fieldName);
    return true;
  }

  // ------------- ADD -------------
  if (method === 'add') {
    if (singleTypeDef[fieldName] !== 'object') return false;
    const addContent = options.content || {};
    const oldEntry = inMemory[jid].fields[fieldName] || { value: {}, meta: { updatedAt: null, lastAction: null } };
    const old = oldEntry.value || {};
    const merged = jsonConcat(old, addContent);

    inMemory[jid].fields[fieldName] = {
      value: merged,
      meta: { updatedAt: now(), lastAction: 'add' }
    };

    await persistFieldToDB(jid, fieldName);
    return merged;
  }

  // ------------- DELETE -------------
  if (method === 'delete') {
    if (singleTypeDef[fieldName] !== 'object') return false;
    const id = options.content?.id;
    if (!id) return false;

    const entry = inMemory[jid].fields[fieldName] || { value: {}, meta: { updatedAt: null, lastAction: null } };
    const json = entry.value || {};
    if (!Object.prototype.hasOwnProperty.call(json, id)) return false;

    delete json[id];

    inMemory[jid].fields[fieldName] = {
      value: json,
      meta: { updatedAt: now(), lastAction: 'delete' }
    };

    await persistFieldToDB(jid, fieldName);
    return true;
  }

  return;
}

// Helper: get value + meta for a set of types for a jid
async function getWithMeta(jid, typeArray) {
  if (!jid || !Array.isArray(typeArray)) return;
  if (!inMemory[jid]) {
    const row = await groupDb.findOne({ where: { jid } });
    if (row) rowToInMemory(row);
    else {
      // default
      inMemory[jid] = { fields: {} };
      types.forEach(t => {
        const k = Object.keys(t)[0];
        inMemory[jid].fields[k] = { value: t[k] === 'object' ? {} : '', meta: { updatedAt: null, lastAction: null } };
      });
    }
  }
  const out = {};
  typeArray.forEach(k => {
    const entry = inMemory[jid].fields[k];
    out[k] = entry ? { value: entry.value, meta: entry.meta } : { value: null, meta: null };
  });
  return out;
}

function getMeta(jid, field) {
  if (!jid || !field || !inMemory[jid]) return null;
  const entry = inMemory[jid].fields[field];
  return entry ? entry.meta : null;
}

// Exports
module.exports = {
  groupDB,
  initGroupDB,
  getWithMeta,
  getMeta,
  inMemory,
  persistAllToDB
};


