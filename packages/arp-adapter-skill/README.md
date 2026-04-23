# @kybernesis/arp-adapter-skill

A Claude Code skill for authoring conformance-passing [ARP](https://arp.spec) framework adapters. Drop into any Claude Code install and ask:

> "Create an ARP adapter for My Framework."

The skill:

1. Asks about the framework and its public extension surface
2. Maps ARP's five integration points onto that surface (refuses to continue if any row has no primitive)
3. Scaffolds via `@kybernesis/arp-create-adapter`
4. Wires the hooks per the authoring guide's §12 cheat sheet
5. Writes the conformance test against `@kybernesis/arp-testkit`
6. Produces `MIGRATION.md` + `README.md`

## Install (user-scoped)

```bash
cp -r node_modules/@kybernesis/arp-adapter-skill/SKILL ~/.claude/skills/arp-adapter-creator
```

## Install (project-scoped)

```bash
cp -r node_modules/@kybernesis/arp-adapter-skill/SKILL .claude/skills/arp-adapter-creator
```

Claude Code will auto-load any skill under `~/.claude/skills/*/SKILL.md` or `<project>/.claude/skills/*/SKILL.md`. The skill frontmatter's `description` is the trigger — Claude Code routes natural-language requests that match the description into the skill.

## What the skill produces

```
adapters/<slug>/
├── package.json              # @kybernesis/arp-adapter-<slug>, correct deps
├── src/
│   ├── index.ts              # withArp() wiring all 5 integration points
│   └── types.ts              # <Framework>Like structural type
├── tests/
│   └── conformance.test.ts   # @kybernesis/arp-testkit audit check
├── README.md
└── MIGRATION.md
```

## Authoring guide

The skill references `ARP-adapter-authoring-guide.md` and `ARP-installation-and-hosting.md §8` for the contract. Both ship in the ARP spec docs.

## License

MIT
