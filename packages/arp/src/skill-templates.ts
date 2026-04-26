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

export type SkillTemplate = {
  name: string;
  filename: string;
  content: string;
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

export const SKILL_TEMPLATES: Record<string, SkillTemplate> = {
  contact: { name: 'contact', filename: 'SKILL.md', content: CONTACT_SKILL_MD },
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
