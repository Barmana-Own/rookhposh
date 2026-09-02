export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('خواندن فایل ناموفق بود.'));
    reader.readAsDataURL(file);
  });
}

const DEFAULT_IMAGE_COMPRESSION_OPTIONS = Object.freeze({
  maxSide: 1600,
  maxBytes: 1_500_000,
  initialQuality: 0.84,
  minQuality: 0.58,
  qualityStep: 0.08,
  minSide: 720,
  maxAttempts: 12,
});

export function getDataUrlByteLength(value = '') {
  const encoded = String(value).split(',')[1] || '';
  if (!encoded) return 0;
  return Math.floor(encoded.replace(/=+$/, '').length * 3 / 4);
}

export function getImageCompressionDimensions(width, height, maxSide = DEFAULT_IMAGE_COMPRESSION_OPTIONS.maxSide) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const safeMaxSide = Math.max(1, Number(maxSide) || DEFAULT_IMAGE_COMPRESSION_OPTIONS.maxSide);
  const scale = Math.min(1, safeMaxSide / Math.max(safeWidth, safeHeight));
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

export function normalizeImageCompressionOptions(options = {}) {
  const maxSide = Math.max(1, Number(options.maxSide) || DEFAULT_IMAGE_COMPRESSION_OPTIONS.maxSide);
  const maxBytes = Math.max(1, Number(options.maxBytes) || DEFAULT_IMAGE_COMPRESSION_OPTIONS.maxBytes);
  const initialQuality = Math.min(1, Math.max(0.1, Number(options.initialQuality) || DEFAULT_IMAGE_COMPRESSION_OPTIONS.initialQuality));
  const minQuality = Math.min(initialQuality, Math.max(0.1, Number(options.minQuality) || DEFAULT_IMAGE_COMPRESSION_OPTIONS.minQuality));
  const qualityStep = Math.min(initialQuality - minQuality || initialQuality, Math.max(0.01, Number(options.qualityStep) || DEFAULT_IMAGE_COMPRESSION_OPTIONS.qualityStep));
  const minSide = Math.max(1, Math.min(maxSide, Number(options.minSide) || DEFAULT_IMAGE_COMPRESSION_OPTIONS.minSide));
  const maxAttempts = Math.max(1, Math.floor(Number(options.maxAttempts) || DEFAULT_IMAGE_COMPRESSION_OPTIONS.maxAttempts));
  return { maxSide, maxBytes, initialQuality, minQuality, qualityStep, minSide, maxAttempts };
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('تصویر قابل پردازش نیست.'));
    image.src = source;
  });
}

function renderJpeg(image, width, height, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return '';
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

function shrinkDimensions(width, height, minSide) {
  const longestSide = Math.max(width, height);
  if (longestSide <= minSide) return null;
  const scale = Math.max(minSide / longestSide, 0.82);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function compressImageDataUrl(source, options = {}) {
  const value = String(source || '');
  if (!isImageDataUrl(value) || typeof Image === 'undefined' || typeof document === 'undefined') return value;

  const settings = normalizeImageCompressionOptions(options);
  const originalBytes = getDataUrlByteLength(value);

  try {
    const image = await loadImage(value);
    const originalWidth = image.naturalWidth || image.width;
    const originalHeight = image.naturalHeight || image.height;
    if (!originalWidth || !originalHeight) return value;

    let dimensions = getImageCompressionDimensions(originalWidth, originalHeight, settings.maxSide);
    const dimensionsChanged = dimensions.width !== originalWidth || dimensions.height !== originalHeight;
    let quality = settings.initialQuality;
    let bestCandidate = value;
    let bestCandidateBytes = originalBytes || Number.POSITIVE_INFINITY;

    for (let attempt = 0; attempt < settings.maxAttempts; attempt += 1) {
      const candidate = renderJpeg(image, dimensions.width, dimensions.height, quality);
      if (!isImageDataUrl(candidate)) return bestCandidate;

      const candidateBytes = getDataUrlByteLength(candidate);
      if (candidateBytes < bestCandidateBytes || (dimensionsChanged && bestCandidate === value)) {
        bestCandidate = candidate;
        bestCandidateBytes = candidateBytes;
      }
      if (candidateBytes <= settings.maxBytes) {
        return dimensionsChanged || candidateBytes < originalBytes ? candidate : value;
      }

      if (quality > settings.minQuality) {
        quality = Math.max(settings.minQuality, quality - settings.qualityStep);
        continue;
      }

      const nextDimensions = shrinkDimensions(dimensions.width, dimensions.height, settings.minSide);
      if (!nextDimensions || (nextDimensions.width === dimensions.width && nextDimensions.height === dimensions.height)) break;
      dimensions = nextDimensions;
      quality = settings.initialQuality;
    }

    return dimensionsChanged || bestCandidateBytes < originalBytes ? bestCandidate : value;
  } catch {
    return value;
  }
}

export async function compressImageFile(file, options = {}) {
  const source = await readFileAsDataUrl(file);
  return compressImageDataUrl(source, options);
}

export async function readImageAsDataUrl(file, { maxSide = 1600, quality = 0.88 } = {}) {
  const source = await readFileAsDataUrl(file);
  if (!file?.type?.startsWith('image/') || typeof Image === 'undefined' || typeof document === 'undefined') return source;
  if (Number(file.size || 0) <= 1_500_000) return source;

  return compressImageDataUrl(source, {
    maxSide,
    initialQuality: quality,
    maxBytes: 1_500_000,
  });
}

export function isImageDataUrl(value = '') {
  return String(value).startsWith('data:image/');
}
