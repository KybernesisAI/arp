/**
 * Render a VC type identifier as a human-readable label.
 *
 * The v1 renderer is provider-agnostic: it pretty-prints the type id itself
 * (dots → " · ", underscores → " "). Callers that want curated labels for
 * specific VC types can pass an `overrides` map to {@link labelForVcWith}.
 */
export function labelForVc(vcType: string): string {
  return prettyPrint(vcType);
}

export function labelForVcWith(
  vcType: string,
  overrides: Record<string, string>,
): string {
  return overrides[vcType] ?? prettyPrint(vcType);
}

function prettyPrint(vcType: string): string {
  return vcType
    .split('.')
    .map((segment) => segment.replace(/_/g, ' ').trim())
    .filter((s) => s.length > 0)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' · ');
}
