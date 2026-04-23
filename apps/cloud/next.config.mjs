/** @type {import('next').NextConfig} */
const arpPackages = [
  '@kybernesis/arp-cloud-db',
  '@kybernesis/arp-cloud-runtime',
  '@kybernesis/arp-consent-ui',
  '@kybernesis/arp-spec',
  '@kybernesis/arp-templates',
  '@kybernesis/arp-transport',
];

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: arpPackages,
  typescript: { ignoreBuildErrors: false },
  // The cloud app runs purely on the Node runtime. No edge runtime for now —
  // we need pg/crypto/node:fs everywhere.
  experimental: {},
};

export default nextConfig;
