import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { theme } from '../theme';
import { config } from '../config';
import { createApiClient } from '../api/client';
import { MOBILE_BREAKPOINT } from '../hooks/useIsMobile';

interface LayoutProps {
  children: React.ReactNode;
}

/** Voce di menu: `bloccata` la spegne e spiega il perché dietro un "?". */
interface VoceMenu {
  to: string;
  label: string;
  bloccata?: string;
}

const MOTIVO_SENZA_INTESTAZIONE =
  'Configura l\'intestazione delle ricevute nel menu Impostazioni (/impostazioni), card "Ricevute".';

export default function Layout({ children }: LayoutProps) {
  const { user, logout, socioCollegato, token } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [spiegazioneAperta, setSpiegazioneAperta] = useState('');

  // Il modulo Ricevute acceso non basta: senza intestazione la pagina
  // produrrebbe documenti monchi e irreversibili. null = non ancora saputo,
  // e in quel caso la voce resta attiva — spegnerla e riaccenderla a risposta
  // arrivata sarebbe un lampeggio a ogni apertura del menu.
  const serveIntestazione = !!user?.isAdmin && config.moduli.ricevute;
  const [intestazioneConfigurata, setIntestazioneConfigurata] = useState<boolean | null>(null);

  // Si rilegge a ogni apertura del menu, non una volta sola: l'admin che la
  // configura in Impostazioni deve trovare la voce attiva subito dopo, senza
  // ricaricare la pagina.
  useEffect(() => {
    if (!serveIntestazione || !menuOpen || !token) return;
    let annullato = false;
    createApiClient(token).getImpostazioni()
      .then(i => { if (!annullato) setIntestazioneConfigurata(!!i.ricevuta_intestazione?.trim()); })
      // Un errore qui non deve nascondere la voce: al massimo resta attiva e
      // sarà la pagina a dire cosa non va.
      .catch(() => { if (!annullato) setIntestazioneConfigurata(null); });
    return () => { annullato = true; };
  }, [serveIntestazione, menuOpen, token]);

  const ricevuteBloccate = serveIntestazione && intestazioneConfigurata === false;

  // Voucher è la home (vedi App.tsx): primo nel menu.
  // L'istruttore ha bisogno dell'elenco soci (ne vede il solo nominativo) e
  // del proprio resoconto; l'amministrazione resta agli admin.
  const navLinks: VoceMenu[] = !user ? [
    // Senza sessione resta solo Info, che serve proprio quando l'accesso non
    // funziona, e la strada per tornare al form: da /info non ce ne sarebbe
    // un'altra se non riscrivere l'indirizzo.
    { to: '/info',  label: 'Info' },
    { to: '/login', label: 'Accedi' },
  ] : [
    { to: '/voucher', label: 'Voucher' },
    ...(user?.isAdmin || user?.isIstruttore ? [{ to: '/soci', label: 'Soci' }] : []),
    { to: '/incontri', label: 'Incontri' },
    // Resoconto è la vista del singolo istruttore: un admin consulta gli
    // stessi dati da Resoconti, scegliendo sé stesso.
    ...(user?.isIstruttore && !user?.isAdmin ? [{ to: '/resoconto', label: 'Resoconto' }] : []),
    // Tesseramenti è per tutti col modulo attivo: l'admin ci gestisce il club,
    // il socio ci trova la propria scadenza e i propri rinnovi. Sta fuori dal
    // blocco riservato all'admin proprio per questo.
    ...(config.moduli.tesseramento ? [{ to: '/tesseramenti', label: 'Tesseramenti' }] : []),
    ...(user?.isAdmin ? [
      { to: '/resoconti', label: 'Resoconti' },
      // Moduli opzionali del club: senza, le rotte non esistono (vedi App.tsx).
      ...(config.moduli.ricevute
        ? [{ to: '/ricevute', label: 'Ricevute', bloccata: ricevuteBloccate ? MOTIVO_SENZA_INTESTAZIONE : undefined }]
        : []),
    ] : []),
    { to: '/manuale', label: 'Manuale' },
    { to: '/info',    label: 'Info' },
    ...(user?.isAdmin ? [{ to: '/impostazioni', label: 'Impostazioni' }] : []),
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
        <Link to={user ? '/voucher' : '/login'} style={styles.brandLink}>
          <img src={config.logo} alt="" style={styles.brandLogo} />
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
            {navLinks.map(link => (link.bloccata ? (
              // Voce spenta: resta visibile perché sparire non spiegherebbe
              // niente, e il "?" dice cosa manca. Un <div> e non un <Link>
              // disabilitato: un'ancora disabilitata non esiste in HTML, e
              // togliere l'href lasciando il resto confonde chi naviga da
              // tastiera.
              <div key={link.to} style={styles.menuVoceBloccata}>
                <div style={styles.menuRigaBloccata}>
                  <span style={styles.menuLabelBloccata}>{link.label}</span>
                  <button
                    style={styles.menuAiutoBtn}
                    onClick={() => setSpiegazioneAperta(a => (a === link.to ? '' : link.to))}
                    aria-expanded={spiegazioneAperta === link.to}
                    aria-controls={`spiegazione-${link.to.slice(1)}`}
                    aria-label={`Perché ${link.label} non è disponibile`}
                    title={link.bloccata}
                  >
                    ?
                  </button>
                </div>
                {spiegazioneAperta === link.to && (
                  <p id={`spiegazione-${link.to.slice(1)}`} style={styles.menuSpiegazione}>
                    {link.bloccata}
                  </p>
                )}
              </div>
            ) : (
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
            )))}
            {user && (
              <>
                <div style={styles.menuDivider} />
                <span style={styles.menuEmail}>{user.email}</span>
                <button
                  style={styles.menuLogoutBtn}
                  onClick={() => { setMenuOpen(false); logout(); }}
                >
                  Esci
                </button>
              </>
            )}
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

      {/* Un account che non è ancora legato a un socio vede l'applicazione
          vuota: senza questo avviso sembrerebbe rotta. Non riguarda gli admin,
          che lavorano sui dati di tutti e non hanno bisogno di un socio
          proprio. */}
      {user && socioCollegato === false && !user.isAdmin && (
        <div style={styles.avvisoSocio}>
          Il tuo account non è ancora collegato alla tua scheda socio. Chiedi a un amministratore di collegarlo.
        </div>
      )}

      <main style={styles.main}>{children}</main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: '100vh', background: '#f8f9fa' },
  avvisoSocio: {
    background: '#fff7ed', color: '#9a3412', borderBottom: '1px solid #fed7aa',
    padding: '12px 32px', fontSize: 14, lineHeight: 1.5,
  },
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
  // Voce spenta: stessa metrica di menuLink, così l'elenco non si scompone.
  menuVoceBloccata: { display: 'flex', flexDirection: 'column' },
  menuRigaBloccata: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '12px 14px', minHeight: 44,
  },
  menuLabelBloccata: {
    color: theme.navText, opacity: 0.45, fontSize: 15, fontWeight: 500, cursor: 'not-allowed',
  },
  menuAiutoBtn: {
    width: 22, height: 22, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', color: theme.navText,
    border: `1px solid ${theme.navText}`, borderRadius: '50%',
    fontSize: 13, lineHeight: 1, cursor: 'pointer', padding: 0,
    fontFamily: 'inherit', fontWeight: 700, opacity: 0.8,
  },
  menuSpiegazione: {
    margin: '0 14px 12px',
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.10)',
    borderRadius: 6,
    color: theme.navText,
    fontSize: 13,
    lineHeight: 1.5,
  },
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
