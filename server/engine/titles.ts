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

/** True when the title names a role inside `family`. */
export function isRoleTitle(rawTitle: string, family: RoleFamily = ACTIVE_ROLE_FAMILY): boolean {
  const title = (rawTitle ?? '').trim();
  if (!title || title.length > MAX_TITLE_LENGTH) return false;
  if (!family.titlePatterns.some((re) => re.test(title))) return false;

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
