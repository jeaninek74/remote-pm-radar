import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Bootstrap, Employer, Job, Run, SourceHealth } from './types';
import { download, loadBootstrap, loadEmployers, loadJobs, loadRuns, refreshStatus, saveTracking, shortDateTime, splitBoardName, startRefresh, cronLabel } from './lib';
import { KpiBand } from './components/KpiBand';
import { SimpleBoard } from './components/SimpleBoard';
import { DEFAULT_FILTERS, Filters } from './components/Filters';
import type { FilterState } from './components/Filters';
import { JobTable } from './components/JobTable';
import { JobDrawer } from './components/JobDrawer';
import { EmployersTab } from './components/EmployersTab';
import { RunsTab } from './components/RunsTab';
import { HowTo } from './components/HowTo';

type TabKey = 'tab0' | 'tab1' | 'tab2' | 'queue' | 'archive' | 'employers' | 'history';

const TAB_LABELS: Record<TabKey, string> = {
  tab0: '$90K–$110K',
  tab1: '$110K–$130K',
  tab2: '$150K+',
  queue: 'Needs verification',
  archive: 'Archived',
  employers: 'Employer database',
  history: 'Refresh history',
};

export default function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const windowDays = boot?.stats.windowDays ?? 14;
  const [jobs, setJobs] = useState<Job[]>([]);
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [sources, setSources] = useState<SourceHealth[]>([]);
  const [tab, setTab] = useState<TabKey>('tab1');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showHowTo, setShowHowTo] = useState(false);
  const [simple, setSimple] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const lastLoadAtRef = useRef(0);
  const lastRunKeyRef = useRef<string | null>(null);

  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    window.setTimeout(() => setToast(null), 5200);
  }, []);

  const loadAll = useCallback(async () => {
    const [bootstrap, jobPayload] = await Promise.all([loadBootstrap(), loadJobs()]);
    lastLoadAtRef.current = Date.now();
    const latestRun = bootstrap.runs[0];
    lastRunKeyRef.current = latestRun
      ? `${latestRun.id}:${latestRun.status}:${latestRun.finishedAt ?? ''}`
      : null;
    setBoot(bootstrap);
    setJobs(jobPayload.jobs);
    // Land on a tab that actually has roles instead of an empty first impression.
    setTab((current) => {
      if (current !== 'tab1') return current;
      const hasTab1 = jobPayload.jobs.some((job) => job.bucket === 'tab1');
      const hasTab2 = jobPayload.jobs.some((job) => job.bucket === 'tab2');
      if (!hasTab1 && hasTab2) return 'tab2';
      if (!hasTab1 && jobPayload.jobs.some((job) => job.bucket === 'tab0')) return 'tab0';
      return current;
    });
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
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [loadAll]);

  useEffect(() => {
    let mounted = true;
    const checkRefreshStatus = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const status = await refreshStatus();
        if (!mounted) return;
        if (!status.refreshing && status.run && status.run.status !== 'running') {
          const runKey = `${status.run.id}:${status.run.status}:${status.run.finishedAt ?? ''}`;
          if (runKey !== lastRunKeyRef.current) {
            void loadAll().catch(() => {});
          }
        }
        if (!status.refreshing && status.run?.status !== 'running') return;
        setRefreshing(true);
        setProgress(status.run?.progress ?? 'Refreshing…');
        if (pollRef.current === null) {
          pollRef.current = window.setInterval(() => void poll(), 3000);
        }
      } catch {}
    };
    const onVisibilityChange = () => {
      if (!mounted || document.visibilityState !== 'visible') return;
      if (Date.now() - lastLoadAtRef.current > 60_000) {
        void loadAll().catch(() => {});
      }
    };
    const statusInterval = window.setInterval(() => void checkRefreshStatus(), 60_000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      mounted = false;
      window.clearInterval(statusInterval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loadAll, poll]);

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

  /**
   * Board checkboxes: an Applied check stamps today's local date. Saves for one role run in order and
   * only the newest response is applied, so a quick Viewed→Applied can't be undone by a late reply.
   */
  const trackChain = useRef(new Map<number, { seq: number; tail: Promise<unknown> }>());
  const handleTrack = useCallback((id: number, status: string) => {
    const patch: Record<string, string | null> = { appStatus: status };
    if (status === 'Applied') patch.appliedAt = new Date().toLocaleDateString('en-CA');
    if (status === 'Not Applied' || status === 'Viewed') patch.appliedAt = null;
    const before = jobs.find((job) => job.id === id);
    setJobs((current) => current.map((job) => (job.id === id ? { ...job, appStatus: status, appliedAt: patch.appliedAt ?? null } : job)));
    const entry = trackChain.current.get(id) ?? { seq: 0, tail: Promise.resolve() };
    const seq = entry.seq + 1;
    const tail = entry.tail.then(() => saveTracking(id, patch)).then(
      (result) => {
        if (trackChain.current.get(id)?.seq !== seq) return;
        setJobs((current) => current.map((job) => (job.id === id ? result.job : job)));
      },
      () => {
        if (trackChain.current.get(id)?.seq !== seq) return;
        if (before) setJobs((current) => current.map((job) => (job.id === id ? before : job)));
        notify('Could not save that — try again.', true);
      },
    );
    trackChain.current.set(id, { seq, tail });
  }, [jobs, notify]);

  const handleUpdated = useCallback((updated: Job) => {
    setJobs((current) => current.map((job) => (job.id === updated.id ? updated : job)));
  }, []);

  const tabJobs = useMemo(() => {
    const bucket = tab === 'tab0' ? 'tab0' : tab === 'tab1' ? 'tab1' : tab === 'tab2' ? 'tab2' : tab === 'queue' ? 'queue' : 'archived';
    return jobs.filter((job) => job.bucket === bucket);
  }, [jobs, tab]);

  const visibleJobs = useMemo(() => {
    if (tab === 'employers' || tab === 'history') return [];
    const needle = filters.q.trim().toLowerCase();
    const now = Date.now();
    const windowMs = (boot?.stats.windowDays ?? 14) * 86_400_000;
    const withinMs = filters.within === '24h' ? 86_400_000 : filters.within === '72h' ? 3 * 86_400_000 : windowMs;

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
      if (filters.within !== 'any') {
        if (!job.postedAt) return false;
        const posted = new Date(`${job.postedAt}T00:00:00Z`).getTime();
        if (now - posted > withinMs) return false;
      }
      return true;
    });

    const sorted = [...filtered];
    switch (filters.sort) {
      case 'found':
        sorted.sort((a, b) => (b.firstSeenAt ?? '').localeCompare(a.firstSeenAt ?? '') || (b.postedAt ?? '').localeCompare(a.postedAt ?? ''));
        break;
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
        sorted.sort((a, b) => (b.firstSeenAt ?? '').localeCompare(a.firstSeenAt ?? '') || (b.postedAt ?? '').localeCompare(a.postedAt ?? ''));
    }
    return sorted;
  }, [filters, tab, tabJobs]);

  const selected = jobs.find((job) => job.id === selectedId) ?? null;

  const counts = useMemo(() => ({
    tab0: jobs.filter((job) => job.bucket === 'tab0').length,
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
            unclear, only a last-updated date exists, or the link could not be confirmed as the employer’s own.
          </p>
        </div>
      );
    }
    if (tab === 'archive') {
      return (
        <div className="empty">
          <h3>Nothing archived yet</h3>
          <p>Roles move here when they pass the {windowDays}-day window or disappear from the employer's board.</p>
        </div>
      );
    }
    return (
      <div className="empty">
        <h3>No verified roles in this tab yet</h3>
        <p>
          A role only appears here when the employer publishes a base salary in band, the posting is fully remote and
          California-eligible, it was posted in the last {windowDays} days, and the application link is the employer's own.
          Press <strong>Refresh jobs now</strong> to search the employer database.
        </p>
        <button className="btn" onClick={() => void triggerRefresh()} disabled={refreshing}>Refresh jobs now</button>
      </div>
    );
  };

  if (simple) {
    return (
      <>
        <SimpleBoard
          profile={boot?.profile}
          jobs={jobs}
          refreshing={refreshing}
          progress={progress}
          lastRefresh={boot?.stats.lastRefresh ? shortDateTime(boot.stats.lastRefresh) : null}
          onRefresh={triggerRefresh}
          onAdvanced={() => setSimple(false)}
          onOpen={(id) => { setSimple(false); setSelectedId(id); }}
          onTrack={handleTrack}
        />
        {toast ? <div className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div> : null}
      </>
    );
  }

  return (
    <div className="shell">
      <header className="masthead">
        <div className="masthead-inner">
          <div>
            <div className="wordmark">
              <h1>
                {boot?.profile ? splitBoardName(boot.profile.boardName)[0] : 'Remote'}{' '}
                <span>{boot?.profile ? splitBoardName(boot.profile.boardName)[1] : 'Radar'}</span>
              </h1>
              <div className="tagline">
                {boot?.profile?.roleFamilyLabel ?? 'Remote roles'} · fully remote ·{' '}
                {boot?.profile?.eligibleStates?.length
                  ? `${boot.profile.eligibleStates.join(', ')}-eligible`
                  : 'US-eligible'}
              </div>
            </div>
            <p className="masthead-sub">
              Verified against employer career sites every thirty minutes. Two salary bands, one verification queue,
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
                    ? `Scheduled ${cronLabel(boot.cronExpression)}${boot.nextRefresh ? ` · next ${shortDateTime(boot.nextRefresh)}` : ''}`
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

      {boot ? <KpiBand stats={boot.stats} nextRefresh={boot.nextRefresh} cronEnabled={boot.cronEnabled} cronExpression={boot.cronExpression} /> : null}

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
          windowDays={windowDays}
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
          Sources: employer career sites only — Greenhouse, Lever, Ashby, Workable, SmartRecruiters and Recruitee
          boards, swept across all 50 states. Every role links to the employer's own
          own posting. Every placement decision is recorded in Refresh history.
        </div>
        <div>
          Salary bands use the published minimum only. Ownership labels require a citable source.
        </div>
      </footer>

      {selected ? (
        <JobDrawer job={selected} onClose={() => setSelectedId(null)} onUpdated={handleUpdated} />
      ) : null}

      {showHowTo ? <HowTo onClose={() => setShowHowTo(false)} windowDays={windowDays} /> : null}

      {toast ? <div className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div> : null}
    </div>
  );
}
