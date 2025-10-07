// Image Compression Tool JS
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');
const previewContainer = document.getElementById('previewContainer');
const compressionRange = document.getElementById('compressionRange');
const compressionValue = document.getElementById('compressionValue');
const compressForm = document.getElementById('compressForm');
const outputContainer = document.getElementById('outputContainer');
const compressedImage = document.getElementById('compressedImage');
const downloadBtn = document.getElementById('downloadBtn');

// Image specs elements
const originalSpecs = document.getElementById('originalSpecs');
const originalDimensions = document.getElementById('originalDimensions');
const originalSize = document.getElementById('originalSize');
const originalFormat = document.getElementById('originalFormat');
const compressedSpecs = document.getElementById('compressedSpecs');
const compressedDimensions = document.getElementById('compressedDimensions');
const compressedSize = document.getElementById('compressedSize');
const compressedFormat = document.getElementById('compressedFormat');
const compressionRatio = document.getElementById('compressionRatio');
const compressionRatioDisplay = document.getElementById('compressionRatioDisplay');

let originalImage = null;
let compressedDataUrl = null;
let originalFile = null;

imageInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    originalFile = file;
    const reader = new FileReader();
    reader.onload = function(event) {
        imagePreview.src = event.target.result;
        imagePreview.style.display = 'block';
        originalImage = new Image();
        originalImage.onload = function() {
            displayOriginalSpecs(file);
        };
        originalImage.src = event.target.result;
    };
    reader.readAsDataURL(file);
    outputContainer.style.display = 'none';
    originalSpecs.style.display = 'none';
});

compressionRange.addEventListener('input', function() {
    compressionValue.textContent = compressionRange.value;
});

compressForm.addEventListener('submit', function(e) {
    e.preventDefault();
    if (!originalImage) return;
    compressImage(originalImage, compressionRange.value / 100);
});

function displayOriginalSpecs(file) {
    originalDimensions.textContent = `${originalImage.naturalWidth} × ${originalImage.naturalHeight} px`;
    originalSize.textContent = formatFileSize(file.size);
    originalFormat.textContent = file.type.split('/')[1].toUpperCase();
    originalSpecs.style.display = 'block';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function compressImage(img, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    // Default to JPEG for best compression
    compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
    compressedImage.src = compressedDataUrl;
    downloadBtn.href = compressedDataUrl;
    outputContainer.style.display = 'block';
    
    // Calculate compressed image specs
    displayCompressedSpecs(quality);
}

function displayCompressedSpecs(quality) {
    compressedDimensions.textContent = `${originalImage.naturalWidth} × ${originalImage.naturalHeight} px`;
    
    // Calculate compressed file size
    const base64String = compressedDataUrl.split(',')[1];
    const compressedBytes = atob(base64String).length;
    compressedSize.textContent = formatFileSize(compressedBytes);
    
    // Calculate compression ratio
    const originalBytes = originalFile.size;
    const ratio = ((originalBytes - compressedBytes) / originalBytes * 100).toFixed(1);
    compressionRatio.textContent = `${ratio}%`;
    
    // Display compression ratio message
    if (ratio > 0) {
        compressionRatioDisplay.textContent = `Size reduced by ${ratio}%`;
        compressionRatioDisplay.style.display = 'block';
    } else {
        compressionRatioDisplay.textContent = 'No size reduction';
        compressionRatioDisplay.style.display = 'block';
    }
} 