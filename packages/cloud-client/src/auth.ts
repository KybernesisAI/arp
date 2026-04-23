/**
 * Bearer-token signer. Mirrors cloud-runtime/ws-server.signBearerToken.
 * Duplicated here so this package has zero runtime deps on cloud-runtime —
 * cloud-client ships to end users' machines and stays small.
 */

import { createHash } from 'node:crypto';
import * as ed25519 from '@noble/ed25519';

export async function signBearerToken(
  agentDid: string,
  privateKey: Uint8Array,
  nowMs: number,
): Promise<string> {
  const challenge = createHash('sha256')
    .update(`arp-cloud-ws:${agentDid}:${nowMs}`)
    .digest();
  const sig = await ed25519.signAsync(new Uint8Array(challenge), privateKey);
  return `${nowMs}.${Buffer.from(sig).toString('base64url')}`;
}
