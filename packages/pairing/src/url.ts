import { PairingProposalSchema, type PairingProposal } from './types.js';

/**
 * Encode a proposal into the `?invitation=<b64url(JSON)>` query parameter of
 * `baseUrl`. `baseUrl` should be an HTTPS URL the peer will open (typically
 * the subject agent's `/pair` endpoint or the owner app's accept page).
 */
export function buildInvitationUrl(
  proposal: PairingProposal,
  baseUrl: string,
): string {
  const json = JSON.stringify(proposal);
  const b64 = Buffer.from(json, 'utf8').toString('base64url');
  const url = new URL(baseUrl);
  url.searchParams.set('invitation', b64);
  return url.toString();
}

/**
 * Parse the `invitation=` parameter out of a URL (or bare base64url payload)
 * and validate it against `PairingProposalSchema`. Throws with a descriptive
 * message on any decode/validation failure.
 */
export function parseInvitationUrl(input: string): PairingProposal {
  const encoded = extractInvitationParam(input);
  let json: string;
  try {
    json = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch (err) {
    throw new Error(`invitation not valid base64url: ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(`invitation not valid JSON: ${(err as Error).message}`);
  }
  const result = PairingProposalSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `invitation failed schema validation: ${result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return result.data;
}

function extractInvitationParam(input: string): string {
  try {
    const url = new URL(input);
    const param = url.searchParams.get('invitation');
    if (param) return param;
  } catch {
    // Not a URL — treat the whole string as the encoded payload.
  }
  return input;
}
