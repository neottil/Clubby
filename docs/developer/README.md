# Documentazione tecnica

Per chi lavora sul codice. Linguaggio preciso, dettagli di configurazione,
comandi. Cosa fa il prodotto sta invece in [docs/readme/](../readme/readme.md).

| Documento | Copre |
|---|---|
| [sviluppo-locale.md](sviluppo-locale.md) | prerequisiti, avvio, debug, container, credenziali di test, test delle API, dump e restore in locale, bump di versione |
| [operazioni-cluster.md](operazioni-cluster.md) | nomi e credenziali di un ambiente deployato, accesso al database, client locale, seed contro un ambiente usa-e-getta |

**Nessun valore di credenziale va scritto in questi file.** Ci sono i comandi che
leggono i segreti dal cluster: il loro output non si incolla in un file del
repository, in un ticket o in una chat.

Documentazione vicina, mantenuta altrove:

- [AGENTS.md](../../AGENTS.md) — regole di lavoro, convenzioni, workflow spec-driven
- [specs/README.md](../../specs/README.md) — indice delle specifiche
- [scripts/seed/README.md](../../scripts/seed/README.md) — i dati di esempio
- [backend/src/db/migrations/README.md](../../backend/src/db/migrations/README.md) e
  [authorizer/src/db/migrations/README.md](../../authorizer/src/db/migrations/README.md) — come si scrive una migrazione
- [.github/README.md](../../.github/README.md) — workflow, Environment, Variables e Secrets
