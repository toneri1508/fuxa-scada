'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'config', 'plc.json');

const DEFAULT = {
  host: '192.168.3.39',
  port: 5007,
  timeoutMs: 3000,
  reconnectDelayMs: 3000,
  monitoringTimer: 4,
  pollIntervalMs: 500,
};

function load() {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    return Object.assign({}, DEFAULT, JSON.parse(raw));
  } catch (e) {
    return Object.assign({}, DEFAULT);
  }
}

function save(cfg) {
  const merged = Object.assign({}, DEFAULT, cfg);
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

module.exports = { load, save, DEFAULT };
