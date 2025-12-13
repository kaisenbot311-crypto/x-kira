const fs = require('fs');
const path = require('path');
const commands = [];
function Module(data) {
    return (execFunction) => {
        commands.push({ ...data, exec: execFunction });
    };
}
function loadPlugins(dir = path.join(__dirname, '..', 'plugins')) {
    fs.readdirSync(dir).forEach(file => {
        if (file.endsWith('.js')) {
            require(path.join(dir, file));
            console.log('✅ plugin:', file);
        }
    });
    return commands;
}

module.exports = { Module, loadPlugins, commands };
