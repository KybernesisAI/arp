/**
 * Next.js 16 config for the ARP owner app.
 *
 * - Output mode `standalone` so the sidecar can bundle the Node server alongside
 *   the runtime (Phase 3 §8) with minimal copy paths.
 * - Transpile the workspace `@kybernesis/*` packages straight from source.
 * - Always treat pages as dynamic; every view is session-scoped and calls the
 *   runtime admin API server-side.
 */
const arpPackages = [
  '@kybernesis/arp-consent-ui',
  '@kybernesis/arp-pairing',
  '@kybernesis/arp-scope-catalog',
  '@kybernesis/arp-spec',
  '@kybernesis/arp-transport',
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: arpPackages,
  serverExternalPackages: [],
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
