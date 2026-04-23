/**
 * @kybernesis/arp-create-adapter — programmatic API.
 *
 * Public entry point for embedding the scaffolder (e.g. in a monorepo
 * bootstrap script). The CLI (`src/cli.ts`) wraps this.
 */

export { scaffoldAdapter } from './scaffold.js';
export type {
  ScaffoldOptions,
  ScaffoldResult,
  SupportedLanguage,
} from './scaffold.js';
