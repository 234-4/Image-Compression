// ImgCompressor.shop – compress to a target file size, entirely in the browser
(() => {
  const $ = (id) => document.getElementById(id);
  const input = $('imageInput'), kbInput = $('targetKb'), form = $('compressForm'),
        btn = $('compressBtn'), statusEl = $('status'), out = $('result'),
        resImg = $('resultImg'), info = $('resultInfo'), dl = $('downloadBtn');
  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
  const webpOk = document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp');
  let file = null, img = null, srcUrl = null, resUrl = null;

  const say = (m) => { statusEl.textContent = m || ''; };
  const fmt = (b) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(2) + ' MB';

  input.addEventListener('change', (e) => {
    const f = e.target.files[0];
    out.style.display = 'none'; img = null; say('');
    if (!f) return;
    if (!ALLOWED.includes(f.type)) { say('Please choose a JPG, PNG or WebP image.'); return; }
    file = f;
    if (srcUrl) URL.revokeObjectURL(srcUrl);
    srcUrl = URL.createObjectURL(f);
    const i = new Image();
    i.onload = () => { img = i; say(`Loaded ${f.name} (${i.naturalWidth}×${i.naturalHeight}px, ${fmt(f.size)})`); };
    i.onerror = () => say('This image could not be read. It may be corrupted.');
    i.src = srcUrl;
  });

  function encode(scale, q, type, flat) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = c.getContext('2d');
    if (flat) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return new Promise((res) => c.toBlob(res, type, q)).then((b) => ({ blob: b, w: c.width, h: c.height }));
  }

  function show(blob, note, w, h) {
    if (resUrl) URL.revokeObjectURL(resUrl);
    resUrl = URL.createObjectURL(blob);
    resImg.src = resUrl;
    const ext = blob.type.split('/')[1].replace('jpeg', 'jpg');
    dl.href = resUrl;
    dl.download = file.name.replace(/\.[^.]+$/, '') + '-' + Math.round(blob.size / 1024) + 'kb.' + ext;
    info.textContent = `${fmt(file.size)} → ${fmt(blob.size)}${w ? ` (${w}×${h}px)` : ''}. ${note}`;
    out.style.display = 'block';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!img || !file) { say('Please choose an image first.'); return; }
    const kb = Math.max(5, parseInt(kbInput.value, 10) || 0);
    const target = kb * 1024;
    if (file.size <= target) { show(file, `Already under ${kb} KB, so your original is kept.`); return; }

    btn.disabled = true; say('Compressing…');
    try {
      const jpeg = file.type === 'image/jpeg' || !webpOk;
      const type = jpeg ? 'image/jpeg' : 'image/webp';
      const flat = jpeg && file.type !== 'image/jpeg'; // JPEG has no transparency
      let scale = 1, best = null;
      for (let n = 0; n < 10 && !best; n++) {
        let r = await encode(scale, 0.4, type, flat);
        if (!r.blob) break;
        if (r.blob.size > target) { scale *= 0.85; continue; }
        best = r;
        let lo = 0.4, hi = 0.95;
        for (let k = 0; k < 7; k++) {
          const mid = (lo + hi) / 2;
          const t = await encode(scale, mid, type, flat);
          if (t.blob && t.blob.size <= target) { best = t; lo = mid; } else { hi = mid; }
        }
      }
      if (!best) { say(`Could not reach ${kb} KB. Try a higher target.`); }
      else {
        say('');
        const notes = [];
        if (best.w < img.naturalWidth) notes.push('Dimensions were reduced to reach the target.');
        if (flat) notes.push('Transparency was replaced with white.');
        show(best.blob, notes.join(' ') || `Under your ${kb} KB target.`, best.w, best.h);
      }
    } catch (err) { say('Compression failed. Try a smaller image.'); }
    btn.disabled = false;
  });

  const toggle = document.querySelector('.nav-toggle'), menu = document.querySelector('nav ul');
  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      const open = menu.classList.toggle('active');
      toggle.textContent = open ? '✕' : '☰';
      toggle.setAttribute('aria-expanded', String(open));
    });
  }
})();
