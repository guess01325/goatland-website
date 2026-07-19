import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

export function NotFoundPage() {
  return (
    <>
      <PageHeader
        eyebrow="404"
        title="Page Not Found"
        description="The requested GOATLAND page does not exist."
      />
      <section className="section">
        <div className="container">
          <Link className="button-link" to="/">
            Return Home
          </Link>
        </div>
      </section>
    </>
  );
}
