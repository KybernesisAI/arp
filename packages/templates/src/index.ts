/**
 * @kybernesis/arp-templates — pure document builders.
 *
 * Every exported function takes typed input, constructs the canonical ARP
 * shape, validates the result against the matching Zod schema from
 * `@kybernesis/arp-spec`, and returns the validated object. Validation
 * failure throws `TemplateValidationError`.
 *
 * These functions are stateless: no filesystem, no network, no clock reads
 * beyond optional defaults documented per function.
 */

export * from './util.js';
export * from './did-document.js';
export * from './agent-card.js';
export * from './arp-json.js';
export * from './representation-vc.js';
export * from './revocations.js';
export * from './handoff-bundle.js';
