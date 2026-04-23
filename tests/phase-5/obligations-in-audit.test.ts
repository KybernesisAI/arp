import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadScopesFromDirectory } from '@kybernesis/arp-scope-catalog';
import type { ScopeTemplate } from '@kybernesis/arp-spec';
import {
  createDualRuntime,
  SCOPES_DIR,
  type DualRuntime,
} from './helpers/dual-runtime.js';
import { pair } from './helpers/pair.js';

/**
 * Regression guard for the Phase-5 review fix: the Connection Token carries
 * per-connection obligations compiled from the bundle catalog (e.g.
 * redact_fields, audit_level, rate_limit). Before the fix, the runtime
 * passed only `cedarPolicies` into the PDP, so `decision.obligations` was
 * always `[]` and every audit entry + outbound reply falsely reported
 * "no obligations apply". After the fix, the token's obligations merge with
 * any PDP-emitted obligations and land in both the audit entry and the
 * outbound reply body.
 *
 * If this test goes red, someone removed the merge in `runtime.ts`.
 */

describe('phase 5 — obligations from ConnectionToken land in audit entries', () => {
  let harness: DualRuntime;
  let catalog: readonly ScopeTemplate[];

  beforeEach(async () => {
    harness = await createDualRuntime();
    catalog = loadScopesFromDirectory(SCOPES_DIR);
  });

  afterEach(async () => {
    await harness.close();
  });

  it('audit entry carries the token obligations for every request', async () => {
    // calendar.availability.read has a `redact_fields` obligation on
    // event details — the Connection Token will carry it regardless of
    // PDP output. Same shape the bundle-coverage test uses so we know
    // the policy matches without needing synthetic resource attrs.
    const { connectionId } = await pair({
      catalog,
      issuerPrincipal: harness.ianPrincipal,
      issuerAgentDid: 'did:web:samantha.agent',
      counterpartyPrincipal: harness.nickPrincipal,
      counterpartyAgentDid: 'did:web:ghost.agent',
      purpose: 'phase-5/obligations-in-audit',
      scopeSelections: [
        { id: 'calendar.availability.read', params: { days_ahead: 14 } },
      ],
      adminToken: harness.adminToken,
      issuerPort: harness.samanthaPort,
      counterpartyPort: harness.ghostPort,
      resolver: harness.pairingResolver,
    });

    // Ghost sends an allowed availability request to Samantha — same
    // pattern as the bundle-coverage scheduling-assistant probe.
    await harness.ghost.transport.send('did:web:samantha.agent', {
      id: `obligations-${Math.random()}`,
      type: 'https://didcomm.org/arp/1.0/request',
      from: 'did:web:ghost.agent',
      to: ['did:web:samantha.agent'],
      body: {
        connection_id: connectionId,
        action: 'check_availability',
        resource: 'Calendar:primary',
        context: { query_window_days: 7 },
      },
    });

    await harness.fullyDrain();

    const log = harness.samantha.auditFor(connectionId);
    const lines = readFileSync(log.path, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    const allow = lines.find((l) => l.decision === 'allow');

    expect(
      allow,
      `expected at least one allow audit entry; got: ${JSON.stringify(lines)}`,
    ).toBeDefined();
    expect(
      Array.isArray(allow!.obligations) && allow!.obligations.length > 0,
      `audit entry obligations must be non-empty; got: ${JSON.stringify(allow!.obligations)}`,
    ).toBe(true);
    const types = new Set<string>(
      allow!.obligations.map((o: { type: string }) => o.type),
    );
    expect(types.size).toBeGreaterThan(0);
  });
});
