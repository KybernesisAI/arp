import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from './env';
import { SESSION_COOKIE_NAME as COOKIE_NAME } from './session-constants';

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Session payload we store in the `arp_session` cookie. Encodes as
 * `<base64url(json)>.<hmac>` so the cookie is tamper-evident against
 * `ARP_SESSION_SECRET`. No external dependency; v0 is intentionally minimal.
 */
export interface SessionPayload {
  /** Principal DID that signed the login challenge. */
  principalDid: string;
  /** Challenge nonce that was consumed. */
  nonce: string;
  /** Unix ms at which the session was issued. */
  issuedAt: number;
  /** Unix ms at which the session expires. */
  expiresAt: number;
}

export interface Session extends SessionPayload {}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const payload = decodeCookie(raw);
  if (!payload) return null;
  if (payload.expiresAt <= Date.now()) return null;
  return payload;
}

export async function setSession(
  principalDid: string,
  nonce: string,
): Promise<Session> {
  const payload: SessionPayload = {
    principalDid,
    nonce,
    issuedAt: Date.now(),
    expiresAt: Date.now() + ONE_HOUR_MS,
  };
  const encoded = encodeCookie(payload);
  const store = await cookies();
  store.set(COOKIE_NAME, encoded, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_HOUR_MS / 1000,
  });
  return payload;
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

function sign(value: string): string {
  return createHmac('sha256', env().ARP_SESSION_SECRET)
    .update(value)
    .digest('base64url');
}

function encodeCookie(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

function decodeCookie(raw: string): SessionPayload | null {
  const idx = raw.lastIndexOf('.');
  if (idx === -1) return null;
  const body = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  const expected = sign(body);
  if (expected.length !== sig.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    return JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as SessionPayload;
  } catch {
    return null;
  }
}

export { COOKIE_NAME as SESSION_COOKIE_NAME };
