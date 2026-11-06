import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Bootstrap, Employer, Job, Run, SourceHealth } from './types';
import {
  download, loadBootstrap, loadEmployers, loadJobs, loadRuns, refreshStatus, saveTracking, shortDateTime, startRefresh,
} from './lib';
import { KpiBand } from './components/KpiBand';
import { DEFAULT_FILTERS, Filters } from './components/Filters';
import type { FilterState } from './components/Filters';
import { JobTable } from './components/JobTable';
import { JobDrawer } from './components/JobDrawer';
import { EmployersTab } from './components/EmployersTab';
import { RunsTab } from './components/RunsTab';
import { HowTo } from './components/HowTo';

type TabKey = 'tab1' | 'tab2' | 'queue' | 'archive' | 'employers' | 'history';

const TAB_LABELS: Record<TabKey, string> = {
  tab1: '$110K–$130K',
  tab2: '$150K+',
  queue: 'Needs verification',
  archive: 'Archived',
  employers: 'Employer database',
  history: 'Refresh history',
};

export default function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [sources, setSources] = useState<SourceHealth[]>([]);
  const [tab, setTab] = useState<TabKey>('tab1');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showHowTo, setShowHowTo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    window.setTimeout(() => setToast(null), 5200);
  }, []);

  const loadAll = useCallback(async () => {
    const [bootstrap, jobPayload] = await Promise.all([loadBootstrap(), loadJobs()]);
    setBoot(bootstrap);
    setJobs(jobPayload.jobs);
    setRefreshing(bootstrap.refreshing);
    if (bootstrap.refreshing && bootstrap.runs[0]) {
      setProgress(bootstrap.runs[0].progress ?? 'Refreshing…');
      if (pollRef.current === null) {
        pollRef.current = window.setInterval(() => void poll(), 3000);
      }
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const status = await refreshStatus();
      if (status.run) setProgress(status.run.progress ?? 'Refreshing…');
      if (!status.refreshing && status.run?.status !== 'running') {
        if (pollRef.current !== null) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
        setRefreshing(false);
        setProgress('');
        await loadAll();
        const finished = status.run;
        if (finished) {
          notify(`Refresh complete — ${finished.newJobs} new leads, ${finished.addedTab1 + finished.addedTab2} placed in salary tabs.`);
        }
      }
    } catch {
      /* keep polling through transient errors */
    }
  }, [loadAll, notify]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadAll();
      } catch (err) {
        if (!cancelled) setLoadError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, [loadAll]);

  const loadEmployerData = useCallback(async () => {
    const payload = await loadEmployers();
    setEmployers(payload.employers);
  }, []);

  const loadHistory = useCallback(async () => {
    const payload = await loadRuns();
    setRuns(payload.runs);
    setSources(payload.sources);
  }, []);

  useEffect(() => {
    if (tab === 'employers' && employers.length === 0) {
      void loadEmployerData().catch(() => notify('Could not load the employer database.', true));
    }
    if (tab === 'history') {
      void loadHistory().catch(() => notify('Could not load refresh history.', true));
    }
  }, [tab, employers.length, loadEmployerData, loadHistory, notify]);

  const triggerRefresh = useCallback(async () => {
    setRefreshing(true);
    setProgress('Starting refresh…');
    try {
      const result = await startRefresh();
      setProgress(result.alreadyRunning ? 'A refresh is already running…' : 'Searching employer boards…');
      if (pollRef.current === null) pollRef.current = window.setInterval(() => void poll(), 2500);
    } catch (err) {
      setRefreshing(false);
      notify((err as Error).message, true);
    }
  }, [notify, poll]);

  const handleStatus = useCallback(async (id: number, status: string) => {
    const previous = jobs;
    setJobs((current) => current.map((job) => (job.id === id ? { ...job, appStatus: status } : job)));
    try {
      const result = await saveTracking(id, { appStatus: status });
      setJobs((current) => current.map((job) => (job.id === id ? result.job : job)));
    } catch {
      setJobs(previous);
      notify('Could not save that status — try again.', true);
    }
  }, [jobs, notify]);

  const handleUpdated = useCallback((updated: Job) => {
    setJobs((current) => current.map((job) => (job.id === updated.id ? updated : job)));
  }, []);

  const tabJobs = useMemo(() => {
    const bucket = tab === 'tab1' ? 'tab1' : tab === 'tab2' ? 'tab2' : tab === 'queue' ? 'queue' : 'archived';
    return jobs.filter((job) => job.bucket === bucket);
  }, [jobs, tab]);

  const visibleJobs = useMemo(() => {
    if (tab === 'employers' || tab === 'history') return [];
    const needle = filters.q.trim().toLowerCase();
    const now = Date.now();
    const withinMs = filters.within === '24h' ? 86_400_000 : filters.within === '72h' ? 3 * 86_400_000 : 7 * 86_400_000;

    const filtered = tabJobs.filter((job) => {
      if (needle) {
        const haystack = `${job.title} ${job.company} ${job.industry ?? ''} ${job.descriptionExcerpt}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (filters.category !== 'All' && job.category !== filters.category) return false;
      if (filters.urgency !== 'All' && job.urgency !== filters.urgency) return false;
      if (filters.industry !== 'All' && job.industry !== filters.industry) return false;
      if (filters.size !== 'All' && job.companySize !== filters.size) return false;
      if (filters.state !== 'All' && job.hqState !== filters.state) return false;
      if (filters.employment !== 'All' && job.employmentType !== filters.employment) return false;
      if (filters.appStatus !== 'All' && job.appStatus !== filters.appStatus) return false;
      if (filters.blackOwned && job.blackOwned !== 'Verified Black-owned') return false;
      if (filters.minMatch > 0 && job.matchScore < filters.minMatch) return false;
      if (filters.within !== 'any') {
        if (!job.postedAt) return false;
        const posted = new Date(`${job.postedAt}T00:00:00Z`).getTime();
        if (now - posted > withinMs) return false;
      }
      return true;
    });

    const sorted = [...filtered];
    switch (filters.sort) {
      case 'newest':
        sorted.sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''));
        break;
      case 'salary':
        sorted.sort((a, b) => (b.salaryMin ?? 0) - (a.salaryMin ?? 0));
        break;
      case 'company':
        sorted.sort((a, b) => a.company.localeCompare(b.company));
        break;
      default:
        sorted.sort((a, b) => b.matchScore - a.matchScore || (b.postedAt ?? '').localeCompare(a.postedAt ?? ''));
    }
    return sorted;
  }, [filters, tab, tabJobs]);

  const selected = jobs.find((job) => job.id === selectedId) ?? null;

  const counts = useMemo(() => ({
    tab1: jobs.filter((job) => job.bucket === 'tab1').length,
    tab2: jobs.filter((job) => job.bucket === 'tab2').length,
    queue: jobs.filter((job) => job.bucket === 'queue').length,
    archive: jobs.filter((job) => job.bucket === 'archived').length,
    employers: employers.length || boot?.stats.employersTracked || 0,
    history: runs.length || boot?.runs.length || 0,
  }), [jobs, employers.length, boot, runs.length]);

  if (loading) {
    return <div className="loading">Loading the radar…</div>;
  }

  if (loadError && !boot) {
    return (
      <div className="loading">
        Could not reach the radar API: {loadError}
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  const emptyState = () => {
    if (tab === 'queue') {
      return (
        <div className="empty">
          <h3>The verification queue is clear</h3>
          <p>
            Nothing is waiting on a rule check. Roles land here when a salary is missing, California eligibility is
            unclear, only a last-updated date exists, or the only link found was a job board.
          </p>
        </div>
      );
    }
    if (tab === 'archive') {
      return (
        <div className="empty">
          <h3>Nothing archived yet</h3>
          <p>Roles move here when they pass the seven-day window or disappear from the employer's board.</p>
        </div>
      );
    }
    return (
      <div className="empty">
        <h3>No verified roles in this tab yet</h3>
        <p>
          A role only appears here when the employer publishes a base salary in band, the posting is fully remote and
          California-eligible, it was posted in the last seven days, and the application link is the employer's own.
          Press <strong>Refresh jobs now</strong> to search the employer database.
        </p>
        <button className="btn" onClick={() => void triggerRefresh()} disabled={refreshing}>Refresh jobs now</button>
      </div>
    );
  };

  return (
    <div className="shell">
      <header className="masthead">
        <div className="masthead-inner">
          <div>
            <div className="wordmark">
              <h1>Remote PM <span>Radar</span></h1>
              <div className="tagline">Project &amp; Program Management · fully remote · California-eligible</div>
            </div>
            <p className="masthead-sub">
              Verified against employer job boards every four hours. Two salary bands, one verification queue,
              and every field traceable to a source — no estimated salaries, no hybrid roles wearing a remote badge.
            </p>
          </div>
          <div className="masthead-actions">
            <div className="refresh-cluster">
              <button className="btn primary" onClick={() => void triggerRefresh()} disabled={refreshing}>
                {refreshing ? 'Refreshing…' : 'Refresh jobs now'}
              </button>
              <div className="refresh-meta">
                <div>Last refresh: <strong>{shortDateTime(boot?.stats.lastRefresh)}</strong></div>
                <div>
                  {boot?.cronEnabled
                    ? `Scheduled every 4 hours${boot.nextRefresh ? ` · next ${shortDateTime(boot.nextRefresh)}` : ''}`
                    : 'Scheduled refresh disabled'}
                </div>
              </div>
            </div>
            <button className="btn ghost" onClick={() => setShowHowTo(true)}>How to use</button>
            <button className="btn ghost" onClick={() => download('/api/export.xlsx')}>Export Excel</button>
            <button className="btn ghost" onClick={() => download(`/api/export.csv?bucket=${tab === 'archive' ? 'archived' : tab}`)}>
              CSV
            </button>
          </div>
        </div>
      </header>

      {refreshing ? (
        <div className="progress-strip">
          <span className="dot" />
          <span>{progress || 'Refreshing…'}</span>
          <span style={{ marginLeft: 'auto', opacity: 0.75 }}>
            Searching employer boards, feeds, links — this can take a couple of minutes.
          </span>
        </div>
      ) : null}

      {boot ? <KpiBand stats={boot.stats} nextRefresh={boot.nextRefresh} cronEnabled={boot.cronEnabled} /> : null}

      <nav className="tabbar">
        <div className="tabbar-inner">
          {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
            <button
              key={key}
              className={`tab${tab === key ? ' active' : ''}`}
              onClick={() => { setTab(key); setSelectedId(null); }}
            >
              {TAB_LABELS[key]}
              <span className="count">{counts[key]}</span>
            </button>
          ))}
        </div>
      </nav>

      {tab !== 'employers' && tab !== 'history' ? (
        <Filters
          value={filters}
          onChange={setFilters}
          jobs={tabJobs}
          total={tabJobs.length}
          matched={visibleJobs.length}
        />
      ) : null}

      <main className="content">
        {tab === 'employers' ? <EmployersTab employers={employers} /> : null}
        {tab === 'history' ? <RunsTab runs={runs.length ? runs : (boot?.runs ?? [])} sources={sources.length ? sources : (boot?.sources ?? [])} /> : null}
        {tab !== 'employers' && tab !== 'history' ? (
          visibleJobs.length ? (
            <JobTable
              jobs={visibleJobs}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onStatusChange={(id, status) => void handleStatus(id, status)}
              sort={filters.sort}
              onSort={(sort) => setFilters({ ...filters, sort })}
              showBucketReason={tab === 'queue' || tab === 'archive'}
            />
          ) : emptyState()
        ) : null}
      </main>

      <footer className="footer">
        <div>
          Sources: Greenhouse, Lever, Ashby, Workable, Recruitee and SmartRecruiters employer boards, plus
          Himalayas, Remotive and Remote&nbsp;OK for discovery. Every placement decision is recorded in Refresh history.
        </div>
        <div>
          Salary bands use the published minimum only. Ownership labels require a citable source.
        </div>
      </footer>

      {selected ? (
        <JobDrawer job={selected} onClose={() => setSelectedId(null)} onUpdated={handleUpdated} />
      ) : null}

      {showHowTo ? <HowTo onClose={() => setShowHowTo(false)} /> : null}

      {toast ? <div className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div> : null}
    </div>
  );
}
