import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
    http: 'src/http.ts',
  },
  format: ['esm', 'cjs'],
  dts: { entry: { index: 'src/index.ts', http: 'src/http.ts' } },
  clean: true,
  sourcemap: true,
  target: 'es2022',
  outDir: 'dist',
  splitting: false,
  treeshake: true,
});
