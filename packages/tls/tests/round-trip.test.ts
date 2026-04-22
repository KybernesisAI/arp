import { describe, it, expect } from 'vitest';
import { createServer, connect, TLSSocket } from 'node:tls';
import type { AddressInfo } from 'node:net';
import {
  generateAgentCert,
  validatePinnedDer,
  toTlsClientOptions,
  toTlsServerOptions,
} from '../src/index.js';

describe('TLS round-trip with DID-pinned self-signed cert', () => {
  it('accepts a connection whose peer cert matches the pin', async () => {
    const r = await generateAgentCert({
      did: 'did:web:samantha.agent',
      sanHostname: 'localhost',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const server = createServer(toTlsServerOptions(r.value), (socket) => {
      socket.end('pong');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const { port } = server.address() as AddressInfo;

    try {
      const socket = connect(
        toTlsClientOptions({ host: '127.0.0.1', port }),
      ) as TLSSocket;
      await new Promise<void>((resolve, reject) => {
        socket.once('secureConnect', () => {
          try {
            const peer = socket.getPeerX509Certificate();
            expect(peer).toBeTruthy();
            expect(validatePinnedDer(peer!.raw, r.value.fingerprint)).toBe(true);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
        socket.once('error', reject);
      });
      socket.end();
    } finally {
      server.close();
    }
  });

  it('rejects a tampered fingerprint', async () => {
    const r = await generateAgentCert({
      did: 'did:web:samantha.agent',
      sanHostname: 'localhost',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const server = createServer(toTlsServerOptions(r.value), (socket) => {
      socket.end('pong');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const { port } = server.address() as AddressInfo;

    try {
      const socket = connect(
        toTlsClientOptions({ host: '127.0.0.1', port }),
      ) as TLSSocket;
      await new Promise<void>((resolve, reject) => {
        socket.once('secureConnect', () => {
          try {
            const peer = socket.getPeerX509Certificate();
            const tampered =
              r.value.fingerprint.slice(0, -2) +
              (r.value.fingerprint.slice(-2) === '00' ? '11' : '00');
            expect(validatePinnedDer(peer!.raw, tampered)).toBe(false);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
        socket.once('error', reject);
      });
      socket.end();
    } finally {
      server.close();
    }
  });
});
