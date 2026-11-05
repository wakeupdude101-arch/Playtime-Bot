const fs = require('node:fs/promises');
const path = require('node:path');

const dataDir = path.join(__dirname, '..', 'data');
const watchersPath = path.join(dataDir, 'watchers.json');
const statusPath = path.join(dataDir, 'status-message.json');

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function loadWatchers() {
  return readJson(watchersPath, { channelId: null, users: {} });
}

async function saveWatchers(value) {
  return writeJson(watchersPath, value);
}

async function loadStatusMessage() {
  return readJson(statusPath, {});
}

async function saveStatusMessage(value) {
  return writeJson(statusPath, value);
}

module.exports = { loadWatchers, saveWatchers, loadStatusMessage, saveStatusMessage };
