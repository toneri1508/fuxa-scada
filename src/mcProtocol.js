'use strict';
/**
 * Mitsubishi MC Protocol - 3E Frame, Binary code, over TCP/IP.
 * Chi ho tro dung nhung gi can thiet cho SCADA don gian:
 *  - Doc/ghi hang loat thanh ghi tu (word devices): D, W, R
 *  - Doc/ghi bit (bit devices): M, L, X, Y, B  -- doc bang "word units"
 *    (16 diem bit / 1 tu) de tranh format dong goi nibble phuc tap cua
 *    lenh doc bit thuan tuy, ghi bang "bit units" cho tung diem le.
 *
 * Tham khao cau truc khung (frame) 3E Binary theo tai lieu MELSEC
 * Communication Protocol Reference Manual (QnA compatible 3E frame).
 */

// Bang ma thiet bi (device code) dang Binary, cung voi he so dia chi
// (hex = dia chi nhap theo he 16, dec = dia chi nhap theo he 10)
const DEVICES = {
  D: { code: 0xA8, kind: 'word', radix: 10, label: 'D - Data Register' },
  W: { code: 0xB4, kind: 'word', radix: 16, label: 'W - Link Register' },
  R: { code: 0xAF, kind: 'word', radix: 10, label: 'R - File Register' },
  M: { code: 0x90, kind: 'bit', radix: 10, label: 'M - Internal Relay' },
  L: { code: 0x92, kind: 'bit', radix: 10, label: 'L - Latch Relay' },
  B: { code: 0xA0, kind: 'bit', radix: 16, label: 'B - Link Relay' },
  X: { code: 0x9C, kind: 'bit', radix: 16, label: 'X - Input' },
  Y: { code: 0x9D, kind: 'bit', radix: 16, label: 'Y - Output' },
};

function deviceInfo(deviceLetter) {
  const d = DEVICES[deviceLetter];
  if (!d) throw new Error(`Thiet bi khong ho tro: ${deviceLetter}`);
  return d;
}

function parseAddress(deviceLetter, addressStr) {
  const d = deviceInfo(deviceLetter);
  const n = parseInt(String(addressStr).trim(), d.radix);
  if (Number.isNaN(n) || n < 0) {
    throw new Error(`Dia chi khong hop le: ${deviceLetter}${addressStr}`);
  }
  return n;
}

// ---- Frame header (chung cho request) ----
function buildHeader(dataLength, monitoringTimer) {
  const buf = Buffer.alloc(9);
  buf.writeUInt8(0x50, 0); // subheader
  buf.writeUInt8(0x00, 1);
  buf.writeUInt8(0x00, 2); // network no
  buf.writeUInt8(0xff, 3); // PC no
  buf.writeUInt16LE(0x03ff, 4); // request dest module I/O no
  buf.writeUInt8(0x00, 6); // request dest module station no
  buf.writeUInt16LE(dataLength, 7); // length of what follows (timer + command data)
  return buf;
}

function buildDeviceField(deviceLetter, headAddress) {
  const info = deviceInfo(deviceLetter);
  const buf = Buffer.alloc(4);
  buf.writeUIntLE(headAddress & 0xffffff, 0, 3); // head device no, 3 bytes LE
  buf.writeUInt8(info.code, 3); // device code
  return buf;
}

/**
 * Doc hang loat theo "word units" (tu) - dung cho word device,
 * hoac cho bit device khi doc theo tu (16 diem/tu).
 */
function buildReadWordsRequest(deviceLetter, headAddress, pointCount, monitoringTimer = 4) {
  const devField = buildDeviceField(deviceLetter, headAddress);
  const points = Buffer.alloc(2);
  points.writeUInt16LE(pointCount, 0);

  const timer = Buffer.alloc(2);
  timer.writeUInt16LE(monitoringTimer, 0);

  const command = Buffer.concat([
    Buffer.from([0x01, 0x04]), // 0x0401 LE
    Buffer.from([0x00, 0x00]), // subcommand word units
    devField,
    points,
  ]);

  const dataLength = 2 /*timer*/ + command.length;
  const header = buildHeader(dataLength, monitoringTimer);
  return Buffer.concat([header, timer, command]);
}

/**
 * Ghi hang loat theo "word units".
 * values: mang cac so nguyen 16-bit (co the am, se duoc ep ve unsigned 16-bit khi ghi len day).
 */
function buildWriteWordsRequest(deviceLetter, headAddress, values, monitoringTimer = 4) {
  const devField = buildDeviceField(deviceLetter, headAddress);
  const points = Buffer.alloc(2);
  points.writeUInt16LE(values.length, 0);

  const valuesBuf = Buffer.alloc(values.length * 2);
  values.forEach((v, i) => valuesBuf.writeUInt16LE(v & 0xffff, i * 2));

  const timer = Buffer.alloc(2);
  timer.writeUInt16LE(monitoringTimer, 0);

  const command = Buffer.concat([
    Buffer.from([0x01, 0x14]), // 0x1401 LE - batch write
    Buffer.from([0x00, 0x00]), // subcommand word units
    devField,
    points,
    valuesBuf,
  ]);

  const dataLength = 2 + command.length;
  const header = buildHeader(dataLength, monitoringTimer);
  return Buffer.concat([header, timer, command]);
}

/**
 * Ghi 1 diem bit ("bit units"). value: 0 hoac 1.
 */
function buildWriteBitRequest(deviceLetter, address, value, monitoringTimer = 4) {
  const devField = buildDeviceField(deviceLetter, address);
  const points = Buffer.alloc(2);
  points.writeUInt16LE(1, 0);

  const valByte = Buffer.from([value ? 0x10 : 0x00]);

  const timer = Buffer.alloc(2);
  timer.writeUInt16LE(monitoringTimer, 0);

  const command = Buffer.concat([
    Buffer.from([0x01, 0x14]), // batch write
    Buffer.from([0x01, 0x00]), // subcommand bit units
    devField,
    points,
    valByte,
  ]);

  const dataLength = 2 + command.length;
  const header = buildHeader(dataLength, monitoringTimer);
  return Buffer.concat([header, timer, command]);
}

/**
 * Tim do dai toan bo response dua tren 7 byte dau (neu da co du).
 * Tra ve null neu chua du du lieu de xac dinh.
 */
function peekResponseTotalLength(buf) {
  if (buf.length < 9) return null;
  const dataLen = buf.readUInt16LE(7);
  return 9 + dataLen; // 7 header + 2(len field da tinh vao header) ... xem parseResponse
}

/**
 * Phan tich 1 response day du (Buffer co do dai dung bang peekResponseTotalLength).
 * Tra ve { endCode, data(Buffer) }
 */
function parseResponse(buf) {
  // subheader(2) network(1) pc(1) io(2) station(1) = 7 bytes, roi den length(2)
  const dataLen = buf.readUInt16LE(7); // = endcode(2) + payload
  const endCode = buf.readUInt16LE(9);
  const data = buf.slice(11, 9 + dataLen);
  return { endCode, data };
}

module.exports = {
  DEVICES,
  deviceInfo,
  parseAddress,
  buildReadWordsRequest,
  buildWriteWordsRequest,
  buildWriteBitRequest,
  peekResponseTotalLength,
  parseResponse,
};
