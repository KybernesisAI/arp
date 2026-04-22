import { describe, it, expect } from 'vitest';
import { X509Certificate } from 'node:crypto';
import {
  generateAgentCert,
  computeFingerprint,
  validatePinnedCert,
  validatePinnedDer,
  extractHostFromDid,
} from '../src/cert.js';

describe('extractHostFromDid', () => {
  it('returns the host for did:web', () => {
    expect(extractHostFromDid('did:web:samantha.agent')).toBe('samantha.agent');
    expect(extractHostFromDid('did:web:example.com:user:alice')).toBe('example.com');
  });
  it('returns null for unsupported methods', () => {
    expect(extractHostFromDid('did:key:z6Mk...')).toBeNull();
  });
});

describe('generateAgentCert', () => {
  it('produces a valid Ed25519 self-signed cert', async () => {
    const r = await generateAgentCert({ did: 'did:web:samantha.agent' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const parsed = new X509Certificate(r.value.certPem);
    expect(parsed.subject).toContain('did:web:samantha.agent');
    expect(parsed.subjectAltName).toContain('samantha.agent');
    expect(parsed.publicKey.asymmetricKeyType).toBe('ed25519');
    expect(r.value.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(r.value.keyPem).toContain('BEGIN PRIVATE KEY');
  });

  it('computes fingerprint as SHA-256 of DER bytes', async () => {
    const r = await generateAgentCert({ did: 'did:web:samantha.agent' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(computeFingerprint(r.value.certPem)).toBe(r.value.fingerprint);
  });

  it('rejects non-did:web inputs', async () => {
    const r = await generateAgentCert({ did: 'did:key:z6Mk...' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid_input');
  });

  it('accepts an explicit sanHostname override', async () => {
    const r = await generateAgentCert({
      did: 'did:web:samantha.agent',
      sanHostname: 'localhost',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const parsed = new X509Certificate(r.value.certPem);
    expect(parsed.subjectAltName).toContain('localhost');
  });

  it('uses requested validity window', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const r = await generateAgentCert({
      did: 'did:web:samantha.agent',
      now: () => now,
      validityMs: 1000 * 60 * 60 * 24, // 24h
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const parsed = new X509Certificate(r.value.certPem);
    const notAfter = Date.parse(parsed.validTo);
    expect(notAfter - now.getTime()).toBeGreaterThan(1000 * 60 * 60 * 23);
  });
});

describe('validatePinnedCert', () => {
  it('accepts a matching fingerprint', async () => {
    const r = await generateAgentCert({ did: 'did:web:samantha.agent' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(validatePinnedCert(r.value.certPem, r.value.fingerprint)).toBe(true);
  });

  it('accepts a prefix-decorated fingerprint', async () => {
    const r = await generateAgentCert({ did: 'did:web:samantha.agent' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(validatePinnedCert(r.value.certPem, `sha256:${r.value.fingerprint}`)).toBe(true);
    expect(validatePinnedCert(r.value.certPem, r.value.fingerprint.toUpperCase())).toBe(true);
  });

  it('rejects a tampered fingerprint', async () => {
    const r = await generateAgentCert({ did: 'did:web:samantha.agent' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const tampered = r.value.fingerprint.replace(/^./, (c) =>
      c === '0' ? '1' : '0',
    );
    expect(validatePinnedCert(r.value.certPem, tampered)).toBe(false);
  });

  it('rejects a cert from a different key', async () => {
    const [a, b] = await Promise.all([
      generateAgentCert({ did: 'did:web:samantha.agent' }),
      generateAgentCert({ did: 'did:web:samantha.agent' }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(validatePinnedCert(a.value.certPem, b.value.fingerprint)).toBe(false);
  });

  it('validatePinnedDer matches PEM path', async () => {
    const r = await generateAgentCert({ did: 'did:web:samantha.agent' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const parsed = new X509Certificate(r.value.certPem);
    expect(validatePinnedDer(parsed.raw, r.value.fingerprint)).toBe(true);
  });
});
