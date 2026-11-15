// ImgCompressor.shop – browser-only image compression (nothing is uploaded)
(() => {
  const $ = (id) => document.getElementById(id);
  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

  const imageInput = $('imageInput');
  const imagePreview = $('imagePreview');
  const compressionRange = $('compressionRange');
  const compressionValue = $('compressionValue');
  const compressForm = $('compressForm');
  const compressBtn = $('compressBtn');
  const statusEl = $('status');
  const outputContainer = $('outputContainer');
  const originalSpecs = $('originalSpecs');
  const resultOriginalImage = $('resultOriginalImage');
  const resultOriginalSize = $('resultOriginalSize');
  const compressedImage = $('compressedImage');
  const compressedSize = $('compressedSize');
  const ratioDisplay = $('compressionRatioDisplay');
  const downloadBtn = $('downloadBtn');

  // Optional resize controls (all null-safe, so the tool still works if they are missing)
  const resizeToggle = $('resizeToggle');
  const resizeFields = $('resizeFields');
  const resizeWidth = $('resizeWidth');
  const resizeHeight = $('resizeHeight');
  const resizeLock = $('resizeLock');
  const resizeNote = $('resizeNote');

  let originalImage = null;
  let originalFile = null;
  let previewUrl = null;
  let resultUrl = null;
  let aspect = 1;            // original width / height
  let lastDims = null;       // { w, h, resized } for the compression in progress

  const say = (msg) => { statusEl.textContent = msg || ''; };

  function formatFileSize(bytes) {
    if (!bytes) return '0 Bytes';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function reset() {
    outputContainer.style.display = 'none';
    originalSpecs.style.display = 'none';
    imagePreview.style.display = 'none';
    originalImage = null;
    say('');
  }

  // ---------- optional resize (pixels) ----------
  function clampDim(value, max) {
    const v = Math.round(Number(value));
    if (!isFinite(v) || v < 1) return 0;
    return Math.min(v, max);
  }

  function setResizeDefaults(img) {
    if (!resizeToggle) return;
    aspect = img.naturalWidth / img.naturalHeight;
    resizeToggle.checked = false;
    resizeFields.hidden = true;
    resizeWidth.value = img.naturalWidth;
    resizeHeight.value = img.naturalHeight;
    resizeNote.textContent = '';
  }

  function updateHeightFromWidth() {
    if (!originalImage || !resizeLock.checked) return;
    const w = clampDim(resizeWidth.value, originalImage.naturalWidth);
    if (w) resizeHeight.value = Math.max(1, Math.min(originalImage.naturalHeight, Math.round(w / aspect)));
  }

  function updateWidthFromHeight() {
    if (!originalImage || !resizeLock.checked) return;
    const h = clampDim(resizeHeight.value, originalImage.naturalHeight);
    if (h) resizeWidth.value = Math.max(1, Math.min(originalImage.naturalWidth, Math.round(h * aspect)));
  }

  function showResizeNote() {
    if (!originalImage) return;
    const w = Number(resizeWidth.value), h = Number(resizeHeight.value);
    if (w > originalImage.naturalWidth || h > originalImage.naturalHeight) {
      resizeNote.textContent = 'Images are not enlarged, so the largest size is the original: ' +
        originalImage.naturalWidth + ' × ' + originalImage.naturalHeight + ' px.';
    } else {
      resizeNote.textContent = '';
    }
  }

  if (resizeToggle) {
    resizeToggle.addEventListener('change', () => { resizeFields.hidden = !resizeToggle.checked; });
    resizeWidth.addEventListener('input', () => { updateHeightFromWidth(); showResizeNote(); });
    resizeHeight.addEventListener('input', () => { updateWidthFromHeight(); showResizeNote(); });
    resizeLock.addEventListener('change', () => { if (resizeLock.checked) updateHeightFromWidth(); });
    document.querySelectorAll('.resize-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!originalImage) return;
        const pct = Number(btn.dataset.pct) / 100;
        resizeWidth.value = Math.max(1, Math.round(originalImage.naturalWidth * pct));
        resizeHeight.value = Math.max(1, Math.round(originalImage.naturalHeight * pct));
        resizeNote.textContent = '';
      });
    });
  }

  // Returns { w, h, resized } or null if the entered size is not valid.
  function getOutputSize(img) {
    const ow = img.naturalWidth, oh = img.naturalHeight;
    if (!resizeToggle || !resizeToggle.checked) return { w: ow, h: oh, resized: false };
    const w = clampDim(resizeWidth.value, ow);
    const h = clampDim(resizeHeight.value, oh);
    if (!w || !h) return null;
    return { w, h, resized: w < ow || h < oh };
  }

  // Scales down in halving steps first, which keeps big reductions sharper.
  function drawScaled(img, w, h) {
    let src = img;
    let sw = img.naturalWidth, sh = img.naturalHeight;
    while (sw / 2 >= w && sh / 2 >= h) {
      const step = document.createElement('canvas');
      step.width = Math.max(1, Math.floor(sw / 2));
      step.height = Math.max(1, Math.floor(sh / 2));
      const sctx = step.getContext('2d');
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(src, 0, 0, step.width, step.height);
      src = step; sw = step.width; sh = step.height;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    return canvas;
  }

  imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    reset();
    if (!file) return;

    if (!ALLOWED.includes(file.type)) {
      say('Unsupported file. Please choose a JPG, PNG or WebP image.');
      return;
    }
    originalFile = file;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);

    const img = new Image();
    img.onload = () => {
      originalImage = img;
      imagePreview.src = previewUrl;
      imagePreview.style.display = 'block';
      $('originalDimensions').textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
      $('originalSize').textContent = formatFileSize(file.size);
      $('originalFormat').textContent = file.type.split('/')[1].toUpperCase();
      setResizeDefaults(img);
      originalSpecs.style.display = 'block';
    };
    img.onerror = () => say('This image could not be read. It may be corrupted.');
    img.src = previewUrl;
  });

  compressionRange.addEventListener('input', () => {
    compressionValue.textContent = compressionRange.value;
  });

  compressForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!originalImage || !originalFile) { say('Please choose an image first.'); return; }
    compressImage(originalImage, compressionRange.value / 100);
  });

  function compressImage(img, quality) {
    say('');
    const dims = getOutputSize(img);
    if (!dims) { say('Enter a width and height of at least 1 pixel, or turn resizing off.'); return; }
    lastDims = dims;
    compressBtn.disabled = true;
    try {
      let canvas;
      if (dims.resized) {
        canvas = drawScaled(img, dims.w, dims.h);
      } else {
        canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
      }

      // Keep the original format: JPG stays JPG, PNG stays PNG, WebP stays WebP.
      const outType = originalFile.type;

      // PNG: canvas ignores the quality value, so reduce colors with UPNG instead.
      if (outType === 'image/png' && window.UPNG && window.pako) {
        say('Compressing PNG…');
        setTimeout(() => {
          try {
            const { width, height } = canvas;
            const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
            // quality 10–99% -> ~26–253 colors; 100% = lossless
            const colors = quality >= 1 ? 0 : Math.max(16, Math.round(quality * 256));
            const png = UPNG.encode([data.buffer], width, height, colors);
            say('');
            finish(new Blob([png], { type: 'image/png' }), outType);
          } catch (err) {
            compressBtn.disabled = false;
            say('Compression failed. Try a smaller image.');
          }
        }, 30);
        return;
      }

      // JPG, WebP (and PNG fallback if UPNG/pako did not load)
      canvas.toBlob((blob) => finish(blob, outType), outType, quality);
    } catch (err) {
      compressBtn.disabled = false;
      say('Compression failed. Try a smaller image.');
    }
  }

  function finish(blob, outType) {
    compressBtn.disabled = false;
    if (!blob) { say('Compression failed. The image may be too large for your browser.'); return; }

    const resized = !!(lastDims && lastDims.resized);
    const unsupported = blob.type !== outType; // e.g. Safari cannot encode WebP
    // If the user asked for a resize, always give them the resized file.
    const keepOriginal = unsupported || (!resized && blob.size >= originalFile.size);
    const result = keepOriginal ? originalFile : blob;

    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(result);

    resultOriginalImage.src = previewUrl;
    resultOriginalSize.textContent = formatFileSize(originalFile.size);
    compressedImage.src = resultUrl;
    compressedSize.textContent = formatFileSize(result.size);

    const ext = result.type.split('/')[1].replace('jpeg', 'jpg');
    downloadBtn.href = resultUrl;
    downloadBtn.download = originalFile.name.replace(/\.[^.]+$/, '') + '-compressed.' + ext;

    const dimsText = resized ? ` Resized to ${lastDims.w} × ${lastDims.h} px.` : '';
    if (unsupported) {
      ratioDisplay.textContent = "Your browser can't encode this format, so your original is kept.";
    } else if (keepOriginal) {
      ratioDisplay.textContent = 'This image is already well optimized, so your original is kept.';
    } else if (result.size < originalFile.size) {
      const pct = ((originalFile.size - result.size) / originalFile.size * 100).toFixed(1);
      ratioDisplay.textContent = `Size reduced by ${pct}% (saved as ${ext.toUpperCase()}).${dimsText}`;
    } else {
      ratioDisplay.textContent = `Saved as ${ext.toUpperCase()}.${dimsText} The file is not smaller than the original at this quality, so try a lower quality.`;
    }
    ratioDisplay.style.display = 'block';
    outputContainer.style.display = 'block';
  }

  // ---- Language switcher (UI strings only) ----
  const translations = {
    es: { title: 'Compresor de imágenes online gratis', description: 'Reduce el tamaño de tu imagen al instante manteniendo la calidad.', btn: 'Comprimir imagen' },
    fr: { title: "Compresseur d'images en ligne gratuit", description: 'Réduisez la taille de votre image instantanément tout en conservant la qualité.', btn: "Compresser l'image" },
    de: { title: 'Kostenloser Online-Bildkomprimierer', description: 'Reduzieren Sie sofort die Größe Ihres Bildes bei gleichbleibender Qualität.', btn: 'Bild komprimieren' },
    ar: { title: 'أداة ضغط الصور المجانية عبر الإنترنت', description: 'قلل حجم صورتك فوراً مع الحفاظ على الجودة.', btn: 'ضغط الصورة' },
    ur: { title: 'مفت آن لائن امیج کمپریسر', description: 'اپنی تصویر کا سائز فوراً کم کریں اور معیار برقرار رکھیں۔', btn: 'تصویر کمپریس کریں' }
  };
  const langSelect = $('languageSelector');
  const els = { title: $('title'), description: $('description'), btn: compressBtn };
  const defaults = {};
  for (const k in els) if (els[k]) defaults[k] = els[k].textContent;

  function setLanguage() {
    const lang = langSelect.value;
    const t = translations[lang] || defaults;
    for (const k in els) if (els[k] && t[k]) els[k].textContent = t[k];
    document.documentElement.lang = lang;
    document.documentElement.dir = (lang === 'ar' || lang === 'ur') ? 'rtl' : 'ltr';
    try { localStorage.setItem('preferredLang', lang); } catch (e) {}
  }
  langSelect.addEventListener('change', setLanguage);
  try {
    const saved = localStorage.getItem('preferredLang');
    if (saved && saved !== 'en' && translations[saved]) { langSelect.value = saved; setLanguage(); }
  } catch (e) {}

  // ---- Mobile nav ----
  const navToggle = document.querySelector('.nav-toggle');
  const navMenu = document.querySelector('nav ul');
  if (navToggle && navMenu) {
    const setOpen = (open) => {
      navMenu.classList.toggle('active', open);
      navToggle.textContent = open ? '✕' : '☰';
      navToggle.setAttribute('aria-expanded', String(open));
    };
    navToggle.addEventListener('click', () => setOpen(!navMenu.classList.contains('active')));
    document.addEventListener('click', (e) => {
      if (!navMenu.contains(e.target) && !navToggle.contains(e.target)) setOpen(false);
    });
    window.addEventListener('resize', () => { if (window.innerWidth > 768) setOpen(false); });
  }

  // ---- FAQ accordion ----
  document.querySelectorAll('.faq-question').forEach((button) => {
    button.addEventListener('click', () => {
      const item = button.parentElement;
      const willOpen = !item.classList.contains('active');
      document.querySelectorAll('.faq-item').forEach((i) => i.classList.remove('active'));
      item.classList.toggle('active', willOpen);
    });
  });
})();
