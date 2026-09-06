'use strict';
const net = require('net');
const EventEmitter = require('events');
const mc = require('./mcProtocol');

/**
 * PlcClient: giu 1 ket noi TCP toi PLC Mitsubishi, tu dong ket noi lai
 * khi mat ket noi (stable connection la yeu cau chinh), va xu ly cac
 * request theo hang doi tuan tu (MC protocol la request/response don gian,
 * khong the gui chong len nhau tren cung 1 socket).
 *
 * Events: 'status' ({connected, message}), 'error' (Error)
 */
class PlcClient extends EventEmitter {
  constructor(config) {
    super();
    this.config = Object.assign(
      {
        host: '192.168.3.39',
        port: 5007,
        timeoutMs: 3000,
        reconnectDelayMs: 3000,
        monitoringTimer: 4, // *250ms phia PLC = 1s
      },
      config
    );
    this.socket = null;
    this.connected = false;
    this.connecting = false;
    this.destroyed = false;
    this.queue = []; // { requestBuf, resolve, reject, timer }
    this.busy = false;
    this.rxBuffer = Buffer.alloc(0);
    this.reconnectTimer = null;
  }

  updateConfig(partial) {
    Object.assign(this.config, partial);
    this.reconnect();
  }

  start() {
    this.destroyed = false;
    this._connect();
  }

  stop() {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) this.socket.destroy();
    this._rejectAll(new Error('PLC client stopped'));
  }

  reconnect() {
    if (this.socket) {
      this.socket.destroy();
    } else {
      this._connect();
    }
  }

  _connect() {
    if (this.destroyed || this.connecting) return;
    this.connecting = true;
    const socket = new net.Socket();
    this.socket = socket;
    socket.setNoDelay(true);

    const onFail = (msg) => {
      this.connecting = false;
      this.connected = false;
      socket.destroy();
      this.emit('status', { connected: false, message: msg });
      this._rejectAll(new Error(msg));
      this._scheduleReconnect();
    };

    socket.setTimeout(this.config.timeoutMs);
    socket.once('timeout', () => onFail('Timeout khi ket noi PLC'));
    socket.once('error', (err) => onFail('Loi ket noi: ' + err.message));
    socket.once('close', () => {
      if (this.connected) {
        this.connected = false;
        this.emit('status', { connected: false, message: 'Mat ket noi PLC' });
        this._rejectAll(new Error('Mat ket noi PLC'));
        this._scheduleReconnect();
      }
    });

    socket.connect(this.config.port, this.config.host, () => {
      this.connecting = false;
      this.connected = true;
      socket.setTimeout(0);
      this.rxBuffer = Buffer.alloc(0);
      this.emit('status', { connected: true, message: 'Da ket noi PLC' });
      this._pump();
    });

    socket.on('data', (chunk) => {
      this.rxBuffer = Buffer.concat([this.rxBuffer, chunk]);
      this._tryParse();
    });
  }

  _scheduleReconnect() {
    if (this.destroyed) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._connect();
    }, this.config.reconnectDelayMs);
  }

  _rejectAll(err) {
    const pending = this.queue.splice(0, this.queue.length);
    pending.forEach((item) => {
      clearTimeout(item.timer);
      item.reject(err);
    });
    this.busy = false;
  }

  _tryParse() {
    while (true) {
      const total = mc.peekResponseTotalLength(this.rxBuffer);
      if (total === null || this.rxBuffer.length < total) return;
      const frame = this.rxBuffer.slice(0, total);
      this.rxBuffer = this.rxBuffer.slice(total);
      const current = this.queue.shift();
      this.busy = false;
      if (current) {
        clearTimeout(current.timer);
        try {
          const parsed = mc.parseResponse(frame);
          current.resolve(parsed);
        } catch (e) {
          current.reject(e);
        }
      }
      this._pump();
    }
  }

  _pump() {
    if (this.busy || !this.connected || this.queue.length === 0) return;
    const item = this.queue[0];
    this.busy = true;
    item.timer = setTimeout(() => {
      // Request bi timeout: coi nhu mat ket noi de kich hoat reconnect
      this.socket && this.socket.destroy();
    }, this.config.timeoutMs);
    this.socket.write(item.requestBuf);
  }

  /** Gui 1 request buffer, tra ve Promise<{endCode, data}> */
  sendRequest(requestBuf) {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('Chua ket noi PLC'));
        return;
      }
      this.queue.push({ requestBuf, resolve, reject, timer: null });
      this._pump();
    });
  }

  async readWords(deviceLetter, headAddress, pointCount) {
    const req = mc.buildReadWordsRequest(deviceLetter, headAddress, pointCount, this.config.monitoringTimer);
    const { endCode, data } = await this.sendRequest(req);
    if (endCode !== 0) throw new Error(`PLC tra ve loi code=0x${endCode.toString(16)}`);
    const values = [];
    for (let i = 0; i < pointCount; i++) {
      values.push(data.readUInt16LE(i * 2));
    }
    return values;
  }

  async writeWords(deviceLetter, headAddress, values) {
    const req = mc.buildWriteWordsRequest(deviceLetter, headAddress, values, this.config.monitoringTimer);
    const { endCode } = await this.sendRequest(req);
    if (endCode !== 0) throw new Error(`PLC tu choi ghi, code=0x${endCode.toString(16)}`);
  }

  async writeBit(deviceLetter, address, value) {
    const req = mc.buildWriteBitRequest(deviceLetter, address, value, this.config.monitoringTimer);
    const { endCode } = await this.sendRequest(req);
    if (endCode !== 0) throw new Error(`PLC tu choi ghi, code=0x${endCode.toString(16)}`);
  }
}

module.exports = PlcClient;
