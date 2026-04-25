/**
 * `arpc skill install <name>` — drops a skill template into the
 * agent's skills/<name>/ folder. Today only `contact` ships, which
 * teaches the agent's LLM to call `arpc send <name> "<text>"` when
 * the user asks it to message someone.
 *
 * The skill format mirrors KyberBot's existing skills loader (and is
 * a sane shape for any framework that loads markdown-with-frontmatter
 * skills — Claude Code's, etc). YAML frontmatter declares name +
 * description + allowed-tools; markdown body explains how + when.
 *
 * After install:
 *   arpc skill install contact          # writes ~/<agent>/skills/contact/SKILL.md
 *   (kyberbot)  kyberbot skill rebuild  # picks it up
 *   The user can now say to the agent: "ask Samantha what time she's free"
 *   and the LLM will run `arpc send samantha "..."` and include the reply.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

interface InstallOptions {
  name: string;
  agentRoot: string;
  force?: boolean;
}

function pickTemplate(name: string): { filename: string; content: string } | null {
  if (name === 'contact') return { filename: 'SKILL.md', content: CONTACT_SKILL_MD };
  return null;
}

export function cmdSkill(sub: string | null, positional: string[]): void {
  if (sub !== 'install') {
    console.error('usage: arpc skill install <name>');
    console.error('  available skills: contact');
    process.exit(2);
  }
  const name = positional[2];
  if (!name) {
    console.error('usage: arpc skill install <name>');
    console.error('  available skills: contact');
    process.exit(2);
  }
  const template = pickTemplate(name);
  if (!template) {
    console.error(`unknown skill: ${name}. Available: contact`);
    process.exit(1);
  }

  const cwd = process.cwd();
  // Use cwd as agent root — installed inside the agent folder.
  const skillDir = resolve(cwd, 'skills', name);
  const skillFile = resolve(skillDir, template.filename);

  if (existsSync(skillFile)) {
    console.error(`arpc skill install: ${skillFile} already exists. Delete it first if you want to overwrite.`);
    process.exit(1);
  }

  mkdirSync(skillDir, { recursive: true });
  writeFileSync(skillFile, template.content, 'utf-8');
  console.log(`Installed "${name}" skill at ${skillFile}`);
  console.log(`\nFor kyberbot, run:  kyberbot skill rebuild  (so the loader picks it up)`);
  console.log(`The agent's LLM will now use it when the user asks to message another agent.`);
}

export type { InstallOptions };
