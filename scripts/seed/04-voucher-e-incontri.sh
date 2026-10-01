# Voucher, ricariche e incontri
#
# Parte di scripts/seed-demo-data.sh, che lo carica con "source": non si
# esegue da solo e non ha shebang di proposito.

# ------------------------------------------------------------
# 6. Voucher
# ------------------------------------------------------------
echo "▶ Creo i voucher..."
# Ferrari: voucher già in uso prima di Clubby, con il SOLO saldo importato e
# nessuna ricarica. È il caso che dimostra la distinzione: il credito importato
# muove il saldo ma non è un incasso, quindi non compare fra le voci
# documentabili. Il suo importo copre i dieci incontri che fa come socia.
VOUCHER_ISTR2=$(crea_voucher "$SOCIO_ISTR2" 300.00)

# Moretti e Rinaldi: voucher acquistati, cioè attivati con una ricarica, e poi
# ricaricati durante l'anno come farebbe chi consuma il credito.
VOUCHER_1=$(crea_voucher "$SOCIO_1" 0 200)
ricarica "$VOUCHER_1" 195 150.00 'Acquisto voucher'
ricarica "$VOUCHER_1" 120 100.00 'Ricarica voucher'
ricarica "$VOUCHER_1" 45  80.00 'Ricarica voucher'

# Rinaldi chiude in NEGATIVO di proposito: il saldo può andare sotto zero
# quando si registrano incontri oltre il credito, e l'interfaccia deve
# mostrarlo invece di impedirlo a posteriori.
VOUCHER_2=$(crea_voucher "$SOCIO_2" 0 200)
ricarica "$VOUCHER_2" 195 40.00 'Acquisto voucher'
ricarica "$VOUCHER_2" 130 100.00 'Ricarica voucher'
ricarica "$VOUCHER_2" 60  80.00 'Ricarica voucher'
ricarica "$VOUCHER_2" 20  30.00 'Ricarica voucher'

# Costa: il caso "tanti dati". Voucher aperto sette mesi fa e ricaricato di
# continuo con importi piccoli — il socio che passa spesso e paga poco per
# volta. Serve a provare ciò che con pochi record non si vede: la paginazione
# dei movimenti, quella di Ricevute e la selezione che deve sopravvivere a
# "Carica altri".
VOUCHER_3=$(crea_voucher "$SOCIO_3" 0 260)
# 40 ricariche ogni sei giorni: quante bastano perche, tolte quelle gia
# documentate piu sotto, ne restino comunque piu di 25 da documentare — cioe
# perche la paginazione si veda nella vista predefinita e non solo accendendo
# l interruttore.
GIORNI=246
for _ in $(seq 1 40); do
  if [ "$GIORNI" -eq 150 ]; then
    # Una sola con valore extra: accreditati 30, pagati 25. Fra le voci
    # devono comparire i 25, sul voucher i 30.
    ricarica "$VOUCHER_3" "$GIORNI" 30.00 'Ricarica promozionale' 25.00
  else
    ricarica "$VOUCHER_3" "$GIORNI" 25.00 'Ricarica voucher'
  fi
  GIORNI=$((GIORNI - 6))
done
echo "  Fatto."

# ------------------------------------------------------------
# 7. Incontri
# ------------------------------------------------------------
echo "▶ Creo gli incontri e i relativi addebiti..."

NOTA_MD_MANTRAILING="## Mantrailing - incontro individuale

Obiettivi della sessione:

* riconoscimento **odore di riferimento**
* pista su asfalto con distrazioni leggere
* ~~pista in bosco~~ rimandata alla prossima volta

> Buona motivazione, partenza sicura.

| Prova | Esito |
| --- | --- |
| Pista breve | OK |
| Pista lunga | Da ripetere |"

NOTA_MD_K9="### K9 Cross Training - percorso a 3 stazioni

1. riscaldamento
2. passo laterale
3. defaticamento

Il **passo laterale** va ripreso: appoggio posteriore ancora incerto."

# Ogni socio ha una decina di incontri: con due o tre, la pagina Incontri e i
# filtri per data si guardano senza capire se funzionano. I cicli qui sotto
# distribuiscono attività e costi in modo che ogni socio abbia incontri vecchi
# (rendicontati e documentati) e recenti (ancora aperti).
ATTIVITA_CICLO=('Educazione' 'Mantrailing' 'K9 Cross Training' 'Dog Dance' 'Passeggiata di gruppo')
COSTO_CICLO=(30.00 25.00 35.00 20.00 15.00)

# Ferrari è abilitata a tre sole attività: i suoi incontri devono restare in
# quell'insieme, o il backend li rifiuterebbe se li si registrasse dall'API.
ATTIVITA_FERRARI=('Educazione' 'Dog Dance' 'Mantrailing')
COSTO_FERRARI=(30.00 20.00 25.00)

# Crea N incontri distribuiti nel tempo, a partire da "giorni fa" e
# retrocedendo di un passo fisso. Parametri: socio, voucher (vuoto = nessuno),
# istruttore, quanti, giorni di partenza, passo, nome array attività, nome
# array costi. Gli array si passano per NOME e si leggono con l'indiretto di
# bash, che è l'unico modo di passare un array a una funzione.
serie_incontri() {
  local socio="$1" voucher="$2" istruttore="$3" quanti="$4" giorni="$5" passo="$6"
  local nomi="$7[@]" costi="$8[@]"
  local -a att=("${!nomi}") cos=("${!costi}")
  local n idx
  for n in $(seq 0 $((quanti - 1))); do
    idx=$((n % ${#att[@]}))
    crea_incontro "$socio" "$voucher" "$giorni" "${att[$idx]}" "${cos[$idx]}" "$istruttore"
    giorni=$((giorni - passo))
  done
}

# Moretti, tenuti da Bianchi. Due con le note scritte a mano (una in Markdown,
# per provare il visualizzatore), gli altri dal ciclo.
crea_incontro "$SOCIO_1" "$VOUCHER_1" 50 'Educazione'  30.00 "$ID_ISTR1" 'Primo incontro di valutazione'
crea_incontro "$SOCIO_1" "$VOUCHER_1" 22 'Mantrailing' 25.00 "$ID_ISTR1" "$NOTA_MD_MANTRAILING" true
serie_incontri "$SOCIO_1" "$VOUCHER_1" "$ID_ISTR1" 9 188 19 ATTIVITA_CICLO COSTO_CICLO

# Rinaldi, tenuti da Ferrari: solo le attività a cui è abilitata.
crea_incontro "$SOCIO_2" "$VOUCHER_2" 45 'Educazione'  30.00 "$ID_ISTR2" 'Lavoro sul richiamo'
crea_incontro "$SOCIO_2" "$VOUCHER_2" 4  'Mantrailing' 25.00 "$ID_ISTR2" 'Pista breve in parco'
serie_incontri "$SOCIO_2" "$VOUCHER_2" "$ID_ISTR2" 9 190 20 ATTIVITA_FERRARI COSTO_FERRARI

# Ferrari come socia, tenuti da Bianchi: un istruttore è prima di tutto un
# socio, e deve vedere i propri incontri accanto a quelli che tiene.
crea_incontro "$SOCIO_ISTR2" "$VOUCHER_ISTR2" 30 'K9 Cross Training' 35.00 "$ID_ISTR1" "$NOTA_MD_K9" true
serie_incontri "$SOCIO_ISTR2" "$VOUCHER_ISTR2" "$ID_ISTR1" 10 196 20 ATTIVITA_CICLO COSTO_CICLO

# Vitali, senza voucher: gli incontri si pagano a parte e compaiono in
# Ricevute come voci di tipo "incontro". Sono distribuiti a cavallo dei 100
# giorni, la soglia oltre la quale più sotto vengono segnati come documentati:
# così lo stesso socio ha voci in entrambi gli stati.
crea_incontro "$SOCIO_4" "" 15 'Educazione' 30.00 "$ID_ISTR1" 'Pagato a parte, senza voucher'
serie_incontri "$SOCIO_4" "" "$ID_ISTR1" 10 200 20 ATTIVITA_CICLO COSTO_CICLO

# Greco non ha né account né incontri: è appena entrato nel club. Oltre al
# collegamento manuale, mostra come si presenta un socio ancora senza dati.

# Costa: 22 incontri in sette mesi, tutti tenuti da Bianchi. Portano il
# suo Resoconto oltre le 25 righe, che è l'unico modo di provare davvero la
# selezione multipla: spuntare i primi venticinque, caricare gli altri e
# verificare che i primi siano ancora scelti.
serie_incontri "$SOCIO_3" "$VOUCHER_3" "$ID_ISTR1" 22 185 8 ATTIVITA_CICLO COSTO_CICLO

echo "  $(psql_scalar "SELECT COUNT(*) FROM incontro;") incontri creati."
