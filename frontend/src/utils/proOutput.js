import apiClient from '../services/apiClient.js';

const providerHosts = new Set([
  '91.107.232.169',
  'kwai-kolors-kolors-virtual-try-on.hf.space',
]);

function apiOrigin() {
  return apiClient.defaults.baseURL || window.location.origin;
}

function isDataImage(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('تصویر خروجی قابل پردازش نیست.'));
    image.src = source;
  });
}

export async function normalizeProOutput(source) {
  if (!isDataImage(source) || typeof document === 'undefined' || typeof Image === 'undefined') return source || '';

  try {
    const image = await loadImage(source);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return source;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return source;
    context.drawImage(image, 0, 0, width, height);

    const { data } = context.getImageData(0, 0, width, height);
    let hasTransparency = false;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] < 255) {
        hasTransparency = true;
        break;
      }
    }
    if (!hasTransparency) return source;

    context.clearRect(0, 0, width, height);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  } catch {
    return source;
  }
}

export function getProOutputSource(source) {
  if (!source || typeof source !== 'string' || isDataImage(source) || source.startsWith('blob:')) return source || '';

  try {
    const url = new URL(source, window.location.origin);
    if (!providerHosts.has(url.hostname)) return source;
    return `${apiOrigin()}/api/pro-output?url=${encodeURIComponent(url.href)}`;
  } catch {
    return source;
  }
}

export async function downloadProOutput(source, filename) {
  if (!source) throw new Error('خروجی پرو آنلاین برای دانلود وجود ندارد.');

  let blob;
  if (isDataImage(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error('خواندن تصویر خروجی پرو آنلاین ممکن نیست.');
    blob = await response.blob();
  } else {
    const response = await apiClient.get(getProOutputSource(source), {
      responseType: 'blob',
      headers: { Accept: 'image/*' },
    });
    blob = response.data;
  }

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
