import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BUNDLES,
  compileBundle,
  loadScopesFromDirectory,
} from '@kybernesis/arp-scope-catalog';
import { createDualRuntime, type DualRuntime, SCOPES_DIR } from './helpers/dual-runtime.js';
import { pair } from './helpers/pair.js';

/**
 * Phase-5 Task 5 — bundle coverage.
 *
 * For each of the 5 bundles in the scope catalog, compile the bundle, issue
 * a ConnectionToken from Samantha → Ghost, send a request that exercises
 * one of the bundle's scopes (audit must show allow), and send a request
 * with an action no bundle contains (audit must show deny).
 *
 * Strategy: pick a probe action per bundle that maps to a simple scope in
 * the bundle (no resource-attribute `when` clauses). For the deny probe we
 * use `action=secret_delete` on `Resource:irrelevant` — not present in any
 * Cedar policy in any bundle, so every bundle's PDP returns deny.
 */

interface ProbeSpec {
  /** Request body — drives the PDP mapper. */
  body: Record<string, unknown>;
  /** Expected PDP decision for this probe under the bundle. */
  expected: 'allow' | 'deny';
}

/** One ALLOW + one DENY probe per bundle. */
const BUNDLE_PROBES: Record<string, { allow: ProbeSpec; deny: ProbeSpec }> = {
  'bundle.project_collaboration.v1': {
    allow: {
      body: { action: 'list', resource: 'ProjectRegistry:self' },
      expected: 'allow',
    },
    deny: {
      body: { action: 'secret_delete', resource: 'Resource:irrelevant' },
      expected: 'deny',
    },
  },
  'bundle.scheduling_assistant.v1': {
    allow: {
      body: {
        action: 'check_availability',
        resource: 'Calendar:primary',
        context: { query_window_days: 7 },
      },
      expected: 'allow',
    },
    deny: {
      body: { action: 'secret_delete', resource: 'Resource:irrelevant' },
      expected: 'deny',
    },
  },
  'bundle.research_agent.v1': {
    allow: {
      body: { action: 'list', resource: 'ProjectRegistry:self' },
      expected: 'allow',
    },
    deny: {
      body: { action: 'secret_delete', resource: 'Resource:irrelevant' },
      expected: 'deny',
    },
  },
  'bundle.procurement_agent.v1': {
    allow: {
      body: {
        action: 'request_quote',
        resource: 'Wallet:primary',
      },
      expected: 'allow',
    },
    deny: {
      body: { action: 'secret_delete', resource: 'Resource:irrelevant' },
      expected: 'deny',
    },
  },
  'bundle.executive_assistant.v1': {
    allow: {
      body: {
        action: 'check_availability',
        resource: 'Calendar:primary',
        context: { query_window_days: 7 },
      },
      expected: 'allow',
    },
    deny: {
      body: { action: 'secret_delete', resource: 'Resource:irrelevant' },
      expected: 'deny',
    },
  },
};

describe('phase 5 — bundle coverage', () => {
  let harness: DualRuntime;

  beforeEach(async () => {
    harness = await createDualRuntime();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('compiles all 5 bundles to non-empty Cedar policy lists', () => {
    const catalog = loadScopesFromDirectory(SCOPES_DIR);
    for (const bundle of BUNDLES) {
      const compiled = compileBundle({
        scopeIds: bundle.scopes.map((s) => s.id),
        paramsMap: Object.fromEntries(
          bundle.scopes.map((s) => [s.id, normaliseParams(s.params ?? {})]),
        ),
        audienceDid: 'did:web:ghost.agent',
        catalog,
      });
      expect(compiled.policies.length).toBeGreaterThan(0);
    }
  });

  for (const bundle of BUNDLES) {
    it(`${bundle.id}: allow + deny probes produce correct audit decisions`, async () => {
      const catalog = loadScopesFromDirectory(SCOPES_DIR);
      const probes = BUNDLE_PROBES[bundle.id];
      expect(probes, `no probes defined for ${bundle.id}`).toBeDefined();

      const { connectionId } = await pair({
        catalog,
        issuerPrincipal: harness.ianPrincipal,
        issuerAgentDid: 'did:web:samantha.agent',
        counterpartyPrincipal: harness.nickPrincipal,
        counterpartyAgentDid: 'did:web:ghost.agent',
        purpose: `bundle-coverage:${bundle.id}`,
        scopeSelections: bundle.scopes.map((s) => ({
          id: s.id,
          params: normaliseParams(s.params ?? {}),
        })),
        adminToken: harness.adminToken,
        issuerPort: harness.samanthaPort,
        counterpartyPort: harness.ghostPort,
        resolver: harness.pairingResolver,
      });

      // Send ALLOW probe: Ghost → Samantha
      await harness.ghost.transport.send('did:web:samantha.agent', {
        id: `allow-${bundle.id}`,
        type: 'https://didcomm.org/arp/1.0/request',
        from: 'did:web:ghost.agent',
        to: ['did:web:samantha.agent'],
        body: { connection_id: connectionId, ...probes!.allow.body },
      });

      // Send DENY probe
      await harness.ghost.transport.send('did:web:samantha.agent', {
        id: `deny-${bundle.id}`,
        type: 'https://didcomm.org/arp/1.0/request',
        from: 'did:web:ghost.agent',
        to: ['did:web:samantha.agent'],
        body: { connection_id: connectionId, ...probes!.deny.body },
      });

      await harness.fullyDrain();

      const log = harness.samantha.auditFor(connectionId);
      const entries = readAuditEntries(log.path);
      expect(entries.length).toBeGreaterThanOrEqual(2);
      const allowEntry = entries.find((e) => e.msg_id === `allow-${bundle.id}`);
      const denyEntry = entries.find((e) => e.msg_id === `deny-${bundle.id}`);
      expect(allowEntry?.decision, `allow probe for ${bundle.id}`).toBe('allow');
      expect(denyEntry?.decision, `deny probe for ${bundle.id}`).toBe('deny');

      // Obligation-firing in the audit pipeline is a v0 gap: the runtime
      // doesn't currently pass `obligationPolicies` into the PDP, so the
      // decision's obligation array is always empty even when a scope's
      // `obligations_forced` list is non-empty. The token's `obligations`
      // field is set at pairing time (verified here) but propagating it
      // into per-request audit entries lands alongside the obligation
      // policy pipeline in a follow-up phase. For now, assert the bundle
      // compiled the right obligations onto the token:
      const record = await harness.samantha.registry.getConnection(connectionId);
      expect(record, `registry has connection`).not.toBeNull();
      if (bundle.id === 'bundle.scheduling_assistant.v1') {
        const types = (record?.token.obligations ?? []).map((o) => o.type);
        expect(types, `calendar bundle obligations`).toContain('redact_fields');
      }
    });
  }
});

function normaliseParams(p: Record<string, unknown>): Record<string, unknown> {
  // Replace `'<user-picks>'` placeholders with concrete test values so the
  // Handlebars compiler produces a valid Cedar policy.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === '<user-picks>') {
      if (k === 'project_id') out[k] = 'alpha';
      else if (k === 'collection_id') out[k] = 'default';
      else if (k === 'kb_id') out[k] = 'default';
      else out[k] = 'placeholder';
    } else {
      out[k] = v;
    }
  }
  return out;
}

function readAuditEntries(path: string): Array<{
  msg_id: string;
  decision: 'allow' | 'deny';
  obligations: Array<{ type: string; params: Record<string, unknown> }>;
  reason: string | null;
}> {
  const raw = readFileSync(path, 'utf8');
  return raw
    .split('\n')
    .filter((l) => l.trim())
    .map(
      (l) =>
        JSON.parse(l) as {
          msg_id: string;
          decision: 'allow' | 'deny';
          obligations: Array<{ type: string; params: Record<string, unknown> }>;
          reason: string | null;
        },
    );
}
