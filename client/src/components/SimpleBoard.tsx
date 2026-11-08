import { useMemo, useState } from 'react';
import type { Job } from '../types';
import { compareJobsByPostedDate } from '../job-sort';
import {
  ageLabel, caBadge, categoryLabel, dateLabel, foundLabel, isNewlyFound, salaryLabel, salarySubLabel,
} from '../lib';

type BoardTab = 'tab0' | 'tab1' | 'tab2' | 'nopay' | 'tracked';
type Category = 'all' | 'Nontechnical' | 'Technical' | 'Hybrid';

const TABS: { key: BoardTab; name: string; range: string }[] = [
  { key: 'tab0', name: 'Tab 1', range: '$90K–$110K' },
  { key: 'tab1', name: 'Tab 2', range: '$110K–$130K' },
  { key: 'tab2', name: 'Tab 3', range: '$150K+' },
  { key: 'nopay', name: 'Pay not published', range: 'remote, CA-eligible, no salary stated' },
  { key: 'tracked', name: 'Viewed / Applied', range: 'roles you checked off' },
];

/** A role leaves the search tabs once it has any status other than "Not Applied". */
function isTracked(job: Job): boolean {
  return Boolean(job.appStatus) && job.appStatus !== 'Not Applied';
}

/** Statuses at or past "Applied" keep the Applied box checked. */
const APPLIED_OR_LATER = new Set([
  'Applied', 'Recruiter Contacted', 'Interview Scheduled', 'Interview Completed', 'Offer Received', 'Rejected',
]);

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'all', label: 'All roles' },
  { key: 'Nontechnical', label: 'Nontechnical' },
  { key: 'Technical', label: 'Technical' },
  { key: 'Hybrid', label: 'Business-tech' },
];

/** Roles held back only because the employer published no base salary. */
function isPayOnlyBlocker(job: Job): boolean {
  // Only roles where no base salary figure exists at all. A role whose published minimum merely falls
  // in the $130,001-$149,999 gap is a different case and stays out of this tab.
  if (job.salaryMin !== null && job.salaryMin !== undefined) return false;
  return /salary|OTE|compensation/i.test(job.bucketReason ?? '');
}

interface Props {
  profile?: {
    boardName: string;
    bands: { tab0: { label: string }; tab1: { label: string }; tab2: { label: string } };
  };
  jobs: Job[];
  refreshing: boolean;
  progress: string;
  lastRefresh: string | null;
  onRefresh: () => void;
  onAdvanced: () => void;
  onOpen: (id: number) => void;
  onTrack: (id: number, status: string) => void;
}

/** Splits a board name so the last word can be accented, e.g. "Remote PM Radar". */
function splitTitle(name: string) {
  const parts = name.trim().split(' ');
  if (parts.length < 2) return <>{name}</>;
  const last = parts.pop();
  return <>{parts.join(' ')} <span>{last}</span></>;
}

export function SimpleBoard({ profile, jobs, refreshing, progress, lastRefresh, onRefresh, onAdvanced, onOpen, onTrack }: Props) {
  const [tab, setTab] = useState<BoardTab>('tab1');
  const [category, setCategory] = useState<Category>('all');
  const [q, setQ] = useState('');

  const open = useMemo(() => jobs.filter((job) => !isTracked(job)), [jobs]);
  const tracked = useMemo(() => jobs.filter(isTracked), [jobs]);
  const tab0 = useMemo(() => open.filter((job) => job.bucket === 'tab0'), [open]);
  const tab1 = useMemo(() => open.filter((job) => job.bucket === 'tab1'), [open]);
  const tab2 = useMemo(() => open.filter((job) => job.bucket === 'tab2'), [open]);
  const nopay = useMemo(
    () => open.filter((job) => job.bucket === 'unsalaried' || (job.bucket === 'queue' && isPayOnlyBlocker(job))),
    [open],
  );
  const active = tab === 'tab0' ? tab0 : tab === 'tab1' ? tab1 : tab === 'tab2' ? tab2 : tab === 'nopay' ? nopay : tracked;

  const [urgentOnly, setUrgentOnly] = useState(false);
  /**
   * Immediate hires are counted across every tab, not the current one: the point of
   * the strip is to show that work is moving right now even when the visible tab is
   * quiet. Urgency only counts when the posting itself says so.
   */
  const urgent = useMemo(
    () => [...tab0, ...tab1, ...tab2, ...nopay].filter((job) => job.urgency === 'High'),
    [tab0, tab1, tab2, nopay],
  );

  const counts = useMemo(() => {
    const listed = urgentOnly ? urgent : active;
    return {
      all: listed.length,
      Nontechnical: listed.filter((job) => job.category === 'Nontechnical').length,
      Technical: listed.filter((job) => job.category === 'Technical').length,
      Hybrid: listed.filter((job) => job.category === 'Hybrid').length,
    };
  }, [active, urgent, urgentOnly]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (urgentOnly ? urgent : active)
      .filter((job) => {
        if (category !== 'all' && job.category !== category) return false;
        if (needle) {
          const hay = `${job.title} ${job.company} ${job.industry ?? ''} ${job.descriptionExcerpt}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      })
      .sort(compareJobsByPostedDate);
  }, [active, category, q, urgent, urgentOnly]);

  /**
   * The board must never render as an empty page. When nothing has cleared every rule
   * — which is normal on a new deployment, or in a quiet week — show what the radar has
   * actually seen, newest posted first, so the page always reflects real postings rather than
   * a blank panel.
   */
  const fallback = useMemo(
    () => (tab === 'tracked' ? [] : open.filter((job) => job.bucket === 'queue').sort(compareJobsByPostedDate)),
    [open, tab],
  );
  const current = TABS.find((item) => item.key === tab)!;

  const tabCount = (key: BoardTab): number =>
    key === 'tab0' ? tab0.length : key === 'tab1' ? tab1.length : key === 'tab2' ? tab2.length : key === 'nopay' ? nopay.length : tracked.length;

  return (
    <div className="simple-shell">
      <header className="simple-head">
        <div>
          <h1 className="simple-title">
            {profile ? splitTitle(profile.boardName) : <>Remote PM <span>Radar</span></>}
          </h1>
          <p className="simple-sub">
            {tab0.length + tab1.length + tab2.length} salary-verified roles · {nopay.length} more where pay is not published
            {lastRefresh ? ` · updated ${lastRefresh}` : ''}
          </p>
        </div>
        <div className="simple-actions">
          <button className="refresh-btn" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'Searching…' : 'Refresh jobs now'}
          </button>
          <button className="ghost-btn" onClick={onAdvanced}>
            Full dashboard
          </button>
        </div>
      </header>

      {refreshing ? <div className="simple-progress">{progress || 'Searching employer boards…'}</div> : null}

      <div className="tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={tab === item.key}
            className={`tab${tab === item.key ? ' on' : ''}${item.key === 'nopay' || item.key === 'tracked' ? ' mute' : ''}`}
            onClick={() => { setTab(item.key); setCategory('all'); setQ(''); }}
          >
            <span className="tab-name">{item.name}</span>
            <span className="tab-range">{item.key === 'tab0' ? profile?.bands.tab0.label ?? item.range : item.key === 'tab1' ? profile?.bands.tab1.label ?? item.range : item.key === 'tab2' ? profile?.bands.tab2.label ?? item.range : item.range}</span>
            <span className="tab-count">{tabCount(item.key)}</span>
          </button>
        ))}
      </div>

      <div className={`urgent-strip${urgentOnly ? ' on' : ''}`}>
        <div>
          <strong>{urgent.length}</strong> {urgent.length === 1 ? 'role is' : 'roles are'} hiring immediately
          {urgent.length ? <span className="urgent-why"> — the posting itself says so</span> : null}
        </div>
        <button
          className="ghost-btn"
          onClick={() => setUrgentOnly((value) => !value)}
          disabled={urgent.length === 0}
        >
          {urgentOnly ? 'Show all roles' : 'Show immediate hires'}
        </button>
      </div>

      <p className="tab-note">
        {urgentOnly
          ? 'Untracked immediate hires across the salary tabs and pay-not-published roles.'
          : tab === 'tab0'
          ? 'Roles whose published starting salary is between $90,000 and $110,000.'
          : tab === 'tab1'
          ? 'Roles whose published starting salary is between $110,000 and $130,000.'
          : tab === 'tab2'
            ? 'Roles whose published starting salary is $150,000 or more — no upper cap.'
            : tab === 'nopay'
              ? 'Fully remote, California-eligible project and program roles where the employer published no base salary. The pay is unknown, not estimated — open the posting to check before applying.'
              : 'Roles you checked as Viewed or Applied. They stay here after every sweep, even once the posting closes. Uncheck a box to send a role back to its tab.'}
      </p>

      <div className="simple-controls">
        <input
          className="simple-search"
          placeholder="Search title, company, keyword…"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <div className="simple-chips">
          {CATEGORIES.map((item) => (
            <button
              key={item.key}
              className={`chip${category === item.key ? ' on' : ''}`}
              onClick={() => setCategory(item.key)}
            >
              {item.label}
              <span className="chip-count">{counts[item.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {urgentOnly ? <h2 className="urgent-heading">Immediate hires</h2> : null}

      {shown.length === 0 && !urgentOnly && fallback.length > 0 ? (
        <p className="simple-balance" style={{ margin: '0 0 10px' }}>
          Nothing has cleared every rule for {current.name} yet, so this is what the radar currently sees —
          the {fallback.length} queued postings, newest posted first.
        </p>
      ) : null}

      {shown.length === 0 && urgentOnly ? (
        <div className="simple-empty">
          <p>No immediate hires match the current search and category filters.</p>
        </div>
      ) : shown.length === 0 && tab === 'tracked' ? (
        <div className="simple-empty">
          <p>No roles checked yet.</p>
          <p className="muted">Tick “Viewed” or “Applied” on any role and it moves here.</p>
        </div>
      ) : shown.length === 0 && fallback.length === 0 ? (
        <div className="simple-empty">
          <p>The first sweep is still running.</p>
          <p className="muted">
            The radar is reading every employer board now; postings appear as they are verified. If this persists,
            press “Refresh jobs now”.
          </p>
        </div>
      ) : (
        <ul className="joblist">
          {(shown.length === 0 ? fallback : shown).map((job) => {
            const ca = caBadge(job);
            return (
              <li key={job.id} className="jobrow">
                <div className="jobrow-main">
                  <a className="jobrow-title" href={job.applyUrl} target="_blank" rel="noreferrer">
                    {job.title}
                  </a>
                  <div className="jobrow-company">
                    {job.company}
                    <span className="dot">·</span>
                    {job.industry ?? 'Industry not stated'}
                    <span className="dot">·</span>
                    {job.companySize ?? 'Size not stated'}
                    {job.hqState ? <><span className="dot">·</span>{job.hqState}</> : null}
                  </div>
                  <p className="jobrow-desc">{job.descriptionExcerpt}</p>
                </div>
                <div className="jobrow-side">
                  <div className={`jobrow-pay${job.salaryMin ? '' : ' muted-pay'}`}>
                    {job.salaryMin ? salaryLabel(job) : 'Pay not published'}
                  </div>
                  <div className="jobrow-paysub">
                    {job.salaryMin ? salarySubLabel(job) : 'Check the posting — the employer states no base salary.'}
                  </div>
                  <div className="jobrow-meta">
                    <span>{dateLabel(job.postedAt)}</span>
                    <span className="dim">{ageLabel(job.postedAt).text}</span>
                  </div>
                  <div className="jobrow-meta"><span className="dim">{foundLabel(job.firstSeenAt)}</span></div>
                  <div className="jobrow-badges">
                    {isNewlyFound(job.firstSeenAt) ? <span className="pill new">New</span> : null}
                    <span className={`pill cat-${job.category.toLowerCase()}`}>{categoryLabel(job.category)}</span>
                    <span className={`pill ${ca.cls}`} title={ca.title}>{ca.label}</span>
                    {job.urgency === 'High' ? <span className="pill urgent">Urgent</span> : null}
                    {job.blackOwned === 'Verified Black-owned' ? <span className="pill bo">Black-owned</span> : null}
                  </div>
                  <div className="jobrow-links">
                    <a href={job.applyUrl} target="_blank" rel="noreferrer" className="apply-link">View job ↗</a>
                    <button className="detail-link" onClick={() => onOpen(job.id)}>Details</button>
                  </div>
                  <div className="jobrow-track">
                    <label>
                      <input
                        type="checkbox"
                        checked={isTracked(job)}
                        onChange={(event) => onTrack(job.id, event.target.checked ? 'Viewed' : 'Not Applied')}
                      />
                      Viewed
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={APPLIED_OR_LATER.has(job.appStatus)}
                        onChange={(event) => onTrack(job.id, event.target.checked ? 'Applied' : 'Viewed')}
                      />
                      Applied
                    </label>
                    {isTracked(job) && !APPLIED_OR_LATER.has(job.appStatus) && job.appStatus !== 'Viewed'
                      ? <span className="dim">{job.appStatus}</span> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="simple-foot">
        Employer career sites only · every link opens the employer's own posting · salaries are the published minimum
      </footer>
    </div>
  );
}
