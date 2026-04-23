import type { CSSProperties } from 'react';

type Status = 'active' | 'suspended' | 'revoked' | 'pending';

const TONE: Record<Status, string> = {
  active: 'text-arp-ok border-arp-ok',
  suspended: 'text-arp-warn border-arp-warn',
  revoked: 'text-arp-danger border-arp-danger',
  pending: 'text-arp-accent border-arp-accent',
};

export function StatusPill({
  status,
  style,
}: {
  status: Status;
  style?: CSSProperties;
}) {
  return (
    <span className={`pill ${TONE[status]}`} style={style}>
      {status}
    </span>
  );
}
