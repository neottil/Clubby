import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { theme } from '../theme';
import { config } from '../config';

interface LayoutProps {
  children: React.ReactNode;
}

const MOBILE_BREAKPOINT = 640;

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    ...(user?.isAdmin ? [{ to: '/soci', label: 'Soci' }] : []),
    { to: '/incontri', label: 'Incontri' },
    { to: '/buoni',   label: 'Voucher' },
    ...(user?.isAdmin ? [{ to: '/admin', label: 'Admin' }] : []),
  ];

  return (
    <div style={styles.wrapper}>
      {/* Sotto MOBILE_BREAKPOINT: nasconde i controlli desktop (link, email,
          Esci) e mostra l'hamburger; sopra: il contrario. Media query non
          esprimibile con gli style inline React, da qui questo <style> scoped
          via classi. */}
      <style>{`
        .navbar-desktop-controls { display: flex; align-items: center; }
        .navbar-hamburger { display: none; }
        .navbar-mobile-menu { display: none; }
        @media (max-width: ${MOBILE_BREAKPOINT}px) {
          .navbar-desktop-controls { display: none; }
          .navbar-hamburger { display: flex; }
          .navbar-mobile-menu.open { display: flex; }
        }
      `}</style>
      <nav style={styles.nav}>
        <img src="/logo.svg" alt="" style={styles.brandLogo} />
        <span style={styles.brand}>{config.tenantName}</span>

        <div className="navbar-desktop-controls" style={styles.desktopControls}>
          <div style={styles.links}>
            {navLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                style={{
                  ...styles.link,
                  ...(location.pathname.startsWith(link.to) ? styles.linkActive : {}),
                }}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div style={styles.userInfo}>
            <span style={styles.email}>{user?.email}</span>
            <button style={styles.logoutBtn} onClick={logout}>Esci</button>
          </div>
        </div>

        <button
          className="navbar-hamburger"
          style={styles.hamburgerBtn}
          onClick={() => setMenuOpen(open => !open)}
          aria-label={menuOpen ? 'Chiudi il menu' : 'Apri il menu'}
          aria-expanded={menuOpen}
        >
          <span style={styles.hamburgerBar} />
          <span style={styles.hamburgerBar} />
          <span style={styles.hamburgerBar} />
        </button>
      </nav>

      <div className={`navbar-mobile-menu${menuOpen ? ' open' : ''}`} style={styles.mobileMenu}>
        {navLinks.map(link => (
          <Link
            key={link.to}
            to={link.to}
            onClick={() => setMenuOpen(false)}
            style={{
              ...styles.mobileLink,
              ...(location.pathname.startsWith(link.to) ? styles.linkActive : {}),
            }}
          >
            {link.label}
          </Link>
        ))}
        <div style={styles.mobileDivider} />
        <span style={styles.mobileEmail}>{user?.email}</span>
        <button
          style={styles.mobileLogoutBtn}
          onClick={() => { setMenuOpen(false); logout(); }}
        >
          Esci
        </button>
      </div>

      <main style={styles.main}>{children}</main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: '100vh', background: '#f8f9fa' },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: 24,
    padding: '0 32px',
    height: 56,
    background: theme.navBg,
    color: theme.navText,
  },
  brandLogo: { height: 40, width: 40, marginRight: 4, flexShrink: 0 },
  brand: { fontWeight: 700, fontSize: 20, marginRight: 16, color: theme.navText, flexShrink: 0 },
  desktopControls: { flex: 1, justifyContent: 'space-between', minWidth: 0 },
  links: { display: 'flex', gap: 8, flex: 1 },
  link: {
    color: theme.navText,
    textDecoration: 'none',
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
  },
  linkActive: { background: theme.primary, color: theme.primaryText },
  userInfo: { display: 'flex', alignItems: 'center', gap: 12 },
  email: { fontSize: 13, color: theme.navText },
  logoutBtn: {
    background: 'transparent',
    border: `1px solid ${theme.navText}`,
    color: theme.navText,
    borderRadius: 6,
    padding: '4px 12px',
    cursor: 'pointer',
    fontSize: 13,
  },
  hamburgerBtn: {
    marginLeft: 'auto',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    width: 44,
    height: 44,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
  },
  hamburgerBar: {
    display: 'block',
    width: 22,
    height: 2,
    background: theme.navText,
    borderRadius: 1,
  },
  mobileMenu: {
    flexDirection: 'column',
    background: theme.navBg,
    borderTop: `1px solid rgba(255,255,255,0.15)`,
    padding: '8px 16px 16px',
  },
  mobileLink: {
    color: theme.navText,
    textDecoration: 'none',
    padding: '12px 14px',
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    borderRadius: 6,
    fontSize: 15,
    fontWeight: 500,
  },
  mobileDivider: {
    height: 1,
    background: 'rgba(255,255,255,0.15)',
    margin: '8px 0',
  },
  mobileEmail: {
    fontSize: 13,
    color: theme.navText,
    padding: '4px 14px 12px',
    display: 'block',
    wordBreak: 'break-all',
  },
  mobileLogoutBtn: {
    background: 'transparent',
    border: `1px solid ${theme.navText}`,
    color: theme.navText,
    borderRadius: 6,
    padding: '10px 14px',
    minHeight: 44,
    cursor: 'pointer',
    fontSize: 14,
    marginLeft: 14,
    marginRight: 14,
  },
};
