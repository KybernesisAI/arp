/**
 * Shipped skill templates. Pure data — no fs/process imports — so the
 * cloud app can also import this module to serve SKILL.md content via
 * its own API (browser download path), even though the cloud app
 * runs in a different package.
 *
 * The format is the standard Anthropic skill format (Claude Code +
 * KyberBot both consume it):
 *
 *   ---
 *   name: <slug>
 *   description: "..."
 *   allowed-tools: ...
 *   version: <int>
 *   ---
 *   # markdown body
 *
 * Adding a skill: append an entry to SKILL_TEMPLATES + bump the
 * version. The CLI's `arpc skill install <name>` and the dashboard's
 * download button both pick it up automatically.
 */

export type SkillFramework = 'kyberbot-claude' | 'openclaw' | 'hermes';

export type SkillTemplate = {
  name: string;
  filename: string;
  content: string;
  /**
   * Which framework family the template targets. `kyberbot-claude`
   * means the file is the standard Anthropic-format SKILL.md (works
   * unchanged in both KyberBot and Claude Code). `openclaw` and
   * `hermes` are placeholders for those frameworks' native plugin/
   * decorator formats — they ship as previews until adapters land.
   */
  framework: SkillFramework;
  /**
   * `available` — fully wired, downloadable, installable.
   * `preview`   — placeholder; the framework adapter isn't done yet,
   *               so download/install is gated and the dashboard
   *               renders the card with "ADAPTER COMING SOON".
   */
  status: 'available' | 'preview';
  /** Human-readable category shown on dashboard cards. */
  category: string;
  /**
   * Brand-colour suggestion for the dashboard card. Lets framework-
   * specific cards match the framework's identity (OpenClaw red,
   * Hermes yellow, etc). When unset, the dashboard cycles tones
   * automatically.
   */
  brandTone?: 'paper' | 'paper-2' | 'blue' | 'yellow' | 'red';
};

const CONTACT_SKILL_MD = `---
name: contact
description: "Talk to another ARP agent on the user's behalf. Use when the user asks you to ask, message, contact, ping, check with, or get something from another agent (e.g. 'ask Samantha if she's free Friday', 'ping ian about the deal flow', 'check with Nova on the marketing copy'). Picks the right typed scope when one is granted; falls back to chat. Resolves names via contacts.yaml in this folder."
allowed-tools: Bash(arpc *)
version: 2
---

# Contact another agent

When the user asks you to message another agent, use this skill.

## When to use

- "Ask <name> ..."
- "Message <name> ..."
- "Ping <name> ..."
- "Check with <name> ..."
- "Get <something> from <name> ..."

## Two ways to talk to a peer

ARP gives you two paths to a peer. Pick the right one for the user's intent:

1. **Typed action** — \`arpc request <peer> <scope-id> --param k=v ...\`
   Hard data-layer enforcement: the peer's adapter runs a structured
   handler (e.g. \`/api/arp/notes.search\` with \`WHERE project_id=alpha\`).
   No room for the peer's LLM to leak out-of-scope data; the SQL
   doesn't return rows it can't match. **Prefer this when possible.**

2. **Chat** — \`arpc send <peer> "<text>"\`
   Free-form natural-language relay through the peer's chatbot. Works
   for anything; the peer's LLM decides what to share within its scope.
   Soft enforcement (LLM-as-gatekeeper). Use this when no typed scope
   matches the user's intent or when the question is genuinely
   conversational.

The connection's Cedar policy decides which paths are open. \`arpc peer-actions\`
tells you what's available — always run it first.

## How

### 1. Resolve the contact

\`\`\`bash
arpc contacts list
\`\`\`

If \`<name>\` isn't in the list, tell the user — don't guess DIDs. If
you do know the full DID from context (e.g. user typed \`did:web:foo.agent\`),
you can pass it directly to any of the commands below.

### 2. Discover what's granted on this peer

\`\`\`bash
arpc peer-actions <name-or-did> --json
\`\`\`

This prints the active connection (if any) and the list of granted
scope IDs with their pinned parameters. Examples of typed scopes you
might see: \`notes.search\`, \`notes.read\`, \`knowledge.query\`,
\`calendar.availability.read\`, \`contacts.search\`,
\`messaging.relay.to_principal\`.

If \`peer-actions\` returns no active connection, tell the user there's
no live ARP connection to that peer yet — they need to pair via
\`cloud.arp.run/connections\`.

### 3. Pick the right call

Match the user's intent to a granted scope:

| User intent | Best scope | Command |
|---|---|---|
| "what does X know about <topic>" / "search X's notes for ..." | \`notes.search\` | \`arpc request <name> notes.search --param collection_id=<project> --param query="<topic>"\` |
| "ask X about Y" (specific note already known) | \`notes.read\` | \`arpc request <name> notes.read --param collection_id=<project> --param source_path=<path>\` |
| "what does X think about <broader topic>" | \`knowledge.query\` | \`arpc request <name> knowledge.query --param kb_id=<id> --param query="<topic>"\` |
| "is X free <when>" / "check X's availability" | \`calendar.availability.read\` | \`arpc request <name> calendar.availability.read --param days_ahead=<n>\` |
| Conversational ("ping X to check in", "tell X ...") | \`messaging.relay.to_principal\` | \`arpc send <name> "<text>"\` |

If multiple typed scopes plausibly apply, pick the narrowest match. If
none fit, fall back to \`arpc send\` — but ONLY if the connection grants
\`messaging.relay.to_principal\`.

If the connection grants neither a relevant typed scope nor relay,
tell the user: "I don't have a scope on this connection that lets me
ask <name> about <topic>. They'd need to grant me <suggested-scope>
through \`cloud.arp.run/connections/<id>/edit\`."

### 4. Run the call (with a sane timeout)

\`\`\`bash
# typed
arpc request <name> <scope-id> --param k=v ... --timeout 90

# chat
arpc send <name> "<your-question>" --timeout 90
\`\`\`

The command prints the reply (typed: structured JSON; chat: peer's
free-form text). Include it in your response to the user, attributing
it to the contact ("Samantha says: ..."). For typed JSON, summarise the
fields naturally — don't dump raw JSON unless the user asked for it.

### 5. Handle the failure cases

- **Exit 3, \`denied by audience policy\`** — the cedar policy doesn't
  permit what you tried. Tell the user why ("They've only granted me
  notes.search on Project Alpha, not Project Beta") and suggest they
  edit the connection at \`cloud.arp.run\` if they want to widen access.
- **Exit 2, \`reply_timeout\`** — the request was delivered but the peer
  didn't reply in time. Tell the user; don't retry.
- **\`gateway_unreachable\`** — supervisor or gateway is down. Tell the
  user; investigate before retrying.

## Examples

User: "ask Samantha what time she's free Friday"
You run:
  \`arpc peer-actions samantha --json\`  → sees \`calendar.availability.read\`
  \`arpc request samantha calendar.availability.read --param days_ahead=7 --timeout 90\`
You reply: "Samantha is free 1–4 PM Friday."

User: "ask Atlas what they know about Project Alpha hiring"
You run:
  \`arpc peer-actions atlas --json\` → sees \`notes.search collection_id=alpha\`
  \`arpc request atlas notes.search --param collection_id=alpha --param query="hiring" --timeout 90\`
You reply: "Atlas has one note: Sarah Chen joined Project Alpha as ML lead (2026-04-30)."

User: "ping ian to remind him about the meeting"
You run:
  \`arpc peer-actions ian --json\` → sees \`messaging.relay.to_principal\`
  \`arpc send ian "atlas here — reminder about the meeting" --timeout 90\`
You reply: (whatever Ian's agent replied)

User: "what does ghost.agent think about Project Beta"
You run:
  \`arpc peer-actions ghost.agent --json\` → no scope covers Project Beta
You reply: "I don't have a scope on this connection that lets me query Ghost about Project Beta. If you want, I can ping them via free-form chat — that path's still open."

## Don'ts

- Don't make up replies. If the supervisor isn't running or there's
  no connection to the peer yet, say so.
- Don't skip \`peer-actions\`. Without it you'll guess wrong and hit
  \`policy_denied\`.
- Don't fall back to \`arpc send\` if a typed scope would have worked —
  you give up the data-layer guarantee that way.
- Don't use this for talking to the user — they're already talking to
  you directly. This is for talking to OTHER agents on the user's behalf.
- Don't add new contacts unless the user explicitly tells you to.
  Pairing through \`cloud.arp.run\` auto-populates contacts.yaml.
`;

/**
 * OpenClaw plugins are Python decorator–style — a Python file that
 * registers an action with the OpenClaw runtime and exposes its
 * trigger metadata via class attributes. We don't ship one yet
 * (adapter pending); this placeholder shows what the file will look
 * like so users know the format isn't a SKILL.md.
 */
const OPENCLAW_CONTACT_PY = `# openclaw_skills/contact.py — preview, adapter pending
#
# OpenClaw plugins are Python classes that subclass Skill and declare
# their trigger surface as class attrs. The dashboard's "Download"
# button on this card will produce the real file once the OpenClaw
# adapter for arpc lands. Below is the shape we're targeting:

from openclaw import Skill, action, trigger
import json
import subprocess


class Contact(Skill):
    """Talk to another ARP agent. Picks the right typed scope when granted; falls back to chat."""

    name = "contact"
    triggers = [
        trigger.verb("ask", "message", "ping", "contact", "check_with"),
        trigger.pattern(r"(ask|message|ping|check with) (?P<name>\\w+)"),
    ]

    @action
    def run(self, name: str, intent: str) -> str:
        # 1. Discover what scopes are granted on this peer.
        peer_actions = subprocess.run(
            ["arpc", "peer-actions", name, "--json"],
            capture_output=True, check=True,
        )
        info = json.loads(peer_actions.stdout)
        if not info.get("connections"):
            return f"no active ARP connection to {name}; ask the user to pair via cloud.arp.run."
        scopes = {s["id"]: s.get("params", {}) for s in info["connections"][0]["scope_selections"]}

        # 2. Choose: typed action (hard data-layer guarantee) or chat fallback.
        #    The router below maps user intent → scope. Extend per use case.
        if "notes.search" in scopes and "search" in intent.lower():
            params = scopes["notes.search"]
            cmd = ["arpc", "request", name, "notes.search",
                   "--param", f"collection_id={params.get('collection_id', '')}",
                   "--param", f"query={intent}",
                   "--timeout", "90"]
        elif "calendar.availability.read" in scopes and "free" in intent.lower():
            cmd = ["arpc", "request", name, "calendar.availability.read",
                   "--param", "days_ahead=14", "--timeout", "90"]
        elif "messaging.relay.to_principal" in scopes:
            cmd = ["arpc", "send", name, intent, "--timeout", "90"]
        else:
            return (f"connection to {name} doesn't grant a scope that covers this intent. "
                    "Edit the connection at cloud.arp.run to grant the scope.")

        out = subprocess.run(cmd, capture_output=True, check=True)
        return out.stdout.decode().strip()
`;

/**
 * Hermes-Agent uses a TypeScript decorator pattern — \`@tool\` on a
 * method of an Agent class. Adapter pending; this is the shape we're
 * targeting so users can preview the integration.
 */
const HERMES_CONTACT_TS = `// hermes/skills/contact.ts — preview, adapter pending
//
// Hermes-Agent surfaces capabilities via \`@tool\`-decorated methods on
// an Agent subclass. The dashboard's "Download" on this card will
// produce the real file once the Hermes adapter for arpc ships. Below
// is the shape we're targeting:

import { Agent, tool } from '@hermes-agent/core';
import { execFileSync } from 'node:child_process';

export class ContactSkill extends Agent {
  /**
   * Talk to another ARP agent. Picks the right typed scope when one is
   * granted (hard data-layer enforcement); falls back to chat relay
   * when only that's available.
   */
  @tool({
    description:
      'Talk to another ARP agent on the user\\'s behalf. Use when the user ' +
      'asks you to ask, message, contact, ping, or check with another agent.',
    parameters: {
      name: { type: 'string', description: 'Contact name from contacts.yaml or a did:web: URI' },
      intent: { type: 'string', description: 'The user\\'s natural-language question or instruction' },
    },
  })
  async contact({ name, intent }: { name: string; intent: string }): Promise<string> {
    // 1. Discover what scopes the connection grants for this peer.
    const peerActionsRaw = execFileSync(
      'arpc',
      ['peer-actions', name, '--json'],
      { encoding: 'utf-8' },
    );
    const info = JSON.parse(peerActionsRaw) as {
      connections: Array<{
        scope_selections: Array<{ id: string; params?: Record<string, unknown> }>;
      }>;
    };
    if (!info.connections.length) {
      return \`no active ARP connection to \${name}; pair via cloud.arp.run.\`;
    }
    const scopes = new Map<string, Record<string, unknown>>(
      info.connections[0].scope_selections.map((s) => [s.id, s.params ?? {}]),
    );

    // 2. Map intent → typed scope (preferred) or chat fallback.
    let cmd: string[];
    if (scopes.has('notes.search') && /search|find|know about|notes/i.test(intent)) {
      const collection = (scopes.get('notes.search')!.collection_id ?? '') as string;
      cmd = ['request', name, 'notes.search',
             '--param', \`collection_id=\${collection}\`,
             '--param', \`query=\${intent}\`,
             '--timeout', '90'];
    } else if (scopes.has('calendar.availability.read') && /free|available/i.test(intent)) {
      cmd = ['request', name, 'calendar.availability.read',
             '--param', 'days_ahead=14', '--timeout', '90'];
    } else if (scopes.has('messaging.relay.to_principal')) {
      cmd = ['send', name, intent, '--timeout', '90'];
    } else {
      return \`connection to \${name} doesn't grant a scope that covers this intent. \` +
             \`Edit the connection at cloud.arp.run to grant the scope.\`;
    }
    return execFileSync('arpc', cmd, { encoding: 'utf-8' }).trim();
  }
}
`;

export const SKILL_TEMPLATES: Record<string, SkillTemplate> = {
  contact: {
    name: 'contact',
    filename: 'SKILL.md',
    content: CONTACT_SKILL_MD,
    framework: 'kyberbot-claude',
    status: 'available',
    category: 'MESSAGING · KYBERBOT + CLAUDE CODE',
  },
  'contact-openclaw': {
    name: 'contact-openclaw',
    filename: 'contact.py',
    content: OPENCLAW_CONTACT_PY,
    framework: 'openclaw',
    status: 'preview',
    category: 'MESSAGING · OPENCLAW',
    brandTone: 'red',
  },
  'contact-hermes': {
    name: 'contact-hermes',
    filename: 'contact.ts',
    content: HERMES_CONTACT_TS,
    framework: 'hermes',
    status: 'preview',
    category: 'MESSAGING · HERMES-AGENT',
    brandTone: 'yellow',
  },
};

export function listSkillNames(): string[] {
  return Object.keys(SKILL_TEMPLATES).sort();
}

export function getSkillTemplate(name: string): SkillTemplate | null {
  return SKILL_TEMPLATES[name] ?? null;
}

/**
 * Where on disk a skill should land for a given target framework.
 * `cwd` is the directory the user ran `arpc skill install` from.
 */
export type SkillTarget = 'kyberbot' | 'claude-code' | 'claude-code-global';

export function skillInstallPath(name: string, target: SkillTarget, cwd: string, home: string): string {
  // Use a clean joiner so the function is browser-safe (no node:path).
  const join = (...parts: string[]) => parts.filter(Boolean).join('/').replace(/\/+/g, '/');
  switch (target) {
    case 'kyberbot':
      return join(cwd, 'skills', name, 'SKILL.md');
    case 'claude-code':
      return join(cwd, '.claude', 'skills', name, 'SKILL.md');
    case 'claude-code-global':
      return join(home, '.claude', 'skills', name, 'SKILL.md');
  }
}
