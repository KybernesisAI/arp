import createMDX from '@next/mdx';

/**
 * Turbopack cannot serialize function-valued plugin options, so we pass
 * remark/rehype plugins as bare module specifiers. Next resolves each
 * from `node_modules` at build time.
 */
const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [
      'remark-frontmatter',
      ['remark-mdx-frontmatter', { name: 'frontmatter' }],
      'remark-gfm',
    ],
    rehypePlugins: ['rehype-slug'],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
  transpilePackages: [
    '@kybernesis/arp-scope-catalog',
    '@kybernesis/arp-spec',
    '@kybernesis/arp-ui',
  ],
  typescript: { ignoreBuildErrors: false },
  experimental: {},
};

export default withMDX(nextConfig);
