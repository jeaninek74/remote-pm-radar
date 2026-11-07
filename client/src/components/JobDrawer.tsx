import { useEffect, useState } from 'react';
import type { Job } from '../types';
import { caBadge, categoryLabel, dateLabel, dateTimeLabel, money, salaryLabel, saveTracking } from '../lib';

interface Props {
  job: Job;
  onClose: () => void;
  onUpdated: (job: Job) => void;
}

const STATUSES = ['Not Applied', 'Interested', 'Applied', 'Recruiter Contacted',
  'Interview Scheduled', 'Interview Completed', 'Offer Received', 'Rejected', 'No Longer Interested'];

function Fact({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fact" style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <dt>{label}</dt>
      <dd>{value ?? '—'}</dd>
    </div>
  );
}

export function JobDrawer({ job, onClose, onUpdated }: Props) {
  const [draft, setDraft] = useState({
    appStatus: job.appStatus,
    notes: job.notes ?? '',
    recruiterNotes: job.recruiterNotes ?? '',
    interviewAt: job.interviewAt ?? '',
    appliedAt: job.appliedAt ?? '',
    followUpAt: job.followUpAt ?? '',
  });
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    setDraft({
      appStatus: job.appStatus,
      notes: job.notes ?? '',
      recruiterNotes: job.recruiterNotes ?? '',
      interviewAt: job.interviewAt ?? '',
      appliedAt: job.appliedAt ?? '',
      followUpAt: job.followUpAt ?? '',
    });
  }, [job.id, job.appStatus, job.notes, job.recruiterNotes, job.interviewAt, job.appliedAt, job.followUpAt]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function persist(patch: Record<string, string | null>) {
    setState('saving');
    try {
      const result = await saveTracking(job.id, patch);
      onUpdated(result.job);
      setState('saved');
      window.setTimeout(() => setState('idle'), 1600);
    } catch {
      setState('error');
    }
  }

  const ca = caBadge(job);

  return (
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside className="drawer" onClick={(event) => event.stopPropagation()} aria-label={`${job.title} at ${job.company}`}>
        <div className="drawer-head">
          <div className="eyebrow">
            <span>{job.bucket === 'tab1' ? '$110K–$130K tab' : job.bucket === 'tab2' ? '$150K+ tab' : job.bucket === 'queue' ? 'Needs verification' : 'Archived'}</span>
            <span>{job.source}</span>
          </div>
          <h2>{job.title}</h2>
          <div className="company">
            {job.company}{job.industry ? ` · ${job.industry}` : ''}{job.companySize ? ` · ${job.companySize}` : ''}
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <a className="btn mini" href={job.applyUrl} target="_blank" rel="noopener noreferrer">
              Open employer application ↗
            </a>
            <span className={`badge ${ca.cls}`}>{ca.label}</span>
            <span className="badge">{categoryLabel(job.category)}</span>
            <span className="badge">{job.matchScore}% resume match</span>
            {state === 'saving' ? <span className="save-state">Saving…</span> : null}
            {state === 'saved' ? <span className="save-state">Saved</span> : null}
            {state === 'error' ? <span className="save-state error">Save failed — retry</span> : null}
            <button className="close-x" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">×</button>
          </div>
        </div>

        <div className="drawer-body">
          {job.bucketReason ? (
            <div className="section">
              <h3>Why it sits here</h3>
              <p style={{ fontSize: 12.5, margin: 0 }}>{job.bucketReason}</p>
            </div>
          ) : null}

          <div className="section">
            <h3>Compensation</h3>
            <div className="pay-line">{salaryLabel(job)}</div>
            <div className="pay-note">
              {job.salaryInterval === 'hour'
                ? `Hourly contract — ${money(job.salaryMin)}/yr equivalent at 2,080 hours. Contract income is not a guaranteed salary.`
                : job.salaryMin !== null
                  ? `Published minimum governs the salary band. ${job.salaryMax !== null ? `Top of range ${money(job.salaryMax)}.` : ''}`
                  : 'No verified compensation published.'}
            </div>
            <div className="pay-note">
              <strong>Verification:</strong> {job.salarySource ?? 'Not verified'} — {job.salaryNote ?? 'no source text captured'}
            </div>
          </div>

          <div className="section">
            <h3>Verification facts</h3>
            <dl className="fact-grid">
              <Fact label="Original posting date" value={`${dateLabel(job.postedAt)} (${job.postedConfidence})`} />
              <Fact label="Date discovered" value={dateLabel(job.firstSeenAt)} />
              <Fact label="Fully remote" value={job.remoteStatus} />
              <Fact label="California eligibility" value={job.caNote} />
              <Fact label="Employment type" value={job.employmentType ?? 'Not stated'} />
              <Fact label="Employer HQ state" value={job.hqState ?? 'Not stated'} />
              <Fact label="Requisition ID" value={job.requisitionId ?? '—'} />
              <Fact label="Last verified" value={dateTimeLabel(job.lastVerifiedAt)} />
              <Fact label="Link check" value={`${job.linkStatus ?? 'not checked'} · ${dateLabel(job.linkVerifiedAt)}`} />
              <Fact label="Link type" value={job.linkType === 'employer' ? 'Direct employer posting' : 'Link not yet confirmed as the employer\u2019s own'} />
              <Fact label="Black-owned verification" value={job.blackOwned} />
              <Fact label="Ownership source" value={job.ownershipSource ?? '—'} wide />
            </dl>
          </div>

          <div className="section">
            <h3>Resume fit — against both resumes</h3>
            <div style={{ fontSize: 12.5, marginBottom: 6 }}>
              <strong>{job.matchScore}%</strong> · best resume: <em>{job.bestResume}</em>
            </div>
            <ul className="reason-list">
              {job.matchReasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
            {job.gaps.length ? (
              <>
                <div style={{ marginTop: 10, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
                  Hard requirements to check
                </div>
                <ul className="gap-list">
                  {job.gaps.map((gap) => <li key={gap}>{gap}</li>)}
                </ul>
              </>
            ) : (
              <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--green)' }}>No obvious hard blockers detected in the posting text.</div>
            )}
          </div>

          <div className="section">
            <h3>Hiring urgency</h3>
            <div style={{ fontSize: 12.5 }}>
              <span className={`badge ${job.urgency === 'High' ? 'high' : job.urgency === 'Medium' ? 'medium' : ''}`}>{job.urgency}</span>
              <div style={{ marginTop: 6, color: 'var(--ink-soft)' }}>
                {job.urgencyEvidence ?? 'No urgency language in the posting (absence of evidence, not evidence of low urgency).'}
              </div>
            </div>
          </div>

          <div className="section">
            <h3>Your tracking</h3>
            <div className="field">
              <label htmlFor={`status-${job.id}`}>Application status</label>
              <select
                id={`status-${job.id}`}
                value={draft.appStatus}
                onChange={(event) => {
                  setDraft({ ...draft, appStatus: event.target.value });
                  void persist({ appStatus: event.target.value });
                }}
              >
                {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor={`applied-${job.id}`}>Applied on</label>
                <input id={`applied-${job.id}`} type="date" value={draft.appliedAt}
                  onChange={(event) => setDraft({ ...draft, appliedAt: event.target.value })}
                  onBlur={() => void persist({ appliedAt: draft.appliedAt || null })} />
              </div>
              <div className="field">
                <label htmlFor={`interview-${job.id}`}>Interview date</label>
                <input id={`interview-${job.id}`} type="date" value={draft.interviewAt}
                  onChange={(event) => setDraft({ ...draft, interviewAt: event.target.value })}
                  onBlur={() => void persist({ interviewAt: draft.interviewAt || null })} />
              </div>
            </div>
            <div className="field">
              <label htmlFor={`follow-${job.id}`}>Follow-up due</label>
              <input id={`follow-${job.id}`} type="date" value={draft.followUpAt}
                onChange={(event) => setDraft({ ...draft, followUpAt: event.target.value })}
                onBlur={() => void persist({ followUpAt: draft.followUpAt || null })} />
            </div>
            <div className="field">
              <label htmlFor={`recruiter-${job.id}`}>Recruiter / interview notes</label>
              <textarea id={`recruiter-${job.id}`} value={draft.recruiterNotes}
                placeholder="Recruiter name, call notes, next steps…"
                onChange={(event) => setDraft({ ...draft, recruiterNotes: event.target.value })}
                onBlur={() => void persist({ recruiterNotes: draft.recruiterNotes })} />
            </div>
            <div className="field">
              <label htmlFor={`notes-${job.id}`}>Personal notes</label>
              <textarea id={`notes-${job.id}`} value={draft.notes}
                placeholder="Why this fits, referral leads, questions to ask…"
                onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                onBlur={() => void persist({ notes: draft.notes })} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              Notes and statuses are saved to the database and never overwritten by a refresh.
            </div>
          </div>

          {job.descriptionExcerpt ? (
            <div className="section">
              <h3>Posting excerpt</h3>
              <div className="excerpt">{job.descriptionExcerpt}</div>
            </div>
          ) : null}

          <div className="section">
            <h3>Source</h3>
            <div className="source-note">{job.source} · key {job.jobKey}</div>
            <div className="source-note" style={{ marginTop: 4 }}>
              <a href={job.applyUrl} target="_blank" rel="noopener noreferrer">{job.applyUrl}</a>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
