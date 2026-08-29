import type { AcquisitionSource } from '../../models/Registration';
import { normalizeAcquisitionAttribution } from '../../models/Registration';
import { isValidPromoCode, normalizePromoCode } from '../../models/PromoCode';

const ACQUISITION_OPTIONS: Array<{ value: AcquisitionSource; label: string }> = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'discord', label: 'Discord' },
  { value: 'google', label: 'Google' },
  { value: 'friend_family', label: 'Friend or Family' },
  { value: 'event', label: 'Event' },
  { value: 'other', label: 'Other' },
];

type RegistrationDetailsProps = {
  acquisitionSource: AcquisitionSource | '';
  acquisitionSourceOther: string;
  promoCode: string;
  promoLocked: boolean;
  persisted: boolean;
  dirty: boolean;
  saving: boolean;
  mutationBlocked: boolean;
  saveError: string;
  onAcquisitionSourceChange: (source: AcquisitionSource | '') => void;
  onAcquisitionSourceOtherChange: (detail: string) => void;
  onPromoCodeChange: (promoCode: string) => void;
  onSave: () => void;
};

export function RegistrationDetails({
  acquisitionSource,
  acquisitionSourceOther,
  promoCode,
  promoLocked,
  persisted,
  dirty,
  saving,
  mutationBlocked,
  saveError,
  onAcquisitionSourceChange,
  onAcquisitionSourceOtherChange,
  onPromoCodeChange,
  onSave,
}: RegistrationDetailsProps) {
  let acquisitionError = '';
  try {
    normalizeAcquisitionAttribution({
      acquisitionSource,
      acquisitionSourceOther: acquisitionSource === 'other' ? acquisitionSourceOther : null,
    });
  } catch (error) {
    acquisitionError = error instanceof Error ? error.message : 'Choose how you heard about GOATLAND.';
  }

  const normalizedPromoCode = normalizePromoCode(promoCode);
  const promoError = normalizedPromoCode && !isValidPromoCode(normalizedPromoCode)
    ? 'Use 3–32 characters: A–Z, 0–9, and single hyphens.'
    : '';
  const detailsComplete = !acquisitionError && !promoError;

  return (
    <section className="registration-details" aria-labelledby="registration-details-title">
      <div>
        <p className="eyebrow">Step 5</p>
        <h2 id="registration-details-title">Registration Details</h2>
        <p>Tell us how you found GOATLAND and optionally enter a promo code.</p>
      </div>

      <div className="registration-details__fields">
        <div className="form-field">
          <label htmlFor="registration-acquisition-source">How did you hear about GOATLAND?</label>
          <select
            id="registration-acquisition-source"
            value={acquisitionSource}
            aria-describedby={acquisitionError ? 'registration-acquisition-error' : undefined}
            aria-invalid={Boolean(acquisitionError)}
            disabled={saving}
            onChange={(event) => onAcquisitionSourceChange(event.target.value as AcquisitionSource | '')}
          >
            <option value="">Choose a source</option>
            {ACQUISITION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          {acquisitionError ? (
            <p id="registration-acquisition-error" className="registration-field-error">
              {acquisitionError}
            </p>
          ) : null}
        </div>

        {acquisitionSource === 'other' ? (
          <div className="form-field">
            <label htmlFor="registration-acquisition-other">
              Please tell us where you heard about GOATLAND
            </label>
            <input
              id="registration-acquisition-other"
              type="text"
              value={acquisitionSourceOther}
              aria-describedby={acquisitionError ? 'registration-acquisition-error' : undefined}
              aria-invalid={Boolean(acquisitionError)}
              disabled={saving}
              onChange={(event) => onAcquisitionSourceOtherChange(event.target.value)}
            />
          </div>
        ) : null}

        {promoLocked ? (
          <div className="registration-details__locked" role="status">
            <strong>Promo code already attached to this registration.</strong>
            <span>Its referral attribution cannot be replaced.</span>
          </div>
        ) : (
          <div className="form-field">
            <label htmlFor="registration-promo-code">Optional promo code</label>
            <input
              id="registration-promo-code"
              type="text"
              value={promoCode}
              autoCapitalize="characters"
              aria-describedby={promoError ? 'registration-promo-error' : 'registration-promo-help'}
              aria-invalid={Boolean(promoError)}
              disabled={saving}
              onBlur={() => onPromoCodeChange(normalizedPromoCode)}
              onChange={(event) => onPromoCodeChange(event.target.value)}
            />
            {promoError ? (
              <p id="registration-promo-error" className="registration-field-error">{promoError}</p>
            ) : (
              <p id="registration-promo-help" className="registration-field-help">
                Promo codes are verified at payment and do not change the entry fee.
              </p>
            )}
          </div>
        )}
      </div>

      {persisted ? (
        <button
          className="button-link"
          type="button"
          aria-busy={saving || undefined}
          disabled={!dirty || !detailsComplete || saving || mutationBlocked}
          onClick={onSave}
        >
          {saving ? 'Saving details…' : 'Save how you heard about us'}
        </button>
      ) : detailsComplete ? (
        <p className="registration-details__status" role="status">
          Details ready. Competition rules and payment will be available after final registration details are published.
        </p>
      ) : null}

      {saveError ? <p className="registration-field-error" role="alert">{saveError}</p> : null}
    </section>
  );
}
