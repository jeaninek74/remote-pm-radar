import type { Run, SourceHealth } from '../types';
import { dateTimeLabel } from '../lib';

export function RunsTab({ runs, sources }: { runs: Run[]; sources: SourceHealth[] }) {
  const failed = sources.filter((source) => source.ok === false);
  const healthy = sources.filter((source) => source.ok === true);

  return (
    <div className="panel-grid">
      <div className="card">
        <div className="card-head">
          <h2>Refresh history</h2>
          <span className="hint">Every manual and scheduled cycle is recorded, including failures.</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="plain">
            <thead>
              <tr>
                <th>#</th>
                <th>Started</th>
                <th>Finished</th>
                <th>Trigger</th>
                <th>Status</th>
                <th className="right">Employers</th>
                <th className="right">Sources ok / failed</th>
                <th className="right">Postings read</th>
                <th className="right">Roles found</th>
                <th className="right">New leads</th>
                <th className="right">Tab 1</th>
                <th className="right">Tab 2</th>
                <th className="right">Queued</th>
                <th className="right">Dupes</th>
                <th className="right">Archived</th>
                <th className="right">New employers</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td className="mono">{run.id}</td>
                  <td className="mono nowrap">{dateTimeLabel(run.startedAt)}</td>
                  <td className="mono nowrap">{run.finishedAt ? dateTimeLabel(run.finishedAt) : '—'}</td>
                  <td>{run.trigger}</td>
                  <td>
                    <span className={`pill ${run.status === 'completed' ? 'ok' : run.status === 'running' ? 'warn' : 'bad'}`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="mono right">{run.employersSearched}</td>
                  <td className="mono right">{run.sourcesChecked - run.sourcesFailed} / {run.sourcesFailed}</td>
                  <td className="mono right">{run.jobsFetched}</td>
                  <td className="mono right">{run.jobsMatched}</td>
                  <td className="mono right">{run.newJobs}</td>
                  <td className="mono right">{run.addedTab1}</td>
                  <td className="mono right">{run.addedTab2}</td>
                  <td className="mono right">{run.queued}</td>
                  <td className="mono right">{run.duplicates}</td>
                  <td className="mono right">{run.archived}</td>
                  <td className="mono right">{run.newEmployers}</td>
                  <td className="muted" style={{ maxWidth: 320 }}>{run.message ?? run.progress ?? '—'}</td>
                </tr>
              ))}
              {!runs.length ? (
                <tr><td colSpan={17} className="muted">No refresh has run yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Source health</h2>
          <span className="hint">
            {healthy.length} feeds answering · {failed.length} failing. Failures are reported, never hidden.
          </span>
        </div>
        <div style={{ maxHeight: 420, overflow: 'auto' }}>
          <table className="plain">
            <thead>
              <tr>
                <th>Source</th>
                <th>Last attempt</th>
                <th className="right">Postings</th>
                <th className="right">Attempts</th>
                <th className="right">Failures</th>
                <th>Status / error</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.source}>
                  <td className="mono">{source.source}</td>
                  <td className="mono nowrap">{dateTimeLabel(source.lastAttempt)}</td>
                  <td className="mono right">{source.lastJobs ?? '—'}</td>
                  <td className="mono right">{source.attempts}</td>
                  <td className="mono right">{source.failures}</td>
                  <td>
                    {source.ok ? <span className="pill ok">OK</span> : <span className="pill bad">Failed</span>}
                    {source.error ? <span className="muted" style={{ marginLeft: 8, fontSize: 11 }}>{source.error}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
