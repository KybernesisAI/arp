/**
 * Per-agent contacts file: <agent-root>/contacts.yaml
 *
 *   samantha: did:web:samantha.agent
 *   ian:      did:web:ian.agent
 *
 * Used by `arpc send` to resolve a name to a recipient DID. Per-agent
 * (not host-wide) because relationships are scoped — Atlas's address
 * book may not match Nova's, and contacts created during pairing are
 * scoped to a specific agent's tenant.
 *
 * Schema is intentionally a flat string→string map. Not a complex
 * record because pair flow already stores the connection_id +
 * cedar_policies on the cloud side; the contacts file is just for
 * name resolution at send time.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

export const CONTACTS_FILENAME = 'contacts.yaml';

export type Contacts = Record<string, string>;

export function contactsPath(agentRoot: string): string {
  return resolve(agentRoot, CONTACTS_FILENAME);
}

export function readContacts(agentRoot: string): Contacts {
  const p = contactsPath(agentRoot);
  if (!existsSync(p)) return {};
  let parsed: unknown;
  try {
    parsed = yaml.load(readFileSync(p, 'utf-8'));
  } catch (err) {
    throw new Error(`${p}: invalid YAML — ${(err as Error).message}`);
  }
  if (parsed === null || parsed === undefined) return {};
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${p}: must be a YAML mapping (name → did)`);
  }
  const out: Contacts = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== 'string') {
      throw new Error(`${p}: contact "${k}" must be a string DID`);
    }
    out[k] = v;
  }
  return out;
}

export function writeContacts(agentRoot: string, contacts: Contacts): void {
  const p = contactsPath(agentRoot);
  // Sort keys alphabetically for stable diffs in version control
  const sorted: Contacts = {};
  for (const k of Object.keys(contacts).sort()) sorted[k] = contacts[k]!;
  const out = yaml.dump(sorted, { lineWidth: 120, noRefs: true, sortKeys: true });
  writeFileSync(p, out, 'utf-8');
}

/** Resolve a name (or DID) to a peer DID. Names use the contacts file; anything starting with "did:" passes through. */
export function resolveRecipient(agentRoot: string, nameOrDid: string): { did: string; via: 'direct' | 'contacts' } {
  if (nameOrDid.startsWith('did:')) {
    return { did: nameOrDid, via: 'direct' };
  }
  const contacts = readContacts(agentRoot);
  const did = contacts[nameOrDid];
  if (!did) {
    throw new Error(
      `unknown contact "${nameOrDid}". Add it with: arpc contacts add ${nameOrDid} <did> ` +
        `(or pass a full did:web: URI to skip the contacts file).`,
    );
  }
  return { did, via: 'contacts' };
}
