import type { Stats } from '../types';
import { cronLabel, dateTimeLabel } from '../lib';

interface Props {
  stats: Stats;
  nextRefresh: string | null;
  cronEnabled: boolean;
  cronExpression?: string | null;
}

function Kpi({ label, value, sub, accent, small }: {
  label: string; value: string | number; sub?: string; accent?: boolean; small?: boolean;
}) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value${accent ? ' accent' : ''}${small ? ' small' : ''}`}>{value}</div>
      {sub ? <div className="kpi-sub">{sub}</div> : null}
    </div>
  );
}

export function KpiBand({ stats, nextRefresh, cronEnabled, cronExpression }: Props) {
  return (
    <section className="kpi-band" aria-label="Radar totals">
      <div className="kpi-grid">
        <Kpi label="Verified active jobs" value={stats.activeJobs} accent
          sub={`${stats.tab1} in $110–130K · ${stats.tab2} at $150K+`} />
        <Kpi label="New today" value={stats.newToday} sub={`${stats.new24h} in last 24 hours`} />
        <Kpi label="Nontechnical" value={stats.nontechnical} sub="business & operations PM" />
        <Kpi label="Technical" value={stats.technical} sub="IT / platform / systems PM" />
        <Kpi label="Hybrid business-tech" value={stats.hybrid} sub="cross-functional delivery" />
        <Kpi label="Urgently hiring" value={stats.urgent} sub="confirmed in the posting" />
        <Kpi label="Verified Black-owned" value={stats.blackOwnedEmployers}
          sub={`${stats.blackOwnedJobs} role${stats.blackOwnedJobs === 1 ? '' : 's'} open`} />
        <Kpi label="Employers searched" value={stats.employersSearched} sub={`${stats.employersTracked} tracked in database`} />
        <Kpi label="States covered" value={stats.statesSearched} sub="employer headquarters" />
        <Kpi label="Last refresh" value={dateTimeLabel(stats.lastRefresh)} small />
        <Kpi label="Next scheduled" value={cronEnabled ? dateTimeLabel(nextRefresh) : 'Manual only'} small
          sub={cronEnabled ? cronLabel(cronExpression) : 'cron disabled'} />
        <Kpi label="Needs verification" value={stats.queue} sub={`${stats.archived} archived`} />
      </div>
    </section>
  );
}
