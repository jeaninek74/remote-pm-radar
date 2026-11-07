import type { Job } from '../types';
import { categoryLabel, uniqueValues } from '../lib';

export interface FilterState {
  q: string;
  category: 'All' | 'Nontechnical' | 'Technical' | 'Hybrid';
  urgency: string;
  industry: string;
  size: string;
  state: string;
  blackOwned: boolean;
  employment: string;
  appStatus: string;
  within: 'any' | '24h' | '72h' | 'window';
  minMatch: number;
  sort: 'match' | 'newest' | 'salary' | 'company';
}

export const DEFAULT_FILTERS: FilterState = {
  q: '',
  category: 'All',
  urgency: 'All',
  industry: 'All',
  size: 'All',
  state: 'All',
  blackOwned: false,
  employment: 'All',
  appStatus: 'All',
  within: 'any',
  minMatch: 0,
  sort: 'match',
};

interface Props {
  value: FilterState;
  onChange: (next: FilterState) => void;
  jobs: Job[];
  total: number;
  matched: number;
  windowDays: number;
}

const CATEGORIES: FilterState['category'][] = ['All', 'Nontechnical', 'Technical', 'Hybrid'];

export function Filters({ value, onChange, jobs, total, matched, windowDays }: Props) {
  const set = <K extends keyof FilterState>(key: K, next: FilterState[K]) => onChange({ ...value, [key]: next });
  const industries = uniqueValues(jobs, 'industry');
  const sizes = uniqueValues(jobs, 'companySize');
  const states = uniqueValues(jobs, 'hqState');
  const employment = uniqueValues(jobs, 'employmentType');
  const active =
    value.q !== '' || value.category !== 'All' || value.urgency !== 'All' || value.industry !== 'All' ||
    value.size !== 'All' || value.state !== 'All' || value.blackOwned || value.employment !== 'All' ||
    value.appStatus !== 'All' || value.within !== 'any' || value.minMatch > 0;

  return (
    <>
      <div className="filters">
        <div className="search-box">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            placeholder="Search job title, employer, keyword…"
            value={value.q}
            onChange={(event) => set('q', event.target.value)}
            aria-label="Search jobs"
          />
        </div>

        <div className="chips" role="group" aria-label="Job category">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              className={`chip${value.category === category ? ' active' : ''}`}
              onClick={() => set('category', category)}
            >
              {category === 'All' ? 'All categories' : categoryLabel(category)}
            </button>
          ))}
        </div>

        <select className="select" aria-label="Hiring urgency" value={value.urgency}
          onChange={(event) => set('urgency', event.target.value)}>
          <option value="All">Any urgency</option>
          <option value="High">Urgent (confirmed)</option>
          <option value="Medium">Multiple openings</option>
          <option value="Low">Not stated</option>
          <option value="Unknown">Unknown</option>
        </select>

        <select className="select" aria-label="Industry" value={value.industry}
          onChange={(event) => set('industry', event.target.value)}>
          <option value="All">All industries</option>
          {industries.map((industry) => <option key={industry} value={industry}>{industry}</option>)}
        </select>

        <select className="select" aria-label="Company size" value={value.size}
          onChange={(event) => set('size', event.target.value)}>
          <option value="All">Any company size</option>
          {sizes.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>

        <select className="select" aria-label="Employer headquarter state" value={value.state}
          onChange={(event) => set('state', event.target.value)}>
          <option value="All">Any employer state</option>
          {states.map((state) => <option key={state} value={state}>{state}</option>)}
        </select>

        <select className="select" aria-label="Employment type" value={value.employment}
          onChange={(event) => set('employment', event.target.value)}>
          <option value="All">Any employment type</option>
          {employment.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>

        <select className="select" aria-label="Application status" value={value.appStatus}
          onChange={(event) => set('appStatus', event.target.value)}>
          <option value="All">Any application status</option>
          <option value="Not Applied">Not Applied</option>
          <option value="Interested">Interested</option>
          <option value="Applied">Applied</option>
          <option value="Recruiter Contacted">Recruiter Contacted</option>
          <option value="Interview Scheduled">Interview Scheduled</option>
          <option value="Interview Completed">Interview Completed</option>
          <option value="Offer Received">Offer Received</option>
          <option value="Rejected">Rejected</option>
          <option value="No Longer Interested">No Longer Interested</option>
        </select>

        <select className="select" aria-label="Date posted" value={value.within}
          onChange={(event) => set('within', event.target.value as FilterState['within'])}>
          <option value="any">Posted: any day in window</option>
          <option value="24h">Posted: last 24 hours</option>
          <option value="72h">Posted: last 3 days</option>
          <option value="window">Posted: last {windowDays} days</option>
        </select>

        <label className={`toggle${value.blackOwned ? ' on' : ''}`}>
          <input type="checkbox" checked={value.blackOwned}
            onChange={(event) => set('blackOwned', event.target.checked)} />
          Verified Black-owned
        </label>

        <select className="select" aria-label="Minimum resume match" value={String(value.minMatch)}
          onChange={(event) => set('minMatch', Number(event.target.value))}>
          {[0, 50, 60, 70, 80, 90].map((score) => (
            <option key={score} value={score}>{score === 0 ? 'Any match score' : `Match ≥ ${score}%`}</option>
          ))}
        </select>

        <select className="select" aria-label="Sort jobs" value={value.sort}
          onChange={(event) => set('sort', event.target.value as FilterState['sort'])}>
          <option value="match">Sort: best resume match</option>
          <option value="newest">Sort: newest posting</option>
          <option value="salary">Sort: highest salary</option>
          <option value="company">Sort: employer A–Z</option>
        </select>
      </div>

      <div className="filter-note">
        <span className="count-line">
          Showing <strong>{matched}</strong> of {total} roles in this view
        </span>
        {active ? (
          <button type="button" className="linkish" onClick={() => onChange({ ...DEFAULT_FILTERS })}>
            Clear all filters
          </button>
        ) : (
          <span>Filters are applied live; nothing is hidden permanently.</span>
        )}
      </div>
    </>
  );
}
