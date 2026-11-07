import { useMemo, useState } from 'react';
import type { Job } from '../types';
import { ageLabel, caBadge, categoryLabel, dateLabel, salaryLabel, salarySubLabel } from '../lib';

type BoardTab = 'tab1' | 'tab2' | 'nopay';
type Category = 'all' | 'Nontechnical' | 'Technical' | 'Hybrid';

const TABS: { key: BoardTab; name: string; range: string }[] = [
  { key: 'tab1', name: 'Tab 1', range: '$110K–$130K' },
  { key: 'tab2', name: 'Tab 2', range: '$150K+' },
  { key: 'nopay', name: 'Pay not published', range: 'remote, CA-eligible, no salary stated' },
];

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'all', label: 'All roles' },
  { key: 'Nontechnical', label: 'Nontechnical' },
  { key: 'Technical', label: 'Technical' },
  { key: 'Hybrid', label: 'Hybrid' },
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
    bands: { tab1: { label: string }; tab2: { label: string } };
  };
  jobs: Job[];
  refreshing: boolean;
  progress: string;
  lastRefresh: string | null;
  onRefresh: () => void;
  onAdvanced: () => void;
  onOpen: (id: number) => void;
}

/** Splits a board name so the last word can be accented, e.g. "Remote PM Radar". */
function splitTitle(name: string) {
  const parts = name.trim().split(' ');
  if (parts.length < 2) return <>{name}</>;
  const last = parts.pop();
  return <>{parts.join(' ')} <span>{last}</span></>;
}

export function SimpleBoard({ profile, jobs, refreshing, progress, lastRefresh, onRefresh, onAdvanced, onOpen }: Props) {
  const [tab, setTab] = useState<BoardTab>('tab1');
  const [category, setCategory] = useState<Category>('all');
  const [q, setQ] = useState('');

  const tab1 = useMemo(() => jobs.filter((job) => job.bucket === 'tab1'), [jobs]);
  const tab2 = useMemo(() => jobs.filter((job) => job.bucket === 'tab2'), [jobs]);
  const nopay = useMemo(
    () => jobs.filter((job) => job.bucket === 'unsalaried' || (job.bucket === 'queue' && isPayOnlyBlocker(job))),
    [jobs],
  );
  const active = tab === 'tab1' ? tab1 : tab === 'tab2' ? tab2 : nopay;

  const [urgentOnly, setUrgentOnly] = useState(false);
  /**
   * Immediate hires are counted across every tab, not the current one: the point of
   * the strip is to show that work is moving right now even when the visible tab is
   * quiet. Urgency only counts when the posting itself says so.
   */
  const urgent = useMemo(
    () => [...tab1, ...tab2, ...nopay].filter((job) => job.urgency === 'High'),
    [tab1, tab2, nopay],
  );

  const counts = useMemo(() => ({
    all: active.length,
    Nontechnical: active.filter((job) => job.category === 'Nontechnical').length,
    Technical: active.filter((job) => job.category === 'Technical').length,
    Hybrid: active.filter((job) => job.category === 'Hybrid').length,
  }), [active]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return active
      .filter((job) => {
        if (urgentOnly && job.urgency !== 'High') return false;
        if (category !== 'all' && job.category !== category) return false;
        if (needle) {
          const hay = `${job.title} ${job.company} ${job.industry ?? ''} ${job.descriptionExcerpt}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          Number(b.urgency === 'High') - Number(a.urgency === 'High') ||
          b.matchScore - a.matchScore ||
          (b.postedAt ?? '').localeCompare(a.postedAt ?? ''),
      );
  }, [active, category, q, urgentOnly]);

  const visible = tab === 'nopay' ? shown.slice(0, 80) : shown;
  const current = TABS.find((item) => item.key === tab)!;

  const tabCount = (key: BoardTab): number =>
    key === 'tab1' ? tab1.length : key === 'tab2' ? tab2.length : nopay.length;

  return (
    <div className="simple-shell">
      <header className="simple-head">
        <div>
          <h1 className="simple-title">
            {profile ? splitTitle(profile.boardName) : <>Remote PM <span>Radar</span></>}
          </h1>
          <p className="simple-sub">
            {tab1.length + tab2.length} salary-verified roles · {nopay.length} more where pay is not published
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
            className={`tab${tab === item.key ? ' on' : ''}${item.key === 'nopay' ? ' mute' : ''}`}
            onClick={() => { setTab(item.key); setCategory('all'); setQ(''); }}
          >
            <span className="tab-name">{item.name}</span>
            <span className="tab-range">{item.key === 'tab1' ? profile?.bands.tab1.label ?? item.range : item.key === 'tab2' ? profile?.bands.tab2.label ?? item.range : item.range}</span>
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
        {tab === 'tab1'
          ? 'Roles whose published starting salary is between $110,000 and $130,000.'
          : tab === 'tab2'
            ? 'Roles whose published starting salary is $150,000 or more — no upper cap.'
            : 'Fully remote, California-eligible project and program roles where the employer published no base salary. The pay is unknown, not estimated — open the posting to check before applying.'}
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

      {tab === 'nopay' && shown.length > visible.length ? (
        <p className="simple-balance" style={{ margin: '0 0 10px' }}>
          Showing the 80 closest matches of {shown.length} — use the search box to narrow, or the full dashboard for the rest.
        </p>
      ) : null}

      {shown.length === 0 ? (
        <div className="simple-empty">
          <p>Nothing in {current.name} matches this view right now.</p>
          <p className="muted">
            A role enters a salary tab only when it is fully remote, open to California, posted inside the window,
            linked to the employer's own posting, and publishes a base salary inside {current.range}.
          </p>
        </div>
      ) : (
        <ul className="joblist">
          {visible.map((job) => {
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
                  <div className="jobrow-badges">
                    <span className={`pill cat-${job.category.toLowerCase()}`}>{categoryLabel(job.category)}</span>
                    <span className={`pill ${ca.cls}`} title={ca.title}>{ca.label}</span>
                    {job.urgency === 'High' ? <span className="pill urgent">Urgent</span> : null}
                    {job.blackOwned === 'Verified Black-owned' ? <span className="pill bo">Black-owned</span> : null}
                  </div>
                  <div className="jobrow-links">
                    <a href={job.applyUrl} target="_blank" rel="noreferrer" className="apply-link">View job ↗</a>
                    <button className="detail-link" onClick={() => onOpen(job.id)}>Details</button>
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
