/**
 * GET /api/skills/[name] — download a skill's SKILL.md.
 *
 * Public (no auth). Skill content is the same source-of-truth shipped
 * with the `arpc` CLI (@kybernesis/arp/skill-templates) — single
 * canonical text in both surfaces. The API exists so users without
 * arpc installed can still grab a SKILL.md from the dashboard and
 * drop it into a Claude Code or KyberBot project manually.
 *
 * Browsers add a Content-Disposition: attachment header so click =
 * download (not an in-page render).
 */

import { NextResponse } from 'next/server';
import { getSkillTemplate, listSkillNames } from '@kybernesis/arp/skill-templates';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ name: string }> },
): Promise<Response> {
  const { name } = await ctx.params;
  const tpl = getSkillTemplate(name);
  if (!tpl) {
    return NextResponse.json(
      { error: 'unknown_skill', available: listSkillNames() },
      { status: 404 },
    );
  }
  return new Response(tpl.content, {
    status: 200,
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="${tpl.filename}"`,
      'cache-control': 'public, max-age=300',
    },
  });
}
