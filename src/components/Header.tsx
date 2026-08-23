import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import logo from '../../references/GOATLAND_Logo.png';
import { getAuthErrorMessage } from '../auth/authErrors';
import { useAuth } from '../auth/AuthProvider';
import { mainNavItems } from '../data/navigation';

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const { user, loading, logOut } = useAuth();

  const closeMenu = () => setIsMenuOpen(false);

  const handleLogout = async () => {
    setLogoutError('');
    setLoggingOut(true);
    try {
      await logOut();
      closeMenu();
    } catch (error) {
      setLogoutError(getAuthErrorMessage(error));
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <NavLink
          aria-label="GOATLAND home"
          className="brand-link"
          to="/"
          onClick={closeMenu}
        >
          <img className="brand-link__logo" src={logo} alt="GOATLAND" />
        </NavLink>

        <nav className="desktop-nav" aria-label="Primary navigation">
          {mainNavItems.map((item) => (
            <NavLink
              className={({ isActive }) =>
                isActive ? 'nav-link nav-link--active' : 'nav-link'
              }
              key={item.path}
              to={item.path}
            >
              {item.label}
            </NavLink>
          ))}
          {!loading && (user ? (
            <button className="nav-link auth-nav-button" type="button" onClick={handleLogout} disabled={loggingOut}>
              {loggingOut ? 'Logging out…' : 'Log out'}
            </button>
          ) : (
            <NavLink className="nav-link auth-nav-link" to="/login">Log in</NavLink>
          ))}
        </nav>

        <button
          aria-controls="mobile-navigation"
          aria-expanded={isMenuOpen}
          aria-label="Toggle navigation"
          className="menu-button"
          type="button"
          onClick={() => setIsMenuOpen((current) => !current)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <nav
        aria-label="Mobile navigation"
        className={isMenuOpen ? 'mobile-nav mobile-nav--open' : 'mobile-nav'}
        id="mobile-navigation"
      >
        <div className="container mobile-nav__inner">
          {mainNavItems.map((item) => (
            <NavLink
              className={({ isActive }) =>
                isActive ? 'mobile-nav__link mobile-nav__link--active' : 'mobile-nav__link'
              }
              key={item.path}
              to={item.path}
              onClick={closeMenu}
            >
              {item.label}
            </NavLink>
          ))}
          {!loading && (user ? (
            <button className="mobile-nav__link auth-mobile-button" type="button" onClick={handleLogout} disabled={loggingOut}>
              {loggingOut ? 'Logging out…' : 'Log out'}
            </button>
          ) : (
            <NavLink className="mobile-nav__link" to="/login" onClick={closeMenu}>Log in</NavLink>
          ))}
          {logoutError ? <p className="header-auth-error" role="alert">{logoutError}</p> : null}
        </div>
      </nav>
    </header>
  );
}
