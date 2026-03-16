import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navLinks = [
    { to: '/soci',    label: 'Soci' },
    { to: '/incontri', label: 'Incontri' },
    { to: '/buoni',   label: 'Buoni' },
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
    background: '#1a1a2e',
    color: '#fff',
  },
  brand: { fontWeight: 700, fontSize: 20, marginRight: 16 },
  links: { display: 'flex', gap: 8, flex: 1 },
  link: {
    color: '#c0c0d0',
    textDecoration: 'none',
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
  },
  linkActive: { background: '#2563eb', color: '#fff' },
  userInfo: { display: 'flex', alignItems: 'center', gap: 12 },
  email: { fontSize: 13, color: '#a0a0b8' },
  logoutBtn: {
    background: 'transparent',
    border: '1px solid #444',
    color: '#c0c0d0',
    borderRadius: 6,
    padding: '4px 12px',
    cursor: 'pointer',
    fontSize: 13,
  },
};
