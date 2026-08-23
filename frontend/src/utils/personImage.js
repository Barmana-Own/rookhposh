const MAX_PROCESSING_SIDE = 720;
const BACKGROUND_DISTANCE = 58;
const MAX_EDGE_COLORS = 48;

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('تصویر فرد قابل پردازش نیست.'));
    image.src = source;
  });
}

function colorDistance(data, offset, color) {
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  return Math.sqrt(((red - color[0]) ** 2) + ((green - color[1]) ** 2) + ((blue - color[2]) ** 2));
}

function edgeColors(data, width, height) {
  const colors = [];
  const stride = Math.max(1, Math.floor(Math.max(width, height) / 72));
  const add = (x, y) => {
    const offset = (y * width + x) * 4;
    if (data[offset + 3] > 0) colors.push([data[offset], data[offset + 1], data[offset + 2]]);
  };
  for (let x = 0; x < width; x += stride) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = 0; y < height; y += stride) {
    add(0, y);
    add(width - 1, y);
  }
  if (colors.length <= MAX_EDGE_COLORS) return colors;
  const step = colors.length / MAX_EDGE_COLORS;
  return Array.from({ length: MAX_EDGE_COLORS }, (_, index) => colors[Math.floor(index * step)]);
}

function nearestEdgeDistance(data, offset, colors) {
  let nearest = Number.POSITIVE_INFINITY;
  for (const color of colors) {
    const distance = colorDistance(data, offset, color);
    nearest = Math.min(nearest, distance);
    if (nearest === 0) break;
  }
  return nearest;
}

function removeEdgeBackground(canvas) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  const { width, height } = canvas;
  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  const colors = edgeColors(data, width, height);
  if (!colors.length) return false;

  const total = width * height;
  const background = new Uint8Array(total);
  const queue = new Uint32Array(total);
  let head = 0;
  let tail = 0;
  const seed = (index) => {
    if (background[index]) return;
    const offset = index * 4;
    if (data[offset + 3] > 0 && nearestEdgeDistance(data, offset, colors) <= BACKGROUND_DISTANCE) {
      background[index] = 1;
      queue[tail] = index;
      tail += 1;
    }
  };

  for (let x = 0; x < width; x += 1) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    seed(y * width);
    seed(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    const neighbors = [
      x > 0 ? index - 1 : -1,
      x < width - 1 ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y < height - 1 ? index + width : -1,
    ];
    for (const neighbor of neighbors) {
      if (neighbor >= 0 && !background[neighbor]) seed(neighbor);
    }
  }

  const removedRatio = tail / total;
  if (removedRatio < 0.02 || removedRatio > 0.86) return false;

  for (let index = 0; index < total; index += 1) {
    if (!background[index]) continue;
    const offset = index * 4;
    data[offset] = 255;
    data[offset + 1] = 255;
    data[offset + 2] = 255;
    data[offset + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);
  return true;
}

export async function preparePersonImage(source) {
  if (!source || typeof source !== 'string' || !source.startsWith('data:image/')) return source || '';
  if (typeof document === 'undefined' || typeof Image === 'undefined') return source;

  try {
    const image = await loadImage(source);
    const scale = Math.min(1, MAX_PROCESSING_SIDE / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const context = canvas.getContext('2d');
    if (!context) return source;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    removeEdgeBackground(canvas);
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch {
    return source;
  }
}
