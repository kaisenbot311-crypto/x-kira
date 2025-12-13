const { personalDB,
    initPersonalDB,
} = require('./personal');
const { groupDB,
    initGroupDB,
    getWithMeta,
    getMeta,
} = require('./group');
const { globalDB,
    initGlobalDB } = require('./global');
const config = require('../../config');

// Initialize databases
async function initDatabases() {
    await config.DATABASE.sync();
    await initGlobalDB();
    await initPersonalDB();
    await initGroupDB();
};

module.exports = { personalDB, groupDB, initDatabases };


