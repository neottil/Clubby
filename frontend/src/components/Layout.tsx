import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { theme } from '../theme';
import { config } from '../config';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    ...(user?.isAdmin ? [{ to: '/soci', label: 'Soci' }] : []),
    { to: '/incontri', label: 'Incontri' },
    { to: '/buoni',   label: 'Voucher' },
    { to: '/info',    label: 'Info' },
    ...(user?.isAdmin ? [{ to: '/admin', label: 'Admin' }] : []),
  ];

  return (
    <div style={styles.wrapper}>
      <nav style={styles.nav}>
        <img src="/logo.svg" alt="" style={styles.brandLogo} />
        <span style={styles.brand}>{config.tenantName}</span>

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
      </nav>

      {menuOpen && (
        <div style={styles.menu}>
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

      <main style={styles.main}>{children}</main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: '100vh', background: '#f8f9fa' },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 32px',
    height: 56,
    background: theme.navBg,
    color: theme.navText,
  },
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
  menu: {
    display: 'flex',
    flexDirection: 'column',
    background: theme.navBg,
    borderTop: `1px solid rgba(255,255,255,0.15)`,
    padding: '8px 16px 16px',
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
