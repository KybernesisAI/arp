import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts', 'src/skill-templates.ts'],
  format: ['esm'],
  dts: { entry: 'src/skill-templates.ts' },
  sourcemap: true,
  clean: true,
  target: 'node22',
  shims: true,
});
