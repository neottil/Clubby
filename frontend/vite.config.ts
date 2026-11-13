import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Service worker dell'app installata (spec 012). Mette in cache SOLO i
    // file statici della build, così l'app si apre subito e anche senza rete;
    // i dati no: un saldo vecchio mostrato come attuale sarebbe un errore.
    VitePWA({
      // 'prompt': la versione nuova si scarica da sola ma si attiva quando
      // l'utente preme "Aggiorna" (components/AvvisiApp.tsx). Una ricarica
      // automatica potrebbe arrivare a metà di un form e farlo perdere.
      registerType: 'prompt',
      // La registrazione la fa AvvisiApp con useRegisterSW, che serve anche a
      // sapere quando c'è una versione nuova.
      injectRegister: false,
      // Il manifest NON è nel bundle: è diverso per ogni club e lo genera il
      // deploy nel ConfigMap, come /config.json (vedi frontend/nginx.conf). In
      // locale vale public/manifest.webmanifest.
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // Loghi e icone di TUTTI i club stanno nell'immagine: precaricarli
        // vorrebbe dire scaricare quelli degli altri club a ogni installazione.
        // Quelli del proprio club si mettono in cache quando servono (sotto).
        globIgnores: ['branding/**'],
        // Le navigazioni (apertura dell'app, ricarica su una rotta) ricevono
        // index.html dalla cache. Non quelle verso file serviti dal ConfigMap
        // o verso le API: devono arrivare sempre dal server.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/config\.json$/,
          /^\/version\.json$/,
          /^\/manifest\.webmanifest$/,
        ],
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/branding/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'clubby-branding' },
          },
        ],
        cleanupOutdatedCaches: true,
        // Al primo avvio il service worker prende subito il controllo della
        // pagina. Senza, la prima apertura resterebbe scoperta, e una versione
        // nuova arrivata intanto si attiverebbe da sola invece di aspettare
        // "Aggiorna", che a quel punto non avrebbe niente da fare.
        clientsClaim: true,
      },
    }),
  ],
})
