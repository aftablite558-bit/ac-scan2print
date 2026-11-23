import { getCurrentFirebaseIdToken } from './firebase';
import { sanitizeErrorMessage } from '../utils/workspaceState';

export class ApiError extends Error {
  status: number;
  isNonJson: boolean;

  constructor(status: number, message: string, options?: { isNonJson?: boolean }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isNonJson = Boolean(options?.isNonJson);
  }
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
  fetchImpl: typeof fetch = fetch
): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const headers: Record<string, string> = {};
  if (!isForm) {
    headers['Content-Type'] = 'application/json';
  }
  const firebaseToken = await getCurrentFirebaseIdToken().catch(() => null);
  if (firebaseToken) {
    headers.Authorization = `Bearer ${firebaseToken}`;
  }
  if (init?.headers) {
    const extra = init.headers as Record<string, string>;
    for (const [k, v] of Object.entries(extra)) {
      headers[k] = v;
    }
  }

  const res = await fetchImpl(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers,
  });

  const contentType = res.headers?.get('content-type')?.toLowerCase() ?? '';
  const text = await res.text();
  const trimmed = text.trimStart();
  const looksLikeHtml = contentType.includes('text/html') || trimmed.startsWith('<');

  if (looksLikeHtml) {
    throw new ApiError(
      res.ok ? 404 : res.status,
      `CMS endpoint /api${path} returned HTML instead of JSON (static hosting fallback).`,
      { isNonJson: true }
    );
  }

  let parsed: unknown = {};
  if (trimmed) {
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      if (!res.ok) {
        throw new ApiError(res.status, sanitizeErrorMessage(trimmed, `Request failed (${res.status})`), {
          isNonJson: true,
        });
      }
      throw new ApiError(
        502,
        `Invalid non-JSON response received from /api${path}.`,
        { isNonJson: true }
      );
    }
  }

  if (!res.ok) {
    const errRecord =
      typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    const msg =
      (typeof errRecord.error === 'string' && errRecord.error) ||
      (typeof errRecord.message === 'string' && errRecord.message) ||
      `Request failed (${res.status})`;
    throw new ApiError(res.status, sanitizeErrorMessage(msg, `Request failed (${res.status})`));
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new ApiError(502, `Unexpected JSON payload shape from /api${path}.`, { isNonJson: true });
  }

  return parsed as T;
}
