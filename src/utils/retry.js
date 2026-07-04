export function retryAsync(fn, options = {}) {
  const retries = options.retries ?? 3;
  const minTimeout = options.minTimeout ?? 1000;
  const maxTimeout = options.maxTimeout ?? 10000;
  const isRetryable = options.isRetryable ?? (() => true);
  const onRetry = options.onRetry ?? (() => {});
  let attempt = 0;

  let lastError;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      attempt++;
      if (attempt > retries || !isRetryable(error)) {
        throw error;
      }
      const timeout = Math.min(maxTimeout, minTimeout * 2 ** (attempt - 1));
      onRetry(error, attempt);
      await new Promise((resolve) => setTimeout(resolve, timeout));
    }
  }

  throw lastError;
}
