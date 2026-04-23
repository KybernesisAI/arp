import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts', 'src/index.ts'],
  format: ['esm'],
  dts: { entry: 'src/index.ts' },
  clean: true,
  sourcemap: true,
  target: 'es2022',
  outDir: 'dist',
  splitting: false,
  banner: { js: '#!/usr/bin/env node' },
});
