import type { Job } from '../types';
import {
  ageLabel, caBadge, categoryClass, categoryLabel, foundLabel, isNewlyFound, matchTone, salaryLabel, salarySubLabel,
  urgencyClass,
} from '../lib';
import type { FilterState } from './Filters';

interface Props {
  jobs: Job[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onStatusChange: (id: number, status: string) => void;
  sort: FilterState['sort'];
  onSort: (sort: FilterState['sort']) => void;
  showBucketReason?: boolean;
}

function statusClass(status: string): string {
  if (status === 'Applied' || status === 'Recruiter Contacted') return 'applied';
  if (status === 'Interview Scheduled' || status === 'Interview Completed') return 'interview';
  if (status === 'Offer Received') return 'offer';
  return '';
}

export function JobTable({ jobs, selectedId, onSelect, onStatusChange, sort, onSort, showBucketReason }: Props) {
  const header = (key: FilterState['sort'], label: string) => (
    <th
      className="sortable"
      onClick={() => onSort(key)}
      title={`Sort by ${label.toLowerCase()}`}
      aria-sort={sort === key ? 'descending' : 'none'}
    >
      {label}{sort === key ? ' ↓' : ''}
    </th>
  );

  return (
    <div className="table-wrap">
      <table className="jobs">
        <thead>
          <tr>
            {header('match', 'Match')}
            {header('company', 'Role & employer')}
            {header('salary', 'Salary')}
            {header('found', 'Found')}
            {header('newest', 'Posted')}
            <th>Remote / CA</th>
            <th>Urgency</th>
            <th>Application</th>
            <th>Link</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const age = ageLabel(job.postedAt);
            const ca = caBadge(job);
            return (
              <tr
                key={job.id}
                className={selectedId === job.id ? 'selected' : undefined}
                onClick={() => onSelect(job.id)}
                tabIndex={0}
                onKeyDown={(event) => { if (event.key === 'Enter') onSelect(job.id); }}
              >
                <td className="col-match">
                  <div className={`match-badge ${matchTone(job.matchScore)}`}>
                    <span>{job.matchScore}%</span>
                    <span className="match-bar"><i style={{ width: `${job.matchScore}%` }} /></span>
                  </div>
                </td>
                <td className="col-role">
                  <div className="role-title">
                    {job.title}
                    {isNewlyFound(job.firstSeenAt) ? <span className="pill new">New</span> : null}
                  </div>
                  <div className="role-company">{job.company}</div>
                  <div className="role-meta">
                    <span className={`badge ${categoryClass(job.category)}`}>{categoryLabel(job.category)}</span>
                    {job.industry ? <span>{job.industry}</span> : null}
                    {job.companySize ? <span>· {job.companySize}</span> : null}
                    {job.hqState ? <span>· {job.hqState}</span> : null}
                    {job.blackOwned === 'Verified Black-owned' ? <span className="badge verified">Black-owned</span> : null}
                    {job.urgency === 'High' ? <span className="badge high">Urgent</span> : null}
                  </div>
                  {showBucketReason && job.bucketReason ? (
                    <div className="role-meta" style={{ color: '#8a5a12' }}>{job.bucketReason}</div>
                  ) : null}
                </td>
                <td className="col-salary">
                  <div className="salary">
                    {salaryLabel(job)}
                    <small>{salarySubLabel(job)}</small>
                  </div>
                </td>
                <td className="col-found">{foundLabel(job.firstSeenAt)}</td>
                <td className="col-posted">
                  <div className="posted">
                    {job.postedAt ? new Date(`${job.postedAt}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—'}
                    <small>{age.text}</small>
                  </div>
                </td>
                <td className="col-loc">
                  <div className="loc">
                    <span className={`badge ${ca.cls}`} title={ca.title}>{ca.label}</span>
                    <small>{job.remoteStatus.length > 34 ? `${job.remoteStatus.slice(0, 32)}…` : job.remoteStatus}</small>
                  </div>
                </td>
                <td className="col-urg">
                  <span className={`badge ${urgencyClass(job.urgency)}`}>{job.urgency}</span>
                </td>
                <td className="col-status" onClick={(event) => event.stopPropagation()}>
                  <select
                    className={`status-select ${statusClass(job.appStatus)}`}
                    value={job.appStatus}
                    onChange={(event) => onStatusChange(job.id, event.target.value)}
                    aria-label={`Application status for ${job.title}`}
                  >
                    {['Not Applied', 'Interested', 'Viewed', 'Applied', 'Recruiter Contacted', 'Interview Scheduled',
                      'Interview Completed', 'Offer Received', 'Rejected', 'No Longer Interested'].map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </td>
                <td className="col-link" onClick={(event) => event.stopPropagation()}>
                  <a className="apply-link" href={job.applyUrl} target="_blank" rel="noopener noreferrer">
                    Apply ↗
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
