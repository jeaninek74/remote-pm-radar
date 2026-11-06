import { useMemo, useState } from 'react';
import type { Job } from '../types';
import { ageLabel, caBadge, categoryLabel, dateLabel, salaryLabel, salarySubLabel } from '../lib';

type SalaryTab = 'tab1' | 'tab2';
type Category = 'all' | 'Nontechnical' | 'Technical' | 'Hybrid';

const TABS: { key: SalaryTab; name: string; range: string }[] = [
  { key: 'tab1', name: 'Tab 1', range: '$110K–$130K' },
  { key: 'tab2', name: 'Tab 2', range: '$150K+' },
];

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'all', label: 'All roles' },
  { key: 'Nontechnical', label: 'Nontechnical' },
  { key: 'Technical', label: 'Technical' },
  { key: 'Hybrid', label: 'Hybrid' },
];

interface Props {
  jobs: Job[];
  refreshing: boolean;
  progress: string;
  lastRefresh: string | null;
  onRefresh: () => void;
  onAdvanced: () => void;
  onOpen: (id: number) => void;
}

export function SimpleBoard({ jobs, refreshing, progress, lastRefresh, onRefresh, onAdvanced, onOpen }: Props) {
  const [tab, setTab] = useState<SalaryTab>('tab1');
  const [category, setCategory] = useState<Category>('all');
  const [q, setQ] = useState('');

  const tab1 = useMemo(() => jobs.filter((job) => job.bucket === 'tab1'), [jobs]);
  const tab2 = useMemo(() => jobs.filter((job) => job.bucket === 'tab2'), [jobs]);
  const active = tab === 'tab1' ? tab1 : tab2;

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
        if (category !== 'all' && job.category !== category) return false;
        if (needle) {
          const hay = `${job.title} ${job.company} ${job.industry ?? ''} ${job.descriptionExcerpt}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.matchScore - a.matchScore) || ((b.postedAt ?? '').localeCompare(a.postedAt ?? '')));
  }, [active, category, q]);

  const current = TABS.find((item) => item.key === tab)!;

  return (
    <div className="simple-shell">
      <header className="simple-head">
        <div>
          <h1 className="simple-title">
            Remote PM <span>Radar</span>
          </h1>
          <p className="simple-sub">
            {tab1.length + tab2.length} verified roles
            {lastRefresh ? ` · updated ${lastRefresh}` : ''}
            <br />
            <span className="simple-balance">
              Tab 1: {tab1.length} in $110K–$130K · Tab 2: {tab2.length} at $150K+
            </span>
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
            className={`tab${tab === item.key ? ' on' : ''}`}
            onClick={() => setTab(item.key)}
          >
            <span className="tab-name">{item.name}</span>
            <span className="tab-range">{item.range}</span>
            <span className="tab-count">{item.key === 'tab1' ? tab1.length : tab2.length}</span>
          </button>
        ))}
      </div>

      <p className="tab-note">
        {tab === 'tab1'
          ? 'Roles whose published starting salary is between $110,000 and $130,000.'
          : 'Roles whose published starting salary is $150,000 or more — no upper cap.'}
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

      {shown.length === 0 ? (
        <div className="simple-empty">
          <p>Nothing in {current.name} matches this view right now.</p>
          <p className="muted">
            A role only enters a salary tab when it is fully remote, open to California, posted inside the window,
            linked to the employer's own posting, and publishes a base salary inside {current.range}. Roles missing
            any of that sit in Needs Verification on the full dashboard.
          </p>
        </div>
      ) : (
        <ul className="joblist">
          {shown.map((job) => {
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
                  <div className="jobrow-pay">{salaryLabel(job)}</div>
                  <div className="jobrow-paysub">{salarySubLabel(job)}</div>
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
