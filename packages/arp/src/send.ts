/**
 * `arpc send` and `arpc contacts` — the messaging layer.
 *
 * `arpc send <name|did> "<text>"`
 *   Resolves <name> via the local agent's contacts.yaml (or accepts a
 *   raw did:web URI). Determines the *sending* agent from the cwd's
 *   arp.json (or --as flag, or single-agent default if only one is
 *   currently supervised). POSTs to the running supervisor's IPC
 *   /send endpoint, blocks for a peer reply, prints it.
 *
 *   --async                       fire and forget; print msgId only.
 *   --timeout <seconds>           sync wait window. Default 30.
 *   --connection <id>             explicit connection_id (else auto-
 *                                 picked from contacts metadata when
 *                                 ARP cloud auto-stores it; or self-
 *                                 demo bypass if from === to).
 *   --as <did>                    pick a sender DID explicitly.
 *
 * `arpc contacts` subcommands:
 *   add <name> <did>              add or overwrite an entry
 *   list                          show name → did map
 *   remove <name>                 drop a contact
 *
 * Contacts file: <agent-root>/contacts.yaml. Per-agent because each
 * agent's address book is scoped to its own tenant and pairing
 * relationships.
 */

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { readControlFile } from './ipc.js';
import {
  readContacts,
  writeContacts,
  resolveRecipient,
  contactsPath,
  type Contacts,
} from './contacts.js';
import { readManifest } from './manifest.js';

interface SendFlags {
  async?: boolean;
  timeoutSec?: number;
  connectionId?: string;
  as?: string;
}

interface DetectedSender {
  agentDid: string;
  agentRoot: string;
}

async function detectSender(cwd: string, asFlag?: string): Promise<DetectedSender> {
  const ctrl = readControlFile();
  if (!ctrl) {
    throw new Error(
      `no running supervisor — start it with: arpc host start  (or arpc service install)`,
    );
  }
  const ipc = await fetchSupervised(ctrl);
  if (asFlag) {
    const match = ipc.find((a) => a.agentDid === asFlag);
    if (!match) {
      throw new Error(
        `--as ${asFlag} not currently supervised. Running agents:\n  ${ipc.map((a) => a.agentDid ?? '<starting>').join('\n  ')}`,
      );
    }
    return { agentDid: match.agentDid!, agentRoot: match.root };
  }

  // Sender from cwd's arp.json (preferred).
  try {
    const m = readManifest(cwd);
    if (m) {
      const handoffPath = resolve(cwd, m.handoff ?? './arp-handoff.json');
      if (existsSync(handoffPath)) {
        const bundle = JSON.parse(readFileSync(handoffPath, 'utf-8'));
        if (typeof bundle.agent_did === 'string') {
          return { agentDid: bundle.agent_did, agentRoot: cwd };
        }
      }
    }
  } catch {
    /* fall through to supervisor default */
  }
  // identity.yaml legacy: use the only agent in this folder if there's a handoff
  const handoffPath = resolve(cwd, 'arp-handoff.json');
  if (existsSync(handoffPath)) {
    try {
      const bundle = JSON.parse(readFileSync(handoffPath, 'utf-8'));
      if (typeof bundle.agent_did === 'string') {
        return { agentDid: bundle.agent_did, agentRoot: cwd };
      }
    } catch {
      /* ignore */
    }
  }

  // Fallback: if exactly one agent is supervised, use it.
  const live = ipc.filter((a) => a.agentDid);
  if (live.length === 1) {
    return { agentDid: live[0]!.agentDid!, agentRoot: live[0]!.root };
  }

  throw new Error(
    `couldn't determine sender. Either:\n` +
      `  • cd into the agent's folder (where arp.json + arp-handoff.json live)\n` +
      `  • or pass --as <did:web:...>\n\n` +
      `Currently supervised:\n  ${live.map((a) => `${a.agentDid}  (${a.root})`).join('\n  ') || '<none>'}`,
  );
}

interface SupervisedView {
  root: string;
  agentDid: string | null;
  gatewayWsUrl: string | null;
}

async function fetchSupervised(ctrl: { port: number; token: string }): Promise<SupervisedView[]> {
  const res = await fetch(`http://127.0.0.1:${ctrl.port}/agents`, {
    headers: { 'x-arp-control-token': ctrl.token },
  });
  if (!res.ok) {
    throw new Error(`supervisor /agents responded ${res.status}`);
  }
  const body = (await res.json()) as { agents: SupervisedView[] };
  return body.agents;
}

export async function cmdSend(positional: string[], flags: SendFlags): Promise<void> {
  const recipientArg = positional[1];
  const text = positional[2];
  if (!recipientArg || !text) {
    console.error('usage: arpc send <name-or-did> "<text>" [--async] [--timeout SEC] [--connection ID] [--as <did>]');
    process.exit(2);
  }
  const cwd = process.cwd();
  const sender = await detectSender(cwd, flags.as);

  let recipient: ReturnType<typeof resolveRecipient>;
  try {
    recipient = resolveRecipient(sender.agentRoot, recipientArg);
  } catch (err) {
    console.error(`arpc send: ${(err as Error).message}`);
    process.exit(1);
  }

  const ctrl = readControlFile()!;
  const timeoutMs = flags.async ? 0 : (flags.timeoutSec ?? 30) * 1000;

  console.log(`from ${sender.agentDid}`);
  console.log(`to   ${recipient.did}${recipient.via === 'contacts' ? ` (resolved "${recipientArg}")` : ''}`);
  console.log(`text ${text}`);

  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${ctrl.port}/send`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-arp-control-token': ctrl.token,
      },
      body: JSON.stringify({
        from: sender.agentDid,
        to: recipient.did,
        text,
        ...(flags.connectionId ? { connectionId: flags.connectionId } : {}),
        syncTimeoutMs: timeoutMs,
      }),
    });
  } catch (err) {
    console.error(`arpc send: supervisor unreachable: ${(err as Error).message}`);
    process.exit(1);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (res.status === 202) {
    console.log(`\nqueued · msgId=${body['msgId']} · thid=${body['thid']}`);
    return;
  }
  if (res.status === 200 && body['reply']) {
    const reply = body['reply'] as { peerDid: string; text: string };
    console.log(`\nreply from ${reply.peerDid}:`);
    console.log(reply.text);
    return;
  }
  if (res.status === 403 && body['error'] === 'denied') {
    console.error(
      `\ndenied by audience policy (msgId=${body['msgId']})\n` +
        `reason: ${body['reason'] ?? 'policy_denied'}\n` +
        `the audience never saw your message — the cedar policy on this connection ` +
        `doesn't permit this action. Edit the connection at cloud.arp.run/connections ` +
        `to grant the scope you need.`,
    );
    process.exit(3);
  }
  if (res.status === 504 && body['error'] === 'reply_timeout') {
    console.error(
      `\ngateway accepted the message (msgId=${body['msgId']}) but no reply within ${timeoutMs / 1000}s.`,
    );
    process.exit(2);
  }

  // Anything else is an error.
  console.error(
    `\narpc send: ${res.status} ${body['error'] ?? 'failed'}\n` +
      JSON.stringify(body, null, 2),
  );
  process.exit(1);
}

// ---- arpc request — typed ARP action -------------------------------------

interface RequestFlags extends SendFlags {
  /** Structured params merged into the envelope body. Each --param k=v adds one key. */
  params?: Record<string, unknown>;
}

/**
 * Send a structured ARP action to a peer. Sibling to `arpc send`,
 * but the envelope body carries `{action, ...params}` instead of
 * `{text}`. Cloud PDP evaluates against the action + claimed
 * resource; the audience-side adapter dispatches to its
 * `/api/arp/<action>` typed handler (defense-in-depth filtering at
 * the data layer).
 *
 * Usage:
 *   arpc request <peer> <action> --param k=v --param k2=v2 [--timeout SEC]
 *
 * Examples:
 *   arpc request mythos notes.search --param collection_id=alpha --param query="hiring"
 *   arpc request mythos notes.read   --param collection_id=alpha --param source_path=...
 *   arpc request mythos knowledge.query --param kb_id=alpha --param query="design status" --param max_tokens=2000
 *
 * The reply is the typed JSON response (or error envelope) the peer's
 * /api/arp/<action> handler returned, printed verbatim. Async / fire-
 * and-forget is supported via --async (returns the queued msgId).
 */
export async function cmdRequest(positional: string[], flags: RequestFlags): Promise<void> {
  const recipientArg = positional[1];
  const action = positional[2];
  if (!recipientArg || !action) {
    console.error(
      'usage: arpc request <name-or-did> <action> [--param k=v ...] [--async] [--timeout SEC] [--connection ID] [--as <did>]',
    );
    process.exit(2);
  }
  const cwd = process.cwd();
  const sender = await detectSender(cwd, flags.as);

  let recipient: ReturnType<typeof resolveRecipient>;
  try {
    recipient = resolveRecipient(sender.agentRoot, recipientArg);
  } catch (err) {
    console.error(`arpc request: ${(err as Error).message}`);
    process.exit(1);
  }

  const ctrl = readControlFile()!;
  const timeoutMs = flags.async ? 0 : (flags.timeoutSec ?? 30) * 1000;
  const params = flags.params ?? {};

  console.log(`from   ${sender.agentDid}`);
  console.log(`to     ${recipient.did}${recipient.via === 'contacts' ? ` (resolved "${recipientArg}")` : ''}`);
  console.log(`action ${action}`);
  if (Object.keys(params).length > 0) {
    console.log(`params ${JSON.stringify(params)}`);
  }

  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${ctrl.port}/send`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-arp-control-token': ctrl.token,
      },
      body: JSON.stringify({
        from: sender.agentDid,
        to: recipient.did,
        // Brief human-readable text describes the action; the audience
        // adapter dispatches on `action`, not `text`. Useful when a
        // legacy adapter without typed dispatch falls through to chat.
        text: `[arp:${action}] ${JSON.stringify(params)}`,
        action,
        params,
        ...(flags.connectionId ? { connectionId: flags.connectionId } : {}),
        syncTimeoutMs: timeoutMs,
      }),
    });
  } catch (err) {
    console.error(`arpc request: supervisor unreachable: ${(err as Error).message}`);
    process.exit(1);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (res.status === 202) {
    console.log(`\nqueued · msgId=${body['msgId']} · thid=${body['thid']}`);
    return;
  }
  if (res.status === 200 && body['reply']) {
    const reply = body['reply'] as { peerDid: string; text: string };
    console.log(`\nreply from ${reply.peerDid}:`);
    console.log(reply.text);
    return;
  }
  if (res.status === 403 && body['error'] === 'denied') {
    console.error(
      `\ndenied by audience policy (msgId=${body['msgId']})\n` +
        `reason: ${body['reason'] ?? 'policy_denied'}\n` +
        `the connection's cedar policy doesn't permit this action. ` +
        `Edit the connection at cloud.arp.run/connections to grant the scope.`,
    );
    process.exit(3);
  }
  if (res.status === 504 && body['error'] === 'reply_timeout') {
    console.error(
      `\ngateway accepted (msgId=${body['msgId']}) but no reply within ${timeoutMs / 1000}s.`,
    );
    process.exit(2);
  }

  console.error(
    `\narpc request: ${res.status} ${body['error'] ?? 'failed'}\n` + JSON.stringify(body, null, 2),
  );
  process.exit(1);
}

// ---- contacts subcommands -------------------------------------------------

function resolveAgentRootForContacts(asFlag?: string): string {
  const cwd = process.cwd();
  if (asFlag && isAbsolute(asFlag)) return asFlag;
  // The contacts file lives next to arp.json/identity.yaml — if we're inside
  // an agent folder, that's cwd.
  if (existsSync(resolve(cwd, 'arp.json')) || existsSync(resolve(cwd, 'identity.yaml'))) {
    return cwd;
  }
  // Otherwise, try the only currently-supervised agent's root.
  const ctrl = readControlFile();
  if (ctrl) {
    // Synchronously read host.yaml as a hint
    // (full IPC fetch is overkill for management commands)
  }
  throw new Error(
    `arpc contacts: cd into your agent folder first (the one with arp.json + arp-handoff.json).`,
  );
}

export function cmdContacts(sub: string | null, positional: string[]): void {
  if (!sub || sub === 'list') {
    const root = resolveAgentRootForContacts();
    const c = readContacts(root);
    if (Object.keys(c).length === 0) {
      console.log(`no contacts yet · ${contactsPath(root)}`);
      console.log(`Add one with: arpc contacts add <name> <did:web:...>`);
      return;
    }
    for (const [name, did] of Object.entries(c).sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`${name.padEnd(20)} ${did}`);
    }
    return;
  }
  if (sub === 'add') {
    const name = positional[2];
    const did = positional[3];
    if (!name || !did) {
      console.error('usage: arpc contacts add <name> <did:web:...>');
      process.exit(2);
    }
    if (!did.startsWith('did:')) {
      console.error('arpc contacts add: did must start with did:web: or did:key:');
      process.exit(2);
    }
    const root = resolveAgentRootForContacts();
    const c = readContacts(root);
    c[name] = did;
    writeContacts(root, c);
    console.log(`added "${name}" → ${did}  (${contactsPath(root)})`);
    return;
  }
  if (sub === 'remove' || sub === 'rm') {
    const name = positional[2];
    if (!name) {
      console.error('usage: arpc contacts remove <name>');
      process.exit(2);
    }
    const root = resolveAgentRootForContacts();
    const c = readContacts(root);
    if (!(name in c)) {
      console.log(`arpc contacts: "${name}" not in ${contactsPath(root)}`);
      return;
    }
    delete c[name];
    writeContacts(root, c);
    console.log(`removed "${name}"  (${contactsPath(root)})`);
    return;
  }
  console.error(`unknown contacts subcommand: ${sub}`);
  process.exit(2);
}

export type { Contacts };
