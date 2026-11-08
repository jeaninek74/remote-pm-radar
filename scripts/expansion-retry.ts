export interface RetryResult {
  kind: string;
  platform?: string;
}

export function matchesRetryResult(result: RetryResult, retryPlatform: string | null): boolean {
  return retryPlatform
    ? result.kind === 'unreadable' && result.platform?.toLowerCase() === retryPlatform.toLowerCase()
    : result.kind === 'unknown';
}

export function isAlreadyWrittenResult(result: RetryResult, retrying: boolean, retryPlatform: string | null): boolean {
  return !retrying || !matchesRetryResult(result, retryPlatform);
}
