import { PROFILE } from '../../profile';
import { getRoleFamily } from './index';
import type { RoleFamily } from './types';

/**
 * The role family the running process searches for.
 *
 * Kept in its own module so `roles/index.ts` stays a pure registry (no dependency
 * on the profile) and the engine can import the active family without a cycle.
 */
export const ACTIVE_ROLE_FAMILY: RoleFamily = getRoleFamily(PROFILE.roleFamilyId);
