export function now(): number {
  return Date.now();
}

export function elapsed(startMs: number): number {
  return Date.now() - startMs;
}

/**
 * Race a promise against a timeout. The loser is abandoned; callers should
 * pass in an AbortController if they need to tear down real work.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
