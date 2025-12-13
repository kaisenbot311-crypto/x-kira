// settingsDB.js
// CommonJS module for Node.js (Baileys bot)
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const DEFAULT_FILE = path.join(__dirname, 'data', 'settings_db.json');

// helper: normalize boolean-like values
function toBool(v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  if (typeof v === 'string') {
    return ['true', '1', 'yes', 'on'].includes(v.toLowerCase());
  }
  return Boolean(v);
}

class SettingsDB extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.file = opts.file || DEFAULT_FILE;
    this.autosaveInterval = typeof opts.autosaveInterval === 'number' ? opts.autosaveInterval : 5000; // ms
    this._startupTime = new Date().toISOString();

    // In-memory caches
    this.globalSettings = Object.create(null); // plain object
    this.groupSettings = new Map(); // Map<jid, object>
    this.updateTimes = new Map(); // Map<jidOr'global', Map<pluginName, ISOstring>>

    // flags for persistence
    this._dirty = false;
    this._saving = false;
    this._pendingSave = false;

    // ensure data dir exists
    this._ensureDir();

    // auto-save timer
    if (this.autosaveInterval > 0) {
      this._autosaveTimer = setInterval(() => this._autoSave().catch(() => {}), this.autosaveInterval);
      if (this._autosaveTimer.unref) this._autosaveTimer.unref();
    }
  }

  _ensureDir() {
    const dir = path.dirname(this.file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  // ---------- persistence (load/save) ----------
  async load() {
    try {
      if (!fs.existsSync(this.file)) {
        await this._writeInitialFile();
        return true;
      }
      const raw = await fs.promises.readFile(this.file, 'utf8');
      const json = JSON.parse(raw);

      // restore global settings
      this.globalSettings = json.globalSettings || {};

      // restore group settings (Map)
      const gs = json.groupSettings || {};
      this.groupSettings = new Map(Object.entries(gs));

      // restore updateTimes: object -> Map<k,Map>
      const utRaw = json.updateTimes || {};
      this.updateTimes = new Map(
        Object.entries(utRaw).map(([k, v]) => [k, new Map(Object.entries(v || {}))])
      );

      // new startup timestamp
      this._startupTime = new Date().toISOString();
      this._dirty = false;
      return true;
    } catch (err) {
      console.error('settingsDB.load error:', err);
      // attempt to backup corrupt file
      try {
        if (fs.existsSync(this.file)) {
          const corruptPath = `${this.file}.corrupt.${Date.now()}`;
          await fs.promises.copyFile(this.file, corruptPath);
          console.warn('Backed up corrupt settings file to', corruptPath);
        }
      } catch (_) {}
      return false;
    }
  }

  async _writeInitialFile() {
    this.globalSettings = {};
    this.groupSettings = new Map();
    this.updateTimes = new Map();
    await this.save().catch((e) => {
      console.error('initial save failed', e);
    });
  }

  async save() {
    // Don't allow multiple simultaneous disk writes; queue if necessary.
    if (this._saving) {
      this._pendingSave = true;
      return;
    }
    this._saving = true;
    this._pendingSave = false;
    try {
      const obj = {
        globalSettings: this.globalSettings,
        groupSettings: Object.fromEntries(this.groupSettings),
        updateTimes: Object.fromEntries(
          Array.from(this.updateTimes.entries()).map(([k, vMap]) => [k, Object.fromEntries(vMap)])
        )
      };

      const tmp = `${this.file}.tmp`;
      await fs.promises.writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
      await fs.promises.rename(tmp, this.file);

      this._dirty = false;
      this._saving = false;
      this.emit('saved');

      // if another save was requested while saving, run again
      if (this._pendingSave) {
        this._pendingSave = false;
        setImmediate(() => this.save().catch(() => {}));
      }
    } catch (err) {
      this._saving = false;
      console.error('settingsDB.save error:', err);
      throw err;
    }
  }

  async _autoSave() {
    if (!this._dirty) return;
    await this.save();
  }

  // ---------- getters ----------
  getData(jid = null, opts = { mergeGlobalDefaults: false }) {
    if (!jid) {
      // return shallow copy to avoid accidental mutation
      return { ...this.globalSettings };
    }
    const raw = this.groupSettings.get(jid) || {};
    if (!opts.mergeGlobalDefaults) return { ...raw };
    const merged = { ...raw };
    for (const [k, v] of Object.entries(this.globalSettings || {})) {
      if (merged[k] === undefined) merged[k] = v;
    }
    return merged;
  }

  get(jidOrPlugin, pluginName = null) {
    if (pluginName === null) {
      return this.globalSettings[jidOrPlugin];
    }
    const jid = jidOrPlugin;
    const g = this.groupSettings.get(jid) || {};
    return g[pluginName];
  }

  // ---------- setters ----------
  // Generic convenience set that supports:
  // set('autoreact', true)  -> global
  // set('123@g.us','welcome',{...}) -> group
  async set(jidOrPlugin, pluginName, value, { persist = true } = {}) {
    // If first arg is a group jid and second arg is a string => group set
    if (this._isJid(jidOrPlugin) && typeof pluginName === 'string') {
      return this.setGroupPlugin(jidOrPlugin, pluginName, value, { persist });
    }

    // If second arg is undefined -> invalid usage
    if (typeof pluginName === 'undefined') {
      throw new Error('Invalid arguments. Use set("pluginKey", value) or set(jid, "pluginName", value).');
    }

    // Otherwise treat as global: set(pluginKey, value)
    return this.setGlobal(jidOrPlugin, pluginName, { persist });
  }

  async setGlobal(pluginKey, value, { persist = true } = {}) {
    this.globalSettings[pluginKey] = value;
    this._setUpdateTime('global', pluginKey);
    this._dirty = true;
    this.emit('update', { scope: 'global', plugin: pluginKey, value });
    if (persist) await this.save().catch(() => {});
  }

  async setGroupPlugin(jid, pluginName, value, { persist = true } = {}) {
    const existing = this.groupSettings.get(jid) || {};
    existing[pluginName] = value;
    this.groupSettings.set(jid, existing);
    this._setUpdateTime(jid, pluginName);
    this._dirty = true;
    this.emit('update', { scope: 'group', jid, plugin: pluginName, value });
    if (persist) await this.save().catch(() => {});
  }

  async toggleGlobal(pluginKey, { persist = true } = {}) {
    const current = Boolean(this.globalSettings[pluginKey]);
    const next = !current;
    await this.setGlobal(pluginKey, next, { persist });
    return next;
  }

  async toggleGroupPlugin(jid, pluginKey, { persist = true } = {}) {
    const existing = this.groupSettings.get(jid) || {};
    const current = Boolean(existing[pluginKey]);
    const next = !current;
    existing[pluginKey] = next;
    this.groupSettings.set(jid, existing);
    this._setUpdateTime(jid, pluginKey);
    this._dirty = true;
    this.emit('update', { scope: 'group', jid, plugin: pluginKey, value: next });
    if (persist) await this.save().catch(() => {});
    return next;
  }

  async setGroupPluginConfig(jid, pluginName, configObj, { persist = true } = {}) {
    if (typeof configObj !== 'object' || configObj === null) {
      throw new Error('configObj must be an object');
    }
    const existing = this.groupSettings.get(jid) || {};
    const prev = existing[pluginName] || {};
    existing[pluginName] = { ...prev, ...configObj };
    this.groupSettings.set(jid, existing);
    this._setUpdateTime(jid, pluginName);
    this._dirty = true;
    this.emit('update', { scope: 'group', jid, plugin: pluginName, value: existing[pluginName] });
    if (persist) await this.save().catch(() => {});
    return existing[pluginName];
  }

  // ---------- helpers ----------
  _isJid(val) {
    return typeof val === 'string' && (val.endsWith('@g.us') || val.includes('@'));
  }

  _setUpdateTime(jidOrGlobal, pluginName) {
    const key = jidOrGlobal || 'global';
    const m = this.updateTimes.get(key) || new Map();
    m.set(pluginName, new Date().toISOString());
    this.updateTimes.set(key, m);
  }

  getUpdateTime(jidOrGlobal = 'global', pluginName) {
    const m = this.updateTimes.get(jidOrGlobal);
    if (!m) return null;
    return m.get(pluginName) || null;
  }

  getStartupTime() {
    return this._startupTime;
  }

  deleteGroup(jid, { persist = true } = {}) {
    const existed = this.groupSettings.delete(jid);
    this.updateTimes.delete(jid);
    this._dirty = true;
    this.emit('deleteGroup', { jid });
    if (persist) this.save().catch(() => {});
    return existed;
  }

  listGroups() {
    return Array.from(this.groupSettings.keys());
  }

  async close() {
    if (this._autosaveTimer) clearInterval(this._autosaveTimer);
    await this.save().catch(() => {});
  }

  /**
   * getMultiple(jid, keys, defaults)
   * - Returns multiple settings in one call.
   * - Priority: groupSetting -> globalSetting -> defaults[key]
   * - If defaults[key] is boolean, result will be normalized to boolean.
   */
  getMultiple(jid, keys = [], defaults = {}) {
    const out = {};
    const groupCfg = jid ? this.groupSettings.get(jid) : null;

    for (const key of keys) {
      let val;

      // 1) group override
      if (groupCfg && groupCfg[key] !== undefined) {
        val = groupCfg[key];
      }
      // 2) global fallback
      else if (this.globalSettings[key] !== undefined) {
        val = this.globalSettings[key];
      }
      // 3) default
      else {
        val = defaults[key];
      }

      // normalize boolean if default is boolean
      out[key] = (typeof defaults[key] === 'boolean') ? toBool(val) : val;
    }

    return out;
  }
}

// Export singleton
const _db = new SettingsDB();

module.exports = {
  init: async (opts = {}) => {
    if (opts.file) _db.file = opts.file;
    if (typeof opts.autosaveInterval === 'number') {
      if (_db._autosaveTimer) clearInterval(_db._autosaveTimer);
      _db.autosaveInterval = opts.autosaveInterval;
      if (opts.autosaveInterval > 0) {
        _db._autosaveTimer = setInterval(() => _db._autoSave().catch(() => {}), opts.autosaveInterval);
        if (_db._autosaveTimer.unref) _db._autosaveTimer.unref();
      }
    }
    await _db.load();
    return _db;
  },

  getData: (jid = null, opts = { mergeGlobalDefaults: false }) => _db.getData(jid, opts),
  getGlobal: (key) => _db.globalSettings[key],
  getGroup: (jid, pluginName = null) => {
    if (!pluginName) return _db.groupSettings.get(jid) || {};
    const g = _db.groupSettings.get(jid) || {};
    return g[pluginName];
  },

  // Generic setter (supports both group and global signatures)
  set: (jidOrPlugin, pluginName, value, opts) => _db.set(jidOrPlugin, pluginName, value, opts),

  // Explicit setters
  setGlobal: (pluginKey, value, opts) => _db.setGlobal(pluginKey, value, opts),
  setGroupPlugin: (jid, pluginName, value, opts) => _db.setGroupPlugin(jid, pluginName, value, opts),
  setGroupPluginConfig: (jid, pluginName, configObj, opts) => _db.setGroupPluginConfig(jid, pluginName, configObj, opts),

  toggleGlobal: (pluginKey, opts) => _db.toggleGlobal(pluginKey, opts),
  toggleGroupPlugin: (jid, pluginKey, opts) => _db.toggleGroupPlugin(jid, pluginKey, opts),

  // get multiple in one call (fast, memory-only)
  getMultiple: (jid, keys, defaults) => _db.getMultiple(jid, keys, defaults),

  getStartupTime: () => _db.getStartupTime(),
  getUpdateTime: (jidOrGlobal = 'global', pluginName) => _db.getUpdateTime(jidOrGlobal, pluginName),
  listGroups: () => _db.listGroups(),

  save: () => _db.save(),
  load: () => _db.load(),
  close: () => _db.close(),

  on: (ev, cb) => _db.on(ev, cb),
  off: (ev, cb) => _db.off(ev, cb),

  _internal: { _db }
};