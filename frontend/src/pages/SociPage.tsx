import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { createApiClient, DIMENSIONE_PAGINA, type Socio } from '../api/client';
import { useElencoPaginato } from '../hooks/useElencoPaginato';
import { useOrdinamento } from '../hooks/useOrdinamento';
import { useValoreDifferito } from '../hooks/useValoreDifferito';
import TableScroll from '../components/TableScroll';
import Avviso from '../components/Avviso';
import CaricaAltri from '../components/CaricaAltri';
import IntestazioneOrdinabile from '../components/IntestazioneOrdinabile';
import { dataIso } from '../utils/formato';
import { ui } from '../styles/ui';
import { messaggioErrore } from '../utils/errori';

const emptyForm = { nome: '', cognome: '', email: '', telefono: '', note: '' };

/**
 * I campi del form, nell'ordine in cui compaiono. Tipizzati sulle chiavi di
 * `emptyForm`: così un refuso qui è un errore di compilazione, e leggere
 * `form[campo]` non richiede di aggirare il tipo.
 */
type CampoForm = keyof typeof emptyForm;
const CAMPI: CampoForm[] = ['nome', 'cognome', 'email', 'telefono', 'note'];

/** Campi il cui contenuto è un nominativo, da scrivere con le iniziali maiuscole. */
const CAMPI_NOMINATIVO: CampoForm[] = ['nome', 'cognome'];

/**
 * Iniziale maiuscola a ogni parola: "maria grazia" → "Maria Grazia",
 * "d'angelo" → "D'Angelo", "sanna-rossi" → "Sanna-Rossi". I nomi composti e
 * gli apostrofi sono la norma, quindi non basta la prima lettera del campo.
 *
 * Le altre lettere non vengono mai toccate: chi scrive "McDonald" o una sigla
 * se la tiene. Il prezzo è che un cognome che vuole la minuscola interna
 * ("van der Berg") va corretto dopo il salvataggio, non durante la digitazione.
 */
function inizialiMaiuscole(valore: string): string {
  return valore.replace(/(^|[\s'’-])(\p{L})/gu, (_, separatore: string, lettera: string) =>
    separatore + lettera.toUpperCase());
}

export default function SociPage() {
  const { token, user } = useAuth();
  const api = createApiClient(token);

  const [error, setError]         = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [form, setForm]           = useState(emptyForm);
  const [saving, setSaving]       = useState(false);
  const [filter, setFilter]       = useState('');

  // Elenco a pagine: ricerca e ordinamento li applica il backend, perché il
  // browser ha solo le righe caricate.
  const filtroCercato = useValoreDifferito(filter);
  const { sortKey, sortDir, toggleSort, direzione } = useOrdinamento('cognome');
  const elenco = useElencoPaginato<Socio>(
    offset => api.getSociPagina({ q: filtroCercato || undefined, sort: sortKey, dir: sortDir, limit: DIMENSIONE_PAGINA, offset }),
    [filtroCercato, sortKey, sortDir],
    setError,
  );

  const openCreate = () => { setForm(emptyForm); setEditId(null); setShowForm(true); };
  const openEdit   = (s: Socio) => {
    setForm({ nome: s.nome, cognome: s.cognome, email: s.email ?? '', telefono: s.telefono ?? '', note: s.note ?? '' });
    setEditId(s.id);
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editId) {
        await api.updateSocio(editId, form);
      } else {
        await api.createSocio(form);
      }
      setShowForm(false);
      elenco.ricarica();
    } catch (e) {
      setError(messaggioErrore(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Eliminare questo socio?')) return;
    try {
      await api.deleteSocio(id);
      elenco.ricarica();
    } catch (e) {
      setError(messaggioErrore(e));
    }
  };

  // Un istruttore riceve dal backend il solo nominativo: recapiti e data di
  // iscrizione non arrivano proprio, e mostrarne le colonne significherebbe
  // tre trattini per riga.
  const anagraficaVisibile = !!user?.isAdmin || !user?.isIstruttore;
  const colonne: [keyof Socio, string][] = anagraficaVisibile
    ? [['cognome', 'Cognome'], ['nome', 'Nome'], ['email', 'Email'],
       ['telefono', 'Telefono'], ['data_iscrizione', 'Iscritto dal']]
    : [['cognome', 'Cognome'], ['nome', 'Nome']];

  if (!elenco.caricato && !error) return <div style={styles.loading}>Caricamento...</div>;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Soci</h2>
        {user?.isAdmin && (
          <button style={styles.btn} onClick={openCreate}>+ Nuovo socio</button>
        )}
      </div>

      {error && <Avviso tipo='errore' messaggio={error} onChiudi={() => setError('')} />}

      <input
        style={styles.filterInput}
        placeholder={anagraficaVisibile ? 'Cerca per cognome, nome, email o telefono...' : 'Cerca per cognome o nome...'}
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />

      {showForm && (
        <div style={styles.formCard}>
          <h3 style={styles.formTitle}>{editId ? 'Modifica socio' : 'Nuovo socio'}</h3>
          {CAMPI.map(campo => (
            <div key={campo} style={styles.field}>
              <label style={styles.label}>{campo.charAt(0).toUpperCase() + campo.slice(1)}</label>
              {campo === 'note' ? (
                <textarea
                  style={styles.textarea}
                  value={form[campo]}
                  onChange={e => setForm({ ...form, [campo]: e.target.value })}
                />
              ) : (
                <input
                  style={styles.input}
                  value={form[campo]}
                  onChange={e => setForm({
                    ...form,
                    [campo]: CAMPI_NOMINATIVO.includes(campo) ? inizialiMaiuscole(e.target.value) : e.target.value,
                  })}
                />
              )}
            </div>
          ))}
          <div style={styles.formActions}>
            <button style={styles.btnSecondary} onClick={() => setShowForm(false)}>Annulla</button>
            <button style={styles.btn} onClick={save} disabled={saving}>
              {saving ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        </div>
      )}

      <TableScroll>
        <table style={{ ...styles.table, opacity: elenco.loading ? 0.55 : 1 }} aria-busy={elenco.loading}>
          <thead>
            <tr>
              {colonne.map(([key, label]) => (
                <IntestazioneOrdinabile key={key} etichetta={label} direzione={direzione(key)} onOrdina={() => toggleSort(key)} />
              ))}
              {user?.isAdmin && <th style={styles.th}>Azioni</th>}
            </tr>
          </thead>
          <tbody>
            {elenco.righe.map(s => (
              <tr key={s.id} style={styles.tr}>
                <td style={styles.td}>{s.cognome}</td>
                <td style={styles.td}>{s.nome}</td>
                {anagraficaVisibile && (
                  <>
                    <td style={styles.td}>{s.email ?? '—'}</td>
                    <td style={styles.td}>{s.telefono ?? '—'}</td>
                    <td style={styles.td}>{dataIso(s.data_iscrizione)}</td>
                  </>
                )}
                {user?.isAdmin && (
                  <td style={styles.td}>
                    <button style={styles.btnSmall} onClick={() => openEdit(s)}>Modifica</button>
                    <button style={{ ...styles.btnSmall, ...styles.btnDanger }} onClick={() => remove(s.id)}>Elimina</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>

      {elenco.righe.length === 0 && !elenco.loading && (
        <p style={styles.empty}>{filter ? 'Nessun socio corrisponde alla ricerca.' : 'Nessun socio presente.'}</p>
      )}
      <CaricaAltri caricati={elenco.righe.length} totale={elenco.totale} inCaricamento={elenco.loadingMore} onCaricaAltri={elenco.caricaAltri} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  ...ui,
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  formTitle: { margin: '0 0 16px', fontSize: 16, fontWeight: 700 },
  filterInput: {
    width: '100%', maxWidth: 360, padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd',
    fontSize: 14, boxSizing: 'border-box', marginBottom: 16, display: 'block',
  },
};
