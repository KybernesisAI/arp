/**
 * Friendly label for a VC type string. v0 ships the Self.xyz set verbatim
 * (see phase 4 Task 3); anything else falls through to the raw id so nothing
 * is silently dropped.
 */
const VC_LABELS: Record<string, string> = {
  'self_xyz.verified_human': 'Verified human',
  'self_xyz.over_18': 'Over 18',
  'self_xyz.over_21': 'Over 21',
  'self_xyz.us_resident': 'US resident',
  'self_xyz.country': 'Country of residence',
};

export function labelForVc(vcType: string): string {
  return VC_LABELS[vcType] ?? vcType;
}
