/**
 * Samantha reference — application-level dispatch handler.
 *
 * Plugs into the Phase-2 runtime via `RuntimeOptions.dispatch`. The runtime
 * handles DIDComm wire protocol, Cedar evaluation, audit logging, and
 * revocation gates; this module only implements the "what do I do once a
 * request is allowed" part.
 *
 * Three demo tools:
 *   - `summarize`              summarise a project-file resource
 *   - `check_availability`     return placeholder calendar windows
 *   - `read_project_file`      echo a fixture's contents
 *
 * `remember` / `recall` round-trip into the per-connection memory bucket to
 * prove the isolation story (Phase 5 Task 6).
 */

import type { DispatchHandler, DispatchInput } from '@kybernesis/arp-runtime';
import type { KnowledgeBase } from './fixtures/knowledge-base.js';

export interface SamanthaDispatchOptions {
  /** Per-connection knowledge base. Keys are connection IDs. */
  knowledgeBase: KnowledgeBase;
  /** Agent-level facts. Shared across all connections (OK: non-user data). */
  agentFacts?: Record<string, unknown>;
  /** Clock injection for tests. */
  now?: () => number;
}

export function createSamanthaDispatch(opts: SamanthaDispatchOptions): DispatchHandler {
  const kb = opts.knowledgeBase;
  const agentFacts = opts.agentFacts ?? {};

  return async (input: DispatchInput) => {
    const body = (input.message.body ?? {}) as Record<string, unknown>;
    const action = typeof body['action'] === 'string' ? body['action'] : null;
    const resource = body['resource'];

    switch (action) {
      case 'summarize':
        return {
          reply: {
            tool: 'summarize',
            resource: normalizeResource(resource),
            summary: `Summary for ${connectionSummaryKey(input, resource)}`,
            connection_id: input.connectionId,
          },
        };

      case 'check_availability': {
        const windows = [
          { day: 'Monday', start: '09:00', end: '11:00' },
          { day: 'Tuesday', start: '14:00', end: '17:00' },
        ];
        return {
          reply: {
            tool: 'check_availability',
            windows,
            connection_id: input.connectionId,
          },
        };
      }

      case 'read_project_file': {
        const projectId = String((resource as Record<string, unknown>)?.['project_id'] ?? '');
        const file = String(body['file'] ?? '');
        const content =
          kb.readProjectFile(input.connectionId, projectId, file) ??
          `[fixture missing] ${projectId}:${file}`;
        return {
          reply: {
            tool: 'read_project_file',
            project_id: projectId,
            file,
            content,
            connection_id: input.connectionId,
          },
        };
      }

      case 'remember': {
        // Write a fact into this connection's memory bucket.
        const key = String(body['key'] ?? '');
        const value = body['value'];
        if (key) input.memory.set(key, value);
        return {
          reply: {
            tool: 'remember',
            key,
            stored: key.length > 0,
            connection_id: input.connectionId,
          },
        };
      }

      case 'recall': {
        // Read a fact — only ever returns keys set UNDER THIS CONNECTION.
        const key = String(body['key'] ?? '');
        const value = key ? input.memory.get(key) : null;
        return {
          reply: {
            tool: 'recall',
            key,
            value,
            connection_id: input.connectionId,
            found: value !== null && value !== undefined,
          },
        };
      }

      case 'agent_info': {
        return {
          reply: {
            tool: 'agent_info',
            did: input.connection.subject,
            agent_facts: agentFacts,
            connection_id: input.connectionId,
          },
        };
      }

      default:
        // Unrecognised actions echo so callers can see the body the runtime
        // saw; obligations are preserved so egress PDP still trips.
        return {
          reply: {
            tool: 'echo',
            received_action: action,
            body,
            connection_id: input.connectionId,
          },
        };
    }
  };
}

function normalizeResource(resource: unknown): string | Record<string, unknown> {
  if (typeof resource === 'string') return resource;
  if (resource && typeof resource === 'object') return resource as Record<string, unknown>;
  return 'unknown';
}

function connectionSummaryKey(input: DispatchInput, resource: unknown): string {
  const res = normalizeResource(resource);
  if (typeof res === 'string') return res;
  const projectId = (res as Record<string, unknown>)['project_id'];
  return typeof projectId === 'string' ? projectId : input.connectionId;
}
