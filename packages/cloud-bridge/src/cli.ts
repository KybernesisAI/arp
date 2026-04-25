#!/usr/bin/env node
/**
 * arp-cloud-bridge CLI.
 *
 * Connects an ARP-provisioned agent (handoff JSON from cloud.arp.run)
 * to a locally running agent framework (KyberBot, OpenClaw, Hermes,
 * generic HTTP). The agent framework is **not modified** — the bridge
 * speaks each framework's existing native API.
 *
 * Usage:
 *
 *   npx @kybernesis/arp-cloud-bridge \
 *     --handoff ~/atlas/arp-handoff.json \
 *     --target kyberbot \
 *     --kyberbot-root ~/atlas
 *
 *   npx @kybernesis/arp-cloud-bridge \
 *     --handoff ~/myagent/handoff.json \
 *     --target generic-http \
 *     --url http://127.0.0.1:8080/arp \
 *     --token sk-...
 */

import { startBridge } from './bridge.js';
import { createKyberBotAdapter } from './adapters/kyberbot.js';
import { createGenericHttpAdapter } from './adapters/generic-http.js';
import type { Adapter } from './types.js';

interface Flags {
  handoff?: string;
  target?: 'kyberbot' | 'generic-http';
  cloudWsUrl?: string;
  // kyberbot
  kyberbotRoot?: string;
  kyberbotBaseUrl?: string;
  kyberbotToken?: string;
  // generic-http
  url?: string;
  token?: string;
  // misc
  help?: boolean;
  version?: boolean;
}

function parse(argv: string[]): Flags {
  const f: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = (): string | undefined => argv[++i];
    switch (a) {
      case '--handoff':
        f.handoff = next();
        break;
      case '--target':
        f.target = next() as Flags['target'];
        break;
      case '--cloud-ws-url':
        f.cloudWsUrl = next();
        break;
      case '--kyberbot-root':
        f.kyberbotRoot = next();
        f.target = f.target ?? 'kyberbot';
        break;
      case '--kyberbot-base-url':
        f.kyberbotBaseUrl = next();
        break;
      case '--kyberbot-token':
        f.kyberbotToken = next();
        break;
      case '--url':
        f.url = next();
        f.target = f.target ?? 'generic-http';
        break;
      case '--token':
        f.token = next();
        break;
      case '-h':
      case '--help':
        f.help = true;
        break;
      case '-v':
      case '--version':
        f.version = true;
        break;
      default:
        // eslint-disable-next-line no-console
        console.error(`unknown flag: ${a}`);
        process.exit(2);
    }
  }
  return f;
}

const HELP = `arp-cloud-bridge — connect a cloud-provisioned ARP agent to a locally running agent framework.

Usage:
  arp-cloud-bridge --handoff <path> --target <kind> [adapter options]

Common flags:
  --handoff <path>          Path to the handoff JSON downloaded from cloud.arp.run.
  --target kyberbot|generic-http
                            Which adapter to load. Defaults to "kyberbot" if --kyberbot-root
                            is given, "generic-http" if --url is given.
  --cloud-ws-url <url>      Override the WS URL embedded in the handoff (debugging only).
  -h, --help                Show this help.
  -v, --version             Print version and exit.

KyberBot adapter:
  --kyberbot-root <dir>     Path to the agent home folder (e.g. ~/atlas). The bridge reads
                            server.port from identity.yaml and KYBERBOT_API_TOKEN from .env.
  --kyberbot-base-url <url> Override base URL (default: http://127.0.0.1:<server.port>).
  --kyberbot-token <tok>    Override API token (default: KYBERBOT_API_TOKEN from .env).

Generic HTTP adapter (any framework with a simple POST endpoint):
  --url <url>               Endpoint to POST inbound prompts to.
  --token <tok>             Optional bearer token (sent as Authorization: Bearer ...).

Examples:
  arp-cloud-bridge --handoff ~/atlas/arp-handoff.json --kyberbot-root ~/atlas
  arp-cloud-bridge --handoff ~/agent/handoff.json --url http://127.0.0.1:9090/arp
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flags = parse(argv);

  if (flags.help) {
    process.stdout.write(HELP);
    return;
  }
  if (flags.version) {
    // eslint-disable-next-line no-console
    console.log('@kybernesis/arp-cloud-bridge 0.1.0');
    return;
  }
  if (!flags.handoff) {
    // eslint-disable-next-line no-console
    console.error('error: --handoff is required\n');
    process.stdout.write(HELP);
    process.exit(2);
  }
  if (!flags.target) {
    // eslint-disable-next-line no-console
    console.error('error: --target is required (kyberbot | generic-http)\n');
    process.stdout.write(HELP);
    process.exit(2);
  }

  let adapter: Adapter;
  if (flags.target === 'kyberbot') {
    if (!flags.kyberbotRoot) {
      // eslint-disable-next-line no-console
      console.error('error: --kyberbot-root is required when --target kyberbot');
      process.exit(2);
    }
    adapter = createKyberBotAdapter({
      root: flags.kyberbotRoot,
      ...(flags.kyberbotBaseUrl ? { baseUrl: flags.kyberbotBaseUrl } : {}),
      ...(flags.kyberbotToken ? { apiToken: flags.kyberbotToken } : {}),
    });
  } else if (flags.target === 'generic-http') {
    if (!flags.url) {
      // eslint-disable-next-line no-console
      console.error('error: --url is required when --target generic-http');
      process.exit(2);
    }
    adapter = createGenericHttpAdapter({
      url: flags.url,
      ...(flags.token ? { token: flags.token } : {}),
    });
  } else {
    // eslint-disable-next-line no-console
    console.error(`error: unknown --target ${flags.target}`);
    process.exit(2);
  }

  // eslint-disable-next-line no-console
  console.log(`[bridge] starting · adapter=${adapter.name} · handoff=${flags.handoff}`);
  const bridge = await startBridge({
    handoffPath: flags.handoff!,
    adapter,
    ...(flags.cloudWsUrl ? { cloudWsUrl: flags.cloudWsUrl } : {}),
  });

  // eslint-disable-next-line no-console
  console.log('─────────────────────────────────────────────');
  // eslint-disable-next-line no-console
  console.log(`[bridge] agent did:    ${bridge.agentDid}`);
  // eslint-disable-next-line no-console
  console.log(`[bridge] gateway:      ${bridge.gatewayWsUrl}`);
  // eslint-disable-next-line no-console
  console.log(`[bridge] adapter:      ${bridge.adapterName}`);
  // eslint-disable-next-line no-console
  console.log('─────────────────────────────────────────────');

  const shutdown = async (sig: string) => {
    // eslint-disable-next-line no-console
    console.log(`\n[bridge] ${sig} received, shutting down`);
    await bridge.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[bridge] fatal:', err);
  process.exit(1);
});
