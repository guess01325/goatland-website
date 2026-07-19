import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { SectionHeading } from '../components/SectionHeading';

type SocialPlatform = {
  name: string;
  actionLabel: string;
  url: string;
  icon: string;
  secondaryLabel?: string;
};

const socialPlatforms: SocialPlatform[] = [
  {
    name: 'Discord',
    actionLabel: 'Join the GOATLAND Community',
    url: 'https://discord.gg/psWSKyrPw',
    icon: '#',
  },
  {
    name: 'X',
    secondaryLabel: 'Formerly Twitter',
    actionLabel: 'Follow GOATLAND on X',
    url: 'https://x.com/goatland__?s=11',
    icon: 'X',
  },
  {
    name: 'Facebook',
    actionLabel: 'Follow GOATLAND on Facebook',
    url: 'https://www.facebook.com/share/1D7tE18K44/?mibextid=wwXIfr',
    icon: 'F',
  },
  {
    name: 'Instagram',
    actionLabel: 'Follow GOATLAND on Instagram',
    url: 'https://www.instagram.com/goatland.gg?igsh=ZWNpZGh5YTVwdGV5&utm_source=qr',
    icon: 'IG',
  },
  {
    name: 'TikTok',
    actionLabel: 'Follow GOATLAND on TikTok',
    url: 'https://www.tiktok.com/@.goatland?_r=1&_t=ZP-983X2q3xNza',
    icon: 'TT',
  },
];

const connectedItems = [
  'League announcements',
  'Tournament news',
  'Registration reminders',
  'Gameplay highlights',
  'Community events',
  'Future feature updates',
];

function SocialPlatformCard({ platform }: { platform: SocialPlatform }) {
  return (
    <article className="preview-card social-card">
      <div className="social-card__topline">
        <span className="social-card__icon" aria-hidden="true">
          {platform.icon}
        </span>
        <div>
          <p className="eyebrow">Social Platform</p>
          {platform.secondaryLabel ? (
            <span className="social-card__secondary">{platform.secondaryLabel}</span>
          ) : null}
        </div>
      </div>
      <h2>{platform.name}</h2>
      <a
        className="button-link"
        href={platform.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {platform.actionLabel}
      </a>
    </article>
  );
}

export function SocialMediaPage() {
  return (
    <>
      <PageHeader
        title="Follow GOATLAND"
        description="Stay connected for league announcements, tournament updates, giveaways, rankings, and community news."
      />

      <section className="section social-page-section">
        <div className="container">
          <SectionHeading
            eyebrow="Official Channels"
            title="GOATLAND Social Platforms"
            description="Follow GOATLAND through the official community and social links below."
          />

          <div className="social-card-grid">
            {socialPlatforms.map((platform) => (
              <SocialPlatformCard platform={platform} key={platform.name} />
            ))}
          </div>
        </div>
      </section>

      <section className="section home-section home-section--alt social-page-section">
        <div className="container split-section">
          <SectionHeading
            eyebrow="Stay Connected"
            title="Stay Connected"
            description="Follow GOATLAND across all platforms to receive:"
          />

          <ul className="connected-list">
            {connectedItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section final-cta">
        <div className="container final-cta__inner">
          <SectionHeading
            eyebrow="Contact"
            title="Need to Reach GOATLAND Directly?"
            description="Visit the Contact page for the official support email, phone support status, and community support link."
          />
          <div className="final-cta__actions">
            <Link className="button-link" to="/contact">
              Contact GOATLAND
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
