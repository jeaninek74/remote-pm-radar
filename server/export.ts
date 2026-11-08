import ExcelJS from 'exceljs';
import { PROFILE } from './profile';
import { RULES } from './config';
import type { JobRow, RunRow, EmployerRowOut } from './queries';

const INK = 'FF0F1720';
const ACCENT = 'FFB4552A';
const PAPER = 'FFF4F1E9';

const HEADERS: { header: string; key: keyof JobRow; width: number }[] = [
  { header: 'Date Discovered', key: 'firstSeenAt', width: 18 },
  { header: 'Original Posting Date', key: 'postedAt', width: 20 },
  { header: 'Company Name', key: 'company', width: 26 },
  { header: 'Job Title', key: 'title', width: 44 },
  { header: 'Job Category', key: 'category', width: 15 },
  { header: 'Industry', key: 'industry', width: 22 },
  { header: 'Company Size', key: 'companySize', width: 14 },
  { header: 'Employer HQ State', key: 'hqState', width: 12 },
  { header: 'Remote Status', key: 'remoteStatus', width: 30 },
  { header: 'California Eligibility', key: 'caEligibility', width: 22 },
  { header: 'Employment Type', key: 'employmentType', width: 16 },
  { header: 'Minimum Annual Base Salary', key: 'salaryMin', width: 18 },
  { header: 'Maximum Annual Base Salary', key: 'salaryMax', width: 18 },
  { header: 'Hourly Rate (if applicable)', key: 'hourlyRate', width: 16 },
  { header: 'Salary Verification Source', key: 'salarySource', width: 34 },
  { header: 'Resume Match %', key: 'matchScore', width: 12 },
  { header: 'Best Matching Resume', key: 'bestResume', width: 32 },
  { header: 'Matching Qualifications', key: 'matchReasons', width: 60 },
  { header: 'Hiring Urgency', key: 'urgency', width: 12 },
  { header: 'Hiring Urgency Evidence', key: 'urgencyEvidence', width: 50 },
  { header: 'Black-Owned Business Verification', key: 'blackOwned', width: 26 },
  { header: 'Ownership Verification Source', key: 'ownershipSource', width: 44 },
  { header: 'Direct Employer Application Link', key: 'applyUrl', width: 52 },
  { header: 'Application Link Verified', key: 'linkVerifiedAt', width: 20 },
  { header: 'Job Requisition ID', key: 'requisitionId', width: 20 },
  { header: 'Job Status', key: 'bucket', width: 18 },
  { header: 'Application Status', key: 'appStatus', width: 20 },
  { header: 'Personal Notes', key: 'notes', width: 40 },
  { header: 'Last Verification Date', key: 'lastVerifiedAt', width: 20 },
];

const EXTRA_HEADERS = [
  'Posting Date Precision', 'California Eligibility Note', 'Salary Verification Detail',
  'Hard Requirements Not Met', 'Interview Date', 'Recruiter Notes', 'Applied On',
  'Follow-up Due', 'Source Board', 'Placement Reason',
];

function bucketLabel(bucket: string): string {
  switch (bucket) {
    case 'tab0': return 'Active — $90K–$110K';
    case 'tab1': return 'Active — $110K–$130K';
    case 'tab2': return 'Active — $150K+';
    case 'queue': return 'Needs verification';
    case 'archived': return 'Archived';
    default: return bucket;
  }
}

function caLabel(job: JobRow): string {
  switch (job.caEligibility) {
    case 'confirmed': return 'CA confirmed';
    case 'us_wide':
      return job.caNote.toLowerCase().includes('remote work arrangement needs verification')
        || job.bucketReason?.startsWith('Work arrangement not confirmed remote')
        ? 'US-wide — remote not confirmed'
        : 'US-wide remote';
    case 'state_restricted': return 'State-restricted';
    case 'not_us': return 'Non-US';
    default: return 'Unverified';
  }
}

function valueFor(job: JobRow, key: keyof JobRow): string | number | null {
  switch (key) {
    case 'matchReasons': return job.matchReasons.join(' | ');
    case 'gaps': return job.gaps.join(' | ');
    case 'caEligibility': return caLabel(job);
    case 'bucket': return bucketLabel(job.bucket);
    case 'category': return job.category === 'Hybrid' ? 'Business-tech' : job.category;
    case 'firstSeenAt': return job.firstSeenAt?.slice(0, 10) ?? '';
    case 'lastVerifiedAt': return job.lastVerifiedAt?.slice(0, 10) ?? '';
    case 'linkVerifiedAt': return job.linkVerifiedAt?.slice(0, 10) ?? '';
    case 'matchScore': return job.matchScore;
    case 'salaryMin': return job.salaryMin;
    case 'salaryMax': return job.salaryMax;
    case 'hourlyRate': return job.hourlyRate;
    default: return (job[key] as string | null) ?? '';
  }
}

interface SheetOptions {
  title: string;
  jobs: JobRow[];
  tabColor?: string;
}

function addJobSheet(workbook: ExcelJS.Workbook, { title, jobs, tabColor }: SheetOptions): void {
  const sheet = workbook.addWorksheet(title, {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { tabColor: { argb: tabColor ?? ACCENT } },
  });

  const columns: Partial<ExcelJS.Column>[] = [
    ...HEADERS.map((h) => ({ header: h.header, key: String(h.key), width: h.width })),
    ...EXTRA_HEADERS.map((h) => ({ header: h, key: h, width: 30 })),
  ];
  sheet.columns = columns;

  for (const job of jobs) {
    const row: Record<string, string | number | null> = {};
    for (const h of HEADERS) row[String(h.key)] = valueFor(job, h.key);
    row['Posting Date Precision'] = job.postedConfidence;
    row['California Eligibility Note'] = job.caNote;
    row['Salary Verification Detail'] = job.salaryNote ?? '';
    row['Hard Requirements Not Met'] = job.gaps.join(' | ');
    row['Interview Date'] = job.interviewAt ?? '';
    row['Recruiter Notes'] = job.recruiterNotes ?? '';
    row['Applied On'] = job.appliedAt ?? '';
    row['Follow-up Due'] = job.followUpAt ?? '';
    row['Source Board'] = job.source;
    row['Placement Reason'] = job.bucketReason ?? '';
    sheet.addRow(row);
  }

  const header = sheet.getRow(1);
  header.height = 30;
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 10 };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });

  sheet.eachRow((row, index) => {
    if (index === 1) return;
    row.height = 42;
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.font = { size: 9 };
    });
    if (index % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAPER } };
      });
    }
    const linkCell = row.getCell(23);
    const url = String(linkCell.value ?? '');
    if (/^https?:\/\//.test(url)) {
      linkCell.value = { text: url, hyperlink: url };
      linkCell.font = { color: { argb: 'FF1155CC' }, underline: true, size: 9 };
    }
    const salaryCell = row.getCell(12);
    if (typeof salaryCell.value === 'number') salaryCell.numFmt = '"$"#,##0';
    const salaryMaxCell = row.getCell(13);
    if (typeof salaryMaxCell.value === 'number') salaryMaxCell.numFmt = '"$"#,##0';
  });

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

export async function buildWorkbook(input: {
  jobs: JobRow[];
  employers: EmployerRowOut[];
  runs: RunRow[];
  stats: Record<string, string | number | null>;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = PROFILE.boardName;
  workbook.created = new Date();

  const tab0 = input.jobs.filter((j) => j.bucket === 'tab0');
  const tab1 = input.jobs.filter((j) => j.bucket === 'tab1');
  const tab2 = input.jobs.filter((j) => j.bucket === 'tab2');
  const queue = input.jobs.filter((j) => j.bucket === 'queue');
  const archived = input.jobs.filter((j) => j.bucket === 'archived');
  const tracked = input.jobs.filter((j) => j.appStatus && j.appStatus !== 'Not Applied');

  addJobSheet(workbook, { title: RULES.tab0Label, jobs: tab0, tabColor: 'FF7C8B3A' });
  addJobSheet(workbook, { title: RULES.tab1Label, jobs: tab1, tabColor: 'FFB4552A' });
  addJobSheet(workbook, { title: RULES.tab2Label, jobs: tab2, tabColor: 'FF0F1720' });
  addJobSheet(workbook, { title: 'Needs Verification', jobs: queue, tabColor: 'FF9A8C68' });
  addJobSheet(workbook, { title: 'Archived', jobs: archived, tabColor: 'FF6B7280' });
  addJobSheet(workbook, { title: 'Viewed - Applied', jobs: tracked, tabColor: 'FF3F6B4F' });

  const overview = workbook.addWorksheet('Summary');
  overview.columns = [
    { header: 'Metric', key: 'metric', width: 42 },
    { header: 'Value', key: 'value', width: 30 },
  ];
  for (const [metric, value] of Object.entries(input.stats)) {
    overview.addRow({ metric, value: value ?? '' });
  }
  overview.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
  });

  const employers = workbook.addWorksheet('Employer Database', { views: [{ state: 'frozen', ySplit: 1 }] });
  employers.columns = [
    { header: 'Employer', key: 'name', width: 34 },
    { header: 'Industry', key: 'industry', width: 22 },
    { header: 'Company Size', key: 'companySize', width: 14 },
    { header: 'HQ State', key: 'hqState', width: 10 },
    { header: 'Job Feed', key: 'ats', width: 18 },
    { header: 'Official Careers Page', key: 'careersUrl', width: 46 },
    { header: 'Black-Owned Status', key: 'ownershipStatus', width: 20 },
    { header: 'Ownership Source', key: 'ownershipSource', width: 46 },
    { header: 'Discovered Via', key: 'discoveredVia', width: 22 },
    { header: 'Last Searched', key: 'lastSearchedAt', width: 20 },
    { header: 'Last Result', key: 'lastStatus', width: 30 },
    { header: 'Open Tab Roles', key: 'openRoles', width: 14 },
  ];
  for (const employer of input.employers) {
    employers.addRow({
      ...employer,
      lastSearchedAt: employer.lastSearchedAt?.slice(0, 16) ?? 'Not yet searched',
      ownershipStatus: employer.blackOwned ? employer.ownershipStatus : 'Not a verified Black-owned business',
    });
  }
  employers.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
  });
  employers.eachRow((row, index) => {
    if (index === 1) return;
    const cell = row.getCell(6);
    const url = String(cell.value ?? '');
    if (/^https?:\/\//.test(url)) {
      cell.value = { text: url, hyperlink: url };
      cell.font = { color: { argb: 'FF1155CC' }, underline: true };
    }
  });

  const runs = workbook.addWorksheet('Refresh History', { views: [{ state: 'frozen', ySplit: 1 }] });
  runs.columns = [
    { header: 'Started', key: 'startedAt', width: 22 },
    { header: 'Finished', key: 'finishedAt', width: 22 },
    { header: 'Trigger', key: 'trigger', width: 12 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Employers Searched', key: 'employersSearched', width: 18 },
    { header: 'Sources Checked', key: 'sourcesChecked', width: 16 },
    { header: 'Sources Failed', key: 'sourcesFailed', width: 14 },
    { header: 'Postings Read', key: 'jobsFetched', width: 14 },
    { header: 'Roles Found', key: 'jobsMatched', width: 14 },
    { header: 'New Leads', key: 'newJobs', width: 12 },
    { header: 'Added to narrow band', key: 'addedTab1', width: 16 },
    { header: 'Added to top band', key: 'addedTab2', width: 14 },
    { header: 'Queued', key: 'queued', width: 10 },
    { header: 'Duplicates Removed', key: 'duplicates', width: 16 },
    { header: 'Archived', key: 'archived', width: 10 },
    { header: 'Closed', key: 'closed', width: 10 },
    { header: 'New Employers', key: 'newEmployers', width: 14 },
    { header: 'Links Checked', key: 'linksChecked', width: 14 },
    { header: 'Links Valid', key: 'linksValid', width: 12 },
    { header: 'Notes', key: 'message', width: 50 },
  ];
  for (const run of input.runs) {
    runs.addRow({ ...run, errors: undefined });
  }
  runs.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function buildCsv(jobs: JobRow[]): string {
  const headers = [...HEADERS.map((h) => h.header), ...EXTRA_HEADERS];
  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers.map(escape).join(',')];
  for (const job of jobs) {
    const values: unknown[] = [
      ...HEADERS.map((h) => valueFor(job, h.key)),
      job.postedConfidence,
      job.caNote,
      job.salaryNote ?? '',
      job.gaps.join(' | '),
      job.interviewAt ?? '',
      job.recruiterNotes ?? '',
      job.appliedAt ?? '',
      job.followUpAt ?? '',
      job.source,
      job.bucketReason ?? '',
    ];
    lines.push(values.map(escape).join(','));
  }
  return lines.join('\n');
}
