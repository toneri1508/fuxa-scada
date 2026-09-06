'use strict';
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const projectStore = require('./src/projectStore');
const configStore = require('./src/configStore');
const PlcService = require('./src/plcService');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// ---- PLC service (1 ket noi dung chung cho tat ca client) ----
const initialConfig = configStore.load();
const plc = new PlcService(initialConfig);
plc.start();

// ---- REST: cau hinh ket noi PLC ----
app.get('/api/config', (req, res) => {
  res.json(plc.getStatus());
});

app.post('/api/config', (req, res) => {
  try {
    const saved = configStore.save(req.body);
    plc.updateConfig(saved);
    res.json({ ok: true, config: saved });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ---- REST: quan ly project (man hinh giao dien) ----
app.get('/api/projects', (req, res) => {
  res.json(projectStore.list());
});

app.get('/api/projects/:name', (req, res) => {
  try {
    res.json(projectStore.load(req.params.name));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

app.post('/api/projects/:name', (req, res) => {
  try {
    projectStore.save(req.params.name, req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.delete('/api/projects/:name', (req, res) => {
  try {
    projectStore.remove(req.params.name);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ---- WebSocket: du lieu realtime + dieu khien ----
wss.on('connection', (ws) => {
  let mySubs = []; // [{device,address}]

  ws.send(JSON.stringify({ type: 'status', connected: plc.connected }));

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }

    if (msg.type === 'subscribe') {
      plc.removeRefs(mySubs);
      mySubs = Array.isArray(msg.tags) ? msg.tags : [];
      try {
        plc.addRefs(mySubs);
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: e.message }));
      }
      // gui ngay gia tri hien co (neu co) de UI khong trong cho den vong quet ke tiep
      const snapshot = {};
      mySubs.forEach(({ device, address }) => {
        try {
          const info = require('./src/mcProtocol').deviceInfo(device);
          const addr = require('./src/mcProtocol').parseAddress(device, address);
          const key = `${device}:${addr}`;
          const t = plc.tags.get(key);
          if (t && t.value !== null) snapshot[`${device}${t.addressStr}`] = t.value;
        } catch (e) {
          /* ignore */
        }
      });
      if (Object.keys(snapshot).length) ws.send(JSON.stringify({ type: 'data', values: snapshot }));
    } else if (msg.type === 'write') {
      try {
        await plc.writeTag(msg.device, msg.address, msg.dataType, msg.value);
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: e.message }));
      }
    }
  });

  ws.on('close', () => {
    plc.removeRefs(mySubs);
  });
});

plc.on('status', (s) => {
  const payload = JSON.stringify({ type: 'status', connected: s.connected, message: s.message });
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(payload);
  });
});

plc.on('data', (values) => {
  const payload = JSON.stringify({ type: 'data', values });
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(payload);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`FUXA-mini dang chay tai http://localhost:${PORT}`);
});
