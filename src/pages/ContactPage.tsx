import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { SectionHeading } from '../components/SectionHeading';

type ContactCard = {
  label: string;
  title: string;
  body: string;
  icon: string;
  action?: {
    label: string;
    href: string;
    isExternal?: boolean;
  };
  status?: string;
};

const contactCards: ContactCard[] = [
  {
    label: 'Email',
    title: 'General Support',
    body: 'We aim to respond as quickly as possible.',
    icon: '@',
    action: {
      label: 'goatlandllcqs@gmail.com',
      href: 'mailto:goatlandllcqs@gmail.com',
    },
  },
  {
    label: 'Phone',
    title: 'Coming Soon',
    body: 'A dedicated GOATLAND support phone number will be available after the official app launches.',
    icon: 'TEL',
    status: 'Coming Soon',
  },
  {
    label: 'Community Support',
    title: 'Community Support',
    body: 'Need help from other players or want to stay updated?',
    icon: '#',
    action: {
      label: 'Join our Discord Community',
      href: 'https://discord.gg/psWSKyrPw',
      isExternal: true,
    },
  },
];

function ContactCard({ card }: { card: ContactCard }) {
  return (
    <article className="preview-card contact-card">
      <div className="contact-card__topline">
        <span className="contact-card__icon" aria-hidden="true">
          {card.icon}
        </span>
        <p className="eyebrow">{card.label}</p>
      </div>
      <h2>{card.title}</h2>
      <p>{card.body}</p>
      {card.status ? <span className="contact-card__status">{card.status}</span> : null}
      {card.action ? (
        card.action.isExternal ? (
          <a
            className="button-link"
            href={card.action.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {card.action.label}
          </a>
        ) : (
          <a className="text-link" href={card.action.href}>
            {card.action.label}
          </a>
        )
      ) : null}
    </article>
  );
}

export function ContactPage() {
  return (
    <>
      <PageHeader
        title="Get in Touch"
        description="Have a question about GOATLAND leagues, tournaments, or your account? We’d love to hear from you."
      />

      <section className="section contact-page-section">
        <div className="container">
          <SectionHeading
            eyebrow="Contact"
            title="How to Reach GOATLAND"
            description="Use the official support email, check the upcoming phone support status, or join the GOATLAND Discord community."
          />

          <div className="contact-card-grid">
            {contactCards.map((card) => (
              <ContactCard card={card} key={card.label} />
            ))}
          </div>
        </div>
      </section>

      <section className="section final-cta">
        <div className="container final-cta__inner">
          <SectionHeading
            eyebrow="Social Media"
            title="Follow Every GOATLAND Channel"
            description="Find the official GOATLAND social platforms for league announcements, tournament updates, rankings, and community news."
          />
          <div className="final-cta__actions">
            <Link className="button-link" to="/social-media">
              View all GOATLAND social platforms
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
