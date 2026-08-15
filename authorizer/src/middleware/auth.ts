/**
 * Verifica dei token sugli endpoint protetti dell'authorizer stesso
 * (/auth/me, cambio password, endpoint di amministrazione).
 *
 * L'authorizer verifica i propri token con la chiave pubblica in memoria,
 * senza passare dal JWKS via rete: sarebbe una chiamata HTTP a sé stesso.
 */

import { jwtVerify, createLocalJWKSet } from 'jose';
import { jwks, ISSUER } from '../crypto/tokens.js';
import { ForbiddenError, UnauthorizedError } from './errors.js';

export interface ContestoAuth {
  utenteId: string;
  email: string;
  ruoli: string[];
  isAdmin: boolean;
  cambioPasswordRichiesto: boolean;
}

let setChiaviLocale: ReturnType<typeof createLocalJWKSet> | null = null;

async function chiavi() {
  setChiaviLocale ??= createLocalJWKSet(await jwks() as any);
  return setChiaviLocale;
}

/**
 * Estrae e verifica il token dall'header Authorization.
 * Lancia UnauthorizedError se manca, è malformato, scaduto o non firmato da
 * questa istanza.
 */
export async function contestoDa(headerAuthorization: string | undefined): Promise<ContestoAuth> {
  if (!headerAuthorization?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Token mancante');
  }

  try {
    const { payload } = await jwtVerify(headerAuthorization.slice(7), await chiavi(), {
      issuer: ISSUER,
    });
    const ruoli = Array.isArray(payload.roles) ? payload.roles as string[] : [];
    return {
      utenteId: payload.sub as string,
      email: (payload.email as string) ?? '',
      ruoli,
      isAdmin: ruoli.includes('admin'),
      cambioPasswordRichiesto: payload.cambio_password_richiesto === true,
    };
  } catch {
    throw new UnauthorizedError('Token non valido o scaduto');
  }
}

export function richiediAdmin(auth: ContestoAuth): void {
  if (!auth.isAdmin) throw new ForbiddenError('Accesso riservato agli amministratori');
}

/**
 * Blocca le operazioni normali finché una password temporanea non è stata
 * sostituita. Senza questo, un reset fatto da un admin lascerebbe l'account
 * pienamente utilizzabile con una password che è passata per canali insicuri
 * (detta a voce, scritta in un messaggio).
 */
export function richiediPasswordDefinitiva(auth: ContestoAuth): void {
  if (auth.cambioPasswordRichiesto) {
    throw new ForbiddenError('Devi prima impostare una nuova password');
  }
}
