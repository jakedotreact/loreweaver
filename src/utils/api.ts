export async function postJson<T = Record<string, unknown>>(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
        : `Request failed (${res.status}).`;
    throw new Error(errMsg);
  }

  return (data ?? {}) as T;
}
