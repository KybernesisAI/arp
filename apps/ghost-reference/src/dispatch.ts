/**
 * Ghost reference — counterparty dispatch handler. Structure mirrors
 * samantha-reference so interop demos have symmetric behaviour; tool names
 * and fixture shapes intentionally identical.
 */

import type { DispatchHandler, DispatchInput } from '@kybernesis/arp-runtime';
import type { KnowledgeBase } from './fixtures/knowledge-base.js';

export interface GhostDispatchOptions {
  knowledgeBase: KnowledgeBase;
  agentFacts?: Record<string, unknown>;
  now?: () => number;
}

export function createGhostDispatch(opts: GhostDispatchOptions): DispatchHandler {
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
            summary: `Ghost summary for ${connectionSummaryKey(input, resource)}`,
            connection_id: input.connectionId,
          },
        };

      case 'check_availability': {
        return {
          reply: {
            tool: 'check_availability',
            windows: [{ day: 'Wednesday', start: '10:00', end: '12:00' }],
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
