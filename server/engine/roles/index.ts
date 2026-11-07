import { PROJECT_MANAGEMENT } from './families/project-management';
import { DATA_ANALYTICS } from './families/data-analytics';
import { ENGINEERING } from './families/engineering';
import type { RoleFamily } from './types';

export type { RoleFamily, CompetencyGroup, GapRule, TitleFamilyRule, Lane, ScoringProfile, CategoryVocabulary } from './types';
export { BOTH } from './types';

/**
 * Every role family the engine can run.
 *
 * This registry is the only place that lists families. Adding a fourth family
 * means dropping a file into `roles/families/` and adding one line here — no
 * engine, profile or UI code changes.
 */
export const ROLE_FAMILIES: RoleFamily[] = [
  PROJECT_MANAGEMENT,
  DATA_ANALYTICS,
  ENGINEERING,
];

const BY_ID = new Map(ROLE_FAMILIES.map((family) => [family.id, family]));

/** Family used when a profile does not name one. */
export const DEFAULT_ROLE_FAMILY_ID = PROJECT_MANAGEMENT.id;

/** Look a family up by id, tolerating unknown ids from stale profiles. */
export function getRoleFamily(id?: string | null): RoleFamily {
  if (!id) return BY_ID.get(DEFAULT_ROLE_FAMILY_ID)!;
  const direct = BY_ID.get(id);
  if (direct) return direct;
  // Accept a few obvious aliases so hand-written profiles do not fail silently.
  const normalised = id.trim().toLowerCase().replace(/[\s_]+/g, '-');
  const alias: Record<string, string> = {
    pm: PROJECT_MANAGEMENT.id,
    'project-manager': PROJECT_MANAGEMENT.id,
    'project-program-management': PROJECT_MANAGEMENT.id,
    program: PROJECT_MANAGEMENT.id,
    data: DATA_ANALYTICS.id,
    analytics: DATA_ANALYTICS.id,
    'data-analyst': DATA_ANALYTICS.id,
    'data-science': DATA_ANALYTICS.id,
    eng: ENGINEERING.id,
    'software-engineering': ENGINEERING.id,
    'software-engineer': ENGINEERING.id,
    developer: ENGINEERING.id,
  };
  return BY_ID.get(normalised) ?? BY_ID.get(alias[normalised] ?? '') ?? BY_ID.get(DEFAULT_ROLE_FAMILY_ID)!;
}

/** True when the id names a family this build knows about. */
export function isKnownRoleFamily(id?: string | null): boolean {
  if (!id) return false;
  return BY_ID.has(id.trim().toLowerCase().replace(/[\s_]+/g, '-')) || getRoleFamily(id).id === id;
}

/** Compact list for diagnostics, docs and the settings surface. */
export function listRoleFamilies(): { id: string; label: string; shortLabel: string; lanes: string[] }[] {
  return ROLE_FAMILIES.map((family) => ({
    id: family.id,
    label: family.label,
    shortLabel: family.shortLabel,
    lanes: family.lanes.map((lane) => lane.label),
  }));
}
