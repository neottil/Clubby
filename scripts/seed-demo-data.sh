#!/bin/bash
# ============================================================
# AZZERA il database e lo ripopola con dati di esempio, per demo e prove
# manuali.
#
# ATTENZIONE: svuota OGNI tabella dei due database e ricostruisce tutto da
# zero. Chiede conferma esplicita, a meno di SEED_FORZA=1. Non va mai puntato a
# un ambiente che contiene dati veri.
#
# Quali dati crea e perché quelli, le variabili d'ambiente che accetta e i
# prerequisiti: scripts/seed/README.md.
#
# Qui non c'è logica: questo file è l'ordine delle operazioni, e nient'altro.
# Finché le 1000 righe stavano tutte insieme, cambiare un dato voleva dire
# cercarlo in mezzo al resto.
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEED_DIR="$SCRIPT_DIR/seed"

# shellcheck source=scripts/seed/configurazione.sh
. "$SEED_DIR/configurazione.sh"
# shellcheck source=scripts/seed/lib-psql.sh
. "$SEED_DIR/lib-psql.sh"
# shellcheck source=scripts/seed/lib-dominio.sh
. "$SEED_DIR/lib-dominio.sh"

# I passi sono elencati a mano e non caricati con un glob: l'ordine è la cosa
# che conta di più in questo script — le ricevute hanno bisogno degli incontri,
# gli incontri dei soci, i soci degli account — e scritto così si legge, invece
# di dipendere dall'ordinamento dei nomi dei file.
. "$SEED_DIR/01-verifiche.sh"
. "$SEED_DIR/02-azzeramento.sh"
. "$SEED_DIR/03-anagrafiche.sh"
. "$SEED_DIR/04-voucher-e-incontri.sh"
. "$SEED_DIR/05-tesseramenti.sh"
. "$SEED_DIR/06-chiusure.sh"
. "$SEED_DIR/07-ricevuta-dimostrativa.sh"
. "$SEED_DIR/08-riepilogo.sh"
