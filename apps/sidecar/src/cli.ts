import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Command } from 'commander';
import { verifyAuditChain } from '@kybernesis/arp-audit';
import { bootstrap } from './bootstrap.js';
import { checkHealth } from './health.js';
import { log } from './log.js';
import { spawnOwnerApp, type SpawnedOwnerApp } from './owner-app.js';
import { startSidecarRuntime } from './runtime.js';
import { installService, uninstallService } from './service-install.js';

const DEFAULT_HANDOFF = '/config/handoff.json';
const DEFAULT_DATA_DIR = '/data';
const DEFAULT_PORT = 443;

const program = new Command();

program
  .name('arp-sidecar')
  .description('ARP sidecar — packaged runtime for Kybernesis agents')
  .version('0.1.0');

program
  .command('init')
  .description('Validate the handoff bundle and prepare first-boot state without starting the server')
  .option('--handoff <path>', 'path to handoff.json', DEFAULT_HANDOFF)
  .option('--data-dir <path>', 'persistent data directory', DEFAULT_DATA_DIR)
  .action(async (opts: { handoff: string; dataDir: string }) => {
    const handoffPath = resolve(opts.handoff);
    if (!existsSync(handoffPath)) {
      fail(`handoff not found: ${handoffPath}`);
    }
    try {
      const result = await bootstrap({ handoffPath, dataDir: opts.dataDir });
      process.stdout.write(
        JSON.stringify(
          {
            ok: true,
            did: result.handoff.agent_did,
            principal_did: result.handoff.principal_did,
            public_key_multibase: result.publicKeyMultibase,
            cert_fingerprint: result.tlsFingerprint,
            first_boot: result.firstBoot,
            data_dir: opts.dataDir,
          },
          null,
          2,
        ) + '\n',
      );
      process.exit(0);
    } catch (err) {
      fail((err as Error).message);
    }
  });

program
  .command('start')
  .description('Boot the agent: run first-boot bootstrap, then listen for DIDComm traffic')
  .option('--handoff <path>', 'path to handoff.json', DEFAULT_HANDOFF)
  .option('--data-dir <path>', 'persistent data directory', DEFAULT_DATA_DIR)
  .option('--port <number>', 'HTTP port', String(DEFAULT_PORT))
  .option('--host <hostname>', 'bind hostname', '0.0.0.0')
  .option('--owner-app-dir <path>', 'path to the built owner-app standalone bundle')
  .option('--owner-app-port <number>', 'local port for the owner-app child process', '3080')
  .option(
    '--owner-subdomain <host>',
    'host suffix for owner-subdomain routing (e.g. "ian.samantha.agent")',
  )
  .action(
    async (opts: {
      handoff: string;
      dataDir: string;
      port: string;
      host: string;
      ownerAppDir?: string;
      ownerAppPort?: string;
      ownerSubdomain?: string;
    }) => {
      const handoffPath = resolve(opts.handoff);
      if (!existsSync(handoffPath)) fail(`handoff not found: ${handoffPath}`);
      const port = Number(opts.port);
      if (!Number.isFinite(port) || port <= 0) fail(`invalid --port: ${opts.port}`);

      try {
        const boot = await bootstrap({ handoffPath, dataDir: opts.dataDir });

        const adminToken = process.env.ARP_ADMIN_TOKEN;
        let ownerApp: SpawnedOwnerApp | null = null;

        if (opts.ownerAppDir) {
          if (!adminToken) {
            fail(
              'ARP_ADMIN_TOKEN must be set when --owner-app-dir is provided (the owner app uses it to call /admin/*).',
            );
          }
          const ownerPort = Number(opts.ownerAppPort ?? 3080);
          if (!Number.isFinite(ownerPort) || ownerPort <= 0) {
            fail(`invalid --owner-app-port: ${opts.ownerAppPort}`);
          }
          ownerApp = await spawnOwnerApp({
            dir: resolve(opts.ownerAppDir),
            port: ownerPort,
            adminToken: adminToken!,
            runtimeUrl: `http://127.0.0.1:${port}`,
            agentDid: boot.handoff.agent_did,
            principalDid: boot.handoff.principal_did,
            ownerAppBaseUrl:
              process.env.ARP_OWNER_APP_BASE_URL ??
              deriveOwnerBaseUrl(boot.handoff.agent_did, opts.ownerSubdomain),
            sessionSecret:
              process.env.ARP_SESSION_SECRET ??
              'sidecar-default-session-secret-000000000000',
          });
        }

        const started = await startSidecarRuntime({
          bootstrap: boot,
          dataDir: opts.dataDir,
          port,
          hostname: opts.host,
          ...(adminToken ? { adminToken } : {}),
          ...(ownerApp
            ? {
                ownerApp: {
                  target: ownerApp.url,
                  ...(opts.ownerSubdomain
                    ? { hostSuffixes: [opts.ownerSubdomain] }
                    : {}),
                },
              }
            : {}),
        });

        process.stdout.write(
          `arp-sidecar ready did=${boot.handoff.agent_did} port=${started.port} fp=${boot.tlsFingerprint} handoff_version=${boot.handoff.cert_expires_at}${ownerApp ? ` owner_app=${ownerApp.url}` : ''}\n`,
        );

        registerSignals(async (signal) => {
          const graceMs = signal === 'SIGINT' ? 1000 : 5000;
          log().info({ signal, grace_ms: graceMs }, 'shutting down');
          try {
            await started.runtime.stop({ graceMs });
          } catch (err) {
            log().error({ err: (err as Error).message }, 'stop failed');
          }
          if (ownerApp) {
            try {
              await ownerApp.stop();
            } catch (err) {
              log().error({ err: (err as Error).message }, 'owner-app stop failed');
            }
          }
        });
      } catch (err) {
        fail((err as Error).message);
      }
    },
  );

function deriveOwnerBaseUrl(agentDid: string, ownerSubdomain?: string): string {
  const host = agentDid.startsWith('did:web:')
    ? agentDid.slice('did:web:'.length)
    : 'owner.agent';
  if (ownerSubdomain) return `https://${ownerSubdomain}`;
  return `https://owner.${host}`;
}

program
  .command('status')
  .description('Call /health on the running sidecar')
  .option('--host <hostname>', 'target host', '127.0.0.1')
  .option('--port <number>', 'target port', String(DEFAULT_PORT))
  .action(async (opts: { host: string; port: string }) => {
    const port = Number(opts.port);
    if (!Number.isFinite(port) || port <= 0) fail(`invalid --port: ${opts.port}`);
    const res = await checkHealth({ host: opts.host, port, timeoutMs: 3000 });
    if (!res) {
      process.stderr.write('unhealthy: no response within 3s\n');
      process.exit(1);
    }
    process.stdout.write(JSON.stringify(res, null, 2) + '\n');
    process.exit(0);
  });

program
  .command('logs')
  .description('Tail the audit + process log')
  .option('--data-dir <path>', 'persistent data directory', DEFAULT_DATA_DIR)
  .option('--follow', 'follow', true)
  .action((opts: { dataDir: string; follow: boolean }) => {
    const auditDir = join(opts.dataDir, 'audit');
    if (!existsSync(auditDir)) {
      process.stderr.write(
        `no audit logs yet at ${auditDir} — the sidecar has not booted, or no DIDComm traffic arrived.\n`,
      );
    }
    // In Docker: process logs come from `docker logs`. On systemd: `journalctl
    // -u arp-sidecar -f`. `arp-sidecar logs` is the one-command form that tails
    // the JSONL audit files from the mounted data volume.
    const args = opts.follow ? ['-F', '-n', '100'] : ['-n', '100'];
    const glob = join(auditDir, '*.jsonl');
    const child = spawn('sh', ['-c', `tail ${args.join(' ')} ${glob}`], {
      stdio: 'inherit',
    });
    child.on('exit', (code) => process.exit(code ?? 0));
  });

const audit = program.command('audit').description('Audit log operations');
audit
  .command('verify')
  .description('Verify the hash-chain of one or more connection audit logs')
  .argument('[connection_id]', 'optional connection ID; verifies all logs when omitted')
  .option('--data-dir <path>', 'persistent data directory', DEFAULT_DATA_DIR)
  .action((connectionId: string | undefined, opts: { dataDir: string }) => {
    const auditDir = join(opts.dataDir, 'audit');
    if (!existsSync(auditDir)) {
      process.stderr.write(`no audit dir at ${auditDir}\n`);
      process.exit(1);
    }
    if (connectionId) {
      const path = join(auditDir, `${connectionId}.jsonl`);
      const result = verifyAuditChain(path);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(result.valid ? 0 : 1);
    }
    // Verify every .jsonl under auditDir.
    const files = readdirSync(auditDir).filter((f) => f.endsWith('.jsonl'));
    let allValid = true;
    const summary: Array<{ connection_id: string; valid: boolean; entries: number; error?: string }> = [];
    for (const f of files) {
      const result = verifyAuditChain(join(auditDir, f));
      const entry: { connection_id: string; valid: boolean; entries: number; error?: string } = {
        connection_id: f.replace(/\.jsonl$/, ''),
        valid: result.valid,
        entries: result.entriesSeen,
      };
      if (!result.valid && result.error) entry.error = result.error;
      summary.push(entry);
      if (!result.valid) allValid = false;
    }
    process.stdout.write(JSON.stringify({ ok: allValid, chains: summary }, null, 2) + '\n');
    process.exit(allValid ? 0 : 1);
  });

program
  .command('install-service')
  .description('Install the systemd unit (Linux-only; requires root)')
  .option('--handoff <path>', 'path to handoff.json to copy into /etc/arp-sidecar/')
  .action((opts: { handoff?: string }) => {
    try {
      installService(opts.handoff ? { handoffSource: resolve(opts.handoff) } : {});
      process.exit(0);
    } catch (err) {
      fail((err as Error).message);
    }
  });

program
  .command('uninstall-service')
  .description('Remove the systemd unit + binary; preserves /var/lib/arp-sidecar')
  .action(() => {
    try {
      uninstallService();
      process.exit(0);
    } catch (err) {
      fail((err as Error).message);
    }
  });

/* --------------------------- signal handling -------------------------- */

function registerSignals(onStop: (signal: 'SIGTERM' | 'SIGINT') => Promise<void>): void {
  let stopping = false;
  const stop = (signal: 'SIGTERM' | 'SIGINT') => {
    if (stopping) return;
    stopping = true;
    void (async () => {
      try {
        await onStop(signal);
      } finally {
        process.exit(0);
      }
    })();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

function fail(msg: string): never {
  process.stderr.write(`arp-sidecar: ${msg}\n`);
  process.exit(1);
}

program.parseAsync(process.argv).catch((err: unknown) => {
  fail((err as Error).stack ?? String(err));
});
