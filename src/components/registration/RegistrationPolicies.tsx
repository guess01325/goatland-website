import { Link } from 'react-router-dom';
import {
  COMPETITION_RULES_ANCHOR,
  REFUND_POLICY_ANCHOR,
  REGISTRATION_POLICIES_EFFECTIVE_DATE,
} from '../../data/registrationPolicies';

type RegistrationPoliciesProps = {
  competitionAccepted: boolean;
  refundAccepted: boolean;
  creating: boolean;
  createEligible: boolean;
  createIneligibleReason: string;
  createError: string;
  onCompetitionAcceptedChange: (accepted: boolean) => void;
  onRefundAcceptedChange: (accepted: boolean) => void;
  onCreate: () => void;
};

export function RegistrationPolicies({
  competitionAccepted,
  refundAccepted,
  creating,
  createEligible,
  createIneligibleReason,
  createError,
  onCompetitionAcceptedChange,
  onRefundAcceptedChange,
  onCreate,
}: RegistrationPoliciesProps) {
  return (
    <section className="registration-policies" aria-labelledby="registration-policies-title">
      <div>
        <p className="eyebrow">Step 6</p>
        <h2 id="registration-policies-title">Accept Registration Policies</h2>
        <p>Effective {REGISTRATION_POLICIES_EFFECTIVE_DATE}. Review and accept both policies to create your pending Registration.</p>
      </div>
      <div className="registration-policies__checks">
        <label>
          <input type="checkbox" checked={competitionAccepted} disabled={creating} onChange={(event) => onCompetitionAcceptedChange(event.target.checked)} />
          <span>I accept the <Link to={`/rules#${COMPETITION_RULES_ANCHOR}`} target="_blank">Competition Rules</Link></span>
        </label>
        <label>
          <input type="checkbox" checked={refundAccepted} disabled={creating} onChange={(event) => onRefundAcceptedChange(event.target.checked)} />
          <span>I accept the <Link to={`/rules#${REFUND_POLICY_ANCHOR}`} target="_blank">Refund Policy</Link></span>
        </label>
      </div>
      <button className="button-link" type="button" aria-busy={creating || undefined} disabled={!createEligible} onClick={onCreate}>
        {creating ? 'Creating registration…' : 'Create Registration'}
      </button>
      {!createEligible && !creating && createIneligibleReason ? (
        <p className="registration-details__status">{createIneligibleReason}</p>
      ) : null}
      {createError ? <p className="registration-field-error" role="alert">{createError}</p> : null}
    </section>
  );
}
