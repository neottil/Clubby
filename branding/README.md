# Loghi dei club

Metti qui il logo di un club (es. `romaasd.svg`). Questa cartella sta **alla
radice del repository** e non dentro `frontend/`, perché i suoi file servono a
due immagini:

- il **frontend** li serve al browser su `/branding/<file>`, come logo e favicon;
- il **backend** ne stampa il raster in cima alle ricevute in PDF.

Per usarne uno, imposta la variabile `LOGO_FILE=romaasd.svg` sull'Environment
GitHub del club: al deploy finisce in `/config.json` e l'app la legge all'avvio.
La stessa variabile la riceve il Deployment del backend. Non serve una build
dedicata; il deploy si ferma se il file non esiste qui.

In locale la variabile equivalente è `VITE_LOGO_FILE` in `frontend/.env.local`.
Se non è impostata, resta il logo di default `frontend/public/logo.svg`.

> `frontend/public/branding/` e `backend/branding/` sono **copie generate**: le
> scrive `scripts/copia-branding.mjs`, che gira da solo prima di `npm run dev` e
> `npm run build` di ciascuno dei due moduli — ognuno passando il proprio nome,
> così due avvii in parallelo non si contendono la stessa cartella. Servono
> perché ognuno cerca i
> loghi accanto a sé: Vite copia in `dist/` soltanto ciò che trova sotto
> `public/`, e il backend legge `branding/` nella cartella da cui gira — che
> nell'immagine è `/app`, dove il Dockerfile copia questa stessa cartella.
> Entrambe sono in `.gitignore` e non vanno modificate a mano: le modifiche si
> fanno qui.

## Formati e dimensioni

Per il browser l'SVG basta: è vettoriale e si adatta a qualsiasi misura.

Il generatore delle ricevute **non sa incorporare gli SVG**. Con il modulo
Ricevute attivo, accanto a `romaasd.svg` deve quindi esistere un
`romaasd.png` (oppure `.jpg`) con lo stesso nome:

| | |
|---|---|
| Lato lungo consigliato | **400 px** |
| Intervallo accettabile | 300 – 800 px |
| Massimo accettato | 1000 px di lato, 200 KB di file |

Il PDF disegna il logo in un riquadro di **90 × 90 pt** (≈ 3,2 cm) rispettando
le proporzioni, quindi 400 px corrispondono a circa 300 dpi in stampa. Andare
oltre non migliora niente di visibile: il documento rimpicciolisce comunque
l'immagine, ma ne **incorpora i byte originali** in ogni ricevuta emessa, e le
ricevute restano archiviate per anni. Un logo da 3 MB non si vede più grande,
si paga soltanto.

I loghi presenti oggi sono quadrati, quindi la misura di riferimento è
400 × 400 px.

Il job **`valida-branding`** della pipeline verifica entrambe le cose — gemello
raster presente, dimensioni entro i limiti — e blocca i deploy quando mancano.
Il controllo gira solo con `ENABLE_MODULE_RICEVUTE` attivo: senza quel modulo il
PNG non serve a nessuno.

Se il raster manca, la ricevuta viene emessa lo stesso **senza logo**, con un
avviso nei log: rifiutare un documento per un elemento decorativo sarebbe
sproporzionato.
