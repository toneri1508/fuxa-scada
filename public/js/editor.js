'use strict';

const Editor = (() => {
  const params = new URLSearchParams(location.search);
  let projectName = params.get('project') || '';
  const isNew = params.get('new') === '1';

  const canvas = document.getElementById('canvas');
  const propsBody = document.getElementById('propsBody');
  document.getElementById('projName').value = projectName;

  let widgets = [];
  let selectedId = null;
  let idCounter = 1;

  const DEFAULTS = {
    lamp: { w: 60, h: 60, props: { device: 'M', address: '0', onColor: '#2ecc71', offColor: '#555555', label: 'Lamp' } },
    button: { w: 110, h: 40, props: { device: 'M', address: '0', mode: 'momentary', text: 'NUT' } },
    'numeric-display': { w: 120, h: 44, props: { device: 'D', address: '0', decimals: 0, unit: '', label: 'Gia tri' } },
    'numeric-input': { w: 140, h: 70, props: { device: 'D', address: '0', min: 0, max: 9999, label: 'Set point' } },
    label: { w: 140, h: 30, props: { text: 'Nhan chu', fontSize: 14, color: '#e6e9ef' } },
    rect: { w: 160, h: 100, props: { fill: '#2b3342', stroke: '#3c4759' } },
  };

  const DEVICE_OPTIONS = ['D', 'W', 'R', 'M', 'L', 'B', 'X', 'Y'];

  function newId() { return 'w' + (idCounter++) + '_' + Date.now().toString(36); }

  function addWidget(type) {
    const def = DEFAULTS[type];
    const widget = {
      id: newId(),
      type,
      x: 40, y: 40,
      w: def.w, h: def.h,
      props: JSON.parse(JSON.stringify(def.props)),
    };
    widgets.push(widget);
    renderAll();
    selectWidget(widget.id);
  }

  function widgetContent(widget) {
    switch (widget.type) {
      case 'lamp':
        return '';
      case 'button':
        return `<span>${escapeHtml(widget.props.text)}</span>`;
      case 'numeric-display':
        return `<span>${escapeHtml(widget.props.label || '')} <b>0.0</b> ${escapeHtml(widget.props.unit || '')}</span>`;
      case 'numeric-input':
        return `<div style="font-size:11px;color:#aab2c0">${escapeHtml(widget.props.label || '')}</div><input disabled placeholder="0"><button disabled style="font-size:11px">Ghi</button>`;
      case 'label':
        return `<span style="font-size:${widget.props.fontSize}px;color:${widget.props.color}">${escapeHtml(widget.props.text)}</span>`;
      case 'rect':
        return '';
      default:
        return '';
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderAll() {
    canvas.innerHTML = '';
    widgets.forEach((w) => canvas.appendChild(buildWidgetEl(w)));
  }

  function buildWidgetEl(widget) {
    const el = document.createElement('div');
    el.className = 'widget w-' + widget.type + (widget.id === selectedId ? ' selected' : '');
    el.style.left = widget.x + 'px';
    el.style.top = widget.y + 'px';
    el.style.width = widget.w + 'px';
    el.style.height = widget.h + 'px';
    if (widget.type === 'lamp') el.style.background = widget.props.offColor;
    if (widget.type === 'rect') { el.style.background = widget.props.fill; el.style.borderColor = widget.props.stroke; }
    el.dataset.id = widget.id;
    el.innerHTML = widgetContent(widget);

    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    el.appendChild(handle);

    el.addEventListener('mousedown', (e) => {
      if (e.target === handle) { startResize(e, widget, el); return; }
      selectWidget(widget.id);
      startDrag(e, widget, el);
    });

    return el;
  }

  function startDrag(e, widget, el) {
    e.preventDefault();
    const startMouseX = e.clientX, startMouseY = e.clientY;
    const startX = widget.x, startY = widget.y;
    function onMove(ev) {
      const dx = ev.clientX - startMouseX;
      const dy = ev.clientY - startMouseY;
      widget.x = Math.max(0, startX + dx);
      widget.y = Math.max(0, startY + dy);
      el.style.left = widget.x + 'px';
      el.style.top = widget.y + 'px';
      if (selectedId === widget.id) updateXYFields(widget);
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function startResize(e, widget, el) {
    e.preventDefault();
    e.stopPropagation();
    const startMouseX = e.clientX, startMouseY = e.clientY;
    const startW = widget.w, startH = widget.h;
    function onMove(ev) {
      const dx = ev.clientX - startMouseX;
      const dy = ev.clientY - startMouseY;
      widget.w = Math.max(20, startW + dx);
      widget.h = Math.max(20, startH + dy);
      el.style.width = widget.w + 'px';
      el.style.height = widget.h + 'px';
      if (selectedId === widget.id) updateXYFields(widget);
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function updateXYFields(widget) {
    const xEl = document.getElementById('p_x');
    const yEl = document.getElementById('p_y');
    const wEl = document.getElementById('p_w');
    const hEl = document.getElementById('p_h');
    if (xEl) xEl.value = Math.round(widget.x);
    if (yEl) yEl.value = Math.round(widget.y);
    if (wEl) wEl.value = Math.round(widget.w);
    if (hEl) hEl.value = Math.round(widget.h);
  }

  function selectWidget(id) {
    selectedId = id;
    document.querySelectorAll('.widget').forEach((el) => {
      el.classList.toggle('selected', el.dataset.id === id);
    });
    buildPropsPanel();
  }

  function deleteSelected() {
    if (!selectedId) return;
    widgets = widgets.filter((w) => w.id !== selectedId);
    selectedId = null;
    renderAll();
    buildPropsPanel();
  }

  function deviceSelectHtml(id, current) {
    return `<select id="${id}">${DEVICE_OPTIONS.map((d) => `<option value="${d}" ${d === current ? 'selected' : ''}>${d}</option>`).join('')}</select>`;
  }

  function buildPropsPanel() {
    const widget = widgets.find((w) => w.id === selectedId);
    if (!widget) {
      propsBody.innerHTML = '<div style="color:#aab2c0;font-size:13px">Chon 1 widget de sua thuoc tinh.</div>';
      return;
    }
    let html = `
      <div class="field"><label>Loai</label><input value="${widget.type}" disabled></div>
      <div class="row2">
        <div class="field"><label>X</label><input id="p_x" type="number" value="${Math.round(widget.x)}"></div>
        <div class="field"><label>Y</label><input id="p_y" type="number" value="${Math.round(widget.y)}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Rong</label><input id="p_w" type="number" value="${Math.round(widget.w)}"></div>
        <div class="field"><label>Cao</label><input id="p_h" type="number" value="${Math.round(widget.h)}"></div>
      </div>
      <hr style="border-color:#2b3342">
    `;

    const p = widget.props;
    switch (widget.type) {
      case 'lamp':
        html += `
          <div class="field"><label>Nhan (label)</label><input id="p_label" value="${escapeHtml(p.label)}"></div>
          <div class="row2">
            <div class="field"><label>Thiet bi</label>${deviceSelectHtml('p_device', p.device)}</div>
            <div class="field"><label>Dia chi</label><input id="p_address" value="${escapeHtml(p.address)}"></div>
          </div>
          <div class="row2">
            <div class="field"><label>Mau ON</label><input id="p_onColor" type="color" value="${p.onColor}"></div>
            <div class="field"><label>Mau OFF</label><input id="p_offColor" type="color" value="${p.offColor}"></div>
          </div>`;
        break;
      case 'button':
        html += `
          <div class="field"><label>Nhan nut</label><input id="p_text" value="${escapeHtml(p.text)}"></div>
          <div class="row2">
            <div class="field"><label>Thiet bi</label>${deviceSelectHtml('p_device', p.device)}</div>
            <div class="field"><label>Dia chi</label><input id="p_address" value="${escapeHtml(p.address)}"></div>
          </div>
          <div class="field"><label>Kieu nhan</label>
            <select id="p_mode">
              <option value="momentary" ${p.mode === 'momentary' ? 'selected' : ''}>Giu (Momentary) - nha ra tu tat</option>
              <option value="toggle" ${p.mode === 'toggle' ? 'selected' : ''}>Dao trang thai (Toggle)</option>
            </select>
          </div>`;
        break;
      case 'numeric-display':
        html += `
          <div class="field"><label>Nhan</label><input id="p_label" value="${escapeHtml(p.label)}"></div>
          <div class="row2">
            <div class="field"><label>Thiet bi</label>${deviceSelectHtml('p_device', p.device)}</div>
            <div class="field"><label>Dia chi</label><input id="p_address" value="${escapeHtml(p.address)}"></div>
          </div>
          <div class="row2">
            <div class="field"><label>So le</label><input id="p_decimals" type="number" min="0" max="4" value="${p.decimals}"></div>
            <div class="field"><label>Don vi</label><input id="p_unit" value="${escapeHtml(p.unit)}"></div>
          </div>`;
        break;
      case 'numeric-input':
        html += `
          <div class="field"><label>Nhan</label><input id="p_label" value="${escapeHtml(p.label)}"></div>
          <div class="row2">
            <div class="field"><label>Thiet bi</label>${deviceSelectHtml('p_device', p.device)}</div>
            <div class="field"><label>Dia chi</label><input id="p_address" value="${escapeHtml(p.address)}"></div>
          </div>
          <div class="row2">
            <div class="field"><label>Min</label><input id="p_min" type="number" value="${p.min}"></div>
            <div class="field"><label>Max</label><input id="p_max" type="number" value="${p.max}"></div>
          </div>`;
        break;
      case 'label':
        html += `
          <div class="field"><label>Noi dung</label><input id="p_text" value="${escapeHtml(p.text)}"></div>
          <div class="row2">
            <div class="field"><label>Co chu</label><input id="p_fontSize" type="number" value="${p.fontSize}"></div>
            <div class="field"><label>Mau chu</label><input id="p_color" type="color" value="${p.color}"></div>
          </div>`;
        break;
      case 'rect':
        html += `
          <div class="row2">
            <div class="field"><label>Mau nen</label><input id="p_fill" type="color" value="${p.fill}"></div>
            <div class="field"><label>Vien</label><input id="p_stroke" type="color" value="${p.stroke}"></div>
          </div>`;
        break;
    }

    html += `<div class="actions" style="margin-top:14px"><button class="danger" onclick="Editor.deleteSelected()" style="width:100%">Xoa widget</button></div>`;
    propsBody.innerHTML = html;

    // gan su kien cho tat ca truong props
    const bind = (id, key, isNumber) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        const val = isNumber ? Number(el.value) : el.value;
        if (['x', 'y', 'w', 'h'].includes(key)) widget[key] = val;
        else widget.props[key] = val;
        rerenderWidget(widget);
      });
      el.addEventListener('change', () => {
        const val = isNumber ? Number(el.value) : el.value;
        if (['x', 'y', 'w', 'h'].includes(key)) widget[key] = val;
        else widget.props[key] = val;
        rerenderWidget(widget);
      });
    };
    bind('p_x', 'x', true);
    bind('p_y', 'y', true);
    bind('p_w', 'w', true);
    bind('p_h', 'h', true);
    bind('p_label', 'label');
    bind('p_text', 'text');
    bind('p_device', 'device');
    bind('p_address', 'address');
    bind('p_onColor', 'onColor');
    bind('p_offColor', 'offColor');
    bind('p_mode', 'mode');
    bind('p_decimals', 'decimals', true);
    bind('p_unit', 'unit');
    bind('p_min', 'min', true);
    bind('p_max', 'max', true);
    bind('p_fontSize', 'fontSize', true);
    bind('p_color', 'color');
    bind('p_fill', 'fill');
    bind('p_stroke', 'stroke');
  }

  function rerenderWidget(widget) {
    const el = canvas.querySelector(`.widget[data-id="${widget.id}"]`);
    if (!el) return;
    const newEl = buildWidgetEl(widget);
    canvas.replaceChild(newEl, el);
  }

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && document.activeElement.tagName !== 'INPUT') {
      deleteSelected();
    }
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.target === canvas) selectWidget(null);
  });

  // ---- Save / Load ----
  async function save() {
    projectName = document.getElementById('projName').value.trim();
    if (!projectName) { alert('Nhap ten man hinh truoc khi luu'); return; }
    const data = { width: 1200, height: 800, widgets };
    const res = await fetch('/api/projects/' + encodeURIComponent(projectName), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    const j = await res.json();
    if (j.ok) {
      history.replaceState(null, '', 'editor.html?project=' + encodeURIComponent(projectName));
      flashSaved();
    } else {
      alert('Loi luu: ' + j.error);
    }
  }

  function flashSaved() {
    const btns = document.querySelectorAll('.topbar button.primary');
    btns.forEach((b) => { const old = b.textContent; b.textContent = 'Da luu \u2713'; setTimeout(() => (b.textContent = old), 1000); });
  }

  async function load(name) {
    try {
      const data = await fetch('/api/projects/' + encodeURIComponent(name)).then((r) => {
        if (!r.ok) throw new Error('not found');
        return r.json();
      });
      widgets = data.widgets || [];
      renderAll();
    } catch (e) {
      // project moi, chua co file -> bat dau trong
      widgets = [];
      renderAll();
    }
  }

  async function runNow() {
    await save();
    window.open('runtime.html?project=' + encodeURIComponent(projectName), '_blank');
  }

  // ---- PLC settings modal ----
  async function openSettings() {
    const s = await fetch('/api/config').then((r) => r.json());
    document.getElementById('cfgHost').value = s.config.host;
    document.getElementById('cfgPort').value = s.config.port;
    document.getElementById('cfgTimeout').value = s.config.timeoutMs;
    document.getElementById('cfgPoll').value = s.pollIntervalMs;
    document.getElementById('settingsModal').style.display = 'flex';
  }
  async function saveSettings() {
    const body = {
      host: document.getElementById('cfgHost').value.trim(),
      port: parseInt(document.getElementById('cfgPort').value, 10),
      timeoutMs: parseInt(document.getElementById('cfgTimeout').value, 10),
      pollIntervalMs: parseInt(document.getElementById('cfgPoll').value, 10),
    };
    await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    document.getElementById('settingsModal').style.display = 'none';
  }

  // ---- status ws (chi de hien thi trang thai ket noi PLC) ----
  function connectStatusWs() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'status') {
        const dot = document.getElementById('statusDot');
        const text = document.getElementById('statusText');
        dot.className = 'status-dot ' + (msg.connected ? 'on' : 'off');
        text.textContent = msg.connected ? 'Da ket noi PLC' : 'Mat ket noi PLC';
      }
    };
    ws.onclose = () => setTimeout(connectStatusWs, 2000);
  }
  connectStatusWs();

  if (projectName && !isNew) load(projectName);

  return { addWidget, selectWidget, deleteSelected, save, runNow, openSettings, saveSettings };
})();
