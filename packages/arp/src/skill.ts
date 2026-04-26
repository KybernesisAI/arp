/**
 * `arpc skill install <name> [--target <target>]` — drops a skill
 * template into the right place for the chosen agent framework.
 *
 *   --target kyberbot            (default)  → ./skills/<name>/SKILL.md
 *   --target claude-code         project    → ./.claude/skills/<name>/SKILL.md
 *   --target claude-code-global  user-wide  → ~/.claude/skills/<name>/SKILL.md
 *
 * The SKILL.md content is the same in every target — only the install
 * path differs. The format is the standard Anthropic skill format:
 * YAML frontmatter (`name`, `description`, `allowed-tools`, `version`)
 * + markdown body. Both Claude Code and KyberBot's loader consume it
 * unchanged.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import {
  SKILL_TEMPLATES,
  listSkillNames,
  skillInstallPath,
  type SkillTarget,
} from './skill-templates.js';

const KNOWN_TARGETS: SkillTarget[] = ['kyberbot', 'claude-code', 'claude-code-global'];

function parseTarget(raw: string | undefined): SkillTarget {
  if (!raw) return 'kyberbot';
  if ((KNOWN_TARGETS as string[]).includes(raw)) return raw as SkillTarget;
  console.error(`unknown --target ${raw}. Use one of: ${KNOWN_TARGETS.join(', ')}`);
  process.exit(2);
}

function describeTargetPath(target: SkillTarget): string {
  switch (target) {
    case 'kyberbot':
      return '<cwd>/skills/<name>/SKILL.md';
    case 'claude-code':
      return '<cwd>/.claude/skills/<name>/SKILL.md';
    case 'claude-code-global':
      return '~/.claude/skills/<name>/SKILL.md';
  }
}

export function cmdSkill(sub: string | null, positional: string[], targetFlag?: string): void {
  if (!sub || sub === 'list') {
    console.log('available skills:');
    for (const name of listSkillNames()) {
      console.log(`  ${name}`);
    }
    console.log(`\nInstall: arpc skill install <name> [--target ${KNOWN_TARGETS.join('|')}]`);
    return;
  }
  if (sub !== 'install') {
    console.error(`unknown skill subcommand: ${sub}`);
    process.exit(2);
  }
  const name = positional[2];
  if (!name) {
    console.error('usage: arpc skill install <name> [--target kyberbot|claude-code|claude-code-global]');
    console.error(`  available: ${listSkillNames().join(', ')}`);
    process.exit(2);
  }
  const template = SKILL_TEMPLATES[name];
  if (!template) {
    console.error(`unknown skill: ${name}. Available: ${listSkillNames().join(', ')}`);
    process.exit(1);
  }
  if (template.status === 'preview') {
    console.error(
      `arpc skill install: "${name}" is a preview — the ${template.framework} adapter ` +
        `for arpc isn't shipped yet. Watch cloud.arp.run for the release, or grab the ` +
        `placeholder content directly: curl https://cloud.arp.run/api/skills/${name}`,
    );
    process.exit(1);
  }

  const target = parseTarget(targetFlag);
  const cwd = process.cwd();
  const path = skillInstallPath(name, target, cwd, homedir());

  if (existsSync(path)) {
    console.error(`arpc skill install: ${path} already exists. Delete it first if you want to overwrite.`);
    process.exit(1);
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, template.content, 'utf-8');
  console.log(`Installed "${name}" at ${path}`);
  console.log(`  target:    ${target}`);
  console.log(`  pattern:   ${describeTargetPath(target)}`);
  switch (target) {
    case 'kyberbot':
      console.log(`\nFor kyberbot to pick it up: kyberbot skill rebuild`);
      break;
    case 'claude-code':
      console.log(`\nClaude Code auto-loads .claude/skills/ — no rebuild step.`);
      break;
    case 'claude-code-global':
      console.log(`\nClaude Code auto-loads ~/.claude/skills/ across all projects.`);
      break;
  }
}
