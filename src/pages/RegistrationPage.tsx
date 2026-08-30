import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RegistrationCheckout } from '../components/registration/RegistrationCheckout';
import { RegistrationDetails } from '../components/registration/RegistrationDetails';
import { RegistrationPolicies } from '../components/registration/RegistrationPolicies';
import { SelectionCard } from '../components/registration/SelectionCard';
import { PageHeader } from '../components/PageHeader';
import { SectionHeading } from '../components/SectionHeading';
import { registrationPaymentsEnabled } from '../config/registrationPayments';
import type { Game } from '../models/Game';
import type { LeagueStart } from '../models/LeagueStart';
import { isValidPromoCode, normalizePromoCode } from '../models/PromoCode';
import type { AcquisitionAttribution, AcquisitionSource, Registration } from '../models/Registration';
import { normalizeAcquisitionAttribution } from '../models/Registration';
import type { RegistrationOffering } from '../models/RegistrationOffering';
import type { Tier } from '../models/Tier';
import {
  CURRENT_COMPETITION_RULES_VERSION,
  CURRENT_REFUND_POLICY_VERSION,
} from '../data/registrationPolicies';
import {
  clearCheckoutAttempt,
  getCheckoutAttempt,
  getOrCreateCheckoutAttempt,
  type CheckoutAttempt,
} from '../lib/checkoutAttempt';
import { createRegistrationCheckout } from '../services/checkout';
import { getRegistrationGames } from '../services/games';
import { getLeagueStartsForGame } from '../services/leagueStarts';
import { getRegistrationOfferingsForLeagueStartAndTier } from '../services/registrationOfferings';
import {
  createRegistration,
  getRegistration,
  updateRegistrationAcquisitionSource,
} from '../services/registrations';
import { getActiveTiers } from '../services/tiers';

type StartOption = {
  leagueStart: LeagueStart;
  offering: RegistrationOffering;
};

type QueryKey = 'game' | 'tier' | 'start';

function formatStartDate(leagueStart: LeagueStart): string {
  if (!leagueStart.startsAt) {
    return 'Date unavailable';
  }

  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: leagueStart.timeZone,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(leagueStart.startsAt.toDate());
  } catch {
    return 'Date unavailable';
  }
}

function formatPrice(offering: RegistrationOffering): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: offering.currency,
  }).format(offering.entryFeeCents / 100);
}

function isDisplaySelectableOffering(offering: RegistrationOffering, now: number): boolean {
  return offering.status === 'enabled'
    && offering.registrationOpensAt !== null
    && offering.registrationClosesAt !== null
    && offering.registrationOpensAt.toMillis() <= now
    && now < offering.registrationClosesAt.toMillis();
}

type CreateEligibility = {
  eligible: boolean;
  reason: string;
};

function getCreateEligibility({
  selectedStart,
  registrationIsLoaded,
  managedRegistration,
  acquisition,
  localPromoValid,
  competitionRulesAccepted,
  refundPolicyAccepted,
  registrationCreating,
}: {
  selectedStart: StartOption | null;
  registrationIsLoaded: boolean;
  managedRegistration: Registration | null;
  acquisition: AcquisitionAttribution | null;
  localPromoValid: boolean;
  competitionRulesAccepted: boolean;
  refundPolicyAccepted: boolean;
  registrationCreating: boolean;
}): CreateEligibility {
  if (registrationCreating) return { eligible: false, reason: 'Registration creation is already in progress.' };
  if (!selectedStart) return { eligible: false, reason: 'Please select a League Start Date.' };
  if (!registrationIsLoaded) {
    return { eligible: false, reason: 'Please wait while we check your registration status.' };
  }
  if (managedRegistration) {
    return { eligible: false, reason: 'Your existing Registration must finish loading before continuing.' };
  }
  if (!acquisition) {
    return { eligible: false, reason: 'Please complete your registration details before continuing.' };
  }
  if (!localPromoValid) {
    return { eligible: false, reason: 'Please correct or remove the promo code before continuing.' };
  }
  if (!competitionRulesAccepted || !refundPolicyAccepted) {
    return { eligible: false, reason: 'Please accept both registration policies.' };
  }
  return { eligible: true, reason: '' };
}

function getFirebaseErrorCode(error: unknown): string {
  const code = typeof (error as { code?: unknown })?.code === 'string'
    ? (error as { code: string }).code
    : '';
  return code.replace(/^firestore\//, '');
}

export function RegistrationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [games, setGames] = useState<Game[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [startOptions, setStartOptions] = useState<StartOption[]>([]);
  const [startsLoading, setStartsLoading] = useState(false);
  const [startsError, setStartsError] = useState('');
  const [startsRetry, setStartsRetry] = useState(0);
  const [startsLoadedFor, setStartsLoadedFor] = useState('');
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [registrationLoading, setRegistrationLoading] = useState(false);
  const [registrationRefreshing, setRegistrationRefreshing] = useState(false);
  const [registrationError, setRegistrationError] = useState('');
  const [registrationLoadedFor, setRegistrationLoadedFor] = useState('');
  const [registrationRetry, setRegistrationRetry] = useState(0);
  const [detailsOfferingId, setDetailsOfferingId] = useState<string | null>(null);
  const [acquisitionSource, setAcquisitionSource] = useState<AcquisitionSource | ''>('');
  const [acquisitionSourceOther, setAcquisitionSourceOther] = useState('');
  const [acquisitionDirty, setAcquisitionDirty] = useState(false);
  const [acquisitionSaving, setAcquisitionSaving] = useState(false);
  const [acquisitionSaveError, setAcquisitionSaveError] = useState('');
  const [acquisitionReloadPending, setAcquisitionReloadPending] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [competitionRulesAccepted, setCompetitionRulesAccepted] = useState(false);
  const [refundPolicyAccepted, setRefundPolicyAccepted] = useState(false);
  const [registrationCreating, setRegistrationCreating] = useState(false);
  const [registrationCreateError, setRegistrationCreateError] = useState('');
  const [registrationCreateNotice, setRegistrationCreateNotice] = useState('');
  const [checkoutStarting, setCheckoutStarting] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const currentOfferingId = useRef<string | null>(null);
  const registrationLoadOfferingId = useRef<string | null>(null);
  const initializedRegistrationId = useRef<string | null>(null);
  const startsLoadContext = useRef('');
  const checkoutStartingRef = useRef(false);
  const checkoutAttemptRef = useRef<CheckoutAttempt | null>(null);
  const currentRegistrationId = useRef<string | null>(null);
  const registrationCreatingRef = useRef(false);

  const gameId = searchParams.get('game');
  const tierId = searchParams.get('tier');
  const offeringId = searchParams.get('start');

  const selectedGame = games.find((game) => game.id === gameId && game.status === 'active') ?? null;
  const selectedTier = tiers.find((tier) => tier.id === tierId) ?? null;
  const selectedStart = startOptions.find((option) => option.offering.id === offeringId) ?? null;
  currentOfferingId.current = selectedStart?.offering.id ?? null;
  const registrationIsLoaded = Boolean(
    selectedStart && registrationLoadedFor === selectedStart.offering.id,
  );
  const managedRegistration = registrationIsLoaded ? registration : null;
  currentRegistrationId.current = managedRegistration?.id ?? null;
  const promoLocked = Boolean(
    managedRegistration
    && (
      managedRegistration.promoCodeId
      || managedRegistration.promoCodeSnapshot
      || managedRegistration.promoterIdSnapshot
    )
  );
  const detailsAvailable = Boolean(
    selectedStart && registrationIsLoaded
    && (!managedRegistration || managedRegistration.status === 'pending_payment'),
  );
  let normalizedLocalAcquisition: AcquisitionAttribution | null = null;
  try {
    normalizedLocalAcquisition = normalizeAcquisitionAttribution({
      acquisitionSource,
      acquisitionSourceOther: acquisitionSource === 'other' ? acquisitionSourceOther : null,
    });
  } catch {
    normalizedLocalAcquisition = null;
  }
  const normalizedLocalPromo = normalizePromoCode(promoCode);
  const localPromoValid = !normalizedLocalPromo || isValidPromoCode(normalizedLocalPromo);
  const policiesAvailable = Boolean(
    selectedStart
    && registrationIsLoaded
    && !managedRegistration
    && normalizedLocalAcquisition
    && localPromoValid,
  );
  const createEligibility = getCreateEligibility({
    selectedStart,
    registrationIsLoaded,
    managedRegistration,
    acquisition: normalizedLocalAcquisition,
    localPromoValid,
    competitionRulesAccepted,
    refundPolicyAccepted,
    registrationCreating,
  });
  const policiesCurrent = Boolean(
    managedRegistration
    && managedRegistration.competitionRulesVersionAccepted === CURRENT_COMPETITION_RULES_VERSION
    && managedRegistration.refundPolicyVersionAccepted === CURRENT_REFUND_POLICY_VERSION
  );
  const checkoutEligible = Boolean(
    managedRegistration?.status === 'pending_payment'
    && policiesCurrent
    && selectedGame
    && selectedTier
    && selectedStart
    && selectedStart.offering.id === managedRegistration.registrationOfferingId
    && localPromoValid
    && !acquisitionDirty
    && !acquisitionSaving
    && !registrationLoading
  );

  useEffect(() => {
    const nextOfferingId = selectedStart?.offering.id ?? null;
    if (detailsOfferingId === nextOfferingId) return;

    setDetailsOfferingId(nextOfferingId);
    setAcquisitionSource('');
    setAcquisitionSourceOther('');
    setAcquisitionDirty(false);
    setAcquisitionSaving(false);
    setAcquisitionSaveError('');
    setAcquisitionReloadPending(false);
    setPromoCode('');
    setCompetitionRulesAccepted(false);
    setRefundPolicyAccepted(false);
    setRegistrationCreating(false);
    setRegistrationCreateError('');
    setRegistrationCreateNotice('');
    setCheckoutStarting(false);
    setCheckoutError('');
    checkoutStartingRef.current = false;
    checkoutAttemptRef.current = null;
    initializedRegistrationId.current = null;
  }, [detailsOfferingId, selectedStart]);

  useEffect(() => {
    if (managedRegistration?.status === 'confirmed') {
      clearCheckoutAttempt(managedRegistration.id, managedRegistration.registrationOfferingId);
      checkoutAttemptRef.current = null;
    }
  }, [managedRegistration]);

  useEffect(() => {
    if (!registrationIsLoaded || !selectedStart) return;

    if (!managedRegistration) return;

    const storedAttempt = getCheckoutAttempt(managedRegistration.id);
    if (!storedAttempt) {
      checkoutAttemptRef.current = null;
      return;
    }

    if (
      managedRegistration.status === 'pending_payment'
      && storedAttempt.registrationId === managedRegistration.id
      && storedAttempt.registrationOfferingId === selectedStart.offering.id
    ) {
      checkoutAttemptRef.current = storedAttempt;
      return;
    }

    clearCheckoutAttempt(storedAttempt.registrationId, storedAttempt.registrationOfferingId);
    checkoutAttemptRef.current = null;
  }, [managedRegistration, registrationIsLoaded, selectedStart]);

  useEffect(() => {
    if (
      !managedRegistration
      || managedRegistration.status !== 'pending_payment'
      || detailsOfferingId !== managedRegistration.registrationOfferingId
    ) return;

    if (
      initializedRegistrationId.current !== managedRegistration.id
      || acquisitionReloadPending
      || !acquisitionDirty
    ) {
      setAcquisitionSource(managedRegistration.acquisitionSource);
      setAcquisitionSourceOther(managedRegistration.acquisitionSourceOther ?? '');
      setAcquisitionDirty(false);
      setAcquisitionReloadPending(false);
      initializedRegistrationId.current = managedRegistration.id;
    }
  }, [acquisitionDirty, acquisitionReloadPending, detailsOfferingId, managedRegistration]);

  const setPickerParams = useCallback((values: Partial<Record<QueryKey, string | null>>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(values)) {
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
    }
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let current = true;
    setCatalogLoading(true);
    setCatalogError('');
    Promise.all([getRegistrationGames(), getActiveTiers()])
      .then(([nextGames, nextTiers]) => {
        if (current) {
          setGames(nextGames);
          setTiers(nextTiers);
        }
      })
      .catch(() => {
        if (current) {
          setCatalogError('We could not load registration choices. Please try again.');
        }
      })
      .finally(() => {
        if (current) {
          setCatalogLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, [catalogRetry]);

  useEffect(() => {
    if (catalogLoading || catalogError) return;
    if (gameId && !selectedGame) {
      setPickerParams({ game: null, tier: null, start: null });
      return;
    }
    if (tierId && !selectedTier) {
      setPickerParams({ tier: null, start: null });
    }
  }, [catalogError, catalogLoading, gameId, selectedGame, selectedTier, setPickerParams, tierId]);

  useEffect(() => {
    let current = true;
    setStartsError('');
    setStartsLoadedFor('');

    const nextLoadContext = selectedGame && selectedTier
      ? `${selectedGame.id}|${selectedTier.id}`
      : '';
    if (startsLoadContext.current !== nextLoadContext) {
      startsLoadContext.current = nextLoadContext;
      setStartOptions([]);
    }

    if (!selectedGame || !selectedTier) {
      setStartsLoading(false);
      return () => {
        current = false;
      };
    }

    setStartsLoading(true);
    getLeagueStartsForGame(selectedGame.id)
      .then(async (leagueStarts) => {
        const selectableStarts = leagueStarts.filter((leagueStart) => (
          leagueStart.startsAt !== null
          && (leagueStart.status === 'scheduled' || leagueStart.status === 'active')
        ));
        const offeringGroups = await Promise.all(selectableStarts.map(async (leagueStart) => ({
          leagueStart,
          offerings: await getRegistrationOfferingsForLeagueStartAndTier(
            leagueStart.id,
            selectedTier.id,
          ),
        })));
        const now = Date.now();
        const options = offeringGroups.flatMap(({ leagueStart, offerings }) => offerings
          .filter((offering) => isDisplaySelectableOffering(offering, now))
          .map((offering) => ({ leagueStart, offering })));
        if (current) setStartOptions(options);
      })
      .catch(() => {
        if (current) {
          setStartsError('We could not load League Start Dates. Please try again.');
        }
      })
      .finally(() => {
        if (current) {
          setStartsLoading(false);
          setStartsLoadedFor(`${selectedGame.id}|${selectedTier.id}`);
        }
      });

    return () => {
      current = false;
    };
  }, [selectedGame, selectedTier, startsRetry]);

  useEffect(() => {
    const expectedLoad = selectedGame && selectedTier
      ? `${selectedGame.id}|${selectedTier.id}`
      : '';
    if (
      expectedLoad
      && startsLoadedFor === expectedLoad
      && !startsLoading
      && !startsError
      && offeringId
      && !selectedStart
    ) {
      setPickerParams({ start: null });
    }
  }, [
    offeringId,
    selectedGame,
    selectedStart,
    selectedTier,
    setPickerParams,
    startsError,
    startsLoadedFor,
    startsLoading,
  ]);

  useEffect(() => {
    let current = true;
    const nextOfferingId = selectedStart?.offering.id ?? null;
    const offeringChanged = registrationLoadOfferingId.current !== nextOfferingId;
    registrationLoadOfferingId.current = nextOfferingId;
    setRegistration(null);
    setRegistrationError('');
    setRegistrationLoadedFor('');
    if (offeringChanged) {
      setRegistrationRefreshing(false);
    }

    if (!nextOfferingId) {
      setRegistrationLoading(false);
      setRegistrationRefreshing(false);
      return () => {
        current = false;
      };
    }

    setRegistrationLoading(true);
    getRegistration(nextOfferingId)
      .then((nextRegistration) => {
        if (current) setRegistration(nextRegistration);
      })
      .catch(() => {
        if (current) {
          setRegistrationError('We could not check your registration. Please try again.');
        }
      })
      .finally(() => {
        if (current) {
          setRegistrationLoading(false);
          setRegistrationRefreshing(false);
          setRegistrationLoadedFor(nextOfferingId);
        }
      });

    return () => {
      current = false;
    };
  }, [registrationRetry, selectedStart]);

  const refreshRegistrationState = useCallback(() => {
    setRegistrationRefreshing(true);
    setRegistrationRetry((value) => value + 1);
  }, []);

  const saveAcquisition = useCallback(async () => {
    if (
      !selectedStart
      || managedRegistration?.status !== 'pending_payment'
      || acquisitionSaving
    ) return;

    let normalizedAcquisition: AcquisitionAttribution;
    try {
      normalizedAcquisition = normalizeAcquisitionAttribution({
        acquisitionSource,
        acquisitionSourceOther: acquisitionSource === 'other' ? acquisitionSourceOther : null,
      });
    } catch (error) {
      setAcquisitionSaveError(
        error instanceof Error ? error.message : 'Check your registration details and try again.',
      );
      return;
    }

    const offeringAtRequest = selectedStart.offering.id;
    setAcquisitionSaving(true);
    setAcquisitionSaveError('');
    try {
      await updateRegistrationAcquisitionSource(offeringAtRequest, normalizedAcquisition);
      if (
        currentOfferingId.current !== offeringAtRequest
        || currentRegistrationId.current !== managedRegistration.id
      ) return;
      setAcquisitionReloadPending(true);
      refreshRegistrationState();
    } catch {
      if (
        currentOfferingId.current !== offeringAtRequest
        || currentRegistrationId.current !== managedRegistration.id
      ) return;
      setAcquisitionSaveError(
        'Your registration details could not be updated. Your registration may have changed or checkout may already be in progress.',
      );
      setAcquisitionReloadPending(true);
      refreshRegistrationState();
    } finally {
      if (currentOfferingId.current === offeringAtRequest) setAcquisitionSaving(false);
    }
  }, [
    acquisitionSaving,
    acquisitionSource,
    acquisitionSourceOther,
    managedRegistration,
    refreshRegistrationState,
    selectedStart,
  ]);

  const createPendingRegistration = useCallback(async () => {
    const eligibility = getCreateEligibility({
      selectedStart,
      registrationIsLoaded,
      managedRegistration,
      acquisition: normalizedLocalAcquisition,
      localPromoValid,
      competitionRulesAccepted,
      refundPolicyAccepted,
      registrationCreating: registrationCreating || registrationCreatingRef.current,
    });
    if (!eligibility.eligible) {
      setRegistrationCreateError(eligibility.reason);
      return;
    }

    const offeringAtRequest = selectedStart!.offering.id;
    registrationCreatingRef.current = true;
    setRegistrationCreating(true);
    setRegistrationCreateError('');
    setRegistrationCreateNotice('');
    try {
      if (import.meta.env.DEV) console.info('Invoking createRegistration.');
      await createRegistration({
        registrationOfferingId: offeringAtRequest,
        competitionRulesVersionAccepted: CURRENT_COMPETITION_RULES_VERSION,
        refundPolicyVersionAccepted: CURRENT_REFUND_POLICY_VERSION,
        ...normalizedLocalAcquisition!,
      });
      if (currentOfferingId.current !== offeringAtRequest) return;
      setRegistrationCreateNotice('Registration created.');
      setAcquisitionReloadPending(true);
      refreshRegistrationState();
    } catch (error) {
      if (currentOfferingId.current !== offeringAtRequest) return;
      const code = getFirebaseErrorCode(error);
      if (import.meta.env.DEV) console.error('Registration creation failed.', { code: code || 'unknown' });
      if (code === 'permission-denied' || code === 'failed-precondition') {
        setRegistrationCreateError(
          'Your registration could not be created because availability or registration details changed. Please review them and try again.',
        );
      } else if (code === 'unavailable' || code === 'network-request-failed') {
        setRegistrationCreateError(
          'Registration is temporarily unavailable. Check your connection and try again.',
        );
      } else {
        setRegistrationCreateError('Your registration could not be created. Please try again.');
      }
      refreshRegistrationState();
      setStartsRetry((value) => value + 1);
    } finally {
      registrationCreatingRef.current = false;
      if (currentOfferingId.current === offeringAtRequest) setRegistrationCreating(false);
    }
  }, [
    competitionRulesAccepted,
    localPromoValid,
    managedRegistration,
    normalizedLocalAcquisition,
    refreshRegistrationState,
    refundPolicyAccepted,
    registrationCreating,
    registrationIsLoaded,
    selectedStart,
  ]);

  const beginCheckout = useCallback(async () => {
    if (
      !registrationPaymentsEnabled
      || !checkoutEligible
      || !managedRegistration
      || !selectedStart
      || checkoutStartingRef.current
    ) return;

    const offeringAtRequest = selectedStart.offering.id;
    const existingAttempt = checkoutAttemptRef.current
      ?? getCheckoutAttempt(managedRegistration.id);
    const registrationPath = `/register${searchParams.size ? `?${searchParams.toString()}` : ''}`;
    const attempt = existingAttempt?.registrationId === managedRegistration.id
      && existingAttempt.registrationOfferingId === offeringAtRequest
      ? existingAttempt
      : getOrCreateCheckoutAttempt(managedRegistration.id, offeringAtRequest, registrationPath);
    checkoutAttemptRef.current = attempt;
    checkoutStartingRef.current = true;
    setCheckoutStarting(true);
    setCheckoutError('');
    let navigationStarted = false;

    try {
      const result = await createRegistrationCheckout({
        registrationId: managedRegistration.id,
        checkoutRequestId: attempt.checkoutRequestId,
        ...(!promoLocked && normalizedLocalPromo ? { promoCode: normalizedLocalPromo } : {}),
      });
      if (currentOfferingId.current !== offeringAtRequest) return;
      window.location.assign(result.checkoutUrl);
      navigationStarted = true;
    } catch (error) {
      if (currentOfferingId.current !== offeringAtRequest) return;
      const code = typeof (error as { code?: unknown })?.code === 'string'
        ? (error as { code: string }).code.replace('functions/', '')
        : '';
      const message = error instanceof Error ? error.message : '';
      const promoRejected = message.includes('PromoCode is invalid or unavailable');
      const attemptEnded = message.includes('This checkout request has already been used')
        || message.includes('Checkout request already exists')
        || message.includes('existing Checkout Session is no longer open');

      if (attemptEnded) {
        clearCheckoutAttempt(managedRegistration.id, offeringAtRequest);
        checkoutAttemptRef.current = null;
      }

      if (promoRejected) {
        setCheckoutError('That promo code could not be used. Check the code or continue without it.');
      } else if (code === 'failed-precondition' || code === 'not-found' || code === 'already-exists') {
        setCheckoutError(
          attemptEnded
            ? 'That payment attempt is no longer available. Refresh availability before starting a new attempt.'
            : 'Registration or League availability changed. Review the refreshed details and try again.',
        );
        refreshRegistrationState();
        setStartsRetry((value) => value + 1);
      } else {
        setCheckoutError(
          'Secure checkout could not be opened. Retry this same attempt; no new payment request will be created automatically.',
        );
      }
    } finally {
      if (
        !navigationStarted
        && currentOfferingId.current === offeringAtRequest
        && currentRegistrationId.current === managedRegistration.id
      ) {
        checkoutStartingRef.current = false;
        setCheckoutStarting(false);
      }
    }
  }, [
    checkoutEligible,
    managedRegistration,
    normalizedLocalPromo,
    promoLocked,
    refreshRegistrationState,
    searchParams,
    selectedStart,
  ]);

  const currentStep = managedRegistration?.status === 'pending_payment'
    ? 6
    : policiesAvailable ? 5 : selectedStart ? 4 : selectedTier ? 3 : selectedGame ? 2 : 1;
  const activeGames = useMemo(() => games.filter(({ status }) => status === 'active'), [games]);
  const comingSoonGames = useMemo(
    () => games.filter(({ status }) => status === 'coming_soon'),
    [games],
  );

  return (
    <>
      <PageHeader
        eyebrow="League Registration"
        title="Choose Your League Start"
        description="Choose a Game, Tier, and League Start Date. GOATLAND assigns League placement when payment begins."
      />

      <section className="section registration-browser-section">
        <div className="container">
          <ol className="registration-steps" aria-label="Registration browsing progress">
            {['Game', 'Tier', 'Start Date', 'Details', 'Policies', 'Review & Pay'].map((label, index) => (
              <li
                className={`${index + 1 === currentStep ? 'registration-steps__current ' : ''}${index + 1 < currentStep ? 'registration-steps__complete' : ''}`}
                key={label}
                aria-current={index + 1 === currentStep ? 'step' : undefined}
              >
                <span>{index + 1}</span>{label}
              </li>
            ))}
          </ol>

          {catalogLoading ? <LoadingState>Loading Games and Tiers…</LoadingState> : null}
          {!catalogLoading && catalogError ? (
            <ErrorState message={catalogError} onRetry={() => setCatalogRetry((value) => value + 1)} />
          ) : null}

          {!catalogLoading && !catalogError ? (
            <>
              <PickerSection eyebrow="Step 1" title="Choose a Game" description="Select an active Game to continue.">
                {games.length === 0 ? <EmptyState>No Games are available yet.</EmptyState> : (
                  <div className="registration-option-grid">
                    {activeGames.map((game) => (
                      <SelectionCard
                        key={game.id}
                        title={`${game.name}${game.edition ? ` ${game.edition}` : ''}`}
                        selected={selectedGame?.id === game.id}
                        onSelect={() => setPickerParams({
                          game: game.id, tier: null, start: null,
                        })}
                      />
                    ))}
                    {comingSoonGames.map((game) => (
                      <SelectionCard
                        key={game.id}
                        title={`${game.name}${game.edition ? ` ${game.edition}` : ''}`}
                        badge="Coming Soon"
                        disabled
                      />
                    ))}
                  </div>
                )}
                {activeGames.length === 0 && games.length > 0 ? (
                  <p className="registration-note">Registration is not open for any Games yet.</p>
                ) : null}
              </PickerSection>

              {selectedGame ? (
                <PickerSection eyebrow="Step 2" title="Choose a Tier" description={`Active Tiers for ${selectedGame.name}.`}>
                  {tiers.length === 0 ? <EmptyState>No selectable Tiers are available.</EmptyState> : (
                    <div className="registration-option-grid">
                      {tiers.map((tier) => (
                        <SelectionCard
                          key={tier.id}
                          title={tier.name}
                          description={`Competition level ${tier.level}`}
                          selected={selectedTier?.id === tier.id}
                          onSelect={() => setPickerParams({
                            tier: tier.id, start: null,
                          })}
                        />
                      ))}
                    </div>
                  )}
                </PickerSection>
              ) : null}

              {selectedGame && selectedTier ? (
                <PickerSection
                  eyebrow="Step 3"
                  title="Choose a League Start Date"
                  description="Dates and entry fees come from the current League offering."
                >
                  {startsLoading ? <LoadingState>Loading League Start Dates…</LoadingState> : null}
                  {!startsLoading && startsError ? (
                    <ErrorState message={startsError} onRetry={() => setStartsRetry((value) => value + 1)} />
                  ) : null}
                  {!startsLoading && !startsError && startOptions.length === 0 ? (
                    <EmptyState>No League Start Dates are currently available for this Game and Tier.</EmptyState>
                  ) : null}
                  {!startsLoading && !startsError && startOptions.length > 0 ? (
                    <div className="registration-option-grid">
                      {startOptions.map((option) => (
                        <SelectionCard
                          key={option.offering.id}
                          title={formatStartDate(option.leagueStart)}
                          description={`Entry fee: ${formatPrice(option.offering)}`}
                          selected={selectedStart?.offering.id === option.offering.id}
                          onSelect={() => setPickerParams({
                            start: option.offering.id,
                          })}
                        />
                      ))}
                    </div>
                  ) : null}
                </PickerSection>
              ) : null}

              {selectedStart && registrationLoading ? (
                <LoadingState>
                  {registrationRefreshing ? 'Refreshing registration…' : 'Checking your registration…'}
                </LoadingState>
              ) : null}
              {selectedStart && !registrationLoading && registrationError ? (
                <ErrorState
                  message={registrationError}
                  onRetry={() => {
                    setRegistrationRefreshing(true);
                    setRegistrationRetry((value) => value + 1);
                  }}
                />
              ) : null}
              {selectedStart && registrationIsLoaded && managedRegistration ? (
                <RegistrationState
                  registration={managedRegistration}
                  game={selectedGame}
                  tier={selectedTier}
                  start={selectedStart.leagueStart}
                />
              ) : null}
              {selectedStart
                && detailsAvailable
                && detailsOfferingId === selectedStart.offering.id
                ? (
                  <RegistrationDetails
                    acquisitionSource={acquisitionSource}
                    acquisitionSourceOther={acquisitionSourceOther}
                    promoCode={promoCode}
                    promoLocked={promoLocked}
                    persisted={managedRegistration?.status === 'pending_payment'}
                    dirty={acquisitionDirty}
                    saving={acquisitionSaving || registrationCreating}
                    mutationBlocked={registrationLoading || registrationCreating}
                    saveError={acquisitionSaveError}
                    onAcquisitionSourceChange={(source) => {
                      setAcquisitionSource(source);
                      if (source !== 'other') setAcquisitionSourceOther('');
                      setAcquisitionDirty(true);
                      setAcquisitionSaveError('');
                    }}
                    onAcquisitionSourceOtherChange={(detail) => {
                      setAcquisitionSourceOther(detail);
                      setAcquisitionDirty(true);
                      setAcquisitionSaveError('');
                    }}
                    onPromoCodeChange={setPromoCode}
                    onSave={() => void saveAcquisition()}
                  />
                ) : null}
              {selectedStart
                && policiesAvailable
                && detailsOfferingId === selectedStart.offering.id
                ? (
                  <RegistrationPolicies
                    competitionAccepted={competitionRulesAccepted}
                    refundAccepted={refundPolicyAccepted}
                    creating={registrationCreating}
                    createEligible={createEligibility.eligible}
                    createIneligibleReason={createEligibility.reason}
                    createError={registrationCreateError}
                    onCompetitionAcceptedChange={(accepted) => {
                      setCompetitionRulesAccepted(accepted);
                      setRegistrationCreateError('');
                    }}
                    onRefundAcceptedChange={(accepted) => {
                      setRefundPolicyAccepted(accepted);
                      setRegistrationCreateError('');
                    }}
                    onCreate={() => void createPendingRegistration()}
                  />
                ) : null}
              {registrationCreateNotice && managedRegistration?.status === 'pending_payment' ? (
                <p className="registration-details__status" role="status">{registrationCreateNotice}</p>
              ) : null}
              {managedRegistration?.status === 'pending_payment'
                && selectedStart
                && selectedGame
                && selectedTier
                ? (
                  <RegistrationCheckout
                    registration={managedRegistration}
                    offering={selectedStart.offering}
                    game={selectedGame}
                    tier={selectedTier}
                    leagueStart={selectedStart.leagueStart}
                    promoCode={normalizedLocalPromo}
                    promoLocked={promoLocked}
                    eligible={checkoutEligible}
                    policiesCurrent={policiesCurrent}
                    paymentsEnabled={registrationPaymentsEnabled}
                    starting={checkoutStarting}
                    error={checkoutError}
                    onPay={() => void beginCheckout()}
                  />
                ) : null}
            </>
          ) : null}

          <div className="status-banner registration-checkout-notice">
            <div>
              <p className="eyebrow">Registration Checkout</p>
              <h2>Review availability before payment.</h2>
              <p>Stripe Checkout is available only for an eligible pending Registration.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

type PickerSectionProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

function PickerSection({ eyebrow, title, description, children }: PickerSectionProps) {
  return (
    <section className="registration-picker-step">
      <SectionHeading eyebrow={eyebrow} title={title} description={description} />
      {children}
    </section>
  );
}

function LoadingState({ children }: { children: React.ReactNode }) {
  return <p className="registration-inline-state" aria-live="polite">{children}</p>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="registration-inline-state">{children}</p>;
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="registration-inline-state registration-inline-state--error" role="alert">
      <p>{message}</p>
      <button className="button-link button-link--ghost" type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

type RegistrationStateProps = {
  registration: Registration;
  game: Game | null;
  tier: Tier | null;
  start: LeagueStart;
};

function RegistrationState({ registration, game, tier, start }: RegistrationStateProps) {
  if (registration.status === 'cancelled') {
    return (
      <div className="registration-management-state" role="status">
        <p className="eyebrow">Registration cancelled</p>
        <h2>This registration has been cancelled.</h2>
        <p>Contact GOATLAND if you need help registering for this League Start Date again.</p>
      </div>
    );
  }

  if (registration.status === 'expired') {
    return (
      <div className="registration-management-state" role="status">
        <p className="eyebrow">Registration unavailable</p>
        <h2>This registration can’t currently be continued.</h2>
        <p>Reload the page or contact GOATLAND for help.</p>
      </div>
    );
  }

  const confirmed = registration.status === 'confirmed';
  return (
    <div className="registration-management-state" role="status">
      <p className="eyebrow">{confirmed ? "You're registered" : 'Registration ready'}</p>
      <h2>{game?.name}{game?.edition ? ` ${game.edition}` : ''} · {tier?.name}</h2>
      <p>{formatStartDate(start)}</p>
      {!confirmed ? <p>Your league will be assigned when payment begins.</p> : null}
      {!confirmed && (
        registration.competitionRulesVersionAccepted !== CURRENT_COMPETITION_RULES_VERSION
        || registration.refundPolicyVersionAccepted !== CURRENT_REFUND_POLICY_VERSION
      ) ? (
        <p>This pending Registration requires updated policy acceptance before future payment can continue.</p>
      ) : null}
      {confirmed ? <p>Your confirmed league assignment cannot be changed.</p> : null}
    </div>
  );
}
