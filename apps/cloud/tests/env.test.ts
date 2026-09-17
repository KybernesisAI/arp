import { afterEach, describe, expect, it } from 'vitest';
import { env, resetEnvForTests } from '../lib/env';

const saved = {
  secret: process.env['ARP_CLOUD_SESSION_SECRET'],
  vercelEnv: process.env['VERCEL_ENV'],
};

afterEach(() => {
  if (saved.secret === undefined) delete process.env['ARP_CLOUD_SESSION_SECRET'];
  else process.env['ARP_CLOUD_SESSION_SECRET'] = saved.secret;
  if (saved.vercelEnv === undefined) delete process.env['VERCEL_ENV'];
  else process.env['VERCEL_ENV'] = saved.vercelEnv;
  resetEnvForTests();
});

describe('env().ARP_CLOUD_SESSION_SECRET', () => {
  it('uses the configured secret when set', () => {
    process.env['ARP_CLOUD_SESSION_SECRET'] = 'configured-secret';
    process.env['VERCEL_ENV'] = 'production';
    resetEnvForTests();
    expect(env().ARP_CLOUD_SESSION_SECRET).toBe('configured-secret');
  });

  it('falls back to the dev default outside production', () => {
    delete process.env['ARP_CLOUD_SESSION_SECRET'];
    process.env['VERCEL_ENV'] = 'preview';
    resetEnvForTests();
    expect(env().ARP_CLOUD_SESSION_SECRET).toBe('dev-only-insecure-secret');
  });

  it('refuses the insecure default on production deployments', () => {
    delete process.env['ARP_CLOUD_SESSION_SECRET'];
    process.env['VERCEL_ENV'] = 'production';
    resetEnvForTests();
    expect(() => env()).toThrow(/ARP_CLOUD_SESSION_SECRET must be set/);
  });
});
