import type { DocNavGroup } from '@/components/DocShell';

/**
 * Sidebar navigation for /spec/v0.1/*.
 *
 * The spec is the normative contract — what implementers must honor to be
 * ARP-compliant. Headless (the .agent TLD operator) reads registrar-
 * integration for the v2.1 amendment.
 */
export const SPEC_NAV: DocNavGroup[] = [
  {
    kicker: 'OVERVIEW',
    items: [
      { title: 'Overview', href: '/spec/v0.1/overview' },
      { title: 'Architecture', href: '/spec/v0.1/architecture' },
    ],
  },
  {
    kicker: 'PROTOCOL LAYERS',
    items: [
      { title: 'Identity', href: '/spec/v0.1/identity' },
      { title: 'Pairing', href: '/spec/v0.1/pairing' },
      { title: 'Policy', href: '/spec/v0.1/policy' },
      { title: 'Transport', href: '/spec/v0.1/transport' },
      { title: 'TLS pinning', href: '/spec/v0.1/tls-pinning' },
    ],
  },
  {
    kicker: 'INTEGRATION',
    items: [
      {
        title: 'Registrar integration (v2.1)',
        href: '/spec/v0.1/registrar-integration',
      },
    ],
  },
];

/**
 * Sidebar navigation for /docs/*.
 *
 * Two clearly-separated audiences live in this sidebar:
 *
 * USER GUIDE — for people USING ARP (downloading, installing, pairing,
 * sharing memory). Concise, plain-English, no Cedar / DIDComm / DID
 * details unless they help the user understand consent.
 *
 * DEVELOPER — for people BUILDING with ARP (writing adapters,
 * integrating from a framework, deploying a runtime, contributing).
 * Technical depth lives here.
 *
 * The URL paths stay flat under /docs/* for stability; the sidebar
 * grouping is what tells users which audience a page is for.
 */
export const DOCS_NAV: DocNavGroup[] = [
  // ────────────────────────────────────────────── USER GUIDE
  {
    kicker: '◆ USER GUIDE',
    items: [
      { title: 'Welcome', href: '/docs/welcome' },
      { title: 'Quick start', href: '/docs/quickstart' },
      { title: 'Example setup', href: '/docs/example-setup' },
    ],
  },
  {
    kicker: 'CONCEPTS',
    items: [
      { title: 'Identity', href: '/docs/concepts/identity' },
      { title: 'Connections', href: '/docs/concepts/connections' },
      { title: 'Scopes & policies', href: '/docs/concepts/scopes-and-policies' },
      { title: 'Memory & tagging', href: '/docs/concepts/memory-tagging' },
      { title: 'Audit & verification', href: '/docs/concepts/audit' },
    ],
  },
  {
    kicker: 'GUIDES',
    items: [
      { title: 'Pair with another agent', href: '/docs/guides/pair' },
      { title: 'Tag memories for sharing', href: '/docs/guides/tag-memories' },
      { title: 'Edit or revoke a connection', href: '/docs/guides/edit-connection' },
    ],
  },
  {
    kicker: 'REFERENCE',
    items: [
      { title: 'Scope catalog', href: '/scope-catalog' },
      { title: 'Troubleshooting', href: '/docs/troubleshooting' },
    ],
  },

  // ────────────────────────────────────────────── DEVELOPER
  {
    kicker: '◆ DEVELOPER',
    items: [
      { title: 'Architecture', href: '/spec/v0.1/architecture' },
      { title: 'Spec', href: '/spec/v0.1/overview' },
    ],
  },
  {
    kicker: 'BUILD',
    items: [
      { title: 'SDKs', href: '/docs/sdks' },
      { title: 'Framework adapters', href: '/docs/adapters' },
      { title: 'Policies & Cedar', href: '/docs/policies-and-cedar' },
      { title: 'Scope catalog (internal)', href: '/docs/scope-catalog' },
    ],
  },
  {
    kicker: 'DEPLOY',
    items: [
      { title: 'Install overview', href: '/docs/install' },
      { title: 'Local (Mac)', href: '/docs/install/local-mac' },
      { title: 'VPS', href: '/docs/install/vps' },
      { title: 'Cloud (self-host)', href: '/docs/install/cloud' },
    ],
  },
  {
    kicker: 'PLATFORM',
    items: [
      { title: 'HNS resolution', href: '/docs/hns-resolution' },
      { title: 'Mobile', href: '/docs/mobile' },
    ],
  },
  {
    kicker: 'CONTRIBUTE',
    items: [
      { title: 'RFCs', href: '/rfcs' },
    ],
  },
];
