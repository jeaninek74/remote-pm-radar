import { createPublicKey, verify as verifySignature } from 'node:crypto';
import type { JsonWebKey as NodeJsonWebKey } from 'node:crypto';

export interface GithubOidcPolicy {
  issuer: string;
  audience: string;
  repository: string;
  repositoryId: string;
  workflowRef: string;
  ref: string;
  eventNames: readonly string[];
}

export const BROWSER_PULL_OIDC_POLICY: GithubOidcPolicy = {
  issuer: 'https://token.actions.githubusercontent.com',
  audience: 'remote-pm-radar-browser-pull',
  repository: 'jeaninek74/remote-pm-radar',
  repositoryId: '1448647530',
  workflowRef: 'jeaninek74/remote-pm-radar/.github/workflows/browser-pull.yml@refs/heads/master',
  ref: 'refs/heads/master',
  eventNames: ['schedule', 'workflow_dispatch'],
};

type GithubJwksFetcher = (url: string) => Promise<JsonWebKey[]>;

interface CachedJwks {
  keys: JsonWebKey[];
  fetchedAt: number;
  lastUnknownKidRefreshAt: number;
}

interface ParsedJwt {
  headerPart: string;
  payloadPart: string;
  signaturePart: string;
  header: Record<string, unknown>;
  claims: Record<string, unknown>;
}

const JWKS_CACHE_MS = 60 * 60 * 1000;
const UNKNOWN_KID_REFRESH_MS = 5 * 60 * 1000;
const jwksCache = new Map<string, CachedJwks>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function decodeJwt(token: string): ParsedJwt | null {
  const parts = token.split('.');
  if (
    parts.length !== 3
    || !/^[A-Za-z0-9_-]+$/.test(parts[0])
    || !/^[A-Za-z0-9_-]+$/.test(parts[1])
    || (parts[2] !== '' && !/^[A-Za-z0-9_-]+$/.test(parts[2]))
  ) return null;
  try {
    const header: unknown = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const claims: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!isRecord(header) || !isRecord(claims)) return null;
    return {
      headerPart: parts[0],
      payloadPart: parts[1],
      signaturePart: parts[2],
      header,
      claims,
    };
  } catch {
    return null;
  }
}

function keyId(key: JsonWebKey): string | undefined {
  return (key as JsonWebKey & { kid?: string }).kid;
}

export function verifyJwtRs256(token: string, jwks: JsonWebKey[]): Record<string, unknown> | null {
  try {
    const parsed = decodeJwt(token);
    if (!parsed || parsed.header.alg !== 'RS256' || typeof parsed.header.kid !== 'string') return null;
    const jwk = jwks.find((key) => keyId(key) === parsed.header.kid);
    if (!jwk) return null;
    const publicKey = createPublicKey({ key: jwk as NodeJsonWebKey, format: 'jwk' });
    const signingInput = Buffer.from(`${parsed.headerPart}.${parsed.payloadPart}`, 'ascii');
    const signature = Buffer.from(parsed.signaturePart, 'base64url');
    return verifySignature('RSA-SHA256', signingInput, publicKey, signature) ? parsed.claims : null;
  } catch {
    return null;
  }
}

export function verifyGithubOidcClaims(
  claims: Record<string, unknown>,
  policy: GithubOidcPolicy,
  nowSec: number,
): boolean {
  const audience = claims.aud;
  const audienceMatches = audience === policy.audience
    || (Array.isArray(audience) && audience.includes(policy.audience));
  if (
    claims.iss !== policy.issuer
    || claims.repository !== policy.repository
    || String(claims.repository_id) !== policy.repositoryId
    || claims.workflow_ref !== policy.workflowRef
    || claims.ref !== policy.ref
    || !audienceMatches
    || typeof claims.event_name !== 'string'
    || !policy.eventNames.includes(claims.event_name)
  ) return false;

  if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= nowSec - 60) {
    return false;
  }
  for (const timeClaim of ['nbf', 'iat'] as const) {
    const value = claims[timeClaim];
    if (value !== undefined
      && (typeof value !== 'number' || !Number.isFinite(value) || value > nowSec + 60)) {
      return false;
    }
  }
  return true;
}

async function defaultFetchJwks(url: string): Promise<JsonWebKey[]> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`JWKS fetch failed: HTTP ${response.status}`);
  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.keys)) throw new Error('JWKS response has no keys array');
  return body.keys as JsonWebKey[];
}

async function fetchAndCacheJwks(
  url: string,
  fetchJwks: GithubJwksFetcher,
): Promise<JsonWebKey[] | null> {
  try {
    const keys = await fetchJwks(url);
    if (!Array.isArray(keys)) return null;
    const previous = jwksCache.get(url);
    jwksCache.set(url, {
      keys,
      fetchedAt: Date.now(),
      lastUnknownKidRefreshAt: previous?.lastUnknownKidRefreshAt ?? 0,
    });
    return keys;
  } catch {
    return null;
  }
}

export async function verifyGithubOidcToken(
  token: string,
  policy: GithubOidcPolicy = BROWSER_PULL_OIDC_POLICY,
  fetchJwks: GithubJwksFetcher = defaultFetchJwks,
): Promise<boolean> {
  try {
    const parsed = decodeJwt(token);
    if (!parsed || parsed.header.alg !== 'RS256' || typeof parsed.header.kid !== 'string') return false;

    const jwksUrl = `${policy.issuer.replace(/\/+$/, '')}/.well-known/jwks`;
    let cached = jwksCache.get(jwksUrl);
    let keys: JsonWebKey[];
    if (!cached || Date.now() - cached.fetchedAt >= JWKS_CACHE_MS) {
      const fetched = await fetchAndCacheJwks(jwksUrl, fetchJwks);
      if (!fetched) return false;
      keys = fetched;
      cached = jwksCache.get(jwksUrl);
    } else {
      keys = cached.keys;
    }

    if (!keys.some((key) => keyId(key) === parsed.header.kid)) {
      if (!cached) return false;
      const now = Date.now();
      if (now - cached.lastUnknownKidRefreshAt < UNKNOWN_KID_REFRESH_MS) return false;
      cached.lastUnknownKidRefreshAt = now;
      const refreshed = await fetchAndCacheJwks(jwksUrl, fetchJwks);
      if (!refreshed) return false;
      keys = refreshed;
    }

    const claims = verifyJwtRs256(token, keys);
    return claims !== null && verifyGithubOidcClaims(claims, policy, Math.floor(Date.now() / 1000));
  } catch {
    return false;
  }
}
