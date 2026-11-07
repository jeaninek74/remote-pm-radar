/**
 * Title taxonomy.
 *
 * The engine holds no title knowledge of its own: every pattern comes from a
 * `RoleFamily` (see `roles/`). Callers either pass a family explicitly or rely on
 * the family selected by the active profile.
 *
 * Deliberately broad (employers invent titles constantly) but rejects roles that
 * only mention the profession incidentally, e.g. "Software Engineer, Project
 * Atlas" is not a project-management role.
 */

import { ACTIVE_ROLE_FAMILY } from './roles/active';
import { getRoleFamily } from './roles';
import type { RoleFamily } from './roles/types';

const MAX_TITLE_LENGTH = 160;

/**
 * Master prompt §9: at Black-owned employers the search also covers "Operations Managers with
 * project responsibilities" and PMO leaders. The title alone admits the posting to evaluation;
 * `evaluateRaw` still requires the description to describe project or program work.
 */
export const OWNERSHIP_WATCH_TITLE = /\b(?:operations|business operations)\s+(?:manager|director|lead|leader)\b|\bchief of staff\b/i;

export function isOwnershipWatchTitle(rawTitle: string, employer?: { black_owned?: boolean | null } | null): boolean {
  return employer?.black_owned === true && OWNERSHIP_WATCH_TITLE.test(rawTitle ?? '');
}

/** True when the title names a role inside `family` (or a watched role at a Black-owned employer). */
export function isRoleTitle(
  rawTitle: string,
  family: RoleFamily = ACTIVE_ROLE_FAMILY,
  employer?: { black_owned?: boolean | null } | null,
): boolean {
  const title = (rawTitle ?? '').trim();
  if (!title || title.length > MAX_TITLE_LENGTH) return false;
  const watched = isOwnershipWatchTitle(title, employer);
  if (!watched && !family.titlePatterns.some((re) => re.test(title))) return false;

  // A disqualified adjacent title only passes when it also names the target role.
  if (family.disqualifiers.some((re) => re.test(title))) {
    return family.disqualifiedAllow ? family.disqualifiedAllow.test(title) : false;
  }
  return true;
}

/** True when the title is too junior for the candidate the board is built for. */
export function isJuniorTitle(title: string, family: RoleFamily = ACTIVE_ROLE_FAMILY): boolean {
  return family.juniorPattern.test(title ?? '');
}

/** Normalised title family used for filtering and duplicate detection. */
export function titleFamily(rawTitle: string, family: RoleFamily = ACTIVE_ROLE_FAMILY): string {
  const t = (rawTitle ?? '').toLowerCase();
  for (const rule of family.titleFamilies) {
    if (rule.patterns.some((re) => re.test(t))) return rule.label;
  }
  return family.defaultTitleFamily;
}

/** Every display family for the active family, in priority order. */
export function titleFamilies(family: RoleFamily = ACTIVE_ROLE_FAMILY): string[] {
  return family.titleFamilies.map((rule) => rule.label);
}

/** Search terms for ATS feeds that need a query string instead of a full board dump. */
export function searchTerms(family: RoleFamily = ACTIVE_ROLE_FAMILY): string[] {
  return family.searchTerms;
}

/* ------------------------------------------------------------------ legacy API
 *
 * The original build was PM-only, and several feed adapters still call the
 * PM-named helpers. They now delegate to the active family so behaviour follows
 * the profile instead of a hardcoded profession.
 */

/** @deprecated Use `isRoleTitle` with an explicit family. */
export function isPmTitle(rawTitle: string): boolean {
  return isRoleTitle(rawTitle, ACTIVE_ROLE_FAMILY);
}

/** Resolve a family by id for callers that switch families at runtime. */
export function roleFamily(id?: string | null): RoleFamily {
  return getRoleFamily(id);
}
