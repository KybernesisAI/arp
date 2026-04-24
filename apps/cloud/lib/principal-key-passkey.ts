/**
 * Browser-side passkey (WebAuthn) helpers for the ARP Cloud app.
 *
 * Phase 9d: passkey is the *authenticator*, not the identity. The principal
 * DID stays `did:key:...`; these helpers bind a new WebAuthn credential to
 * the existing tenant (register) or re-issue a session cookie for a user who
 * demonstrates control of a registered credential (sign-in).
 *
 * No localStorage writes — every server round-trip uses the existing
 * session cookie (register) or the session cookie the verify endpoint
 * issues (sign-in).
 *
 * This module must only be imported from client components.
 */

import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

function ensureBrowser(): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    throw new Error('principal-key-passkey must be used in the browser');
  }
}

/**
 * True if the current browser + device support WebAuthn + platform
 * authenticators (Touch ID / Face ID / Windows Hello).
 */
export async function isPasskeySupported(): Promise<boolean> {
  ensureBrowser();
  if (!window.PublicKeyCredential) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export interface RegisterPasskeyResult {
  credentialId: string;
  id: string;
}

/**
 * Register a new passkey under the current authenticated tenant. Must be
 * invoked from a direct user gesture (click/tap handler) — iOS Safari
 * rejects `navigator.credentials.create()` otherwise.
 */
export async function registerPasskey(
  nickname?: string,
): Promise<RegisterPasskeyResult> {
  ensureBrowser();
  const optionsRes = await fetch('/api/webauthn/register/options', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (!optionsRes.ok) {
    const body = (await optionsRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `register_options_failed_${optionsRes.status}`);
  }
  const options = (await optionsRes.json()) as PublicKeyCredentialCreationOptionsJSON;
  const attestation = await startRegistration({ optionsJSON: options });

  const verifyRes = await fetch('/api/webauthn/register/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ response: attestation, nickname: nickname ?? null }),
  });
  if (!verifyRes.ok) {
    const body = (await verifyRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `register_verify_failed_${verifyRes.status}`);
  }
  const body = (await verifyRes.json()) as RegisterPasskeyResult;
  return body;
}

export interface SignInWithPasskeyResult {
  tenantId: string;
  principalDid: string;
}

/**
 * Sign in with an existing passkey. Discoverable-credential flow (resident
 * key); the authenticator picks the identity, we bind the session to the
 * credential's tenant. Must be invoked from a user gesture.
 */
export async function signInWithPasskey(): Promise<SignInWithPasskeyResult> {
  ensureBrowser();
  const optionsRes = await fetch('/api/webauthn/auth/options', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (!optionsRes.ok) {
    const body = (await optionsRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `auth_options_failed_${optionsRes.status}`);
  }
  const options = (await optionsRes.json()) as PublicKeyCredentialRequestOptionsJSON;
  const assertion = await startAuthentication({ optionsJSON: options });

  const verifyRes = await fetch('/api/webauthn/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ response: assertion }),
  });
  if (!verifyRes.ok) {
    const body = (await verifyRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `auth_verify_failed_${verifyRes.status}`);
  }
  const body = (await verifyRes.json()) as SignInWithPasskeyResult;
  return body;
}
