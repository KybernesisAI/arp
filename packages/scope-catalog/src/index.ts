/**
 * @kybernesis/arp-scope-catalog — scope catalog v1 + compiler.
 *
 * Loads the 50-scope YAML source of truth, emits the public manifest, and
 * compiles scope templates (or bundles) into Cedar policy strings.
 */

export { loadScopeFile, loadScopesFromDirectory, ScopeLoadError } from './loader.js';
export {
  canonicalize,
  sha256Hex,
  buildCatalogManifest,
  type BuildManifestOptions,
} from './catalog-manifest.js';
export {
  compileScope,
  ScopeCompileError,
  type CompileScopeOptions,
} from './compiler.js';
export {
  compileBundle,
  BundleCompileError,
  type CompileBundleInput,
  type CompiledBundle,
} from './bundle-compiler.js';
export { BUNDLES, findBundle, type BundleDefinition } from './bundles.js';
