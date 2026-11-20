import { auth } from '../firebase';

export class ApiError extends Error {
  status: number;
  code?: string;
  retryAfterSeconds?: number;

  constructor(
    message: string,
    status: number,
    code?: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function parseRetryAfterSeconds(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();
  if (!trimmed) return undefined;
  if (/^\d+$/.test(trimmed)) {
    const secs = Number(trimmed);
    return Number.isFinite(secs) && secs >= 0 ? secs : undefined;
  }
  const targetMs = Date.parse(trimmed);
  if (!Number.isNaN(targetMs)) {
    return Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
  }
  return undefined;
}

export async function postJson<T = Record<string, unknown>>(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (auth?.currentUser) {
    try {
      const idToken = await auth.currentUser.getIdToken();
      if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
      }
    } catch {
      // Let the server return a clear 401 response if token retrieval fails
    }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify(body),
  });

  const retryAfterSeconds = parseRetryAfterSeconds(res.headers.get('retry-after'));
  const rawText = await res.text();
  let data: Record<string, unknown> | null = null;

  if (rawText.trim()) {
    try {
      data = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      const looksLikeHtml = /^\s*</.test(rawText);
      if (res.status === 413) {
        throw new ApiError(
          'Audio or story payload exceeded the server size limit. Try a shorter clip.',
          413,
          'payload_too_large',
          retryAfterSeconds,
        );
      }
      if (looksLikeHtml || !res.ok) {
        throw new ApiError(
          `Server returned an unexpected ${res.status || ''} response. Please retry in a moment.`.replace(
            /\s+/g,
            ' ',
          ),
          res.status || 500,
          undefined,
          retryAfterSeconds,
        );
      }
      throw new Error('Server returned an invalid response format.');
    }
  }

  if (!res.ok) {
    const code = data && typeof data.code === 'string' ? data.code : undefined;
    const errMsg =
      data && typeof data.error === 'string'
        ? data.error
        : res.status === 401
          ? 'Your session token could not be verified. Retry or sign out to continue as an anonymous author.'
          : res.status === 429
            ? 'Rate limit reached. Please wait a moment before retrying.'
            : `Request failed (${res.status}).`;
    throw new ApiError(errMsg, res.status, code, retryAfterSeconds);
  }

  return (data ?? {}) as T;
}
