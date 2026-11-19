import { auth } from '../firebase';

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

  const rawText = await res.text();
  let data: Record<string, unknown> | null = null;

  if (rawText.trim()) {
    try {
      data = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      const looksLikeHtml = /^\s*</.test(rawText);
      if (res.status === 413) {
        throw new Error(
          'Audio or story payload exceeded the server size limit. Try a shorter clip.',
        );
      }
      if (looksLikeHtml || !res.ok) {
        throw new Error(
          `Server returned an unexpected ${res.status || ''} response. Please retry in a moment.`.replace(
            /\s+/g,
            ' ',
          ),
        );
      }
      throw new Error('Server returned an invalid response format.');
    }
  }

  if (!res.ok) {
    const errMsg =
      data && typeof data.error === 'string'
        ? data.error
        : res.status === 401
          ? 'Please sign in with Google to use AI generation and import tools.'
          : res.status === 429
            ? 'Rate limit reached. Please wait a moment before retrying.'
            : `Request failed (${res.status}).`;
    throw new Error(errMsg);
  }

  return (data ?? {}) as T;
}
