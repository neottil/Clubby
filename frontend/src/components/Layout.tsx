import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { theme } from '../theme';
import { config } from '../config';
import { MOBILE_BREAKPOINT } from '../hooks/useIsMobile';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Voucher è la home (vedi App.tsx): primo nel menu.
  const navLinks = [
    { to: '/voucher', label: 'Voucher' },
    ...(user?.isAdmin ? [{ to: '/soci', label: 'Soci' }] : []),
    { to: '/incontri', label: 'Incontri' },
    ...(user?.isAdmin ? [{ to: '/resoconto', label: 'Resoconto' }] : []),
    { to: '/info',    label: 'Info' },
    ...(user?.isAdmin ? [{ to: '/admin', label: 'Admin' }] : []),
  ];

  return (
    <div style={styles.wrapper}>
      {/* Sopra MOBILE_BREAKPOINT il menu diventa un dropdown ancorato in alto
          a destra (come un tipico menu desktop), con un overlay che lo chiude
          al click fuori; sotto resta a tutta larghezza sotto la navbar (come
          un menu mobile). Media query non esprimibile con gli style inline
          React, da qui questo <style> scoped via classi. */}
      <style>{`
        .navbar-overlay { display: none; }
        @media (min-width: ${MOBILE_BREAKPOINT + 1}px) {
          .navbar-menu {
            position: absolute;
            top: 100%;
            right: 32px;
            width: 260px;
            border-top: none !important;
            border-radius: 10px;
            box-shadow: 0 8px 28px rgba(0,0,0,0.28);
          }
          .navbar-overlay.open {
            display: block;
          }
        }
      `}</style>
      <nav style={styles.nav}>
        <Link to="/voucher" style={styles.brandLink}>
          <img src="/logo.svg" alt="" style={styles.brandLogo} />
          <span style={styles.brand}>{config.tenantName}</span>
        </Link>

        <button
          style={styles.hamburgerBtn}
          onClick={() => setMenuOpen(open => !open)}
          aria-label={menuOpen ? 'Chiudi il menu' : 'Apri il menu'}
          aria-expanded={menuOpen}
        >
          <span style={styles.hamburgerBar} />
          <span style={styles.hamburgerBar} />
          <span style={styles.hamburgerBar} />
        </button>

        {menuOpen && (
          <div className="navbar-menu" style={styles.menu}>
            {navLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                style={{
                  ...styles.menuLink,
                  ...(location.pathname.startsWith(link.to) ? styles.linkActive : {}),
                }}
              >
                {link.label}
              </Link>
            ))}
            <div style={styles.menuDivider} />
            <span style={styles.menuEmail}>{user?.email}</span>
            <button
              style={styles.menuLogoutBtn}
              onClick={() => { setMenuOpen(false); logout(); }}
            >
              Esci
            </button>
          </div>
        )}
      </nav>

      {/* Overlay: solo desktop (vedi media query sopra) — chiude il menu al
          click fuori, come un tipico menu a tendina. Su mobile resta sempre
          nascosto (display:none), il menu lì è già a piena larghezza. */}
      {menuOpen && (
        <div
          className={`navbar-overlay${menuOpen ? ' open' : ''}`}
          style={styles.overlay}
          onClick={() => setMenuOpen(false)}
        />
      )}

      <main style={styles.main}>{children}</main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: '100vh', background: '#f8f9fa' },
  nav: {
    position: 'relative',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    padding: '0 32px',
    minHeight: 56,
    background: theme.navBg,
    color: theme.navText,
  },
  brandLink: { display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0 },
  brandLogo: { height: 40, width: 40, marginRight: 4, flexShrink: 0 },
  brand: { fontWeight: 700, fontSize: 20, color: theme.navText, flexShrink: 0 },
  hamburgerBtn: {
    marginLeft: 'auto',
    display: 'flex',
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
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.15)',
    zIndex: 100,
  },
  menu: {
    // flexBasis 100%: dentro il <nav> flex (flexWrap:wrap), forza il menu a
    // occupare una riga propria a piena larghezza sotto logo/brand/hamburger
    // (mobile). Ignorato quando la media query desktop lo passa a
    // position:absolute (esce dal flusso flex).
    flexBasis: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: theme.navBg,
    borderTop: `1px solid rgba(255,255,255,0.15)`,
    padding: '8px 16px 16px',
    zIndex: 101,
  },
  menuLink: {
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
  linkActive: { background: theme.primary, color: theme.primaryText },
  menuDivider: {
    height: 1,
    background: 'rgba(255,255,255,0.15)',
    margin: '8px 0',
  },
  menuEmail: {
    fontSize: 13,
    color: theme.navText,
    padding: '4px 14px 12px',
    display: 'block',
    wordBreak: 'break-all',
  },
  menuLogoutBtn: {
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
    alignSelf: 'flex-start',
  },
};
