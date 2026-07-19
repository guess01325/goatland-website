import { NavLink } from 'react-router-dom';
import logo from '../../references/GOATLAND_Logo.png';
import { footerNavItems } from '../data/navigation';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__brand">
          <img className="site-footer__logo" src={logo} alt="GOATLAND" />
          <p>Public website foundation for the GOATLAND competitive gaming brand.</p>
        </div>

        <nav className="footer-nav" aria-label="Footer navigation">
          {footerNavItems.map((item) => (
            <NavLink className="footer-nav__link" key={item.path} to={item.path}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </footer>
  );
}
