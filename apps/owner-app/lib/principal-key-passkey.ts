/**
 * Owner-app browser-side passkey (WebAuthn) helpers. Mirrors the cloud
 * shape (`apps/cloud/lib/principal-key-passkey.ts`) but proxies through
 * the owner-app's `/api/auth/webauthn/*` endpoints rather than the cloud's
 * `/api/webauthn/*` ones.
 *
 * Phase 10/10d: passkey is the *authenticator*, not the identity. The
 * principal DID stays whatever was paired when the agent was set up; the
 * passkey just gates session minting on the owner-app side.
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
 * True if the current browser + device support WebAuthn + a platform
 * authenticator (Touch ID / Face ID / Windows Hello).
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
  id: string;
  credentialId: string;
}

export async function registerPasskey(
  nickname?: string,
): Promise<RegisterPasskeyResult> {
  ensureBrowser();
  const optionsRes = await fetch('/api/auth/webauthn/register/options', {
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
  const verifyRes = await fetch('/api/auth/webauthn/register/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ response: attestation, nickname: nickname ?? null }),
  });
  if (!verifyRes.ok) {
    const body = (await verifyRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `register_verify_failed_${verifyRes.status}`);
  }
  return (await verifyRes.json()) as RegisterPasskeyResult;
}

export interface SignInWithPasskeyResult {
  principalDid: string;
  agentDid: string;
}

export async function signInWithPasskey(): Promise<SignInWithPasskeyResult> {
  ensureBrowser();
  const optionsRes = await fetch('/api/auth/webauthn/auth/options', {
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
  const verifyRes = await fetch('/api/auth/webauthn/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ response: assertion }),
  });
  if (!verifyRes.ok) {
    const body = (await verifyRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `auth_verify_failed_${verifyRes.status}`);
  }
  const result = (await verifyRes.json()) as {
    principalDid: string;
    agentDid: string;
  };
  return result;
}
