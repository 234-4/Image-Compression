/* ==========================================================================
   tool-reset.js
   Adds a Reset button to the compressor. Load AFTER /script.js.

   - Does not modify, wrap or call any function from script.js.
   - Only touches elements by their existing IDs and the new #resetBtn.
   - The button is type="button", so it never submits the form.
   ========================================================================== */
(function () {
  'use strict';

  function byId(id) { return document.getElementById(id); }

  function setText(id, value) {
    var el = byId(id);
    if (el) el.textContent = value;
  }

  // Remove an image's source and free its blob URL if it has one
  function clearImage(id) {
    var img = byId(id);
    if (!img) return;
    var src = img.getAttribute('src');
    if (src && src.indexOf('blob:') === 0) {
      try { URL.revokeObjectURL(src); } catch (e) {}
    }
    img.removeAttribute('src');
  }

  function resetTool() {
    var form = byId('compressForm');
    var download = byId('downloadBtn');

    // 1. Release blob URLs and clear every image
    clearImage('imagePreview');
    clearImage('resultOriginalImage');
    clearImage('compressedImage');

    if (download) {
      var href = download.getAttribute('href');
      if (href && href.indexOf('blob:') === 0) {
        try { URL.revokeObjectURL(href); } catch (e) {}
      }
      download.setAttribute('href', '#');
      download.setAttribute('download', '');
    }

    // 2. Reset the form (clears the file input, restores slider to its default of 70)
    if (form) form.reset();

    // 3. Reset visible text
    setText('compressionValue', '70');
    setText('originalDimensions', '-');
    setText('originalSize', '-');
    setText('originalFormat', '-');
    setText('resultOriginalSize', '-');
    setText('compressedSize', '-');
    setText('compressionRatioDisplay', '');
    setText('status', '');

    // 4. Hide the panels the tool shows after a file is chosen / compressed
    var preview = byId('imagePreview');
    var specs = byId('originalSpecs');
    var output = byId('outputContainer');
    if (preview) preview.style.display = 'none';
    if (specs) specs.style.display = 'none';
    if (output) output.style.display = 'none';

    // 5. Put the cursor back on the file picker
    var input = byId('imageInput');
    if (input) input.focus();
  }

  function init() {
    var btn = byId('resetBtn');
    if (btn) btn.addEventListener('click', resetTool);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
