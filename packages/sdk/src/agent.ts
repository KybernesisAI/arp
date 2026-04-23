/**
 * `ArpAgent` — the developer-facing entry point for building an ARP agent in
 * TypeScript. Wraps:
 *
 *   @kybernesis/arp-runtime     HTTP + DIDComm dispatch pipeline
 *   @kybernesis/arp-pdp         Cedar PDP
 *   @kybernesis/arp-transport   DIDComm envelopes
 *   @kybernesis/arp-registry    SQLite connection + revocation store
 *   @kybernesis/arp-audit       per-connection JSONL audit log
 *
 * Consumers only see the five integration points defined in
 * `ARP-installation-and-hosting.md §8`:
 *
 *   agent.check({ action, resource, context, connectionId })
 *   agent.egress({ data, connectionId, obligations })
 *   agent.onIncoming((task, ctx) => ...)
 *   agent.audit({ connectionId, decision, ... })
 *   agent.on('revocation' | 'rotation' | 'pairing', handler)
 *
 * Every framework adapter under `adapters/*` is expected to be a ~200 line
 * glue module that translates framework idioms (plugins, middleware,
 * decorators, graph nodes) into those five calls.
 */

import { createRequire } from 'node:module';
import { join } from 'node:path';
import {
  createRuntime,
  type DispatchHandler,
  type DispatchInput,
  type Runtime,
} from '@kybernesis/arp-runtime';
import { createInMemoryKeyStore } from '@kybernesis/arp-transport';
import { createResolver } from '@kybernesis/arp-resolver';
import type { Resolver } from '@kybernesis/arp-resolver';
import type { ConnectionRecord, Registry } from '@kybernesis/arp-registry';
import type { ConnectionToken, HandoffBundle, Obligation } from '@kybernesis/arp-spec';
import type { PdpDecision } from '@kybernesis/arp-pdp';
import { bootstrapSdk } from './bootstrap.js';
import { applyObligations } from './obligations.js';
import type {
  ArpAgentEvent,
  ArpAgentEventPayload,
  ArpAgentOptions,
  AuditEventInput,
  CheckInput,
  ConnectionAPI,
  EgressInput,
  InboundHandler,
  PairingEvent,
  PdpAPI,
  RegistryReadAPI,
  Resource,
  RevocationEvent,
  RotationEvent,
} from './types.js';

const requireFromHere = createRequire(import.meta.url);

type EventHandlers = {
  revocation: Array<(e: RevocationEvent) => void>;
  rotation: Array<(e: RotationEvent) => void>;
  pairing: Array<(e: PairingEvent) => void>;
};

export class ArpAgent {
  /** Agent DID. */
  public readonly did: string;
  /** Principal DID. */
  public readonly principalDid: string;
  /** Agent's public key (multibase). */
  public readonly publicKeyMultibase: string;

  /** Sub-APIs. */
  public readonly connections: ConnectionAPI;
  public readonly registry: RegistryReadAPI;
  public readonly pdp: PdpAPI;

  private readonly runtime: Runtime;
  private readonly now: () => number;
  private readonly events: EventHandlers;

  private constructor(params: {
    did: string;
    principalDid: string;
    publicKeyMultibase: string;
    runtime: Runtime;
    now: () => number;
  }) {
    this.did = params.did;
    this.principalDid = params.principalDid;
    this.publicKeyMultibase = params.publicKeyMultibase;
    this.runtime = params.runtime;
    this.now = params.now;
    this.events = { revocation: [], rotation: [], pairing: [] };

    const registry = this.runtime.registry;
    this.connections = buildConnectionAPI(registry, this.runtime, this.events, this.now);
    this.registry = buildRegistryReadAPI(registry);
    this.pdp = buildPdpAPI(this.runtime);
  }

  /**
   * Build an agent from a handoff bundle + options. Does not start the HTTP
   * server yet — call `agent.start()` once you've attached your handlers.
   */
  static async fromHandoff(
    handoffInput: HandoffBundle | string | Record<string, unknown>,
    options: ArpAgentOptions = {},
  ): Promise<ArpAgent> {
    const dataDir = options.dataDir ?? join(process.cwd(), '.arp-data');
    const now = options.now ?? (() => Date.now());

    const bootstrap = await bootstrapSdk({
      handoff: handoffInput,
      dataDir,
      ...(options.privateKey ? { privateKey: options.privateKey } : {}),
    });

    const { handoff, privateKey, publicKeyMultibase } = bootstrap;

    const resolver: Resolver = createResolver();
    const keyStore = createInMemoryKeyStore(handoff.agent_did, privateKey);
    const cedarSchemaJson = loadCedarSchema();
    const origin = originOf(handoff.well_known_urls.arp);

    const inboundHandlerHolder: { current: InboundHandler | null } = {
      current: options.onIncoming ?? null,
    };

    const dispatch: DispatchHandler = async (input: DispatchInput) => {
      const handler = inboundHandlerHolder.current;
      if (!handler) return {};
      const body = (input.message.body ?? {}) as Record<string, unknown>;
      const action = typeof body['action'] === 'string'
        ? body['action']
        : deriveActionFromType(input.message.type);
      const resource = coerceResource(body['resource']);
      const context = isPlainObject(body['context'])
        ? (body['context'] as Record<string, unknown>)
        : {};

      const reply = await handler(
        {
          action,
          resource,
          context,
          body,
          messageId: input.message.id,
          threadId: input.message.thid ?? null,
        },
        {
          connectionId: input.connectionId,
          peerDid: input.meta.peerDid,
          decision: {
            decision: input.decision.decision,
            obligations: input.decision.obligations,
            policiesFired: input.decision.policies_fired,
          },
          memory: input.memory,
          connection: input.connection,
          message: input.message,
          meta: input.meta,
        },
      );

      if (!reply || !reply.body) return {};

      // Auto-apply obligations to the outbound reply — developers never need
      // to call `egress()` on the inbound-reply path.
      const filtered = applyObligations(reply.body, input.decision.obligations);
      const out: { reply?: Record<string, unknown>; replyType?: string } = {};
      if (isPlainObject(filtered)) {
        out.reply = filtered as Record<string, unknown>;
      } else {
        out.reply = { value: filtered };
      }
      if (reply.replyType) out.replyType = reply.replyType;
      return out;
    };

    const runtime = await createRuntime({
      config: {
        did: handoff.agent_did,
        principalDid: handoff.principal_did,
        publicKeyMultibase,
        agentName: options.agentName ?? deriveAgentName(handoff.agent_did),
        agentDescription: options.agentDescription ?? 'ARP agent',
        wellKnownUrls: {
          didcomm: `${origin}/didcomm`,
          agentCard: handoff.well_known_urls.agent_card,
          arpJson: handoff.well_known_urls.arp,
        },
        representationVcUrl: `${origin}/.well-known/representation.jwt`,
        scopeCatalogVersion: options.scopeCatalogVersion ?? 'v1',
        tlsFingerprint: 'sdk-local-placeholder',
      },
      keyStore,
      resolver,
      ...(options.transportResolver
        ? { transportResolver: options.transportResolver }
        : {}),
      ...(options.transportFetch ? { transportFetch: options.transportFetch } : {}),
      cedarSchemaJson,
      registryPath: join(dataDir, 'registry.sqlite'),
      auditDir: join(dataDir, 'audit'),
      mailboxPath: join(dataDir, 'mailbox.sqlite'),
      ...(options.adminToken ? { adminToken: options.adminToken } : {}),
      dispatch,
      now,
    });

    const agent = new ArpAgent({
      did: handoff.agent_did,
      principalDid: handoff.principal_did,
      publicKeyMultibase,
      runtime,
      now,
    });
    // Agent exposes `onIncoming` to allow late-binding; rebind through holder.
    (agent as ArpAgent & { __inboundHandlerHolder: typeof inboundHandlerHolder }).__inboundHandlerHolder = inboundHandlerHolder;
    return agent;
  }

  /** Start the HTTP server. Returns the bound address. */
  async start(opts: { port?: number; host?: string } = {}): Promise<{ port: number; hostname: string }> {
    const port = opts.port ?? 4500;
    const host = opts.host ?? '127.0.0.1';
    return this.runtime.start(port, host);
  }

  /** Graceful shutdown. */
  async stop(opts: { graceMs?: number } = {}): Promise<void> {
    await this.runtime.stop(opts);
  }

  /**
   * Register the inbound handler late. When the agent was built without an
   * `onIncoming` option, adapters can attach one before calling `start()`.
   */
  onIncoming(handler: InboundHandler): void {
    const holder = (this as unknown as {
      __inboundHandlerHolder: { current: InboundHandler | null };
    }).__inboundHandlerHolder;
    if (!holder) {
      throw new Error('inbound handler holder missing — bug in ArpAgent.fromHandoff');
    }
    holder.current = handler;
  }

  /* --------------------- integration-point 1: check --------------------- */

  async check(input: CheckInput): Promise<PdpDecision> {
    const record = await this.runtime.registry.getConnection(input.connectionId);
    if (!record) {
      return {
        decision: 'deny',
        obligations: [],
        policies_fired: [],
        reasons: [`unknown_connection:${input.connectionId}`],
      };
    }
    if (record.status !== 'active') {
      return {
        decision: 'deny',
        obligations: [],
        policies_fired: [],
        reasons: [`connection_${record.status}`],
      };
    }
    if (await this.runtime.registry.isRevoked('connection', input.connectionId)) {
      return {
        decision: 'deny',
        obligations: [],
        policies_fired: [],
        reasons: ['revoked'],
      };
    }

    const principal = input.principal ?? {
      type: 'Agent',
      id: this.did,
      attrs: {
        connection_id: input.connectionId,
        owner_did: record.token.issuer,
      },
    };

    const decision = this.runtime.pdp.evaluate({
      cedarPolicies: record.cedar_policies,
      principal,
      action: input.action,
      resource: input.resource,
      context: input.context ?? {},
    });

    // Same pattern as the runtime: merge the token-level static obligations
    // with anything the PDP returned.
    const merged: Obligation[] = [
      ...(record.token.obligations ?? []),
      ...decision.obligations,
    ];
    return { ...decision, obligations: merged };
  }

  /* --------------------- integration-point 2: egress -------------------- */

  async egress(input: EgressInput): Promise<unknown> {
    let obligations = input.obligations;
    if (!obligations) {
      const record = await this.runtime.registry.getConnection(input.connectionId);
      obligations = record?.token.obligations ?? [];
    }
    return applyObligations(input.data, obligations);
  }

  /* --------------------- integration-point 3: audit --------------------- */

  async audit(event: AuditEventInput): Promise<void> {
    const log = this.runtime.auditFor(event.connectionId);
    // The audit package's schema enforces decision ∈ {allow, deny}. For
    // arbitrary developer event markers we downgrade to `allow` and encode
    // the intent in `reason` (keeps the chain valid without fragmenting the
    // schema across packages).
    const decision: 'allow' | 'deny' =
      event.decision === 'deny' ? 'deny' : 'allow';
    const reasonParts: string[] = [];
    if (event.decision && event.decision !== 'allow' && event.decision !== 'deny') {
      reasonParts.push(`event:${event.decision}`);
    }
    if (event.reason) reasonParts.push(event.reason);
    if (event.metadata) {
      reasonParts.push(`meta=${JSON.stringify(event.metadata)}`);
    }
    log.append({
      msg_id: event.messageId ?? `sdk_${this.now()}`,
      decision,
      policies_fired: event.policiesFired ?? [],
      ...(event.obligations && event.obligations.length > 0
        ? { obligations: event.obligations }
        : {}),
      ...(reasonParts.length > 0 ? { reason: reasonParts.join('; ') } : {}),
    });
  }

  /* ------------------- integration-point 4: lifecycle ------------------- */

  on<E extends ArpAgentEvent>(
    event: E,
    handler: (payload: ArpAgentEventPayload<E>) => void,
  ): void {
    // Typescript narrows poorly across the mapped type here; cast to the
    // concrete array and push. Runtime type is sound because caller must
    // name the event literal.
    (this.events[event] as Array<(e: ArpAgentEventPayload<E>) => void>).push(handler);
  }

  /** Emit a rotation event. Adapters call this when they detect key rotation. */
  emitRotation(event: RotationEvent): void {
    for (const h of this.events.rotation) h(event);
  }

  /* ------------------------- introspection ----------------------------- */

  /** Well-known docs the runtime publishes. */
  get wellKnown() {
    return this.runtime.wellKnown;
  }

  /** True when `stop()` has been called. */
  isDraining(): boolean {
    return this.runtime.isDraining();
  }

  inFlightCount(): number {
    return this.runtime.inFlightCount();
  }
}

/* --------------------------- API builders ---------------------------- */

function buildConnectionAPI(
  registry: Registry,
  runtime: Runtime,
  events: EventHandlers,
  now: () => number,
): ConnectionAPI {
  return {
    async list() {
      return registry.listConnections({ includeExpired: true });
    },
    async get(id) {
      return registry.getConnection(id);
    },
    async revoke(id, reason = 'sdk_revoked') {
      await runtime.revokeConnection(id, reason);
      for (const h of events.revocation) {
        h({ connectionId: id, reason, at: now() });
      }
    },
    async suspend(id) {
      await registry.updateStatus(id, 'suspended');
    },
    async resume(id) {
      await registry.updateStatus(id, 'active');
    },
    async add(token: ConnectionToken, tokenJws?: string): Promise<ConnectionRecord> {
      const record = await runtime.addConnection(token, tokenJws);
      for (const h of events.pairing) {
        h({
          connectionId: record.connection_id,
          peerDid: record.peer_did,
          at: now(),
        });
      }
      return record;
    },
  };
}

function buildRegistryReadAPI(registry: Registry): RegistryReadAPI {
  return {
    async get(id) {
      return registry.getConnection(id);
    },
    async list(opts) {
      return registry.listConnections(opts);
    },
  };
}

function buildPdpAPI(runtime: Runtime): PdpAPI {
  return {
    async check(input: CheckInput) {
      const record = await runtime.registry.getConnection(input.connectionId);
      if (!record) {
        return {
          decision: 'deny',
          obligations: [],
          policies_fired: [],
          reasons: [`unknown_connection:${input.connectionId}`],
        };
      }
      const principal = input.principal ?? {
        type: 'Agent',
        id: record.self_did,
        attrs: {
          connection_id: input.connectionId,
          owner_did: record.token.issuer,
        },
      };
      return runtime.pdp.evaluate({
        cedarPolicies: record.cedar_policies,
        principal,
        action: input.action,
        resource: input.resource,
        context: input.context ?? {},
      });
    },
  };
}

/* --------------------------- helpers --------------------------- */

function loadCedarSchema(): string {
  // We inline the read here so adapter authors don't need to know about
  // the schema path. Cedar schema file is shipped inside @kybernesis/arp-spec.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = requireFromHere('node:fs') as typeof import('node:fs');
  const path = requireFromHere.resolve('@kybernesis/arp-spec/cedar-schema.json');
  return fs.readFileSync(path, 'utf8');
}

function originOf(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.host}`;
}

function deriveAgentName(did: string): string {
  const host = did.split(':')[2] ?? 'agent';
  const first = host.split('.')[0] ?? 'agent';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function deriveActionFromType(type: string): string {
  const idx = type.lastIndexOf('/');
  return idx >= 0 ? type.slice(idx + 1) : type;
}

function coerceResource(spec: unknown): Resource {
  if (typeof spec === 'string') {
    const [type = 'Resource', id = spec] = spec.split(':', 2);
    return { type, id };
  }
  if (spec && typeof spec === 'object') {
    const s = spec as Record<string, unknown>;
    if (typeof s['type'] === 'string' && typeof s['id'] === 'string') {
      return {
        type: s['type'] as string,
        id: s['id'] as string,
        ...(isPlainObject(s['attrs']) ? { attrs: s['attrs'] as Record<string, unknown> } : {}),
      };
    }
  }
  return { type: 'Resource', id: 'default' };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
