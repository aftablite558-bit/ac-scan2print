// AC Scan2Print — Cryptographic Tokens, Magic-Byte File Inspection, PDF Page Counter & Safe HTTP Utilities

import { AppError } from './types.ts';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function generateCryptographicToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const maxLen = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < maxLen; i += 1) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

export function generateJobNumber(): string {
  const now = new Date();
  const y = now.getUTCFullYear().toString().slice(-2);
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const rand = new Uint8Array(4);
  crypto.getRandomValues(rand);
  const suffix = Array.from(rand)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `AC${y}${m}${d}-${suffix}`;
}

export function sanitizeFilename(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') {
    throw new AppError(400, 'INVALID_FILENAME', 'Original filename is required.');
  }
  if (rawName.includes('..') || rawName.includes('/') || rawName.includes('\\') || rawName.includes('\0')) {
    throw new AppError(400, 'INVALID_FILENAME', 'Filename contains prohibited path traversal characters.');
  }
  const cleaned = rawName.replace(/[^a-zA-Z0-9._ -]/g, '_').trim();
  if (!cleaned || cleaned.startsWith('.')) {
    throw new AppError(400, 'INVALID_FILENAME', 'Filename is invalid.');
  }
  return cleaned.slice(0, 140);
}

export type FileKindScope = 'document' | 'evidence' | 'qr';

const ALLOWED_EXTENSION_MIME: Record<
  FileKindScope,
  Record<string, 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'>
> = {
  document: {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
  },
  evidence: {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  },
  qr: {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  },
};

export function validateDeclaredUploadMeta(
  filename: string,
  claimedMimeType: string,
  fileSizeBytes: number,
  maxBytes: number,
  scope: FileKindScope
): { sanitizedFilename: string; extension: string; normalizedMime: string } {
  const sanitized = sanitizeFilename(filename);
  if (!Number.isInteger(fileSizeBytes) || fileSizeBytes <= 0) {
    throw new AppError(400, 'EMPTY_FILE_REJECTED', 'File size must be greater than 0 bytes.');
  }
  if (fileSizeBytes > maxBytes) {
    throw new AppError(413, 'FILE_TOO_LARGE', `File exceeds maximum allowed size (${maxBytes} bytes).`);
  }

  const ext = sanitized.split('.').pop()?.toLowerCase() ?? '';
  const expectedMime = ALLOWED_EXTENSION_MIME[scope][ext];
  if (!expectedMime) {
    throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', `File extension '.${ext}' is not permitted.`);
  }

  const normalizedClaimed = claimedMimeType.trim().toLowerCase();
  if (normalizedClaimed !== expectedMime) {
    throw new AppError(
      415,
      'MIME_EXTENSION_MISMATCH',
      `Claimed MIME type '${claimedMimeType}' does not match extension '.${ext}'.`
    );
  }

  return {
    sanitizedFilename: sanitized,
    extension: ext,
    normalizedMime: expectedMime,
  };
}

export function detectMagicMimeType(bytes: Uint8Array): 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length < 4) return null;

  // PDF: %PDF-
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

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
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

  // WEBP: RIFF....WEBP
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

export function inspectUploadedBytes(
  bytes: Uint8Array,
  expectedMime: string,
  maxBytes: number,
  scope: FileKindScope
): { detectedMime: string; pageCount: number } {
  if (bytes.byteLength === 0) {
    throw new AppError(422, 'EMPTY_FILE_REJECTED', 'Uploaded file has 0 bytes.');
  }
  if (bytes.byteLength > maxBytes) {
    throw new AppError(413, 'FILE_TOO_LARGE', 'Uploaded file exceeds maximum allowed byte limit.');
  }

  const detectedMime = detectMagicMimeType(bytes);
  if (!detectedMime) {
    throw new AppError(422, 'INVALID_FILE_SIGNATURE', 'File content does not match any supported format.');
  }

  const allowedSet = new Set(Object.values(ALLOWED_EXTENSION_MIME[scope]));
  if (!allowedSet.has(detectedMime)) {
    throw new AppError(422, 'UNSUPPORTED_FILE_TYPE', `Detected file signature '${detectedMime}' is not permitted here.`);
  }

  if (detectedMime !== expectedMime) {
    throw new AppError(
      422,
      'MIME_SPOOFING_DETECTED',
      `Uploaded bytes signature '${detectedMime}' does not match declared '${expectedMime}'.`
    );
  }

  if (detectedMime === 'application/pdf') {
    const pageCount = extractPdfPageCount(bytes);
    return { detectedMime, pageCount };
  }

  // Single image (JPG/PNG/WEBP) = 1 page
  return { detectedMime, pageCount: 1 };
}

export function extractPdfPageCount(bytes: Uint8Array): number {
  if (detectMagicMimeType(bytes) !== 'application/pdf') {
    throw new AppError(422, 'INVALID_PDF', 'Missing PDF header.');
  }

  // Decode latin1 safely to preserve PDF structural keywords without corrupting binary streams
  const text = new TextDecoder('latin1').decode(bytes);
  if (!text.includes('%%EOF') && !text.includes('endobj')) {
    throw new AppError(422, 'CORRUPT_PDF', 'PDF appears truncated or malformed.');
  }

  // Prefer leaf /Type /Page matches (strictly excluding /Type /Pages)
  const leafMatches = text.match(/\/Type\s*\/Page(?![a-zA-Z0-9_])/g);
  if (leafMatches && leafMatches.length > 0) {
    return leafMatches.length;
  }

  // Fallback to root /Pages /Count N when pages are compressed or compactly declared
  const countMatches = [...text.matchAll(/\/Type\s*\/Pages\b[\s\S]{0,200}?\/Count\s+(\d+)/g)];
  if (countMatches.length > 0) {
    const counts = countMatches.map((m) => Number.parseInt(m[1], 10)).filter((n) => Number.isFinite(n) && n > 0);
    if (counts.length > 0) {
      return Math.max(...counts);
    }
  }

  throw new AppError(422, 'CORRUPT_PDF', 'Unable to verify valid page objects inside PDF.');
}

export function validateUtrReference(raw: string): string {
  if (typeof raw !== 'string') {
    throw new AppError(400, 'INVALID_UTR', 'Transaction reference (UTR) is required.');
  }
  const normalized = raw.trim().toUpperCase();
  if (!/^[A-Z0-9-]{6,40}$/.test(normalized)) {
    throw new AppError(
      400,
      'INVALID_UTR',
      'UTR / transaction reference must be 6–40 alphanumeric characters.'
    );
  }
  return normalized;
}

export function parseAndValidatePageRange(
  rawRange: string,
  maxTotalPages?: number
): { normalized: string; selectedPageCount: number | null } {
  const trimmed = rawRange.trim().toLowerCase();
  if (!trimmed || trimmed === 'all') {
    return { normalized: 'all', selectedPageCount: maxTotalPages ?? null };
  }

  const segments = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    throw new AppError(400, 'INVALID_PAGE_RANGE', 'Page range cannot be empty.');
  }

  const selected = new Set<number>();
  for (const seg of segments) {
    if (/^\d+$/.test(seg)) {
      const page = Number(seg);
      if (!Number.isInteger(page) || page < 1) {
        throw new AppError(400, 'INVALID_PAGE_RANGE', `Invalid page number '${seg}'.`);
      }
      if (maxTotalPages !== undefined && page > maxTotalPages) {
        throw new AppError(
          400,
          'INVALID_PAGE_RANGE',
          `Page ${page} exceeds the verified ${maxTotalPages}-page document count.`
        );
      }
      selected.add(page);
    } else if (/^(\d+)\s*-\s*(\d+)$/.test(seg)) {
      const match = seg.match(/^(\d+)\s*-\s*(\d+)$/)!;
      const start = Number(match[1]);
      const end = Number(match[2]);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
        throw new AppError(400, 'INVALID_PAGE_RANGE', `Invalid page range '${seg}'.`);
      }
      if (maxTotalPages !== undefined && end > maxTotalPages) {
        throw new AppError(
          400,
          'INVALID_PAGE_RANGE',
          `Page range '${seg}' exceeds the verified ${maxTotalPages}-page document count.`
        );
      }
      if (end - start > 1000) {
        throw new AppError(400, 'INVALID_PAGE_RANGE', 'Single page range cannot exceed 1,000 pages.');
      }
      if (maxTotalPages !== undefined) {
        for (let p = start; p <= end; p += 1) {
          selected.add(p);
        }
      }
    } else {
      throw new AppError(
        400,
        'INVALID_PAGE_RANGE',
        `Unsupported page range segment '${seg}'. Use e.g. 'all' or '1-3, 5'.`
      );
    }
  }

  return {
    normalized: segments.join(', '),
    selectedPageCount: maxTotalPages !== undefined ? selected.size : null,
  };
}

export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

export function buildCorsHeaders(req: Request, allowedOriginsRaw?: string): Record<string, string> {
  const reqOrigin = req.headers.get('origin') ?? '';
  const allowedList = (allowedOriginsRaw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const allowOrigin =
    allowedList.length === 0
      ? reqOrigin || '*'
      : allowedList.includes(reqOrigin)
        ? reqOrigin
        : allowedList[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-tracking-token, x-draft-secret, x-admin-bootstrap-secret, x-cron-secret, x-device-credential',
    'Vary': 'Origin',
  };
}

export function jsonResponse(
  status: number,
  body: unknown,
  corsHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders,
    },
  });
}

export function handleErrorResponse(
  err: unknown,
  corsHeaders: Record<string, string> = {}
): Response {
  if (err instanceof AppError) {
    return jsonResponse(
      err.status,
      {
        error: {
          code: err.code,
          message: err.message,
        },
      },
      corsHeaders
    );
  }

  return jsonResponse(
    500,
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected server error occurred.',
      },
    },
    corsHeaders
  );
}
