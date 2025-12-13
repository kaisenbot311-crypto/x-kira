//=================================================================================
// group-cache.js
// Group metadata cache with read-through and event updates
//=================================================================================
const QuickLRU = null; // optional: require('quick-lru') if you want LRU behavior
// const groups = new QuickLRU({ maxSize: 2000, maxAge: 1000 * 60 * 60 }); // LRU example
const groups = new Map();    // jid -> metadata
const inflight = new Map();  // jid -> Promise (ongoing fetch)

/**
 * Get cached metadata (fast path)
 * @param {string} jid 
 * @returns metadata or undefined
 */
function getCached(jid) {
  return groups.get(jid);
}

/**
 * Set metadata into cache
 * @param {string} jid 
 * @param {object} metadata 
 */
function setCached(jid, metadata) {
  if (!jid || !metadata) return;
  groups.set(jid, metadata);
}

/**
 * Delete cached metadata
 * @param {string} jid 
 */
function deleteCached(jid) {
  groups.delete(jid);
  inflight.delete(jid);
}

/**
 * List all cached JIDs
 * @returns {string[]}
 */
function listCachedJids() {
  return Array.from(groups.keys());
}

/**
 * Read-through helper: get metadata from cache or fetch from server
 * Uses inflight map to avoid duplicate concurrent fetches
 * @param {object} conn - Baileys socket
 * @param {string} jid - group jid
 */
async function getGroupMetadata(conn, jid) {
  // quick hit
  const cached = groups.get(jid);
  if (cached) return cached;

  // if another fetch in progress, wait
  if (inflight.has(jid)) return inflight.get(jid);

  // fetch and cache
  const p = (async () => {
    try {
      const md = await conn.groupMetadata(jid);
      groups.set(jid, md);
      return md;
    } catch (err) {
      groups.delete(jid);
      throw err;
    } finally {
      inflight.delete(jid);
    }
  })();

  inflight.set(jid, p);
  return p;
}

/**
 * Update cache partially (useful for group updates / participant changes)
 * @param {string} jid 
 * @param {object} updateObj 
 */
function updateCached(jid, updateObj) {
  if (!jid || !updateObj) return;
  const cached = groups.get(jid) || {};
  groups.set(jid, { ...cached, ...updateObj });
}

module.exports = {
  groups,
  getCached,
  setCached,
  deleteCached,
  listCachedJids,
  getGroupMetadata,
  updateCached
};