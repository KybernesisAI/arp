import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadScopesFromDirectory } from '@kybernesis/arp-scope-catalog';
import {
  crossConnectionProbe,
  didCommProbe,
  didResolutionProbe,
  dnsProbe,
  createPairingProbe,
  createRevocationProbe,
  revocationProbe,
  runAudit,
  tlsFingerprintProbe,
  wellKnownProbe,
} from '@kybernesis/arp-testkit';
import { createDualRuntime, type DualRuntime, SCOPES_DIR } from './helpers/dual-runtime.js';

/**
 * Phase-5 Task 1–2 integration check — every testkit probe runs against a
 * local dual-runtime harness and produces a result. Unit tests (in
 * `packages/testkit/tests/*`) cover mocked shape; this file proves the
 * probes actually work end to end against a real runtime.
 */

describe('phase 5 — testkit integration', () => {
  let harness: DualRuntime;
  let baseUrl: string;

  beforeEach(async () => {
    harness = await createDualRuntime();
    baseUrl = `http://127.0.0.1:${harness.samanthaPort}`;
  });

  afterEach(async () => {
    await harness.close();
  });

  it('dnsProbe skips gracefully (localhost target)', async () => {
    const r = await dnsProbe({ target: 'localhost', baseUrl });
    expect(r.skipped).toBe(true);
    expect(r.pass).toBe(true);
  });

  it('wellKnownProbe passes against the running runtime', async () => {
    const r = await wellKnownProbe({ target: 'localhost', baseUrl });
    expect(r.pass, JSON.stringify(r.details)).toBe(true);
  });

  it('didResolutionProbe passes against the runtime', async () => {
    const r = await didResolutionProbe({ target: 'localhost', baseUrl });
    expect(r.pass, JSON.stringify(r.details)).toBe(true);
    expect(r.details['didcomm_endpoint']).toContain('/didcomm');
  });

  it('tlsFingerprintProbe matches /health fingerprint in local mode', async () => {
    const r = await tlsFingerprintProbe({ target: 'localhost', baseUrl });
    expect(r.pass).toBe(true);
    expect(r.details['mode']).toBe('local-plaintext');
    expect(r.details['fingerprint_from_health']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('didCommProbe hits /didcomm and sees unknown_peer for a random signer', async () => {
    const r = await didCommProbe({ target: 'localhost', baseUrl });
    expect(r.pass, JSON.stringify(r.details)).toBe(true);
    expect(r.details['observed_error_code']).toBe('unknown_peer');
  });

  it('pairingProbe drives a full flow when supplied keys + catalog', async () => {
    const catalog = loadScopesFromDirectory(SCOPES_DIR);
    const probe = createPairingProbe({
      adminToken: harness.adminToken,
      issuerAgentDid: 'did:web:samantha.agent',
      issuerPrincipalDid: harness.ianPrincipal.principalDid,
      issuerPrincipalPrivateKey: harness.ianPrincipal.principalPrivateKey,
      counterpartyAgentDid: 'did:web:ghost.agent',
      counterpartyPrincipalDid: harness.nickPrincipal.principalDid,
      counterpartyPrincipalPrivateKey: harness.nickPrincipal.principalPrivateKey,
      catalog,
      resolver: harness.pairingResolver,
      scopeSelections: [{ id: 'files.projects.list' }],
    });
    const r = await probe({ target: 'localhost', baseUrl });
    expect(r.pass, JSON.stringify(r.details)).toBe(true);
    expect(r.details['connection_id']).toMatch(/^conn_/);
    expect(r.details['revoked']).toBe(true);
  });

  it('revocationProbe shape check passes', async () => {
    const r = await revocationProbe({ target: 'localhost', baseUrl });
    expect(r.pass, JSON.stringify(r.details)).toBe(true);
  });

  it('revocationProbe with expectedRevokedId confirms an earlier revoke propagated', async () => {
    // Drive a pair + revoke via the pairing probe first so we have a
    // revoked ID to look for.
    const catalog = loadScopesFromDirectory(SCOPES_DIR);
    const pairProbe = createPairingProbe({
      adminToken: harness.adminToken,
      issuerAgentDid: 'did:web:samantha.agent',
      issuerPrincipalDid: harness.ianPrincipal.principalDid,
      issuerPrincipalPrivateKey: harness.ianPrincipal.principalPrivateKey,
      counterpartyAgentDid: 'did:web:ghost.agent',
      counterpartyPrincipalDid: harness.nickPrincipal.principalDid,
      counterpartyPrincipalPrivateKey: harness.nickPrincipal.principalPrivateKey,
      catalog,
      resolver: harness.pairingResolver,
      scopeSelections: [{ id: 'files.projects.list' }],
    });
    const pair1 = await pairProbe({ target: 'localhost', baseUrl });
    const connId = pair1.details['connection_id'] as string;
    expect(pair1.pass).toBe(true);

    const revProbe = createRevocationProbe({
      expectedRevokedId: connId,
      waitMs: 2_000,
    });
    const r = await revProbe({ target: 'localhost', baseUrl });
    expect(r.pass, JSON.stringify(r.details)).toBe(true);
    expect(r.details['matched_connection_id']).toBe(connId);
  });

  it('crossConnectionProbe default form skips cleanly', async () => {
    const r = await crossConnectionProbe({ target: 'localhost', baseUrl });
    expect(r.skipped).toBe(true);
    expect(r.pass).toBe(true);
  });

  it('runAudit full suite completes against local runtime', async () => {
    const summary = await runAudit('localhost', baseUrl);
    // Phase 9 slice 9c: suite grew from 8 → 11 (v2.1 §6 trio —
    // principal-identity-method, no-selfxyz-prompt, representation-jwt-
    // signer-binding). Phase 5's local runtime doesn't publish a
    // _principal TXT or representation JWT, so the two owner-scoped
    // probes skip by design; no-selfxyz-prompt also skips without a
    // registrar URL in context.
    expect(summary.total).toBe(11);
    const failed = summary.probes.filter((p) => !p.pass);
    expect(failed, JSON.stringify(summary.probes, null, 2)).toHaveLength(0);
  });
});
