'use strict';

(() => {
  const params = new URLSearchParams(location.search);
  const projectName = params.get('project') || '';
  document.getElementById('projTitle').textContent = projectName;
  document.getElementById('editLink').href = 'editor.html?project=' + encodeURIComponent(projectName);

  const canvas = document.getElementById('canvas');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  let widgets = [];
  let tagValues = {}; // key device+address -> raw value
  const boundByKey = {}; // key -> [ {widget, el} ]
  let ws = null;

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function tagKeyOf(props) {
    return `${props.device}${props.address}`;
  }

  async function loadProject() {
    const res = await fetch('/api/projects/' + encodeURIComponent(projectName));
    if (!res.ok) { canvas.innerHTML = '<p style="color:#e74c3c;padding:20px">Khong tim thay man hinh nay.</p>'; return; }
    const data = await res.json();
    widgets = data.widgets || [];
    renderAll();
    connectWs();
  }

  function renderAll() {
    canvas.innerHTML = '';
    Object.keys(boundByKey).forEach((k) => delete boundByKey[k]);
    widgets.forEach((w) => canvas.appendChild(buildEl(w)));
  }

  function registerBinding(key, widget, el) {
    if (!boundByKey[key]) boundByKey[key] = [];
    boundByKey[key].push({ widget, el });
  }

  function buildEl(widget) {
    const el = document.createElement('div');
    el.className = 'rwidget rw-' + widget.type;
    el.style.left = widget.x + 'px';
    el.style.top = widget.y + 'px';
    el.style.width = widget.w + 'px';
    el.style.height = widget.h + 'px';
    const p = widget.props;

    switch (widget.type) {
      case 'lamp': {
        el.style.background = p.offColor;
        el.title = p.label || '';
        registerBinding(tagKeyOf(p), widget, el);
        break;
      }
      case 'button': {
        el.textContent = p.text;
        if (p.mode === 'momentary') {
          el.addEventListener('mousedown', () => { el.classList.add('pressed'); sendWrite(p, 1); });
          const release = () => { if (el.classList.contains('pressed')) { el.classList.remove('pressed'); sendWrite(p, 0); } };
          el.addEventListener('mouseup', release);
          el.addEventListener('mouseleave', release);
          el.addEventListener('touchstart', (e) => { e.preventDefault(); el.classList.add('pressed'); sendWrite(p, 1); }, { passive: false });
          el.addEventListener('touchend', (e) => { e.preventDefault(); release(); });
        } else {
          el.addEventListener('click', () => {
            const cur = tagValues[tagKeyOf(p)] || 0;
            sendWrite(p, cur ? 0 : 1);
          });
        }
        break;
      }
      case 'numeric-display': {
        el.innerHTML = `<div class="lbl">${escapeHtml(p.label || '')}</div><div class="val">--</div>`;
        registerBinding(tagKeyOf(p), widget, el);
        break;
      }
      case 'numeric-input': {
        el.innerHTML = `
          <div class="lbl">${escapeHtml(p.label || '')}</div>
          <div class="row">
            <input type="number" min="${p.min}" max="${p.max}" step="any">
            <button>Ghi</button>
          </div>`;
        const input = el.querySelector('input');
        const btn = el.querySelector('button');
        btn.addEventListener('click', () => {
          let v = Number(input.value);
          if (Number.isNaN(v)) return;
          if (v < p.min) v = p.min;
          if (v > p.max) v = p.max;
          input.value = v;
          sendWrite(p, v);
        });
        registerBinding(tagKeyOf(p), widget, el);
        break;
      }
      case 'label': {
        el.textContent = p.text;
        el.style.fontSize = p.fontSize + 'px';
        el.style.color = p.color;
        break;
      }
      case 'rect': {
        el.style.background = p.fill;
        el.style.borderColor = p.stroke;
        break;
      }
    }
    return el;
  }

  function refreshBinding(key) {
    const list = boundByKey[key];
    if (!list) return;
    const raw = tagValues[key];
    list.forEach(({ widget, el }) => {
      const p = widget.props;
      if (widget.type === 'lamp') {
        el.style.background = raw ? p.onColor : p.offColor;
      } else if (widget.type === 'numeric-display') {
        const valEl = el.querySelector('.val');
        if (raw == null) { valEl.textContent = '--'; return; }
        const dec = Number(p.decimals) || 0;
        const scaled = dec > 0 ? raw / Math.pow(10, dec) : raw;
        valEl.textContent = (dec > 0 ? scaled.toFixed(dec) : String(scaled)) + (p.unit ? ' ' + p.unit : '');
      } else if (widget.type === 'button' && p.mode === 'toggle') {
        el.classList.toggle('pressed', !!raw);
      } else if (widget.type === 'numeric-input') {
        const input = el.querySelector('input');
        if (document.activeElement !== input && raw != null) input.value = raw;
      }
    });
  }

  function sendWrite(p, value) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'write', device: p.device, address: p.address, dataType: null, value }));
  }

  function collectUniqueTags() {
    const map = new Map();
    widgets.forEach((w) => {
      const p = w.props;
      if (p && p.device && (p.address !== undefined && p.address !== '')) {
        if (['lamp', 'button', 'numeric-display', 'numeric-input'].includes(w.type)) {
          map.set(`${p.device}${p.address}`, { device: p.device, address: p.address });
        }
      }
    });
    return Array.from(map.values());
  }

  function connectWs() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);

    ws.onopen = () => {
      const tags = collectUniqueTags();
      ws.send(JSON.stringify({ type: 'subscribe', tags }));
    };

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'status') {
        statusDot.className = 'status-dot ' + (msg.connected ? 'on' : 'off');
        statusText.textContent = msg.connected ? 'Da ket noi PLC' : (msg.message || 'Mat ket noi PLC');
      } else if (msg.type === 'data') {
        Object.entries(msg.values).forEach(([k, v]) => {
          tagValues[k] = v;
          refreshBinding(k);
        });
      } else if (msg.type === 'error') {
        console.warn('PLC error:', msg.message);
      }
    };

    ws.onclose = () => {
      statusDot.className = 'status-dot off';
      statusText.textContent = 'Mat ket noi may chu, dang thu lai...';
      setTimeout(connectWs, 2000);
    };
    ws.onerror = () => ws.close();
  }

  loadProject();
})();
