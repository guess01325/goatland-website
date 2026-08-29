import { PageHeader } from '../components/PageHeader';
import { SectionHeading } from '../components/SectionHeading';
import {
  COMPETITION_RULES_ANCHOR,
  CURRENT_COMPETITION_RULES_VERSION,
  CURRENT_REFUND_POLICY_VERSION,
  REFUND_POLICY_ANCHOR,
  REGISTRATION_POLICIES_EFFECTIVE_DATE,
  competitionPolicySections,
  october2026LeagueSchedules,
  refundPolicySections,
  type PolicySection,
} from '../data/registrationPolicies';

function PolicyCards({ sections }: { sections: readonly PolicySection[] }) {
  return (
    <div className="rules-card-grid">
      {sections.map((section) => (
        <article className="preview-card rule-card" key={section.title}>
          <h2>{section.title}</h2>
          <ul className="feature-list">
            {section.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
          {section.note ? <p className="rule-note">{section.note}</p> : null}
        </article>
      ))}
    </div>
  );
}

export function RulesPage() {
  return (
    <>
      <PageHeader
        title="GOATLAND League Policies"
        description="Base League Competition Rules, the October 2026 published schedule, and the Refund Policy for paid League registrations."
      />

      <section className="section rules-section" id={COMPETITION_RULES_ANCHOR}>
        <div className="container">
          <SectionHeading
            eyebrow="Base Policy"
            title="Base League Competition Rules"
            description={`Effective ${REGISTRATION_POLICIES_EFFECTIVE_DATE} · Version ${CURRENT_COMPETITION_RULES_VERSION}`}
          />
          <p className="rule-note rule-note--standalone">
            These Base League Competition Rules govern the approved League structure and general
            competition standards. Applicable supplemental rules and the published League schedule
            govern their identified subjects.
          </p>
          <PolicyCards sections={competitionPolicySections} />
        </div>
      </section>

      <section className="section home-section home-section--alt rules-section" id="league-schedule">
        <div className="container">
          <SectionHeading
            eyebrow="Published Schedule"
            title="October 2026 League Schedule"
            description="The selected League Start Date determines the applicable regular-season match days."
          />
          <div className="rules-card-grid">
            {october2026LeagueSchedules.map((schedule) => (
              <article className="preview-card rule-card" key={schedule.tier}>
                <h2>{schedule.tier}</h2>
                <p className="eyebrow">League Start Dates</p>
                <ul className="feature-list">
                  {schedule.startDates.map((date) => <li key={date}>{date}</li>)}
                </ul>
                <p className="eyebrow">Regular-Season Match Days</p>
                <ul className="feature-list">
                  {schedule.matchDays.map((day) => <li key={day}>{day}</li>)}
                </ul>
                <p className="eyebrow">Published Playoff Days</p>
                <ul className="feature-list">
                  {schedule.playoffDays.map((day) => <li key={day}>{day}</li>)}
                </ul>
              </article>
            ))}
          </div>
          <p className="rule-note rule-note--standalone">
            Exact playoff-round assignments and dates will be provided in the applicable published
            League schedule. No playoff round is assigned to a particular day here.
          </p>
        </div>
      </section>

      <section className="section rules-section" id={REFUND_POLICY_ANCHOR}>
        <div className="container">
          <SectionHeading
            eyebrow="Separate Policy"
            title="Refund Policy"
            description={`Effective ${REGISTRATION_POLICIES_EFFECTIVE_DATE} · Version ${CURRENT_REFUND_POLICY_VERSION}`}
          />
          <PolicyCards sections={refundPolicySections} />
        </div>
      </section>

      <footer className="section legal-section">
        <div className="container">
          <p><strong>Effective: {REGISTRATION_POLICIES_EFFECTIVE_DATE}</strong></p>
          <p>
            Competition Rules and the Refund Policy are versioned separately. A paid Registration
            records the versions accepted by the player.
          </p>
        </div>
      </footer>
    </>
  );
}
