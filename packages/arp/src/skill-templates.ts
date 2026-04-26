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
description: "Send a message to another ARP agent and wait for their reply. Use when the user asks you to ask, message, contact, ping, check with, or get something from another agent (e.g. 'ask Samantha if she's free Friday', 'ping ian about the deal flow', 'check with Nova on the marketing copy'). Resolves names via contacts.yaml in this folder."
allowed-tools: Bash(arpc *)
version: 1
---

# Contact another agent

When the user asks you to message another agent, use this skill.

## When to use

- "Ask <name> ..."
- "Message <name> ..."
- "Ping <name> ..."
- "Check with <name> ..."
- "Get <something> from <name> ..."

## How

1. Look up the contact list:
   \`\`\`bash
   arpc contacts list
   \`\`\`

   If \`<name>\` isn't there, tell the user. Don't guess at DIDs. If you
   know the DID from the conversation context, you can pass it directly
   (skipping the contacts file): \`arpc send did:web:<host>.agent "..."\`.

2. Send the message and wait for the reply (default: 30s timeout):
   \`\`\`bash
   arpc send <name-or-did> "<your-question>"
   \`\`\`

   The command prints the reply to stdout. Include it verbatim in your
   response to the user, attributing it to the contact ("Samantha says:
   …"). Don't paraphrase unless asked.

3. If the command exits 2 with \`reply_timeout\`, tell the user the
   message was delivered but no reply came back yet. Don't retry
   automatically.

## Examples

User: "ask Samantha what time she's free Friday"
You run: \`arpc send samantha "what time are you free Friday?"\`
You reply: "Samantha says: I'm open from 1–4 PM Bangkok time. Want me to
hold a slot?"

User: "ping ian about the meeting"
You run: \`arpc send ian "atlas here — quick check on the meeting?"\`
You reply: (whatever Ian's agent replied)

## Don'ts

- Don't make up replies. If the supervisor isn't running or there's
  no connection to that peer yet, say so.
- Don't use this for talking to the user — they're already talking to
  you directly. This is for talking to OTHER agents on the user's behalf.
- Don't add new contacts unless the user explicitly tells you to.
  (They'll usually do this through the cloud.arp.run dashboard, which
  auto-populates contacts.yaml after a successful pairing.)
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
import subprocess


class Contact(Skill):
    """Send a message to another ARP agent and wait for the reply."""

    name = "contact"
    triggers = [
        trigger.verb("ask", "message", "ping", "contact", "check_with"),
        trigger.pattern(r"(ask|message|ping|check with) (?P<name>\\w+)"),
    ]

    @action
    def run(self, name: str, text: str) -> str:
        # Shell out to arpc; the supervisor handles signing + waits for
        # the peer's reply.
        out = subprocess.run(
            ["arpc", "send", name, text],
            capture_output=True,
            check=True,
        )
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
   * Send a message to another ARP agent and wait for the reply.
   * The Hermes runtime auto-routes user prompts to this tool when
   * they match the description's verb pattern.
   */
  @tool({
    description:
      'Send a message to another ARP agent and wait for their reply. ' +
      'Use when the user asks you to ask, message, contact, ping, or check with another agent.',
    parameters: {
      name: { type: 'string', description: 'Contact name from contacts.yaml or a did:web: URI' },
      text: { type: 'string', description: 'The question or message to deliver' },
    },
  })
  async contact({ name, text }: { name: string; text: string }): Promise<string> {
    const out = execFileSync('arpc', ['send', name, text], { encoding: 'utf-8' });
    return out.trim();
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
