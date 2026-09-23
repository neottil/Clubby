# Loghi dei club

Metti qui il file SVG del logo di un club (es. `romaasd.svg`). I file di questa
cartella finiscono nell'immagine del frontend e sono serviti su `/branding/<file>`.

Per usarlo, imposta la variabile `LOGO_FILE=romaasd.svg` sull'Environment GitHub
del club: al deploy finisce in `/config.json` e l'app la legge all'avvio, come
logo e favicon. Non serve una build dedicata; il deploy si ferma se il file non
esiste in questa cartella.

In locale la variabile equivalente è `VITE_LOGO_FILE` in `frontend/.env.local`.

Se non è impostata, resta il logo di default `frontend/public/logo.svg`.
