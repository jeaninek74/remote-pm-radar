import type { ParsedSalary } from './salary';

export type Ats = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'recruitee' | 'smartrecruiters';

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
}

export interface BoardFetchResult {
  jobs: RawJob[];
  ok: boolean;
  error?: string;
  /** Total postings on the board before title filtering. */
  totalListed: number;
}

export interface FeedSource {
  id: string;
  label: string;
  fetch: (pages: number) => Promise<RawJob[]>;
}

export interface EmployerRow {
  id: number;
  slug: string;
  ats: Ats;
  name: string;
  industry: string | null;
  company_size: string | null;
  hq_state: string | null;
  careers_url: string | null;
  black_owned: boolean;
  ownership_status: string;
  ownership_source: string | null;
  last_searched_at: string | null;
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
  bucket: 'tab1' | 'tab2' | 'queue' | 'archived' | 'excluded';
  bucketReason: string;
  descriptionExcerpt: string;
  source: string;
  remoteLabel: string;
}
