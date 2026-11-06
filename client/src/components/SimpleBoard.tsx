import { useMemo, useState } from 'react';
import type { Job } from '../types';
import { ageLabel, caBadge, categoryLabel, dateLabel, salaryLabel, salarySubLabel } from '../lib';

type Lane = 'all' | 'tab1' | 'tab2' | 'Nontechnical' | 'Technical' | 'Hybrid';

const LANES: { key: Lane; label: string }[] = [
  { key: 'all', label: 'All roles' },
  { key: 'tab1', label: '$110K–$130K' },
  { key: 'tab2', label: '$150K+' },
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
  const [lane, setLane] = useState<Lane>('all');
  const [q, setQ] = useState('');

  const active = useMemo(() => jobs.filter((job) => job.bucket === 'tab1' || job.bucket === 'tab2'), [jobs]);

  const counts = useMemo(() => ({
    all: active.length,
    tab1: active.filter((job) => job.bucket === 'tab1').length,
    tab2: active.filter((job) => job.bucket === 'tab2').length,
    Nontechnical: active.filter((job) => job.category === 'Nontechnical').length,
    Technical: active.filter((job) => job.category === 'Technical').length,
    Hybrid: active.filter((job) => job.category === 'Hybrid').length,
  }), [active]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return active
      .filter((job) => {
        if (lane === 'tab1' && job.bucket !== 'tab1') return false;
        if (lane === 'tab2' && job.bucket !== 'tab2') return false;
        if ((lane === 'Nontechnical' || lane === 'Technical' || lane === 'Hybrid') && job.category !== lane) return false;
        if (needle) {
          const hay = `${job.title} ${job.company} ${job.industry ?? ''} ${job.descriptionExcerpt}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.matchScore - a.matchScore) || ((b.postedAt ?? '').localeCompare(a.postedAt ?? '')));
  }, [active, lane, q]);

  return (
    <div className="simple-shell">
      <header className="simple-head">
        <div>
          <h1 className="simple-title">
            Remote PM <span>Radar</span>
          </h1>
          <p className="simple-sub">
            {active.length} verified remote roles
            {lastRefresh ? ` · updated ${lastRefresh}` : ''}
            <br />
            <span className="simple-balance">
              {counts.Nontechnical} nontechnical · {counts.Technical} technical · {counts.Hybrid} hybrid
              — both lanes are searched with equal priority
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

      <div className="simple-controls">
        <input
          className="simple-search"
          placeholder="Search title, company, keyword…"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <div className="simple-chips">
          {LANES.map((item) => (
            <button
              key={item.key}
              className={`chip${lane === item.key ? ' on' : ''}`}
              onClick={() => setLane(item.key)}
            >
              {item.label}
              <span className="chip-count">{counts[item.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="simple-empty">
          <p>No roles match this view right now.</p>
          <p className="muted">
            The board only shows fully remote, California-eligible roles posted in the last 14 days with a published
            base salary in one of the two bands. Try “All roles”, or press refresh to run a new search.
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
        Employer career sites only · every link opens the employer’s own posting · salaries are the published minimum
      </footer>
    </div>
  );
}
