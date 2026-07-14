# Loghi personalizzati per tenant

Metti qui il file SVG del logo di un tenant (es. `asd1.svg`). Impostando la
variabile d'ambiente `LOGO_FILE=asd1.svg` prima della build (locale o CI), lo
script `frontend/scripts/apply-logo.mjs` lo copia automaticamente sovrascrivendo
`frontend/public/logo.svg`, che Vite include come favicon/logo dell'app.

Se `LOGO_FILE` non è impostata, resta il logo di default già presente in
`frontend/public/logo.svg`.

Questa cartella non viene mai servita direttamente dall'app: è solo la
sorgente da cui lo script pesca il file al momento della build.
