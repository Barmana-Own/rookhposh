import apiClient from '../services/apiClient.js';
import { detectImageMime } from './proResponse.js';
import { imageDownloadName } from './tryon.js';
import { FILE_TIMEOUT_MS } from './requestPolicy.js';

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
  let serverFilename;
  if (isDataImage(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error('خواندن تصویر خروجی پرو آنلاین ممکن نیست.');
    blob = await response.blob();
  } else {
    const response = await apiClient.get(getProOutputSource(source), {
      responseType: 'blob',
      timeout: FILE_TIMEOUT_MS,
      withCredentials: true,
      headers: { Accept: 'image/*' },
    });
    blob = response.data;
    serverFilename = /filename="?([^";]+)"?/i.exec(response.headers['content-disposition'] || '')?.[1];
  }

  if (!blob?.size || blob.size > 12 * 1024 * 1024) throw new Error('اندازه فایل خروجی معتبر نیست.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = detectImageMime(bytes, '');
  const actualFilename = imageDownloadName(serverFilename || filename, mime);
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = actualFilename;
  anchor.target = '_self';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Safari/mobile downloads may read the blob after the click handler has finished.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  return { filename: actualFilename, mime, byte_size: bytes.length };
}
