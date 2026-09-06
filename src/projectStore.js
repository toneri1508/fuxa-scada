'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'projects');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

function safeName(name) {
  const n = String(name || '').trim();
  if (!/^[a-zA-Z0-9_\-\s]{1,64}$/.test(n)) throw new Error('Ten project khong hop le');
  return n;
}

function list() {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
}

function load(name) {
  const n = safeName(name);
  const file = path.join(DIR, n + '.json');
  if (!fs.existsSync(file)) throw new Error('Khong tim thay project');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function save(name, data) {
  const n = safeName(name);
  const file = path.join(DIR, n + '.json');
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function remove(name) {
  const n = safeName(name);
  const file = path.join(DIR, n + '.json');
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

module.exports = { list, load, save, remove };
