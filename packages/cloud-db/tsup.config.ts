import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/schema.ts', 'src/pglite.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
});
