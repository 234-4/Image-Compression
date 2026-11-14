// ImgCompressor.shop - bulk image compression (runs in the browser, nothing is uploaded)
(() => {
  const $ = (id) => document.getElementById(id);
  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_FILES = 20;

  const fileInput = $('bulkInput');
  const dropZone = $('bulkDrop');
  const rangeEl = $('bulkRange');
  const rangeVal = $('bulkRangeValue');
  const compressBtn = $('bulkCompressBtn');
  const clearBtn = $('bulkClearBtn');
  const zipBtn = $('bulkZipBtn');
  const statusEl = $('bulkStatus');
  const progressWrap = $('bulkProgressWrap');
  const progressBar = $('bulkProgress');
  const listWrap = $('bulkListWrap');
  const listBody = $('bulkList');
  const summaryEl = $('bulkSummary');

  let items = [];          // { id, file, row, cells, result, url, name, error }
  let busy = false;
  let nextId = 1;
  let zipUrl = null;

  const say = (msg) => { statusEl.textContent = msg || ''; };

  function formatFileSize(bytes) {
    if (!bytes) return '0 Bytes';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // ---------- adding files ----------
  function addFiles(fileList) {
    if (busy) { say('Please wait until the current batch has finished.'); return; }
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;

    let skipped = 0, overLimit = 0;
    for (const file of incoming) {
      if (!ALLOWED.includes(file.type)) { skipped++; continue; }
      if (items.length >= MAX_FILES) { overLimit++; continue; }
      addItem(file);
    }
    const notes = [];
    if (skipped) notes.push(skipped + ' file' + (skipped > 1 ? 's' : '') + ' skipped (only JPG, PNG and WebP are supported).');
    if (overLimit) notes.push('Only ' + MAX_FILES + ' images can be added at once. ' + overLimit + ' not added.');
    say(notes.join(' '));
    refreshUI();
  }

  function addItem(file) {
    const tr = document.createElement('tr');
    const cells = {};
    const make = (key, text) => {
      const td = document.createElement('td');
      td.textContent = text;
      td.dataset.label = key;
      cells[key] = td;
      tr.appendChild(td);
      return td;
    };
    make('name', file.name);
    make('original', formatFileSize(file.size));
    make('new', '-');
    make('saved', '-');
    make('status', 'Ready');
    const actionTd = document.createElement('td');
    cells.action = actionTd;
    tr.appendChild(actionTd);

    const item = { id: nextId++, file, row: tr, cells, result: null, url: null, name: null, error: null };
    items.push(item);
    listBody.appendChild(tr);
  }

  function refreshUI() {
    const has = items.length > 0;
    listWrap.hidden = !has;
    clearBtn.hidden = !has;
    compressBtn.disabled = !has || busy;
    zipBtn.hidden = !items.some((i) => i.result);
    updateSummary();
  }

  function updateSummary() {
    const done = items.filter((i) => i.result);
    if (!done.length) { summaryEl.textContent = ''; return; }
    const before = done.reduce((s, i) => s + i.file.size, 0);
    const after = done.reduce((s, i) => s + i.result.size, 0);
    const pct = before ? Math.max(0, ((before - after) / before) * 100).toFixed(1) : '0.0';
    summaryEl.textContent = done.length + ' of ' + items.length + ' done. Total: ' +
      formatFileSize(before) + ' to ' + formatFileSize(after) + ' (' + pct + '% smaller).';
  }

  // ---------- compression (same approach as the single-image tool) ----------
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('read')); };
      img.src = url;
    });
  }

  const tick = () => new Promise((r) => setTimeout(r, 0));

  async function compressOne(file, quality) {
    const img = await loadImage(file);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const outType = file.type;

    let blob;
    if (outType === 'image/png' && window.UPNG && window.pako) {
      await tick();
      const { width, height } = canvas;
      const data = ctx.getImageData(0, 0, width, height).data;
      const colors = quality >= 1 ? 0 : Math.max(16, Math.round(quality * 256));
      const png = UPNG.encode([data.buffer], width, height, colors);
      blob = new Blob([png], { type: 'image/png' });
    } else {
      blob = await new Promise((resolve) => canvas.toBlob(resolve, outType, quality));
    }
    canvas.width = canvas.height = 0; // free memory

    if (!blob) throw new Error('encode');
    const unsupported = blob.type !== outType;           // e.g. a browser that cannot encode WebP
    const keepOriginal = unsupported || blob.size >= file.size;
    return { blob: keepOriginal ? file : blob, kept: keepOriginal, unsupported };
  }

  function uniqueName(base, ext, used) {
    let name = base + '-compressed.' + ext;
    let n = 2;
    while (used.has(name)) { name = base + '-compressed-' + n + '.' + ext; n++; }
    used.add(name);
    return name;
  }

  async function runBatch() {
    if (busy || !items.length) return;
    busy = true;
    say('');
    compressBtn.disabled = true;
    clearBtn.disabled = true;
    zipBtn.hidden = true;
    progressWrap.hidden = false;
    progressBar.value = 0;
    progressBar.max = items.length;
    const quality = rangeEl.value / 100;
    const usedNames = new Set();

    // reset previous results
    for (const it of items) {
      if (it.url) URL.revokeObjectURL(it.url);
      it.url = null; it.result = null; it.error = null; it.name = null;
      it.cells.new.textContent = '-';
      it.cells.saved.textContent = '-';
      it.cells.action.textContent = '';
    }

    let finished = 0;
    for (const it of items) {
      it.cells.status.textContent = 'Compressing...';
      await tick();
      try {
        const r = await compressOne(it.file, quality);
        it.result = r.blob;
        const ext = r.blob.type.split('/')[1].replace('jpeg', 'jpg');
        const base = it.file.name.replace(/\.[^.]+$/, '') || 'image';
        it.name = uniqueName(base, ext, usedNames);
        it.url = URL.createObjectURL(r.blob);
        it.cells.new.textContent = formatFileSize(r.blob.size);
        if (r.unsupported) {
          it.cells.saved.textContent = '0%';
          it.cells.status.textContent = 'Original kept (format not supported by this browser)';
        } else if (r.kept) {
          it.cells.saved.textContent = '0%';
          it.cells.status.textContent = 'Already optimized, original kept';
        } else {
          const pct = ((it.file.size - r.blob.size) / it.file.size) * 100;
          it.cells.saved.textContent = pct.toFixed(1) + '%';
          it.cells.status.textContent = 'Done';
        }
        const a = document.createElement('a');
        a.href = it.url;
        a.download = it.name;
        a.textContent = 'Download';
        a.setAttribute('aria-label', 'Download ' + it.name);
        it.cells.action.appendChild(a);
      } catch (err) {
        it.error = true;
        it.cells.status.textContent = 'Failed. The image may be corrupted or too large.';
      }
      finished++;
      progressBar.value = finished;
      say(finished + ' of ' + items.length + ' processed.');
      updateSummary();
    }

    busy = false;
    clearBtn.disabled = false;
    compressBtn.disabled = false;
    progressWrap.hidden = true;
    say('All done. ' + items.filter((i) => i.result).length + ' of ' + items.length + ' images compressed.');
    refreshUI();
  }

  // ---------- ZIP (no library: simple "stored" zip, images are already compressed) ----------
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function buildZip(files) { // files: [{ name, data: Uint8Array }]
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const parts = [];
    const central = [];
    let offset = 0;

    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const crc = crc32(f.data);
      const size = f.data.length;

      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true);      // UTF-8 names
      lh.setUint16(8, 0, true);           // stored
      lh.setUint16(10, dosTime, true);
      lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, size, true);
      lh.setUint32(22, size, true);
      lh.setUint16(26, nameBytes.length, true);
      lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nameBytes, f.data);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, size, true);
      ch.setUint32(24, size, true);
      ch.setUint16(28, nameBytes.length, true);
      ch.setUint16(30, 0, true);
      ch.setUint16(32, 0, true);
      ch.setUint16(34, 0, true);
      ch.setUint16(36, 0, true);
      ch.setUint32(38, 0, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nameBytes);

      offset += 30 + nameBytes.length + size;
    }

    let centralSize = 0;
    for (const c of central) centralSize += c.length;
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }

  async function downloadZip() {
    const done = items.filter((i) => i.result);
    if (!done.length) return;
    zipBtn.disabled = true;
    say('Preparing ZIP file...');
    try {
      const files = [];
      for (const it of done) {
        files.push({ name: it.name, data: new Uint8Array(await it.result.arrayBuffer()) });
      }
      const blob = buildZip(files);
      if (zipUrl) URL.revokeObjectURL(zipUrl);
      zipUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = zipUrl;
      a.download = 'compressed-images.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      say('ZIP file ready (' + formatFileSize(blob.size) + ').');
    } catch (err) {
      say('Could not create the ZIP file. Try downloading the images one by one.');
    }
    zipBtn.disabled = false;
  }

  // ---------- clear ----------
  function clearAll() {
    if (busy) return;
    for (const it of items) if (it.url) URL.revokeObjectURL(it.url);
    if (zipUrl) { URL.revokeObjectURL(zipUrl); zipUrl = null; }
    items = [];
    listBody.textContent = '';
    fileInput.value = '';
    progressWrap.hidden = true;
    say('');
    refreshUI();
  }

  // ---------- events ----------
  fileInput.addEventListener('change', (e) => { addFiles(e.target.files); fileInput.value = ''; });
  rangeEl.addEventListener('input', () => { rangeVal.textContent = rangeEl.value; });
  compressBtn.addEventListener('click', runBatch);
  clearBtn.addEventListener('click', clearAll);
  zipBtn.addEventListener('click', downloadZip);

  ['dragenter', 'dragover'].forEach((ev) =>
    dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add('is-drag'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove('is-drag'); }));
  dropZone.addEventListener('drop', (e) => addFiles(e.dataTransfer && e.dataTransfer.files));

  refreshUI();

  // ---------- FAQ accordion ----------
  document.querySelectorAll('.faq-question').forEach((button) => {
    button.addEventListener('click', () => {
      const item = button.parentElement;
      const willOpen = !item.classList.contains('active');
      document.querySelectorAll('.faq-item').forEach((i) => i.classList.remove('active'));
      item.classList.toggle('active', willOpen);
    });
  });
})();
