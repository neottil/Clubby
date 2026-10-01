# Clubby — documentazione

Gestionale per associazioni sportive: soci, incontri, voucher prepagati,
tesseramenti e ricevute.

Questa è la documentazione del prodotto, divisa per contesto. Il
[README di progetto](../../README.md) tiene solo l'essenziale e rimanda qui.

## Cosa fa

| Documento | Copre |
|---|---|
| [Funzionalità](funzionalita.md) | cosa sa fare l'applicazione, in breve |
| [Modello utenti e ruoli](ruoli-e-permessi.md) | socio, istruttore, admin: chi vede e chi scrive cosa; attività, abilitazioni, incontri, resoconti e rendicontazione |
| [Voucher, tesseramento e ricevute](voucher-tesseramento-ricevute.md) | il credito prepagato, le quote, le ricevute in PDF e i moduli opzionali |
| [Account, registrazione e accessi](account-e-accessi.md) | dove vivono i dati delle persone, registrazione, cambio email, sessione e password |
| [API](api.md) | gli endpoint di backend e authorizer |

## Com'è fatto

| Documento | Copre |
|---|---|
| [Architettura](architettura.md) | i tre moduli, la struttura delle cartelle e il funzionamento multi-tenant |
| [Deploy su Kubernetes](deploy.md) | scelte di infrastruttura, setup iniziale del cluster, namespace |
| [Pipeline CI/CD](pipeline-ci-cd.md) | Infra, Build & Deploy, Tag, Promote e i deploy per modulo |
| [Migrazioni dello schema](migrazioni.md) | come si evolve il database senza fermare l'applicazione |
| [Struttura dei manifest k8s](manifest-k8s.md) | dove vive ogni manifest e chi lo applica |
| [Variabili e secret](variabili-e-secret.md) | cosa configurare su GitHub, per ambiente |

## Per chi ci lavora

| Documento | Copre |
|---|---|
| [docs/developer/sviluppo-locale.md](../developer/sviluppo-locale.md) | preparare e avviare l'ambiente, debug, credenziali di test, test delle API |
| [docs/developer/operazioni-cluster.md](../developer/operazioni-cluster.md) | credenziali di un ambiente deployato, accesso al database, dump e restore |
| [scripts/seed/README.md](../../scripts/seed/README.md) | i dati di esempio: quali sono e perché quelli |
| [AGENTS.md](../../AGENTS.md) | regole di lavoro, convenzioni di codice, workflow spec-driven |
| [specs/README.md](../../specs/README.md) | indice delle specifiche: dove è stata decisa una cosa |

## Altro

- Il lavoro ancora aperto sta nelle **issue di GitHub**, non in un file del repository
- [.github/README.md](../../.github/README.md) — i workflow nel dettaglio, con Environment e Secrets
- [branding/README.md](../../branding/README.md) — i loghi dei club e i formati richiesti
