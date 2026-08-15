/**
 * Hashing delle password.
 *
 * Usa scrypt dal modulo `node:crypto` invece di argon2 o bcrypt: sono
 * entrambi moduli nativi da compilare all'installazione, mentre scrypt è
 * dentro Node, è una funzione di derivazione pensata per le password (lenta e
 * costosa in memoria di proposito) ed è raccomandata da OWASP. Una dipendenza
 * in meno da tenere aggiornata su un servizio che custodisce credenziali.
 *
 * Il formato memorizzato include i parametri usati:
 *
 *     scrypt$16384$8$1$<salt base64>$<hash base64>
 *
 * Così alzare il costo in futuro non invalida le password esistenti: quelle
 * vecchie restano verificabili coi loro parametri, e si ri-cifrano al primo
 * accesso riuscito (vedi vaRiCifrata).
 */

import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'crypto';

// Wrapper a promessa scritto a mano invece di promisify: la firma di scrypt
// con l'oggetto opzioni ha quattro parametri e promisify non la tipizza.
function derivaChiave(
  password: string,
  salt: Buffer,
  lunghezza: number,
  opzioni: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, lunghezza, opzioni, (err, chiave) => {
      if (err) reject(err);
      else resolve(chiave);
    });
  });
}

// Parametri correnti. N=16384 (2^14) è il costo CPU/memoria: circa 16 MB per
// hash, sufficiente a rendere costoso un attacco a dizionario senza pesare
// sul login di un'associazione sportiva.
const N = 16384;
const R = 8;
const P = 1;
const LUNGHEZZA_CHIAVE = 64;
const LUNGHEZZA_SALT = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(LUNGHEZZA_SALT);
  const hash = await derivaChiave(password, salt, LUNGHEZZA_CHIAVE, {
    N, r: R, p: P,
    // maxmem va alzato esplicitamente: il default di Node (32 MB) non basta
    // per N=16384 con r=8 e la derivazione fallirebbe con un errore oscuro.
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/**
 * Verifica una password contro il valore memorizzato. Restituisce false su
 * qualunque formato non riconosciuto invece di lanciare: un record corrotto
 * deve negare l'accesso, non far esplodere il login con un 500 che
 * distinguerebbe quell'utente dagli altri.
 */
export async function verificaPassword(password: string, memorizzato: string): Promise<boolean> {
  try {
    const parti = memorizzato.split('$');
    if (parti.length !== 6 || parti[0] !== 'scrypt') return false;

    const n = Number(parti[1]);
    const r = Number(parti[2]);
    const p = Number(parti[3]);
    const salt = Buffer.from(parti[4], 'base64');
    const atteso = Buffer.from(parti[5], 'base64');
    if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

    const calcolato = await derivaChiave(password, salt, atteso.length, {
      N: n, r, p, maxmem: 256 * 1024 * 1024,
    });

    // timingSafeEqual e non ===: un confronto che esce al primo byte diverso
    // rivela, dai tempi di risposta, quanto prefisso dell'hash è corretto.
    return calcolato.length === atteso.length && timingSafeEqual(calcolato, atteso);
  } catch {
    return false;
  }
}

/** True se l'hash è stato prodotto con parametri più deboli di quelli correnti. */
export function vaRiCifrata(memorizzato: string): boolean {
  const parti = memorizzato.split('$');
  if (parti.length !== 6 || parti[0] !== 'scrypt') return true;
  return Number(parti[1]) < N || Number(parti[2]) !== R || Number(parti[3]) !== P;
}

/**
 * Password temporanea leggibile, per il reset fatto da un admin. Alfabeto
 * senza caratteri ambigui (0/O, 1/l/I): va letta e ridigitata da una persona,
 * spesso dettata a voce o via messaggio.
 */
export function generaPasswordTemporanea(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const byte = randomBytes(12);
  let out = '';
  for (const b of byte) out += alfabeto[b % alfabeto.length];
  return out;
}

/**
 * Requisiti minimi della password. Deliberatamente semplici — lunghezza sopra
 * ogni altra cosa: imporre simboli e maiuscole produce password prevedibili
 * ("Password1!") senza aggiungere entropia reale.
 */
export function erroreValidazionePassword(password: string): string | null {
  if (typeof password !== 'string' || password.length < 10) {
    return 'La password deve essere lunga almeno 10 caratteri';
  }
  if (password.length > 200) {
    return 'La password non può superare i 200 caratteri';
  }
  return null;
}
