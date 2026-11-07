export type Bucket = 'tab1' | 'tab2' | 'queue' | 'archived';
export type Category = 'Technical' | 'Nontechnical' | 'Hybrid';
export type Urgency = 'High' | 'Medium' | 'Low' | 'Unknown';

export interface Job {
  id: number;
  jobKey: string;
  company: string;
  title: string;
  category: Category;
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
  urgency: Urgency;
  urgencyEvidence: string | null;
  blackOwned: string;
  ownershipSource: string | null;
  applyUrl: string;
  linkType: string;
  linkStatus: string | null;
  linkVerifiedAt: string | null;
  requisitionId: string | null;
  postedAt: string | null;
  postedConfidence: string;
  firstSeenAt: string;
  lastVerifiedAt: string | null;
  bucket: Bucket;
  bucketReason: string | null;
  descriptionExcerpt: string;
  source: string;
  appStatus: string;
  notes: string | null;
  interviewAt: string | null;
  recruiterNotes: string | null;
  appliedAt: string | null;
  followUpAt: string | null;
}

export interface Stats {
  activeJobs: number;
  tab1: number;
  tab2: number;
  newToday: number;
  new24h: number;
  nontechnical: number;
  technical: number;
  hybrid: number;
  urgent: number;
  blackOwnedEmployers: number;
  blackOwnedJobs: number;
  employersTracked: number;
  employersSearched: number;
  statesSearched: number;
  queue: number;
  archived: number;
  lastRefresh: string | null;
  lastRefreshMessage: string | null;
  lastRunStatus: string | null;
  sourcesOk: number;
  sourcesFailed: number;
  windowDays: number;
  tab1Min: number;
  tab1Max: number;
  tab2Min: number;
  appStatuses: string[];
}

export interface SourceHealth {
  source: string;
  label: string;
  ok: boolean | null;
  lastAttempt: string | null;
  lastOk: string | null;
  lastJobs: number | null;
  error: string | null;
  attempts: number;
  failures: number;
}

export interface Run {
  id: number;
  trigger: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  employersSearched: number;
  sourcesChecked: number;
  sourcesFailed: number;
  jobsFetched: number;
  jobsMatched: number;
  newJobs: number;
  addedTab1: number;
  addedTab2: number;
  queued: number;
  duplicates: number;
  archived: number;
  closed: number;
  newEmployers: number;
  linksChecked: number;
  linksValid: number;
  progress: string | null;
  errors: { source: string; message: string }[];
  message: string | null;
}

export interface Employer {
  id: number;
  name: string;
  ats: string;
  slug: string;
  industry: string | null;
  companySize: string | null;
  hqState: string | null;
  careersUrl: string | null;
  blackOwned: boolean;
  ownershipStatus: string;
  ownershipSource: string | null;
  discoveredVia: string | null;
  lastSearchedAt: string | null;
  lastStatus: string | null;
  jobsSeen: number;
  active: boolean;
  openRoles: number;
}

export interface Bootstrap {
  stats: Stats;
  runs: Run[];
  sources: SourceHealth[];
  queueReasons: { reason: string; count: number }[];
  nextRefresh: string | null;
  cronEnabled: boolean;
  cronExpression: string;
  windowDays: number;
  profile: {
    boardName: string;
    owner: string;
    roleFamilyId: string;
    roleFamily: string;
    roleFamilyLabel: string;
    shortLabel: string;
    jobNoun: string;
    lanes: { id: string; label: string }[];
    windowDays: number;
    bands: { tab1: { min: number; max: number | null; label: string }; tab2: { min: number; max: number | null; label: string } };
    eligibleStates: string[];
    source: string;
  };
  refreshing: boolean;
}
