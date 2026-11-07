export function HowTo({ onClose, windowDays }: { onClose: () => void; windowDays: number }) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="How to use Remote PM Radar">
        <div className="modal-head">
          <div>
            <h2>How to use this board</h2>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              Eight steps from seeing a role to closing the loop.
            </div>
          </div>
          <button className="close-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <h3>1. Refresh before you browse</h3>
          <p>
            Press <strong>Refresh jobs now</strong>. The radar then searches every employer career site in the database,
            checks each posting against all placement rules, removes duplicates, and re-verifies application links.
            A scheduled refresh also runs every thirty minutes on its own.
          </p>

          <h3>2. Check the two salary tabs</h3>
          <p>
            A role only reaches a tab when it is <em>fully remote</em>, <em>California-eligible</em>, posted in the
            <em> last {windowDays} days</em>, has a <em>verified direct employer application link</em>, and publishes a
            <em> base salary whose minimum</em> falls in the band: $110,000–$130,000 for the first tab, $150,000+ for
            the second. Nothing is estimated or annualised into a tab.
          </p>
          <p>
            California eligibility is flagged, not assumed. A posting that names California, or is US-wide with no
            state exclusion, is marked <em>CA confirmed</em> or <em>US-wide</em>. A role whose posting never says who
            may live where still appears on the board with a <em>CA not stated</em> flag — confirm with the recruiter
            before applying. Only postings that explicitly exclude California, or sit outside the United States,
            are dropped.
          </p>

          <h3>3. Read the match score before the job description</h3>
          <p>
            Each role is scored against both resumes — the construction/PM resume and the 2026 general resume — and the
            drawer names the better fit plus the specific qualifications that matched. Anything the posting demands that
            your resumes do not show appears under <em>hard requirements to check</em>. Read those first.
          </p>

          <h3>4. Confirm urgency yourself</h3>
          <p>
            <strong>High</strong> only appears when the posting itself says the role is urgent or the start is immediate.
            <strong> Medium</strong> means the employer has several project/program roles open at once, which is an
            inference and is labelled as one. <strong>Low</strong> means the posting is silent — not that hiring is slow.
          </p>

          <h3>5. Apply through the employer link</h3>
          <p>
            Use <strong>Open employer application</strong> in the drawer. Every tabbed role links to the employer's own
            applicant-tracking system. The link was checked during the last refresh; the date and HTTP
            result sit in the verification facts.
          </p>

          <h3>6. Track the application where the job lives</h3>
          <p>
            Set the status inline in the table or in the drawer. Add the applied date, interview date, follow-up date,
            recruiter notes and personal notes. These fields are yours: a refresh never overwrites them.
          </p>

          <h3>7. Work the verification queue weekly</h3>
          <p>
            The queue holds roles that look promising but fail a hard rule — no published salary, only a last-updated
            date, or a link that is not the employer’s own. Each row explains its own blocker.
            Clear or ignore them; they never pollute the salary tabs.
          </p>

          <h3>8. Export when you need it offline</h3>
          <p>
            <strong>Export Excel</strong> produces the full workbook: the two salary tabs, the queue, the archive,
            a summary sheet, the employer database with ownership sourcing, and refresh history. CSV exports the
            current view only.
          </p>

          <h3>What this board will not do</h3>
          <p>
            It will not invent a salary, treat an updated posting as a new one, call a hybrid role remote, guess
            California eligibility, or label a company Black-owned without a citable source. When a rule cannot be
            verified, the role moves to the queue with the reason attached rather than being guessed into a tab.
          </p>
        </div>
      </div>
    </div>
  );
}
