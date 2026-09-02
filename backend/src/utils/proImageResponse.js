const MASK_TERMS = /(?:^|\b)(?:mask|masked|segmentation|segment|parsing|parse|alpha|matte|agnostic|densepose|pose|heatmap)(?:\b|$)/i;
const INPUT_TERMS = /(?:^|\b)(?:input|person|human|cloth|garment|source)(?:\b|$)/i;
const FINAL_TERMS = /(?:^|\b)(?:final|result|output|generated|generation|tryon|try on|rendered)(?:\b|$)/i;
const DESCRIPTOR_KEYS = new Set(['type', 'kind', 'role', 'label', 'purpose', 'description']);
const CONTEXT_DESCRIPTOR_KEYS = new Set([...DESCRIPTOR_KEYS, 'name']);
const MIME_KEYS = ['content_type', 'contentType', 'mime_type', 'mimeType', 'media_type', 'mediaType'];
const MAX_DEPTH = 10;
const MAX_CANDIDATES = 128;
const MAX_BASE64_CHARACTERS = 48 * 1024 * 1024;

function normalizeSemanticText(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function detectImageMime(bytes, fallback = '') {
  if (!bytes?.length) return fallback.startsWith('image/') ? fallback : '';
  if (bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50) return 'image/webp';
  if (bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6
    && bytes[0] === 0x47
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x38) return 'image/gif';
  if (bytes.length >= 12) {
    const brand = Buffer.from(bytes.subarray(4, 12)).toString('ascii');
    if (/^ftyp(?:avif|avis)/.test(brand)) return 'image/avif';
  }
  return fallback.startsWith('image/') ? fallback : '';
}

function decodeBase64(value) {
  const normalized = String(value || '').replace(/\s+/g, '');
  if (normalized.length < 16
    || normalized.length > MAX_BASE64_CHARACTERS
    || normalized.length % 4 !== 0
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return null;
  try {
    const bytes = Buffer.from(normalized, 'base64');
    return bytes.length ? { bytes, normalized } : null;
  } catch {
    return null;
  }
}

function classifyImageString(value, mimeHint, semanticText) {
  const source = String(value || '').trim();
  if (!source) return null;
  if (/^https?:\/\//i.test(source)) return { kind: 'url', source, mimeType: '' };

  const dataMatch = source.match(/^data:([^;,]+)?(;base64)?,(.*)$/is);
  if (dataMatch?.[2] && String(dataMatch[1] || '').toLowerCase().startsWith('image/')) {
    const decoded = decodeBase64(dataMatch[3]);
    if (!decoded) return null;
    const mimeType = detectImageMime(decoded.bytes, String(dataMatch[1] || '').toLowerCase());
    return mimeType ? { kind: 'base64', source: decoded.normalized, mimeType } : null;
  }

  if (!/(?:base64|b64|image|result|output|final|data)/i.test(semanticText)) return null;
  const decoded = decodeBase64(source);
  if (!decoded) return null;
  const mimeType = detectImageMime(decoded.bytes, String(mimeHint || '').toLowerCase());
  return mimeType ? { kind: 'base64', source: decoded.normalized, mimeType } : null;
}

function candidateScore(semanticText) {
  let score = 0;
  if (/(?:^|\b)(?:final image|final url|final base64)(?:\b|$)/i.test(semanticText)) score += 600;
  if (/(?:^|\b)(?:output image|output url|output base64)(?:\b|$)/i.test(semanticText)) score += 500;
  if (/(?:^|\b)(?:result image|result url|result base64)(?:\b|$)/i.test(semanticText)) score += 450;
  if (/(?:^|\b)image base64(?:\b|$)/i.test(semanticText)) score += 350;
  if (FINAL_TERMS.test(semanticText)) score += 180;
  if (/(?:^|\b)(?:image|url|base64|b64)(?:\b|$)/i.test(semanticText)) score += 30;
  return score;
}

function selectFinalImageCandidate(payload) {
  const candidates = [];
  const visited = new Set();
  let order = 0;

  function visit(value, path = [], descriptors = [], mimeHint = '', depth = 0) {
    if (depth > MAX_DEPTH || candidates.length >= MAX_CANDIDATES || value == null) return;
    const pathText = normalizeSemanticText(path.join(' '));
    const descriptorText = normalizeSemanticText(descriptors.join(' '));
    const semanticText = `${pathText} ${descriptorText}`.trim();

    if (typeof value === 'string') {
      const classificationSemantic = /[a-z]/i.test(semanticText) ? semanticText : `${semanticText} image`;
      const classified = classifyImageString(value, mimeHint, classificationSemantic);
      if (!classified) return;
      const sourceText = classified.kind === 'url' ? normalizeSemanticText(classified.source) : '';
      const fullSemanticText = `${semanticText} ${sourceText}`.trim();
      candidates.push({
        ...classified,
        path: path.join('.'),
        score: candidateScore(fullSemanticText),
        disallowed: MASK_TERMS.test(fullSemanticText) || INPUT_TERMS.test(fullSemanticText),
        order: order += 1,
      });
      return;
    }

    if (typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, String(index)], descriptors, mimeHint, depth + 1));
      return;
    }

    const localDescriptors = Object.entries(value)
      .filter(([key, item]) => CONTEXT_DESCRIPTOR_KEYS.has(key) && typeof item === 'string')
      .map(([, item]) => item);
    const localMime = MIME_KEYS.map((key) => value[key]).find((item) => typeof item === 'string') || mimeHint;

    Object.entries(value).forEach(([key, item]) => {
      if (DESCRIPTOR_KEYS.has(key) || MIME_KEYS.includes(key)) return;
      visit(item, [...path, key], [...descriptors, ...localDescriptors], localMime, depth + 1);
    });
  }

  visit(payload);
  return candidates
    .filter((candidate) => !candidate.disallowed)
    .sort((left, right) => right.score - left.score || right.order - left.order)[0] || null;
}

function decodeImageCandidate(candidate) {
  if (!candidate || candidate.kind !== 'base64') return null;
  const decoded = decodeBase64(candidate.source);
  if (!decoded) return null;
  const mimeType = detectImageMime(decoded.bytes, candidate.mimeType);
  return mimeType ? { bytes: decoded.bytes, mimeType } : null;
}

module.exports = {
  decodeImageCandidate,
  detectImageMime,
  selectFinalImageCandidate,
};
