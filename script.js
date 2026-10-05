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

  let originalImage = null;
  let originalFile = null;
  let previewUrl = null;
  let resultUrl = null;

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
    compressBtn.disabled = true;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);

      // JPEG stays JPEG; PNG/WebP become WebP so transparency is preserved.
      const outType = originalFile.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';

      canvas.toBlob((blob) => {
        compressBtn.disabled = false;
        if (!blob) { say('Compression failed. The image may be too large for your browser.'); return; }

        const unsupported = blob.type !== outType; // e.g. Safari cannot encode WebP
        const keepOriginal = unsupported || blob.size >= originalFile.size;
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

        if (unsupported) {
          ratioDisplay.textContent = "Your browser can't encode this format, so your original is kept.";
        } else if (keepOriginal) {
          ratioDisplay.textContent = 'This image is already well optimized, so your original is kept.';
        } else {
          const pct = ((originalFile.size - result.size) / originalFile.size * 100).toFixed(1);
          ratioDisplay.textContent = `Size reduced by ${pct}% (saved as ${ext.toUpperCase()})`;
        }
        ratioDisplay.style.display = 'block';
        outputContainer.style.display = 'block';
      }, outType, quality);
    } catch (err) {
      compressBtn.disabled = false;
      say('Compression failed. Try a smaller image.');
    }
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
