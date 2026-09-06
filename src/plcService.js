'use strict';
const EventEmitter = require('events');
const PlcClient = require('./plcClient');
const mc = require('./mcProtocol');

const MAX_WORDS_PER_REQUEST = 900; // an toan duoi gioi han spec (~960 points)

function tagKey(device, address) {
  return `${device}:${address}`;
}

class PlcService extends EventEmitter {
  constructor(config) {
    super();
    this.client = new PlcClient(config);
    this.pollIntervalMs = (config && config.pollIntervalMs) || 500;
    this.tags = new Map(); // key -> { device, address, kind, refCount, value, quality }
    this.connected = false;
    this.pollTimer = null;
    this.polling = false;

    this.client.on('status', (s) => {
      this.connected = s.connected;
      this.emit('status', s);
    });
  }

  start() {
    this.client.start();
    this._loop();
  }

  stop() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.client.stop();
  }

  updateConfig(partial) {
    if (partial.pollIntervalMs) this.pollIntervalMs = partial.pollIntervalMs;
    this.client.updateConfig(partial);
  }

  getStatus() {
    return { connected: this.connected, config: this.client.config, pollIntervalMs: this.pollIntervalMs };
  }

  /** them tham chieu cho 1 danh sach tag {device,address} */
  addRefs(tagList) {
    tagList.forEach(({ device, address }) => {
      const info = mc.deviceInfo(device);
      const addr = mc.parseAddress(device, address);
      const key = tagKey(device, addr);
      let t = this.tags.get(key);
      if (!t) {
        t = { device, address: addr, addressStr: String(address), kind: info.kind, refCount: 0, value: null, quality: 'bad' };
        this.tags.set(key, t);
      }
      t.refCount++;
    });
  }

  /** giam tham chieu, xoa tag khi khong con ai dung */
  removeRefs(tagList) {
    tagList.forEach(({ device, address }) => {
      let addr;
      try {
        addr = mc.parseAddress(device, address);
      } catch (e) {
        return;
      }
      const key = tagKey(device, addr);
      const t = this.tags.get(key);
      if (!t) return;
      t.refCount--;
      if (t.refCount <= 0) this.tags.delete(key);
    });
  }

  async writeTag(device, address, dataType, value) {
    const info = mc.deviceInfo(device);
    const addr = mc.parseAddress(device, address);
    if (info.kind === 'bit') {
      await this.client.writeBit(device, addr, value ? 1 : 0);
    } else {
      const v = Math.trunc(Number(value)) & 0xffff;
      await this.client.writeWords(device, addr, [v]);
    }
    // cap nhat cache ngay, khong doi vong quet tiep theo
    const key = tagKey(device, addr);
    const t = this.tags.get(key);
    if (t) {
      t.value = info.kind === 'bit' ? (value ? 1 : 0) : Math.trunc(Number(value));
      t.quality = 'good';
      this.emit('data', { [`${device}${t.addressStr}`]: t.value });
    }
  }

  _loop() {
    this.pollTimer = setTimeout(async () => {
      try {
        await this._pollOnce();
      } catch (e) {
        // loi doc le, bo qua vong nay, PlcClient tu lo reconnect neu can
      }
      this._loop();
    }, this.pollIntervalMs);
  }

  async _pollOnce() {
    if (!this.connected || this.tags.size === 0 || this.polling) return;
    this.polling = true;
    try {
      const changed = {};

      // gom theo device letter
      const byDevice = new Map();
      for (const t of this.tags.values()) {
        if (!byDevice.has(t.device)) byDevice.set(t.device, []);
        byDevice.get(t.device).push(t);
      }

      for (const [device, tagsOfDevice] of byDevice) {
        const info = mc.deviceInfo(device);
        if (info.kind === 'word') {
          await this._pollWordGroup(device, tagsOfDevice, changed);
        } else {
          await this._pollBitGroup(device, tagsOfDevice, changed);
        }
      }

      if (Object.keys(changed).length > 0) this.emit('data', changed);
    } finally {
      this.polling = false;
    }
  }

  async _pollWordGroup(device, tagsOfDevice, changed) {
    const addrs = tagsOfDevice.map((t) => t.address);
    const min = Math.min(...addrs);
    const max = Math.max(...addrs);
    const span = max - min + 1;
    if (span > MAX_WORDS_PER_REQUEST) {
      // qua rong: doc tung tag rieng le de tranh vuot gioi han khung
      for (const t of tagsOfDevice) {
        try {
          const [v] = await this.client.readWords(device, t.address, 1);
          this._applyValue(t, v, changed);
        } catch (e) {
          t.quality = 'bad';
        }
      }
      return;
    }
    try {
      const values = await this.client.readWords(device, min, span);
      tagsOfDevice.forEach((t) => {
        const v = values[t.address - min];
        this._applyValue(t, v, changed);
      });
    } catch (e) {
      tagsOfDevice.forEach((t) => (t.quality = 'bad'));
    }
  }

  async _pollBitGroup(device, tagsOfDevice, changed) {
    // Doc bit device thong qua "word units": 16 diem bit / tu.
    const addrs = tagsOfDevice.map((t) => t.address);
    const min = Math.min(...addrs);
    const max = Math.max(...addrs);
    const alignedHead = Math.floor(min / 16) * 16;
    const alignedTailWordIndex = Math.floor(max / 16);
    const wordCount = alignedTailWordIndex - alignedHead / 16 + 1;

    if (wordCount > MAX_WORDS_PER_REQUEST) {
      for (const t of tagsOfDevice) {
        const wordHead = Math.floor(t.address / 16) * 16;
        try {
          const [w] = await this.client.readWords(device, wordHead, 1);
          const bitIndex = t.address - wordHead;
          const v = (w >> bitIndex) & 1;
          this._applyValue(t, v, changed);
        } catch (e) {
          t.quality = 'bad';
        }
      }
      return;
    }

    try {
      const words = await this.client.readWords(device, alignedHead, wordCount);
      tagsOfDevice.forEach((t) => {
        const wordIdx = Math.floor(t.address / 16) - alignedHead / 16;
        const bitIndex = t.address % 16;
        const v = (words[wordIdx] >> bitIndex) & 1;
        this._applyValue(t, v, changed);
      });
    } catch (e) {
      tagsOfDevice.forEach((t) => (t.quality = 'bad'));
    }
  }

  _applyValue(t, value, changed) {
    t.quality = 'good';
    if (t.value !== value) {
      t.value = value;
      changed[`${t.device}${t.addressStr}`] = value;
    }
  }
}

module.exports = PlcService;
