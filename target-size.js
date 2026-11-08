// ImgCompressor.shop – compress to a target file size, entirely in the browser
(() => {
  const $ = (id) => document.getElementById(id);
  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
  const webpOk = document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp');
  const input = $('imageInput'), kbInput = $('targetKb'), kbLabel = $('targetValue'), form = $('compressForm'),
        btn = $('compressBtn'), statusEl = $('status'), outBox = $('outputContainer'), prev = $('imagePreview'),
        specs = $('originalSpecs'), ratio = $('compressionRatioDisplay'), dl = $('downloadBtn');
  let file = null, img = null, srcUrl = null, resUrl = null;

  const say = (m) => { statusEl.textContent = m || ''; };
  const fmt = (b) => b < 1024 ? b + ' Bytes' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(2) + ' MB';
  const pause = () => new Promise((r) => setTimeout(r, 20)); // lets the page repaint between heavy steps

  kbInput.addEventListener('input', () => { kbLabel.textContent = kbInput.value || '–'; });

  input.addEventListener('change', (e) => {
    const f = e.target.files[0];
    outBox.style.display = 'none'; specs.style.display = 'none'; prev.style.display = 'none';
    img = null; say('');
    if (!f) return;
    if (!ALLOWED.includes(f.type)) { say('Please choose a JPG, PNG or WebP image.'); return; }
    file = f;
    if (srcUrl) URL.revokeObjectURL(srcUrl);
    srcUrl = URL.createObjectURL(f);
    const i = new Image();
    i.onload = () => {
      img = i;
      prev.src = srcUrl; prev.style.display = 'block';
      $('originalDimensions').textContent = `${i.naturalWidth} × ${i.naturalHeight} px`;
      $('originalSize').textContent = fmt(f.size);
      $('originalFormat').textContent = f.type.split('/')[1].toUpperCase();
      specs.style.display = 'block';
    };
    i.onerror = () => say('This image could not be read. It may be corrupted.');
    i.src = srcUrl;
  });

  // JPG / WebP encoder (canvas, quality-based)
  function encode(scale, q, type, flat) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = c.getContext('2d');
    if (flat) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return new Promise((res) => c.toBlob(res, type, q)).then((b) => ({ blob: b, w: c.width, h: c.height }));
  }

  // PNG: draw once at a given scale, then encode with a chosen number of colors (UPNG quantizer)
  function pngPixels(scale) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return { data: ctx.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
  }
  function pngEncode(px, colors) {
    const buf = UPNG.encode([px.data.buffer.slice(0)], px.w, px.h, colors);
    return { blob: new Blob([buf], { type: 'image/png' }), w: px.w, h: px.h };
  }

  async function compressPng(target) {
    // Try 16 colors first at each size; if even that is too big, shrink the image and retry.
    const steps = [256, 128, 64, 32];
    let scale = 1;
    for (let n = 0; n < 14; n++) {
      say(scale === 1 ? 'Compressing PNG…' : `Compressing PNG (resizing to ${Math.round(scale * 100)}%)…`);
      await pause();
      const px = pngPixels(scale);
      const smallest = pngEncode(px, 16);
      if (smallest.blob.size <= target) {
        // It fits. Now find the highest color count that still fits.
        for (const colors of steps) {
          await pause();
          const r = pngEncode(px, colors);
          if (r.blob.size <= target) return r;
        }
        return smallest;
      }
      scale *= 0.85;
    }
    return null;
  }

  function show(blob, note) {
    if (resUrl) URL.revokeObjectURL(resUrl);
    resUrl = URL.createObjectURL(blob);
    $('resultOriginalImage').src = srcUrl;
    $('resultOriginalSize').textContent = fmt(file.size);
    $('compressedImage').src = resUrl;
    $('compressedSize').textContent = fmt(blob.size);
    const ext = blob.type.split('/')[1].replace('jpeg', 'jpg');
    dl.href = resUrl;
    dl.download = file.name.replace(/\.[^.]+$/, '') + '-' + Math.max(1, Math.round(blob.size / 1024)) + 'kb.' + ext;
    ratio.textContent = note;
    ratio.style.display = 'block';
    outBox.style.display = 'block';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!img || !file) { say('Please choose an image first.'); return; }
    const kb = Math.max(5, parseInt(kbInput.value, 10) || 0);
    const target = kb * 1024;
    if (file.size <= target) { show(file, `Already under ${kb} KB, so your original is kept.`); return; }

    btn.disabled = true; say('Compressing…');
    try {
      // ---- PNG stays PNG ----
      if (file.type === 'image/png') {
        if (!(window.UPNG && window.pako)) {
          say('The PNG compressor did not load. Please refresh the page and try again.');
        } else {
          const best = await compressPng(target);
          if (!best) { say(`Could not reach ${kb} KB. Try a higher target.`); }
          else {
            say('');
            let note = `Compressed to ${fmt(best.blob.size)} (${best.w} × ${best.h} px), under your ${kb} KB target. Saved as PNG.`;
            if (best.w < img.naturalWidth) note += ' Dimensions were reduced to reach the target.';
            show(best.blob, note);
          }
        }
        btn.disabled = false;
        return;
      }

      // ---- JPG and WebP (unchanged) ----
      const jpeg = file.type === 'image/jpeg' || !webpOk;
      const type = jpeg ? 'image/jpeg' : 'image/webp';
      const flat = jpeg && file.type !== 'image/jpeg'; // JPEG has no transparency
      let scale = 1, best = null;
      for (let n = 0; n < 10 && !best; n++) {
        const r = await encode(scale, 0.4, type, flat);
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
        let note = `Compressed to ${fmt(best.blob.size)} (${best.w} × ${best.h} px), under your ${kb} KB target.`;
        if (best.w < img.naturalWidth) note += ' Dimensions were reduced to reach the target.';
        if (flat) note += ' Transparency was replaced with white.';
        show(best.blob, note);
      }
    } catch (err) { say('Compression failed. Try a smaller image.'); }
    btn.disabled = false;
  });

  const toggle = document.querySelector('.nav-toggle'), menu = document.querySelector('nav ul');
  if (toggle && menu) {
    const setOpen = (o) => { menu.classList.toggle('active', o); toggle.textContent = o ? '✕' : '☰'; toggle.setAttribute('aria-expanded', String(o)); };
    toggle.addEventListener('click', () => setOpen(!menu.classList.contains('active')));
    document.addEventListener('click', (e) => { if (!menu.contains(e.target) && !toggle.contains(e.target)) setOpen(false); });
  }

  document.querySelectorAll('.faq-question').forEach((b) => {
    b.addEventListener('click', () => {
      const item = b.parentElement, open = !item.classList.contains('active');
      document.querySelectorAll('.faq-item').forEach((i) => i.classList.remove('active'));
      item.classList.toggle('active', open);
    });
  });
})();
