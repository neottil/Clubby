/**
 * Emissione e verifica dei token.
 *
 * Firma asimmetrica (RS256) e non simmetrica: il backend applicativo deve
 * poter *verificare* i token ma non *emetterli*. Con una chiave condivisa,
 * chiunque comprometta il backend potrebbe fabbricare un token da admin; con
 * RS256 il backend riceve solo la chiave pubblica, esposta su
 * /.well-known/jwks.json nel formato standard JWKS.
 *
 * Due tipi di token:
 * - access token, JWT firmato, vita breve, non revocabile (lo si aspetta
 *   scadere);
 * - refresh token, stringa casuale opaca, vita lunga, revocabile perché il
 *   suo hash è in tabella (vedi schema.sql).
 */

import {
  createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes,
  type KeyObject,
} from 'crypto';
import { exportJWK, SignJWT, type JWK } from 'jose';

export const DURATA_ACCESS_TOKEN_SECONDI  = 15 * 60;             // 15 minuti
export const DURATA_REFRESH_TOKEN_SECONDI = 30 * 24 * 60 * 60;   // 30 giorni

/**
 * L'issuer dichiarato nei token e atteso dal backend in fase di verifica.
 * Deve coincidere esattamente con l'URL pubblico dell'authorizer configurato
 * sul backend (AUTH_ISSUER): è ciò che impedisce a un token emesso da
 * un'altra istanza — per esempio quella di sviluppo — di essere accettato in
 * produzione.
 */
export const ISSUER = process.env.AUTH_ISSUER ?? 'http://localhost:3001';

let chiavePrivata: KeyObject;
let chiavePubblica: KeyObject;
let kid: string;

/**
 * Carica la coppia di chiavi da AUTH_JWT_PRIVATE_KEY (PEM PKCS#8), oppure ne
 * genera una al volo se la variabile non c'è.
 *
 * La generazione al volo esiste solo per lo sviluppo locale: la chiave vive
 * in memoria, quindi a ogni riavvio del processo tutti i token già emessi
 * diventano non verificabili e gli utenti devono rifare login. In produzione
 * la chiave arriva da un Secret Kubernetes creato da Infra — senza, ogni
 * riavvio del pod scollegherebbe tutti, e con più repliche ognuna firmerebbe
 * con una chiave diversa.
 */
function inizializzaChiavi(): void {
  const pem = process.env.AUTH_JWT_PRIVATE_KEY;

  if (pem?.trim()) {
    // Le chiavi passate via variabile d'ambiente arrivano spesso con "\n"
    // letterali al posto degli a capo: ripristinarli qui evita un errore di
    // parsing che altrimenti sembrerebbe una chiave malformata.
    //
    // Ridondante per il .env locale, dove ci pensa già dotenv, ma necessario
    // in cluster: lì la chiave arriva da un Secret come variabile d'ambiente
    // vera, e nessuno la espande prima di noi.
    chiavePrivata = createPrivateKey(pem.replace(/\\n/g, '\n'));
    chiavePubblica = createPublicKey(chiavePrivata);
  } else {
    console.warn(
      '[tokens] AUTH_JWT_PRIVATE_KEY non impostata: genero una chiave effimera. ' +
      'Va bene solo in sviluppo — a ogni riavvio i token già emessi smettono di essere validi.'
    );
    const coppia = generateKeyPairSync('rsa', { modulusLength: 2048 });
    chiavePrivata = coppia.privateKey;
    chiavePubblica = coppia.publicKey;
  }
}

inizializzaChiavi();

/**
 * Identificativo della chiave, pubblicato nel JWKS e messo nell'header di
 * ogni token: deriva dal contenuto della chiave pubblica, così client e
 * server concordano su quale chiave usare anche dopo una rotazione, senza
 * doverlo configurare da nessuna parte.
 */
async function calcolaKid(): Promise<string> {
  const jwk = await exportJWK(chiavePubblica);
  return createHash('sha256')
    .update(JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n }))
    .digest('base64url')
    .slice(0, 32);
}

/**
 * Contenuto dell'access token. Niente nome e cognome: l'anagrafica appartiene
 * al socio, nel database applicativo, e metterne una copia nel token
 * significherebbe distribuirne una versione che resta ferma fino alla scadenza
 * anche dopo una correzione.
 */
export interface ClaimsUtente {
  sub: string;
  email: string;
  roles: string[];
  /** True finché l'utente non ha sostituito una password temporanea. */
  cambio_password_richiesto: boolean;
}

export async function firmaAccessToken(claims: ClaimsUtente): Promise<string> {
  kid ??= await calcolaKid();
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(ISSUER)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${DURATA_ACCESS_TOKEN_SECONDI}s`)
    .sign(chiavePrivata as any);
}

/** Set di chiavi pubbliche servito su /.well-known/jwks.json. */
export async function jwks(): Promise<{ keys: JWK[] }> {
  kid ??= await calcolaKid();
  const jwk = await exportJWK(chiavePubblica);
  return { keys: [{ ...jwk, kid, use: 'sig', alg: 'RS256' }] };
}

/**
 * Refresh token: stringa casuale opaca, non un JWT. Non deve trasportare
 * informazioni né essere verificabile offline — il suo unico significato è
 * "esiste una riga non revocata in refresh_token con questo hash", che è
 * proprio ciò che rende possibile il logout.
 */
export function generaRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
