import { useEffect, useState } from 'react';

const registrationLaunchTime = Date.UTC(2026, 8, 4, 4, 0, 0);

type TimeRemaining = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  hasLaunched: boolean;
};

function getTimeRemaining(): TimeRemaining {
  const remainingMilliseconds = Math.max(0, registrationLaunchTime - Date.now());
  const totalSeconds = Math.ceil(remainingMilliseconds / 1000);

  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
    hasLaunched: remainingMilliseconds === 0,
  };
}

const timerUnits: { key: keyof Omit<TimeRemaining, 'hasLaunched'>; label: string }[] = [
  { key: 'days', label: 'Days' },
  { key: 'hours', label: 'Hours' },
  { key: 'minutes', label: 'Minutes' },
  { key: 'seconds', label: 'Seconds' },
];

export function RegistrationLaunchCountdown() {
  const [timeRemaining, setTimeRemaining] = useState(getTimeRemaining);

  useEffect(() => {
    if (timeRemaining.hasLaunched) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setTimeRemaining(getTimeRemaining());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [timeRemaining.hasLaunched]);

  return (
    <section className="section home-section registration-countdown" id="registration-announcement">
      <div className="container registration-countdown__inner">
        <p className="eyebrow">The Competition Is About to Begin</p>
        <h2 aria-live="polite">
          {timeRemaining.hasLaunched ? (
            'Registration Is Open'
          ) : (
            <>Registration<br />Launches September 4</>
          )}
        </h2>
        <p className="registration-countdown__intro">
          Get ready to compete. Registration for Goatland leagues opens September 4, 2026.
        </p>

        <div className="registration-countdown__timer" role="timer" aria-label="Time until registration opens">
          {timerUnits.map(({ key, label }) => (
            <div className="registration-countdown__unit" key={key}>
              <strong>{String(timeRemaining[key]).padStart(2, '0')}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>

        <div className="registration-countdown__details">
          <p><span>Registration Opens</span><strong>September 4, 2026</strong></p>
          <p>Spots are limited. Be ready when registration opens.</p>
        </div>
      </div>
    </section>
  );
}
