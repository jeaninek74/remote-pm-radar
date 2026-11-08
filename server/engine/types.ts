import type { ParsedSalary } from './salary';

/**
 * Applicant-tracking systems the engine can read.
 *
 * `workday` is not an open API but exposes a documented public JSON search
 * endpoint, so it is a first-class source rather than a manual link.
 */
export type Ats = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'recruitee' | 'smartrecruiters' | 'workday' | 'oracle' | 'dayforce' | 'icims' | 'ukg' | 'taleo' | 'successfactors';

export type CompanySize = 'Startup' | 'Small' | 'Midsize' | 'Large' | 'Enterprise';

export interface RawJob {
  source: string;
  ats?: Ats | null;
  board?: string | null;
  externalId: string;
  company: string;
  title: string;
  locations: string[];
  workplaceType?: string | null;
  isRemote?: boolean | null;
  restrictions?: string[] | null;
  descriptionHtml?: string | null;
  descriptionText?: string | null;
  applyUrl: string;
  linkType: 'employer' | 'job_board';
  postedAt?: string | null;
  postedConfidence?: 'confirmed' | 'inferred' | 'unknown';
  employmentType?: string | null;
  salary?: ParsedSalary | null;
  salarySource?: string | null;
  requisitionId?: string | null;
  industry?: string | null;
  companySize?: CompanySize | string | null;
  hqState?: string | null;
  companyWebsite?: string | null;
  /**
   * The posting is already stored and its detail page was not re-read this sweep: only its
   * presence on the board is being reported, so the stored row is marked seen and left alone.
   */
  unchanged?: boolean;
}

export interface BoardFetchResult {
  jobs: RawJob[];
  ok: boolean;
  error?: string;
  /**
   * The failure is the board's moment, not the board: a timeout, a 5xx, or Workday's
   * maintenance window. It is logged, but it must not count toward retiring the employer.
   */
  retryable?: boolean;
  /** Total postings on the board before title filtering. */
  totalListed: number;
  /** True when the employer time budget ended the read early: unseen postings are not evidence of closure. */
  truncated?: boolean;
}

export interface FeedSource {
  id: string;
  label: string;
  fetch: (pages: number) => Promise<RawJob[]>;
}

export interface EmployerRow {
  id: number;
  slug: string;
  ats: Ats | 'manual';
  name: string;
  industry: string | null;
  company_size: string | null;
  hq_state: string | null;
  careers_url: string | null;
  black_owned: boolean;
  ownership_status: string;
  ownership_source: string | null;
  last_searched_at: string | null;
  last_resolve_at: string | null;
  active: boolean;
}

export interface EvaluatedJob {
  jobKey: string;
  employerId: number | null;
  company: string;
  title: string;
  category: string;
  industry: string | null;
  companySize: string | null;
  hqState: string | null;
  remoteStatus: string;
  caEligibility: string;
  caNote: string;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryInterval: string | null;
  hourlyRate: number | null;
  salarySource: string | null;
  salaryNote: string | null;
  matchScore: number;
  bestResume: string;
  matchReasons: string[];
  gaps: string[];
  urgency: string;
  urgencyEvidence: string | null;
  blackOwnedVerification: string;
  ownershipSource: string | null;
  applyUrl: string;
  linkType: 'employer' | 'job_board';
  requisitionId: string | null;
  postedAt: string | null;
  postedSource: string | null;
  postedConfidence: string;
  /**
   * `unsalaried` is a live bucket, not a rejection: the posting is fully remote, in
   * window and points at the employer, but the employer publishes no base salary, so
   * it cannot be placed in either salary band. It is surfaced in its own tab instead
   * of being buried in the review queue.
   */
  bucket: 'tab0' | 'tab1' | 'tab2' | 'unsalaried' | 'queue' | 'archived' | 'excluded';
  bucketReason: string;
  descriptionExcerpt: string;
  source: string;
  remoteLabel: string;
}
