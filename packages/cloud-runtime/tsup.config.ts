import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
  // Inline the scope catalog JSON so the dispatch's action-map module
  // works in pnpm-deploy'd flattened production images where dynamic
  // package resolution can't reliably find generated/scopes.json. The
  // package itself stays a workspace dep — only the JSON is bundled.
  noExternal: ['@kybernesis/arp-scope-catalog'],
});
