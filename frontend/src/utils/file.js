export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('خواندن فایل ناموفق بود.'));
    reader.readAsDataURL(file);
  });
}

export async function readImageAsDataUrl(file, { maxSide = 1600, quality = 0.88 } = {}) {
  const source = await readFileAsDataUrl(file);
  if (!file?.type?.startsWith('image/') || typeof Image === 'undefined' || typeof document === 'undefined') return source;
  if (Number(file.size || 0) <= 1_500_000) return source;

  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = source;
    });
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    if (scale === 1) return source;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) return source;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return source;
  }
}

export function isImageDataUrl(value = '') {
  return String(value).startsWith('data:image/');
}
