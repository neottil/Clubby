# API


Le API sono documentate con due specifiche OpenAPI, una per servizio:

- [backend/docs/openapi.yaml](../../backend/docs/openapi.yaml) — soci, attività, istruttori, incontri,
  voucher, tesseramenti, ricevute, impostazioni e amministrazione
- [authorizer/docs/openapi.yaml](../../authorizer/docs/openapi.yaml) — registrazione, accesso, sessioni,
  gestione degli account e chiavi pubbliche

Per ciascun endpoint riportano chi può chiamarlo, parametri, corpo, risposte ed errori. Gli endpoint
dei [moduli opzionali](voucher-tesseramento-ricevute.md#moduli-opzionali) esistono solo dove quel modulo è attivo: altrove rispondono
`404`, ed è segnalato sulla singola operazione.

Per
consultarle come pagina navigabile, si genera un HTML (da non committare):

```bash
npx @redocly/cli build-docs backend/docs/openapi.yaml -o api-backend.html
```

oppure si apre il file in [Swagger Editor](https://editor.swagger.io) o con un'estensione OpenAPI
dell'editor. Chi modifica un endpoint aggiorna la specifica del servizio nello stesso cambiamento;
per controllarla:

```bash
npx @redocly/cli lint backend/docs/openapi.yaml authorizer/docs/openapi.yaml
```

