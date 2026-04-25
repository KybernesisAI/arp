/**
 * postcss-import resolves `@import 'foo/bar.css'` by looking in each
 * directory in the `path` array. We list `node_modules` explicitly so
 * workspace deps like `@kybernesis/arp-ui` (linked into
 * `apps/owner-app/node_modules/`) resolve via their package subpaths
 * — `@kybernesis/arp-ui/styles/<name>.css` matches the cloud-app pattern.
 */
export default {
  plugins: {
    'postcss-import': {
      path: ['node_modules'],
    },
    tailwindcss: {},
    autoprefixer: {},
  },
};
