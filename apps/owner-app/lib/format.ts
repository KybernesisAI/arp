export function formatDid(did: string): string {
  const m = /^did:web:(.+)$/.exec(did);
  return m ? (m[1] ?? did) : did;
}

export function formatAgentName(did: string): string {
  const host = formatDid(did);
  const [label] = host.split('.');
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : host;
}

export function formatExpiry(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toISOString().slice(0, 10);
}

export function formatRelative(ms: number | null): string {
  if (ms === null) return '—';
  const delta = ms - Date.now();
  const abs = Math.abs(delta);
  const sign = delta >= 0 ? 'in' : '';
  const suffix = delta < 0 ? ' ago' : '';
  const prefix = sign ? `${sign} ` : '';
  if (abs < 60_000) return `${prefix}<1m${suffix}`;
  if (abs < 3_600_000) return `${prefix}${Math.round(abs / 60_000)}m${suffix}`;
  if (abs < 86_400_000) return `${prefix}${Math.round(abs / 3_600_000)}h${suffix}`;
  return `${prefix}${Math.round(abs / 86_400_000)}d${suffix}`;
}
