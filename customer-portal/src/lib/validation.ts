// AC Scan2Print Customer Portal — Client Pre-Validation & Security Helpers

export const DEFAULT_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
export const DEFAULT_MAX_FILES_PER_JOB = 5;
export const DEFAULT_MAX_EVIDENCE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const DOCUMENT_EXTENSION_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

export const EVIDENCE_EXTENSION_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export interface FileCheckInput {
  name: string;
  type: string;
  size: number;
}

export interface FileCheckResult {
  valid: boolean;
  normalizedMime: string | null;
  extension: string | null;
  error: string | null;
}

export function extractExtension(filename: string): string {
  const clean = filename.trim();
  const dot = clean.lastIndexOf('.');
  if (dot <= 0 || dot === clean.length - 1) return '';
  return clean.slice(dot + 1).toLowerCase();
}

export function validateClientDocumentFile(
  file: FileCheckInput,
  currentCount: number,
  limits: { maxFilesPerJob: number; maxFileSizeBytes: number } = {
    maxFilesPerJob: DEFAULT_MAX_FILES_PER_JOB,
    maxFileSizeBytes: DEFAULT_MAX_FILE_SIZE_BYTES,
  }
): FileCheckResult {
  if (currentCount >= limits.maxFilesPerJob) {
    return {
      valid: false,
      normalizedMime: null,
      extension: null,
      error: `Maximum ${limits.maxFilesPerJob} files allowed per print request.`,
    };
  }

  const trimmed = file.name.trim();
  if (!trimmed || trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    return {
      valid: false,
      normalizedMime: null,
      extension: null,
      error: 'Filename contains invalid characters.',
    };
  }

  const ext = extractExtension(trimmed);
  const expectedMime = DOCUMENT_EXTENSION_TO_MIME[ext];
  if (!expectedMime) {
    return {
      valid: false,
      normalizedMime: null,
      extension: ext || null,
      error: `Unsupported file format '${ext || 'unknown'}'. Upload PDF, JPG, JPEG, or PNG only.`,
    };
  }

  const normalizedClientMime = (file.type || '').trim().toLowerCase();
  if (
    normalizedClientMime &&
    normalizedClientMime !== expectedMime &&
    !(expectedMime === 'image/jpeg' && normalizedClientMime === 'image/jpg')
  ) {
    return {
      valid: false,
      normalizedMime: null,
      extension: ext,
      error: `File type mismatch for '${trimmed}'. Extension .${ext} does not match declared MIME type.`,
    };
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return {
      valid: false,
      normalizedMime: null,
      extension: ext,
      error: `'${trimmed}' is empty (0 bytes). Choose a valid document.`,
    };
  }

  if (file.size > limits.maxFileSizeBytes) {
    return {
      valid: false,
      normalizedMime: null,
      extension: ext,
      error: `'${trimmed}' exceeds the ${formatFileSize(limits.maxFileSizeBytes)} per-file limit.`,
    };
  }

  return {
    valid: true,
    normalizedMime: expectedMime,
    extension: ext,
    error: null,
  };
}

export function validateClientEvidenceFile(file: FileCheckInput): FileCheckResult {
  const trimmed = file.name.trim();
  if (!trimmed || trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    return {
      valid: false,
      normalizedMime: null,
      extension: null,
      error: 'Screenshot filename is invalid.',
    };
  }

  const ext = extractExtension(trimmed);
  const expectedMime = EVIDENCE_EXTENSION_TO_MIME[ext];
  if (!expectedMime) {
    return {
      valid: false,
      normalizedMime: null,
      extension: ext || null,
      error: 'Upload a JPG, JPEG, PNG, or WEBP payment screenshot.',
    };
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return {
      valid: false,
      normalizedMime: null,
      extension: ext,
      error: 'Selected screenshot file is empty (0 bytes).',
    };
  }

  if (file.size > DEFAULT_MAX_EVIDENCE_SIZE_BYTES) {
    return {
      valid: false,
      normalizedMime: null,
      extension: ext,
      error: `Screenshot exceeds ${formatFileSize(DEFAULT_MAX_EVIDENCE_SIZE_BYTES)} limit.`,
    };
  }

  return {
    valid: true,
    normalizedMime: expectedMime,
    extension: ext,
    error: null,
  };
}

export function validateUtrInput(raw: string): { valid: boolean; normalized: string; error: string | null } {
  const normalized = raw.trim().toUpperCase();
  if (!normalized) {
    return {
      valid: false,
      normalized: '',
      error: 'Enter your 12-digit UPI Transaction Reference (UTR) before submitting.',
    };
  }
  if (!/^[A-Z0-9-]{6,40}$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'UTR / reference must be 6–40 letters, numbers, or hyphens with no spaces.',
    };
  }
  return {
    valid: true,
    normalized,
    error: null,
  };
}

export function validateOptionalPhone(raw: string): { valid: boolean; normalized: string; error: string | null } {
  const normalized = raw.trim();
  if (!normalized) {
    return { valid: true, normalized: '', error: null };
  }
  if (!/^[+0-9\s-]{7,20}$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Enter a valid 7–20 digit phone/WhatsApp number, or leave blank.',
    };
  }
  return { valid: true, normalized, error: null };
}

export function parseCustomPageRange(
  rawRange: string,
  maxTotalPages?: number
): { valid: boolean; selectedPageCount: number | null; normalized: string; error: string | null } {
  const trimmed = rawRange.trim().toLowerCase();
  if (!trimmed || trimmed === 'all') {
    return {
      valid: true,
      selectedPageCount: maxTotalPages ?? null,
      normalized: 'all',
      error: null,
    };
  }

  const segments = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return { valid: false, selectedPageCount: null, normalized: rawRange, error: 'Enter a page range such as 1-3, 5.' };
  }

  const selected = new Set<number>();
  for (const seg of segments) {
    if (/^\d+$/.test(seg)) {
      const n = Number(seg);
      if (n < 1 || (maxTotalPages && n > maxTotalPages)) {
        return {
          valid: false,
          selectedPageCount: null,
          normalized: rawRange,
          error: maxTotalPages
            ? `Page ${n} is outside the detected 1–${maxTotalPages} page document range.`
            : `Page number ${n} must be 1 or greater.`,
        };
      }
      selected.add(n);
    } else if (/^(\d+)\s*-\s*(\d+)$/.test(seg)) {
      const m = seg.match(/^(\d+)\s*-\s*(\d+)$/);
      const start = Number(m![1]);
      const end = Number(m![2]);
      if (start < 1 || end < start) {
        return {
          valid: false,
          selectedPageCount: null,
          normalized: rawRange,
          error: `Invalid page range '${seg}'. Start page must be less than or equal to end page.`,
        };
      }
      if (maxTotalPages && end > maxTotalPages) {
        return {
          valid: false,
          selectedPageCount: null,
          normalized: rawRange,
          error: `Range '${seg}' exceeds the detected ${maxTotalPages} pages.`,
        };
      }
      if (end - start > 1000) {
        return {
          valid: false,
          selectedPageCount: null,
          normalized: rawRange,
          error: 'Single page range cannot exceed 1,000 pages.',
        };
      }
      for (let p = start; p <= end; p += 1) {
        selected.add(p);
      }
    } else {
      return {
        valid: false,
        selectedPageCount: null,
        normalized: rawRange,
        error: `Could not understand '${seg}'. Use numbers and hyphens like 1-3, 5.`,
      };
    }
  }

  return {
    valid: true,
    selectedPageCount: selected.size,
    normalized: segments.join(', '),
    error: null,
  };
}

export function detectClientMagicMime(
  bytes: Uint8Array
): 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length < 4) return null;
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return 'application/pdf';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export async function inspectClientFileBytes(
  file: Blob & { name?: string },
  expectedMime: string,
  scope: 'document' | 'evidence' = 'document'
): Promise<{ valid: boolean; detectedMime: string | null; pageCount: number; error: string | null }> {
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { valid: false, detectedMime: null, pageCount: 0, error: 'Selected file is empty (0 bytes).' };
  }

  try {
    const headLen = Math.min(file.size, 65536);
    const headBytes = new Uint8Array(await file.slice(0, headLen).arrayBuffer());
    const detected = detectClientMagicMime(headBytes);
    const label = file.name ? `'${file.name}'` : 'Selected file';

    if (!detected) {
      return {
        valid: false,
        detectedMime: null,
        pageCount: 0,
        error: `${label} does not match a valid PDF or image signature. Renamed executables or unsupported files are not permitted.`,
      };
    }

    const allowed = scope === 'evidence'
      ? new Set(['image/jpeg', 'image/png', 'image/webp'])
      : new Set(['application/pdf', 'image/jpeg', 'image/png']);
    if (!allowed.has(detected) || detected !== expectedMime) {
      return {
        valid: false,
        detectedMime: detected,
        pageCount: 0,
        error: `${label} file content (${detected}) does not match its extension (${expectedMime}).`,
      };
    }

    if (detected === 'application/pdf') {
      const sampleBytes =
        file.size <= 2 * 1024 * 1024
          ? new Uint8Array(await file.arrayBuffer())
          : new Uint8Array([
              ...headBytes,
              ...new Uint8Array(await file.slice(Math.max(0, file.size - 65536), file.size).arrayBuffer()),
            ]);
      const text = new TextDecoder('latin1').decode(sampleBytes);
      if (!text.includes('%%EOF') && !text.includes('endobj')) {
        return {
          valid: false,
          detectedMime: detected,
          pageCount: 0,
          error: `${label} appears to be a corrupt or truncated PDF file.`,
        };
      }
      const leafMatches = text.match(/\/Type\s*\/Page(?![a-zA-Z0-9_])/g);
      if (leafMatches && leafMatches.length > 0) {
        return { valid: true, detectedMime: detected, pageCount: leafMatches.length, error: null };
      }
      const countMatches = [...text.matchAll(/\/Type\s*\/Pages\b[\s\S]{0,200}?\/Count\s+(\d+)/g)];
      const counts = countMatches
        .map((m) => Number.parseInt(m[1], 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (counts.length > 0) {
        return { valid: true, detectedMime: detected, pageCount: Math.max(...counts), error: null };
      }
      return {
        valid: false,
        detectedMime: detected,
        pageCount: 0,
        error: `${label} contains no readable PDF pages and may be corrupted.`,
      };
    }

    return { valid: true, detectedMime: detected, pageCount: 1, error: null };
  } catch {
    return {
      valid: false,
      detectedMime: null,
      pageCount: 0,
      error: 'Could not read the selected file bytes cleanly.',
    };
  }
}

export async function estimateDocumentPageCountFromFile(file: File): Promise<number> {
  const ext = extractExtension(file.name);
  if (ext !== 'pdf') return 1;

  try {
    // Bounded read (first/last chunk up to 2 MB) to estimate PDF /Type /Page count quickly on mobile
    const sampleSize = Math.min(file.size, 2 * 1024 * 1024);
    const buffer = await file.slice(0, sampleSize).arrayBuffer();
    const text = new TextDecoder('latin1').decode(new Uint8Array(buffer));
    const matches = text.match(/\/Type\s*\/Page\b(?!s)/g);
    if (matches && matches.length > 0) {
      return matches.length;
    }
    const countMatch = text.match(/\/Count\s+(\d+)/);
    if (countMatch) {
      const n = Number(countMatch[1]);
      if (Number.isInteger(n) && n >= 1 && n <= 2000) return n;
    }
  } catch {
    // Ignore client inspection errors; authoritative count runs server-side
  }
  return 1;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
