import { useMemo, useState } from 'react';
import type { Employer } from '../types';
import { dateTimeLabel } from '../lib';

export function EmployersTab({ employers }: { employers: Employer[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'black' | 'new' | 'manual'>('all');

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return employers.filter((employer) => {
      if (needle && !employer.name.toLowerCase().includes(needle) && !(employer.industry ?? '').toLowerCase().includes(needle)) {
        return false;
      }
      if (filter === 'black') return employer.blackOwned;
      if (filter === 'manual') return employer.ats === 'manual';
      if (filter === 'new') return employer.discoveredVia !== 'Seed inventory' && employer.discoveredVia !== 'Ownership watchlist';
      return true;
    });
  }, [employers, query, filter]);

  const stats = useMemo(() => {
    return {
      total: employers.length,
      searched: employers.filter((employer) => employer.lastSearchedAt).length,
      black: employers.filter((employer) => employer.blackOwned).length,
      discovered: employers.filter((employer) => employer.discoveredVia === 'Directory discovery').length,
      tiers: new Set(employers.map((employer) => employer.ats)),
    };
  }, [employers]);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Employer database</h2>
          <span className="hint">
            {stats.total} employers tracked · {stats.searched} searched · {stats.black} verified Black-owned ·
            {' '}{stats.discovered} discovered automatically · feeds: {[...stats.tiers].filter((t) => t !== 'manual').join(', ')}
          </span>
        </div>
        <div className="chips">
          {([['all', 'All'], ['black', 'Black-owned'], ['new', 'Auto-discovered'], ['manual', 'Manual check']] as const).map(([key, label]) => (
            <button key={key} type="button" className={`chip${filter === key ? ' active' : ''}`} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="stat-row">
        <div className="stat">Search <input className="select" style={{ maxWidth: 260 }} placeholder="Filter employer or industry…"
          value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className="stat">Employers with live tab roles: <b>{employers.filter((employer) => employer.openRoles > 0).length}</b></div>
        <div className="stat">Ownership-researched: <b>{employers.filter((employer) => employer.ownershipStatus !== 'Not researched').length}</b></div>
      </div>
      <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
        <table className="plain">
          <thead>
            <tr>
              <th>Employer</th>
              <th>Industry</th>
              <th>Size</th>
              <th>HQ</th>
              <th>Feeds searched</th>
              <th>Career page</th>
              <th>Open tab roles</th>
              <th>Last searched</th>
              <th>Last result</th>
              <th>Black-owned</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((employer) => (
              <tr key={employer.id}>
                <td>
                  <strong>{employer.name}</strong>
                  <div className="muted mono">{employer.discoveredVia ?? '—'}</div>
                </td>
                <td>{employer.industry ?? '—'}</td>
                <td>{employer.companySize ?? '—'}</td>
                <td className="mono">{employer.hqState ?? '—'}</td>
                <td className="mono">{employer.ats === 'manual' ? 'no public feed' : `${employer.ats}/${employer.slug}`}</td>
                <td>
                  {employer.careersUrl ? (
                    <a href={employer.careersUrl} target="_blank" rel="noopener noreferrer">Open ↗</a>
                  ) : '—'}
                </td>
                <td className="mono right">{employer.openRoles || '—'}</td>
                <td className="mono">{employer.lastSearchedAt ? dateTimeLabel(employer.lastSearchedAt) : 'Not yet'}</td>
                <td className="muted">{employer.lastStatus ?? '—'}</td>
                <td>
                  {employer.blackOwned ? (
                    <span className="pill ok" title={employer.ownershipSource ?? ''}>{employer.ownershipStatus}</span>
                  ) : (
                    <span className="muted">Not verified</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
