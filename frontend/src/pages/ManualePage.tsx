import { useAuth } from '../auth/AuthContext';
import { config } from '../config';
import { ui } from '../styles/ui';
import { theme } from '../theme';
import { SEZIONI, type ContestoManuale, type Sezione } from '../manuale/sezioni';

/**
 * Manuale d'uso (spec 005): una pagina sola, con le sezioni che riguardano
 * chi la apre. Ruolo nel club e privilegio admin si sommano, quindi un admin
 * istruttore legge le sezioni di entrambi. Nessuna chiamata API: basta ciò
 * che il frontend sa già dell'utente e del club.
 */
export default function ManualePage() {
  const { user, socioCollegato } = useAuth();

  const contesto: ContestoManuale = {
    admin: !!user?.isAdmin,
    istruttore: !!user?.isIstruttore,
    schedaCollegata: socioCollegato,
    moduli: config.moduli,
    modalitaRicarica: config.modalitaRicarica,
  };

  const visibili = SEZIONI.filter(s => s.visibile(contesto));

  // Gruppi nell'ordine in cui compaiono le sezioni: prima ciò che riguarda
  // chiunque, poi istruttore, poi amministrazione.
  const gruppi: Array<{ nome: Sezione['gruppo']; sezioni: Sezione[] }> = [];
  for (const s of visibili) {
    const ultimo = gruppi[gruppi.length - 1];
    if (ultimo?.nome === s.gruppo) ultimo.sezioni.push(s);
    else gruppi.push({ nome: s.gruppo, sezioni: [s] });
  }

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Manuale</h2>
      <p style={styles.intro}>
        Come si usa {config.tenantName} con il tuo account. Trovi solo le pagine che puoi aprire.
      </p>

      <nav style={styles.indice} aria-label='Indice del manuale'>
        {gruppi.map(g => (
          <div key={g.nome}>
            <div style={styles.indiceGruppo}>{g.nome}</div>
            <ul style={styles.indiceElenco}>
              {g.sezioni.map(s => (
                <li key={s.id}><a href={`#${s.id}`} style={styles.indiceLink}>{s.titolo}</a></li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {gruppi.map(g => (
        <section key={g.nome}>
          <h3 style={styles.gruppo}>{g.nome}</h3>
          {g.sezioni.map(s => (
            <article key={s.id} id={s.id} style={styles.sezione}>
              <h4 style={styles.sezioneTitolo}>{s.titolo}</h4>
              <div style={styles.testo}>{s.contenuto(contesto)}</div>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  ...ui,
  page: { ...ui.page, maxWidth: 820, margin: '0 auto', boxSizing: 'border-box' },
  title: { margin: '0 0 8px', fontSize: 22, fontWeight: 700 },
  intro: { margin: '0 0 20px', color: '#555', fontSize: 14, lineHeight: 1.6 },
  indice: { ...ui.formCard, display: 'flex', flexWrap: 'wrap', gap: '8px 32px' },
  indiceGruppo: { fontSize: 12, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, margin: '4px 0' },
  indiceElenco: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  indiceLink: { color: theme.navBg, fontSize: 14, textDecoration: 'none' },
  gruppo: { margin: '28px 0 12px', fontSize: 13, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 },
  // scrollMarginTop: l'ancora non deve finire sotto il bordo alto della finestra.
  sezione: { ...ui.formCard, scrollMarginTop: 16 },
  sezioneTitolo: { margin: '0 0 8px', fontSize: 17, fontWeight: 700 },
  testo: { fontSize: 14, lineHeight: 1.6, color: '#333', overflowWrap: 'anywhere' },
};
