/**
 * Modern async utilities following best practices
 */

/**
 * Promise that resolves after a delay (alias for sleep)
 */
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Timeout a promise with error handling
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out',
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs),
  );

  return Promise.race([promise, timeout]);
}

/**
 * Execute promises in parallel with concurrency limit
 */
export async function parallelLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  for (const task of tasks) {
    const promise = task().then((result) => {
      results.push(result);
      executing.splice(executing.indexOf(promise), 1);
    });

    executing.push(promise);

    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * Execute promises with allSettled pattern and error handling
 */
export async function safeAllSettled<T>(
  promises: Array<Promise<T>>,
): Promise<Array<{ success: true; value: T } | { success: false; error: Error }>> {
  const results = await Promise.allSettled(promises);

  return results.map((result) => {
    if (result.status === 'fulfilled') {
      return { success: true as const, value: result.value };
    }
    return {
      success: false as const,
      error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
    };
  });
}

/**
 * Batch operations with automatic chunking
 */
export async function batch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize = 10,
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }

  return results;
}
