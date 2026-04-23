#!/usr/bin/env node
/**
 * `create-arp-adapter` CLI.
 *
 *   npx @kybernesis/arp-create-adapter \
 *     --framework my-framework \
 *     --language ts \
 *     --out ./adapters/my-framework
 */

import { Command } from 'commander';
import { resolve } from 'node:path';
import { scaffoldAdapter, type SupportedLanguage } from './scaffold.js';

const program = new Command();

program
  .name('create-arp-adapter')
  .description('Scaffold a conformance-passing ARP framework adapter.')
  .requiredOption('-f, --framework <slug>', 'Framework slug (kebab-case), e.g. "my-framework"')
  .option('-n, --name <name>', 'Display name (e.g. "My Framework"). Defaults to title-cased slug.')
  .requiredOption('-l, --language <ts|python>', 'Target language', 'ts')
  .option('-o, --out <path>', 'Destination directory (default ./adapters/<slug>)')
  .option('--arp-version <range>', 'ARP spec/SDK version range', '^0.1.0')
  .option('--force', 'Overwrite existing files', false)
  .action(async (opts: {
    framework: string;
    name?: string;
    language: string;
    out?: string;
    arpVersion: string;
    force: boolean;
  }) => {
    if (opts.language !== 'ts' && opts.language !== 'python') {
      // eslint-disable-next-line no-console
      console.error(`--language must be "ts" or "python", got "${opts.language}"`);
      process.exit(1);
    }
    const out = resolve(process.cwd(), opts.out ?? `./adapters/${opts.framework}`);
    try {
      const result = await scaffoldAdapter({
        framework: opts.framework,
        ...(opts.name ? { displayName: opts.name } : {}),
        language: opts.language as SupportedLanguage,
        out,
        arpVersion: opts.arpVersion,
        force: opts.force,
      });
      // eslint-disable-next-line no-console
      console.log(result.summary);
      if (result.skippedFiles.length > 0) {
        // eslint-disable-next-line no-console
        console.log('\nSkipped (use --force to overwrite):');
        for (const f of result.skippedFiles) {
          // eslint-disable-next-line no-console
          console.log(`  ${f}`);
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('create-arp-adapter failed:', (err as Error).message);
      process.exit(2);
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(3);
});
