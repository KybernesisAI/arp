/**
 * postcss-import resolves `@import 'foo/bar.css'` by looking in each
 * directory in the `path` array. We list `node_modules` explicitly so
 * workspace deps like `@kybernesis/arp-ui` (linked into
 * `apps/cloud/node_modules/`) resolve via their package subpaths.
 *
 * `@kybernesis/arp-ui` re-exports its `styles/*.css` files at the package
 * root via the `exports` map; since we're pointing postcss-import at
 * node_modules directly, the CSS files are accessible at
 * `@kybernesis/arp-ui/styles/<name>.css`. We mirror that in globals.css.
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

