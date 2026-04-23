import type { Resolver } from '@kybernesis/arp-resolver';
import type { DidDocument } from '@kybernesis/arp-spec';
import { multibaseEd25519ToRaw } from './envelope.js';
import type { TransportResolver } from './types.js';
import { transportError } from './types.js';

/**
 * Bridge from `@kybernesis/arp-resolver`'s generic `Resolver` to the minimal
 * interface the transport needs (pubkey + DIDComm endpoint lookups). Keeps
 * Cedar / did-web details out of the transport core.
 */
export function createResolverAdapter(resolver: Resolver): TransportResolver {
  return {
    async resolveEd25519PublicKey(did) {
      const doc = await resolver.resolveDidWeb(did);
      if (!doc.ok) {
        throw transportError('unknown_peer', `resolveDidWeb failed: ${doc.error.message}`);
      }
      return extractPrimaryEd25519Key(doc.value);
    },
    async resolveDidCommEndpoint(did) {
      const doc = await resolver.resolveDidWeb(did);
      if (!doc.ok) {
        throw transportError('unknown_peer', `resolveDidWeb failed: ${doc.error.message}`);
      }
      // service[] is optional on DidDocument (did:key documents have none);
      // agents served over did:web publish DIDCommMessaging here.
      const svc = doc.value.service?.find((s) => s.type === 'DIDCommMessaging');
      if (!svc) {
        throw transportError('unknown_peer', `${did} has no DIDCommMessaging service`);
      }
      return new URL(svc.serviceEndpoint);
    },
  };
}

export function extractPrimaryEd25519Key(doc: DidDocument): Uint8Array {
  const vm = doc.verificationMethod[0];
  if (!vm) {
    throw transportError('unknown_peer', `${doc.id} has no verificationMethod`);
  }
  return multibaseEd25519ToRaw(vm.publicKeyMultibase);
}
