// Verify the skill ships with valid frontmatter Claude Code can consume.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const skillPath = join(here, '..', 'SKILL', 'SKILL.md');

if (!existsSync(skillPath)) {
  console.error('FAIL: SKILL/SKILL.md missing');
  process.exit(1);
}

const text = readFileSync(skillPath, 'utf8');

const frontmatterMatch = text.match(/^---\n([\s\S]*?)\n---\n/);
if (!frontmatterMatch) {
  console.error('FAIL: no YAML frontmatter');
  process.exit(1);
}

const [, fm] = frontmatterMatch;
if (!/^name:\s*arp-adapter-creator\s*$/m.test(fm)) {
  console.error('FAIL: frontmatter `name` must be "arp-adapter-creator"');
  process.exit(1);
}
if (!/^description:\s*\S+/m.test(fm)) {
  console.error('FAIL: frontmatter `description` must be non-empty');
  process.exit(1);
}

const body = text.slice(frontmatterMatch[0].length);
for (const required of [
  'Sources of truth',
  'Step 1',
  'Step 2',
  'Step 5',
  'ARP-adapter-authoring-guide.md',
]) {
  if (!body.includes(required)) {
    console.error(`FAIL: body missing expected section "${required}"`);
    process.exit(1);
  }
}

// Describe ≤ 1024 chars (Claude Code skill-description limit heuristic).
const descMatch = fm.match(/^description:\s*([\s\S]+?)(?=\n[a-zA-Z_-]+:|$)/m);
if (!descMatch) {
  console.error('FAIL: cannot extract description');
  process.exit(1);
}
const desc = descMatch[1].trim();
if (desc.length < 40 || desc.length > 1024) {
  console.error(
    `FAIL: description length ${desc.length} outside [40, 1024] — Claude Code enforces roughly this range for skill routing.`,
  );
  process.exit(1);
}

console.log('PASS: SKILL/SKILL.md frontmatter valid, body covers required steps.');
