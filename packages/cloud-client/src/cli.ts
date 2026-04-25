#!/usr/bin/env node
/**
 * `arp-cloud-client` CLI.
 *
 *   init              — interactive setup, writes config.json + private.key
 *   start             — run in foreground (systemd-friendly)
 *   install-service   — emit a systemd unit / launchd plist for the OS
 *   status            — print config path + last-known state
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, argv, exit } from 'node:process';
import {
  defaultConfigDir,
  defaultConfigPath,
  loadConfig,
  writeConfigFile,
  writePrivateKey,
  expandHome,
} from './config.js';
import { createCloudClient } from './client.js';

async function cmdInit(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const defaultKeyPath = join(defaultConfigDir(), 'private.key');
    const cloud = (await rl.question('Cloud WS URL [wss://cloud.arp.run/ws]: ')).trim() || 'wss://cloud.arp.run/ws';
    const did = (await rl.question('Agent DID (e.g. did:web:samantha.agent): ')).trim();
    if (!did) throw new Error('agent DID required');
    const localUrl = (await rl.question('Local agent URL [http://127.0.0.1:4500]: ')).trim() || 'http://127.0.0.1:4500';
    const keyPath = (await rl.question(`Private key path [${defaultKeyPath}]: `)).trim() || defaultKeyPath;

    const existing = existsSync(expandHome(keyPath));
    if (!existing) {
      const { utils, getPublicKeyAsync } = await import('@noble/ed25519');
      const priv = utils.randomPrivateKey();
      writePrivateKey(expandHome(keyPath), priv);
      const pub = await getPublicKeyAsync(priv);
      // eslint-disable-next-line no-console
      console.log(`\nNew private key written to ${keyPath} (mode 0600)`);
      // eslint-disable-next-line no-console
      console.log(`Public key (raw hex): ${Buffer.from(pub).toString('hex')}`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`\nUsing existing private key at ${keyPath}`);
    }

    writeConfigFile(defaultConfigPath(), {
      cloud_ws_url: cloud,
      agent_did: did,
      agent_api_url: localUrl,
      private_key_path: keyPath,
    });
    // eslint-disable-next-line no-console
    console.log(`\nConfig written to ${defaultConfigPath()}`);
    // eslint-disable-next-line no-console
    console.log(`Run with: npx @kybernesis/arp-cloud-client start`);
  } finally {
    rl.close();
  }
}

async function cmdStart(): Promise<void> {
  const cfg = loadConfig();
  const client = createCloudClient({
    cloudWsUrl: cfg.cloud_ws_url,
    agentDid: cfg.agent_did,
    agentPrivateKey: cfg.privateKey,
    agentApiUrl: cfg.agent_api_url,
    onStateChange: (s) => {
      // eslint-disable-next-line no-console
      console.log(`[arp-cloud-client] state=${s}`);
    },
    onError: (err) => {
      // eslint-disable-next-line no-console
      console.error(`[arp-cloud-client] error: ${err.message}`);
    },
    onInboundDelivered: (messageId, msgId) => {
      // eslint-disable-next-line no-console
      console.log(`[arp-cloud-client] delivered ${msgId} (${messageId})`);
    },
  });
  // eslint-disable-next-line no-console
  console.log(`[arp-cloud-client] agent=${cfg.agent_did} → ${cfg.cloud_ws_url}`);
  const stopAndExit = async () => {
    await client.stop();
    exit(0);
  };
  process.on('SIGINT', () => void stopAndExit());
  process.on('SIGTERM', () => void stopAndExit());
}

function cmdStatus(): void {
  const path = defaultConfigPath();
  if (!existsSync(path)) {
    // eslint-disable-next-line no-console
    console.log(`no config at ${path}`);
    return;
  }
  const cfg = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ config_path: path, ...cfg }, null, 2));
}

function cmdInstallService(): void {
  const which = platform();
  if (which === 'linux') {
    const unit = `[Unit]
Description=ARP Cloud Client
After=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/env npx -y @kybernesis/arp-cloud-client start
Restart=on-failure
RestartSec=5s
User=${process.env['USER'] ?? 'root'}
Environment=HOME=${homedir()}

[Install]
WantedBy=multi-user.target
`;
    const path = join(defaultConfigDir(), 'arp-cloud-client.service');
    writeFileSync(path, unit, 'utf8');
    // eslint-disable-next-line no-console
    console.log(
      `Wrote systemd unit to ${path}\nInstall:\n  sudo cp ${path} /etc/systemd/system/\n  sudo systemctl enable --now arp-cloud-client`,
    );
  } else if (which === 'darwin') {
    const label = 'com.kybernesis.arp-cloud-client';
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>npx</string>
    <string>-y</string>
    <string>@kybernesis/arp-cloud-client</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardErrorPath</key>
  <string>${join(defaultConfigDir(), 'stderr.log')}</string>
  <key>StandardOutPath</key>
  <string>${join(defaultConfigDir(), 'stdout.log')}</string>
</dict>
</plist>
`;
    const path = join(defaultConfigDir(), `${label}.plist`);
    writeFileSync(path, plist, 'utf8');
    // eslint-disable-next-line no-console
    console.log(
      `Wrote launchd plist to ${path}\nInstall:\n  launchctl load ${path}\n  launchctl start ${label}`,
    );
  } else {
    // eslint-disable-next-line no-console
    console.error(`install-service is not yet supported on ${which}`);
    exit(1);
  }
}

async function main(): Promise<void> {
  const cmd = argv[2] ?? 'help';
  try {
    switch (cmd) {
      case 'init':
        await cmdInit();
        break;
      case 'start':
        await cmdStart();
        break;
      case 'status':
        cmdStatus();
        break;
      case 'install-service':
        cmdInstallService();
        break;
      case 'help':
      case '--help':
      case '-h':
      default:
        // eslint-disable-next-line no-console
        console.log(`arp-cloud-client <command>
  init              Initialize config + private key
  start             Run in foreground
  status            Print current config
  install-service   Emit a systemd or launchd unit
`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error((err as Error).message);
    exit(1);
  }
}

void main();
