/**
 * AgentID S6c — the identity profile, console side.
 *
 * Validates a picture the browser sends as a data URL (resized to 512×512
 * client-side), and describes the profile shape the API exposes. The public
 * document itself is built by `@kybernesis/arp-templates` so the gateway
 * serves exactly the same shape.
 */

import type { AgentRow } from '@kybernesis/arp-cloud-db';

export const MAX_AVATAR_BYTES = 400 * 1024;
export const AVATAR_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const ACCENT_REGEX = /^#[0-9a-f]{6}$/i;

export class ProfileError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ProfileError';
    this.status = status;
    this.code = code;
  }
}

/** `data:image/png;base64,...` → { mime, base64 } after size and type checks. */
export function parseAvatarDataUrl(dataUrl: string): { mime: string; base64: string } {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim());
  if (!m) throw new ProfileError(400, 'bad_image', 'The picture must be a PNG, JPEG or WebP image.');
  const mime = m[1]!.toLowerCase();
  const base64 = m[2]!;
  if (!AVATAR_MIMES.has(mime)) throw new ProfileError(400, 'bad_image', 'The picture must be a PNG, JPEG or WebP image.');
  const bytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  if (bytes > MAX_AVATAR_BYTES) throw new ProfileError(413, 'image_too_large', 'The picture is too large. Use one up to 400 KB (about 512×512).');
  // Magic bytes: the declared type must match what was sent.
  const head = Buffer.from(base64.slice(0, 32), 'base64');
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const isJpeg = head[0] === 0xff && head[1] === 0xd8;
  const isWebp = head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP';
  if ((mime === 'image/png' && !isPng) || (mime === 'image/jpeg' && !isJpeg) || (mime === 'image/webp' && !isWebp)) {
    throw new ProfileError(400, 'bad_image', 'The picture does not look like the image type it claims to be.');
  }
  return { mime, base64 };
}

export interface ProfileView {
  name: string;
  description: string;
  accent: string | null;
  /** Absolute URL of the served picture, or null. */
  picture: string | null;
  updated_at: string | null;
}

export function profileView(agent: Pick<AgentRow, 'agentName' | 'agentDescription' | 'accent' | 'avatarData' | 'profileUpdatedAt'>, mirrorOrigin: string): ProfileView {
  return {
    name: agent.agentName,
    description: agent.agentDescription,
    accent: agent.accent ?? null,
    picture: agent.avatarData ? `${mirrorOrigin.replace(/\/+$/, '')}/avatar.png` : null,
    updated_at: agent.profileUpdatedAt?.toISOString() ?? null,
  };
}
