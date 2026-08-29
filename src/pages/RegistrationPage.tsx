import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LeagueRoster } from '../components/registration/LeagueRoster';
import { SelectionCard } from '../components/registration/SelectionCard';
import { PageHeader } from '../components/PageHeader';
import { SectionHeading } from '../components/SectionHeading';
import type { Game } from '../models/Game';
import type { League } from '../models/League';
import type { LeagueStart } from '../models/LeagueStart';
import type { PublicRosterEntry } from '../models/PublicRosterEntry';
import type { RegistrationOffering } from '../models/RegistrationOffering';
import type { Tier } from '../models/Tier';
import { getRegistrationGames } from '../services/games';
import { getLeagueStartsForGame } from '../services/leagueStarts';
import { getLeaguesByRegistrationOffering, getPublicRoster } from '../services/leagues';
import { getRegistrationOfferingsForLeagueStartAndTier } from '../services/registrationOfferings';
import { getActiveTiers } from '../services/tiers';

type StartOption = {
  leagueStart: LeagueStart;
  offering: RegistrationOffering;
};

type QueryKey = 'game' | 'tier' | 'start' | 'league';

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
  const [leagues, setLeagues] = useState<League[]>([]);
  const [leaguesLoading, setLeaguesLoading] = useState(false);
  const [leaguesError, setLeaguesError] = useState('');
  const [leaguesRetry, setLeaguesRetry] = useState(0);
  const [leaguesLoadedFor, setLeaguesLoadedFor] = useState('');
  const [roster, setRoster] = useState<PublicRosterEntry[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState('');
  const [rosterRetry, setRosterRetry] = useState(0);

  const gameId = searchParams.get('game');
  const tierId = searchParams.get('tier');
  const offeringId = searchParams.get('start');
  const leagueId = searchParams.get('league');

  const selectedGame = games.find((game) => game.id === gameId && game.status === 'active') ?? null;
  const selectedTier = tiers.find((tier) => tier.id === tierId) ?? null;
  const selectedStart = startOptions.find((option) => option.offering.id === offeringId) ?? null;
  const selectedLeague =
    leagues.find((league) => league.id === leagueId && league.status === 'open') ?? null;

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
      setPickerParams({ game: null, tier: null, start: null, league: null });
      return;
    }
    if (tierId && !selectedTier) {
      setPickerParams({ tier: null, start: null, league: null });
    }
  }, [catalogError, catalogLoading, gameId, selectedGame, selectedTier, setPickerParams, tierId]);

  useEffect(() => {
    let current = true;
    setStartOptions([]);
    setStartsError('');
    setStartsLoadedFor('');

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
      setPickerParams({ start: null, league: null });
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
    setLeagues([]);
    setLeaguesError('');
    setLeaguesLoadedFor('');
    if (!selectedStart) {
      setLeaguesLoading(false);
      return () => {
        current = false;
      };
    }
    setLeaguesLoading(true);
    getLeaguesByRegistrationOffering(selectedStart.offering.id)
      .then((nextLeagues) => {
        if (current) setLeagues(nextLeagues);
      })
      .catch(() => {
        if (current) setLeaguesError('We could not load Leagues. Please try again.');
      })
      .finally(() => {
        if (current) {
          setLeaguesLoading(false);
          setLeaguesLoadedFor(selectedStart.offering.id);
        }
      });
    return () => {
      current = false;
    };
  }, [leaguesRetry, selectedStart]);

  useEffect(() => {
    if (
      selectedStart
      && leaguesLoadedFor === selectedStart.offering.id
      && !leaguesLoading
      && !leaguesError
      && leagueId
      && !selectedLeague
    ) {
      setPickerParams({ league: null });
    }
  }, [
    leagueId,
    leaguesError,
    leaguesLoadedFor,
    leaguesLoading,
    selectedLeague,
    selectedStart,
    setPickerParams,
  ]);

  useEffect(() => {
    let current = true;
    setRoster([]);
    setRosterError('');
    if (!selectedLeague) {
      setRosterLoading(false);
      return () => {
        current = false;
      };
    }
    setRosterLoading(true);
    getPublicRoster(selectedLeague.id)
      .then((entries) => {
        if (current) setRoster(entries);
      })
      .catch(() => {
        if (current) setRosterError('We could not load the confirmed roster. Please try again.');
      })
      .finally(() => {
        if (current) setRosterLoading(false);
      });
    return () => {
      current = false;
    };
  }, [rosterRetry, selectedLeague]);

  const currentStep = selectedLeague ? 4 : selectedStart ? 4 : selectedTier ? 3 : selectedGame ? 2 : 1;
  const activeGames = useMemo(() => games.filter(({ status }) => status === 'active'), [games]);
  const comingSoonGames = useMemo(
    () => games.filter(({ status }) => status === 'coming_soon'),
    [games],
  );

  return (
    <>
      <PageHeader
        eyebrow="League Registration"
        title="Choose Your League"
        description="Explore available Games, Tiers, League Start Dates, and confirmed rosters before registration checkout opens."
      />

      <section className="section registration-browser-section">
        <div className="container">
          <ol className="registration-steps" aria-label="Registration browsing progress">
            {['Game', 'Tier', 'Start Date', 'League'].map((label, index) => (
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
                          game: game.id, tier: null, start: null, league: null,
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
                            tier: tier.id, start: null, league: null,
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
                            start: option.offering.id, league: null,
                          })}
                        />
                      ))}
                    </div>
                  ) : null}
                </PickerSection>
              ) : null}

              {selectedStart ? (
                <PickerSection
                  eyebrow="Step 4"
                  title="Choose a League"
                  description={`${formatStartDate(selectedStart.leagueStart)} · ${selectedTier?.name}`}
                >
                  {leaguesLoading ? <LoadingState>Loading Leagues…</LoadingState> : null}
                  {!leaguesLoading && leaguesError ? (
                    <ErrorState message={leaguesError} onRetry={() => setLeaguesRetry((value) => value + 1)} />
                  ) : null}
                  {!leaguesLoading && !leaguesError && leagues.length === 0 ? (
                    <EmptyState>No Leagues are available for this start date.</EmptyState>
                  ) : null}
                  {!leaguesLoading && !leaguesError && leagues.length > 0 ? (
                    <div className="registration-league-layout">
                      <div className="registration-option-grid registration-option-grid--leagues">
                        {leagues.map((league) => (
                          <SelectionCard
                            key={league.id}
                            title={`League ${league.leagueNumber}`}
                            badge={league.status === 'open' ? 'Open' : league.status}
                            description={(
                              <>
                                {league.confirmedCount} of {league.capacity} confirmed
                                <small>Availability checked at payment</small>
                              </>
                            )}
                            selected={selectedLeague?.id === league.id}
                            disabled={league.status !== 'open'}
                            onSelect={() => setPickerParams({ league: league.id })}
                          />
                        ))}
                        {!leagues.some(({ status }) => status === 'open') ? (
                          <EmptyState>No open Leagues are currently available.</EmptyState>
                        ) : null}
                      </div>
                      {selectedLeague ? (
                        <LeagueRoster
                          leagueLabel={`League ${selectedLeague.leagueNumber}`}
                          entries={roster}
                          loading={rosterLoading}
                          error={rosterError}
                          onRetry={() => setRosterRetry((value) => value + 1)}
                        />
                      ) : (
                        <aside className="preview-card registration-roster registration-roster--empty">
                          <p className="eyebrow">Confirmed Roster</p>
                          <h2>Select a League</h2>
                          <p>Choose an open League to view its confirmed players.</p>
                        </aside>
                      )}
                    </div>
                  ) : null}
                </PickerSection>
              ) : null}
            </>
          ) : null}

          <div className="status-banner registration-checkout-notice">
            <div>
              <p className="eyebrow">Registration Preview</p>
              <h2>Browse now. Checkout later.</h2>
              <p>Registration checkout will be available after final competition details are published.</p>
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
