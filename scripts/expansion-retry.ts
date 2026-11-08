export interface RetryResult {
  kind: string;
  platform?: string;
}

export function matchesRetryResult(result: RetryResult, retryPlatform: string | null): boolean {
  return retryPlatform
    ? result.kind === 'unreadable' && result.platform?.toLowerCase() === retryPlatform.toLowerCase()
    : result.kind === 'unknown';
}
