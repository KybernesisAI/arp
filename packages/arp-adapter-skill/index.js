// This package ships a Claude Code skill, not a JavaScript runtime library.
// The `index.js` entry exists so `require('@kybernesis/arp-adapter-skill')`
// resolves cleanly if anything tries. The real deliverable is SKILL/SKILL.md.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the bundled skill directory. */
export const SKILL_DIR = join(HERE, 'SKILL');

/** The skill's canonical frontmatter `name`. */
export const SKILL_NAME = 'arp-adapter-creator';
