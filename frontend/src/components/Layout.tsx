import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { theme } from '../theme';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navLinks = [
    ...(user?.isAdmin ? [{ to: '/soci', label: 'Soci' }] : []),
    { to: '/incontri', label: 'Incontri' },
    { to: '/buoni',   label: 'Voucher' },
    ...(user?.isAdmin ? [{ to: '/admin', label: 'Admin' }] : []),
  ];

  return (
    <div style={styles.wrapper}>
      <nav style={styles.nav}>
        <span style={styles.brand}>ClubManager</span>
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
      </nav>
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
  brand: { fontWeight: 700, fontSize: 20, marginRight: 16, color: theme.navText },
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
};
