/**
 * Session cookie — same pattern as apps/owner-app/lib/session.ts, but the
 * cookie is named `arp_cloud_session`, and the payload carries the tenantId
 * alongside the principal DID so downstream middleware can avoid another
 * DB hop per request.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from './env';

export const SESSION_COOKIE = 'arp_cloud_session';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface SessionPayload {
  principalDid: string;
  tenantId: string | null;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const payload = decode(raw);
  if (!payload) return null;
  if (payload.expiresAt <= Date.now()) return null;
  return payload;
}

export async function setSession(
  principalDid: string,
  tenantId: string | null,
  nonce: string,
): Promise<SessionPayload> {
  const payload: SessionPayload = {
    principalDid,
    tenantId,
    nonce,
    issuedAt: Date.now(),
    expiresAt: Date.now() + ONE_DAY_MS,
  };
  const encoded = encode(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, encoded, {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(ONE_DAY_MS / 1000),
  });
  return payload;
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

function sign(value: string): string {
  return createHmac('sha256', env().ARP_CLOUD_SESSION_SECRET).update(value).digest('base64url');
}

function encode(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

function decode(raw: string): SessionPayload | null {
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
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
  } catch {
    return null;
  }
}
