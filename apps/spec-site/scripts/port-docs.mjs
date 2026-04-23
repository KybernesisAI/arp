#!/usr/bin/env node
/**
 * Port internal ARP docs from `docs/*.md` to public MDX pages under
 * `apps/spec-site/app/(spec|docs)/.../page.mdx`. Each output file gets:
 *
 *   1. A `metadata` export (Next.js App Router picks up title + desc).
 *   2. The source Markdown body, verbatim.
 *   3. A footer with the source link + last-sync date.
 *
 * MDX is a strict superset of Markdown, so most content drops in
 * unchanged. Code fences with `{...}` syntax would break MDX parsing but
 * nothing in the source docs uses that. Re-run after any `docs/*.md`
 * edit: `node apps/spec-site/scripts/port-docs.mjs`.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const DOCS_DIR = resolve(REPO_ROOT, 'docs');
const APP_DIR = resolve(__dirname, '..', 'app');

/**
 * Mapping: source doc -> output MDX path under apps/spec-site/app/.
 * Paths intentionally lean on Next's file-system routing.
 */
const MAPPINGS = [
  // RFCs — sourced from the repo-root `rfcs/` tree so the site + the repo
  // stay byte-identical.
  {
    src: '../rfcs/README.md',
    dst: 'rfcs/page.mdx',
    title: 'RFC process',
    description: 'How to propose substantive changes to the ARP protocol.',
  },
  {
    src: '../rfcs/0001-template.md',
    dst: 'rfcs/0001-template/page.mdx',
    title: 'RFC template',
    description: 'Blank template — copy this, don\'t fill it in directly.',
  },
  {
    src: '../rfcs/0002-connection-first-policy-model.md',
    dst: 'rfcs/0002-connection-first-policy-model/page.mdx',
    title: 'RFC-0002: Connection-first policy model',
    description: 'Why policy is bound to the connection between two agents, not to either agent in isolation.',
  },
  {
    src: '../rfcs/0003-did-pinned-tls-for-agent-endpoints.md',
    dst: 'rfcs/0003-did-pinned-tls-for-agent-endpoints/page.mdx',
    title: 'RFC-0003: DID-pinned TLS for agent endpoints',
    description: 'Why agent-to-agent TLS pins the cert fingerprint in the DID document rather than using Web PKI.',
  },
  {
    src: '../rfcs/0004-scope-catalog-versioning.md',
    dst: 'rfcs/0004-scope-catalog-versioning/page.mdx',
    title: 'RFC-0004: Scope catalog versioning',
    description: 'How the scope catalog evolves across releases — addition, deprecation, retirement.',
  },
  // Spec pages
  {
    src: 'ARP-architecture.md',
    dst: 'spec/v0.1/architecture/page.mdx',
    title: 'Architecture',
    description: 'The seven-layer ARP stack — identity, pairing, policy, transport, TLS, registry, audit.',
  },
  // Docs pages
  {
    src: 'ARP-getting-started.md',
    dst: 'docs/getting-started/page.mdx',
    title: 'Getting started',
    description: 'From zero to a running ARP agent in ten minutes.',
  },
  {
    src: 'ARP-installation-and-hosting.md',
    dst: 'docs/install/page.mdx',
    title: 'Install overview',
    description: 'Three install modes: local Mac, VPS, Cloud. Pick the one that matches your operating style.',
  },
  {
    src: 'ARP-example-atlas-kyberbot.md',
    dst: 'docs/install/local-mac/page.mdx',
    title: 'Install — Local (Mac)',
    description: 'Run the ARP sidecar on a Mac, wire it to KyberBot + Atlas.',
  },
  {
    src: 'ARP-example-atlas-vps.md',
    dst: 'docs/install/vps/page.mdx',
    title: 'Install — VPS',
    description: 'Run the sidecar on a sovereign VPS you control.',
  },
  {
    src: 'ARP-example-atlas-cloud.md',
    dst: 'docs/install/cloud/page.mdx',
    title: 'Install — Cloud',
    description: 'Delegate operation to ARP Cloud. Principal keys stay browser-held.',
  },
  {
    src: 'ARP-hns-resolution.md',
    dst: 'docs/hns-resolution/page.mdx',
    title: 'HNS resolution',
    description: 'How Handshake .agent names resolve in browsers, servers, and CLI tools.',
  },
  {
    src: 'ARP-scope-catalog-v1.md',
    dst: 'docs/scope-catalog/page.mdx',
    title: 'Scope catalog v1',
    description: 'The 50 reusable capability templates that make up the v1 scope catalog. Pair with the interactive viewer.',
  },
  {
    src: 'ARP-policy-examples.md',
    dst: 'docs/policies-and-cedar/page.mdx',
    title: 'Policies & Cedar',
    description: 'Worked Cedar policy examples — the 10 scenarios that shaped the PDP.',
  },
  {
    src: 'ARP-adapter-authoring-guide.md',
    dst: 'docs/adapters/page.mdx',
    title: 'Framework adapters',
    description: 'Authoring an ARP adapter for your agent framework.',
  },
];

const TODAY = new Date().toISOString().slice(0, 10);

/**
 * The source docs predate the Phase-8.5 Self.xyz demotion and still
 * reference `did:web:ian.self.xyz` as a sample principal DID. Public
 * pages must not carry those references (opener rule 7). Replace the
 * examples with the v2.1-canonical forms: `did:key:…` for browser-held
 * keys, `did:web:arp.cloud:u:<uuid>` for cloud-managed. Explanatory prose
 * about Self.xyz gets rewritten to a neutral "any DID method accepted"
 * frame that matches the current contract.
 */
const SELFXYZ_REWRITES = [
  // Example DID strings → canonical did:key form.
  [/did:web:ian\.self\.xyz/g, 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'],
  [/did:web:([a-zA-Z0-9_-]+)\.self\.xyz/g, 'did:web:arp.cloud:u:$1'],
  // Illustrative Cedar VC type identifiers — `self_xyz.verified_human`
  // was provider-specific; the PDP treats VC types as opaque strings so
  // we rename to a neutral `vc_provider.*` prefix that still reads as a
  // valid Cedar context key.
  [/self_xyz/g, 'vc_provider'],
  // Prose normalisations — neutralise remaining mentions, tuned so the
  // resulting sentences still parse in English.
  [
    /Self\.xyz SHOULD NOT be prompted for by registrar UX\.\s*/g,
    'The v2.1 registrar UX presents the two-option owner-binding chooser (browser `did:key` or ARP Cloud `did:web`). ',
  ],
  [
    /Self\.xyz is no longer a required dependency of the protocol;\s*credentials are pluggable\./g,
    'Credential providers are pluggable; the reference implementation ships no provider-specific bindings.',
  ],
  [
    /Self\.xyz integration beyond accepting a DID string \(no VC verification logic yet\)/g,
    'provider-specific VC verification logic (treat all types as opaque strings)',
  ],
  [/Self\.xyz prompts must be removed;/g, 'external-provider prompts must be removed;'],
  [/`did:web:<x>\.self\.xyz`/g, '`did:web:provider.example`'],
  [/did:web:<x>\.self\.xyz/g, 'did:web:provider.example'],
  [/Self\.xyz/g, 'the external identity provider'],
  [/self\.xyz/g, 'the external provider'],
  [/selfxyz/g, 'external-provider'],
];

function rewriteForPublic(body) {
  let out = body;
  for (const [pattern, replacement] of SELFXYZ_REWRITES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function escapeMdx(body) {
  // MDX parses `<foo>` as a JSX tag. Source docs use `<` for less-than
  // comparisons ("<20 lines") and shorthand placeholders ("<path>") inside
  // prose; neither is intended as JSX. Escape `<` → `&lt;` and `>` → `&gt;`
  // everywhere *outside* fenced code blocks and inline code spans. Inside
  // code the literal characters are preserved by the MDX grammar.
  const lines = body.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\s*```/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    lines[i] = escapeOutsideBackticks(raw);
  }
  return lines.join('\n');
}

function escapeOutsideBackticks(line) {
  let out = '';
  let inTicks = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '`') {
      inTicks = !inTicks;
      out += ch;
      continue;
    }
    if (inTicks) {
      out += ch;
      continue;
    }
    if (ch === '<') {
      out += '&lt;';
    } else if (ch === '>') {
      out += '&gt;';
    } else if (ch === '{') {
      out += '&#123;';
    } else if (ch === '}') {
      out += '&#125;';
    } else {
      out += ch;
    }
  }
  return out;
}

function stripLeadingH1(body) {
  // Strip the first `# ...` line so the `metadata.title` + our top-plate
  // render determines the page heading. Keeps TOC generation clean.
  const lines = body.split('\n');
  const firstH1 = lines.findIndex((l) => /^#\s+/.test(l));
  if (firstH1 === -1) return body;
  lines.splice(firstH1, 1);
  // Also drop any leading blank lines.
  while (lines.length && lines[0].trim() === '') lines.shift();
  return lines.join('\n');
}

function build(mapping) {
  const srcPath = resolve(DOCS_DIR, mapping.src);
  const dstPath = resolve(APP_DIR, mapping.dst);
  const source = readFileSync(srcPath, 'utf8');
  const body = escapeMdx(rewriteForPublic(stripLeadingH1(source)));

  const mdx = `export const metadata = {
  title: ${JSON.stringify(mapping.title)},
  description: ${JSON.stringify(mapping.description)},
};

# ${mapping.title}

${body}

---

<div className="mt-16 border-t border-rule pt-6 font-mono text-kicker uppercase tracking-[0.14em] text-muted">
  Source: <a href="https://github.com/KybernesisAI/arp/blob/main/docs/${mapping.src}">docs/${mapping.src}</a>
  {' · '}Ported ${TODAY}
</div>
`;

  mkdirSync(dirname(dstPath), { recursive: true });
  writeFileSync(dstPath, mdx, 'utf8');
  console.log(`  ${mapping.src} → app/${mapping.dst}`);
}

console.log('Porting internal docs to MDX…');
for (const m of MAPPINGS) build(m);
console.log(`Done. ${MAPPINGS.length} files written.`);
