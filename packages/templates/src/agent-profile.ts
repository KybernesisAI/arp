/**
 * AgentID S6c — the public identity profile document.
 *
 * Served at `https://<sld>.agent<mirror-suffix>/.well-known/agent-profile.json`
 * and listed in the identity document as the `AgentProfile` service. One
 * document any consumer (Buzz, the control plane, a directory, a nostr
 * client) reads to learn how the agent presents itself: name, description,
 * picture, accent, NIP-05 handle and the verified links.
 */

export interface AgentProfileLink {
  kind: 'nostr' | 'kybernesis' | 'runtime' | 'web';
  value: string;
  verified_at: string | null;
}

export interface BuildAgentProfileInput {
  did: string;
  /** The `.agent` handle without the suffix, e.g. `kyber`. */
  handle: string;
  name: string;
  description: string;
  /** Absolute URL of the picture, or null when the identity has none. */
  picture: string | null;
  /** Hex colour like `#10b981`, or null. */
  accent: string | null;
  /** Public page for people. */
  profileUrl: string;
  /** The origin the profile document itself is served from. */
  origin: string;
  links: readonly AgentProfileLink[];
  updatedAt: string;
}

export interface AgentProfileDocument {
  schema_version: '1.0';
  did: string;
  handle: string;
  domain: string;
  name: string;
  description: string;
  picture: string | null;
  accent: string | null;
  /** `_@<sld>.agent` when a Buzz/nostr key is verified for this name. */
  nip05: string | null;
  profile_url: string;
  identity_document: string;
  agent_card: string;
  links: AgentProfileLink[];
  updated_at: string;
}

export function buildAgentProfileDocument(input: BuildAgentProfileInput): AgentProfileDocument {
  const origin = input.origin.replace(/\/+$/, '');
  const domain = `${input.handle}.agent`;
  const hasNostr = input.links.some((l) => l.kind === 'nostr' && l.verified_at);
  return {
    schema_version: '1.0',
    did: input.did,
    handle: input.handle,
    domain,
    name: input.name,
    description: input.description,
    picture: input.picture,
    accent: input.accent,
    nip05: hasNostr ? `_@${domain}` : null,
    profile_url: input.profileUrl,
    identity_document: `${origin}/.well-known/did.json`,
    agent_card: `${origin}/.well-known/agent-card.json`,
    links: input.links.map((l) => ({ kind: l.kind, value: l.value, verified_at: l.verified_at })),
    updated_at: input.updatedAt,
  };
}

/** `<origin>/avatar.png` when the identity has a picture, else null. */
export function agentAvatarUrl(origin: string, hasPicture: boolean): string | null {
  return hasPicture ? `${origin.replace(/\/+$/, '')}/avatar.png` : null;
}

/** `<origin>/.well-known/agent-profile.json`. */
export function agentProfileUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/.well-known/agent-profile.json`;
}
