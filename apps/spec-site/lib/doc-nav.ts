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
 */
export const DOCS_NAV: DocNavGroup[] = [
  {
    kicker: 'START',
    items: [
      { title: 'Getting started', href: '/docs/getting-started' },
      { title: 'Example setup', href: '/docs/example-setup' },
      { title: 'HNS resolution', href: '/docs/hns-resolution' },
    ],
  },
  {
    kicker: 'INSTALL',
    items: [
      { title: 'Install overview', href: '/docs/install' },
      { title: 'Local (Mac)', href: '/docs/install/local-mac' },
      { title: 'VPS', href: '/docs/install/vps' },
      { title: 'Cloud', href: '/docs/install/cloud' },
    ],
  },
  {
    kicker: 'BUILD',
    items: [
      { title: 'SDKs', href: '/docs/sdks' },
      { title: 'Adapters', href: '/docs/adapters' },
      { title: 'Policies & Cedar', href: '/docs/policies-and-cedar' },
      { title: 'Scope catalog', href: '/scope-catalog' },
      { title: 'Mobile', href: '/docs/mobile' },
    ],
  },
];
