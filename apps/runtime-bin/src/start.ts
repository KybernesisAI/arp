import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyAuditChain } from '@kybernesis/arp-audit';
import { createResolver } from '@kybernesis/arp-resolver';
import { createRuntime, type RuntimeConfig } from '@kybernesis/arp-runtime';
import { generateAgentCert } from '@kybernesis/arp-tls';
import { createFileKeyStore } from '@kybernesis/arp-transport';
import { loadBinConfig, resolveCedarSchema, type BinConfig } from './config.js';

/** Boot the reference agent. Returns the runtime handle so the shutdown hook
 *  can drain it cleanly. */
export async function startRuntime(binConfig: BinConfig) {
  const { handoff } = binConfig;
  const runtimeConfig: RuntimeConfig = {
    did: handoff.agent_did,
    principalDid: handoff.principal_did,
    publicKeyMultibase: handoff.public_key_multibase,
    wellKnownUrls: {
      didcomm: `${handoff.well_known_urls.did.replace(/\.well-known\/did\.json$/, '')}didcomm`,
      agentCard: handoff.well_known_urls.agent_card,
      arpJson: handoff.well_known_urls.arp,
    },
    representationVcUrl:
      `${agentOrigin(handoff.well_known_urls.did)}/.well-known/representation.jwt`,
    scopeCatalogVersion: binConfig.scopeCatalogVersion,
    agentName: binConfig.agentName,
    agentDescription: binConfig.agentDescription,
    tlsFingerprint: await resolveFingerprint(binConfig),
  };

  const keyStore = createFileKeyStore({
    did: handoff.agent_did,
    path: binConfig.keystorePath,
  });
  const resolver = createResolver();
  const cedarSchemaJson = resolveCedarSchema();

  const registryPath = join(binConfig.dataDir, 'registry.sqlite');
  const auditDir = join(binConfig.dataDir, 'audit');
  const mailboxPath = join(binConfig.dataDir, 'mailbox.sqlite');

  const runtime = await createRuntime({
    config: runtimeConfig,
    keyStore,
    resolver,
    cedarSchemaJson,
    registryPath,
    auditDir,
    mailboxPath,
    ...(binConfig.revocationsProxyUrl
      ? {
          revocationsProxy: { sourceUrl: binConfig.revocationsProxyUrl },
        }
      : {}),
  });

  const info = await runtime.start(binConfig.port, binConfig.hostname);
  return { runtime, info };
}

async function resolveFingerprint(binConfig: BinConfig): Promise<string> {
  const fingerprintFile = join(binConfig.dataDir, 'tls-fingerprint.txt');
  if (process.env.ARP_TLS_FINGERPRINT) {
    return process.env.ARP_TLS_FINGERPRINT;
  }
  try {
    return readFileSync(fingerprintFile, 'utf8').trim();
  } catch {
    const cert = await generateAgentCert({ did: binConfig.handoff.agent_did });
    if (!cert.ok) {
      throw new Error(`failed to generate TLS cert: ${cert.error.message}`);
    }
    // Persisting the generated cert to disk is Phase 3's job; for now we
    // derive only the fingerprint so the DID doc is populated deterministically.
    return cert.value.fingerprint;
  }
}

function agentOrigin(fullUrl: string): string {
  const u = new URL(fullUrl);
  return `${u.protocol}//${u.host}`;
}

export { loadBinConfig };
export { verifyAuditChain };
